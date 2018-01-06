import GenericResolver from './generic/genericResolver'



export const cmsResolver = (db) => ({
    cmsPages: async ({limit, offset}, {context}) => {
        return await GenericResolver.entities(db,context,'CmsPage',['slug','jsonContent'],{limit, offset})
    },
    cmsPage: async ({slug}, {context}) => {
        const cmsPages=await GenericResolver.entities(db,context,'CmsPage',['slug','jsonContent'],{match:{slug}})
        return {
            htmlContent: 'rendered html goes here',
            ...cmsPages.results[0]
        }
    },
    createCmsPage: async ({slug}, {context}) => {
        if( !slug || slug.trim() === '' ){
            throw new Error('Slug is empty or invalid')
        }
        return await GenericResolver.createEnity(db,context,'CmsPage',{slug})
    },
    updateCmsPage: async ({_id, ...rest}, {context}) => {
        return GenericResolver.updateEnity(db,context,'CmsPage',{_id,...rest})
    },
    deleteCmsPage: async ({_id}, {context}) => {
        return GenericResolver.deleteEnity(db,context,'CmsPage',{_id})
    }
})