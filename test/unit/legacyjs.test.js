/*
 * static/legacyjs.js transpiles optional chaining (?.) and nullish coalescing (??) for old browsers (iOS 12),
 * buble (static/legacyjs-buble.js) does the rest. Every converted snippet must behave like the original.
 */
import assert from 'node:assert'
import vm from 'node:vm'
import fs from 'node:fs'
import path from 'node:path'

const staticDir = path.join(process.cwd(), 'static')

const load = (lacksBasicEs6) => {
    const ctx = {_app_: {lacksOptionalChaining: true, lacksBasicEs6}, console: {log() {}}, location: {href: ''}}
    ctx.window = ctx
    ctx.self = ctx
    vm.createContext(ctx)
    // like in the browser: buble is a global, only loaded for browsers without basic ES6
    if (lacksBasicEs6) vm.runInContext(fs.readFileSync(path.join(staticDir, 'legacyjs-buble.js'), 'utf8'), ctx)
    vm.runInContext(fs.readFileSync(path.join(staticDir, 'legacyjs.js'), 'utf8'), ctx)
    return ctx._app_
}

const evaluate = (code, scope) => new Function('scope', code + '\n;return typeof __r==="undefined"?undefined:__r')(scope)

describe('legacyjs', () => {
    const oc = load(false)
    const withBuble = load(true)

    // converted code must give the same result as the original and must not contain optional chaining any more
    const same = (code, scope, app = oc) => {
        const out = app.toLegacyJs(code)
        assert.deepStrictEqual(evaluate(out, scope), evaluate(code, scope), code + '\n=>\n' + out)
        return out
    }

    it('removes numeric separators without buble (iOS 12 bug on system/llm)', () => {
        // no ?. in the code: separators alone must trigger the conversion
        const out = oc.toLegacyJs('var __r = (scope.w * scope.h) / 1_000_000; var s = "1_0"')
        assert.ok(!/\d_\d/.test(out.replace('"1_0"', '')))
        assert.strictEqual(evaluate(out, {w: 2000, h: 1000}), 2)
        same('var __r = scope?.n / 1_000', {n: 5000})
    })

    it('leaves code alone which needs no conversion', () => {
        assert.strictEqual(oc.toLegacyJs('var a = 1'), 'var a = 1')
        assert.strictEqual(oc.toLegacyJs(''), '')
        assert.strictEqual(oc.toLegacyJs(undefined), undefined)
    })

    it('optional chaining with nested brackets in the arguments (iOS 12 bug on /account)', () => {
        const code = "var __r = scope?.user?.userData?.group?.some(g=>['687a9189b29524eb5f1f139c','688b75a76454a2ab4379e489'].indexOf(g._id)>=0)"
        same(code, {user: {userData: {group: [{_id: '687a9189b29524eb5f1f139c'}]}}})
        same(code, {user: {userData: {group: [{_id: 'x'}]}}})
        same(code, {user: {userData: null}})
        same(code, {})
        assert.ok(!/\?\./.test(oc.toLegacyJs(code)))
    })

    it('index access, calls and this binding', () => {
        same('var __r = scope?.a?.[1+1]?.b', {a: [0, 0, {b: 5}]})
        same('var __r = scope?.a?.[1+1]?.b', null)
        same('var __r = scope.fn?.(1,2)', {fn: (a, b) => a + b})
        same('var __r = scope.fn?.(1,2)', {})
        same('var __r = scope.o.m?.(3)', {o: {v: 10, m(x) { return this.v + x }}})
        same('var __r = scope.o?.m?.(3)', {o: {v: 10, m(x) { return this.v + x }}})
        same('var __r = scope.o?.m?.(3)', {o: {v: 10}})
        same('var __r = new Date(scope?.t).getTime?.()', {t: 1000})
        same('var __r = scope[scope?.k]?.x', {k: 'q', q: {x: 4}})
    })

    it('ignores strings, template text, regex and comments', () => {
        same("var __r = scope?.a?.b(')', \"?.x\", `${scope?.k}?.`)", {a: {b() { return [].slice.call(arguments) }}, k: 7})
        same("var r=/a?.b/.test('ab'); var __r = r && scope?.a", {a: 2})
        same('var __r = scope?.a // trailing ?. comment', {a: 1})
        same("var x = scope?.a ? 1 : 2; var __r = x + (scope?.b ?.5:1)", {a: 1})
    })

    it('chains over several lines, nested chains, callbacks', () => {
        same('var __r = scope\n  ?.a\n  ?.b', {a: {b: 3}})
        same('var __r = scope?.list?.map(function(i){return i?.v}).join("-")', {list: [{v: 1}, null, {v: 3}]})
        same('var __r = scope?.a?.b?.(x=>x?.y?.z)', {a: {b: f => f({y: {z: 9}})}})
        same('var __r = typeof scope?.a?.b', {a: {b: 's'}})
        same("'use strict'; var __r = scope?.a", {a: 1})
    })

    it('nullish coalescing', () => {
        same("var __r = scope.a ?? 'd'", {a: 0})
        same("var __r = scope.a ?? 'd'", {a: null})
        same("var __r = scope.a ?? scope.b ?? scope.c ?? 3", {b: null, c: 0})
        same('var __r = (scope.a ?? 1) + (scope.b ?? 2) * 3', {a: null, b: 4})
        same("var __r = scope.a || 0 ? scope.b ?? 'x' : 'y'", {a: 1})
        same("var __r = {k: scope.a ?? 'z', j: 1}", {})
        same('var __r = scope.list.map(i=>i.v ?? -1).join()', {list: [{v: 1}, {}, {v: null}]})
        same("var __r = scope?.a?.b ?? 'fallback'", {a: {b: false}})
        same("function f(){ return scope.a ?? 'r' } var __r = f()", {})
        same("var __r = `${scope.a ?? 'tpl'} x`", {})
        same("var __r = scope.s ?? 'a ?? b'", {})
    })

    it('together with buble (browsers without basic ES6)', () => {
        const out = same('const {a}=scope; let __r = a?.b ?? ((x)=>x*2)(4)', {a: null}, withBuble)
        assert.ok(!/=>|\?\.|\?\?|const |let /.test(out), out)
        same('var __r = scope.list?.map(i=>i?.v ?? 0).reduce((a,b)=>a+b,0)', {list: [{v: 1}, null, {v: 3}]}, withBuble)
        // a line comment in the last line must not swallow the end of the wrapper
        same('var __r = 1 // comment', {}, withBuble)
    })

    it('caches converted code', () => {
        const code = 'var __r = scope?.a ?? 1'
        assert.strictEqual(oc.toLegacyJs(code), oc.toLegacyJs(code))
    })
})

