import GenericResolver from './generic/genericResolver'



export const cmsResolver = (db) => ({
    cmsPages: async ({limit, offset}, {context}) => {
        return await GenericResolver.entities(db,context,'CmsPage',['slug'],{limit, offset})
    },
    cmsPage: async ({slug}, {context}) => {
        const cmsPages=await GenericResolver.entities(db,context,'CmsPage',['slug'],{match:{slug}})
        return cmsPages.results[0]
    },
    createCmsPage: async ({slug}, {context}) => {
        if( !slug || slug.trim() === '' ){
            throw new Error('Slug is empty or invalid')
        }
        return await GenericResolver.createEnity(db,context,'CmsPage',{slug})
    },
    updateCmsPage: async ({_id, slug}, {context}) => {
        return GenericResolver.updateEnity(db,context,'CmsPage',{_id,slug})
    },
    deleteCmsPage: async ({_id}, {context}) => {
        return GenericResolver.deleteEnity(db,context,'CmsPage',{_id})
    }
})