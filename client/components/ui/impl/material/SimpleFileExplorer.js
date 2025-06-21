import * as React from 'react';
import { styled, alpha } from '@mui/material/styles';

import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import FolderRounded from '@mui/icons-material/FolderRounded';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import { useTreeItem } from '@mui/x-tree-view/useTreeItem';
import {
    TreeItemCheckbox,
    TreeItemIconContainer,
    TreeItemLabel,
} from '@mui/x-tree-view/TreeItem';
import { TreeItemIcon } from '@mui/x-tree-view/TreeItemIcon';
import { TreeItemProvider } from '@mui/x-tree-view/TreeItemProvider';
import { TreeItemDragAndDropOverlay } from '@mui/x-tree-view/TreeItemDragAndDropOverlay';
import { useTreeItemModel } from '@mui/x-tree-view/hooks';
import {useEffect, useState} from "react";
import CircularProgress from '@mui/material/CircularProgress'
import {getIconByKey} from "./icon";

function DotIcon() {
    return (
        <Box
            sx={{
                width: 6,
                height: 6,
                borderRadius: '70%',
                bgcolor: 'warning.main',
                display: 'inline-block',
                verticalAlign: 'middle',
                zIndex: 1,
                mx: 1,
            }}
        />
    );
}

const TreeItemRoot = styled('li')(({ theme }) => ({
    listStyle: 'none',
    margin: 0,
    padding: 0,
    outline: 0,
    color: theme.palette.grey[400],
    ...theme.applyStyles('light', {
        color: theme.palette.grey[800],
    }),
}));

const TreeItemContent = styled('div')(({ theme }) => ({
    padding: theme.spacing(0.5),
    paddingRight: theme.spacing(1),
    paddingLeft: `calc(${theme.spacing(1)} + var(--TreeView-itemChildrenIndentation) * var(--TreeView-itemDepth))`,
    width: '100%',
    boxSizing: 'border-box', // prevent width + padding to overflow
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    flexDirection: 'row-reverse',
    borderRadius: theme.spacing(0.7),
    marginBottom: theme.spacing(0.5),
    marginTop: theme.spacing(0.5),
    fontWeight: 500,
    '&[data-expanded]:not([data-focused], [data-selected]) .labelIcon': {
        color: theme.palette.primary.dark,
        ...theme.applyStyles('light', {
            color: theme.palette.primary.main,
        }),
        '&::before': {
            content: '""',
            display: 'block',
            position: 'absolute',
            left: '16px',
            top: '44px',
            height: 'calc(100% - 48px)',
            width: '1.5px',
            backgroundColor: theme.palette.grey[700],
            ...theme.applyStyles('light', {
                backgroundColor: theme.palette.grey[300],
            }),
        },
    },
    [`&[data-focused], &[data-selected]`]: {
        backgroundColor: theme.palette.primary.dark,
        color: theme.palette.primary.contrastText,
        ...theme.applyStyles('light', {
            backgroundColor: theme.palette.primary.main,
        }),
    },
    '&:not([data-focused], [data-selected]):hover': {
        backgroundColor: alpha(theme.palette.primary.main, 0.1),
        color: 'white',
        ...theme.applyStyles('light', {
            color: theme.palette.primary.main,
        }),
    },
}));

const CustomCollapse = styled(Collapse)({
    padding: 0,
});

const TreeItemLabelText = styled(Typography)({
    color: 'inherit',
    fontFamily: 'General Sans',
    fontWeight: 500,
});

function CustomLabel({ icon: Icon, expandable, children, ...other }) {
    return (
        <TreeItemLabel
            {...other}
            sx={{
                display: 'flex',
                alignItems: 'center',
            }}
        >
            {Icon && (
                <Box
                    component={Icon}
                    className="labelIcon"
                    color="inherit"
                    sx={{ mr: 1, fontSize: '1.2rem' }}
                />
            )}

            <TreeItemLabelText variant="body2">{children}</TreeItemLabelText>
            {expandable && <DotIcon />}
        </TreeItemLabel>
    );
}

