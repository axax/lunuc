import GenericResolver from './generic/genericResolver'
import ReactDOMServer from 'react-dom/server'
import JsonDom from 'client/components/JsonDom'
import React from 'react'
import Util from '../util'


export const cmsResolver = (db) => ({
    cmsPages: async ({limit, offset}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return await GenericResolver.entities(db,context,'CmsPage',['slug','template','script','dataResolver'],{limit, offset})
    },
    cmsPage: async ({slug,render}, {context}) => {
        const cmsPages=await GenericResolver.entities(db,context,'CmsPage',['slug','template','script','dataResolver'],{match:{slug}})

        if( cmsPages.results.length==0){
            throw new Error('Cms page doesn\'t exist')
        }

        const {_id, createdBy, template,script,dataResolver} = cmsPages.results[0]

        let html

        if( render ) {
            // Server side rendering
            // todo: ssr for apollo https://github.com/apollographql/apollo-client/blob/master/docs/source/recipes/server-side-rendering.md

            try {
                const js = new Function(script)();

                const scope = {page: {slug}, client: js}

                html = ReactDOMServer.renderToString(<JsonDom template={template} scope={JSON.stringify(scope)}/>)
            } catch (e) {
                html = e.message
            }
            console.log(html)
        }

        if( Util.isUserLoggedIn(context) ){
            return {
                _id,
                createdBy,
                slug,
                template,
                script,
                dataResolver,
                html
            }
        }else{
            // if user is not looged in return only slug and rendered html
            return {
                slug,
                html
            }
        }

    },
    createCmsPage: async ({slug}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        if( !slug || slug.trim() === '' ){
            throw new Error('Slug is empty or invalid')
        }
        return await GenericResolver.createEnity(db,context,'CmsPage',{slug})
    },
    updateCmsPage: async ({_id, ...rest}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return GenericResolver.updateEnity(db,context,'CmsPage',{_id,...rest})
    },
    deleteCmsPage: async ({_id}, {context}) => {
        Util.checkIfUserIsLoggedIn(context)
        return GenericResolver.deleteEnity(db,context,'CmsPage',{_id})
    }
})