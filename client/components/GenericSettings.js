import React, { useState } from 'react'
import {_t} from '../../util/i18n.mjs'
import {SettingsIcon} from '../../gensrc/ui/admin/icons'
import GenericForm from './GenericForm'
import Util from "../util/index.mjs";
import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../../extensions/cms/constants/index.mjs'
import {
    Typography,
    Checkbox
} from 'ui/admin'
import Async from './Async'
import { useKeyValuesGlobal, setKeyValue} from '../util/keyvalue'

const CodeEditor = (props) => <Async {...props}
                                     load={import(/* webpackChunkName: "codeeditor" */ './CodeEditor')}/>


function GenericSettings({keyValues, keyDefinition, onSaveValues}) {
    const canMangeCmsTemplate = Util.hasCapability(_app_.user, CAPABILITY_MANAGE_CMS_TEMPLATE)
    const [showDefinition, setShowDefinition] = useState(false)

    const useKeyValues = useKeyValuesGlobal([keyValues], {})
    const useKeyDefinition = useKeyValuesGlobal([keyDefinition], {})

    if(useKeyValues.loading || useKeyDefinition.laoding){
        return <div>loading...</div>
    }
    const settingValues = useKeyValues.data[keyValues] || {}
    const settingDefinition = useKeyDefinition.data[keyDefinition] || []

    return <div style={{padding: '1rem'}}>
        <Typography mb={2} variant="subtitle1">{_t('CmsViewEditorContainer.pagesettings')}</Typography>
        {canMangeCmsTemplate && <Checkbox
            sx={{position:'absolute', right: 0, top:0}}
            onChange={(e)=>{
                setShowDefinition(!showDefinition)
            }}
            checked={showDefinition}
            icon={<SettingsIcon />}
            checkedIcon={<SettingsIcon />}
        />}

        {showDefinition?
            <CodeEditor lineNumbers
                        type="json"
                        onChange={(json)=>{
                            clearTimeout(this._pageOptionDefTimeout)
                            this._pageOptionDefTimeout=setTimeout(()=>{
                                //this.setState({PageOptionsDefinition:json})

                                setKeyValue({
                                    key: keyDefinition,
                                    value: json,
                                    global: true
                                })

                            },1000)
                        }}>{settingDefinition}</CodeEditor>

            :
            settingDefinition ?
                <GenericForm key="pageOptionForm" primaryButton={true}
                             caption={_t('CmsViewEditorContainer.save')} onClick={(formData) => {
                    //this.setState({PageOptions: formData})


                    setKeyValue({
                        key: keyValues,
                        value: formData,
                        global: true
                    }).then(()=>{
                        if(onSaveValues){
                            onSaveValues(formData)
                        }
                    }).catch(()=>{
                        if(onSaveValues){
                            onSaveValues(formData)
                        }
                    })

                }} fields={settingDefinition.reduce((obj, item) => {
                    return {...obj, [item.name]: item}
                }, {})} values={settingValues}/> : _t('CmsViewEditorContainer.noOptions')}</div>
}

export default GenericSettings
