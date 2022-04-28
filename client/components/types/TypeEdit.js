import React from 'react'
import PropTypes from 'prop-types'
import GenericForm from '../GenericForm'
import Hook from '../../../util/hook'
import {getFormFieldsByType, addAlwaysUpdateData, referencesToIds} from '../../../util/typesAdmin'
import {SimpleDialog} from 'ui/admin'
import {_t} from 'util/i18n'
import Util from "../../util";


const compareDataReferences = (prev, current) => {

    if (!prev || !current) {
        // an empty array is same as null
        if (prev && prev.length == 0) {
            prev = null
        }

        return prev !== current
    }

    const prevStr = prev.constructor === String ? prev : (prev.constructor === Array ? prev.map(f => f._id ? f._id : f).join('') : prev._id)
    const currentStr = current.constructor === String ? current : (current.constructor === Array ? current.map(f => f._id ? f._id : f).join('') : current._id)
    return prevStr !== currentStr

}

/*
edit popup with form to edit an object of a type
 */
class TypeEdit extends React.Component {

    createEditForm = null

    constructor(props) {
        super(props)
        this.state = TypeEdit.propsToState(props)
    }


    static getDerivedStateFromProps(nextProps, prevState) {
        if (nextProps.open !== prevState.open || nextProps.dataToEdit !== prevState.dataToEditOri) {
            return TypeEdit.propsToState(nextProps)
        }
        return null
    }

