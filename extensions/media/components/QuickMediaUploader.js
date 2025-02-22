import React, {useState} from 'react'
import {_t} from '../../../util/i18n.mjs'
import {
    Row,
    Col
} from 'ui/admin'
import Async from '../../../client/components/Async'

const FileDrop = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../../client/components/FileDrop')}/>
const TypePicker = (props) => <Async {...props} load={import(/* webpackChunkName: "admin" */ '../../../client/components/TypePicker')}/>

export const QuickMediaUploader = (props) => {

    const {settings,pageParams,getData} = props

    let info = ''
    const [group, setGroup] = useState(
        settings.Media && settings.Media.group ? settings.Media.group : []
    )


    let groupIds = null

    if (group.length > 0) {
        groupIds = []
        group.forEach((g) => {
            groupIds.push(g._id)
        })

    }

    const media = settings.Media
    let conversion = null
    if (media && media.conversion && media.conversion.length > 0) {
        conversion = JSON.parse(media.conversion[0].conversion)
        info += ' Conversion=' + media.conversion[0].name
    }


    return <Row spacing={1} style={{marginBottom: '16px'}}>
        <Col md={9}>
            <FileDrop key="fileDrop"
                      multi={true}
                      accept="*/*"
                      uploadTo="/graphql/upload"
                      resizeImages={true}
                      imagePreview={false}
                      maxSize={10000}
                      data={{group: groupIds}}
                      conversion={conversion}
                      onSuccess={r => {
                          setTimeout(() => {
                              getData(pageParams, false)
                          }, 2000)
                      }}/>
        </Col>
        <Col md={3}>

            <TypePicker value={group} onChange={(e) => {
                setGroup(e.target.value)
            }} multi={true} name="group" placeholder={_t('Media.selectGroup')}
                        type="MediaGroup"/>
            <br/>
            <small>{info}</small>
        </Col>
    </Row>
}