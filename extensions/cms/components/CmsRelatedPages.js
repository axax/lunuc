import {Query} from '../../../client/middleware/graphql'
import React from 'react'
import {
    MenuList,
    MenuListItem,
} from 'ui/admin'
import {_t} from '../../../util/i18n.mjs'


export default function CmsRelatedPages(props){
    const {_version, cmsPage, slug, history} = props

    if(!cmsPage){
        return null
    }

    return <MenuList>
        <Query
            query={`query cmsPages($filter:String,$limit:Int,$_version:String){cmsPages(filter:$filter,limit:$limit,_version:$_version){results{slug public modifiedAt name{${_app_.lang}}}}}`}
            fetchPolicy="cache-and-network"
            variables={{
                _version,
                limit: 99,
                filter: `slug=^${cmsPage.realSlug.split('/')[0]}$ slug=^${cmsPage.realSlug.split('/')[0]}/`
            }}>
            {({loading, error, data}) => {
                if (loading) return 'Loading...'
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
                return menuItems
            }}
        </Query>
    </MenuList>
}