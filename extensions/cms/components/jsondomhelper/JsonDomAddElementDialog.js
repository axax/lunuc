import React from 'react'
import {
    TextField,
    InputAdornment,
    AutoAwesomeIconButton,
    SimpleDialog,
    SimpleSelect
} from 'ui/admin'
import {createElementByKeyFromList, getJsonDomElements} from '../../util/elements'
import GenericForm from '../../../../client/components/GenericForm'
import Util from '../../../../client/util/index.mjs'
import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../../constants/index.mjs'
import {_t} from '../../../../util/i18n.mjs'
import Async from '../../../../client/components/Async'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../../../../client/components/CodeEditor')}/>


export default function JsonDomAddElementDialog(props){

    const availableJsonElements = getJsonDomElements(null, {advanced: Util.hasCapability(_app_.user, CAPABILITY_MANAGE_CMS_TEMPLATE)})

    const [currentElement, setCurrentElement] = React.useState(props.currentElement)
    const [form, setForm] = React.useState(null)
    const [aiAssistent, setAiAssistent] = React.useState({promt:''})

    return <SimpleDialog fullWidth={true}
                         maxWidth="lg"
                         key="dialogProps"
                         open={true}
                         onClose={(event)=>{
                             if(event.key==='save' && aiAssistent.answer){

                                 fetch(`/lunucapi/system/html2json?html=${encodeURIComponent(aiAssistent.answer)}`).then(response => response.json())
                                    .then(data => {
                                        const newElement = {
                                            tagName:'div',
                                            defaults: {
                                                $inlineEditor: {
                                                    allowDrop: true,
                                                    elementKey: 'custom'
                                                },
                                                p: {
                                                    'data-element-key': 'custom'
                                                },
                                                c: data.json
                                            }
                                        }
                                        props.onClose(event, newElement, form, props.payload)
                                     })

                             }else if(event.key==='cancel' || currentElement){
                                 props.onClose(event, currentElement, form, props.payload)
                             }
                         }}
                         actions={[
                             {
                                 key: 'cancel',
                                 label: _t('core.cancel'),
                                 type: 'secondary'
                             },
                             {
                                 key: 'save',
                                 label: currentElement?_t('core.save'):_t('core.add'),
                                 type: 'primary'
                             }]}
                         title={_t('JsonDomAddElementDialog.editElement',{name: `${currentElement && currentElement.name? '(' + currentElement.name + ')' : ''}`})}>

        {props.showElementSelector && <SimpleSelect
            sx={{width: 'calc(50% - 16px)' }}
            label={_t('JsonDomAddElementDialog.selectElement')}
            value={currentElement && currentElement.defaults && currentElement.defaults.$inlineEditor.elementKey}
            onChange={(e) => {
                const value = e.target.value
                const item = createElementByKeyFromList(value, availableJsonElements)
                setAiAssistent({promt:''})
                setCurrentElement(item)
            }}
            items={availableJsonElements}
        />}


        {props.showElementSelector && <TextField placeholder={_t('JsonDomAddElementDialog.createElementAiPlaceholder')}
                   label={_t('JsonDomAddElementDialog.createElementAi')}
                   sx={{width: 'calc(50% - 16px)' }}
                   value={aiAssistent.promt}
                   onChange={(e)=>{
                       setCurrentElement(null)
                       setAiAssistent({...aiAssistent,promt: e.target.value})
                   }}
                   InputProps={{
                       endAdornment: (
                           <InputAdornment position="end">
                               <AutoAwesomeIconButton disabled={aiAssistent.running || !aiAssistent.promt} color="primary" onClick={()=>{
                                   setAiAssistent({...aiAssistent,running:true})
                                   const contextInstructions = `the answer must be plain html code without code marker and instructions`
                                   fetch(`/lunucapi/system/llm?stream=true&contextInstructions=${encodeURIComponent(contextInstructions)}&content=${encodeURIComponent(aiAssistent.promt)}`).then(async response => {
                                       const reader = response.body.getReader()
                                       let answer = ''
                                       while(true){
                                           const chunk = await reader.read()
                                           answer += new TextDecoder().decode(chunk.value)
                                           setAiAssistent({...aiAssistent,running:!chunk.done,answer:answer})
                                           if (chunk.done) {
                                               break
                                           }
                                       }
                                   })
                               }}>
                               </AutoAwesomeIconButton>
                           </InputAdornment>
                       ),
                   }}/>}

        {aiAssistent.answer && <CodeEditor controlled lineNumbers type="html" height="auto" identifier={`aiAnswer${aiAssistent.answer.length}`}>
            {aiAssistent.answer}
        </CodeEditor>}

        {currentElement && currentElement.options &&
            <GenericForm primaryButton={false}
                         onPosChange={({field, newIndex}) => {
                             const curKey = '!' + field.key + '!'
                             const newCurrentElement = Object.assign({},currentElement)
                             newCurrentElement.options = Object.assign({}, currentElement.options)

                             Object.keys(field.group).forEach(groupKey => {
                                 const from = newCurrentElement.options[curKey + groupKey + '!' + field.index],
                                     to = newCurrentElement.options[curKey + groupKey + '!' + newIndex]
                                 if (to && from) {
                                     newCurrentElement.options[curKey + groupKey + '!' + field.index] = to
                                     newCurrentElement.options[curKey + groupKey + '!' + newIndex] = from
                                 }
                             })
                             setCurrentElement(newCurrentElement)
                         }}
                         onButtonClick={(field) => {
                             const curKey = '!' + field.key + '!'

                             const newCurrentElement = Object.assign({},currentElement)
                             newCurrentElement.options = Object.assign({}, newCurrentElement.options)

                             if (field.action === 'add') {
                                 let curIdx = 0
                                 Object.keys(newCurrentElement.options).forEach(optionKey => {
                                     const formField = form.state.fields[optionKey]
                                     if (formField) {
                                         newCurrentElement.options[optionKey].value = formField
                                     }

                                     if (optionKey.startsWith(curKey)) {
                                         const parts = optionKey.split('!'),
                                             newIdx = parseInt(parts[parts.length - 1])
                                         if (newIdx > curIdx) {
                                             curIdx = newIdx
                                         }
                                     }
                                 })
                                 Object.keys(field.group).forEach(groupKey => {
                                     if (groupKey !== '_addButton') {
                                         const newItem = Object.assign({}, newCurrentElement.groupOptions[field.key][groupKey])
                                         delete newItem.value
                                         if (newItem.expandable === false) {
                                             delete newItem.expandable
                                         }
                                         newCurrentElement.options[curKey + groupKey + '!' + (curIdx + 1)] = newItem
                                     }
                                 })


                                 newCurrentElement.options['!' + field.key + '!delete!' + (curIdx + 1)] = {
                                     uitype: 'button',
                                     label: 'Löschen',
                                     action: 'delete',
                                     key: field.key,
                                     group: newCurrentElement.groupOptions[field.key],
                                     index: (curIdx + 1),
                                     newLine: true,
                                     expandable: false
                                 }

                             } else if (field.action === 'delete') {
                                 Object.keys(field.group).forEach(groupKey => {
                                     delete newCurrentElement.options[curKey + groupKey + '!' + field.index]
                                 })
                                 delete newCurrentElement.options[curKey + 'delete!' + field.index]

                             }
                             setCurrentElement(newCurrentElement)
                         }}
                         onRef={setForm}
                         onFieldsChange={(newFields)=>{

                             const newCurrentElement = Object.assign({},currentElement)
                             newCurrentElement.options = Object.assign({}, currentElement.options, newFields)
                             newCurrentElement.defaults = Object.assign({}, currentElement.defaults)
                             newCurrentElement.defaults.$inlineEditor = Object.assign({}, currentElement.defaults.$inlineEditor)
                             newCurrentElement.defaults.$inlineEditor.options = Object.assign({}, currentElement.defaults.$inlineEditor.options, newFields)
                             Object.keys(form.state.fields).forEach(key=>{
                                 newCurrentElement.options[key].value = form.state.fields[key]
                             })
                             setCurrentElement(newCurrentElement)

                         }}
                         trigger={currentElement.trigger}
                         fields={currentElement.options}/>}

    </SimpleDialog>
}