var fs = require('fs');
var parseXml = require('xml2js').parseString;
var xslt = require('libxslt');

var ensureArray = function(a) {
	if (!a)
		return [];

	if (!(a instanceof Array))
		return [a];

	return a;
};

var rootctx = {
	guesses: {
	},
	types: {
		null: 'null',
		
		df: {
			_type: '__df',
			global: {
				_type: '__global',
			},
			/*nemesis: {
				figure: 'df.historical_figure'
			},
			creature_raw: {

			},
			historical_entity: {
				flags: {
					named_civ:'bool',
				},
			},
			historical_figure: {
				race: 'number',
			},
			global: {
				world: {
					entities: {
						all: {
							_array: 'df.historical_entity'
						}
					},
 
 					raws: {
						creatures: {
							all: {
								_array: 'df.creature_raw'
							}
						}
					}
				}
			}*/
		},
		
		matinfo: {
			_type: 'matinfo',
			type: 'number',
			index: 'number',
			material: 'df.material',
			mode: 'number',
			subtype: 'number',
			inorganic: 'df.inorganic_raw',
			creature: 'df.creature_raw',
			plant: 'df.plant_raw',
			figure: 'df.historical_figure',
		},
		
		coord2d: {
			_type: 'coord2d',
			x: 'number',
			y: 'number',
			z: 'number',
		},
		
		mp: {
			_type: 'MessagePack',
			NIL: 'null',
		},
		
		os: {
			_type: 'os',
			clock: { _type:'function', _node:'number' },
		}
	},

	functions: {
		error: 'none',
		tostring: 'string',
		tonumber: 'number',
		print: 'none',
		
		'math.abs': 'number',
		'math.floor': 'number',
		
		'table.insert': 'none',
				
		'string.gsub': 'string',
		'string.sub': 'string',
		'string.byte': 'number',
		'string.char': 'string',
		'string.find': 'number',
		'string.lower': 'string',
		
		'bit32.band': 'number',
		'bit32.lshift': 'number',
		'bit32.rshift': 'number',
		
		'dfhack.DF_VERSION': 'string',
		'dfhack.internal.setAddress': 'none',
		'dfhack.getOSType': 'string',
		'dfhack.df2utf': 'string',
		'dfhack.gui.getCurViewscreen': 'df.viewscreen',
		'dfhack.units.getProfessionName': 'string',
		'dfhack.units.isCitizen': 'bool',
		'dfhack.units.isOwnCiv': 'bool',
		'dfhack.units.isOwnGroup': 'bool',
		'dfhack.units.getVisibleName': 'df.language_name',
		'dfhack.units.getProfessionColor': 'number',
		'dfhack.units.getNemesis': 'df.nemesis_record',
		'dfhack.units.getPosition': 'coord2d',
		'dfhack.items.getGeneralRef': 'df.general_ref',
		'dfhack.items.getDescription': 'string',
		'dfhack.matinfo.decode': 'matinfo',
		'dfhack.job.getName': 'string',
		'dfhack.job.getWorker': 'df.unit',
		'dfhack.job.getGeneralRef': 'df.general_ref',
		'dfhack.maps.getRegionBiome': 'df.region_map_entry',
		
		'utils.call_with_string': 'string',
		
		'gui.simulateInput':'none',
		
		'string.utf8capitalize': 'string',

		'native.set_timer':'none',
		
		'mkmodule': 'none',
	},

	parent: null,
};

function convertBasicType(t)
{
	if (t == 'int8_t' || t == 'uint8_t' || t == 'int16_t' || t == 'uint16_t' || t == 'int32_t' || t == 'uint32_t')
		return 'number';

	if (t == 's-float' || t == 'd-float')
		return 'number';

	if (t == 'stl-string')
		return 'string';

	if (t == 'bool')
		return 'bool';

	if (t == 'stl-fstream')
		return t;

	throw new Error('unknown primitive subtype '+t);
}