    static propsToState(props) {
        return {
            forceSave: false,
            dataToEditOri: props.dataToEdit,
            dataToEdit: props.dataToEdit,
            open: props.open,
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        return this.state.open !== nextState.open ||
            this.state.dataToEdit !== nextState.dataToEdit
    }

    render() {
        const {title, type, meta} = this.props
        let {dataToEdit, open} = this.state

        if(!open){
            return null
        }

        const formFields = Object.assign({}, getFormFieldsByType(type))

        if (!dataToEdit) {
            dataToEdit = this.props.initialData

        }

        if (!dataToEdit) {
            // delete createdBy if new data is created
            delete formFields.createdBy
        }
        const props = {
            title,
            fullWidth: true,
            fullScreenMobile: true,
            maxWidth: 'xl',
            open,
            onClose: this.handleSaveData.bind(this),
            actions: [
                {
                    key: 'cancel',
                    label: _t('core.cancel')
                },
                {
                    key: 'save',
                    label: _t('core.save'),
                    type: 'primary'
                },
                {
                    key: 'save_close',
                    label: _t('core.saveandclose'),
                    type: 'primary'
                }
            ],
            children: <GenericForm key="genericForm" autoFocus onRef={ref => {
                if(ref) {
                    this.createEditForm = ref
                }
            }} onBlur={event => {
                Hook.call('TypeCreateEditBlur', {type, event})
            }} onChange={field => {
                Hook.call('TypeCreateEditChange', {field, type, props, dataToEdit})
            }} primaryButton={false} fields={formFields} values={dataToEdit}/>
        }

        Hook.call('TypeCreateEdit', {type, props, dataToEdit, formFields, meta, parentRef: this})
        return <SimpleDialog {...props}/>
    }


    handleSaveData = (action) => {
        const {onClose, type, updateData, createData, meta} = this.props
        const {dataToEdit} = this.state
        let editedData

        const closeModal = (optimisticData) => {
            onClose(action, {optimisticData, dataToEdit, type})
        }
        if (action && ['save', 'save_close'].indexOf(action.key) >= 0) {
            const formValidation = this.createEditForm.validate(this.createEditForm.state, true, {changeTab: true})
            if (!formValidation.isValid) {
                return
            }
            editedData = Object.assign({}, this.createEditForm.state.fields)
            const formFields = getFormFieldsByType(type)

            // convert array to single value for not multivalue references
            Object.keys(formFields).forEach(key => {
                const field = formFields[key]
                if (field.reference && !field.multi && editedData[key] && editedData[key].length) {
                    editedData[key] = editedData[key][0]
                } else if (field.type === "Object" && editedData[key] && editedData[key].constructor === Object) {
                    editedData[key] = JSON.stringify(editedData[key])
                }
            })


            // we need another object with the already resolved references for the ui
            const optimisticData = Object.assign({}, editedData)

            Hook.call('TypeCreateEditBeforeSave', {type, dataToEdit, editedData, optimisticData, formFields})

            const callback = ({errors, data}) => {
                // server side validation
                if (errors && errors.length) {
                    const fieldErrors = {}
                    errors.forEach(e => {
                        if (e.state) {
                            Object.keys(e.state).forEach(k => {
                                fieldErrors[k.substring(0, k.length - 5)] = e.state[k]
                            })
                        }
                    })
                    if (Object.keys(fieldErrors).length) {
                        this.createEditForm.setState({fieldErrors})
                    }
                } else {

                    // set use for newly created objects
                    if (!optimisticData._id && data && data['create' + type]) {
                        optimisticData._id = data['create' + type]._id

                        if (!optimisticData.createdBy) {
                            optimisticData.createdBy = data['create' + type].createdBy
                        }

                    }


                    if (action.key === 'save_close') {
                        closeModal(optimisticData)
                    } else {
                        this.setState({dataToEdit: {...dataToEdit, ...optimisticData}})
                    }
                }
            }

            const editedDataWithRefs = referencesToIds(editedData, type)


            // if dataToEdit is set we are in edit mode
            if (dataToEdit && dataToEdit._id) {

                // Attributes are filtered out that have changed
                const editedDataToUpdate = {}
                Object.keys(editedDataWithRefs).forEach(k => {

                    if (this.state.forceSave) {
                        editedDataToUpdate[k] = editedDataWithRefs[k]
                    } else {
                        const before = dataToEdit[k]
                        const fieldDefinition = formFields[k]
                        if (fieldDefinition.reference) {
                            //console.log(before, editedDataWithRefs[k])

                            if (compareDataReferences(before, editedDataWithRefs[k])) {
                                editedDataToUpdate[k] = editedDataWithRefs[k]
                            }
                        } else if (fieldDefinition.type === 'Object') {
                            // stringify Object and compare
                            const s1 = before ? before.constructor !== String ? JSON.stringify(before) : before : ''
                            const s2 = editedDataWithRefs[k] ? editedDataWithRefs[k].constructor !== String ? JSON.stringify(editedDataWithRefs[k]) : editedDataWithRefs[k] : ''
                            if (s1 !== s2) {
                                editedDataToUpdate[k] = s2
                            }
                        }else if(fieldDefinition.localized){

                            if(Util.shallowCompare(editedDataWithRefs[k], before)){
                                editedDataToUpdate[k] = editedDataWithRefs[k]
                            }

                        } else if (editedDataWithRefs[k] !== before) {

                            editedDataToUpdate[k] = editedDataWithRefs[k]
                        }
                    }
                })
                if (Object.keys(editedDataToUpdate).length > 0) {
                    // only send data if they have really changed
                    addAlwaysUpdateData(editedData, editedDataToUpdate, type)
                    updateData({_id: dataToEdit._id, ...editedDataToUpdate}, optimisticData).then(callback).catch(callback)
                } else {
                    if (action.key === 'save_close') {
                        closeModal()
                    }
                }

            } else {
                // create a new entry
                createData(editedDataWithRefs, optimisticData).then(callback).catch(callback)
            }

        } else if (action && (action.key === 'cancel' || action.key === 'Escape')) {
            closeModal()
        } else {
            Hook.call('TypeCreateEditAction', {
                type,
                action,
                dataToEdit,
                meta,
                createEditForm: this.createEditForm
            })
        }
    }
}


TypeEdit.propTypes = {
    type: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
    createData: PropTypes.func.isRequired,
    updateData: PropTypes.func.isRequired,
    title: PropTypes.string,
    open: PropTypes.bool,
    dataToEdit: PropTypes.object,
    meta: PropTypes.object
}


export default TypeEdit
