import React, {useEffect, useState} from 'react'
import {QUERY_KEY_VALUES} from '../util/keyvalue'
import {client} from '../middleware/graphql'
import Async from './Async'
import { RichTreeView } from '@mui/x-tree-view/RichTreeView'
import {getFieldsForBulkEdit, referencesToIds} from "../../util/typesAdmin.mjs";
import {
    SimpleList,
    Grid,
    Button
} from 'ui/admin'
import GenericForm from './GenericForm'

import IconButton from '@mui/material/IconButton';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckIcon from '@mui/icons-material/Check';
import { useTreeItemUtils } from '@mui/x-tree-view/hooks';
import { TreeItem, TreeItemLabel } from '@mui/x-tree-view/TreeItem';
import { TreeItemLabelInput } from '@mui/x-tree-view/TreeItemLabelInput';
import {SimpleDialog} from './ui/impl/material'
import {_t} from 'util/i18n.mjs'
import {parseOrElse} from '../util/json.mjs'
import CircularProgress from '@mui/material/CircularProgress'

const CodeEditor = (props) => <Async {...props}
                                     load={() =>import(/* webpackChunkName: "codeeditor" */ '../components/CodeEditor')}/>

function CustomLabel({ editing, editable, children, toggleItemEditing, ...other }) {
    return (
        <TreeItemLabel
            {...other}
            editable={editable}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                justifyContent: 'space-between',
            }}
        >
            {children}
            {editable && (
                <IconButton
                    size="small"
                    onClick={toggleItemEditing}
                    sx={{ color: 'text.secondary' }}
                >
                    <EditOutlinedIcon fontSize="small" />
                </IconButton>
            )}
        </TreeItemLabel>
    );
}

function CustomLabelInput(props) {
    const { handleCancelItemLabelEditing, handleSaveItemLabel, value, ...other } =
        props;

    return (
        <React.Fragment>
            <TreeItemLabelInput {...other} value={value} />
            <IconButton
                color="success"
                size="small"
                onClick={(event) => {
                    handleSaveItemLabel(event, value);
                }}
            >
                <CheckIcon fontSize="small" />
            </IconButton>
            <IconButton color="error" size="small" onClick={handleCancelItemLabelEditing}>
                <CloseRoundedIcon fontSize="small" />
            </IconButton>
        </React.Fragment>
    );
}

const CustomTreeItem = React.forwardRef(function CustomTreeItem(props, ref) {
    const { interactions, status } = useTreeItemUtils({
        itemId: props.itemId,
        children: props.children,
    });

    const handleContentDoubleClick = (event) => {
        event.defaultMuiPrevented = true;
    };

    const handleInputBlur = (event) => {
        event.defaultMuiPrevented = true;
    };

    const handleInputKeyDown = (event) => {
        event.defaultMuiPrevented = true;
    };

    return (
        <TreeItem
            {...props}
            ref={ref}
            slots={{ label: CustomLabel, labelInput: CustomLabelInput }}
            slotProps={{
                label: {
                    onDoubleClick: handleContentDoubleClick,
                    editable: status.editable,
                    editing: status.editing,
                    toggleItemEditing: interactions.toggleItemEditing,
                },
                labelInput: {
                    onBlur: handleInputBlur,
                    onKeyDown: handleInputKeyDown,
                    handleCancelItemLabelEditing: interactions.handleCancelItemLabelEditing,
                    handleSaveItemLabel: interactions.handleSaveItemLabel,
                },
            }}
        />
    );
});

const SUB_PATH_SEPARATOR = '__bulkSubPath_'