const CustomTreeItem = React.forwardRef(function CustomTreeItem(props, ref) {
    const { id, itemId, label, disabled, children, ...other } = props;

    const {
        getContextProviderProps,
        getRootProps,
        getContentProps,
        getIconContainerProps,
        getCheckboxProps,
        getLabelProps,
        getGroupTransitionProps,
        getDragAndDropOverlayProps,
        status,
    } = useTreeItem({ id, itemId, children, label, disabled, rootRef: ref });

    const item = useTreeItemModel(itemId);

    let icon;
    if (status.expandable) {
        icon = FolderRounded;
    } else if (item.icon) {
        icon = getIconByKey(item.icon);
    }

    return (
        <TreeItemProvider {...getContextProviderProps()}>
            <TreeItemRoot {...getRootProps(other)}>
                <TreeItemContent {...getContentProps()}>
                    <TreeItemIconContainer {...getIconContainerProps()}>
                        <TreeItemIcon status={status} />
                    </TreeItemIconContainer>
                    <TreeItemCheckbox {...getCheckboxProps()} />
                    <CustomLabel
                        {...getLabelProps({
                            icon,
                            expandable: status.expandable && status.expanded,
                            ...(item.loading ? {children:<CircularProgress size={'sm'}/>}:{})
                        })}>
                    </CustomLabel>
                    <TreeItemDragAndDropOverlay {...getDragAndDropOverlayProps()} />
                </TreeItemContent>
                {children && <CustomCollapse {...getGroupTransitionProps()} />}
            </TreeItemRoot>
        </TreeItemProvider>
    );
});

const findById = (nodes, id) => {
    for (const node of nodes) {
        if (node.id === id) {
            return node;
        }
        if (node.children) {
            const found = findById(node.children, id);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

export default function FileExplorer({onFetch, onItemClick, defaultExpandedItems}) {

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [expandedItems, setExpandedItems] = useState([])

    const fetchData = (props)=>{
        return new Promise((resolve) => {
            onFetch(props).then((itemData) => {
                let newData
                if (props.id && props.data) {
                    newData = props.data.slice(0)
                    const item = findById(props.data, props.id)
                    item.children = itemData
                    item.childrenFetched = true
                } else {
                    newData = itemData
                }
                resolve(newData)
            }).catch((error) => {
                setError(error)
                resolve(props.data)
            })
        })
    }

    useEffect(async () => {

        if(!data){
            const allPaths = ['']
            if(defaultExpandedItems){
                allPaths.push(...defaultExpandedItems)
            }
            let currentData = data
            const allPathSorted = allPaths.sort((a, b) => a.length - b.length)

            for(const id of allPathSorted){
                currentData = await fetchData({id, data:currentData})
            }
            setData(currentData)
        }

    }, []);

    if(error){
        return error.message
    }
    return (
        <RichTreeView
            defaultExpandedItems={defaultExpandedItems}
            items={data}
            onExpandedItemsChange={(event, newExpandedItems) => {
                setExpandedItems(newExpandedItems)
            }}
            getItemChildren={(item)=>{
                if(item.children){
                    return item.children
                }
                if(item.fileType==='folder') {
                    return [{id: item.id + 'loader', label: '...', loading:true, disabled:true}]
                }
            }}
            onItemClick={(event, id, xxx)=>{
                const wasExpanded = expandedItems.includes(id)
                console.log(`tree view id clicked: ${id}`)
                const item = findById(data,id)
                if(item.fileType === 'folder' && !item.childrenFetched) {
                    fetchData({id, data})
                }
                onItemClick(event, item, !wasExpanded)
            }}
            sx={{ height: 'fit-content', flexGrow: 1, maxWidth: 400, overflowY: 'auto' }}
            slots={{ item: CustomTreeItem }}
            itemChildrenIndentation={24}
        />
    );
}
