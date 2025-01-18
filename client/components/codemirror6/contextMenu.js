import React from 'react'
import {EditIcon, CodeIcon, AddIcon, AutoFixHighIcon,RepeatIcon} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'
import {formatCode} from './utils'
import {openWindow} from '../../util/window'

const getTextAtLineNumber = (editorView, number) => {
    try {
        const lineData = editorView.state.doc.line(number)
        return lineData.text.trim()
    }catch (e){
        return ''
    }
}

function startsWithAny(str, chars) {
    if (!str || !chars.length) return false
    const firstChar = str.charAt(0)
    return chars.includes(firstChar)
}
function endsWithAny(str, chars) {
    if (!str || !chars.length) return false
    const lastChar = str.charAt(str.length - 1)
    return chars.includes(lastChar)
}

export function generateContextMenu({type,clickEvent, editorView, propertyTemplates, templates, setEditData}) {
    let contextMenuItems = []

   if (editorView) {

       if(type==='json') {
           const pos = editorView.posAtCoords({x: clickEvent.clientX, y: clickEvent.clientY})
           const lineInfo = editorView.state.doc.lineAt(pos)
           const text = lineInfo.text.trim()
           const textNext = getTextAtLineNumber(editorView, lineInfo.number + 1)
           const lineData = {number: lineInfo.number, text,
               endsWithComma: text.endsWith(','),
               needsComma:endsWithAny(text,[']','}','"']),
               needsCommaAtEnd:startsWithAny(textNext,['[','{','"'])
           }
           let tempJson
           if(editorView.state.doc.length>0 && !textNext.startsWith(']')) {
               if (text.endsWith('{') && textNext.startsWith('"')) {
                   tempJson = {}
               } else {
                   try {
                       tempJson = JSON.parse(`{${lineData.endsWithComma ? lineData.text.substring(0, lineData.text.length - 1) : lineData.text}}`)
                   } catch (e) {
                   }
               }
           }

           if (tempJson) {

               const keys = Object.keys(tempJson)

               contextMenuItems = []
               if (keys.length > 0){
                   contextMenuItems.push(
                       {
                           icon: <EditIcon/>,
                           name: _t('CodeEditor.editAsText'),
                           onClick: () => {
                               setEditData({lineData, uitype: 'textarea', key: keys[0], value: tempJson[keys[0]]})
                           }
                       },
                       {
                           icon: <CodeIcon/>,
                           name: _t('CodeEditor.editAsHtml'),
                           onClick: () => {
                               setEditData({lineData, uitype: 'html', key: keys[0], value: tempJson[keys[0]]})
                           }
                       })
                }

               if (keys.length > 0 && keys[0] == 'slug') {
                   contextMenuItems.push({
                       icon: <CodeIcon/>,
                       name: _t('CodeEditor.openPage'),
                       onClick: () => {
                           location.href = '/' + tempJson.slug
                       }
                   })
               }

               if (propertyTemplates && propertyTemplates.length > 0) {
                   contextMenuItems.push({
                       icon: <AddIcon/>,
                       name: _t('core.add'),
                       items: propertyTemplates.map(f => ({
                           name: f.title,
                           icon: f.icon,
                           onClick: () => {
                               if(f.onClick){
                                   f.onClick(editorView,lineInfo,lineData)
                               }else {
                                   editorView.dispatch({
                                       changes: {
                                           from: lineInfo.to,
                                           to: lineInfo.to,
                                           insert: `${lineData.needsComma ? ',' : ''}${f.template}${lineData.needsCommaAtEnd ? ',' : ''}`
                                       }
                                   })
                                   formatCode(editorView,'json')
                               }
                           }
                       }))
                   })
               }
           } else if (templates && editorView.state.doc.length===0 || (textNext && !textNext.startsWith('"') &&
               (!startsWithAny(textNext,[']','}']) || endsWithAny(text,['}','['])))) {
               contextMenuItems = [
                   {
                       icon: <AddIcon/>,
                       name: _t('core.add'),
                       items: templates.map(f => ({
                           name: f.title,
                           icon: f.icon,
                           onClick: () => {
                               if(f.onClick){
                                   f.onClick(editorView,lineInfo,lineData)
                               }else {
                                   editorView.dispatch({
                                       changes: {
                                           from: lineInfo.to,
                                           to: lineInfo.to,
                                           insert: `${lineData.needsComma ? ',' : ''}${f.template}${lineData.needsCommaAtEnd ? ',' : ''}`
                                       }
                                   })
                                   formatCode(editorView,'json')
                               }
                           }
                       }))
                   }
               ]
           }
       }

       contextMenuItems.push({
           divider:true,
           icon: <AutoFixHighIcon/>,
           name: _t('CodeEditor.reformatCode')+' (Alt-Cmd-L)',
           onClick: () => {
               formatCode(editorView, type)
           }
       })

       const selectedContent = editorView.state.sliceDoc(editorView.state.selection.main.from, editorView.state.selection.main.to)

       if(selectedContent){
           contextMenuItems.push({
               divider:true,
               icon: <RepeatIcon/>,
               name: _t('CodeEditor.repeatSelection'),
               onClick: () => {
                   const win = openWindow({url:`/system/repeater?preview=true&content=${selectedContent}`})
                   setTimeout(()=>{
                       win.addEventListener('beforeunload', (e) => {
                           console.log(win.returnValue)
                           if (win.returnValue) {
                               editorView.dispatch({
                                   changes: {
                                       from: editorView.state.selection.main.from,
                                       to: editorView.state.selection.main.to,
                                       insert: win.returnValue
                                   }
                               })
                               formatCode(editorView,'json')
                           }
                       })
                   },500)
               }
           })
       }

   }
    return {left: clickEvent.clientX, top: clickEvent.clientY, items:contextMenuItems}
}