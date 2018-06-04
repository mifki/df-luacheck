var fs = require('fs');
var path = require('path');
var luaparser = require('./luaparse');
var parseXml = require('xml2js').parseString;
var chalk = require('chalk');
var _process = require('process');
var jsonic = require('jsonic');

var ensureArray = function(a) {
	if (!a)
		return [];

	if (!(a instanceof Array))
		return [a];

	return a;
};

var argv = require('yargs').argv;
var dfhackver = argv.v;
var dfver = dfhackver.toString().split('-')[0];
var mainfn = argv._[0];
var nowarn = argv.W;

var rootctx = JSON.parse(fs.readFileSync('ctx_'+dfhackver+'.json'));

var isPreload = false;
var hasLogged = false;
var preload = ensureArray(argv.p);
var incpath = argv.I || [ '/home/vit/c9workspace/dfremote' ];
var scriptpath = ensureArray(argv.S);
var reqignore = [
	'remote.utf8.utf8data',
	'remote.utf8.utf8',
	'remote.JSON',
	'remote.MessagePack',
	'remote.MessagePack53',
	'remote.underscore',
	'remote.deflatelua',
];
var fnstocheck = [];
var callers = [];
var checkedfns = {};
var checked_global_fns = {};
var modules = {};

reqignore = reqignore.concat(ensureArray(argv.x));

var src = fs.readFileSync(mainfn).toString();
var ast = luaparser.parse(src, { comments:true, locations:true, ranges:true });
var srcstack = [ { src:src, fn:mainfn, comments:ast.comments } ];

function findtype(name, ctx) {
	if (name == '_ENV')
		return ctx;

	if (name == '_G')
		return rootctx;

	if (ctx.types[name])
		return ctx.types[name];

	if (ctx.functions && ctx.functions[name])
		return { _type:'function', _node:ctx.functions[name] };

	if (ctx.parent)
		return findtype(name, ctx.parent);
}

function findfn(name, ctx) {
	var dot = name.lastIndexOf('.');
	if (dot != -1) {
		var t = expandtype(name.substr(0, dot), ctx);
		var n = name.substr(dot+1);
		if (t && t != '__unknown') {
			for (var o = t; o; o = expandtype(o._super,ctx)) {
				if (o._methods && o._methods[n])
					return o._methods[n];
				if (o.functions && o.functions[n])
					return { _type:'function', _node:o.functions[n] };
			}
		}
	}

	if (ctx.types && ctx.types[name] && (ctx.types[name]._type == 'function' || ctx.types[name]._defclass))
		return ctx.types[name];

	if (ctx.functions && ctx.functions[name])
		return ctx.functions[name];

	if (ctx.parent)
		return findfn(name, ctx.parent);
}

function findguess(name, ctx) {
	if (ctx.guesses && ctx.guesses[name])
		return ctx.guesses[name];

	if (ctx.parent)
		return findguess(name, ctx.parent);
}

function fix_custom_type_name(type, fn, line, lvl)
{
	lvl = lvl || 0;

	if (!type._type)
		type._type = 'custom_' + fn + '_' + line + '_' + lvl;

	Object.keys(type).forEach(function(k) {
		var subtype = type[k];
		if (typeof subtype == 'object')
			fix_custom_type_name(subtype, line, lvl+1);
	});
}

function expandtype(name, ctx, line) {
	if (typeof name == 'string' && name.slice(-2) == '[]')
		return { _type:name, _array:name.slice(0,-2) }

	if (typeof name == 'string' && name.slice(0,21) == 'dfhack.onStateChange.') {
		return { _type:'function', _anyfunc:true, _inp:'number' };
	}

	if (typeof name == 'string' && name.slice(0,1) == '{' && name.slice(-1) == '}') {
		var type = null;
		try {
			type = jsonic(name);
		} catch (e) {
			console.log(e, 'can not parse type definition', name);
		}

		if (type) {
			var fn = srcstack[srcstack.length-1].fn.split('/').slice(-1)[0].split('.')[0];
			fix_custom_type_name(type, fn, line);
			return type;
		}
	}

	if (name == 'number' || name == 'string' || name == 'bool' || name == 'none' || name == 'null')
		return name;

	if (name == 'table')
		return { _type:'table' };

	if (typeof name == 'string') {
		var q = findtype(name, ctx);
		if (q)
			return q;

		var a = name.split('.');
		var t = findtype(a[0], ctx);
		for (var j = 1; j < a.length; j++) {
			if (!t) {
				return '__unknown';
			}

			if (t._type == '__context') {
				t = findtype(a[j], t);
			} else {
				t = t[a[j]];
			}
		}
		return t;
	}

	return name;
}