/* an Object field with bulkEditable.subPath is edited with 3 fields: path, mode and value */
const createSubPathFields = (fieldName, field) => {
    const cfg = field.bulkEditSubPath
    const label = field.label || fieldName
    return {
        [`${fieldName}${SUB_PATH_SEPARATOR}path`]: {
            label: `${label} – ${_t('TypesContainer.bulkEditSubPath')}`,
            placeholder: cfg.placeholder || 'z.B. format.tags.genre',
            defaultValue: cfg.defaultPath || '',
            required: true,
            fullWidth: true,
            subPathOf: fieldName,
            subPathRole: 'path'
        },
        [`${fieldName}${SUB_PATH_SEPARATOR}mode`]: {
            label: `${label} – ${_t('TypesContainer.bulkEditSubPathMode')}`,
            uitype: 'select',
            defaultValue: 'string',
            enum: [
                {value: 'string', name: _t('TypesContainer.bulkEditSubPathModeString')},
                {value: 'json', name: _t('TypesContainer.bulkEditSubPathModeJson')},
                {value: 'remove', name: _t('TypesContainer.bulkEditSubPathModeRemove')}
            ],
            subPathOf: fieldName,
            subPathRole: 'mode'
        },
        [`${fieldName}${SUB_PATH_SEPARATOR}value`]: {
            label: `${label} – ${_t('TypesContainer.bulkEditSubPathValue')}`,
            fullWidth: true,
            subPathOf: fieldName,
            subPathRole: 'value'
        }
    }
}

/* GenericForm ignores defaultValue when values are passed */
const subPathDefaultValues = (values, fields) => {
    if (!values) {
        return values
    }
    const newValues = Object.assign({}, values)
    Object.keys(fields).forEach(key => {
        if (fields[key].subPathOf && newValues[key] === undefined && fields[key].defaultValue !== undefined) {
            newValues[key] = fields[key].defaultValue
        }
    })
    return newValues
}

