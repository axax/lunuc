import React from 'react'
import styled from '@emotion/styled'
import {alpha} from '@mui/material/styles'
import {
    SimpleAutosuggest
} from 'ui/admin'


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
        paddingBottom: '0 !important',
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
        apiUrl={'/lunucapi/search?coreType=Media,CmsPage&s=%search%'}
        placeholder="Schnellsuche"
        value={''}
        onChange={(e, item) => {
            //_app_.history.push(`/admin/types/${item.__type}?open=${item._id}`)
            if(item) {
                window.location = `/admin/types/${item.__type}?open=${item._id}`
            }
           /* e.stopPropagation()
            e.preventDefault()*/
        } }
        onBlur={()=>{}}
        onClick={()=>{}}/></SearchWrapper>
}


export default GlobalSearch