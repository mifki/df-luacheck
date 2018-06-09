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

var argv = require('yargs').count('verbose').argv;
var dfhackver = argv.v;
var dfver = dfhackver.toString().split('-')[0];
var mainfn = argv._[0];
var nowarn = argv.W;
var verbose = argv.verbose;

var rootctx = JSON.parse(fs.readFileSync(__dirname + '/ctx_' + dfhackver + '.json'));
var ctxstack = [{ _type: '__context', types: {}, parent: rootctx }];

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
	'dumper',
];
var fnstocheck = [];
var callers = [];
var checkedfns = {};
var unchecked_global_fns = {};
var modules = {};

reqignore = reqignore.concat(ensureArray(argv.x));

var src = fs.readFileSync(mainfn).toString();
var ast = luaparser.parse(src, { comments:true, locations:true, ranges:true });
var srcstack = [ { src:src, fn:mainfn, comments:ast.comments } ];
var linestack = [];

function isargtype(t) {
	if (!t)
		return false;
	if ((t._type||t) == '__arg')
		return true;
	if ((t._type||t) == 'string')
		return true;
	if (t == 'table' || (t._type == 'table' && Object.keys(t).length == 1))
		return true;
	return isargtype(t._array);
}

var keyArrayType = { _type:'__keyArray', _STRING:'number', _MOUSE_L:'bool', _MOUSE_R:'bool', _MOUSE_L_DOWN:'bool', _MOUSE_R_DOWN:'bool', _array:'bool' };
Object.values(rootctx.types.df.interface_key._enum).forEach(function(k) {
	keyArrayType[k] = 'bool';
});

function findtype(name, ctx) {
	if (name == '__arg')
		return { _type:'__arg', _array:'__arg' };

	if (name == '__keyArray')
		return keyArrayType;

	if (name == '__gui_Painter' && modules.gui && modules.gui._module)
		return findtype('Painter', modules.gui._module);

	if (name == 'field')
		return { _type:'field' };

	if (name == '_ENV')
		return ctx.types['_ENV'] || ctx;

	if (name == '_G')
		return rootctx;

	if (name.slice(0, 8) == 'anyfunc:')
		return { _type:'function', _anyfunc:true, _inp:name.slice(8) };

	if (ctx.types[name])
		return ctx.types[name];

	if (ctx.functions && ctx.functions[name])
		return { _type:'function', _node:ctx.functions[name] };

	if (ctx.parent)
		return findtype(name, ctx.parent);
}

function deepEqual(a, b, ctx, line) {
	if (typeof a == 'string' && typeof b != 'string') {
		a = expandtype(a, ctx, line, true) || a;
	}
	if (typeof b == 'string' && typeof a != 'string') {
		b = expandtype(b, ctx, line, true) || b;
	}
	if (b == 'null') {
		return true;
	}
	if (typeof a != typeof b) {
		return false;
	}

	if (!a || !b) {
		return !a && !b;
	}

	if (typeof a != 'object') {
		return a == b;
	}

	return Object.keys(a).concat(Object.keys(b)).every(function(k) {
		if (k == '_array') {
			return deepEqual(a[k] || arrayType(a, ctx, line), b[k] || arrayType(b, ctx, line), ctx, line);
		}
		return deepEqual(a[k] || a._array, b[k] || b._array, ctx, line);
	});
}

