import {javascriptLanguage} from "@codemirror/lang-javascript"
import {cssLanguage} from "@codemirror/lang-css"
import {snippetCompletion} from "@codemirror/autocomplete"

export const jsSnippets = ()=> {
    return javascriptLanguage.data.of({
        autocomplete: [
            snippetCompletion(`const \${name} = require('@\${str}').default`, {label: 'require'}),
            snippetCompletion(`forceUpdate()`, {label: 'forceUpdate'}),
            snippetCompletion(`__this.reload({$:{time:new Date()}})`, {label: '__this.reload'}),
            snippetCompletion(`Util.escapeForJson('\${str}')`, {label: 'Util.escapeForJson'}),
            snippetCompletion(`on('mount',()=>{\n\tDomUtil.waitForElement('.selector').then((el)=>{})\n})`, {label: 'mount event'}),
            snippetCompletion('on([\'resourcesready\'],()=>{})', {label: 'resourcesready event'}),
            snippetCompletion('on(\'beforerender\',()=>{\n\t\n})', {label: 'beforerender event'}),
            snippetCompletion('e.stopPropagation()', {label: 'stopPropagation()'}),
            snippetCompletion('on(\'click\',(p,e)=>{\n\tif(p.action===\'click\'){\n\t\tconsole.log(e)\n\t}\n})', {label: 'on click event'}),
            snippetCompletion('on(\'change\',(p,e)=>{\n\tif(p.action===\'change\'){\n\t\tconsole.log(e)\n\t}\n})', {label: 'on change event'}),
            snippetCompletion('DomUtil.waitForElement(\'.selector\').then(()=>{\n\t\n})', {label: 'waitForElement'}),
            snippetCompletion(`DomUtil.waitForVariable('\${name}').then(()=>{\n\t\n})`, {label: 'waitForVariable'}),
            snippetCompletion(`on('customevent',p=>{\n\tif(p.action === 'modalClosed'){\n\t\t\n\t}else if(p.action === 'modalButtonClicked'){\n\t}\n})`, {label: 'custom event'}),
            snippetCompletion(`serverMethod('\${methodName}',\${args},(res)=>{
    if(res.data.cmsServerMethod.result){          
        const data = JSON.parse(res.data.cmsServerMethod.result)
        console.log(data)
        if(data.success){
        }else{
        }
    }
})`, {label: 'serverMethod'})
        ]
    })
}

export const cssSnippets = ()=> {
    return cssLanguage.data.of({
        autocomplete: [
            snippetCompletion(`//<!!#REMOVE\n\n//!!#REMOVE>`, {label: 'REMOVE Block'})
        ]
    })
}