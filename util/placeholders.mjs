import DomUtil from '../client/util/dom.mjs'

/*
 Replace placeholder within a string
 */

export const replacePlaceholders = (template, context, name) => {
    if (name !== undefined) {
        const re = new RegExp('\\$\\.' + name + '{', 'g')
        template = template.replace(re, '${')
    }
    try {
        return new Function(DomUtil.toES5('const {' + Object.keys(context).join(',') + '} = this.context;return `' + template + '`')).call({context})
    } catch (e) {
        console.warn(e, template, context)
        return e.message
    }
}