function checktype(expr, ctx, opts) {
	//console.log('checking ',expr,ctx);
	opts = opts || {};

	if (expr.type == 'IndexExpression')
	{
		var t = checktype(expr.base, ctx);

		if (!t) {
			console.log(sub(expr.range));
			console.log(expr.base);
			t = '__unknown';
		}

		if (t == '__unknown') {
			err(expr.loc.start.line, 'type of expression is unknown', chalk.bold(sub(expr.base.range)));
			return '__unknown';
		}
		// console.log(expr.index);
		// var idxt = checktype(expr.index, ctx);
		// console.log('==',t);
		if (expr.index.type == 'NumericLiteral' && t._type) {
			if (t[expr.index.value])
				return expandtype(t[expr.index.value], ctx); 
		}

		if (t._array)
			return expandtype(t._array, ctx);
	}

	else if (expr.type == 'MemberExpression')
	{
		var byName = findtype(flatten(expr, ctx), ctx);
		if (byName)
			return byName;

		var baset = checktype(expr.base, ctx);
		if (!baset)
			console.log(expr.base);
		//TODO: need to update parent object type in context for abstract types
		/*if (baset._type == 'df.viewscreen' && !baset[expr.identifier.name]) {
			if (expr.base.type == 'Identifier') {
				var g = findguess(expr.identifier.name, ctx);
				if (g) {
					baset = expandtype(g, ctx);
				}
			}
		}

		if (baset == '__unknown') {
			var g = findguess(expr.identifier.name, ctx);
			if (g) {
				console.log('will return guess',g);
				return expandtype(g, ctx);
			}
			err(expr.loc.start.line, 'type of expression is unknown', chalk.bold(sub([expr.base.range[0], expr.identifier.range[0]-1])));

			return '__unknown';
		}*/

		if (!baset._type && expr.identifier.name == 'value')
			return baset;

		if (baset._type == 'dfhack.onStateChange') {
			return { _type:'function', _anyfunc:true, _inp:'number' };
		}

		var t = null;
		for (var o = baset; o && !t; o = expandtype(o._super,ctx)) {
			t = o[expr.identifier.name]
		}

		if (isPreload && expr.identifier.name == '__index' && baset._type == 'function')
			return baset;

		if (baset._type == '__context') {
			return expandtype(expr.identifier.name, baset);
		}

		if (!t && baset._sub) {
			var cs = srcstack[srcstack.length-1].comments;
			if (cs) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];
					if (c.loc.start.line == expr.loc.start.line && c.value.substr(0,5) == 'hint:') {
						var m = c.value.match(/hint:\s*([^\s]+)/);
						var hint = m[1];

						if (baset._sub.indexOf(hint) != -1) {
							var subt = expandtype(hint, ctx);
							for (var o = subt; o && !t; o = expandtype(o._super,ctx)) {
								t = o[expr.identifier.name]
							}
						} else
							err(expr.loc.start.line, 'hint', chalk.bold(hint), 'is not a subclass of', chalk.bold(baset._type));

						break;
					}
				}
			}
		}

		if (!t && baset._sub) {
			for (var j in baset._sub) {
				var subt = expandtype(baset._sub[j], ctx);
				t = subt && subt[expr.identifier.name];
				if (t) {
					warn(expr.loc.start.line, 'using subclass', chalk.bold(subt._type), 'for base class', chalk.bold(baset._type), 'and field', chalk.bold(expr.identifier.name));
					//TODO: update context, track guesses, inform about conflicts
					break;
				}
			}
		}

		if (!t) {
			if (baset._type == '__df')
				err(expr.loc.start.line, 'type', chalk.bold('df.'+expr.identifier.name), 'does not exist');
			else if (baset._type == '__global')
				err(expr.loc.start.line, 'global', chalk.bold(expr.identifier.name), 'does not exist');
			else if (baset._enum)
				err(expr.loc.start.line, 'value', chalk.bold(expr.identifier.name), 'does not exist in enum', chalk.bold(baset._type));
			else {
				err(expr.loc.start.line, 'field', chalk.bold(expr.identifier.name), 'does not exist in', chalk.bold(sub([expr.base.range[0], expr.identifier.range[0]-1])), 'of type', chalk.bold(baset._type||baset));
			}
			return '__unknown';
		}

		return expandtype(t, ctx) || '__unknown';
	}

	else if (expr.type == 'Identifier') {
		return expandtype(expr.name, ctx) || '__unknown';
	}

	else if (expr.type == 'StringLiteral') {
		return 'string';
	}

	else if (expr.type == 'BooleanLiteral') {
		return 'bool';
	}

	else if (expr.type == 'NumericLiteral') {
		return 'number';
	}

	else if (expr.type == 'NilLiteral') {
		return 'null';
	}

	else if (expr.type == 'FunctionDeclaration') {
		expr._ctx = ctx;
		expr._src = srcstack[srcstack.length-1];
		return { _type:'function', _node:expr, _ctx:ctx, _src:srcstack[srcstack.length-1] };
	}

	else if (expr.type == 'CallExpression' || expr.type == 'StringCallExpression' || expr.type == 'TableCallExpression') {
		return fntype(expr, ctx);
	}

	else if (expr.type == 'BinaryExpression') {
		var t1 = checktype(expr.left, ctx);
		var t2 = checktype(expr.right, ctx);

		var res;
		var op = expr.operator;
		if (op == '..')
			res = 'string';
		else if (op == '+' || op == '-' || op == '/' || op == '*')
			res = 'number';
		else
			res = 'bool';

		if (t1 == '__unknown') 
			warn(expr.loc.start.line, 'type of operand',chalk.bold(sub(expr.left.range)), 'is unknown, assuming the result is', chalk.bold(res));
		if (t2 == '__unknown')
			warn(expr.loc.start.line, 'type of operand',chalk.bold(sub(expr.right.range)), 'is unknown, assuming the result is', chalk.bold(res));

		return res;
	}

	//TODO: if this is inside if condition, return bool and don't show warnings
	else if (expr.type == 'LogicalExpression') {
		var t1 = checktype(expr.left, ctx, opts);
		var t2 = checktype(expr.right, ctx, opts);

		var res = 'bool';
		if (!opts.in_if) {
			/*if (t1 != 'bool' && t1 != 'null' && t1 != '__unknown')
				res = t1;
			else*/
			if (expr.operator == 'and') { 
				//if (t2 != 'bool' && t2 != 'null' && t2 != '__unknown')
					res = t2;
				//else
					//res = t1;
			} else if (expr.operator == 'or') {
				if ((t1 != 'bool' && t1 != 'null' && t1 != '__unknown') || t2 == '__unknown')
					res = t1;
				else
					res = t2;
			}

			if (t1 == '__unknown' && (expr.operator != 'or' || (expr.left.type != 'Identifier' && expr.left.type != 'MemberExpression') || sub(expr.left.range) != opts.assignedTo))
				warn(expr.loc.start.line, 'type of operand',chalk.bold(sub(expr.left.range)), 'is unknown, assuming the result is', chalk.bold(res._type||res));
			if (t2 == '__unknown')
				warn(expr.loc.start.line, 'type of operand',chalk.bold(sub(expr.right.range)), 'is unknown, assuming the result is', chalk.bold(res._type||res));
		}

		// console.log(expr.loc.start.line,expr.operator,t1._type||t1,t2._type||t2,'->',res._type||res);
		return res;
	}

	else if (expr.type == 'UnaryExpression') {
		var res;
		var op = expr.operator;
		if (op == '-') //todo: check operand type
			res = 'number';
		else if (op == '#') //todo: check operand type
			res = 'number';
		else if (op == 'not')
			res = 'bool';
		else
			res = '__unknown';

		var t1 = checktype(expr.argument, ctx);
		if (t1 == '__unknown' && !opts.in_if)
			warn(expr.loc.start.line, 'type of expression',chalk.bold(sub(expr.argument.range)), 'is unknown, assuming the result is', res);

		return res;
	}

	//TODO: check all elements!
	else if (expr.type == 'TableConstructorExpression') {
		//console.log(expr.fields);
		if (!expr.fields.length)
			return { _type:'table' };

		var ret = { _type:'table' };
		var j = 1;
		var mixed = false;

		// Handle arguments to the script being converted to an array using {...}
		if (ctx == rootctx && expr.fields.length == 1 && expr.fields[0] && expr.fields[0].type == 'TableValue' && expr.fields[0].value && expr.fields[0].value.type == 'VarargLiteral') {
			return { _type:'string[]', _array:'string' };
		}

		expr.fields.forEach(function(f) {
			var t = checktype(f.value, ctx) || '__unknown';

			if (t == '__unknown')
				err(f.loc.start.line, 'type of expression is unknown', chalk.bold(sub(f.value.range)));

			if (f.type == 'TableKeyString' && f.key.type == 'Identifier') {
				ret[f.key.name] = t;

			} else if (f.type == 'TableKey') {
				if (f.key.type == 'StringLiteral')
					ret[f.key.value] = t;
				else if (f.key.type == 'NumericLiteral')
					ret[f.key.value] = t;
				else
					;//warn(f.loc.start.line, 'unsupported table key type', f.key.type);

			} else if (f.type == 'TableValue') {
				ret[j++] = t;


			} else
				console.log(f);

			if (!mixed) {
				if (!ret._array)
					ret._array = t;
				else if ((ret._array._type||ret._array) != (t._type||t)) {
					delete ret._array;
					mixed = true;
				}
			}
		});

		//TODO: key-value pairs
		return ret;
	}

	else if (expr.type == 'VarargLiteral') {
		return { _type:'tuple', _tuple:[] };
	}

	else
		console.log(expr);

	return '__unknown';
}

