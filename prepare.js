var fs = require('fs');
var parseXml = require('xml2js').parseString;
var xslt = require('libxslt');
var _process = require('process');

var ensureArray = function(a) {
	if (!a)
		return [];

	if (!(a instanceof Array))
		return [a];

	return a;
};

var dfhackver = _process.argv[_process.argv.length-1];

var rootctx = require('./builtins_'+dfhackver);

var pending_index_enums = [];

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

function container_type(fdef, type)
{
	var item = fdef.item;

	if (item) {
		var imeta = item.$['meta'];

		if (imeta == 'pointer' || imeta == 'global') {
			/*var item2 = item.item;
			if (item2 && item2.$.meta == 'compound') {
				var tname = type._type + '.' + item2.$['typedef-name'];
				rootctx.types[tname] = processStruct(item2, tname);
				type[item2.$['typedef-name']] = tname;
				return { _array:tname }
			} else if (item2 && item2.$.meta == 'static-array') {
				return { _array: { _type:'df.'+item2.item.$['type-name']+'[]', _array:'df.'+item2.item.$['type-name'] } };
			} else
				return { _array: 'df.'+item.$['type-name'], _type:'df.'+item.$['type-name']+'[]' };*/

			//TODO: set _type
			var t = pointer_type(fdef.item, type);
			return { _array: t, _type:(t._type||t)+'[]', _kind:{_type:'string', _value:'container'} };

		} else if (imeta == 'number') {
			return { _array: 'number', _type: 'number[]', _kind:{_type:'string', _value:'container'} };

		} else if (imeta == 'container' || imeta == 'static-array') {
			var t = container_type(fdef.item, type);
			return { _array: t, _type:(t._type||t)+'[]', _kind:{_type:'string', _value:'container'} };

		} else if (imeta == 'primitive') {
			var t = convertBasicType(item.$['subtype']);
			return { _array: t, _type:(t._type||t)+'[]', _kind:{_type:'string', _value:'container'} };

		} else if (imeta == 'compound' && item.$['subtype'] == 'enum') {
			if (item.$['typedef-name']) {
				var tname = type._type + '.' + item.$['typedef-name'];
				type[item.$['typedef-name']] = processEnum(item, tname);
				return { _array: tname, _type: tname + '[]', _kind:{_type:'string', _value:'container'} };
			}

			var t = processEnum(item);
			return { _array: t, _type: t + '[]', _kind: {_type:'string', _value:'container'} };

		} else if (imeta == 'compound') {
			if (item.$['typedef-name']) {
				var tname = type._type + '.' + item.$['typedef-name'];
			    type[item.$['typedef-name']] = processStruct(item, tname);
				if (item.$['subtype'] == 'bitfield')
					type[item.$['typedef-name']].whole = 'number';

				return { _array: tname, _type: tname + '[]', _kind: {_type:'string', _value:'container'} };
			}

			var t = processStruct(item);
			return { _array: t, _type: t + '[]', _kind: {_type:'string', _value:'container'} };

		} else {
			// console.log('V1', fdef);
			//console.log('#',convertBasicType(imeta));
		}
	}

	else // vector<void*>
		return { _array:'number', _type:'number[]', _kind:{_type:'string', _value:'container'} };
}

function pointer_type(fdef, type)
{
	if (fdef.item && fdef.item.$['meta'] == 'compound') {
		var item2 = fdef.item;
		var tname = type._type + '.' + item2.$['typedef-name'];
		type[item2.$['typedef-name']] = processStruct(item2, tname);
		return tname;

		//type[fname] = processStruct(fdef.item);

	} else if (fdef.item && (fdef.item.$['meta'] == 'container' || fdef.item.$['meta'] == 'static-array')) {
		return container_type(fdef.item, type);

	} else if (fdef.item && fdef.item.$['meta'] == 'pointer' && fdef.$['is-array'] == 'true') {
		return { _array:pointer_type(fdef.item, type) };

	} else if (fdef.item && fdef.item.$['subtype'] == 'static-string') {
		return { _type:'charptr', _array:'number' };

	} else if (!fdef.$['type-name']) {
		if (fdef.$['is-array'] == 'true')
			return { _array:'__unknown' };
		else
			return '__unknown';

	} else {
		var t;
		try {
			t = convertBasicType(fdef.$['type-name']);
		} catch (e) {
			t = 'df.' + fdef.$['type-name'];
		}
		if (fdef.$['is-array'] == 'true')
			return { _array:t };
		else
			return t;
	}
}

