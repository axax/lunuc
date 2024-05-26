import React from 'react'
import {
    TextField,
    SimpleSwitch,
    Divider
} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'

export default function CmsPageSeo(props){

    const {onChange, cmsPage, values} = props

    return <>
        <TextField key="pageTitle"
                   name="pageTitle"
                   label={_t('CmsViewEditorContainer.pageTitle')}
                   InputLabelProps={{
                       shrink: true,
                   }}
                   onChange={(e) => {
                       let value = {...cmsPage.name, [_app_.lang]: e.target.value}
                       onChange('name', null, value)
                   }}
                   sx={{ mt: 0, mb: 2 }}
                   value={values.name ? values.name[_app_.lang] : ''}
                   fullWidth={true}/>

        <TextField key="pageAuthor"
                   name="pageAuthor"
                   label={_t('CmsViewEditorContainer.pageAuthor')}
                   InputLabelProps={{
                       shrink: true,
                   }}
                   onChange={(e) => {
                       onChange('author', null, e.target.value)
                   }}
                   sx={{ mt: 0, mb: 2 }}
                   value={values.author}
                   fullWidth={true}/>

        <TextField key="pageKeywords"
                   name="pageKeywords"
                   label={_t('CmsViewEditorContainer.pageKeywords')}
                   InputLabelProps={{
                       shrink: true,
                   }}
                   onChange={(e) => {
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

        <Divider component="div" role="presentation" sx={{'alignItems': 'start', mt: 3, mb: 3}}></Divider>


        <SimpleSwitch
            disabled={true}
            label={_t('CmsViewEditorContainer.aiContent')}
            checked={!!values.aiSeoContent}
            onChange={onChange.bind(this, 'aiSeoContent')}
        />
    </>

}
