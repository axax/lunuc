import {speechLanguages} from '../data/common'

export const commonResolver = (db) => ({
	speechLanguages: (data, {context}) => {

		return {data: speechLanguages, selection: null}
	}
})