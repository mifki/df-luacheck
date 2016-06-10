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
		important_leader_nemesis: {_array:'df.nemesis'},
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
		}
	},

	functions: {
		error: 'none',
		
		'table.insert': 'none',
		
		unitname: 'string',
		unitprof: 'string',
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
	var anon = 1;
	ensureArray(def.$$).forEach(function(fdef) {
		var t = fdef['#name'];

		if (t == 'field')
		{
			var fname = fdef.$['name'] || ('anon_'+anon++);
			var meta = fdef.$['meta'];

			if (meta == 'number')
			{
				//TODO: subtype == 'flag-bit' -> bool, but what if bits > 1 ?
				type[fname] = 'number';
			}
			else if (meta == 'primitive')
			{
				type[fname] = convertBasicType(fdef.$['subtype']);
			}
			else if (meta == 'container' || meta == 'static-array')
			{
				var item = fdef.item;

				if (item) {
					var imeta = item.$['meta'];
					
					if (imeta == 'pointer' || imeta == 'global')
						type[fname] = { _array: 'df.'+item.$['type-name'] };
					else if (imeta == 'number')
						type[fname] = { _array: 'number' };
					else if (imeta == 'primitive')
						type[fname] = convertBasicType(item.$['subtype']);
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

			}
			else if (meta == 'pointer')
			{
				if (fdef.item)
					type[fname] = processStruct(fdef.item);
				else
					type[fname] = 'df.' + fdef.$['type-name'];
			}
			else if (meta == 'global')
			{
				type[fname] = 'df.' + fdef.$['type-name'];
			}
			else if (meta == 'bytes')
			{
			}
			/*else if (meta == 'global')
			{
				console.log('G', fdef);
			}*/
			else if (meta == 'compound' && fdef.$['subtype'] == 'enum')
			{

			}
			else if (meta == 'compound')
			{
				//TODO: if bitfield then create 0..X fields
				/*if (fdef.$['type-name'])
					type[fdef.$['name']] = fdef.$['type-name'];
				else*/
					type[fdef.$['name']] = processStruct(fdef);
			}
			else
				throw new Error('unknown meta '+meta);
		
		}
	});

	return type;
}

function processEnum(def, n)
{
	var type = { _type: n };

	var anon = 1;
	ensureArray(def.$$).forEach(function(fdef) {
		var t = fdef['#name'];

		if (t == 'enum-item')
		{
			var fname = fdef.$ && fdef.$['name'] || ('anon_'+anon++);
			type[fname] = 'number';
		}
	});
	
	type._array = 'string';
	type._enum = true;

	return type;
}

function processXml(xml, ctxtypes)
{
	parseXml(xml, { attrNameProcessors: [require('xml2js').processors.stripPrefix], tagNameProcessors: [require('xml2js').processors.stripPrefix], explicitArray: false, explicitChildren:true, preserveChildrenOrder:true }, function(err, result) {
		ensureArray(result['data-definition']['global-type']).forEach(function(def) {
			if (def.$['meta'] == 'class-type' || def.$['meta'] == 'struct-type' || def.$['meta'] == 'bitfield-type') {
				var n = def.$['type-name'];
				ctxtypes[n] = processStruct(def, 'df.'+n);
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

processXml(fs.readFileSync('./codegen.out.xml'), rootctx.types.df);

fs.writeFileSync('./ctx.json', JSON.stringify(rootctx));