function flatten(expr, ctx) {
	if (typeof expr == 'string')
		return expr;

	if (expr.type == 'Identifier') {
		var t = findtype(expr.name, ctx);

		if (t && t._alias) {
			return t._type;
		}

		return expr.name;
	}

	if (expr.type == 'CallExpression')
		return '__unknown';

	if (expr.indexer == ':') {
		var t = checktype(expr.base, ctx);
		if (t == '__unknown') {
			err(expr.loc.start.line, 'type of expression is unknown', chalk.bold(sub(expr.range)));
		}

		return (t._type || t) + '.' + expr.identifier.name;
	}

	if (expr.type == 'MemberExpression')
		return flatten(expr.base, ctx) + expr.indexer + expr.identifier.name;

	if (expr.type == 'IndexExpression')
		return flatten(expr.base, ctx) + '[' + flatten(expr.index, ctx) + ']';

	return sub(expr.range);
}

function fntype(call, ctx) {

	if (!call.arguments && call.argument)
		call.arguments = [ call.argument ];

	//TODO: support IndexExpression
	var fnname = null;
	var fn = null;
	if (call.base.type == 'Identifier') {
		fnname = call.base.name;
	} else if (call.base.type == 'MemberExpression') {
		fnname = flatten(call.base, ctx);
	} else if (call.base.type == 'IndexExpression' && call.base.index.type == 'NumericLiteral') {
		var baset = checktype(call.base.base, ctx);
		if (baset == '__unknown') {
			err(call.loc.start.line, 'type of expression is unknown', chalk.bold(sub(call.base.base.range)));
			return '__unknown';
		}

		if (baset[call.base.index.value])
			fn = baset[call.base.index.value]; 
		else {
			err(call.loc.start.line, 'unknown function', chalk.bold(sub(call.base.range)));
			return '__unknown';
		}

	} else {
		warn(call.loc.start.line, 'skipping function call', chalk.bold(sub(call.base.range)));
		return '__unknown';
	}

	if (!fn) {
	/*if (fnname.indexOf(':') != -1) {
		var a = fnname.split(':');
		var objname = a[0];
		var mname = a[1];
		var t = expandtype(objname, ctx) || '__unknown';
		if (t == '__unknown') {
			err(call.loc.start.line, 'unknown object', chalk.bold(objname));
			return '__unknown';
		}
		fnname = t + '.' + mname;
	}*/

	if (fnname.match('\\.delete$'))
		return 'none';

	if (fnname.match('\\.sizeof'))
		return { _type:'tuple', _tuple:['number', 'number'] };

	if (fnname.match('\\._field')) //TODO: check that the field exists
		return { _type:'field' };

	//TODO: check that assignment is correct somehow ?
	if (fnname.match('\\.assign'))
		return 'none';

	if (fnname == 'df.new') {
		var t = call.arguments[0].value;
		var et = expandtype(t);
		if (et == t) {
			return { _type:'std::' + t, value:t };
		}
		return et;
	}

	if (fnname.match('\\.new')) 
		return expandtype(fnname.slice(0, -4), ctx);

	if (fnname.match('^df.+\\.is_instance')) 
		return 'bool';

	if (fnname == 'defclass') {
		var et = checktype(call.arguments[0], ctx);
		if (et != '__unknown')
			return et;

		var pt = call.arguments[1] ? checktype(call.arguments[1], ctx) : '__defclass_base';

		return {
			_defclass: true,
			_type: flatten(call.arguments[0], ctx),
			_sub: pt
		};
	}

	if (fnname == 'table.insert') {
		var k = (call.arguments.length == 3 ? 2 : 1);
		var t = checktype(call.arguments[0], ctx) || '__unknown';
		var rt = checktype(call.arguments[k], ctx) || '__unknown';

		if (rt == '__unknown')
			err(call.loc.start.line, 'type of expression is unknown', chalk.bold(sub(call.arguments[k].range)));

		if (t == '__unknown')
			err(call.loc.start.line, 'type of expression is unknown', chalk.bold(sub(call.arguments[0].range)));
		else {
			if (t._type == 'table' || t._array) {
				if (t._array && (t._array._type||t._array) != (rt._type||rt))
					;//warn(call.loc.start.line, 'inserting', chalk.bold(rt._type||rt), 'to a table with', chalk.bold(t._array._type || t._array));
				else if (!t._array)
					t._array = rt;
			} else
				err(call.loc.start.line, 'type of table.insert argument is not a table', chalk.bold(sub(call.arguments[0].range)));
		}

		return 'none';
	}

	if (fnname == 'table.pack' && call.arguments.length == 1 && call.arguments[0].type == 'VarargLiteral') {
		return { _type: 'string[]', _array: 'string' };
	}

	if (fnname == 'utils.invert') {
		if (!call.arguments[0] || call.arguments[0].type != 'TableConstructorExpression') {
			err(call.local.start.line, 'unable to parse utils.invert call', chalk.bold(sub(call.arguments[0].range)));
			return '__unknown';
		}
		var inverted = {
			type: 'TableConstructorExpression',
			fields: call.arguments[0].fields.map(function(f) {
				return { type: 'TableKeyString', key: { type: 'Identifier', name: f.value.value }, value: f.value };
			})
		};
		return checktype(inverted, ctx) || '__unknown';
	}

	if (fnname == 'printall' || fnname == 'printall_ipairs') {
		return 'none';
	}

	if (fnname == 'copyall' || fnname == 'utils.clone') {
		return checktype(call.arguments[0], ctx) || '__unknown';
	}

	if (fnname == 'utils.processArgs') {
		return checktype(call.arguments[1], ctx) || '__unknown';
	}

	if (fnname.match('\\[\\]\\.(insert|resize|erase)$'))
		return 'none';

	if (fnname == 'df.reinterpret_cast') {
		var t = checktype(call.arguments[0], ctx);
		return t;
	}

	if (fnname == 'mkmodule') {
		var m = modules[call.arguments[0].value];
		if (!m) {
			m = modules[call.arguments[0].value] = { _type:'table' };
		}
		return m;
	}

	if (fnname == 'loadfile') {
		return { _type:'tuple', _tuple:[{_type:'function'}, 'number'] };
	}

	if (fnname == 'reqscript' || fnname == 'dfhack.run_script_with_env' || fnname == 'dfhack.script_environment') {
		var arg = call.arguments[fnname == 'dfhack.run_script_with_env' ? 1 : 0];
		if (!arg || !arg.value) {
			return { _type:'table' };
		}

		var src = null;
		for (var i = 0; i < scriptpath.length; i++) {
			try {
				var fn = scriptpath[i] + '/' + arg.value.split('.').join('/') + '.lua';
				src = fs.readFileSync(fn).toString();
				break;
			} catch (e) {
				// try next
			}
		}

		if (src == null) {
			err(call.loc.start.line, 'could not require', arg.value);
			return '__unknown';
		}
		
		var ctx2 = { _type:'__context', types:{}, parent:ctx };
		var ast = luaparser.parse(src, { comments:true, locations:true, ranges:true });
		srcstack.push({src:src, fn:fn, comments:ast.comments});
		var type = processAST(ast.body, ctx2);
		srcstack.pop();
		return type || ctx2;
	}

	if (fnname == 'require') {
		if (reqignore.indexOf(call.arguments[0].value) == -1) {
			var src = null;
			for (var i = 0; i < incpath.length; i++) {
				try {
					var fn = incpath[i] + '/' + call.arguments[0].value.split('.').join('/') + '.lua';
					src = fs.readFileSync(fn).toString();
					break;
				} catch (e) {
					// try next
				}
			}

			if (src == null) {
				err(call.loc.start.line, 'could not require', call.arguments[0].value);
			}
			
			var ctx2 = { _type:'__context', types:{}, parent:ctx };
			var ast = luaparser.parse(src, { comments:true, locations:true, ranges:true });		
			srcstack.push({src:src, fn:fn, comments:ast.comments});
			var type = processAST(ast.body, ctx2);
			srcstack.pop();
			return type || ctx2;
		} else {
			if (call.arguments[0].value == 'remote.MessagePack')
				return rootctx.types.MessagePack;
			if (call.arguments[0].value == 'remote.JSON')
				return rootctx.types.JSON;
		}
		
		return '__unknown';
	}
	

	// console.log(fnname, call.arguments);
	// call.arguments.forEach(function(a) {
	// 	console.log(checktype(a, ctx));
	// });

	if (fnname == 'dfhack.safecall' || fnname == 'pcall') {
		var q = fntype({
			base: call.arguments[0],
			arguments: call.arguments.slice(1),
			loc: call.loc,
		}, ctx);

		return { _type:'tuple', _tuple:['bool', q] };
	}

	var fn = findfn(fnname,ctx);
	}
	if (!fn) {
		err(call.loc.start.line, 'unknown function', chalk.bold(fnname));
		return '__unknown';
	}

	if (fn._defclass) {
		fntype({
			base: {
				type: 'Identifier',
				name: fnname + '.init'
			},
			arguments: call.arguments
		}, ctx);
		return fn;
	}

	if (fn._type && fn._type != 'function')
		return fn;

	var ctx1 = ctx;
	if (fn._type == 'function') {
		fn = fn._node;
		ctx1 = fn._ctx;
	}

	if (typeof fn == 'string') {
		for (var k = 0; k < call.arguments.length; k++) {
			var t = checktype(call.arguments[k], ctx);
		}

		return expandtype(fn, ctx);
	}

	var des = [ fnname ];
	var save = true;

	var ctx2 = { _type: '__context', types:{}, parent:ctx1 };
	var memberOf = fn && fn.identifier && fn.identifier.type == 'MemberExpression' && expandtype(flatten(fn.identifier.base, ctx1), ctx1);
	if (memberOf && memberOf._defclass) {
		ctx2.types.self = memberOf;
	}
	for (var k = 0; k < fn.parameters.length; k++) {
		if (call.arguments.length > k) {
			var t = checktype(call.arguments[k], ctx) || '__unknown';
			if (t == '__unknown')
				err(call.loc.start.line, 'type of expression is unknown', chalk.bold(sub(call.arguments[k].range)));

			ctx2.types[fn.parameters[k].name] = t;
			des.push(t._type||t);
			if (t._type == 'function')
				save = false;
		} else {
			ctx2.types[fn.parameters[k].name] = 'null';
			des.push('null');
		}
	}

	des = des.join('_');

	if (callers.indexOf(des) != -1)
		return '__recursive';

	if (checkedfns[des])
		return checkedfns[des];

	srcstack.push(fn._src);
	callers.push(des);
	var q = processAST(fn.body, ctx2);
	callers.pop();
	srcstack.pop();

	if (fn._out) {
		q = fn._out;
	}

	if (q == '__unknown' && rootctx.functions[fnname]) {
		q = rootctx.functions[fnname];
	}

	if (save)
		checkedfns[des] = q;
	checked_global_fns[fnname] = true;

	return q;
}

