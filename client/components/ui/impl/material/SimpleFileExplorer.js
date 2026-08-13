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
import { useTreeItemModel } from '@mui/x-tree-view/hooks';
import { useEffect, useState, useImperativeHandle } from "react";
import { getIconByKey } from "./icon";

// ─── Module-level context ────────────────────────────────────────────────────
export const TreeContextMenuContext = React.createContext(null);

// ─── Dot icon ────────────────────────────────────────────────────────────────
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

// ─── Styled components ───────────────────────────────────────────────────────
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
    boxSizing: 'border-box',
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

// ─── Custom Label ─────────────────────────────────────────────────────────────
function CustomLabel({ icon: Icon, image, expandable, children, ...other }) {
    return (
        <TreeItemLabel
            {...other}
            sx={{ display: 'flex', alignItems: 'center' }}
        >
            {image ? (
                <Box
                    component="img"
                    src={image}
                    className="labelIcon"
                    sx={{
                        mr: 1,
                        width: '1.5rem',
                        height: '1.5rem',
                        objectFit: 'cover',
                        borderRadius: '3px',
                        flexShrink: 0,
                    }}
                />
            ) : Icon ? (
                <Box
                    component={Icon}
                    className="labelIcon"
                    color="inherit"
                    sx={{ mr: 1, fontSize: '1.5rem' }}
                />
            ) : null}
            <TreeItemLabelText variant="body2">{children}</TreeItemLabelText>
            {expandable && <DotIcon />}
        </TreeItemLabel>
    );
}


// ─── Custom Tree Item ─────────────────────────────────────────────────────────
export const CustomTreeItem = React.forwardRef(function CustomTreeItem(props, ref) {
    const { id, itemId, label, disabled, children, ...other } = props;

    const {
        getContextProviderProps,
        getRootProps,
        getContentProps,
        getIconContainerProps,
        getCheckboxProps,
        getLabelProps,
        getGroupTransitionProps,
        status,
    } = useTreeItem({ id, itemId, children, label, disabled, rootRef: ref });

    const item = useTreeItemModel(itemId);

    // Consume the module-level context via ref
    const contextMenuRef = React.useContext(TreeContextMenuContext);
    const { loadingItems } = React.useContext(TreeContextMenuContext).current;
    const isLoading = loadingItems?.has(itemId);

    // ── Drag-over visual state ─────────────────────────────────────
    const [isDragOver, setIsDragOver] = useState(false);

    const dndEnabled = contextMenuRef?.current?.enableDragAndDrop ?? false;

    // ── Context menu ───────────────────────────────────────────────
    const handleContextMenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!contextMenuRef?.current) return;
        const { onContextMenu, findById, data } = contextMenuRef.current;
        const fullItem = findById(data, itemId);
        onContextMenu(event, fullItem);
    };

    // ── Drag handlers ──────────────────────────────────────────────
    const handleDragStart = (event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', itemId);
        contextMenuRef.current.setDraggedId(itemId);
    };

    const isValidDropTarget = () => {
        const { draggedId, findById, data } = contextMenuRef.current;
        if (!draggedId || draggedId === itemId) return false;
        const target = findById(data, itemId);
        return target?.fileType === 'folder' || target?.fileType === 'root';
    };

    const handleDragOver = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isValidDropTarget()) return;
        event.dataTransfer.dropEffect = 'move';
    };

    const handleDragEnter = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isValidDropTarget()) setIsDragOver(true);
    };

    const handleDragLeave = (event) => {
        // Only clear if we're leaving this element entirely (not entering a child)
        if (!event.currentTarget.contains(event.relatedTarget)) {
            setIsDragOver(false);
        }
    };

    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(false);

        const { draggedId, onDrop } = contextMenuRef.current;
        if (!draggedId || draggedId === itemId) return;

        const { findById, data } = contextMenuRef.current;
        const target = findById(data, itemId);
        if (target?.fileType !== 'folder' && target?.fileType !== 'root') return;

        onDrop(draggedId, itemId);
        contextMenuRef.current.setDraggedId(null);
    };

    const handleDragEnd = () => {
        setIsDragOver(false);
        if (contextMenuRef?.current) {
            contextMenuRef.current.setDraggedId(null);
        }
    };

    let icon;
    let image;
    if (status.expandable) {
        icon = FolderRounded;
    } else if (item.image) {
        // image property takes priority over icon
        image = item.image;
    } else if (item.icon) {
        icon = getIconByKey(item.icon);
    }

    return (
        <TreeItemProvider {...getContextProviderProps()}>
            <TreeItemRoot {...getRootProps(other)}>
                <TreeItemContent
                    {...getContentProps()}
                    onContextMenu={handleContextMenu}
                    draggable={dndEnabled}
                    onDragStart={dndEnabled ? handleDragStart : undefined}
                    onDragOver={dndEnabled ? handleDragOver : undefined}
                    onDragEnter={dndEnabled ? handleDragEnter : undefined}
                    onDragLeave={dndEnabled ? handleDragLeave : undefined}
                    onDrop={dndEnabled ? handleDrop : undefined}
                    onDragEnd={dndEnabled ? handleDragEnd : undefined}
                    style={isDragOver ? {
                        outline: '2px solid var(--mui-palette-primary-main, #1976d2)',
                        outlineOffset: '-2px',
                        backgroundColor: 'var(--mui-palette-primary-dark, rgba(25, 118, 210, 0.2))',
                    } : undefined}
                >
                    <TreeItemIconContainer {...getIconContainerProps()}>
                        <TreeItemIcon status={status} />
                    </TreeItemIconContainer>
                    <TreeItemCheckbox {...getCheckboxProps()} />
                    <CustomLabel
                        {...getLabelProps({
                            icon,
                            image,
                            expandable: status.expandable && status.expanded
                        })}
                    >
                        {isLoading
                            ? 'Loading...'
                            : label
                        }
                    </CustomLabel>
                </TreeItemContent>
                {children && <CustomCollapse {...getGroupTransitionProps()} />}
            </TreeItemRoot>
        </TreeItemProvider>
    );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const findById = (nodes, id) => {
    if(!id || id==='root') return nodes[0]
    for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children && node.id!=='root') {
            const found = findById(node.children, id);
            if (found) return found;
        }
    }
    return null;
};

