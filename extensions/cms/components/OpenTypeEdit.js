import React from 'react'
import TypeEdit from '../../../client/components/types/TypeEdit'
import withType from '../../../client/components/types/withType'

export default function OpenTypeEdit(props){

    const {cmsEditData, onClose, data} = props

    const editDialogProps = {
        type: cmsEditData.type,
        title: cmsEditData.type,
        open: !!cmsEditData,
        onClose
    }

    if (cmsEditData.options && cmsEditData.options.clone) {
        editDialogProps.initialData = Object.assign({}, data.results[0])
        delete editDialogProps.initialData._id
    } else if (cmsEditData.options && cmsEditData.options.create) {
        editDialogProps.initialData = cmsEditData.initialData
    } else {
        editDialogProps.dataToEdit = data.results[0]
    }
    if (cmsEditData.resolverKey) {
        editDialogProps.meta = {data: JSON.stringify({clearCachePrefix: cmsEditData.resolverKey})}
    }
    if (cmsEditData.structure) {
        if (!editDialogProps.meta) {
            editDialogProps.meta = {}
        }
        editDialogProps.meta.structure = cmsEditData.structure
    }

    return React.createElement(
        withType(TypeEdit),
        editDialogProps,
        null
    )

}