function find_comment_dfver(b)
{
	var cs = srcstack[srcstack.length-1].comments;

	if (cs) {
		for (var j = 0; j < cs.length; j++) {
			var c = cs[j];
			if (c.loc.start.line == b.loc.start.line && c.value.substr(0,6) == 'dfver:') {
				var m = c.value.match(/dfver:\s*([^\s]+)/);
				if (m) {
					var vers = m[1].split('-');
					var min = vers[0] || 0;
					var max = vers[1] || 9999;

					return (dfver >= min && dfver <= max);
				}

				break;
			}
		}
	}

	return true;
}

function processAST(body, ctx) {
	var rettype = null;

	body.forEach(function(b) {
		if (b.type == 'FunctionDeclaration') {
			var c = b.isLocal ? ctx : rootctx;
			var n = flatten(b.identifier, ctx);
			var existing = expandtype(n, ctx);
			c.functions = c.functions || {};
			c.functions[n] = b;
			c.functions[n]._src = srcstack[srcstack.length-1];
			c.functions[n]._ctx = ctx;
			c.types[n] = { _type:'function', _node:b, _ctx:ctx, _src:srcstack[srcstack.length-1] }
			var ctypes = c.types;

			if (!b.isLocal && srcstack.length == 1) {
				checked_global_fns[n] = false;
			}

			var cs = srcstack[srcstack.length-1].comments;
			if (existing && existing._anyfunc && existing._inp) {
				fnstocheck.push({name:n, node:ctypes[n], inp:[null, existing._inp]});
			} else if (cs) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];

					if (c.loc.start.line == b.loc.start.line-1 && c.value.substr(0,9) == 'luacheck:') {
						var inp = c.value.match(/in=([^\s]*)/);
						var outp = c.value.match(/out=([^\s]+)/);

						if (outp) {
							ctypes[n]._out = expandtype(outp[1], ctx);
						}

						if (inp) {
							fnstocheck.push({name:n, node:ctypes[n], inp:inp});
						}

						break;
					}
				}
			}
		}

		else if (b.type == 'LocalStatement') {
			var cs = srcstack[srcstack.length-1].comments;
			var as = null;
			if (cs) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];
					if (c.loc.start.line == b.loc.start.line && c.value.substr(0,3) == 'as:') {
						var m = c.value.match(/as:\s*([^\s]+)/);
						if (m)
							as = [ m[1] ]; //TODO:split is removed to support json, so annotated tuple assignment do not work now! m[1].split(',');

						break;
					}
				}
			}

			var righttypes = [];
			for (var j = 0; j < b.init.length; j++)
			{
				var t = checktype(b.init[j], ctx) || '__unknown';

				if (t._tuple) {
					for (var k = 0; k < t._tuple.length; k++)
						righttypes.push(t._tuple[k]);

					break;
				}

				//TODO: don't show error if there's --as: comment, show warning
				if (t == '__unknown') {
					if (b.init.length == 1 && as)
						warn(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[j].range)), 'will assume from comment', chalk.bold(as[0]));
					else
						err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[j].range)));
				}

				righttypes.push(t);
			}

			for (var j = 0; j < b.variables.length; j++) {
				var n = b.variables[j].name;
				if (righttypes.length > j) {
					var t = righttypes[j];

					//TODO: check that casting to correct subclass
					if (as && as.length > j) {
						t = expandtype(as[j], ctx, b.loc.start.line);
						if (t == '__unknown')
							err(b.loc.start.line, 'type of expression is unknown', chalk.bold(as[j]));
					}

					ctx.types[n] = t;
				} else 
					ctx.types[n] = 'null';
			}
		}

		else if (b.type == 'AssignmentStatement') {
			var cs = srcstack[srcstack.length-1].comments;
			var as = null;
			if (cs) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];
					if (c.loc.start.line == b.loc.start.line && c.value.substr(0,3) == 'as:') {
						var m = c.value.match(/as:\s*([^\s]+)/);
						if (m)
							as = [ m[1] ]; //TODO:split is removed to support json, so annotated tuple assignment do not work now! m[1].split(',');

						break;
					}
				}
			}

			if (b.variables[0].type == 'Identifier') {
				var n = b.variables[0].name;
				var t = checktype(b.init[0],ctx,{assignedTo:n});

				//TODO: check that casting to correct subclass
				// if (as && as.length > 0)
				// 	t = expandtype(as[0], ctx, b.loc.start.line);

				if (t == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[0].range)));

				else {
					// Since it may be a var not local to the current context,
					// we need to find closest one having this var and update its type
					var found = false;
					for (var c = ctx; c; c = c.parent) {
						if (c.types[n] && !(c.temps && c.temps[n])) {
							var lt = c.types[n];
							if (lt != 'null' && (lt._type||lt) != (t._type||t) && t != '__unknown' && t != 'null' && lt._type != 'table' && (!lt._array || rt._type != 'table' || Object.keys(rt).length != 1)) {
								err(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(t&&t._type||t), 'to', chalk.bold(b.variables[0].name), 'of type', chalk.bold(lt._type||lt));
							}
							else if (t != 'null')
								c.types[n] = t;
							found = true;
							break;
						}
					}

					if (!found) {
						// assume all-caps and defclass types are supposed to be global.
						if (!isPreload && (n.toUpperCase() != n || n.toLowerCase() == n) && (n != t._type || !t._defclass)) {
							warn(b.loc.start.line, 'assignment to global/unknown var', b.variables[0].name);
						}
						if (as && as.length > 0)
							rootctx.types[n] = expandtype(as[0], ctx, b.loc.start.line);
						else
							rootctx.types[n] = t;
					}
				}

			} else if (b.variables[0].type == 'MemberExpression') {
				var lbase = checktype(b.variables[0].base, ctx) || '__unknown';
				var lt = checktype(b.variables[0], ctx) || '__unknown';
				var rt = checktype(b.init[0],ctx,{assignedTo:sub(b.variables[0].range)}) || '__unknown';

				if (lt == '__unknown' && (lbase._type == 'table' || lbase._defclass) && !lbase._array) {
					lbase[b.variables[0].identifier.name] = rt;
				}

				if (lt == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.variables[0].range)));
				if (rt == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[0].range)));
				if (lt._anyfunc && rt._type == 'function') {
					if (lt._inp && rt._ctx && rt._node) {
						fnstocheck.push({name:flatten(b.variables[0], ctx), node:rt, inp:[null, lt._inp]});
					}
					rootctx.functions[flatten(b.variables[0], ctx)] = rt;
				} else if (lt._array && rt._type == 'table' && Object.keys(rt).length == 1) {
					// assigning empty table to an array field
				} else if (lt != '__unknown' && rt != '__unknown' && lt != rt && rt != 'null') {
					var ok = false;
					if (rt._type && lt._sub) {
						for (var j = 0; j < lt._sub.length; j++) {
							if (lt._sub[j] == rt._type) {
								ok = true;
								break;
							}
						}
					}
					if (!ok) {
						if (lt._enum && rt == 'number')
							warn(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(rt._type||rt), 'to', chalk.bold(sub(b.variables[0].range)), 'of type', chalk.bold(lt._type||lt));
						else
							err(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(rt._type||rt), 'to', chalk.bold(sub(b.variables[0].range)), 'of type', chalk.bold(lt._type||lt));
					}
				}
				//console.log(, b.variables[0], t);

			} else if (b.variables[0].type == 'IndexExpression') {
				//TODO: check left side

				var rt = checktype(b.init[0],ctx);
				if (rt == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[0].range)));

				var lbase = checktype(b.variables[0].base, ctx);
				var lindex = checktype(b.variables[0].index, ctx);
				if (lbase._type == 'table' && !lbase._array && lindex == 'number' && rt != '__unknown') {
					lbase._array = rt;
				}
			} else {
				console.log(b);
				throw new Error('unknown left side', b);
			}
		}

		else if (b.type == 'ForGenericStatement') {
			var cs = srcstack[srcstack.length-1].comments;
			var as = null;
			if (cs) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];
					if (c.loc.start.line == b.loc.start.line && c.value.substr(0,3) == 'as:') {
						var m = c.value.match(/as:\s*([^\s]+)/);
						if (m)
							as = m[1];

						break;
					}
				}
			}

			if (b.iterators[0].type == 'CallExpression' &&
			    (b.iterators[0].base.name == 'pairs' || b.iterators[0].base.name == 'ipairs' || b.iterators[0].base.name == 'ripairs' || b.iterators[0].base.name == 'ripairs_tbl')) {
				var ctx2 = { _type: '__context', parent:ctx, types:{} };
				var t = checktype(b.iterators[0].arguments[0],ctx) || '__unknown';

				if (t == '__unknown') {
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.iterators[0].arguments[0].range)));
					t = { _array:'__unknown' };
				}

				if ((b.iterators[0].base.name != 'pairs' || t._type != 'table') && !t._array) {
					err(b.loc.start.line, 'not an array', chalk.bold(sub(b.iterators[0].arguments[0].range)), t);
					t = { _array:'__unknown' };
				}

				if (as) {
					t = expandtype(as, ctx, b.loc.start.line);
					if (t == '__unknown')
						err(b.loc.start.line, 'type of expression is unknown', chalk.bold(as));

					t = { _array:t };
				}

				ctx2.types[b.variables[0].name] = (b.iterators[0].base.name == 'pairs' ? 'string' : 'number');
				ctx2.types[b.variables[1].name] = expandtype(t._array, ctx);
				rettype = processAST(b.body, ctx2) || rettype;
			} else {
				err(b.loc.start.line, 'unsupported for loop');
			}
		}

		else if (b.type == 'IfStatement') {
			/*var cs = srcstack[srcstack.length-1].comments;
			var as = null;
			if (cs) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];
					if (c.loc.start.line == b.loc.start.line && c.value.substr(0,3) == 'as:') {
						var m = c.value.match(/as:\s*([^\s]+)/);
						if (m) {
							as = m[1].split(',');
						}

						break;
					}
				}
			}*/

			b.clauses.forEach(function(clause) {
				var cs = srcstack[srcstack.length-1].comments;
			var as = null;
			if (cs) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];
					if (c.loc.start.line == clause.loc.start.line && c.value.substr(0,3) == 'as:') {
						var m = c.value.match(/as:\s*([^\s]+)/);
						if (m) {
							as = m[1].split(',');
						}

						break;
					}
				}
			}
				if (clause.condition) {
					var ctx2 = { _type: '__context', parent:ctx, types:{} };
					ensureArray(as).forEach(function(a) {
						var a2 = a.split('=');
						ctx2.types[a2[0]] = expandtype(a2[1], ctx);
					});
					var t = checktype(clause.condition, ctx2, { in_if:true });
					// if (t == '__unknown')
					// 	err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(clause.condition.range)));
				}

				if (find_comment_dfver(clause)) {
					var ctx2 = { _type: '__context', parent:ctx, types:{} };
					ensureArray(as).forEach(function(a) {
						var a2 = a.split('=');
						ctx2.types[a2[0]] = expandtype(a2[1], ctx);
						ctx2.temps = ctx2.temps || {};
						ctx2.temps[a2[0]] = true;
					});
					rettype = processAST(clause.body, ctx2) || rettype;
				}
			});
		}

		else if (b.type == 'ReturnStatement') {
			if (b.arguments.length) {
				var t = checktype(b.arguments[0], ctx);
				if (t != 'null')
					rettype = t;
			}
		}

		else if (b.type == 'CallStatement') {
			checktype(b.expression, ctx);
		}

		else if (b.type == 'BreakStatement' || b.type == 'GotoStatement' || b.type == 'LabelStatement')
			;

		else if (b.type == 'WhileStatement' || b.type == 'RepeatStatement') {
			if (b.condition) {
				var t = checktype(b.condition, ctx);
				// if (t == '__unknown')
				// 	err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.condition.range)));
			}

			var ctx2 = { _type: '__context', parent:ctx, types:{} };
			rettype = processAST(b.body, ctx2) || rettype;
		}

		else if (b.type == 'ForNumericStatement') {
			if (b.variable.type == 'Identifier') {
				var ctx2 = { _type: '__context', parent:ctx, types:{} };
				ctx2.types[b.variable.name] = 'number';
				rettype = processAST(b.body, ctx2) || rettype;
			}
			else
				console.log(b.variable.type);
		}

		else
			console.log(b.type);

	});

	return rettype;
}

