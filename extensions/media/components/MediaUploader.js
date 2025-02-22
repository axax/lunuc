import React, {useState} from 'react'
import {_t} from '../../../util/i18n.mjs'
import Async from 'client/components/Async'


const TypePicker = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../../client/components/TypePicker')}/>
const FileDrop = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../../client/components/FileDrop')}/>

export const MediaUploader = ({meta, type}) => {

    const mediaSetting = meta.TypeContainer.settings.Media

    const [conversion, setConversion] = useState(
        mediaSetting && mediaSetting.conversion ? mediaSetting.conversion : []
    )

    const [group, setGroup] = useState(
        mediaSetting && mediaSetting.group ? mediaSetting.group : []
    )

    const [useCdn, setUseCdn] = useState(
        false
    )

    const groupIds = []
    group.forEach(value => {
        groupIds.push(value._id)
    })
    return (
        [
            <div style={{position: 'relative', zIndex: 3}} key="typePicker">
                <TypePicker value={conversion} onChange={(e) => {
                    setConversion(e.target.value)
                    meta.TypeContainer.setSettingsForType(type, {conversion: e.target.value})

                }} name="conversion" placeholder={_t('Media.selectConversion')} type="MediaConversion"/>

                <TypePicker value={group} onChange={(e) => {
                    meta.TypeContainer.setSettingsForType(type, {group: e.target.value})
                    setGroup(e.target.value)
                }} multi={true} name="group" placeholder={_t('Media.selectGroup')}
                            type="MediaGroup"/>
            </div>,
            /*<SimpleSwitch key="useCdn" label="Upload file to CDN" name="useCdn"
                          onChange={(e) => {
                              setUseCdn(e.target.checked)
                          }} checked={useCdn}/>*/,
            <FileDrop key="fileDrop" multi={true}
                      conversion={conversion && conversion.length > 0 ? JSON.parse(conversion[0].conversion) : null}
                      accept="*/*"
                      uploadTo="/graphql/upload"
                      resizeImages={true}
                      data={{group: groupIds, useCdn}}
                      maxSize={10000}
                      imagePreview={false}
                      onSuccess={r => {
                          if (meta.TypeContainer) {
                              setTimeout(() => {
                                  meta.TypeContainer.setState({
                                      createEditDialog: false,
                                      createEditDialogOption: null
                                  })

                                  meta.TypeContainer.getData(meta.TypeContainer.pageParams, false)

                              }, 2000)

                          }
                          // TODO: but it directly into the store instead of reload
                          //const queries = this.getQueries(type), storeKey = this.getStoreKey(type)


                      }}/>]
    )
}