function processStruct(def, n)
{
	var type = { _type: n };
	if (def.$['inherits-from']) {
		type._super = 'df.' + def.$['inherits-from'];
	
		var supertype = rootctx.types.df[def.$['inherits-from']];
		if (!supertype)
			console.log('NO SUPER', def.$['inherits-from']);
		else {
			supertype._sub = supertype._sub || [];
			supertype._sub.push(n);
		}
	}
		
	var anon = 1;
	ensureArray(def.$$).forEach(function(fdef) {
		var t = fdef['#name'];

		if (t == 'field')
		{
			var fname = fdef.$['name'] || ('anon_'+anon++);
			var meta = fdef.$['meta'];

			if (meta == 'number')
			{
				if (fdef.$['subtype'] == 'bool' || (fdef.$['subtype'] == 'flag-bit' && fdef.$['bits'] == 1)) //TODO: can bits be >1 ?
					type[fname] = 'bool';
				else
					type[fname] = 'number';
			}
			else if (meta == 'primitive')
			{
				type[fname] = convertBasicType(fdef.$['subtype']);
			}
			else if (meta == 'container' && (fdef.$.subtype == 'df-flagarray' || fdef.$.subtype == 'stl-bit-vector'))
			{
				type[fname] = { _array:'number', _type:'bool[]', whole:'number' };
			}
			else if (meta == 'container' || meta == 'static-array')
			{
				var item = fdef.item;

				if (item) {
					var imeta = item.$['meta'];
					
					if (imeta == 'pointer' || imeta == 'global') {
						var item2 = item.item;
						if (item2 && item2.$.meta == 'compound') {
							var tname = n + '.' + item2.$['typedef-name'];
							rootctx.types[tname] = processStruct(item2, tname);
							type[fname] = { _array:tname }
							type[item2.$['typedef-name']] = tname;
						} else if (item2 && item2.$.meta == 'static-array') {
							type[fname] = { _array: { _type:'df.'+item2.item.$['type-name']+'[]', _array:'df.'+item2.item.$['type-name'] } };
						} else
							type[fname] = { _array: 'df.'+item.$['type-name'] };
					} else if (imeta == 'number')
						type[fname] = { _array: 'number' };
					else if (imeta == 'primitive')
						type[fname] = { _array: convertBasicType(item.$['subtype']) };
					else if (imeta == 'compound') {
						type[fname] = { _array: processStruct(item) };
					}
					else {
						// console.log('V1', fdef);
						//console.log('#',convertBasicType(imeta));
					}
				}
				else
					;// console.log('V2', fdef);
					
				if (type[fname] && type[fname]._array)
				{
					var t = type[fname];
					t._type = (t._array._type || t._array.toString()) + '[]';
					
					if (fdef.$['index-enum']) {
						var e = rootctx.types.df[fdef.$['index-enum']];
						if (e) {
							Object.keys(e).forEach(function(k) {
								if (k.substr(0,1) != '_')
									t[k] = t._array;
							});
						} else
							console.log('no enum', fdef.$['index-enum']);
					}
				}
			}
			else if (meta == 'pointer')
			{
				if (fdef.item && fdef.item.$['meta'] == 'compound') {
					var item2 = fdef.item;
					var tname = n + '.' + item2.$['typedef-name'];
					rootctx.types[tname] = processStruct(item2, tname);
					type[fname] = tname;
					type[item2.$['typedef-name']] = tname;

					//type[fname] = processStruct(fdef.item);
				} else {
					var t;
					try {
						t = convertBasicType(fdef.$['type-name']);
					} catch (e) {
						t = 'df.' + fdef.$['type-name'];
					}
					if (fdef.$['is-array'] == 'true')
						type[fname] = { _array:t };
					else
						type[fname] = t;
				}
			}
			else if (meta == 'global')
			{
				type[fname] = 'df.' + fdef.$['type-name'];
			}
			else if (meta == 'bytes')
			{
			}
			else if (meta == 'compound' && fdef.$['subtype'] == 'enum')
			{
				if (fdef.$['typedef-name']) {
					var tname = n + '.' + fdef.$['typedef-name'];
					rootctx.types[tname] = processEnum(fdef, tname);
					type[fdef.$['name']] = tname;
					type[fdef.$['typedef-name']] = tname;
				}
				else
				{
					type[fdef.$['name']] = processEnum(fdef);
				}
			}
			else if (meta == 'compound')
			{
				//TODO: if bitfield then create 0..X fields !							

				if (fdef.$['typedef-name']) {
					var tname = n + '.' + fdef.$['typedef-name'];
					rootctx.types[tname] = processStruct(fdef, tname);
					if (fdef.$['subtype'] == 'bitfield')
						rootctx.types[tname].whole = 'number';							

					type[fdef.$['name']] = tname;
					type[fdef.$['typedef-name']] = tname;
				}
				else
				{					
					/*if (fdef.$['type-name'])
						type[fdef.$['name']] = fdef.$['type-name'];
					else*/
					if (fdef.$['is-union'] == 'true') {
						var u = processStruct(fdef);
						for (var j in u)
							type[j] = u[j];
					}
					else {
						type[fdef.$['name']] = processStruct(fdef);
						
						if (fdef.$['subtype'] == 'bitfield')
							type[fdef.$['name']].whole = 'number';							
					}
				}
			}
			else
				throw new Error('unknown meta '+meta);
		
		} else if (t == 'virtual-methods') {
			ensureArray(fdef.vmethod).forEach(function(mdef) {
				if (mdef.$.name) {
					var rettype;
					if (mdef.$['ret-type']) {
						try {
							rettype = convertBasicType(mdef.$['ret-type']);
						} catch (e) {
							rettype = 'df.' + mdef.$['ret-type'];
						}
					}
					
					else if (mdef['ret-type']) {
						if (mdef['ret-type'].$.meta == 'pointer')
							rettype = 'df.' + mdef['ret-type'].$['type-name'];
						else
							console.log('rettype', mdef['ret-type']);
					}
					
					else
						rettype = 'none';
					
					if (rettype) {
						type._methods = type._methods || {};
						type._methods[mdef.$.name] = rettype;
					}
				}
			});
		}
	});

	return type;
}

