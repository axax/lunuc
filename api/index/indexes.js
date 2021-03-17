import Hook from '../../util/hook'
import {getTypes} from 'util/types'
import config from 'gen/config'

const {LANGUAGES} = config

/*
Here all mongodb indexes are created
 */
export const createAllIndexes = async (db) => {

    console.log(`Creating indexes... ${new Date() - _app_.start}ms`)
    db.collection('KeyValue').createIndex({createdBy: 1, key: 1}, {unique: true})
    db.collection('KeyValueGlobal').createIndex({key: 1}, {unique: true})


    db.collection('User').createIndex({email: 1}, {unique: true})
    db.collection('User').createIndex({username: 1}, {unique: true})

   // await db.collection('Media').dropIndex( 'group_1_mimeType_1')
  /*  console.log(await db.collection('Media').indexes())

    await db.collection('GenericData').dropIndex( 'definition_1__id_1')
    console.log(await db.collection('GenericData').indexes())*/
    //await db.collection('GenericData').dropIndex( 'data.id_1')

    const types = getTypes()

    for (const typeName of Object.keys(types)) {
        const type = types[typeName]
        const textIndex = {}
        for (const field of type.fields) {
            if (field.index) {
                console.log(`Creating index for ${typeName}.${field.name}`)
                if (field.localized) {
                    for (const lang of LANGUAGES) {
                        if( field.index === 'text') {
                            textIndex[field.name + '.' + lang] = 'text'
                        }else{
                            db.collection(typeName).createIndex({[field.name + '.' + lang]: field.index}, {background: true, unique: !!field.unique})
                        }

                    }
                } else {
                    if( field.index === 'text') {
                        textIndex[field.name] = 'text'
                    }else{
                        if( field.compoundIndex){
                            field.compoundIndex.forEach(idx=>{
                                console.log(`Creating compound index for ${JSON.stringify(idx)}`)
                                db.collection(typeName).createIndex(idx.fields, {
                                    background: true
                                })
                            })
                        }

                        if( field.index.constructor === Object){
                            Object.keys(field.index).forEach(k=>{
                                const idx = field.index[k]
                                console.log(`Creating subindex for ${typeName}.${field.name}.${k}`)
                                db.collection(typeName).createIndex({[field.name+'.'+k]: idx}, {
                                    background: true
                                })
                            })
                        }else{
                            db.collection(typeName).createIndex({[field.name]: field.index}, {
                                background: true,
                                unique: !!field.unique
                            })
                        }

                    }
                }
            }
        }


        if(!type.noUserRelation) {
            // create index for createdBy
            console.log(`Creating index for ${typeName}.createdBy`)

            db.collection(typeName).createIndex({createdBy:1}, {
                background: true,
                unique: false
            })
        }



        if( Object.keys(textIndex).length > 0){
            db.collection(typeName).createIndex(textIndex).catch(async e=>{
                console.error(e)
            })
        }
    }

    Hook.call('index', {db})
    console.log(`Creating indexes... ${new Date() - _app_.start}ms`)

}