const BulkEdit = ({ dataToBulkEdit, type, parentContainer, setKeyValue}) => {

    const [bulkEditScriptIndex, setBulkEditScriptIndex] = useState(0)
    const [bulkEditFields, setBulkEditFields] = useState()
    const [bulkEditForm, setBulkEditForm] = useState()
    const [scripts, setScripts] = useState([])
    const [loading, setLoading] = useState(true)


    const saveScripts = (scripts)=>{
        setKeyValue({
            key:'TypesContainerBulkEdit',
            value:scripts,
            global:true
        })
    }

    useEffect(() => {


        client.query({
            fetchPolicy: 'cache-and-network',
            query: QUERY_KEY_VALUES,
            variables:{keys:['TypesContainerBulkEdit']}
        }).then(({data})=>{
            if(data?.keyValues?.results?.length>0){
                let values = parseOrElse(data.keyValues.results[0].value)
                if(!Array.isArray(values)) {
                    values = [{script:values,id:'Main Script'}]
                }
                setScripts(values)
            }
            setLoading(false)
        }).catch((error)=>{
            setLoading(false)
        })
    }, [])
    if(loading){
        return <CircularProgress color="inherit" size={20}/>
    }

    const scriptData = scripts[bulkEditScriptIndex]

    return <SimpleDialog fullWidth={true}
                         maxWidth="lg"
                         key="bulkeditDialog"
                         open={true}
                         onClose={(action) => {
                             if (action.key === 'execute') {

                                 let data
                                 if(dataToBulkEdit.action==='editScript') {
                                     data = scriptData.script
                                 }else {
                                     const formFields = Object.assign({}, bulkEditForm.state.fields)
                                     const subPaths = {}
                                     Object.keys(bulkEditFields).forEach(key => {
                                         const field = bulkEditFields[key]
                                         if (field.subPathOf) {
                                             if (!subPaths[field.subPathOf]) {
                                                 subPaths[field.subPathOf] = {}
                                             }
                                             let value = formFields[key]
                                             if (value && value.constructor === Object && value.value !== undefined) {
                                                 // select returns the item
                                                 value = value.value
                                             }
                                             subPaths[field.subPathOf][field.subPathRole] = value
                                             delete formFields[key]
                                         }
                                     })
                                     const editedDataWithRefs = referencesToIds(formFields, type)
                                     if (Object.keys(subPaths).length > 0) {
                                         editedDataWithRefs._bulkSubPaths = subPaths
                                     }
                                     data = JSON.stringify(editedDataWithRefs)
                                 }

                                 client.query({
                                     fetchPolicy: 'network-only',
                                     query: `query bulkEdit($collection:String!,$_id:[ID]!,$data:String!,$action:String){bulkEdit(collection:$collection,_id:$_id,data:$data,action:$action){result}}`,
                                     variables: {
                                         collection: type,
                                         _id: dataToBulkEdit.items,
                                         action: dataToBulkEdit.action,
                                         data:data
                                     }
                                 }).then(response => {
                                     if (response.data.bulkEdit) {

                                         parentContainer.setState({dataToBulkEdit:false,simpleDialog: {children: JSON.stringify(response.data.bulkEdit)}})

                                         // refresh
                                         parentContainer.getData(parentContainer.pageParams, false)

                                     }
                                 })

                             } else {
                                 parentContainer.setState({dataToBulkEdit: false})
                             }
                         }}
                         actions={[
                             {
                                 key: 'cancel',
                                 label: _t('core.cancel'),
                                 type: 'primary'
                             },
                             (dataToBulkEdit.action==='editScript' || (bulkEditFields && Object.keys(bulkEditFields).length>0)?{key: 'execute', label: _t('TypesContainer.bulkEditExecute')}:null)
                             ]}
                         title={_t('TypesContainer.bulkEdit')}>

        {dataToBulkEdit.action==='editScript' ?
            <Grid container spacing={2}>
                <Grid size={3}>
                    <RichTreeView
                        expansionTrigger="iconContainer"
                        items={scripts.map(f=>({label:f.id,id:f.id}))}
                        selectedItems={[scriptData.id]}
                        isItemEditable
                        onItemLabelChange={(itemId, label) => {
                            const newScripts = scripts.slice(0)
                            newScripts.find(f=>f.id===itemId).id = label
                            setScripts(newScripts)
                            saveScripts(newScripts)
                        }}
                        onItemClick={(event, id)=>{
                            const newIndex = scripts.findIndex(f=>f.id===id)
                            if(newIndex>=0){
                                setBulkEditScriptIndex(newIndex)
                            }
                        }}
                        slots={{ item: CustomTreeItem }}
                        sx={{ height: 'fit-content', flexGrow: 1, maxWidth: 400, overflowY: 'auto' }}
                        itemChildrenIndentation={24}
                    />

                    <Button onClick={()=>{
                        let newName = 'New Script'
                        let counter = 1
                        const newScripts = scripts.slice(0)

                        while(scripts.find(f=>f.id===newName)){
                            newName = `New Script ${counter}`
                            counter++
                        }
                        newScripts.push({id:newName,script:''})
                        setScripts(newScripts)
                        setBulkEditScriptIndex(newScripts.length-1)
                        saveScripts(newScripts)
                    }}>+ Add Script</Button>
                </Grid>
                <Grid size={9}>
                    <CodeEditor lineNumbers
                                identifier={scriptData.id}
                                type="js"
                                onBlur={(e, bulkEditScript) => {
                                    scriptData.script = bulkEditScript
                                    saveScripts(scripts)
                                    //setBulkEditScript(bulkEditScript)
                                }}>{scriptData.script}</CodeEditor>
                </Grid>
            </Grid>
            :
            <Grid container spacing={2}>
                <Grid size={4}>
                    <SimpleList items={Object.entries(getFieldsForBulkEdit(type)).map(([k,v])=>({
                        primary:v.label,secondary:v.name,checkbox:true
                    }))}
                    onCheck={(checked)=>{
                        const fields = getFieldsForBulkEdit(type)
                        const fieldsKeys = Object.keys(fields)
                        const filteredFields = {}
                        for(let idx of checked) {
                            const key = fieldsKeys[idx]
                            if (fields[key].bulkEditSubPath) {
                                Object.assign(filteredFields, createSubPathFields(key, fields[key]))
                            } else {
                                filteredFields[key] = fields[key]
                            }
                        }
                        setBulkEditFields(filteredFields)
                    }}
                    />
                </Grid>
                <Grid size={8}>
                    {bulkEditFields && <GenericForm key="genericForm" autoFocus onRef={ref => {
                        if(ref) {
                            setBulkEditForm(ref)
                        }
                    }} primaryButton={false} values={subPathDefaultValues(dataToBulkEdit.values, bulkEditFields)} fields={bulkEditFields}/>}
                </Grid>
            </Grid>}
    </SimpleDialog>

}

export default BulkEdit