/*
 * async/await can't be converted by buble -> transpileAsync in static/legacyjs.js rewrites it into promise chains
 * (parser: static/legacyjs-acorn.js). Every case must give the same result and the same order of events as native async.
 */
describe('legacyjs async/await', () => {
    let acorn
    beforeAll(async () => {
        acorn = await import('acorn')
    })

    const isEs5 = (code) => {
        acorn.parse(code, {ecmaVersion: 5, allowReturnOutsideFunction: true})
        return true
    }

    // browser context without basic ES6: buble + acorn + legacyjs, fake localStorage
    const loadAsync = (storage = {}) => {
        const ctx = {
            _app_: {lacksOptionalChaining: true, lacksBasicEs6: true},
            console: {log() {}},
            location: {href: ''},
            Promise,
            localStorage: {
                getItem: k => (k in storage ? storage[k] : null),
                setItem: (k, v) => { storage[k] = String(v) },
                removeItem: k => { delete storage[k] },
                key: i => Object.keys(storage)[i],
                get length() { return Object.keys(storage).length }
            }
        }
        ctx.window = ctx
        ctx.self = ctx
        vm.createContext(ctx)
        for (const file of ['legacyjs-buble.js', 'legacyjs-acorn.js', 'legacyjs.js']) {
            vm.runInContext(fs.readFileSync(path.join(staticDir, file), 'utf8'), ctx)
        }
        const errors = []
        ctx._app_.sendError = e => errors.push(e)
        return {app: ctx._app_, ctx, errors, storage}
    }

    // runs a case (function body with log(), returns a promise) -> result + order of the log calls
    const run = async (code, app) => {
        const log = []
        let result
        try {
            result = await new Function('log', '_app_', code)(x => log.push(x), app)
        } catch (e) {
            result = 'ERR ' + e.message
        }
        return JSON.stringify([result, log])
    }

    const cases = {
 sequence: `const f = async (x) => { log('a'); const v = await Promise.resolve(x); log('b' + v); return v * 2 }
   const p = f(3); log('sync'); return p`,
 nestedAwait: `const g = async v => v + 1; const f = async () => await g(await g(1)); return f()`,
 thisArgs: `const o = {v: 5, async m(a) { const r = await Promise.resolve(this.v + a + arguments.length); return r }}; return o.m(2)`,
 classMethod: `class A { constructor() { this.x = 1 } async get(y) { await null; return this.x + y } static async s() { return await 7 } }
   return new A().get(2).then(r => A.s().then(s => [r, s]))`,
 ifElse: `const f = async (c) => { if (c) { log('t'); await null; log('t2') } else if (c === 0) { await null; return 'zero' } else { log('e') } log('after'); return c }
   return Promise.all([f(1), f(0), f(false)])`,
 awaitInTest: `const f = async () => { if (await Promise.resolve(false)) return 1; else return 2 }; return f()`,
 whileBreakContinue: `const f = async () => { let i = 0, s = 0; while (i < 10) { i++; if (i % 2) continue; await null; if (i > 7) break; s += i } return [i, s] }; return f()`,
 forLoop: `const f = async () => { const r = []; for (let i = 0; i < 4; i++) { r.push(await Promise.resolve(i * i)) } return r }; return f()`,
 forAwaitTest: `let n = 0; const more = async () => n < 3; const f = async () => { while (await more()) { n++ } return n }; return f()`,
 doWhile: `const f = async () => { let i = 0; do { await null; i++ } while (i < 3); return i }; return f()`,
 forOfDestructure: `const f = async () => { let s = ''; for (const [k, v] of [['a', 1], ['b', 2]]) { s += k + await Promise.resolve(v) } return s }; return f()`,
 forIn: `const f = async () => { const r = []; for (const k in {x: 1, y: 2}) { await null; r.push(k) } return r }; return f()`,
 labels: `const f = async () => { const r = []; outer: for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { await null; if (j === 1) continue outer; if (i === 2) break outer; r.push(i + '' + j) } } return r }; return f()`,
 returnInLoop: `const f = async () => { for (const x of [1, 2, 3]) { await null; if (x === 2) return 'found ' + x } return 'none' }; return f()`,
 plainLoopInside: `const f = async () => { const r = []; await null; for (let i = 0; i < 3; i++) { if (i === 1) continue; r.push(i); if (i === 2) break } return r }; return f()`,
 tryCatch: `const f = async () => { try { log('try'); await Promise.reject(new Error('x')); log('never') } catch (e) { log('catch ' + e.message); return 'c' } finally { log('fin') } }; return f()`,
 tryFinallyReturn: `const f = async () => { try { await null; return 1 } finally { log('fin') } }; return f()`,
 catchDestructure: `const f = async () => { try { await Promise.reject({code: 42}) } catch ({code}) { return code } }; return f()`,
 rejectPropagates: `const f = async () => { await null; throw new Error('boom') }; return f().then(() => 'no', e => 'caught ' + e.message)`,
 syncThrow: `const f = async () => { throw new Error('early') }; const p = f(); log('after call'); return p.catch(e => e.message)`,
 varHoisting: `const f = async (c) => { if (c) { var x = await Promise.resolve(10) } else { var x = 20 } return x }; return Promise.all([f(true), f(false)])`,
 conditional: `const f = async (c) => { const v = c ? await Promise.resolve('yes') : 'no'; return v }; return Promise.all([f(1), f(0)])`,
 logical: `let calls = 0; const g = async () => { calls++; return 'g' }; const f = async (c) => { const a = c && await g(); const b = c || await g(); return [a, b, calls] }; return f(0).then(r => f(1).then(r2 => [r, r2]))`,
 nullish: `const f = async (v) => v ?? await Promise.resolve('def'); return Promise.all([f(null), f(0)])`,
 arrowObject: `const f = async () => ({a: await Promise.resolve(1)}); return f()`,
 asyncInCallback: `const f = async () => { const r = await Promise.all([1, 2].map(async x => { await null; return x * 10 })); return r }; return f()`,
 functionDecl: `async function f(a, b = 2) { await null; return a + b }; return f(1)`,
 nestedAsync: `const outer = async () => { const inner = async () => { await null; return 'in' }; const v = await inner(); return v + 'out' }; return outer()`,
 optionalChaining: `const f = async (o) => { const v = await Promise.resolve(o?.a?.b ?? 'x'); return v }; return Promise.all([f({a: {b: 1}}), f(null)])`,
 spread: `const f = async (o) => { const r = {...o, x: await Promise.resolve(1)}; return [...Object.keys(r)] }; return f({a: 1})`,
 template: "const f = async (n) => `n=${await Promise.resolve(n)}`; return f(4)",
 switchDiscriminant: `const f = async (v) => { switch (await Promise.resolve(v)) { case 1: return 'one'; default: return 'other' } }; return Promise.all([f(1), f(2)])`,
 noSemicolons: `const f = async () => {
     let a = 1
     await null
     ;[a] = [2]
     ;(function () { a++ })()
     return a
   }
   return f()`,
 asyncInsideNonAsync: `function make() { return async () => { await null; return this && this.k } }; return make.call({k: 3})()`,
 closureInLoop: `const f = async () => { const fns = []; for (const i of [1, 2]) { await null; fns.push(() => i) } return fns.map(g => g()) }; return f()`,
 ifWithoutBlock: `const f = async (c) => { if (c) await log('in'); else return 'else'; return 'end' }; return Promise.all([f(1), f(0)])`,
 deepLoop: `const f = async () => { let s = 0; for (let i = 0; i < 20000; i++) { if (i === 19999) await null; s += i } return s }; return f()`,
}

    Object.keys(cases).forEach(name => {
        it(name, async () => {
            const {app, errors} = loadAsync()
            const out = app.toLegacyJs(cases[name])
            assert.deepStrictEqual(errors.map(e => e.message), [])
            assert.ok(isEs5(out), out)
            assert.strictEqual(await run(out, app), await run(cases[name], app), out)
        })
    })

    it('leaves async in strings, comments and property names alone', () => {
        const {ctx} = loadAsync()
        assert.strictEqual(ctx.hasAsyncAwait('const s = "async await" // await x\nconst o = {}; o.async = 1'), false)
        assert.strictEqual(ctx.hasAsyncAwait('const f = async () => 1'), true)
    })

    it('stores the converted code over page loads', () => {
        const code = 'const f = async () => { return await Promise.resolve(1) }\nreturn f()'
        const first = loadAsync()
        const out = first.app.toLegacyJs(code)
        assert.strictEqual(Object.keys(first.storage).length, 1)
        // next page load: no conversion (acorn is not even needed)
        const second = loadAsync(first.storage)
        second.ctx.acorn = undefined
        assert.strictEqual(second.app.toLegacyJs(code), out)
        assert.strictEqual(second.errors.length, 0)
    })

    it('reports unsupported await', () => {
        const {app, errors, storage} = loadAsync()
        app.toLegacyJs('const f = async (v) => { switch (v) { case 1: await null } }')
        assert.strictEqual(errors.length, 1)
        assert.strictEqual(errors[0].meta.stage, 'async')
        assert.ok(/switch case/.test(errors[0].message))
        assert.strictEqual(Object.keys(storage).length, 0)
    })
})

