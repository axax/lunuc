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

    const media = settings.Media

    const [group, setGroup] = useState(
        media && media.group ? media.group : []
    )

    const [conversion, setConversion] = useState(
        media && media.conversion ? media.conversion : []
    )

    let groupIds = null
    if (group.length > 0) {
        groupIds = []
        group.forEach((g) => {
            groupIds.push(g._id)
        })

    }

    let currentJson = null
    if (conversion.length > 0) {
        currentJson = JSON.parse(conversion[0].conversion)
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
                      conversion={currentJson}
                      onSuccess={r => {
                          setTimeout(() => {
                              getData(pageParams, false)
                          }, 2000)
                      }}/>
        </Col>
        <Col md={3}>

            <TypePicker value={conversion} onChange={(e) => {
                setConversion(e.target.value)
            }} name="conversion" placeholder={_t('Media.selectConversion')}
                        type="MediaConversion"/>
            <TypePicker value={group} onChange={(e) => {
                setGroup(e.target.value)
            }} multi={false} name="group" placeholder={_t('Media.selectGroup')}
                        type="MediaGroup"/>
        </Col>
    </Row>
}