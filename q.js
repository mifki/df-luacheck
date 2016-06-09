var fs = require('fs');
var bunyan = require('bunyan');
var luaparser = require('luaparse');
var parseXml = require('xml2js').parseString;

var src = fs.readFileSync('./units.lua').toString();

var ensureArray = function(a) {
	if (!a)
		return [];

	if (!(a instanceof Array))
		return [a];

	return a;
};


var log = bunyan.createLogger({name:'L'});

var rootctx = JSON.parse(fs.readFileSync('ctx.json'));

var ast = luaparser.parse(src, { comments:false, locations:true });
console.log(JSON.stringify(ast,null,2));
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
	//console.log('expanding ',name,ctx);
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
	// console.log('checking ',expr,ctx);

	if (expr.type == 'IndexExpression')
	{
		var t = checktype(expr.base, ctx);
		if (!t) {
			log.error('unknown type', expr.base, expr.loc.start.line);			
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
			log.error('unknown type', expr.base, expr.identifier.name, expr.loc.start.line);

			return '__unknown';
		}
		// console.log('will return ',baset,' for ',expr.identifier.name);
		var t = baset[expr.identifier.name];
		if (!t) {
			log.error('unknown member', expr.identifier.name, baset);
			return '__unknown';
		}
		return expandtype(t, ctx);
	}

	if (expr.type == 'Identifier') {
		return expandtype(expr.name, ctx);
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
		if (t1 == '__unknown')
			log.error('unknown type', expr.left, expr.loc.start.line);
		if (t2 == '__unknown')
			log.error('unknown type', expr.right, expr.loc.start.line);

		return 'bool';
	}

	if (expr.type == 'UnaryExpression') {
		var t1 = checktype(expr.argument, ctx);
		if (t1 == '__unknown')
			log.error('unknown type', expr.argument, expr.loc.start.line);

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
		log.error('function not found', fnname);
		return '__unknown';
	}

	if (typeof fn == 'string')
		return expandtype(fn, ctx);

	for (var k = 0; k < fn.parameters; k++) {
		var t = checktype(call.arguments[k]);
		ctx2[fn.parameters[k].name] = t;
	}

	return process(fn.body, ctx2)
}

function process(body, ctx) {
	var rettype = null;

	body.forEach(function(b) {
		// console.log(b.type);
		if (b.type == 'FunctionDeclaration') {
			ctx.functions = ctx.functions || {};
			ctx.functions[b.identifier.name] = b;

		}

		if (b.type == 'LocalStatement') {
			var n = b.variables[0].name;
			var t = checktype(b.init[0],ctx);
			if (t == '__unknown')
				log.error('unknown type', b.init[0], b.loc.start.line);
			ctx.types[n] = t;
			// console.log('types now',ctx.types);
		}

		if (b.type == 'AssignmentStatement') {
			var n = b.variables[0].name;
			var t = checktype(b.init[0],ctx);
			if (t == '__unknown')
				log.error('unknown type', b.init[0], b.loc.start.line);

			// Since it may be a var not local to the current context,
			// we need to find closest one having this var and update its type
			var found = false;
			for (var c = ctx; c; c = c.parent) {
				if (c.types[n]) {
					if (c.types[n] != 'null')
						log.warn('overwriting var with different type', b.variables[0].name, b.loc.start.line);
					c.types[n] = t;
					found = true;
					break;
				}
			}

			if (!found)
				log.warn('assignment to unknown var', b.variables[0].name, b.loc.start.line);
		}

		if (b.type == 'ForGenericStatement') {
			if (b.iterators[0].base.name == 'ipairs') {
				var ctx2 = { parent:ctx, types:{} };
				var t = checktype(b.iterators[0].arguments[0],ctx);
				console.log('$$$',b.iterators[0].arguments[0], t);
				if (t == '__unknown')
					log.error('skipping loop at line', b.loc.start.line);
				else
				{
					ctx2.types[b.variables[1].name] = expandtype(t._array, ctx);
					process(b.body, ctx2);
				}
			}
		}

		if (b.type == 'IfStatement') {
			//TODO: check condition
			var t = checktype(b.clauses[0].condition, ctx);
			if (t == '__unknown')
				log.error('unknown type', b.loc.start.line);
			var ctx2 = { parent:ctx, types:{} };			
			process(b.clauses[0].body, ctx2);
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

process(ast.body, rootctx);

//console.log(functions);
