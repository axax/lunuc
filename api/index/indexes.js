import Hook from '../../util/hook'
import {getTypes} from 'util/types'
import config from 'gen/config'

const {LANGUAGES} = config

/*
Here all mongodb indexes are created
 */
export const createAllIndexes = async (db) => {

    console.log('Creating indexes...')
    db.collection('KeyValue').createIndex({createdBy: 1, key: 1}, {unique: true})
    db.collection('KeyValueGlobal').createIndex({key: 1}, {unique: true})


    db.collection('User').createIndex({email: 1}, {unique: true})
    db.collection('User').createIndex({username: 1}, {unique: true})

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
                        db.collection(typeName).createIndex({[field.name]: field.index}, {
                            background: true,
                            unique: !!field.unique
                        })
                    }
                }
            }
        }
        if( Object.keys(textIndex).length > 0){
            db.collection(typeName).createIndex(textIndex).catch(async e=>{
                console.error(e)
            })
        }
    }

    Hook.call('index', {db})

}

