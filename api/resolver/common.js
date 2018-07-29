import {speechLanguages, translateLanguages} from '../data/common'


export const commonResolver = (db) => ({
    Query: {
        speechLanguages: (data, {context}) => {
            return {data: speechLanguages, selection: null}
        },
        translateLanguages: (data, {context}) => {
            return {data: translateLanguages, selection: null}
        }
    }
})