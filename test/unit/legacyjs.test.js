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