function findfn(name, ctx, line) {
	var dot = name.lastIndexOf('.');
	if (dot != -1) {
		var t = expandtype(name.substr(0, dot), ctx, line, true);
		if (t && t._type == '__arg') {
			t = 'string';
		}
		var n = name.substr(dot+1);
		if (t && t != '__unknown') {
			for (var o = t; o; o = expandtype(o._super, ctx, line, true)) {
				if (o._module && findfn(n, o._module, line))
					return findfn(n, o._module, line);
				if (o._methods && o._methods[n])
					return o._methods[n];
				if (o.functions && o.functions[n])
					return { _type:'function', _node:o.functions[n] };
				if (o._defclass && n == 'ATTRS')
					return { _type:'function', _node:'none', _defclass_ATTRS:t };
			}
		}
	}

	var t = expandtype(name, ctx, line, true);
	if (t && (t._type == 'function' || t._defclass))
		return t;

	if (ctx.functions && ctx.functions[name])
		return ctx.functions[name];

	if (ctx.parent)
		return findfn(name, ctx.parent, line);
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

function expandtype(name, ctx, line, quiet) {
	if (typeof name == 'string' && name.slice(-2) == '[]')
		return { _type:name, _array:name.slice(0,-2) }

	if (typeof name == 'string' && name.slice(0,1) == '{' && name.slice(-1) == '}') {
		var type = null;
		try {
			type = jsonic(name);
		} catch (e) {
			err(line, 'can not parse type definition', chalk.bold(name), e);
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
		if (q) {
			return q;
		}

		var a = name.split('.');
		var t = findtype(a[0], ctx);
		for (var j = 1; j < a.length; j++) {
			if (!t) {
				if (!quiet) {
					err(line, 'Cannot find', chalk.bold(a.slice(0, j).join('.')), 'in', chalk.bold(name));
				}
				return '__unknown';
			}

			if (t._type == '__EventHolder') {
				t = { _type:'function', _anyfunc:true, _inp:t._inp };
			} else if (t._module) {
				t = findtype(a[j], t._module);
			} else if (t._type == '__context') {
				t = findtype(a[j], t);
			} else {
				t = t[a[j]];
			}
		}
		if (!t) {
			if (!quiet) {
				err(line, 'Cannot find', chalk.bold(name));
			}
			return '__unknown';
		}
		return t;
	}

	return name;
}

function arrayType(t, ctx, line, key) {
	if (t._enum && key && (key._type||key) == 'string') {
		return t._type;
	}

	if (t._array) {
		return expandtype(t._array, ctx, line);
	}

	if (!t._type || t._type == '__context') {
		return null;
	}

	var fieldTypes = Object.keys(t).filter(function(k) {
		return k != '_type' && k != '_alias' && (t._type.slice(0, 3) != 'df.' || k != 'whole') && t[k];
	}).map(function(k) {
		return t[k];
	});

	if (fieldTypes.length == 0) {
		return '__unknown';
	}
	if (fieldTypes.every(function(t) {
		return (t._type||t) == (fieldTypes[0]._type||fieldTypes[0]);
	})) {
		return expandtype(fieldTypes[0]._type||fieldTypes[0], ctx, line);
	}

	return null;
}

function checktype(expr, ctx, opts) {
	//console.log('checking ',expr,ctx);
	opts = opts || {};

	if (expr.type == 'IndexExpression')
	{
		var t = checktype(expr.base, ctx);

		if (!t) {
			err(expr.loc.start.line, 'no type for index base', sub(expr.range), expr.base);
			t = '__unknown';
		}

		if (t == '__unknown') {
			err(expr.loc.start.line, 'type of expression is unknown', chalk.bold(sub(expr.base.range)));
			return '__unknown';
		}

		var index = expr.index;
		if (index.type == 'Identifier') {
			for (var c = ctx; c; c = c.parent) {
				if (c._params && c._params.indexOf(index.name) > -1) {
					var arg = c._args[c._params.indexOf(index.name)];
					if (arg && arg.type.indexOf('Literal') > -1) {
						index = arg;
					}
					break;
				}
				if (c.types && c.types[index.name]) {
					break;
				}
			}
		}

		if (index.type == 'StringLiteral') {
			return checktype({
				type: 'MemberExpression',
				indexer: '.',
				identifier: {
					type: 'Identifier',
					name: index.value,
					loc: index.loc,
					range: index.range
				},
				base: expr.base,
				loc: expr.loc,
				range: expr.range
			}, ctx, opts);
		}

		// console.log(expr.index);
		// var idxt = checktype(expr.index, ctx);
		// console.log('==',t);
		if (index.type == 'NumericLiteral' && t._type) {
			if (t[index.value])
				return expandtype(t[index.value], ctx, expr.loc.start.line);
		}

		if (t._type == '__EventHolder')
			return { _type:'function', _anyfunc:true, _inp:t._inp };

		var at = arrayType(t, ctx, expr.loc.start.line, checktype(index, ctx));
		if (at && at != '__unknown') {
			return at;
		}

		if (t._type == 'table' && Object.keys(t).length == 1) {
			warn(expr.loc.start.line, 'cannot determine element type of empty table', chalk.bold(sub(expr.range)), '(suggested: add an --as:foo[] annotation to the location this variable is declared)');
			return '__unknown';
		}

		fault(expr.loc.start.line, 'unhandled IndexExpression', chalk.bold(sub(expr.range)), t, index);
		return '__unknown';
	}

	else if (expr.type == 'MemberExpression')
	{
		var byName = findtype(flatten(expr, ctx), ctx);
		if (byName)
			return byName;

		var baset = checktype(expr.base, ctx) || '__unknown';
		if (typeof baset == 'string')
			baset = expandtype(baset, ctx, expr.loc.start.line) || baset;
		if (baset == '__unknown') {
			err(expr.loc.start.line, 'no base type', sub(expr.range), expr, ctx.types);
			return '__unknown';
		}

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

		if (baset._type == '__EventHolder') {
			return { _type:'function', _anyfunc:true, _inp:baset._inp };
		}

		var t = null;
		for (var o = baset; o && !t; o = expandtype(o._super, o._defclass || ctx, expr.loc.start.line)) {
			t = o[expr.identifier.name] || (o._module && findtype(expr.identifier.name, o._module));
		}

		if (isPreload && (expr.identifier.name == '__index'))
			return { _type:'function', _anyfunc:true };

		if (baset._type == '__context') {
			return expandtype(expr.identifier.name, baset, expr.loc.start.line);
		}

		if (!t && baset._sub) {
			var cs = srcstack[srcstack.length-1].comments;
			if (cs) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];
					if (c.loc.start.line == expr.loc.start.line && c.value.substr(0,5) == 'hint:') {
						var m = c.value.match(/hint:\s*([^\s]+)/);
						var hint = expandtype(m[1], ctx, c.loc.start.line);

						if (baset._sub.indexOf(hint._type||hint) != -1 || baset._sub.indexOf(hint) != -1) {
							var subt = expandtype(hint, ctx, expr.loc.start.line);
							for (var o = subt; o && !t; o = expandtype(o._super,ctx, expr.loc.start.line)) {
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
				var subt = expandtype(baset._sub[j], ctx, expr.loc.start.line);
				t = subt && subt[expr.identifier.name];
				if (t) {
					warn(expr.loc.start.line, 'using subclass', chalk.bold(subt._type), 'for base class', chalk.bold(baset._type), 'and field', chalk.bold(expr.identifier.name));
					//TODO: update context, track guesses, inform about conflicts
					break;
				}
			}
		}

		if (!t && (!opts.assignLeft || baset._array)) {
			t = arrayType(baset, ctx, expr.loc.start.line, 'string');
			if (t == '__unknown') {
				t = null;
			}
		}

		if (!t) {
			if ((baset._defclass || baset._type == 'table') && !baset._array && opts.assignLeft) {
				// ok
			} else if (baset._type == '__df') {
				err(expr.loc.start.line, 'type', chalk.bold('df.'+expr.identifier.name), 'does not exist');
			} else if (baset._type == '__global') {
				err(expr.loc.start.line, 'global', chalk.bold(expr.identifier.name), 'does not exist');
			} else if (baset._enum) {
				err(expr.loc.start.line, 'value', chalk.bold(expr.identifier.name), 'does not exist in enum', chalk.bold(baset._type));
			} else {
				err(expr.loc.start.line, 'field', chalk.bold(expr.identifier.name), 'does not exist in', chalk.bold(sub([expr.base.range[0], expr.identifier.range[0]-1])), 'of type', typeof(baset._type||baset) == 'string' ? chalk.bold(baset._type||baset) : baset);
			}
			return '__unknown';
		}

		return expandtype(t, ctx, expr.loc.start.line) || '__unknown';
	}

	else if (expr.type == 'Identifier') {
		return expandtype(expr.name, ctx, expr.loc.start.line, opts.quiet) || '__unknown';
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
		expr._src = srcstack[srcstack.length-1];
		return { _type:'function', _node:expr, _ctx:ctx, _src:srcstack[srcstack.length-1] };
	}

	else if (expr.type == 'CallExpression' || expr.type == 'StringCallExpression' || expr.type == 'TableCallExpression') {
		return fntype(expr, ctx);
	}

	else if (expr.type == 'BinaryExpression') {
		var t1 = checktype(expr.left, ctx) || '__unknown';
		var t2 = checktype(expr.right, ctx) || '__unknown';

		var res;
		var op = expr.operator;
		if (op == '..')
			res = 'string';
		else if (op == '+' || op == '-' || op == '/' || op == '*' || op == '&' || op == '|' || op == '%' || op == '^^' || op == '<<' || op == '>>' || op == '^')
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
		var lopts = opts;
		if (expr.operator == 'or' && (expr.left.type == 'Identifier' || expr.left.type == 'MemberExpression') && sub(expr.left.range) == opts.assignedTo) {
			lopts = Object.assign({ quiet:true }, opts);
		}
		var t1 = checktype(expr.left, ctx, lopts) || '__unknown';
		var t2 = checktype(expr.right, ctx, opts) || '__unknown';

		var res = 'bool';
		if (!opts.in_if) {
			/*if (t1 != 'bool' && t1 != 'null' && t1 != '__unknown')
				res = t1;
			else*/
			if (expr.operator == 'and') {
				if (t2 != 'none' && t2 != 'null' && t2 != '__unknown')
					res = t2;
				else
					res = t1;
			} else if (expr.operator == 'or') {
				if ((t1 != 'bool' && t1 != 'null' && t1 != '__unknown') || t2 == '__unknown' || t2 == 'none' || t2 == 'null')
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
		if (op == '-' || op == '~') //todo: check operand type
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
		if (expr.fields.length == 1 && expr.fields[0] && expr.fields[0].type == 'TableValue' && expr.fields[0].value && expr.fields[0].value.type == 'VarargLiteral') {
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
				fault(f.loc.start.line, 'unhandled table field type', f);

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
		var tuple = [];
		for (var c = ctx; c; c = c.parent) {
			if (c.types['...']) {
				tuple = c.types['...'];
				break;
			}
		}
		return { _type:'tuple', _tuple:tuple };
	} else {
		fault(expr.loc.start.line, 'unhandled expression type', expr);
		return '__unknown';
	}

	fault(expr.loc.start.line, 'fell through in expression handler', expr);
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

		if (t && t._type == '__dhack') {
			return 'dfhack';
		}

		if (t && t._type == '__df') {
			return 'df';
		}

		if (t && t._type == '__global') {
			return 'df.global';
		}

		return expr.name;
	}

	if (expr.type == 'CallExpression') {
		return '__unknown';
	}

	if (expr.indexer == ':') {
		var t = checktype(expr.base, ctx) || '__unknown';
		if (t == '__unknown') {
			err(expr.loc.start.line, 'type of expression is unknown', chalk.bold(sub(expr.range)));
		}

		if (typeof(t._type || t) != 'string') {
			fault(expr.loc.start.line, 'invalid method receiver type', t);
		}

		return (t._type || t) + '.' + expr.identifier.name;
	}

	if (expr.type == 'MemberExpression')
		return flatten(expr.base, ctx) + expr.indexer + expr.identifier.name;

	if (expr.type == 'IndexExpression')
		return flatten(expr.base, ctx) + '[' + flatten(expr.index, ctx) + ']';

	return sub(expr.range);
}

function getArgTypes(args, ctx, opts) {
	opts = opts || {};
	var argTypes = [];

	function addArg(t) {
		if (!t || !t._type) {
			argTypes.push(t || '__unknown');
		} else if (t._type == 'tuple') {
			t._tuple.forEach(addArg);
		} else {
			argTypes.push(t);
		}
	}

	ensureArray(args).forEach(function(a, i) {
		var checkopts = {};
		if (opts.defclass && i == 0) {
			checkopts.quiet = true;
		}
		addArg(checktype(a, ctx, checkopts));
	});

	return argTypes;
}

function fntype(call, ctx, opts) {
	opts = opts || {};

	if (call.type == 'TableCallExpression') {
		call.type = 'CallExpression';
		call.arguments = [ call.arguments ];
	}
	if (!call.arguments && call.argument)
		call.arguments = [ call.argument ];

	var argTypes = getArgTypes(call.arguments, ctx, {
		defclass: call.base.name == 'defclass'
	});

	var isUtils = srcstack[srcstack.length - 1].fn.slice(-10) == '/utils.lua';

	var fnname = null;
	var fn = null;
	if (call.base.type == 'Identifier') {
		fnname = call.base.name;
	} else if (call.base.type == 'MemberExpression') {
		if (call.base.base.type == 'CallExpression') {
			var base = fntype(call.base.base, ctx);
			if (base && (base._type == '__context' || base._module)) {
				fn = findfn(call.base.identifier.name, base._module || base, call.loc.start.line);
			} else if (base && base._defclass) {
				fn = findfn(base._type + '.' + call.base.identifier.name, base._defclass, call.loc.start.line);
			}
		} else {
			var base = checktype(call.base.base, ctx);
			if (base && base._defclass && call.base.indexer == ':' && (call.base.identifier.name == 'invoke_before' || call.base.identifier.name == 'invoke_after') && call.arguments[0] && call.arguments[0].type == 'StringLiteral') {
				for (var p = base._super; p; p = p._super) {
					if (!p._methods || !p._methods[call.arguments[0].value]) {
						break;
					}

					fntype({
						type: 'CallExpression',
						base: {
							type: 'MemberExpression',
							indexer: ':',
							base: {
								type: 'Identifier',
								name: p._type,
								loc: call.base.base.loc
							},
							identifier: call.base.identifier,
							loc: call.base.loc
						},
						arguments: call.arguments.slice(1),
						loc: call.loc,
						range: call.range
					}, ctx);
				}
				return 'none';
			}
			if (base && base._defclass && call.base.indexer == ':' && call.base.identifier.name != 'init') {
				fn = findfn(base._type + '.' + call.base.identifier.name, base._defclass, call.loc.start.line);
				if (base._sub) {
					base._sub.forEach(function(sub) {
						sub = expandtype(sub, base._defclass, call.loc.start.line, true) || '__unknown';
						if (!sub._super || (sub._super._type||sub._super) != base._type)
							return;
						// double-wrap so fntype doesn't overwrite the argument types.
						var ctx2 = {
							_type: '__context',
							types: {},
							parent: {
								_type: '__context',
								types: { '...':argTypes },
								parent: sub._defclass
							}
						};
						fntype({
							type: 'CallExpression',
							base: {
								type: 'MemberExpression',
								indexer: ':',
								base: {
									type: 'Identifier',
									name: sub._type,
									loc: call.base.base.loc,
									range: sub._type
								},
								identifier: call.base.identifier,
								loc: call.base.loc,
								range: sub._type + ':' + call.base.identifier.name
							},
							arguments: [{
								type: 'VarargLiteral',
								loc: call.loc,
								range: call.range
							}],
							loc: call.loc,
							range: call.range
						}, ctx2);
					});
				}
			}
			if (base && base._enum && call.base.identifier.name == 'next_item' && argTypes.length == 1 && argTypes[0] && argTypes[0]._type == base._type) {
				return base;
			}
		}
		fnname = flatten(call.base, ctx);
	} else if (call.base.type == 'IndexExpression') {
		var baset = checktype(call.base.base, ctx);
		if (baset == '__unknown') {
			err(call.loc.start.line, 'type of expression is unknown', chalk.bold(sub(call.base.base.range)));
			return '__unknown';
		}

		var t = checktype(call.base, ctx);
		if (t) {
			fn = t;
		} else {
			err(call.loc.start.line, 'unknown function', chalk.bold(sub(call.base.range)));
			return '__unknown';
		}
	} else if (call.base.type == 'FunctionDeclaration') {
		fn = checktype(call.base, ctx);
	} else {
		fault(call.loc.start.line, 'skipping function call', chalk.bold(sub(call.base.range)), call.base.type);
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

	if (fnname.match('\\.sizeof$'))
		return { _type:'tuple', _tuple:['number', 'number'] };

	if (fnname.match('\\._field$')) //TODO: check that the field exists
		return { _type:'field' };

	//TODO: check that assignment is correct somehow ?
	if (fnname.match('\\.assign$'))
		return 'none';

	if (fnname == 'df.new' && call.arguments[0] && call.arguments[0].type == 'StringLiteral' && call.arguments.length == 1) {
		var t = call.arguments[0].value;
		if (['int8_t', 'uint8_t', 'int16_t', 'uint16_t', 'int32_t', 'uint32_t', 'int64_t', 'uint64_t', 'float', 'intptr_t', 'uintptr_t', 'long'].indexOf(t) != -1) {
			return { _type:'std::' + t, value:'number' };
		}
		if (t == 'string') {
			return { _type:'std::string', value:'string' };
		}
		return expandtype(t, ctx, expr.loc.start.line);
	} else if (fnname == 'df.new' && argTypes[0] == 'string' && argTypes[1] == 'number') {
		return { _type:'number[]', _array:'number' };
	}

	if (fnname == 'dfhack.random.new') {
		return expandtype('__dfhack_random', ctx);
	}

	if (fnname == 'coroutine.create') {
		checktype({
			type: 'CallExpression',
			base: call.arguments[0],
			arguments: [],
			loc: call.loc,
			range: call.range
		}, ctx);
		return 'coroutine';
	}

	if (fnname == 'dfhack.timeout') {
		checktype({
			type: 'CallExpression',
			base: call.arguments[2],
			arguments: [],
			loc: call.loc,
			range: call.range
		}, ctx);
		return 'number';
	}

	if (fnname == 'dfhack.with_finalize' || fnname == 'dfhack.with_onerror') {
		var t = checktype({
			type: 'CallExpression',
			base: call.arguments[1],
			arguments: call.arguments.slice(2),
			loc: call.loc,
			range: call.range
		}, ctx);
		checktype({
			type: 'CallExpression',
			base: call.arguments[0],
			arguments: [],
			loc: call.arguments[0].loc,
			range: call.arguments[0].range
		}, ctx);
		return t;
	}

	if (fnname == 'dfhack.call_with_finalizer' && call.arguments[0] && call.arguments[0].type == 'NumericLiteral') {
		var errArgs = call.arguments[0].value;
		var t = checktype({
			type: 'CallExpression',
			base: call.arguments[3 + errArgs],
			arguments: call.arguments.slice(4 + errArgs),
			loc: call.loc,
			range: call.range
		}, ctx);
		checktype({
			type: 'CallExpression',
			base: call.arguments[2],
			arguments: call.arguments.slice(3, errArgs),
			loc: call.arguments[2].loc,
			range: call.arguments[2].range
		}, ctx);
		return t;
	}

	if (fnname.match('^df\\..*\\.new$')) 
		return expandtype(fnname.slice(0, -4), ctx, call.loc.start.line);

	if (fnname.match('^df.*\\.is_instance$')) 
		return 'bool';

	if (fnname == 'defclass') {
		if (argTypes[0] && argTypes[0] != '__unknown')
			return argTypes[0];

		var pt = argTypes[1] && argTypes[1] != 'null' ? argTypes[1] : '__defclass_base';

		var t = {
			_defclass: ctx,
			_type: flatten(call.arguments[0], ctx),
			_super: pt
		};
		if (pt != '__defclass_base') {
			t.super = pt;
		}

		var ctx1 = { _type:'__context', types:{}, parent:ctx };

		if (call.arguments[0].type == 'Identifier') {
			ctx1.types[call.arguments[0].name] = t;
		}

		t.ATTRS = {
			_defclass_ATTRS: t,
			_type: t._type + '.ATTRS',
			_super: pt.ATTRS || ((pt._type || pt) + '.ATTRS')
		};

		var cs = srcstack[srcstack.length-1].comments;
		if (cs) {
			for (var j = 0; j < cs.length; j++) {
				var c = cs[j];

				if (c.loc.start.line == call.loc.start.line-1 && c.value.substr(0,9) == 'luacheck:') {
					var extrafields = c.value.match(/defclass=([^\s]*)/);
					if (extrafields) {
						var fields = null;
						try {
							fields = jsonic(extrafields[1]);
						} catch (e) {
							err(c.loc.start.line, 'can not parse type definition', chalk.bold(extrafields[1]), e);
						}
						Object.entries(fields).forEach(function(f) {
							var ft = expandtype(f[1], ctx1, call.loc.start.line);
							if (ft._array) {
								ft._array = expandtype(ft._array, ctx1, call.loc.start.line);
							}
							t[f[0]] = ft;
							t.ATTRS[f[0]] = ft;
						});
					}
					break;
				}
			}
		}

		if (pt._type) {
			pt._sub = pt._sub || [];
			pt._sub.push(t);
			for (var p = pt; p && p._type; p = p._super && expandtype(p._super, p._defclass || ctx, call.loc.start.line, true)) {
				p._sub = p._sub || [];
				p._sub.push(t);
			}
		}

		if (pt.ATTRS && pt.ATTRS._type) {
			pt.ATTRS._sub = pt.ATTRS._sub || [];
			pt.ATTRS._sub.push(t.ATTRS);
			for (var p = pt; p && p.ATTRS && p.ATTRS._type; p = p._super && expandtype(p._super, p._defclass || ctx, call.loc.start.line, true)) {
				p.ATTRS._sub = p.ATTRS._sub || [];
				p.ATTRS._sub.push(t.ATTRS);
			}
		}

		return t;
	}

	if (fnname == 'table.insert') {
		var k = (call.arguments.length == 3 ? 2 : 1);
		var kt = (call.arguments.length == 3 ? argTypes[1] : 'number');
		var t = argTypes[0] || '__unknown';
		var rt = argTypes[k] || '__unknown';

		if (rt == '__unknown')
			err(call.loc.start.line, 'type of expression is unknown', chalk.bold(sub(call.arguments[k].range)));

		if (t == '__unknown')
			err(call.loc.start.line, 'type of expression is unknown', chalk.bold(sub(call.arguments[0].range)));
		else {
			if (t._type == 'table' || t._array || t._type == '__arg') {
				var at = arrayType(t, ctx, call.loc.start.line, kt);
				if (at && at._type != rt._type && at._sub && rt._super) {
					for (var p = rt; p; p = p._super && expandtype(p._super, ctx, call.loc.start.line, true)) {
						if (p._type == at._type) {
							at = rt;
							break;
						}
					}
				}
				if ((at._type||at) == '__arg' && (rt._type||rt) == 'string') {
					at = 'string';
				}
				if (at && at != '__unknown' && (at._type||at) != (rt._type||rt)) {
					warn(call.loc.start.line, 'inserting', chalk.bold(rt._type||rt), 'into an array of', chalk.bold(at._type || at));
				}
			} else
				err(call.loc.start.line, 'type of table.insert argument is not a table', chalk.bold(sub(call.arguments[0].range)));
		}

		return 'none';
	}

	if (fnname == 'table.pack' && call.arguments.length == 1 && call.arguments[0].type == 'VarargLiteral') {
		return { _type: 'string[]', _array: 'string' };
	}

	if (fnname == 'utils.insert_sorted' || (isUtils && fnname == 'insert_sorted')) {
		var vt = argTypes[0];
		var it = argTypes[1];
		var pt = call.arguments[2] && call.arguments[2].type == 'StringLiteral' ? expandtype(it[call.arguments[2].value], ctx, call.loc.start.line) : it;

		return { _type:'tuple', _tuple:['bool', it, pt] };
	}

	if (fnname == 'utils.invert' || (isUtils && fnname == 'invert')) {
		if (!call.arguments[0] || call.arguments[0].type != 'TableConstructorExpression') {
			err(call.loc.start.line, 'unable to parse utils.invert call', chalk.bold(sub(call.range)));
			return '__unknown';
		}
		var inverted = {
			type: 'TableConstructorExpression',
			fields: call.arguments[0].fields.map(function(f, i) {
				return { type: 'TableKeyString', key: { type: 'Identifier', name: f.value.value }, value: { type: 'NumericLiteral', value: i } };
			})
		};
		return checktype(inverted, ctx) || '__unknown';
	}

	if (fnname == 'printall' || fnname == 'printall_ipairs') {
		return 'none';
	}

	if (fnname == 'copyall') {
		return argTypes[0] && argTypes[0]._type ? Object.assign({}, argTypes[0], { _type:'table' }) : '__unknown';
	}
	if (fnname == 'utils.clone' || fnname == 'utils.assign' || (isUtils && fnname == 'clone') || (isUtils && fnname == 'assign') || fnname == 'mkinstance') {
		return argTypes[0] || '__unknown';
	}

	if (fnname == 'utils.processArgs' || (isUtils && fnname == 'processArgs')) {
		var t = argTypes[1];
		if (!t || t._type != 'table')
			return '__unknown';

		var rt = { _type:'table' };
		Object.keys(t).forEach(function(k) {
			if (k != '_type') {
				rt[k] = '__arg';
			}
		});
		return rt;
	}

	if (fnname.match('\\[\\]\\.(insert|resize|erase)$'))
		return 'none';

	if (fnname == 'df.reinterpret_cast') {
		return argTypes[0] == 'string' ? { _type:'number[]', _array:'number' } : argTypes[0];
	}

	if (fnname == 'mkmodule') {
		var m = modules[call.arguments[0].value];
		if (!m) {
			m = modules[call.arguments[0].value] = { _type:'table', _module:ctx };
			if (call.arguments[0].value == 'plugins.eventful') {
				ctx.functions = ctx.functions || {};
				ctx.functions['enableEvent'] = 'none';

				m.onWorkshopFillSidebarMenu = { _type:'__EventHolder', _inp:'df.building_actual,bool' };
				m.postWorkshopFillSidebarMenu = { _type:'__EventHolder', _inp:'df.building_actual' };
				m.onReactionCompleting = { _type:'__EventHolder', _inp:'df.reaction,df.reaction_product_itemst,df.unit,df.item[],df.reaction_reagent[],df.item[],bool' };
				m.onReactionComplete = { _type:'__EventHolder', _inp:'df.reaction,df.reaction_product_itemst,df.unit,df.item[],df.reaction_reagent[],df.item[]' };
				m.onItemContaminateWound = { _type:'__EventHolder', _inp:'df.item_actual,df.unit,df.unit_wound,number,number' };
				m.onProjItemCheckImpact = { _type:'__EventHolder', _inp:'df.proj_itemst,bool' };
				m.onProjItemCheckMovement = { _type:'__EventHolder', _inp:'df.proj_itemst' };
				m.onProjUnitCheckImpact = { _type:'__EventHolder', _inp:'df.projunitst_,bool' };
				m.onProjUnitCheckMovement = { _type:'__EventHolder', _inp:'df.proj_unitst' };
				m.onBuildingCreatedDestroyed = { _type:'__EventHolder', _inp:'number' };
				m.onJobInitiated = { _type:'__EventHolder', _inp:'df.job' };
				m.onJobCompleted = { _type:'__EventHolder', _inp:'df.job' };
				m.onUnitDeath = { _type:'__EventHolder', _inp:'number' };
				m.onItemCreated = { _type:'__EventHolder', _inp:'number' };
				m.onConstructionCreatedDestroyed = { _type:'__EventHolder', _inp:'df.construction' };
				m.onSyndrome = { _type:'__EventHolder', _inp:'number,number' };
				m.onInvasion = { _type:'__EventHolder', _inp:'number' };
				m.onInventoryChange = { _type:'__EventHolder', _inp:'number,number,df.unit_inventory_item,df.unit_inventory_item' };
				m.onReport = { _type:'__EventHolder', _inp:'number' };
				m.onUnitAttack = { _type:'__EventHolder', _inp:'number,number,number' };
				m.onUnload = { _type:'__EventHolder', _inp:'none' };
				m.onInteraction = { _type:'__EventHolder', _inp:'string,string,number,number,number,number' };
			} else if (call.arguments[0].value == 'plugins.rendermax') {
				ctx.functions = ctx.functions || {};
				ctx.functions.isEnabled = 'bool';
				ctx.functions.lockGrids = 'none';
				ctx.functions.unlockGrids = 'none';
				ctx.functions.resetGrids = 'none';
				var rgb = { _type:'table', r:'number', g:'number', b:'number' };
				ctx.functions.getCell = { _type:'table', fm:rgb, fo:rgb, bm:rgb, bo:rgb };
				ctx.functions.setCell = 'none';
				ctx.functions.getGridsSize = { _type:'tuple', _tuple:['number', 'number'] };
				ctx.functions.invalidate = 'none';
			}
		}
		return m;
	}

	if (fnname == 'loadfile') {
		return { _type:'tuple', _tuple:[{_type:'function'}, 'number'] };
	}

	if (fnname == 'reqscript' || fnname == 'dfhack.run_script_with_env' || fnname == 'dfhack.script_environment') {
		var arg = call.arguments[fnname == 'dfhack.run_script_with_env' ? 1 : 0];
		if (!arg || !arg.value) {
			return '__unknown';
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
		ctxstack.push(ctx2);
		srcstack.push({src:src, fn:fn, comments:ast.comments});
		linestack.push(call.loc.start.line);
		var type = processAST(ast.body, ctx2);
		linestack.pop();
		srcstack.pop();
		ctxstack.pop();
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
				return '__unknown';
			}
			
			var ctx2 = { _type:'__context', types:{}, parent:ctx };
			var ast = luaparser.parse(src, { comments:true, locations:true, ranges:true });
			ctxstack.push(ctx == rootctx ? rootctx : ctx2);
			srcstack.push({src:src, fn:fn, comments:ast.comments});
			linestack.push(call.loc.start.line);
			var type = processAST(ast.body, ctx2);
			linestack.pop();
			srcstack.pop();
			ctxstack.pop();
			return type || ctx2;
		} else {
			if (call.arguments[0].value == 'remote.MessagePack')
				return rootctx.types.MessagePack;
			if (call.arguments[0].value == 'remote.JSON')
				return rootctx.types.JSON;
			if (call.arguments[0].value == 'dumper')
				return rootctx.types.__dumper;
		}
		
		return '__unknown';
	}

	if (fnname == 'curry' || fnname == 'dfhack.curry') {
		return {
			_type: 'function',
			_node: {
				_curry: call.arguments[0],
				_args: argTypes.slice(1),
				_ctx: ctx
			},
			_ctx: ctx
		};
	}

	if (fnname == 'dfhack.gui.getViewscreenByType' && argTypes[0]) {
		for (var p = argTypes[0]; p && p._type; p = p._super && expandtype(p._super, ctx, call.loc.start.line, true)) {
			if (p._type == 'df.viewscreen') {
				return argTypes[0];
			}
		}
	}

	// console.log(fnname, call.arguments);
	// call.arguments.forEach(function(a) {
	//	console.log(checktype(a, ctx));
	// });

	if (fnname == 'safecall' || fnname == 'dfhack.safecall' || fnname == 'pcall') {
		var q = fntype({
			base: call.arguments[0],
			arguments: call.arguments.slice(1),
			loc: call.loc,
			range: call.range
		}, ctx, { safe:true });

		return { _type:'tuple', _tuple:['bool', q] };
	}

	if (fnname == 'select') {
		if (call.arguments[0] && call.arguments[0].type == 'StringLiteral' && call.arguments[0].value == '#') {
			return 'number';
		}
		if (argTypes.length <= 1) {
			return '__unknown';
		}
		if (call.arguments[0].type == 'NumericLiteral') {
			return argTypes[call.arguments[0].value] || '__unknown';
		}
		if (argTypes.slice(2).every(function (a) {
			return (argTypes[1]._type||argTypes[1]) == (a._type||a);
		})) {
			return argTypes[1]._type||argTypes[1];
		}
		return '__unknown';
	}

	if (fnname == 'assert') {
		return argTypes[0];
	}

	fn = findfn(fnname, ctx, call.loc.start.line);
	}
	if (!fn && call.base.type == 'MemberExpression') {
		fn = checktype(call.base, ctx);
		if (fn && fn._type != 'function') {
			fn = null;
		}
	}
	if (!fn) {
		if (!opts.safe) {
			fault(call.loc.start.line, 'unknown function', chalk.bold(fnname));
		}
		return '__unknown';
	}

	if (fn._defclass) {
		var ctx2 = {
			_type: '__context',
			types: {
				'...': argTypes
			},
			parent: {
				_type: '__context',
				types: {},
				parent: fn._defclass
			}
		};
		fntype({
			base: {
				type: 'MemberExpression',
				indexer: ':',
				base: {
					type: 'Identifier',
					name: fn._type,
					loc: call.base.loc,
					range: call.base.range
				},
				identifier: {
					type: 'Identifier',
					name: 'init',
					loc: call.base.loc,
					range: 'init'
				},
				loc: call.base.loc,
				range: call.base.range
			},
			arguments: [{
				type: 'VarargLiteral',
				loc: call.loc,
				range: call.range
			}],
			loc: call.loc,
			range: call.range
		}, ctx2);
		return fn;
	}

	if (fn && fn._defclass_ATTRS) {
		Object.keys(argTypes[0]).forEach(function(k) {
			if (k == '_type' || k == '_array') {
				return;
			}
			if (argTypes[0][k] != 'none' && argTypes[0][k] != 'null' && argTypes[0][k] != '__unknown') {
				fn._defclass_ATTRS[k] = argTypes[0][k];
				fn._defclass_ATTRS.ATTRS[k] = argTypes[0][k];
			}
		});
		return 'none';
	}

	if (fn._type && fn._type != 'function')
		return fn;

	if (fn._skip) {
		return fn._out;
	}

	var ctx1 = ctx;
	while (fn._node && fn._node._node) {
		// TODO: figure out why this is happening
		fn = fn._node;
	}
	if (fn._type == 'function') {
		if (!fn._node) {
			if (!fn._anyfunc) {
				err(call.loc.start.line, 'missing function', chalk.bold(fnname));
			}
			return '__unknown';
		}
		ctx1 = fn._ctx;
		fn = fn._node;

		if (typeof fn == 'string') {
			return expandtype(fn, ctx1 || ctx, call.loc.start.line);
		}

		if (fn._curry) {
			var ctx2 = { _type:'__context', types:{}, parent:ctx1 };
			var args = [];
			for (var i = 0; i < fn._args.length; i++) {
				ctx2.types['curry$' + i] = fn._args[i];
				args.push({
					type: 'Identifier',
					name: 'curry$' + i,
					loc: {start: {line: 0}},
					range: [0, 0]
				});
			}

			return fntype({
				type: 'CallExpression',
				base: fn._curry,
				arguments: args.concat(call.arguments),
				loc: call.loc,
				range: call.range
			}, ctx1);
		}
	}

	if (typeof fn == 'string') {
		return expandtype(fn, ctx, call.loc.start.line);
	}

	if (fn._type && fn._type != 'function')
		return fn;
	fn = fn._node || fn;

	var des = [ fnname ];
	var save = true;

	var ctx2 = { _type: '__context', types:{}, parent:ctx1 };
	var memberOf = fn && fn.identifier && fn.identifier.type == 'MemberExpression' && expandtype(flatten(fn.identifier.base, ctx1), ctx1, call.loc.start.line);
	if (memberOf && call.base.type == 'MemberExpression' && call.base.indexer == '.') {
		if (fn.identifier.indexer == ':') {
			ctx2.types.self = argTypes.shift();
		}
	} else if (memberOf && memberOf._defclass) {
		ctx2.types.self = memberOf;
	}
	ctx2._args = call.arguments;
	ctx2._params = fn.parameters.map(function (p) {
		return p.name;
	});
	for (var k = 0; k < fn.parameters.length; k++) {
		if (argTypes.length > k) {
			var t = argTypes[k] || '__unknown';
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
	ctx2.types['...'] = argTypes.slice(fn.parameters.length);

	des = des.join('_');

	if (callers.indexOf(des) != -1)
		return '__recursive';

	if (checkedfns[des])
		return checkedfns[des];

	srcstack.push(fn._src);
	linestack.push(call.loc.start.line);
	callers.push(des);
	var q = processAST(fn.body, ctx2) || '__unknown';
	callers.pop();
	linestack.pop();
	srcstack.pop();

	if (fn._out) {
		q = fn._out;
	}

	if (q == '__unknown' && rootctx.functions[fnname]) {
		q = rootctx.functions[fnname];
	}

	if (save)
		checkedfns[des] = q;
	delete unchecked_global_fns[fnname];

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
	if (!ctx) {
		fault(body.loc.start.line, 'missing context');
		return;
	}

	var rettype = null;

	body.forEach(function(b) {
		if (b.type == 'FunctionDeclaration') {
			var c = b.isLocal ? ctx : ctxstack[ctxstack.length - 1];
			var n = flatten(b.identifier, ctx);
			var existing = expandtype(n, ctx, b.loc.start.line, true);
			c.functions = c.functions || {};
			c.functions[n] = b;
			c.functions[n]._src = srcstack[srcstack.length-1];
			c.functions[n]._ctx = ctx;
			c.types[n] = { _type:'function', _node:b, _ctx:ctx, _src:srcstack[srcstack.length-1] }
			var base = null;
			var member = null;
			if (b.identifier.type == 'MemberExpression') {
				base = checktype(b.identifier.base, ctx);
				member = b.identifier.identifier.name;
				if (base && base._type) {
					base._methods = base._methods || {};
					base._methods[member] = c.types[n];
				}
			}
			var ctypes = c.types;

			if (!b.isLocal && srcstack.length == 1) {
				unchecked_global_fns[n] = b.loc.start.line;
			}

			var found = false;
			if (base && base._defclass && member) {
				for (var p = base; p; p = p._super) {
					if (p._type == 'Screen' && (member == 'onShow' || member == 'onDismiss' || member == 'onDestroy' || member == 'onRender' || member == 'onIdle' || member == 'onHelp' || member == 'onGetSelectedUnit' || member == 'onGetSelectedItem' || member == 'onGetSelectedJob' || member == 'onGetSelectedBuilding')) {
						fnstocheck.push({name:n, node:ctypes[n], inp:[null,'none']});
						found = true;
					} else if (p._type == 'Screen' && (member == 'onResize')) {
						fnstocheck.push({name:n, node:ctypes[n], inp:[null,'number,number']});
						found = true;
					} else if (p._type == 'Screen' && (member == 'onInput')) {
						fnstocheck.push({name:n, node:ctypes[n], inp:[null,'__keyArray']});
						found = true;
					} else if (p._type == 'View' && (member == 'render')) {
						fnstocheck.push({name:n, node:ctypes[n], inp:[null,'__gui_Painter']});
						found = true;
					}
				}
			}
			if (existing && existing._anyfunc && existing._inp && !found) {
				fnstocheck.push({name:n, node:ctypes[n], inp:[null, existing._inp]});
				found = true;
			}
			var cs = srcstack[srcstack.length-1].comments;
			if (cs && !found) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];

					if (c.loc.start.line == b.loc.start.line-1 && c.value.substr(0,9) == 'luacheck:') {
						var inp = c.value.match(/in=([^\s]*)/);
						var outp = c.value.match(/out=([^\s]+)/);
						var skip = /\bskip\b/.test(c.value);

						if (outp) {
							ctypes[n]._out = expandtype(outp[1], ctx, b.loc.start.line);
						}

						if (skip) {
							ctypes[n]._skip = true;
							delete unchecked_global_fns[n];
						} else if (inp) {
							fnstocheck.push({name:n, node:ctypes[n], inp:inp});
						}

						found = true;

						break;
					}
				}
			}
			if (!found && !base && b.parameters.length == 0) {
				fnstocheck.push({name:n, node:ctypes[n], inp:[null,'none']});
				found = true;
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

				var tuple = t._type == 'tuple' ? t._tuple || [t] : [t];

				for (var k = 0; k < tuple.length; k++) {
					var tt = tuple[k] || '__unknown';
					if (tt == '__unknown') {
						if (b.init.length == 1 && tuple.length == 1 && as) {
							if (verbose > 1) {
								note(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[j].range)), 'will assume from comment', chalk.bold(as[0]));
							}
						} else {
							err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[j].range)));
						}
					}

					righttypes.push(tt);
				}
			}

			for (var j = 0; j < b.variables.length; j++) {
				var n = b.variables[j].name;
				if (righttypes.length > j) {
					var t = righttypes[j];

					//TODO: check that casting to correct subclass
					if (as && as.length > j) {
						t = expandtype(as[j], ctx, b.loc.start.line);
						if (t == '__unknown')
							err(b.loc.start.line, 'type in comment is unknown', chalk.bold(as[j]));
					}

					ctx.types[n] = t;
				} else {
					ctx.types[n] = 'null';
				}
			}
		}

		else if (b.type == 'AssignmentStatement') {
			var cs = srcstack[srcstack.length-1].comments;
			var as = null;
			var retype = false;
			if (cs) {
				for (var j = 0; j < cs.length; j++) {
					var c = cs[j];
					if (c.loc.start.line == b.loc.start.line && c.value.substr(0,3) == 'as:') {
						var m = c.value.match(/as:\s*([^\s]+)/);
						if (m)
							as = [ m[1] ]; //TODO:split is removed to support json, so annotated tuple assignment do not work now! m[1].split(',');

						break;
					} else if (c.loc.start.line == b.loc.start.line && c.value.substr(0,9) == 'luacheck:') {
						retype = /\bretype\b/.test(c.value);
						break;
					}
				}
			}

			if (b.variables[0].type == 'Identifier') {
				var n = b.variables[0].name;
				var t = checktype(b.init[0],ctx,{assignedTo:n});
				if (t && t._type == 'tuple') { // TODO: check other variables
					t = t._tuple[0];
				}

				if (n == 'DEFAULT_NIL' && isPreload) {
					t = 'null';
				}

				//TODO: check that casting to correct subclass
				//if (as && as.length > 0)
				//	t = expandtype(as[0], ctx, b.loc.start.line);

				if (t == '__unknown' && !as)
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[0].range)));

				else {
					// Since it may be a var not local to the current context,
					// we need to find closest one having this var and update its type
					var found = false;
					for (var c = ctx; c; c = c.parent) {
						if (c.types[n] && !(c.temps && c.temps[n])) {
							var lt = c.types[n];
							if (retype) {
								c.types[n] = t;
							} else if (lt && (lt._type||lt) == '__arg' && isargtype(t)) {
								// ok
							} else if (t && (t._type||t) == '__arg' && isargtype(lt)) {
								c.types[n] = '__arg';
							} else if (lt && t && lt._type != t._type && lt._sub && t._super) {
								var isSubclass = false;
								for (var p = t; p; p = p._super && expandtype(p._super, p._defclass || ctx, b.loc.start.line, true)) {
									if (p._type == lt._type) {
										isSubclass = true;
										break;
									}
								}
								if (!isSubclass) {
									err(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(t&&t._type||t), 'to', chalk.bold(b.variables[0].name), 'of type', chalk.bold(lt._type||lt));
								}
							} else if (lt != 'null' && (lt._type||lt) != (t._type||t) && t != '__unknown' && t != 'null' && lt._type != 'table' && (!lt._array || t._type != 'table' || Object.keys(t).length != 1)) {
								err(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(t&&t._type||t), 'to', chalk.bold(b.variables[0].name), 'of type', chalk.bold(lt._type||lt));
							} else if (!lt._type && t != 'null' && t != '__unknown') {
								c.types[n] = t;
							}
							found = true;
							break;
						}
					}

					if (!found) {
						// assume all-caps and defclass types are supposed to be global.
						var expectedGlobal = (n.toUpperCase() == n && n.toLowerCase() != n) || (t && n == t._type && t._defclass);
						if (!expectedGlobal) {
							// assume x = x or {} is a global.
							expectedGlobal = b.init[0].type == 'LogicalExpression' && b.init[0].operator == 'or' && b.init[0].left && b.init[0].left.type == 'Identifier' && b.init[0].left.name == n;
						}
						var cs = srcstack[srcstack.length-1].comments;
						if (cs && !expectedGlobal) {
							for (var j = 0; j < cs.length; j++) {
								var c = cs[j];
								
								if (c.loc.start.line == b.loc.start.line-1 && c.value.substr(0,9) == 'luacheck:') {
									if (/\bglobal\b/.test(c.value)) {
										expectedGlobal = true;
									}
									break;
								}
							}
						}
						if (n != '_') {
							if (!expectedGlobal) {
								warn(b.loc.start.line, 'assignment to global/unknown var', b.variables[0].name);
							}
							if (as && as.length > 0)
								ctxstack[ctxstack.length - 1].types[n] = expandtype(as[0], ctx, b.loc.start.line);
							else
								ctxstack[ctxstack.length - 1].types[n] = t;
						}
					}
				}

			} else if (b.variables[0].type == 'MemberExpression') {
				var lbase = checktype(b.variables[0].base, ctx) || '__unknown';
				var lt = checktype(b.variables[0], ctx, {assignLeft: true}) || '__unknown';
				var rt = checktype(b.init[0],ctx,{assignedTo:sub(b.variables[0].range)}) || '__unknown';

				if (lt == '__unknown' && (lbase._type == 'table' || lbase._defclass) && !lbase._array) {
					lt = lbase[b.variables[0].identifier.name] = rt;
				}

				if (lt == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.variables[0].range)));
				if (rt == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[0].range)));

				if (String(lt._type||lt).slice(-2) == '[]' && (lt._type||lt) == (rt._type||rt)) {
					// ok
				} else if (lt._anyfunc && rt._type == 'function') {
					if (lt._inp && rt._ctx && rt._node) {
						fnstocheck.push({name:flatten(b.variables[0], ctx), node:rt, inp:[null, lt._inp]});
					}
					ctxstack[ctxstack.length - 1].functions = ctxstack[ctxstack.length - 1].functions || {};
					ctxstack[ctxstack.length - 1].functions[flatten(b.variables[0], ctx)] = rt;
				} else if (lt._array && rt._type == 'table' && Object.keys(rt).length == 1) {
					// assigning empty table to an array field
				} else if ((lt._type||lt) == '__arg' && isargtype(rt)) {
					// ok
				} else if (rt && (rt._type||rt) == '__arg' && isargtype(lt) && lbase) {
					lbase[b.variables[0].identifier.name] = '__arg';
				} else if (srcstack[srcstack.length - 1].fn.slice(-10) == '/class.lua' && lt._type == 'function' && rt._type == 'function') {
					lbase[b.variables[0].identifier.name] = rt;
				} else if (lt._type && lt._type.slice(0, 3) == 'df.' && lt._type.slice(-2) != '[]' && rt._type == 'table') {
					note(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(rt._type||rt), 'to', chalk.bold(sub(b.variables[0].range)), 'of type', chalk.bold(lt._type||lt), 'but recursive table assignment is not yet supported by luacheck');
				} else if (lt._type && lt._type.slice(0, 3) == 'df.' && lt._type.slice(-2) == '[]' && rt._type == 'table' && rt['new'] == 'bool' && (Object.keys(rt).length == 2 || (rt._array == 'bool' && Object.keys(rt).length == 3))) {
					// ok
				} else if (lbase._defclass && b.variables[0].identifier.name == 'ATTRS' && rt._type == 'table') {
					Object.keys(rt).forEach(function(k) {
						if (k == '_type' || k == '_array') {
							return;
						}
						if (rt[k] != 'none' && rt[k] != 'null' && rt[k] != '__unknown') {
							lbase[k] = rt[k];
							lbase.ATTRS[k] = rt[k];
						}
					});
				} else if (lt != '__unknown' && rt != '__unknown' && lt != rt && rt != 'null') {
					var ok = false;
					if (lt._type == 'table' && rt._type == 'table') {
						ok = deepEqual(lt, rt, ctx, b.loc.start.line);
					}
					if (rt._type && lt._sub) {
						for (var j = 0; j < lt._sub.length; j++) {
							if (lt._sub[j] == rt._type) {
								ok = true;
								break;
							}
						}
					}
					if (!ok) {
						if (lt._enum && rt == 'number' && b.init[0].type == 'NumericLiteral' && lt._enum[b.init[0].value]) {
							warn(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(rt._type||rt), 'to', chalk.bold(sub(b.variables[0].range)), 'of type', chalk.bold(lt._type||lt), '(suggested: use ' + chalk.bold(lt._type + '.' + lt._enum[b.init[0].value]) + ')');
						} else if (lt._enum && rt == 'number' && b.init[0].type != 'NumericLiteral') {
							note(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(rt._type||rt), 'to', chalk.bold(sub(b.variables[0].range)), 'of type', chalk.bold(lt._type||lt));
						} else if (lt._type == 'table' && rt._type == 'table') {
							err(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', rt, 'to', chalk.bold(sub(b.variables[0].range)), 'of type', lt);
						} else {
							err(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(rt._type||rt), 'to', chalk.bold(sub(b.variables[0].range)), 'of type', chalk.bold(lt._type||lt));
						}
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
				fault(b.loc.start.line, 'unknown left side', b);
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

			if (b.iterators[0].type == 'TableCallExpression') {
				b.iterators[0].arguments = [b.iterators[0].arguments];
				b.iterators[0].type = 'CallExpression';
			}

			var ctx2 = { _type: '__context', parent:ctx, types:{} };

			if (b.iterators[0].type == 'CallExpression' && flatten(b.iterators[0].base, ctx) == 'io.lines') {
				ctx2.types[b.variables[0].name] = 'string';
				rettype = processAST(b.body, ctx2) || rettype;
			} else if (b.iterators[0].type == 'CallExpression' && flatten(b.iterators[0].base, ctx) == 'string.gmatch') {
				b.variables.forEach(function(v) {
					ctx2.types[v.name] = 'string';
				});
				rettype = processAST(b.body, ctx2) || rettype;
			} else if (b.iterators[0].type == 'CallExpression' &&
				(b.iterators[0].base.name == 'pairs' || b.iterators[0].base.name == 'ipairs' || b.iterators[0].base.name == 'ripairs' || b.iterators[0].base.name == 'ripairs_tbl')) {
				var t = checktype(b.iterators[0].arguments[0],ctx) || '__unknown';

				if (t == '__unknown') {
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.iterators[0].arguments[0].range)));
					t = { _array:'__unknown' };
				}

				if (t == '__arg') {
					t = { _array:'__arg' };
				}

				var at = arrayType(t, ctx, b.loc.start.line);
				if ((b.iterators[0].base.name != 'pairs' && !t._array) || ((!at || at == '__unknown') && !as)) {
					if (t._type == 'table' && Object.keys(t).length == 1) {
						warn(b.loc.start.line, 'cannot determine element type of empty table', chalk.bold(sub(b.iterators[0].arguments[0].range)), '(suggested: add an --as:foo[] annotation to the location this variable is declared)');
					} else {
						err(b.loc.start.line, 'not an array', chalk.bold(sub(b.iterators[0].arguments[0].range)), t);
					}
					t = { _array:'__unknown' };
					at = '__unknown';
				}

				if (as) {
					at = expandtype(as, ctx, b.loc.start.line);
					if (at == '__unknown')
						err(b.loc.start.line, 'type of expression is unknown', chalk.bold(as));

					t = { _array:at };
				}

				ctx2.types[b.variables[0].name] = (b.iterators[0].base.name == 'pairs' ? 'string' : 'number');
				if (b.variables[1])
					ctx2.types[b.variables[1].name] = at;
				rettype = processAST(b.body, ctx2) || rettype;
			} else if (b.iterators[0].type == 'CallExpression' && flatten(b.iterators[0].base, ctx) == 'utils.listpairs') {
				var t = checktype(b.iterators[0].arguments[0], ctx) || '__unknown';

				if (t == '__unknown' || t._item == '__unknown') {
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.iterators[0].arguments[0].range)));
					t = { item:'__unknown' };
				}

				ctx2.types[b.variables[0].name] = t;
				if (b.variables[1])
					ctx2.types[b.variables[1].name] = expandtype(t.item, ctx, b.loc.start.line) || '__unknown';
				rettype = processAST(b.body, ctx2) || rettype;
			} else {
				err(b.loc.start.line, 'unsupported for loop', sub(b.iterators[0].range), b.iterators[0].type);
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

			var foundTrueClause = false;
			b.clauses.forEach(function(clause) {
				if (foundTrueClause) {
					if (verbose > 1) {
						note(clause.loc.start.line, 'skipping if statement', chalk.bold(clause.condition ? sub(clause.condition.range) : 'else'), '(already found true case)');
					}
					return;
				}
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
						} else if (c.loc.start.line == clause.loc.start.line && c.value.substr(0,9) == 'luacheck:') {
							if (/\bskip\b/.test(c.value)) {
								return;
							}
						}
					}
				}
				if (clause.condition) {
					var ctx2 = { _type: '__context', parent:ctx, types:{} };
					ensureArray(as).forEach(function(a) {
						var a2 = a.split('=');
						ctx2.types[a2[0]] = expandtype(a2[1], ctx, clause.loc.start.line);
					});
					var t = checktype(clause.condition, ctx2, { in_if:true });
					// if (t == '__unknown')
					//	err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(clause.condition.range)));
					var alwaysFalse = function(condition) {
						if (condition.type == 'BinaryExpression' && condition.left.type == 'CallExpression' && condition.left.base.type == 'Identifier' && condition.left.base.name == 'type' && condition.right.type == 'StringLiteral') {
							var t1 = checktype(condition.left.arguments[0], ctx2) || '__unknown';
							t1 = t1._type || t1;
							if (String(t1).slice(-2) == '[]') {
								t1 = 'table';
							}
							if (t1 == 'string' || t1 == 'number' || t1 == 'null' || t1 == 'table' || t1 == 'function') {
								if (condition.operator == '==') {
									return t1 != condition.right.value;
								} else if (condition.operator == '~=') {
									return t1 == condition.right.value;
								}
							}
						} else if (condition.type == 'Identifier') {
							var t1 = checktype(condition, ctx2) || '__unknown';
							if (t1 == 'null')
								return true;
							return null;
						} else if (condition.type == 'UnaryExpression' && condition.operator == 'not') {
							var a = alwaysFalse(condition.argument);
							if (a === true || a === false)
								return !a;
							return null;
						} else if (condition.type == 'LogicalExpression' && condition.operator == 'or') {
							var left = alwaysFalse(condition.left);
							var right = alwaysFalse(condition.right);
							if (left === true && right === true)
								return true;
							if (left === false || right === false)
								return false;
							return null;
						} else if (condition.type == 'LogicalExpression' && condition.operator == 'and') {
							var left = alwaysFalse(condition.left);
							var right = alwaysFalse(condition.right);
							if (left === true || right === true)
								return true;
							if (left === false && right === false)
								return false;
							return null;
						} else if (condition.type == 'CallExpression' && condition.base.type == 'Identifier' && condition.base.name == 'has_field' && condition.arguments.length == 2 && condition.arguments[1].type == 'StringLiteral') {
							var t = checktype({
								type: 'MemberExpression',
								indexer: '.',
								base: condition.arguments[0],
								identifier: {
									type: 'Identifier',
									name: condition.arguments[1].value,
									loc: condition.arguments[1].loc,
									range: condition.arguments[1].range
								},
								loc: condition.loc,
								range: condition.range
							}, ctx, { quiet:true });
							if (t && t != '__unknown') {
								return false;
							}
							t = checktype(condition.arguments[0], ctx, { quiet:true });
							if (t && t._type && t._type.slice(0, 3) == 'df.') {
								return true;
							}
							return null;
						}
					};

					var af = alwaysFalse(clause.condition);
					if (af) {
						if (verbose > 1) {
							note(clause.loc.start.line, 'skipping if statement', chalk.bold(sub(clause.condition.range)), '(condition is always false)');
						}
						return;
					}

					if (af === false) {
						foundTrueClause = true;
					}
				}

				if (find_comment_dfver(clause)) {
					var ctx2 = { _type: '__context', parent:ctx, types:{} };
					ensureArray(as).forEach(function(a) {
						var a2 = a.split('=');
						ctx2.types[a2[0]] = expandtype(a2[1], ctx, clause.loc.start.line);
						ctx2.temps = ctx2.temps || {};
						ctx2.temps[a2[0]] = true;
					});
					rettype = processAST(clause.body, ctx2) || rettype;
				}
			});
		}

		else if (b.type == 'ReturnStatement') {
			if (b.arguments.length == 1) {
				var t = checktype(b.arguments[0], ctx);
				if (t && t != 'none' && t != '__unknown') {
					if (rettype && t == 'null') {
						// don't overwrite
					} else if (rettype && rettype._type == 'tuple') {
						rettype._tuple[0] = t;
					} else {
						rettype = t;
					}
				}
			} else if (b.arguments.length) {
				var existingTuple = rettype && rettype._type == 'tuple' ? rettype._tuple : [rettype];
				var newTuple = b.arguments.map(function(a, i) {
					var t = checktype(a, ctx);
					if (!t || t == 'none' || t == '__unknown') {
						return existingTuple[i] || 'null';
					}
					return t;
				});
				while (existingTuple.length > newTuple.length) {
					newTuple.push(existingTuple[newTuple.length]);
				}
				rettype = { _type:'tuple', _tuple:newTuple };
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
				//	err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.condition.range)));
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
				fault(b.loc.start.line, 'unexpected type for for statement left side', b.variable.type);
		}

		else
			fault(b.loc.start.line, 'unhandled statement type', b);

	});

	return rettype;
}

