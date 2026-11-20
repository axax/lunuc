// Compiles the client scripts and serverScripts of the CmsPages in dbscripts/cmspages/ the way
// lunuc runs them, without executing them. Catches what a plain syntax check misses, above all a
// top level declaration that clashes with a name lunuc already declares for the script
// (e.g. `const root = …` -> "Identifier 'root' has already been declared").
//
//   npm run check:cmsscripts                      # all pages
//   npm run check:cmsscripts -- system/etoro-bot  # pages whose slug starts with one of the arguments
//
// Keep the prefixes in sync with extensions/cms/components/JsonDom.js (script) and
// extensions/cms/resolver/index.mjs (cmsServerMethod).
import fs from 'node:fs'
import path from 'node:path'

// declared by JsonDom before every page script
export const CLIENT_SCRIPT_PREFIX = '\'use strict\';const __this=this._this;' +
    'const {serverMethod,on,setLocal,getLocal,refresh,getComponent,addMetaTag,setStyle,fetchMore}=__this;' +
    'const {history,clientQuery,setKeyValue,getKeyValue,updateResolvedData}=__this.props;' +
    'const {scope,parent,root,Util,DomUtil}=this;' +
    'this.serverMethod = serverMethod;' +
    'const _t=this._t.bind(scope.data),forceUpdate=refresh;'

// cmsServerMethod runs the serverScript in a block that also declares `result`
const serverWrap = script => `return (async () => {\n${script}\nlet result = null\n})`

const ROOT = path.resolve('dbscripts/cmspages')
const filters = process.argv.slice(2)

const pages = []
const walk = (dir) => {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (e.name === 'page.json') pages.push(dir)
    }
}
if (!fs.existsSync(ROOT)) {
    console.error(`${ROOT} not found - run from the project root`)
    process.exit(2)
}
walk(ROOT)

let checked = 0, failed = 0
for (const dir of pages.sort()) {
    const slug = path.relative(ROOT, dir).split(path.sep).join('/')
    if (filters.length && !filters.some(f => slug.startsWith(f))) continue
    const errors = []
    const script = path.join(dir, 'script.js')
    if (fs.existsSync(script)) {
        try {
            new Function(CLIENT_SCRIPT_PREFIX + fs.readFileSync(script, 'utf8'))
        } catch (e) {
            errors.push(`script.js: ${e.message}`)
        }
    }
    const serverScript = path.join(dir, 'serverScript.js')
    if (fs.existsSync(serverScript)) {
        try {
            new Function('require', serverWrap(fs.readFileSync(serverScript, 'utf8')))
        } catch (e) {
            errors.push(`serverScript.js: ${e.message}`)
        }
    }
    for (const json of ['page.json', 'dataResolver.json', 'resources.json']) {
        const f = path.join(dir, json)
        if (!fs.existsSync(f)) continue
        const text = fs.readFileSync(f, 'utf8').trim()
        if (!text) continue
        try { JSON.parse(text) } catch (e) { errors.push(`${json}: ${e.message}`) }
    }
    checked++
    if (errors.length) {
        failed++
        console.log(`✗ ${slug}\n    ${errors.join('\n    ')}`)
    }
}
console.log(`${checked} page(s) checked, ${failed} with errors`)
process.exit(failed ? 1 : 0)
