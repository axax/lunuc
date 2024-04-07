import Util from '../../../client/util/index.mjs'
import {CAPABILITY_VIEW_CMS_EDITOR} from '../constants/index.mjs'
import {NO_SESSION_KEY_VALUES} from '../../../client/constants/index.mjs'
import config from '../../../gensrc/config-client.js'

//map with slugs that are url sensitive
export const urlSensitivMap = {}

// the key prefix to store the settings in the keyvalue store
export const settingKeyPrefix = 'CmsViewContainerSettings'

// the graphql query is also need to access and update the cache when data arrive from a subscription
const CMS_PAGE_QUERY = `query cmsPage($slug:String!,$query:String,$meta:String,$props:String,$nosession:String,$editmode:Boolean,$inEditor:Boolean,$dynamic:Boolean,$_version:String){
cmsPage(slug:$slug,query:$query,meta:$meta,props:$props,nosession:$nosession,inEditor:$inEditor,editmode:$editmode,dynamic:$dynamic,_version:$_version){
slug realSlug urlSensitiv keyword{__typename ${config.LANGUAGES.join(' ')}} description{__typename ${config.LANGUAGES.join(' ')}} template script resources resolvedData style html meta subscriptions publicEdit ssrStyle uniqueStyle alwaysLoadAssets parseResolvedData}}`

const CMS_PAGE_QUERY_FULL = `${CMS_PAGE_QUERY.substring(0,CMS_PAGE_QUERY.length-2)} editable name{__typename ${config.LANGUAGES.join(' ')}} serverScript manual dataResolver ssr public online loadPageOptions compress _id modifiedAt createdBy{_id username} status}}`


export const getCmsPageQuery = (props)=>{
    return props.dynamic?CMS_PAGE_QUERY:CMS_PAGE_QUERY_FULL
}

export const isPreview = () => {
    const params = new URLSearchParams(window.location.search)
    return params.get('preview')
}

export const isEditMode = (props) => {
    const {dynamic, cmsPage, forceEditMode} = props


    if(cmsPage) {
        if(forceEditMode===true || forceEditMode === 'true'){
            return true
        }
        if (cmsPage.publicEdit) {
            return true
        } else if (!cmsPage.editable) {
            return false
        }
    }

    return (!dynamic && Util.hasCapability(_app_.user, CAPABILITY_VIEW_CMS_EDITOR)) && !isPreview() && props.editMode !== false
}

export const getSlugVersion = (slug) => {
    const ret = {}
    if (slug.indexOf('@') === 0) {
        const pos = slug.indexOf('/')
        ret.slug = pos >= 0 ? slug.substring(pos + 1) : ''
        ret._version = pos >= 0 ? slug.substring(1, pos) : slug.substring(1)

    } else {
        ret.slug = slug
    }

    return ret
}


export const getGqlVariables = props => {
    const {slug, urlSensitiv, dynamic, _props, inEditor} = props,
        variables = {
            inEditor,
            dynamic: !!dynamic,
            ...getSlugVersion(slug)
        }

    if (_props && _props.$) {
        variables.props = JSON.stringify(_props.$)
    }

    if (isEditMode(props)) {
        variables.editmode = true
    }

    // add settings from local storage if user is not logged in
    if (!_app_.user) {
        const kv = !_app_.noStorage && localStorage.getItem(NO_SESSION_KEY_VALUES + '_SERVER')
        if (kv) {
            variables.nosession = kv
        }
    }
    // add query if page is url sensitiv
    if (urlSensitiv === true  || (!dynamic && urlSensitiv === undefined && (urlSensitivMap[slug] || urlSensitivMap[slug] === undefined))) {
        const q = window.location.search.substring(1)
        if (q)
            variables.query = q
    }

    return variables
}
