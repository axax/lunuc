import React from 'react'
import {
    SimpleDialog
} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'
import GenericForm from '../../../client/components/GenericForm'
import {getTypeQueries} from 'util/types.mjs'
import {Query} from '../../../client/middleware/graphql'
import OpenTypeEdit from '../components/OpenTypeEdit'
import {propertyByPath} from '../../../client/util/json.mjs'


function getDataResolverProperty({cmsEditData, editor}) {
    const path = cmsEditData._id
    const {segment} = editor.findSegmentInDataResolverByKeyOrPath({path})


    if (segment) {
        try {
            let props
            if (cmsEditData.props) {

                if (cmsEditData.props.constructor === Object) {
                    props = cmsEditData.props
                } else {
                    const correctJson = cmsEditData.props.replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ');
                    props = JSON.parse(correctJson)
                }
            }
            const newProps = {value: propertyByPath(path, segment)}
            if (newProps.value.constructor === Object || newProps.value.constructor === Array) {
                newProps.uitype = 'json'
            }
            return {field: {...newProps, ...props}}

        } catch (e) {
            console.log(e)
            return {field: {value: '', error: true, helperText: e.message}}
        }


    }
    return {field: {value: ''}}
}


export default function CmsDataEditDialog({cmsEditData, editor}) {
    if (cmsEditData) {
        if (cmsEditData.type) {

            function handleEditDataClose(action, {optimisticData, dataToEdit, type}) {

                if (optimisticData) {
                    if (!dataToEdit) {
                        window.location.href = window.location.href
                        return
                    } else {
                        editor.findAndUpdateResolvedData(cmsEditData._jsonDom.scope.root, cmsEditData.resolverKey || type, type, optimisticData, dataToEdit)
                    }
                }
                editor.editCmsData(null)
            }

            if (cmsEditData._id) {
                return <Query key="dataEditor"
                              query={getTypeQueries(cmsEditData.type).query}
                              variables={{
                                  filter: `_id=${cmsEditData._id}`,
                                  meta: cmsEditData.genericType || cmsEditData.resolverKey
                              }}
                              fetchPolicy="network-only">

                    {({loading, error, data}) => {
                        if (loading) {
                            return 'Loading...'
                        }

                        if (error) return `Error! ${error.message}`

                        const keys = Object.keys(data)
                        let finalData
                        if (keys.length > 0) {
                            finalData = data[keys[0]]
                        }

                        if (!finalData || finalData.results.length === 0) {

                            editor.setState({
                                cmsEditData: null,
                                simpleDialog: {
                                    title: _t('CmsDataEditDialog.notEditable'),
                                    text: _t('CmsDataEditDialog.noAccess')
                                }
                            })
                            return null
                        }

                        return <OpenTypeEdit
                            onClose={handleEditDataClose}
                            cmsEditData={cmsEditData}
                            data={finalData}/>
                    }}
                </Query>
            } else {
                return <OpenTypeEdit
                    onClose={handleEditDataClose}
                    cmsEditData={cmsEditData}/>
            }
        } else {
            let formRef
            return <SimpleDialog fullWidth={true} maxWidth="sm" key="propertyEditor" open={true}
                                 onClose={(e) => {
                                     if (e.key === 'save' && formRef) {
                                         const field = formRef.state.fields.field
                                         editor.handleDataResolverPropertySave({
                                             value: field,
                                             path: cmsEditData._id,
                                             instantSave: true
                                         })
                                     }
                                     editor.editCmsData(null)
                                 }}
                                 actions={[{
                                     key: 'cancel',
                                     label: _t('core.cancel'),
                                     type: 'secondary'
                                 },
                                     {
                                         key: 'save',
                                         label: _t('core.save'),
                                         type: 'primary'
                                     }]}
                                 title="Bearbeitung">

                <GenericForm primaryButton={false} onRef={(e) => {
                    formRef = e
                }} fields={getDataResolverProperty({editor, cmsEditData})}/>


            </SimpleDialog>
        }
    }
}