describe('legacyjs code without semicolons and numeric separators', () => {
    const {_app_: app} = (() => {
        const ctx = {_app_: {lacksOptionalChaining: true, lacksBasicEs6: true}, console: {log() {}}, location: {href: ''}}
        ctx.window = ctx
        ctx.self = ctx
        vm.createContext(ctx)
        vm.runInContext(fs.readFileSync(path.join(staticDir, 'legacyjs-buble.js'), 'utf8'), ctx)
        vm.runInContext(fs.readFileSync(path.join(staticDir, 'legacyjs.js'), 'utf8'), ctx)
        return ctx
    })()

    it('?? ends at a line break without operator', () => {
        const code = 'const w = (scope.a && scope.a.b) ?? scope.c\nif (w == null) { __r = 0 } else { __r = w }'
        const out = app.toLegacyJs(code)
        assert.deepStrictEqual(evaluate(out, {a: null, c: 5}), 5)
        // operator at the end of the line / at the start of the next line -> the expression goes on
        assert.deepStrictEqual(evaluate(app.toLegacyJs('var x = scope.a ??\n  scope.b\n  .trim()\nvar __r = x'), {b: ' y '}), 'y')
    })

    it('removes numeric separators', () => {
        const out = app.toLegacyJs('var __r = 1_000_000 + 0xFF_FF; var s = "1_0"; var a_1 = 2')
        assert.strictEqual(evaluate(out, {}), 1065535)
    })
})