function sub(range)
{
	if (typeof range == 'string')
		return range;
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

function printstack() {
	if (!verbose) {
		return;
	}

	for (var i = srcstack.length - 2; i > 0; i--) {
		var fn = srcstack[i].fn.split('/').slice(-1)[0];
		var line = linestack[i] || '?';
		console.log(' -> ' + fn + ':' + line);
	}
}

function fault(line) {
	firstlog();
	var args = Array.prototype.slice.call(arguments);
	var fn = srcstack[srcstack.length-1].fn.split('/').slice(-1)[0];
	args.splice(0, 1, chalk.magenta('INTERNAL ERROR ' + fn + ':' + line));
	console.log.apply(null, args);
	verbose++;
	printstack();
	verbose--;
	console.log(new Error().stack.substring('Error:\n'.length));
	process.exitCode = 2;
}

function err(line) {
	firstlog();
	var args = Array.prototype.slice.call(arguments);
	var fn = srcstack[srcstack.length-1].fn.split('/').slice(-1)[0];
	args.splice(0, 1, chalk.red('ERROR ' + fn + ':' + line));
	console.log.apply(null, args);
	printstack();
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
	printstack();
	process.exitCode = 2;
}

function note(line) {
	if (nowarn)
		return;

	firstlog();
	var args = Array.prototype.slice.call(arguments);
	var fn = srcstack[srcstack.length-1].fn.split('/').slice(-1)[0];
	args.splice(0, 1, chalk.cyan('NOTE  ' + fn + ':' + line));
	console.log.apply(null, args);
	printstack();
}


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
		},
		loc: { start: { line: 0 } }
	}, rootctx);
});
isPreload = false;
processAST(ast.body, ctxstack[ctxstack.length - 1]);

