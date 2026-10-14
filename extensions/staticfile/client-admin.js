import React from 'react'
import Hook from 'util/hook.cjs'
import Async from '../../client/components/Async'
import {CAPABILITY_ADMIN_OPTIONS} from '../../util/capabilities.mjs'
import {_t, registerTrs} from '../../util/i18n.mjs'
import Util from '../../client/util/index.mjs'
import {translations} from './translations/admin'
registerTrs(translations, 'StaticFile')

const MultiUpload = (props) => <Async {...props}
                                      load={() => import(/* webpackChunkName: "admin" */ './components/MultiUpload')}/>

const FileDrop = (props) => <Async {...props}
                                   load={() =>import(/* webpackChunkName: "admin" */ '../../client/components/FileDrop')}/>

export default () => {
    // add some extra data to the table
    Hook.on('TypeTable', ({type, dataSource, data}) => {
        if (type === 'StaticFile') {
            dataSource.forEach((d, i) => {
                const item = data.results[i]

                if (item) {
                    d.name =
                        <a target="_blank" rel="noopener noreferrer" href={`/${item.name}`}>
                            {item.name}
                        </a>
                }
            })
        }
    })

    // add some extra data to the table
    Hook.on('TypeCreateEdit', function ({type, props, parentRef}) {
        if (type === 'StaticFile') {
            props.children = [props.children, <FileDrop key="fileDrop"
                                                        multi={false}
                                                        accept="*/*"
                                                        maxSize={10000}
                                                        imagePreview={false}
                                                        onDataUrl={(file,dataUrl) => {

                                                            const form = parentRef.createEditForm

                                                            form.handleInputChange({
                                                                target: {
                                                                    name: 'content',
                                                                    value: dataUrl
                                                                }
                                                            })

                                                            //form.setState({fields: {...form.state.fields, content:dataUrl}})
                                                        }}/>]
        }
    })




    // add some extra data to the table
    Hook.on('TypeTableAction', function ({type, actions}) {
        if (type === 'StaticFile') {



            if (Util.hasCapability({userData: _app_.user}, CAPABILITY_ADMIN_OPTIONS)) {
                actions.push({
                    divider: true,
                    icon: 'upload',
                    name: _t('StaticFile.multiUpload'),
                    onClick: () => {
                        let changed = false
                        this.setState({
                            simpleDialog: {
                                title: _t('StaticFile.multiUpload'),
                                maxWidth: 'lg',
                                fullWidth: true,
                                actions: [{key: 'close', label: 'OK'}],
                                onClose: () => {
                                    this.setState({simpleDialog: false})
                                    if (changed) {
                                        // reload table so new/replaced files show up
                                        this.getData(this.pageParams, false)
                                    }
                                },
                                children: <MultiUpload key="multiUpload"
                                                       type={type}
                                                       onUploaded={() => {
                                                           changed = true
                                                       }}/>
                            }
                        })
                    }
                })
            }
        }
    })

}
