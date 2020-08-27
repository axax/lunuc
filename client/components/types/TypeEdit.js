import React from 'react'
import PropTypes from 'prop-types'
import GenericForm from '../GenericForm'
import Hook from '../../../util/hook'
import {getFormFields, addAlwaysUpdateData, referencesToIds} from '../../../util/typesAdmin'
import {SimpleDialog} from 'ui/admin'
import { ApolloClient } from '@apollo/client'

class TypeEdit extends React.Component {

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
        const {title, type, meta, client} = this.props
        let {dataToEdit, open} = this.state
        if(!dataToEdit){
            dataToEdit = this.props.initialData
        }

        const formFields = Object.assign({},getFormFields(type))

        if( !dataToEdit) {
            // delete createdBy if new data is created
            delete formFields.createdBy
        }

        const props = {
            title,
            fullWidth: true,
            fullScreen: false,
            maxWidth: 'xl',
            open,
            onClose: this.handleSaveData.bind(this),
            actions: [{key: 'cancel', label: 'Abbrechen'}, {
                key: 'save',
                label: 'Speichern',
                type: 'primary'
            },
                {
                    key: 'save_close',
                    label: 'Speichern & Schliessen',
                    type: 'primary'
                }],
            children: <GenericForm key="genericForm" autoFocus innerRef={ref => {
                this.createEditForm = ref
            }} onBlur={event => {
                Hook.call('TypeCreateEditBlur', {type, event})
            }} onChange={field => {
                Hook.call('TypeCreateEditChange', {field, type, props, dataToEdit, client})
            }} primaryButton={false} fields={formFields} values={dataToEdit}/>
        }
        Hook.call('TypeCreateEdit', {type, props, dataToEdit, formFields, meta, parentRef: this})
        return <SimpleDialog {...props}/>
    }


    handleSaveData = (action) => {
        const {onClose, type, updateData, createData, meta, client} = this.props
        const {dataToEdit} = this.state
        let editedData

        const closeModal = () => {
            onClose(action,{editedData,dataToEdit,type})
        }

        if (action && ['save', 'save_close'].indexOf(action.key) >= 0) {
            const formValidation = this.createEditForm.validate( this.createEditForm.state,true,{changeTab:true})
            if (!formValidation.isValid) {
                return
            }
            editedData = Object.assign({}, this.createEditForm.state.fields)
            const formFields = getFormFields(type)
            Hook.call('TypeCreateEditBeforeSave', {type, dataToEdit, editedData, formFields})

            // convert array to single value for not multivalue references
            Object.keys(formFields).forEach(key => {
                const field = formFields[key]
                if (field.reference && !field.multi && editedData[key] && editedData[key].length) {
                    editedData[key] = editedData[key][0]
                }
            })

            const editedDataWithRefs = referencesToIds(editedData, type)


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

                    if( !editedData._id && data['create' + type]) {
                        editedData._id = data['create' + type]._id
                    }

                    if (action.key === 'save_close') {
                        closeModal()
                    } else {
                        this.setState({dataToEdit: {...dataToEdit, ...editedData}})
                    }
                }
            }

            if (dataToEdit && dataToEdit._id) {

                // if dataToEdit is set we are in edit mode
                const editedDataToUpdate = {}
                Object.keys(editedDataWithRefs).forEach(k => {
                    const before = dataToEdit[k]
                    if (before && before.constructor === Object) {
                        if (before._id !== editedDataWithRefs[k]) {
                            editedDataToUpdate[k] = editedDataWithRefs[k]
                        }
                    } else if (editedDataWithRefs[k] !== before) {
                        editedDataToUpdate[k] = editedDataWithRefs[k]
                    }
                })
                if (Object.keys(editedDataToUpdate).length) {
                    // only send data if they have really changed
                    addAlwaysUpdateData(editedData, editedDataToUpdate, type)

                    updateData({_id: dataToEdit._id, ...editedDataToUpdate}, editedData, meta).then(callback)
                } else {
                    if (action.key === 'save_close') {
                        closeModal()
                    }
                }

            } else {
                // create a new entry

                createData(editedDataWithRefs, editedData, meta).then(callback)
            }

        } else if (action && (action.key === 'cancel' || action.key === 'Escape')) {
            closeModal()
        } else {
            Hook.call('TypeCreateEditAction', {
                type,
                closeModal,
                action,
                dataToEdit,
                client,
                meta,
                createEditForm: this.createEditForm
            })
        }
    }

}


TypeEdit.propTypes = {
    client: PropTypes.instanceOf(ApolloClient).isRequired,
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