function processStruct(def, n)
{
	var type = { _type: n, _kind: { _type: 'string', _value: def.$['meta'] } };
	if (def.$['inherits-from']) {
		type._super = 'df.' + def.$['inherits-from'];

		var supername = def.$['inherits-from'];
		while(1)
		{
			var supertype = rootctx.types.df[supername];
			if (!supertype) {
				console.log('NO SUPER', supername);
				break;
			} else {
				supertype._sub = supertype._sub || [];
				supertype._sub.push(n);

				if (!supertype._super)
					break;

				supername = supertype._super.substr(3);
			}
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
				if (fdef.$['type-name'])
					try {
						type[fname] = convertBasicType(fdef.$['type-name']);
					} catch (e) {
						type[fname] = 'df.' + fdef.$['type-name'];
					}
				else if (fdef.$['subtype'] == 'bool' || (fdef.$['subtype'] == 'flag-bit' && (fdef.$['count'] || 1) == 1))
					type[fname] = 'bool';
				else
					type[fname] = 'number';
			}
			else if (fdef.$['subtype'] == 'static-string')
			{
				type[fname] = 'string';
			}
			else if (meta == 'primitive')
			{
				type[fname] = convertBasicType(fdef.$['subtype']);
			}
			else if (meta == 'container' && fdef.$.subtype == 'df-linked-list')
			{
				type[fname] = 'df.' + fdef.$['type-name'];
			}
			else if (meta == 'container' && (fdef.$.subtype == 'df-flagarray' || fdef.$.subtype == 'stl-bit-vector'))
			{
				var t = { _array:'bool', _type:'bool[]', whole:'number' };
				type[fname] = t;

				if (fdef.$['index-enum'])
					pending_index_enums.push({ type:t, enumtype:fdef.$['index-enum'] });
			}
			else if (meta == 'container' || meta == 'static-array')
			{
				type[fname] = container_type(fdef, type);

				if (type[fname] && type[fname]._array)
				{
					var t = type[fname];

					if (fdef.$['index-enum'])
						pending_index_enums.push({ type:t, enumtype:fdef.$['index-enum'] });
				}
			}
			else if (meta == 'pointer')
			{
				type[fname] = pointer_type(fdef, type);
				/*if (fdef.item && fdef.item.$['meta'] == 'compound') {
					var item2 = fdef.item;
					var tname = n + '.' + item2.$['typedef-name'];
					rootctx.types[tname] = processStruct(item2, tname);
					type[fname] = tname;
					type[item2.$['typedef-name']] = tname;

					//type[fname] = processStruct(fdef.item);

				} else if (fdef.item && fdef.item.$['meta'] == 'container') {
					type[fname] = container_type(fdef.item, type);

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
				}*/
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
					type[fdef.$['typedef-name']] = processEnum(fdef, tname);
					type[fdef.$['name']] = tname;
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
				    type[fdef.$['typedef-name']] = processStruct(fdef, tname);
					if (fdef.$['subtype'] == 'bitfield')
						type[fdef.$['typedef-name']].whole = 'number';

					type[fdef.$['name']] = tname;
				}
				else
				{
					/*if (fdef.$['type-name'])
						type[fdef.$['name']] = fdef.$['type-name'];
					else*/
					if (fdef.$['is-union'] == 'true' || fdef.$['anon-compound'] == 'true') {
						var u = processStruct(fdef);
						type = Object.assign({}, u, type);
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

	if (def.$.meta == 'bitfield-type') {
		type.whole = 'number';
		type._array = 'bool';
	}

	return type;
}

function processEnum(def, n)
{
	var type = { _type: n, _kind: { _type: 'string', _value: 'enum-type' } };

	type._array = 'string';
	type._enum = {};
	type._last_item = 'number';
	type.attrs = { _array: { } };

	var anon = 1;
	var value = -1;
	ensureArray(def.$$).forEach(function(fdef) {
		var t = fdef['#name'];

		if (t == 'enum-item') {
			if (fdef.$ && fdef.$['value'] !== undefined) {
				value = +fdef.$['value'];
			} else {
				value++;
			}
			var fname = fdef.$ && fdef.$['name'] || ('anon_'+anon++);
			type._enum[value] = fname;
			type[fname] = { _type:n, _value:value };
			type._last_item = { _type:'number', _value:Math.max(type._last_item._value||0, value) };
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

				else if (imeta == 'number') {
					if (item.$['subtype'] == 'bool' || (item.$['subtype'] == 'flag-bit' && item.$['bits'] == 1)) //TODO: can bits be >1 ?
						rootctx.types.df.global[def.$['name']] = 'bool';
					else
						rootctx.types.df.global[def.$['name']] = 'number';

				} else if (imeta == 'primitive')
					rootctx.types.df.global[def.$['name']] = convertBasicType(item.$['subtype']);

				else if (imeta == 'compound') {
					rootctx.types.df.global['T_' + def.$['name']] = processStruct(item);
					rootctx.types.df.global['T_' + def.$['name']]._type = 'df.global.T_' + def.$['name'];
					rootctx.types.df.global[def.$['name']] = 'df.global.T_' + def.$['name'];

				} else if (imeta == 'container' || imeta == 'static-array') {
					rootctx.types.df.global[def.$['name']] = container_type(item);
					/*var item3 = item.item;

					if (item3) {
						var imeta3 = item3.$['meta'];

						if (imeta3 == 'pointer' || imeta3 == 'global') {
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
					}*/
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

processXml(fs.readFileSync(__dirname + '/codegen_'+dfhackver+'.out.xml'), rootctx.types.df);

pending_index_enums.forEach(function(e) {
	var t = e.type;
	var e = rootctx.types.df[e.enumtype];
	if (e) {
		Object.keys(e).forEach(function(k) {
			if (k.substr(0,1) != '_')
				t[k] = t._array;
		});
	} else
		console.log('no enum', e.enumtype);

});

Object.keys(rootctx.functions || {}).forEach(function(f) {
	var path = f.split(/\./g);
	var t = rootctx.types;
	for (var i = 0; i < path.length - 1; i++) {
		if (!t[path[i]]) {
			t[path[i]] = {
				_type: path.slice(0, i + 1).join('.'),
				_alias: true
			};
		}
		t = t[path[i]];
	}
});

fs.writeFileSync(__dirname + '/ctx_'+dfhackver+'.json', JSON.stringify(rootctx, null, 2));
