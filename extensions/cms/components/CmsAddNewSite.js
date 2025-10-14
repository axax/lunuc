import Util from '../../../client/util/index.mjs'
import React from 'react'
import {
    SimpleDialog
} from 'ui/admin'
import {getTypeQueries} from 'util/types.mjs'
import {client} from '../../../client/middleware/graphql'
import GenericForm from '../../../client/components/GenericForm'
import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../constants/index.mjs'
import {_t} from '../../../util/i18n.mjs'
import {CAPABILITY_MANAGE_OTHER_USERS} from '../../../util/capabilities.mjs'

export function CmsAddNewSite(props) {
    const {addNewSite, cmsPage, onClose} = props

    if (!cmsPage) {
        return null
    }

    const canMangeCmsTemplate = Util.hasCapability(_app_.user, CAPABILITY_MANAGE_CMS_TEMPLATE)
    const canManageOtherUsers = Util.hasCapability(_app_.user, CAPABILITY_MANAGE_OTHER_USERS)
    if (addNewSite.slug && !canManageOtherUsers) {
        addNewSite.slug = Util.removeSlugContext('/' + addNewSite.slug).substring(1)
    }

    const [defaultValues, setDefaultValues] = React.useState(addNewSite)
    const [form, setForm] = React.useState(null)

    return <SimpleDialog fullWidth={true}
                         maxWidth="md"
                         key="newSiteDialog"
                         open={true}
                         onClose={(e) => {
                             if (e.key === 'ok') {
                                 const formValidation = form.validate()
                                 if (formValidation.isValid) {
                                     const values = form.state.fields
                                     if (values._id) {
                                         const queries = getTypeQueries('CmsPage')
                                         let slug = values.slug.trim()
                                         if (slug.startsWith('/')) {
                                             slug = slug.substring(1)
                                         }
                                         if (_app_.slugContext && !canManageOtherUsers) {
                                             slug = _app_.slugContext + '/' + slug
                                         }
                                         slug = Util.removeTrailingSlash(slug)

                                         const name = Object.assign({}, values.name)
                                         delete name.__typename
                                         delete name._localized
                                         client.mutate({
                                             mutation: queries.clone,
                                             variables: {
                                                 _id: values._id[0]._id,
                                                 slug,
                                                 name
                                             },
                                             update: (store, {data, errors}) => {
                                                 console.log(data)
                                                 if (!errors) {
                                                     window.location.href = `/${slug}`
                                                 } else {
                                                     form.setState({
                                                         isValid: false,
                                                         fieldErrors: {slug: errors[0].message}
                                                     })
                                                 }
                                             }
                                         })
                                     }
                                 }
                             } else if (addNewSite.slugNoExist) {
                                 window.history.back()
                             } else {
                                 onClose()
                             }
                         }}
                         actions={[{
                             key: 'cancel',
                             label: _t('CmsAddNewSite.cancel'),
                             type: 'secondary'
                         }, {
                             key: 'ok',
                             label: _t('CmsAddNewSite.create'),
                             type: 'primary'
                         }]}
                         title={addNewSite.slugNoExist ? _t('CmsAddNewSite.createPageIfNotExist', {slug: addNewSite.slug}) : _t('CmsAddNewSite.createPage')}>


        <GenericForm onRef={setForm}
                     primaryButton={false}
                     values={defaultValues}
                     onChange={(formField) => {
                         if (formField.name === '_id') {
                             const fields = form.state.fields
                             const values = {_id: fields._id}

                             if (fields.slug) {
                                 values.slug = fields.slug
                             } else {
                                 values.slug = formField.value[0].slug
                             }
                             if (values.slug && !canManageOtherUsers) {
                                 values.slug = Util.removeSlugContext('/' + values.slug).substring(1)
                             }
                             if (fields.name) {
                                 values.name = fields.name
                             } else {
                                 values.name = formField.value[0].name
                             }
                             setDefaultValues(values)
                         }
                     }}
                     fields={{
                         _id: {
                             uitype: 'type_picker',
                             type: 'CmsPage',
                             placeholder: _t('CmsAddNewSite.selectTemplate'),
                             fullWidth: true,
                             label: _t('CmsAddNewSite.template'),
                             searchFields: ['name'],
                             required: true,
                             filter: !canMangeCmsTemplate ? 'isTemplate=true' : ''
                         },
                         slug: {
                             fullWidth: true,
                             label: _t('CmsAddNewSite.urlPath'),
                             required: true
                         },
                         name: {
                             fullWidth: true,
                             label: _t('CmsAddNewSite.title'),
                             localized: true
                         }
                     }}/>


    </SimpleDialog>
}