import Util from '../../../client/util'
import {CAPABILITY_MANAGE_CMS_PAGES} from '../constants'
import {NO_SESSION_KEY_VALUES_SERVER} from "../../../client/constants";
import gql from "graphql-tag";

//map with slugs that are url sensitive
export const urlSensitivMap = {}

// the key prefix to store the settings in the keyvalue store
export const settingKeyPrefix = 'CmsViewContainerSettings'

// the graphql query is also need to access and update the cache when data arrive from a subscription
export const gqlQuery = gql`query cmsPage($slug:String!,$query:String,$props:String,$nosession:String,$editmode:Boolean,$_version:String){cmsPage(slug:$slug,query:$query,props:$props,nosession:$nosession,editmode:$editmode,_version:$_version){cacheKey slug name urlSensitiv template script serverScript resources dataResolver ssr public online resolvedData parseResolvedData html subscriptions _id modifiedAt createdBy{_id username} status}}`

// query to get a keyvalue pair
export const gqlQueryKeyValue = gql`query keyValue($key:String!){keyValue(key:$key){key value createdBy{_id}}}`

export const isPreview = () => {
    const params = new URLSearchParams(window.location.search)
    return params.get('preview')
}

export const isEditMode = (props) => {
    const {user} = props
    return (user.isAuthenticated && Util.hasCapability(user, CAPABILITY_MANAGE_CMS_PAGES) && !isPreview())
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
    const {slug, urlSensitiv, dynamic, user, _props} = props,
        variables = {
            ...getSlugVersion(slug)
        }

    if (_props && _props.$) {
        variables.props = JSON.stringify(_props.$)
    }

    if (!dynamic && isEditMode(props)) {
        variables.editmode = true
    }

    // add settings from local storage if user is not logged in
    if (!user.isAuthenticated) {
        const kv = localStorage.getItem(NO_SESSION_KEY_VALUES_SERVER)
        if (kv) {
            variables.nosession = kv
        }
    }

    // add query if page is url sensitiv
    if (urlSensitiv === true || (!dynamic && urlSensitiv === undefined && (urlSensitivMap[slug] || urlSensitivMap[slug] === undefined))) {
        const q = window.location.search.substring(1)
        if (q)
            variables.query = q
    }

    return variables
}
