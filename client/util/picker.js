import Hook from '../../util/hook.cjs'
import {performFieldProjection} from '../../util/project.mjs'
import Util from './index.mjs'

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

export {convertRawValuesFromPicker}
