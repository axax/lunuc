import React from 'react'
import {EditIcon, CodeIcon, AddIcon, AutoFixHighIcon,RepeatIcon,AutoAwesomeIcon} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'
import {formatCode} from './utils'
import {openWindow} from '../../util/window'
import {fixAndParseJSON} from '../../util/fixJson.mjs'
import {BuildIcon} from '../../../gensrc/ui/admin'
import {putFilesTogether} from './fileSeperation'

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

export function generateContextMenu({type,clickEvent, editorView, propertyTemplates, templates, setEditData,
                                        fileSplit, showFileSplit, files, finalFileIndex,
                                        setShowFileSplit,setStateValue}) {
    let contextMenuItems = []

   if (editorView) {

       const pos = editorView.posAtCoords({x: clickEvent.clientX, y: clickEvent.clientY})
       const lineInfo = editorView.state.doc.lineAt(pos)
       if(type==='json') {
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
      if(editorView.hasError){
           contextMenuItems.push({
               icon: <BuildIcon/>,
               name: _t('CodeEditor.tryToAutoFixErrors'),
               onClick: () => {

                   const jsonData = fixAndParseJSON(editorView.state.doc.toString())
                   if(jsonData.fixed){
                       editorView.dispatch({
                           changes: {from: 0, to: editorView.state.doc.length, insert: JSON.stringify(jsonData.json,null,2)}
                       })
                   }
               }
           })
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

       const winAndReplace = (url)=>{
           const win = openWindow({url})
           win.onload = ()=>{
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
                       formatCode(editorView,type)
                   }
               })
           }
       }
       contextMenuItems.push({
           divider: true,
           icon: <AutoAwesomeIcon/>,
           name: _t('CodeEditor.aiAssistent') + ' (Alt-Cmd-A)',
           onClick: () => {
               winAndReplace(`/system/aiassistent?preview=true&input=${encodeURIComponent(selectedContent || '')}true&type=${type}`)
           }
       })

       if (selectedContent) {
           contextMenuItems.push({
               divider: false,
               icon: <RepeatIcon/>,
               name: _t('CodeEditor.repeatSelection'),
               onClick: () => {
                   winAndReplace(`/system/repeater?preview=true&content=${encodeURIComponent(selectedContent)}`)
               }
           })
       }
       if (fileSplit) {
           contextMenuItems.push({
               divider:true,
               icon:'add',
               name: _t('CodeEditor.newFileSplit'), onClick: () => {
                   setEditData({fileSplit:true,fields:{name:{fullWidth:true,label:'Name',required:true}},lineInfo})
               }
           })

           contextMenuItems.push({
               icon:(showFileSplit ? 'visibilityOff' : 'visibility'),
               name: (showFileSplit ? _t('CodeEditor.hideFileSplit') : _t('CodeEditor.showFileSplit')), onClick: () => {
                   // to keep value in state
                   setStateValue(putFilesTogether(files, finalFileIndex, editorView.state.doc.toString()))
                   setShowFileSplit(!showFileSplit)
               }
           })
       }

   }
    return {left: clickEvent.clientX, top: clickEvent.clientY, items:contextMenuItems}
}