function processEnum(def, n)
{
	var type = { _type: n };

	type._array = 'string';
	type._enum = true;
	type.attrs = { _array: { } };

	var anon = 1;
	ensureArray(def.$$).forEach(function(fdef) {
		var t = fdef['#name'];

		if (t == 'enum-item') {
			var fname = fdef.$ && fdef.$['name'] || ('anon_'+anon++);
			type[fname] = n;//'number';
		}
		
		else if (t == 'enum-attr') {
			var atype;
			if (fdef.$['type-name']) {
				try {
					atype = convertBasicType(fdef.$['type-name']);
				} catch(e) {
					atype = 'df.' + fdef.$['type-name'];
				}
			}
			
			type.attrs._array[fdef.$['name']] = atype || 'string';
		}
	});
	
	
	return type;
}

function processXml(xml, ctxtypes)
{
	parseXml(xml, { attrNameProcessors: [require('xml2js').processors.stripPrefix], tagNameProcessors: [require('xml2js').processors.stripPrefix], explicitArray: false, explicitChildren:true, preserveChildrenOrder:true }, function(err, result) {
		ensureArray(result['data-definition']['global-type']).forEach(function(def) {
			if (def.$['meta'] == 'class-type' || def.$['meta'] == 'struct-type' || def.$['meta'] == 'bitfield-type') {
				var n = def.$['type-name'];
				ctxtypes[n] = processStruct(def, 'df.'+n);
				// rootctx.functions['df.'+n+'.new'] = 'df.'+n;
				if (def.$['instance-vector']) {
					var v = def.$['instance-vector'];
					rootctx.functions['df.'+n+'.find'] = 'df.'+n;
				}
			} else if (def.$['meta'] == 'enum-type') {
				var n = def.$['type-name'];
				ctxtypes[n] = processEnum(def, 'df.'+n);
			}
		});


		ensureArray(result['data-definition']['global-object']).forEach(function(def) {
			var item = def.item;

			if (item) {
				var imeta = item.$['meta'];
				
				if (imeta == 'pointer' || imeta == 'global')
					rootctx.types.df.global[def.$['name']] = 'df.'+item.$['type-name'];
				else if (imeta == 'number')
					rootctx.types.df.global[def.$['name']] = 'number';
				else if (imeta == 'primitive')
					rootctx.types.df.global[def.$['name']] = convertBasicType(item.$['subtype']);
				else if (imeta == 'compound') {
					rootctx.types.df.global[def.$['name']] = processStruct(item);
				} else if (imeta == 'container') {
					var item3 = item.item;

					if (item3) {
						var imeta3 = item3.$['meta'];
						
						if (imeta3 == 'pointer' || imeta3 == 'global') {
							/*var item2 = item3.item;
							if (item2 && item2.$.meta == 'compound') {
								var tname = n + '.' + item2.$['typedef-name'];
								rootctx.types[tname] = processStruct(item2, tname);
								type[fname] = { _array:tname }
								type[item2.$['typedef-name']] = tname;
							} else if (item2 && item2.$.meta == 'static-array') {
								rootctx.types.df.global[def.$['name']] = { _array: { _type:'df.'+item2.item.$['type-name']+'[]', _array:'df.'+item2.item.$['type-name'] } };
							} else*/
								rootctx.types.df.global[def.$['name']] = { _array: 'df.'+item3.$['type-name'] };
						} else if (imeta3 == 'number')
							rootctx.types.df.global[def.$['name']] = { _array: 'number' };
						else if (imeta3 == 'primitive')
							rootctx.types.df.global[def.$['name']] = { _array: convertBasicType(item3.$['subtype']) };
						else if (imeta3 == 'compound') {
							rootctx.types.df.global[def.$['name']] = { _array: processStruct(item3) };
						}
						else {
							// console.log('V1', fdef);
							//console.log('#',convertBasicType(imeta));
						}
					}
				}
				else {
					//console.log('#',convertBasicType(imeta));
					
				}
			}			
			else
				;//console.log('G2', def);			
		});
	});
}