const removeItemById = (nodes, id) => {
    for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) {
            return nodes.splice(i, 1)[0];
        }
        if (nodes[i].children && nodes[i].id!=='root') {
            const found = removeItemById(nodes[i].children, id);
            if (found) return found;
        }
    }
    return null;
};

/**
 * The synthetic root node (only present when drag and drop is enabled) holds a
 * self reference: its children array IS the top level array, including the root
 * node itself at index 0. Any structural change to the top level array must
 * therefore be mirrored back onto root.children, and inserts must skip index 0.
 */
const getRootNode = (nodes) => (nodes?.[0]?.fileType === 'root' ? nodes[0] : null);

// ─── File Explorer ────────────────────────────────────────────────────────────
const FileExplorer = React.forwardRef(function FileExplorer({
                                                                onFetch,
                                                                onItemClick,
                                                                ContextMenu,
                                                                onItemAction,
                                                                defaultExpandedItems,
                                                                enableDragAndDrop = false
                                                            }, ref) {

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [expandedItems, setExpandedItems] = useState([]);
    const [contextMenu, setContextMenu] = useState(null); // { position, item }
    const [draggedId, setDraggedId] = useState(null);
    const [selectedItems, setSelectedItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(new Set());


    // Stable ref passed via context so CustomTreeItem always has latest data
    const contextMenuRef = React.useRef(null);
    contextMenuRef.current = {
        loadingItems,
        onContextMenu: (event, item) => {
            setSelectedItems([item.id]);
            setContextMenu({
                position: { top: event.clientY, left: event.clientX },
                item,
            });
        },
        findById,
        data,
        draggedId,
        setDraggedId,
        enableDragAndDrop,
        onDrop: (sourceId, targetFolderId) => {
            setData(prevData => {
                if (!prevData) return prevData;

                const newData = [...prevData];

                // Remove the dragged item from wherever it currently lives
                const draggedItem = removeItemById(newData, sourceId);
                if (!draggedItem) return prevData;

                const root = getRootNode(newData);

                // Insert into the target folder
                if (!targetFolderId || targetFolderId === 'root') {
                    newData.splice(root ? 1 : 0, 0, draggedItem);
                } else {
                    const targetFolder = findById(newData, targetFolderId);
                    if (!targetFolder) return prevData;
                    targetFolder.children = [...(targetFolder.children || []), draggedItem];
                }

                if (root) root.children = newData;
                draggedItem.parent = targetFolderId;

                // Notify parent to persist the move
                onItemAction?.({ source: draggedItem, itemId: sourceId, targetFolderId }, { key: 'move' });

                return newData;
            });
        },
    };

    const fetchData = (props) => {
        return new Promise((resolve) => {
            onFetch(props).then((itemData) => {
                let newData;
                if (props.id && props.data) {
                    newData = props.data.slice(0);
                    const item = findById(props.data, props.id);
                    item.children = itemData;
                    item.childrenFetched = true;
                    itemData.forEach(child => {
                        child.parent = item.id
                    })
                } else {
                    newData = itemData;
                }
                resolve(newData);
            }).catch((error) => {
                setError(error);
                resolve(props.data);
            });
        });
    };

    useEffect(() => {
        // An async function passed directly to useEffect returns a promise
        // instead of a cleanup function, so it is wrapped here.
        const init = async () => {
            if (data) return;

            const allPaths = [''];
            if (defaultExpandedItems) {
                allPaths.push(...defaultExpandedItems);
            }
            let currentData = data;
            const allPathSorted = allPaths.sort((a, b) => a.length - b.length);

            for (const id of allPathSorted) {
                currentData = await fetchData({ id, data: currentData });
            }
            if (enableDragAndDrop && currentData) {
                currentData.unshift({
                    label: '.',
                    id: 'root',
                    fileType: 'root',
                    children: currentData,
                    icon: 'source',
                    original: { createdBy: _app_.user }
                });
            }
            setData(currentData);
        };
        init();
    }, []);

    /**
     * Imperative API for callers. Item references handed out via callbacks live
     * inside this component's state, so mutating them from the outside never
     * triggers a re-render. These methods go through setData with a fresh array
     * reference instead, which is what makes the tree update without a reload.
     */
    useImperativeHandle(ref, () => ({
        removeItem: (id) => {
            if (!id || id === 'root') return;
            setData(prevData => {
                if (!prevData) return prevData;
                const newData = [...prevData];
                if (!removeItemById(newData, id)) return prevData;
                const root = getRootNode(newData);
                if (root) root.children = newData;
                return newData;
            });
            // Drop stale references from the controlled tree state
            setExpandedItems(prev => prev.filter(itemId => itemId !== id));
            setSelectedItems(prev => prev.filter(itemId => itemId !== id));
            setLoadingItems(prev => {
                if (!prev.has(id)) return prev;
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        },

        addItems: (parentId, newItems) => {
            if (!newItems?.length) return;
            setData(prevData => {
                if (!prevData) return prevData;

                const newData = [...prevData];
                const root = getRootNode(newData);
                const isRootTarget = !parentId || parentId === 'root';
                const parent = isRootTarget ? root : findById(newData, parentId);

                if (isRootTarget || (root && parent === root)) {
                    newData.splice(root ? 1 : 0, 0, ...newItems);
                    if (root) root.children = newData;
                    return newData;
                }

                if (!parent) return prevData;
                parent.children = [...newItems, ...(parent.children || [])];
                parent.childrenFetched = true;
                return newData;
            });
        },

        updateItem: (id, changes) => {
            if (!id || id === 'root' || !changes) return;
            setData(prevData => {
                if (!prevData) return prevData;
                const newData = [...prevData];
                const item = findById(newData, id);
                if (!item) return prevData;
                Object.assign(item, changes);
                return newData;
            });
        },

        // Escape hatch: force a full reload of the tree from the data source
        reload: () => {
            setData(null);
            setExpandedItems([]);
            setSelectedItems([]);
        },
    }), []);

    if (error) return error.message;
    if (!data) return null;

    return (
        <TreeContextMenuContext.Provider value={contextMenuRef}>
            <RichTreeView
                controlled
                selectedItems={selectedItems}
                onSelectedItemsChange={(event, newSelected) => {
                    setSelectedItems(newSelected);
                }}
                expandedItems={expandedItems}
                items={data}
                onExpandedItemsChange={(event, newExpandedItems) => {
                    setExpandedItems(newExpandedItems);
                }}
                getItemChildren={(item) => {
                    if (item.children && item.id!=='root') return item.children;
                    return [];
                }}
                onItemClick={(event, id) => {
                    if (id === 'root') return;

                    const wasExpanded = expandedItems.includes(id);
                    const item = findById(data, id);
                    if (!item) return;

                    if (item.fileType === 'folder' && !item.childrenFetched && event.detail !== 2) {
                        setLoadingItems(prev => new Set(prev).add(id));

                        fetchData({ id, data }).then((newData) => {
                            const fetchedItem = findById(newData, id);
                            const hasChildren = fetchedItem?.children?.length > 0;

                            setLoadingItems(prev => {
                                const next = new Set(prev);
                                next.delete(id);
                                return next;
                            });

                            setData(newData);

                            if (hasChildren && !wasExpanded) {
                                setExpandedItems(prev => [...prev, id]);
                            }
                        });

                        onItemClick(event, item, !wasExpanded);
                        return;
                    }

                    onItemClick(event, item, !wasExpanded);
                }}
                sx={{ height: 'fit-content', flexGrow: 1, maxWidth: 'auto', overflowY: 'auto' }}
                slots={{ item: CustomTreeItem }}
                itemChildrenIndentation={24}
            />
            {ContextMenu && <ContextMenu
                anchorPosition={contextMenu?.position}
                item={contextMenu?.item}
                onClose={() => setContextMenu(null)}
                onAction={(event, item, action) => {
                    onItemAction?.(item, action, findById(data, item.parent))
                }}
            />}
        </TreeContextMenuContext.Provider>
    );
});

export default FileExplorer;