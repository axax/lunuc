import React from 'react'
import {
    TextField,
    SimpleSelect,
    SimpleSwitch
} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'

export default function CmsPageOptions(props){

    const {onChange, cmsPage, values, canMangeCmsTemplate} = props

    return <>
        <TextField key="pageTitle"
                   name="pageTitle"
                   label={_t('CmsViewEditorContainer.pageTitle')}
                   InputLabelProps={{
                       shrink: true,
                   }}
                   onBlur={(e) => {
                       let value = {...cmsPage.name, [_app_.lang]: e.target.value}
                       onChange('name', null, value)
                   }}
                   sx={{ mt: 0, mb: 2 }}
                   value={values.name ? values.name[_app_.lang] : ''}
                   fullWidth={true}/>

        <TextField key="pageKeywords"
                   name="pageKeywords"
                   label={_t('CmsViewEditorContainer.pageKeywords')}
                   InputLabelProps={{
                       shrink: true,
                   }}
                   onBlur={(e) => {
                       let value = {...cmsPage.keyword, [_app_.lang]: e.target.value}
                       onChange('keyword', null, value)
                   }}
                   sx={{ mt: 0, mb: 2 }}
                   value={values.keyword ? values.keyword[_app_.lang] : ''}
                   fullWidth={true}/>

        <TextField key="pageDescription"
                   name="pageDescription"
                   label={_t('CmsViewEditorContainer.pageDescription')}
                   InputLabelProps={{
                       shrink: true,
                   }}
                   multiline={true}
                   onChange={(e) => {
                       let value = {...cmsPage.description, [_app_.lang]: e.target.value}
                       onChange('description', null, value)
                   }}
                   sx={{ mt: 0, mb: 2 }}
                   value={values.description ? values.description[_app_.lang] : ''}
                   fullWidth={true}/>

        {canMangeCmsTemplate ? <React.Fragment>
                <SimpleSelect
                    fullWidth={true}
                    label="Url sensitive (refresh component on url or props change)"
                    value={values.urlSensitiv == 'true' ? 'full' : values.urlSensitiv}
                    sx={{ mt: 0, mb: 2 }}
                    onChange={(e) => {
                        onChange('urlSensitiv', null, e.target.value)
                    }}
                    items={[{name: 'None', value: ''}, {
                        name: 'Full',
                        value: 'full'
                    }, {name: 'Client (nothing is sent to the server)', value: 'client'}]}
                /><br/>
                <SimpleSwitch
                    label="SSR (Server side Rendering)"
                    checked={!!values.ssr}
                    onChange={onChange.bind(this, 'ssr')}
                /><br/>
                <SimpleSwitch
                    label={_t('CmsViewEditorContainer.public')}
                    checked={!!values.public}
                    onChange={onChange.bind(this, 'public')}
                /><br/>
                <SimpleSwitch
                    label="Always load assets (even when component is loaded dynamically)"
                    checked={!!values.alwaysLoadAssets}
                    onChange={onChange.bind(this, 'alwaysLoadAssets')}
                /><br/>
                <SimpleSwitch
                    label="Load page options"
                    checked={!!values.loadPageOptions}
                    onChange={onChange.bind(this, 'loadPageOptions')}
                /><br/>
                <SimpleSwitch
                    label="Compress response"
                    checked={!!values.compress}
                    onChange={onChange.bind(this, 'compress')}
                /><br/>
                <SimpleSwitch
                    label="Server side style rendering"
                    checked={!!values.ssrStyle}
                    onChange={onChange.bind(this, 'ssrStyle')}
                /><br/>
                <SimpleSwitch
                    label="Page is publicly editable"
                    checked={!!values.publicEdit}
                    onChange={onChange.bind(this, 'publicEdit')}
                /><br/>
                <SimpleSwitch
                    label="Parse resolvedData in frontend (replace placeholders)"
                    checked={!!values.parseResolvedData}
                    onChange={onChange.bind(this, 'parseResolvedData')}
                /></React.Fragment>:
            <React.Fragment>

                <SimpleSwitch
                    label={_t('CmsViewEditorContainer.public')}
                    checked={!!values.public}
                    onChange={onChange.bind(this, 'public')}
                /><br/>

            </React.Fragment>}
    </>

}
