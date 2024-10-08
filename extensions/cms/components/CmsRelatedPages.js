import {Query} from '../../../client/middleware/graphql'
import React from 'react'
import {
    MenuList,
    MenuListItem,
    Pagination,
    Stack
} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'


export default function CmsRelatedPages(props){
    const {_version, cmsPage, slug, history} = props

    const limit = 10
    const [page, setPage] = React.useState(1)
    if(!cmsPage){
        return null
    }


    return <Query
            query={`query cmsPages($filter:String,$limit:Int,$page:Int,$_version:String){cmsPages(filter:$filter,limit:$limit,page:$page,_version:$_version){total results{slug public modifiedAt name{${_app_.lang}}}}}`}
            fetchPolicy="cache-and-network"
            variables={{
                _version,
                limit,
                page,
                filter: `slug=~^${cmsPage.realSlug.split('/')[0]}$ slug=~^${cmsPage.realSlug.split('/')[0]}/`
            }}>
            {({loading, error, data}) => {
                if (loading) return <p>Loading...</p>
                if (error) return `Error! ${error.message}`


                const menuItems = []
                data.cmsPages.results.forEach(i => {
                        if (i.slug !== slug) {
                            let src
                            if(i.public){
                                src = `/lunucapi/generate/png?url=/${i.slug}${encodeURI('?preview=true')}&width=1200&height=800&rwidth=120&rheight=80&cache=true&cacheExpire=${new Date(i.modifiedAt).getTime()}`
                            }else{
                                src = `/lunucapi/system/genimage?width=120&height=80&text=Kein Bild&fontsize=1em`
                            }
                            menuItems.push(<MenuListItem key={i.slug} onClick={e => {
                                history.push(`/${i.slug}`)
                            }} button image={<img width={60} height={40}
                                                  src={src}/>} primary={i.name ? i.name[_app_.lang] : ''} secondary={i.slug}/>)
                        }
                    }
                )
                if (menuItems.length === 0) return _t('CmsViewEditorContainer.noRelatedPages')
                return [
                    <MenuList>
                        {menuItems}
                    </MenuList>,
                    <Stack spacing={2} justifyContent="center" alignItems="center">
                        <Pagination size="medium"
                                    showFirstButton
                                    showLastButton
                                    page={page}
                                    onChange={(e, page)=>{
                                        setPage(page)
                                    }}
                                    count={Math.ceil(data.cmsPages.total / limit)} /></Stack>]
            }}
        </Query>
}