import Util from '../../../../api/util/index.mjs'
import {propertyByPath} from '../../../../client/util/json.mjs'
import {resolveData} from '../dataResolver.mjs'
import {getCmsPage} from '../cmsPage.mjs'

export const resolveFrom = async ({segment, db, context, resolvedData, scope, nosession, req, editmode, dynamic}) => {
    const resolveFrom = segment.resolveFrom

    if (resolveFrom.KeyValueGlobal) {
        let dataFromKey = await Util.getKeyValueGlobal(db, context, resolveFrom.KeyValueGlobal, !!resolveFrom.path)

        if (resolveFrom.parse === false) {
            if (resolveFrom.path) {
                dataFromKey = propertyByPath(resolveFrom.path, dataFromKey)
            }
            resolvedData[resolveFrom.path] = dataFromKey
        } else {
            if (resolveFrom.path) {
                dataFromKey = JSON.stringify(propertyByPath(resolveFrom.path, dataFromKey))
            }
            const resolvedFromKey = await resolveData({
                db,
                context,
                dataResolver: dataFromKey,
                scope,
                nosession,
                req,
                editmode,
                dynamic
            })
            console.log(dataFromKey)
            Object.keys(resolvedFromKey.resolvedData).forEach(k => {
                resolvedData[k] = resolvedFromKey.resolvedData[k]
            })
        }
    } else if(resolveFrom.CmsPage){

        for(const fromCmsPage of resolveFrom.CmsPage){
            const cmsPages = await getCmsPage(                {db,
                context,
                slug: fromCmsPage.slug,
                checkHostrules: false,
                inEditor: false,
                editmode: false})

            if(cmsPages.results.length>0) {
                const cmsPage = cmsPages.results[0]
                if(cmsPage){
                    if(fromCmsPage.extendData && cmsPage.dataResolver){
                        const dataResolver = JSON.parse(cmsPage.dataResolver)
                        dataResolver.forEach(data=>{
                            if(data.data) {
                                if(!resolveData.data){
                                    resolvedData.data = {}
                                }
                                Object.keys(data.data).forEach(key=>{
                                    resolvedData[key] = Object.assign({}, data.data[key], resolvedData[key])
                                })
                            }
                        })
                    }
                }
            }
        }

    }
}
