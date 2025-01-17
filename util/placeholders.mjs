import DomUtil from '../client/util/dom.mjs'
import {_t} from './i18n.mjs'

/*
 Replace placeholder within a string
 */

export const replacePlaceholders = (template, context, name) => {
    if (name !== undefined) {
        const re = new RegExp('\\$\\.' + name + '{', 'g')
        template = template.replace(re, '${')
    }
    try {
        return new Function(DomUtil.toES5('const {' + Object.keys(context).join(',').replace(/-|@/g,'_') + '} = this.context,_t=this._t;return `' + template + '`')).call({context,_t})
    } catch (e) {
        console.warn(e, template, context)
        return e.message
    }
}
