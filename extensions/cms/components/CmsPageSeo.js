import React from 'react'
import {
    TextField,
} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'
import GenericForm from '../../../client/components/GenericForm'
import {setKeyValue} from '../../../client/util/keyvalue'
import {setPropertyByPath} from '../../../client/util/json.mjs'

export default function CmsPageSeo(props){

    const {onChange, cmsPage, values, extension} = props

    let saveTimeout
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
        {extension.definition && <GenericForm onChange={(e,p) => {
            if(!extension.values){
                extension.values = {}
            }
            setPropertyByPath(e.value,e.name,extension.values)
            clearTimeout(saveTimeout)
            saveTimeout = setTimeout(()=>{
                setKeyValue({key: 'PageExtensions-' + cmsPage.realSlug,value:{seo:extension.values},clearCache:true, global:true}).then(()=>{
                })
            },250)

        }} primaryButton={false} fields={extension.definition} values={extension.values}></GenericForm>}


    </>

}
