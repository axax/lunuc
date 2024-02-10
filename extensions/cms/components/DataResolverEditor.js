import React from 'react'
import {AutoFixHighIcon, SimpleDialog} from 'ui/admin'
import {jsonPropertyTemplates, jsonTemplates} from './templates/dataResolver'
import Async from '../../../client/components/Async'
import {_t} from '../../../util/i18n.mjs'
import GenericForm from '../../../client/components/GenericForm'
import {getType} from '../../../util/types.mjs'

const CodeEditor = (props) => <Async {...props} load={import(/* webpackChunkName: "codeeditor" */ '../../../client/components/CodeEditor')}/>

class DataResolverEditor extends React.Component {

    onWizardClose(action) {
        if(action.key==='save') {
            let json
            try {
                json = JSON.parse(this.props.children)
            }catch (e){
                json = []
            }
            if(this.wizardForm.state.fields.resolverType==='track') {
                json.push(
                    {
                        track: {
                            event: 'visit'
                        }
                    })
            }else if(this.wizardForm.state.fields.resolverType==='type'){
                const type = this.wizardForm.state.fields.type
                const typeDefinition = getType(type.name)
                json.push(
                    {
                        $if: 'true',
                        t: `${type.subscribe ? '$' : ''}${type.name}`,
                        restriction: {
                            type: 'role',
                            role: 'view_app'
                        },
                        d: typeDefinition.fields.map(f => f.name),
                        includeCount: false,
                        l: type.limit || 10,
                        f: type.filter || '',
                        s: '_id desc',
                        _before: {
                            $sample: {
                                size: 20
                            }
                        }
                    })
            }else if(this.wizardForm.state.fields.resolverType==='genericType'){
                const genericType = this.wizardForm.state.fields.genericType
                const structure = JSON.parse(genericType.name[0].structure)
                json.push(
                    {
                        key: genericType.name[0].name,
                        genericType: genericType.name[0].name,
                        cache: {
                            key: genericType.name[0].name,
                            policy: "${this.editmode?'cache-only':''}",
                            expires: 86400000
                        },
                        t: 'GenericData',
                        d: [
                            {
                                data:structure.fields.map(f=>f.name)
                            },
                            '_id',
                            {
                                definition: [
                                    'name'
                                ]
                            }
                        ],
                        l: genericType.limit || 10,
                        s: '_id desc'
                    })
            }

            this.props.onChange(JSON.stringify(json,null,2))
        }
    }

    render() {
        const [showWizard, setShowWizard] = React.useState(false)
        return <>
            <SimpleDialog fullWidth={true} maxWidth="sm" open={showWizard}
                onClose={(action)=>{
                    this.onWizardClose(action)
                    setShowWizard(false)
                }}
                actions={[{key: 'cancel', label: _t('core.cancel')}, {
                  key: 'save',
                  label: _t('core.save'),
                  variant: 'contained'
                }]}
                title={_t('DataResolverEditor.newDataResolverType')}>

                <GenericForm primaryButton={false} onRef={(e) => { this.wizardForm =e}} fields={
                    {
                        resolverType:{
                            name: 'resolverType',
                            label: 'Resolver Type',
                            enum: [{value:'type', name:'Type'},{value:'genericType', name:'Generic Type'},{value:'track', name:'Tracking'}],
                            fullWidth: true,
                            value:'type'
                        },
                        type:{
                            uistate: {
                                visible: 'resolverType==type'
                            },
                            uitype:'wrapper',
                            label:'Add type',
                            name:'genericType',
                            multi:false,
                            titleTemplate: 'Generic Type ${this.context ? this.context.type || "": ""}',
                            subFields:[
                                {
                                    name: 'name',
                                    label: 'Name',
                                    enum: '$TYPES',
                                    fullWidth: true
                                },
                                {
                                    name: 'filter',
                                    label: 'Filter',
                                    fullWidth: true
                                },
                                {
                                    name: 'limit',
                                    label: 'Limit',
                                    type: 'Float',
                                    defaultValue:10,
                                    uitype:'number',
                                    fullWidth: true
                                },
                                {
                                    name: 'subscribe',
                                    label: 'Subscribe',
                                    type: 'Boolean',
                                    fullWidth: true
                                }
                            ]
                        },
                        genericType:{
                            uistate: {
                                visible: 'resolverType==genericType'
                            },
                            uitype:'wrapper',
                            label:'Add type',
                            name:'genericType',
                            multi:false,
                            titleTemplate: 'Generic Type ${this.context ? this.context.type || "": ""}',
                            subFields:[
                                {
                                    name: 'name',
                                    label: 'Name',
                                    uitype: 'type_picker',
                                    type: 'GenericDataDefinition',
                                    fullWidth: true
                                },
                                {
                                    name: 'limit',
                                    label: 'Limit',
                                    type: 'Float',
                                    defaultValue:10,
                                    uitype:'number',
                                    fullWidth: true
                                }
                            ]
                        }
                    }
                } onClick={()=>{}}/>
            </SimpleDialog>
            <CodeEditor showFab
                       templates={jsonTemplates}
                       propertyTemplates={jsonPropertyTemplates}
                       actions={[
                           {
                               divider:true
                           },
                           {
                               name: _t('DataResolverEditor.wizard'),
                               icon: <AutoFixHighIcon/>,
                               onClick: ()=>{
                                   setShowWizard(true)
                               }
                           }
                       ]} lineNumbers controlled type="json" {...this.props}/>
        </>
    }

    createExample() {
        const {onChange} = this.props


        onChange(JSON.stringify([
            {
                "t": "$Word",
                "d": [
                    "de",
                    "en"
                ],
                "l": 20,
                "o": 0
            }
        ], null, 2), true)
    }

}


export default DataResolverEditor

