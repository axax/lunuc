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


const GlobalSearch = props => {

    return <SearchWrapper><SimpleAutosuggest
        freeSolo
        search
        fullWidth
        historyKey="GlobalSearch"
        apiUrl={(searchData)=>{
            let coreTypes = ['Media', 'CmsPage', 'Api', 'CronJob','StaticFile','Hook','KeyValueGlobal']
            const regex = /^\w+:/g
            const matches = searchData.text.match(regex)

            if(matches && matches.length > 0){
                const match = matches[0].substring(0, matches[0].length-1)
                const filteredTypes = coreTypes.filter(type => type.toLowerCase().indexOf(match)>=0)
                if(filteredTypes.length>0) {
                    coreTypes = filteredTypes
                }
                searchData.text = searchData.text.substring(match.length+1)
            }
            return `/lunucapi/search?coreType=${coreTypes.join(',')}&s=%search%`
        }}
        filterOptions={(options)=>options}
        placeholder={_t('GlobalSearch.placeholder')}
        value={''}
        nameRender={(item, key)=>{
            let name = item.name || item.key
            if(name && name[_app_.lang]){
                name = name[_app_.lang]
            }
            return `${key}: ${name}`
        }}
        onChange={(e, item) => {
            //_app_.history.push(`/admin/types/${item.__type}?open=${item._id}`)
            if(item) {
                console.log(item)
                if(item.__type==='CmsPage'){
                    window.location = `/${item.slug}`
                }else {
                    window.location = `/admin/types/${item.__type}?open=${item._id}`
                }
            }
           /* e.stopPropagation()
            e.preventDefault()*/
        } }
        onBlur={()=>{}}
        onClick={()=>{}}/></SearchWrapper>
}


export default GlobalSearch