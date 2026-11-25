import React from 'react'
import styled from '@emotion/styled'
import {alpha} from '@mui/material/styles'
import {
    SimpleAutosuggest
} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'


const SearchWrapper = styled('div')(({ theme }) => ({
    marginRight: theme.spacing(2),
    marginLeft: 0,
    flex:1,
    width: '100%',
    [theme.breakpoints.up('sm')]: {
        marginLeft: theme.spacing(3),
        width: 'auto',
    },
    '.MuiInputBase-root':{
        color: 'inherit',
        borderRadius: theme.shape.borderRadius,
        backgroundColor: alpha(theme.palette.common.white, 0.15),
        '&:hover': {
            backgroundColor: alpha(theme.palette.common.white, 0.25),
        },
        '&:before':{
            display:'none'
        },
        '&:after':{
            display:'none'
        },
        '& .MuiInputBase-input': {
            padding: `${theme.spacing(1)} !important`,
            transition: theme.transitions.create('width'),
            width: '100%',
            [theme.breakpoints.up('md')]: {
                width: '20ch',
            },
        }
    }
}))


// one request to the search api: types in the SearchIndex (GenericData, CmsPage, Media) are found there
// (ranked, tolerant of typos), the others with the old search. Order of the groups in the list:
const TYPES = ['GenericData', 'CmsPage', 'Media', 'Api', 'CronJob', 'StaticFile', 'Hook', 'KeyValueGlobal']

const localizedName = (item) => {
    let name = item.name || item.key
    if (name && name[_app_.lang]) {
        name = name[_app_.lang]
    }
    return name
}

// the query with every corrected term replaced by its first correction
const correctedQuery = (text, corrections) => text.replace(/[\p{L}\p{N}]+/gu,
    word => (corrections[word.toLowerCase()] && corrections[word.toLowerCase()][0]) || word)

const itemHref = (type, item) => {
    if (type === 'CmsPage') return `/${item.slug}`
    if (type === 'GenericData') return `/admin/types/GenericData?fixType=GenericData&meta=${encodeURIComponent(item.genericType)}&open=${item._id}`
    return `/admin/types/${type}?open=${item._id}`
}

const loadOptions = async (input) => {
    let text = input, typeFilter = ''
    // "media: ..." / "thalverein: ..." -> only types whose name contains the prefix
    const prefix = text.match(/^(\w+):/)
    if (prefix) {
        typeFilter = prefix[1].toLowerCase()
        text = text.substring(prefix[0].length).trim()
    }
    if (!text) {
        return []
    }
    let types = TYPES
    let params = ''
    if (typeFilter) {
        types = TYPES.filter(type => type !== 'GenericData' && type.toLowerCase().indexOf(typeFilter) >= 0)
        // GenericData: all types ("genericdata: ...") or the types whose name contains the prefix
        types.unshift('GenericData')
        if ('genericdata'.indexOf(typeFilter) < 0) {
            params = '&typeFilter=' + encodeURIComponent(typeFilter)
        }
    }
    const json = await fetch(`/lunucapi/search?coreType=${types.join(',')}&suggest=true&lang=${_app_.lang}&s=${encodeURIComponent(text)}${params}`)
        .then(response => response.status === 200 ? response.json() : null).catch(() => null)
    if (!json) {
        return []
    }

    const options = []
    if (json.corrections) {
        const corrected = correctedQuery(text, json.corrections)
        if (corrected !== text) {
            options.push({key: 'correction', name: `${_t('GlobalSearch.didYouMean')}: ${corrected}`, replaceText: (prefix ? prefix[0] + ' ' : '') + corrected})
        }
    }
    types.forEach(type => {
        (json[type] || []).forEach(item => {
            const name = localizedName(item) || item._id
            options.push({
                key: `${type}-${item._id}`,
                name: `${type === 'GenericData' ? item.genericType : type}: ${name}`,
                secondary: item._snippet && item._snippet !== name ? item._snippet : undefined,
                href: itemHref(type, item)
            })
        })
    })
    return options
}

const GlobalSearch = props => {

    return <SearchWrapper><SimpleAutosuggest
        freeSolo
        search
        fullWidth
        historyKey="GlobalSearch"
        loadOptions={loadOptions}
        filterOptions={(options)=>options}
        placeholder={_t('GlobalSearch.placeholder')}
        value={''}
        onChange={(e, item) => {
            // free text (enter without choosing a hit) and history entries have no target
            if(item && item.href) {
                window.location = item.href
            }
        } }
        onBlur={()=>{}}
        onClick={()=>{}}/></SearchWrapper>
}


export default GlobalSearch