fnstocheck.forEach(function(fn) {
	var b = fn.node._node;
	var ctx = fn.node._ctx;
	var inp = fn.inp;
	var argtypes = inp[1].split(',');

	var ctx2 = { _type: '__context', types:{}, parent:ctx };

	var memberOf = b.identifier && b.identifier.type == 'MemberExpression' && expandtype(flatten(b.identifier.base, ctx), ctx, b.loc.start.line, true);
	if (memberOf && memberOf._defclass) {
		ctx2.types.self = memberOf;
	}

	for (var k = 0; k < b.parameters.length; k++) {
		if (argtypes.length > k) {
			var t = expandtype(argtypes[k], ctx, b.loc.start.line) || '__unknown';
			if (t == '__unknown') {
				err(b.loc.start.line, 'unknown type ', chalk.bold(argtypes[k]), 'for argument', chalk.bold(k), 'of function', chalk.bold(flatten(b.identifier, ctx)));
			}
			ctx2.types[b.parameters[k].name] = t;
		} else {
			ctx2.types[b.parameters[k].name] = 'null';
		}
	}

	srcstack.push(b._src);
	linestack.push(0);
	processAST(b.body, ctx2);
	linestack.pop();
	srcstack.pop();

	delete unchecked_global_fns[fn.name];
});

Object.keys(unchecked_global_fns).forEach(function(f) {
	warn(unchecked_global_fns[f], 'unchecked global function', chalk.bold(f), '(suggested: add a comment --luacheck: in=input,argument,types out=outputtype on the line immediately before this function, delete the function, or add the local keyword before the function keyword)');
});
