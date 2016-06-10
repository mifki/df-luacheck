var fs = require('fs');
var luaparser = require('./luaparse');
var parseXml = require('xml2js').parseString;
var chalk = require('chalk');
var _process = require('process');

var src = fs.readFileSync(_process.argv[_process.argv.length-1]).toString();

var ensureArray = function(a) {
	if (!a)
		return [];

	if (!(a instanceof Array))
		return [a];

	return a;
};

var rootctx = JSON.parse(fs.readFileSync('ctx.json'));

var ast = luaparser.parse(src, { comments:false, locations:true, ranges:true });
//console.log(JSON.stringify(ast,null,2));
console.log('---------------------------');

function findtype(name, ctx) {
	if (ctx.types[name])
		return ctx.types[name];

	if (ctx.parent)
		return findtype(name, ctx.parent);
}

function findfn(name, ctx) {
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


function expandtype(name, ctx) {
	if (name == 'number' || name == 'string')
		return name;
	
	if (typeof name == 'string') {
		var a = name.split('.');
		var t = findtype(a[0], ctx);// ctx.types.a[0];
		for (var j = 1; j < a.length; j++)
			t = t[a[j]];
		return t;
	}

	return name;
}

function checktype(expr, ctx) {
	//console.log('checking ',expr,ctx);

	if (expr.type == 'IndexExpression')
	{
		var t = checktype(expr.base, ctx);
		if (t == '__unknown') {
			err(expr.loc.start.line, 'type of expression is unknown', chalk.bold(sub(expr.base.range)));
			return '__unknown';
		}
		var idxt = checktype(expr.index, ctx);
		// console.log('==',t);
		if (t._array)
			return expandtype(t._array, ctx);
	}

	if (expr.type == 'MemberExpression')
	{
		var baset = checktype(expr.base, ctx);

		if (baset == '__unknown') {
			var g = findguess(expr.identifier.name, ctx);
			if (g) {
				//console.log('will return guess',g);
				return expandtype(g, ctx);
			}
			err(expr.loc.start.line, 'type of expression is unknown', chalk.bold(sub([expr.base.range[0], expr.identifier.range[0]-1])));

			return '__unknown';
		}

		var t = baset[expr.identifier.name];
		if (!t) {
			if (baset._type == '__df')
				err(expr.loc.start.line, 'type', chalk.bold('df.'+expr.identifier.name), 'does not exist');
			else if (baset._type == '__global')
				err(expr.loc.start.line, 'global', chalk.bold(expr.identifier.name), 'does not exist');
			else if (baset._enum)
				err(expr.loc.start.line, 'value', chalk.bold(expr.identifier.name), 'does not exist in enum', chalk.bold(baset._type));
			else
				err(expr.loc.start.line, 'field', chalk.bold(expr.identifier.name), 'does not exist in', chalk.bold(sub([expr.base.range[0], expr.identifier.range[0]-1])), 'of type', chalk.bold(baset._type));
			return '__unknown';
		}

		return expandtype(t, ctx) || '__unknown';
	}

	if (expr.type == 'Identifier') {
		return expandtype(expr.name, ctx) || '__unknown';
	}

	if (expr.type == 'StringLiteral') {
		return 'string';
	}

	if (expr.type == 'BooleanLiteral') {
		return 'bool';
	}

	if (expr.type == 'NumericLiteral') {
		return 'number';
	}

	if (expr.type == 'NilLiteral') {
		return 'null';
	}

	if (expr.type == 'CallExpression') {
		return fntype(expr, ctx);
	}

	if (expr.type == 'BinaryExpression') {
		var t1 = checktype(expr.left, ctx);
		var t2 = checktype(expr.right, ctx);
		
		var res;
		var op = expr.operator;
		if (op == '..')
			res = 'string';
		else
			res = 'bool';
		
		if (t1 == '__unknown') 
			err(expr.loc.start.line, 'type of operand',chalk.bold(sub(expr.left.range)), 'is unknown, assuming the result is', chalk.bold(res));
		if (t2 == '__unknown')
			err(expr.loc.start.line, 'type of operand',chalk.bold(sub(expr.right.range)), 'is unknown, assuming the result is', chalk.bold(res));

		return res;
	}

	if (expr.type == 'LogicalExpression') {
		var t1 = checktype(expr.left, ctx);
		var t2 = checktype(expr.right, ctx);
		if (t1 == '__unknown') 
			err(expr.loc.start.line, 'type of operand',chalk.bold(sub(expr.left.range)), 'is unknown, assuming the result is', chalk.bold('bool'));
		if (t2 == '__unknown')
			err(expr.loc.start.line, 'type of operand',chalk.bold(sub(expr.right.range)), 'is unknown, assuming the result is', chalk.bold('bool'));

		return 'bool';
	}

	if (expr.type == 'UnaryExpression') {
		var t1 = checktype(expr.argument, ctx);
		if (t1 == '__unknown')
			err(expr.loc.start.line, 'type of expression',chalk.bold(sub(expr.argument.range)), 'is unknown, assuming the result is', chalk.bold('bool'));

		return 'bool';
	}

	if (expr.type == 'TableConstructorExpression') {
		return {};
	}

	return '__unknown';
}

function flatten(expr) {
	if (typeof expr == 'string')
		return expr;

	if (expr.type == 'Identifier')
		return expr.name;

	return flatten(expr.base) + '.' + expr.identifier.name;
}

function fntype(call, ctx) {
	var fnname = null;
	if (call.base.type == 'Identifier') {
		fnname = call.base.name;
	} else if (call.base.type == 'MemberExpression') {
		fnname = flatten(call.base);
	}

	var ctx2 = { types:{}, parent:ctx };
	var fn = findfn(fnname,ctx);
	if (!fn) {
		err(call.loc.start.line, 'unknown function', chalk.bold(fnname));
		return '__unknown';
	}

	if (typeof fn == 'string')
		return expandtype(fn, ctx);

	for (var k = 0; k < fn.parameters.length; k++) {
		var t = checktype(call.arguments[k]);
		ctx2.types[fn.parameters[k].name] = t;
	}

	return process(fn.body, ctx2)
}

function process(body, ctx) {
	var rettype = null;

	body.forEach(function(b) {
		if (b.type == 'FunctionDeclaration') {
			ctx.functions = ctx.functions || {};
			ctx.functions[b.identifier.name] = b;

		}

		if (b.type == 'LocalStatement') {
			var n = b.variables[0].name;
			if (b.init.length) {
				var t = checktype(b.init[0],ctx);
				if (t == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[0].range)));
				ctx.types[n] = t;
			} else 
				ctx.types[n] = 'null';
		}

		if (b.type == 'AssignmentStatement') {
			if (b.variables[0].type == 'Identifier') {
				var n = b.variables[0].name;
				var t = checktype(b.init[0],ctx);
				if (t == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[0].range)));
	
				else {
					// Since it may be a var not local to the current context,
					// we need to find closest one having this var and update its type
					var found = false;
					for (var c = ctx; c; c = c.parent) {
						if (c.types[n]) {
							if (c.types[n] != 'null' && c.types[n] != t && t != '__unknown')
								err(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(t._type||t), 'to', chalk.bold(b.variables[0].name), 'of type', chalk.bold(c.types[n]._type||c.types[n]));
							c.types[n] = t;
							found = true;
							break;
						}
					}
		
					if (!found) {
						err(b.loc.start.line, 'assignment to unknown var', b.variables[0].name);
					}
				}

			} else if (b.variables[0].type == 'MemberExpression') {
				var lt = checktype(b.variables[0], ctx)
				var rt = checktype(b.init[0],ctx);
				if (lt == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.variables[0].range)));
				if (rt == '__unknown')
					err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(b.init[0].range)));
				if (lt != '__unknown' && rt != '__unknown' && lt != rt)
					err(b.loc.start.line, 'assigning', chalk.bold(sub(b.init[0].range)), 'of type', chalk.bold(rt._type||rt), 'to', chalk.bold(sub(b.variables[0].range)), 'of type', chalk.bold(lt._type||lt));
				//console.log(, b.variables[0], t);
			
			} else
				throw new Error('unknown left side', b);
		}

		if (b.type == 'ForGenericStatement') {
			if (b.iterators[0].base.name == 'ipairs') {
				var ctx2 = { parent:ctx, types:{} };
				var t = checktype(b.iterators[0].arguments[0],ctx);
				// console.log('$$$',b.iterators[0].arguments[0], t);
				//if (t == '__unknown')
				//	err(b.loc.start.line, 'skipped loop');
				//else
				{
					ctx2.types[b.variables[1].name] = expandtype(t._array, ctx);
					process(b.body, ctx2);
				}
			}
		}

		if (b.type == 'IfStatement') {
			b.clauses.forEach(function(c) {
				if (c.condition) {
					var t = checktype(c.condition, ctx);
					if (t == '__unknown')
						err(b.loc.start.line, 'type of expression is unknown', chalk.bold(sub(c.condition.range)));
				}
	
				var ctx2 = { parent:ctx, types:{} };			
				process(c.body, ctx2);
			});
		}

		if (b.type == 'ReturnStatement') {
			rettype = checktype(b.arguments[0], ctx);
		}

		if (b.type == 'CallStatement') {
			checktype(b.expression, ctx);
		}

	});

	return rettype;
}

function sub(range)
{
	return src.substring(range[0], range[1]);
}

function err(line)
{
	var args = Array.prototype.slice.call(arguments);
	args.splice(0, 1, chalk.red(line+': ERROR'));
	console.log.apply(null, args);
}

process(ast.body, rootctx);

//console.log(functions);
