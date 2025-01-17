import React from 'react'
import {EditIcon, CodeIcon, AddIcon, AutoFixHighIcon,RepeatIcon} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'
import {formatCode} from './utils'
import {openWindow} from '../../util/window'

export function generateContextMenu({type,clickEvent, editorView, propertyTemplates, templates, setEditData}) {
    let contextMenuItems = []

   if (editorView) {

       if(type==='json') {
           const pos = editorView.posAtCoords({x: clickEvent.clientX, y: clickEvent.clientY})
           const lineInfo = editorView.state.doc.lineAt(pos)

           const text = lineInfo.text.trim()
           const lineData = {number: lineInfo.number, text, endsWithComma: text.endsWith(',')}
           let tempJson
           try {
               tempJson = JSON.parse(`{${lineData.endsWithComma ? lineData.text.substring(0, lineData.text.length - 1) : lineData.text}}`)
           } catch (e) {
           }
           if (tempJson) {
               contextMenuItems = [
                   {
                       icon: <EditIcon/>,
                       name: _t('CodeEditor.editAsText'),
                       onClick: () => {
                           const keys = Object.keys(tempJson)
                           if (keys.length > 0) {
                               setEditData({lineData, uitype: 'textarea', key: keys[0], value: tempJson[keys[0]]})
                           }
                       }
                   },
                   {
                       icon: <CodeIcon/>,
                       name: _t('CodeEditor.editAsHtml'),
                       onClick: () => {
                           const keys = Object.keys(tempJson)
                           if (keys.length > 0) {
                               setEditData({lineData, uitype: 'html', key: keys[0], value: tempJson[keys[0]]})
                           }
                       }
                   }
               ]
               const keys = Object.keys(tempJson)
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
                                           insert: `${!lineData.endsWithComma ? ',' : ''}${f.template}${lineData.endsWithComma ? ',' : ''}`
                                       }
                                   })
                                   formatCode(editorView,'json')
                               }
                           }
                       }))
                   })
               }
           } else if (templates) {
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
                                           insert: `${!lineData.endsWithComma ? ',' : ''}${f.template}${lineData.endsWithComma ? ',' : ''}`
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