function sub(range)
{
	return srcstack[srcstack.length-1].src.substring(range[0], range[1]);
}

function firstlog() {
	if (hasLogged) {
		return;
	}

	hasLogged = true;
	console.log('---------------------------');
	console.log(mainfn);
}

function err(line) {
	firstlog();
	var args = Array.prototype.slice.call(arguments);
	var fn = srcstack[srcstack.length-1].fn.split('/').slice(-1)[0];
	args.splice(0, 1, chalk.red('ERROR ' + fn + ':' + line));
	console.log.apply(null, args);
	process.exitCode = 2;
}

function warn(line) {
	if (nowarn)
		return;

	firstlog();
	var args = Array.prototype.slice.call(arguments);
	var fn = srcstack[srcstack.length-1].fn.split('/').slice(-1)[0];
	args.splice(0, 1, chalk.yellow('WARN  ' + fn + ':' + line));
	console.log.apply(null, args);
	process.exitCode = 2;
}

//TODO: create context for the main file so that locals don't go to rootctx
isPreload = true;
preload.forEach(function(filename) {
	fntype({
		base: {
			type: 'Identifier',
			name: 'require'
		},
		argument: {
			type: 'StringLiteral',
			value: filename
		}
	}, rootctx);
});
isPreload = false;
processAST(ast.body, rootctx);

fnstocheck.forEach(function(fn) {
	var b = fn.node._node;
	var ctx = fn.node._ctx;
	var inp = fn.inp;
	var argtypes = inp[1].split(',');

	var ctx2 = { _type: '__context', types:{}, parent:ctx };

	var memberOf = b.identifier && b.identifier.type == 'MemberExpression' && expandtype(flatten(b.identifier.base, ctx), ctx);
	if (memberOf && memberOf._defclass) {
		ctx2.types.self = memberOf;
	}

	for (var k = 0; k < b.parameters.length; k++) {
		if (argtypes.length > k) {
			var t = expandtype(argtypes[k], ctx);
			ctx2.types[b.parameters[k].name] = t;
		} else {
			ctx2.types[b.parameters[k].name] = 'null';
		}
	}

	srcstack.push(b._src);
	processAST(b.body, ctx2);
	srcstack.pop();

	checked_global_fns[fn.name] = true;
});

Object.keys(checked_global_fns).forEach(function(f) {
	if (!checked_global_fns[f])
		console.log('global function NOT checked', f);
});
