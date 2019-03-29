import Util from 'api/util'
import {ObjectId} from 'mongodb'
import path from 'path'
import config from 'gen/config'
import fs from 'fs'
import {csv2json} from 'api/util/csv'

const {LANGUAGES} = config


const readCsv = async (db, context) => {
    console.log('Read csv...')
    var fileContents = fs.readFileSync(path.join(__dirname, '../data/flipkart_com-ecommerce_sample.csv'));


    const json = csv2json(fileContents.toString(), ',')
    const productCategoryCollection = await db.collection('ProductCategory')

    const categoriesLevelMap = {}
    let countProducts = 0, countCategories = 0
    const dateToInsert = {}
    for (const row of json) {
        const cats = JSON.parse(row.product_category_tree)[0].split('>>')
        if (cats.length > 1) {
            countProducts++
            for (let level = 0; level < cats.length; level++) {

                const cat = cats[level].trim()

                if (!categoriesLevelMap[level + '-' + cat]) {
                    countCategories++

                    if (!dateToInsert[level]) {
                        dateToInsert[level] = []
                    }
                    const data = {name: {}, createdBy: ObjectId(context.id)}

                    for (const lang of LANGUAGES) {
                        data.name[lang] = cat + (lang !== LANGUAGES[0] ? ' [' + lang + ']' : '')
                    }
                    dateToInsert[level].push(data)
                    categoriesLevelMap[level + '-' + cat] = data
                }

                if (level > 0) {
                    if (!categoriesLevelMap[level + '-' + cat].parentCategory) {
                        categoriesLevelMap[level + '-' + cat].parentCategory = []
                    }
                    const pcat = cats[level - 1].trim()
                    if (categoriesLevelMap[level + '-' + cat].parentCategory.indexOf(pcat) < 0) {
                        categoriesLevelMap[level + '-' + cat].parentCategory.push(pcat)
                    }
                }


            }
        }
    }

    Object.keys(dateToInsert).forEach(level => {
        const catByLevel = dateToInsert[level]
        productCategoryCollection.insertMany(catByLevel)

        const nextLevel = parseInt(level) + 1
        if (dateToInsert[nextLevel]) {
            // set parent ids
            const idMap = {}
            for (const data of catByLevel) {
                idMap[data.name[LANGUAGES[0]]] = data._id
            }

            for (const data of dateToInsert[nextLevel]) {
                if (data.parentCategory) {
                    const pIds = []
                    for(const pCat of data.parentCategory){
                        if( idMap[pCat] ){
                            pIds.push(idMap[pCat])
                        }
                    }
                    data.parentCategory = pIds
                }
               // console.log(dateToInsert[nextLevel])
            }
        }

       // console.log(catByLevel)
        return
    })


    //console.log(dateToInsert,countCategories)
    /*
     const result = productCategoryCollection.insertMany(dateToInsert)

     console.log(dateToInsert, count)*/


}


export default db => ({
    Query: {
        shopImportSampleData: async ({}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            readCsv(db, context)

            return {status: 'complete'}
        }
    }
})
