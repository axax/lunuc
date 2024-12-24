import React from 'react'
import {EditIcon, CodeIcon, AddIcon, AutoFixHighIcon} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'
import {formatCode} from "./utils";


export function generateContextMenu({clickEvent, editorView, propertyTemplates, templates, setEditData}) {
    let contextMenuItems = []

   if (editorView) {
       const pos = editorView.posAtCoords({ x: clickEvent.clientX, y: clickEvent.clientY })
       const lineInfo = editorView.state.doc.lineAt(pos)

       const text = lineInfo.text.trim()
       const lineData = {number:lineInfo.number,text, endsWithComma: text.endsWith(',')}
        let tempJson
        try {
            tempJson = JSON.parse(`{${lineData.endsWithComma ? lineData.text.substring(0, lineData.text.length - 1) : lineData.text}}`)
        } catch (e) {
        }
        console.log(tempJson)
        if (tempJson) {
            contextMenuItems = [
                {
                    icon: <EditIcon/>,
                    name: _t('CodeEditor.editAsText'),
                    onClick: () => {
                        const keys = Object.keys(tempJson)
                        if (keys.length > 0) {
                            setEditData({lineData,uitype: 'textarea', key: keys[0], value: tempJson[keys[0]]})
                        }
                    }
                },
                {
                    icon: <CodeIcon/>,
                    name: _t('CodeEditor.editAsHtml'),
                    onClick: () => {
                        const keys = Object.keys(tempJson)
                        if (keys.length > 0) {
                            setEditData({lineData,uitype: 'html', key: keys[0], value: tempJson[keys[0]]})
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
                        onClick: () => {
                            editorView.dispatch({
                                changes: {
                                    from: lineInfo.to,
                                    to: lineInfo.to,
                                    insert: `${!lineData.endsWithComma ? ',' : ''}${f.template}${lineData.endsWithComma ? ',' : ''}`
                                }
                            })
                            formatCode(editorView)
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
                        onClick: () => {
                            editorView.dispatch({
                                changes: {
                                    from: lineInfo.to,
                                    to: lineInfo.to,
                                    insert: `${!lineData.endsWithComma ? ',' : ''}${f.template}${lineData.endsWithComma ? ',' : ''}`
                                }
                            })
                            formatCode(editorView)
                        }
                    }))
                }
            ]
        }

       contextMenuItems.push({
           icon: <AutoFixHighIcon/>,
           name: _t('CodeEditor.reformatCode')+' (Alt-Cmd-L)',
           onClick: () => {
               formatCode(editorView)
           }
       })
    }
    return {left: clickEvent.clientX, top: clickEvent.clientY, items:contextMenuItems}
}