/*var lower1 = xslt.parse(fs.readFileSync('./df/lower-1.xslt').toString());
var lower2 = xslt.parse(fs.readFileSync('./df/lower-2.xslt').toString());
fs.readdirSync('./df').forEach(function(f) {
	if (f.substr(0,3) == 'df.' && f.substr(-4) == '.xml') {
		var xml1 = lower1.apply(fs.readFileSync('./df/'+f).toString());
		var xml2 = lower2.apply(xml1);
		console.log(xml2);
		processXml(xml2, rootctx.types.df);
	}
});*/

processXml(fs.readFileSync('./codegen_4206.out.xml'), rootctx.types.df);

rootctx.types['df.world.T_map'].block_index = { _array: { _array: { _array:'df.map_block' } } };
rootctx.types['df.world.T_map'].column_index = { _array: { _array: 'df.map_block_column' } };
rootctx.types.df.map_block.tiletype = { _array: { _array: 'df.tiletype' } };
rootctx.types.df.map_block.designation = { _array: { _array: 'df.tile_designation' } };
rootctx.types.df.block_square_event_grassst.amount = { _array: { _array: 'number' } }; 
rootctx.types.df.viewscreen_unitlistst.units = { _array: { _type:'df.unit[]', _array: 'df.unit' } }; 
rootctx.types.df.viewscreen_unitlistst.jobs = { _array: { _type:'df.job[]', _array: 'df.job' } }; 

fs.writeFileSync('./ctx.json', JSON.stringify(rootctx));