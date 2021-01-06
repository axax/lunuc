import Util from 'api/util'
import {ObjectId} from 'mongodb'
import path from 'path'
import config from 'gen/config'
import fs from 'fs'
import {csv2json} from 'api/util/csv'
import {sendMail} from 'api/util/mail'

const {LANGUAGES, DEFAULT_LANGUAGE} = config


const readCsv = async (db, context) => {
    console.log('Read csv...')
    var fileContents = fs.readFileSync(path.join(__dirname, '../data/flipkart_com-ecommerce_sample.csv'));


    const json = csv2json(fileContents.toString(), ',')
    const productCategoryCollection = await db.collection('ProductCategory')
    const productCollection = await db.collection('Product')

    const categoriesLevelMap = {}
    let countProducts = 0, countCategories = 0
    const categoriesToInsert = {}, productsToInsert = [], createdBy = ObjectId(context.id)
    for (const row of json) {

        const cats = JSON.parse(row.product_category_tree)[0].split('>>')

        if (cats.length > 1) {

            countProducts++

            const productData = {
                description: {},
                name: {},
                categories: [],
                createdBy,
                visible:true,
                price: parseFloat(row.retail_price)
            }

            for (const lang of LANGUAGES) {
                productData.name[lang] = row.product_name + (lang !== DEFAULT_LANGUAGE ? ' [' + lang + ']' : '')
                productData.description[lang] = row.description + (lang !== DEFAULT_LANGUAGE ? ' [' + lang + ']' : '')
            }

            let images
            try {
                images = JSON.parse(row.image)
            } catch (e) {
            }

            if (images && images.length) {
                productData.image_src = images[images.length-1]
            }


            for (let level = 0; level < cats.length; level++) {

                const cat = cats[level].trim()

                if (!categoriesLevelMap[level + '-' + cat]) {
                    countCategories++

                    if (!categoriesToInsert[level]) {
                        categoriesToInsert[level] = []
                    }
                    const data = {name: {}, createdBy}

                    for (const lang of LANGUAGES) {
                        data.name[lang] = cat + (lang !== DEFAULT_LANGUAGE ? ' [' + lang + ']' : '')
                    }
                    categoriesToInsert[level].push(data)
                    categoriesLevelMap[level + '-' + cat] = data
                }

                if (productData.categories.indexOf(level + '-' + cat) < 0) {
                    productData.categories.push(level + '-' + cat)
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

            productsToInsert.push(productData)
        }
    }

    Object.keys(categoriesToInsert).forEach(level => {
        const catByLevel = categoriesToInsert[level]
        productCategoryCollection.insertMany(catByLevel)

        const nextLevel = parseInt(level) + 1
        if (categoriesToInsert[nextLevel]) {
            // set parent ids
            const idMap = {}
            for (const data of catByLevel) {
                idMap[data.name[DEFAULT_LANGUAGE]] = data._id
            }

            for (const data of categoriesToInsert[nextLevel]) {
                if (data.parentCategory) {
                    const pIds = []
                    for (const pCat of data.parentCategory) {
                        if (idMap[pCat]) {
                            pIds.push(idMap[pCat])
                        }
                    }
                    data.parentCategory = pIds
                }
                // console.log(dateToInsert[nextLevel])
            }
        }
    })

    // replace category names with ids
    for (const product of productsToInsert) {
        const catIds = []
        for (const cat of product.categories) {
            if (categoriesLevelMap[cat]) {
                catIds.push(categoriesLevelMap[cat]._id)
            }
        }
        product.categories = catIds
    }

    productCollection.insertMany(productsToInsert)

    return {countCategories, countProducts}

}


export default db => ({
    Query: {
        shopImportSampleData: async ({}, {context}) => {
            Util.checkIfUserIsLoggedIn(context)

            const {countCategories, countProducts} = await readCsv(db, context)

            return {status: 'complete', message: `${countProducts} products and ${countCategories} categories has been imported.`}
        },
        placeOrder: async ({}, req) => {
            const {context} = req
            Util.checkIfUserIsLoggedIn(context)

            const user = await Util.userById(db, context.id)

            await sendMail(db, context, {slug:'shop/mail/template/order', recipient: user.email, subject:'test', body: '{}', req})

            return {status: 'complete', message: `.`}
        }
    }
})
