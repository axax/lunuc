import React, {useState} from 'react'
import SimpleFileExplorer from '../../../client/components/ui/impl/material/SimpleFileExplorer'
import {client} from '../../../client/middleware/graphql'
import Util from '../../../client/util/index.mjs'
import DriveFileRenameOutlineRounded from '@mui/icons-material/DriveFileRenameOutlineRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import CreateNewFolderRounded from '@mui/icons-material/CreateNewFolderRounded';
import AddPhotoAlternateRoundedIcon from '@mui/icons-material/AddPhotoAlternateRounded';
import SimpleMenu from "../../../client/components/ui/impl/material/SimpleMenu";
import {getImageSrc} from "../../../client/util/media";
import {_t} from '../../../util/i18n.mjs'

const createNewEntry= (item) => {
    return {
        original: item,
        ...item,
        id: item._id,
        label: item.name,
        icon: item.mimeType ? 'doc' : 'folder',
        image: item.mimeType?.startsWith('image') ? getImageSrc(item,'thumbnail') : null,
        fileType: item.mimeType ? 'doc' : 'folder'
    };
}

const MediaFileExplorer = ({_version, TypeContainerRef, defaultExpandedItems}) => {


    const editItem = (item) => {
        TypeContainerRef.handleEditDataClick(item.original,  {type: item.fileType==='folder'?'MediaGroup':'Media',
            callback: ({data, editedData}) => {
                if(data.updateMediaGroup || data.updateMedia){
                    item.name = editedData.name
                    item.label = editedData.name
                    item.original.name = editedData.name
                }
            }})
    }

    return <SimpleFileExplorer defaultExpandedItems={defaultExpandedItems}
       ContextMenu={ContextMenu}
       enableDragAndDrop={true}
       onItemAction={(item, action, parentItem) => {
           if(action.key==='delete'){
               TypeContainerRef.handleDeleteDataClick([item.original], {type: item.fileType === 'folder' ? 'MediaGroup' : 'Media',
               callback: ({ids, data}) => {
                   if(parentItem?.children && data.deleteMediaGroup){
                       ids.forEach(deletedItem => {
                           const index = parentItem.children.findIndex(child => child.id === deletedItem._id)
                           if(index>-1){
                               parentItem.children.splice(index, 1)
                           }
                       })
                   }
               }})
           }else if(action.key === 'move'){

               const queries = TypeContainerRef.getTypeQueriesFiltered(item.source.fileType==='folder'?'MediaGroup':'Media', {loadAll: false})
               const group = []
               if(item.targetFolderId!=='root'){
                   group.push(item.targetFolderId)
               }
               client.mutate({
                   mutation: queries.update,
                   variables: {
                       _id:item.source._id,
                       group
                   }
               })
           }else if (action.key === 'edit'){
               editItem(item)
           }else if (action.key === 'new-folder'){
               TypeContainerRef.setState({
                   createEditDialog: true,
                   createEditDialogOption:{
                       type:'MediaGroup',
                       title:'MediaGroup',
                       dataToEdit:{group:item.id==='root'?[]:[item.original], createdBy:item.original.createdBy, ownerGroup:item.original.ownerGroup || []},
                       callback: ({errors, data, editedData}) => {
                          console.log('callback', errors, data, editedData)
                           const newEntry = Object.assign({parent:item.id},editedData, data.createMedia ? data.createMedia : data.createMediaGroup)
                           if(newEntry._id){
                               if(!item.children){
                                   item.children = []
                               }
                               item.children.splice(item.id==='root'?1:0, 0, createNewEntry(newEntry))
                           }
                       }
                   }
               })
           }else if (action.key === 'new-file'){
               TypeContainerRef.setState({createEditDialog: true, createEditDialogOption: {
                   variant:'upload', dataToEdit:{group:item.id==='root'?[]:[item.original],createdBy:item.original.createdBy, ownerGroup:item.original.ownerGroup || []},
                   callback: ({status, files}) => {
                       if(status==='success' && files){
                           if(!item.children){
                               item.children = []
                           }

                           files.forEach(file=>{
                               item.children.splice(item.id==='root'?1:0, 0, createNewEntry({parent:item.id,...file}))
                           })
                       }
                   }
               }})
               /*TypeContainerRef.setState({createEditDialog: true,
               createEditDialogOption:{type:'Media',title:'Media',
                   dataToEdit:{group:[item.original],createdBy:item.original.createdBy, ownerGroup:item.original.ownerGroup}}})*/
           }
       }}
       onItemClick={(event, item, isExpanded) => {
           if(event.detail===2){
               item.singleClicked = false
               event.preventDefault()
               event.stopPropagation()
               editItem(item)
               return
           }else if(item.fileType === 'doc') {
               item.singleClicked = true
               setTimeout(()=>{
                   if(item.singleClicked){
                       item.singleClicked = false
                       const imageData = Util.getImageObject(item, {})
                       window.open(imageData.src, '_blank').focus()
                   }
               },500)
           }
        }}
       onFetch={async ({id}) => {
           console.log('fetching', id)

           const mediaQueries = TypeContainerRef.getTypeQueriesFiltered('Media', {loadAll: false})
           const mediaGroupQueries = TypeContainerRef.getTypeQueriesFiltered('MediaGroup', {loadAll: false})
           const [mediaGroupResponse, mediaResponse] = await Promise.all([
               client.query({ query: mediaGroupQueries.query, fetchPolicy: 'cache-and-network',
                   variables: { filter: `group==${id}`, limit: 1000 } }),
               client.query({ query: mediaQueries.query, fetchPolicy: 'cache-and-network',
                   variables: { filter: `group==${id}`, limit: 1000 } })
           ])

           const mapItems = (data) =>
               data.results?.map(item => createNewEntry({parent:id,...item})) ?? []

           return [...mapItems(mediaGroupResponse?.data?.mediaGroups), ...mapItems(mediaResponse?.data?.medias)]

       }}></SimpleFileExplorer>
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
function ContextMenu({ anchorPosition, onClose, item, onAction }) {
    const open = Boolean(anchorPosition);

    let actions = []
    if(item?.fileType==='folder' || item?.fileType==='root') {
        actions = [
            { key: 'new-folder', name: _t('MediaFileExplorer.newFolder'), icon: <CreateNewFolderRounded fontSize="small" /> },
            { key: 'new-file', name: _t('MediaFileExplorer.newFile'), icon: <AddPhotoAlternateRoundedIcon fontSize="small" /> }
        ]
    }
    if(item?.fileType!=='root') {
        actions.push({ key: 'edit', name: _t('MediaFileExplorer.edit'), icon: <DriveFileRenameOutlineRounded fontSize="small" /> })
        actions.push({ divider:true, key: 'delete', name: _t('MediaFileExplorer.delete'), icon: <DeleteRounded fontSize="small" />, danger: true })
    }

    return <SimpleMenu open={open}
                       anchorReference={"anchorPosition"}
                       anchorPosition={anchorPosition}
                       payload={item}
                       onClose={() => {
                           onClose(null)
                       }}
                       onClick={onAction}
                       key="menu" noButton items={actions}/>
}


export default MediaFileExplorer