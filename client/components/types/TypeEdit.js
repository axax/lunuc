import React from 'react'
import PropTypes from 'prop-types'
import GenericForm from '../GenericForm'
import Hook from '../../../util/hook.cjs'
import {getFormFieldsByType, addAlwaysUpdateData, referencesToIds} from '../../../util/typesAdmin.mjs'
import {SimpleDialog, TextField} from 'ui/admin'
import {_t} from 'util/i18n.mjs'
import Util from '../../util/index.mjs'


const compareDataReferences = (prev, current, fieldDefinition) => {

    if (!prev || !current) {
        // an empty array is same as null
        if (prev && prev.length == 0) {
            prev = null
        }

        return prev !== current
    }
    if(fieldDefinition && fieldDefinition.reference && fieldDefinition.localized){
        const langs = Object.keys(prev)
        for(const lang of langs){
            if(compareDataReferences(prev[lang],current[lang])){
                return true
            }
        }

        return false

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

    componentDidMount() {
        const blocker = _app_.history.block(() => {
            if(this.needsAskForSaving()){
                blocker()
                return false
            }
            return true
        })
    }

    componentWillUnmount() {
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
            askForSaving: false
        }
    }

    shouldComponentUpdate(nextProps, nextState) {
        return this.state.open !== nextState.open ||
            this.state.askForSaving !== nextState.askForSaving ||
            this.state.dataToEdit !== nextState.dataToEdit ||
            this.props.meta !== nextProps.meta
    }

    render() {
        const {title, type, meta, disableEscapeKeyDown} = this.props
        let {dataToEdit, open, askForSaving} = this.state


        if(!open){
            return null
        }

        console.info(`render ${this.constructor.name}`)

        const formFields = Object.assign({}, getFormFieldsByType(type))
        Hook.call('TypeCreateEditFormFields', {type, formFields, dataToEdit})

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
            disableEscapeKeyDown: askForSaving || disableEscapeKeyDown,
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
                if (ref) {
                    this.createEditForm = ref
                }
            }} onBlur={event => {
                Hook.call('TypeCreateEditBlur', {type, event})
            }} onChange={field => {
                Hook.call('TypeCreateEditChange', {field, type, props, dataToEdit})
            }} primaryButton={false} fields={formFields} values={dataToEdit}/>
        }

        Hook.call('TypeCreateEdit', {type, props, dataToEdit, formFields, meta, askForSaving, parentRef: this})
        return <><SimpleDialog {...props}/>
            <SimpleDialog open={askForSaving}
                          onClose={(action) => {
                              if(action.key==='yes') {
                                  this.saveDataIfNeeded({key:'save_close'}, dataToEdit)
                              }else if(action.key==='no') {
                                  this.closeModal({key:'cancel'})
                              }
                          }}
                          disableEscapeKeyDown={true}
                          actions={[{key: 'no', label: 'No'},{key: 'yes', label: 'Yes', type: 'primary'}]}
                          title={_t('TypeEdit.closeConfirmTitle')}>
                {_t('TypeEdit.closeConfirmText')}
            </SimpleDialog>
        </>
    }

    closeModal = (action, optimisticData) => {
        const {onClose, type} = this.props
        const {dataToEdit} = this.state
        onClose(action, {optimisticData, dataToEdit, type})
    }

    needsAskForSaving = () => {
        if(this.createEditForm && Object.keys(this.createEditForm.state.fieldsDirty).length>0){
            const {dataToEdit} = this.state
            this.setState({askForSaving:true, forceSave:true, dataToEdit: Object.assign({}, dataToEdit, this.createEditForm.state.fields)})
            return true
        }
        return false
    }

    handleSaveData = (action) => {
        const {type,meta} = this.props
        const {dataToEdit} = this.state
        if(action && (action.key === undefined || action.key === 'Escape') && this.needsAskForSaving()){
            return
        }
        if (action && ['save', 'save_close'].indexOf(action.key) >= 0) {
            const formValidation = this.createEditForm.validate(this.createEditForm.state, true, {changeTab: true})
            if (!formValidation.isValid) {
                console.warn('validation error',formValidation)
                return
            }
            if(Object.keys(this.createEditForm.state.fieldsDirty).length===0){
                console.warn('nothing to save')
                if (action.key === 'save_close') {
                    this.closeModal(action)
                }
                return
            }
            this.saveDataIfNeeded(action,Object.assign({}, this.createEditForm.state.fields))

        } else if (action && (action.key === 'cancel' || action.key === 'Escape')) {
            this.closeModal(action)
        } else {
            Hook.call('TypeCreateEditAction', {
                type,
                action,
                dataToEdit,
                meta,
                createEditForm: this.createEditForm,
                typeEdit: this
            })
        }
    }

    saveDataIfNeeded(action, editedData) {
        const {dataToEdit} = this.state
        const {type, updateData, createData} = this.props
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
                    this.closeModal(action, optimisticData)
                } else {
                    this.setState({dataToEdit: {...dataToEdit, ...optimisticData}})
                }
            }
        }

        const editedDataWithRefs = referencesToIds(editedData, type)

        // remove localized attribute
        Object.keys(formFields).forEach(key => {
            if (formFields[key].localized) {
                if (editedDataWithRefs[key]) {
                    delete editedDataWithRefs[key]._localized
                }
            }
        })

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
                        if (compareDataReferences(before, editedDataWithRefs[k], fieldDefinition)) {
                            console.log(editedDataWithRefs[k])
                            editedDataToUpdate[k] = editedDataWithRefs[k]
                        }
                    } else if (fieldDefinition.type === 'Object') {
                        // stringify Object and compare
                        const s1 = before ? before.constructor !== String ? JSON.stringify(before) : before : ''
                        const s2 = editedDataWithRefs[k] ? editedDataWithRefs[k].constructor !== String ? JSON.stringify(editedDataWithRefs[k]) : editedDataWithRefs[k] : ''
                        if (s1 !== s2) {
                            editedDataToUpdate[k] = s2
                        }
                    } else if (fieldDefinition.localized) {

                        if (Util.shallowCompare(editedDataWithRefs[k], before)) {
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
                    this.closeModal(action)
                }
            }

        } else {
            // create a new entry
            createData(editedDataWithRefs, optimisticData).then(callback).catch(callback)
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
