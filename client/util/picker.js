import Hook from '../../util/hook.cjs'
import {performFieldProjection} from '../../util/project.mjs'
import Util from './index.mjs'
import {openWindow} from './window'
import config from 'gen/config-client'

const convertRawValuesFromPicker = ({type, fieldsToProject, rawValue, multi}) => {
    Hook.call('TypePickerBeforeHandlePick', {type, fieldsToProject, rawValue})

    //always remove creator
    delete rawValue.createdBy
    let projectedValue = rawValue
    if (fieldsToProject && fieldsToProject.length > 0) {
        projectedValue = performFieldProjection(fieldsToProject, rawValue)
    }

    Util.removeNullValues(projectedValue, {
        recursiv: true,
        emptyObject: true,
        emptyArray: true,
        nullArrayItems: true
    })

    let value = []
    if (Array.isArray(projectedValue)) {
        projectedValue.forEach(itm => {
            value.push({__typename: type, ...itm})
        })
    } else {
        value.push({__typename: type, ...projectedValue})
    }


    if (!multi) {
        // remove all items but last one
        value = value.slice(-1)
    }
    return value;
}

/*
 * Opens the type list (e.g. Media) in a new window to pick entries.
 * With multi = true several entries can be selected at once.
 * onSelect is called with the raw selected value(s) when the window is closed.
 */
const openTypePickerWindow = ({type, multi, filter, label, genericType, includeFields, onSelect}) => {
    const fields = ['info', ...(includeFields || [])].filter((f, i, a) => a.indexOf(f) === i)
    const url = `${_app_.lang !== config.DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/typesblank/?opener=true&includeFields=${fields.join(',')}&multi=${!!multi}&fixType=${type}${genericType ? '&meta=' + genericType : ''}${filter ? '&baseFilter=' + encodeURIComponent(filter) : ''}${label ? '&title=' + encodeURIComponent(label) : ''}`
    const newwindow = openWindow({url})
    setTimeout(() => {
        newwindow.addEventListener('beforeunload', (e) => {
            if (newwindow.resultValue && onSelect) {
                onSelect(newwindow.resultValue)
            }
            delete e['returnValue']
        })
    }, 500)
    return newwindow
}

export {convertRawValuesFromPicker, openTypePickerWindow}
