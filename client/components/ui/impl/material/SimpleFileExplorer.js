import * as React from 'react';
import { styled, alpha } from '@mui/material/styles';

import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Typography from '@mui/material/Typography';
import FolderRounded from '@mui/icons-material/FolderRounded';
import KeyboardArrowUpRounded from '@mui/icons-material/KeyboardArrowUpRounded';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import { useTreeItem } from '@mui/x-tree-view/useTreeItem';
import {
    TreeItemCheckbox,
    TreeItemIconContainer,
    TreeItemLabel,
} from '@mui/x-tree-view/TreeItem';
import { TreeItemIcon } from '@mui/x-tree-view/TreeItemIcon';
import { TreeItemProvider } from '@mui/x-tree-view/TreeItemProvider';
import { useTreeItemModel, useRichTreeViewApiRef } from '@mui/x-tree-view/hooks';
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
function CustomLabel({ icon: Icon, image, expandable, listView, children, ...other }) {
    return (
        <TreeItemLabel
            {...other}
            sx={listView
                ? { display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, overflow: 'hidden' }
                : { display: 'flex', alignItems: 'center' }}
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
            <TreeItemLabelText variant="body2" noWrap={!!listView}>{children}</TreeItemLabelText>
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
    const { loadingItems, columns } = React.useContext(TreeContextMenuContext).current;
    const listView = !!columns?.length;
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
                    {...getContentProps({ className: 'fe-row' })}
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
                    <TreeItemCheckbox {...getCheckboxProps()}
                                      size="small"
                                      sx={{ order: 1, p: 0.25, color: 'inherit', '&.Mui-checked': { color: 'inherit' } }} />
                    <CustomLabel
                        {...getLabelProps({
                            icon,
                            image,
                            expandable: !listView && status.expandable && status.expanded,
                            listView
                        })}
                    >
                        {isLoading
                            ? 'Loading...'
                            : label
                        }
                    </CustomLabel>
                    {listView && columns.map(column => (
                        <Box key={column.key}
                             className="fe-cell"
                             sx={columnSx(column)}>
                            {itemId === 'root' ? '' : column.render ? column.render(item) : item[column.key]}
                        </Box>
                    ))}
                </TreeItemContent>
                {children && <CustomCollapse {...getGroupTransitionProps()} />}
            </TreeItemRoot>
        </TreeItemProvider>
    );
});

// ─── List view (Finder like columns) ──────────────────────────────────────────
const LIST_ROW_HEIGHT = 28;

// same width / alignment for the header and the cells, so they line up
const columnSx = (column) => ({
    width: column.width || 140,
    flexShrink: 0,
    textAlign: column.align || 'left',
    fontSize: '0.8125rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    opacity: 0.75,
    display: column.hideBelow ? { xs: 'none', [column.hideBelow]: 'block' } : 'block',
});

function ListHeader({ columns, nameLabel, sort, onSortChange, checkboxSelection }) {
    const headerCell = (key, label, sx) => {
        const active = sort?.field === key;
        const SortIcon = sort?.dir === 'desc' ? KeyboardArrowDownRounded : KeyboardArrowUpRounded;
        return (
            <Box key={key}
                 role="columnheader"
                 aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                 onClick={onSortChange ? () => onSortChange(key) : undefined}
                 sx={{
                     ...sx,
                     opacity: 1,
                     display: sx.display || 'flex',
                     alignItems: 'center',
                     justifyContent: sx.textAlign === 'right' ? 'flex-end' : 'flex-start',
                     gap: 0.5,
                     fontWeight: active ? 700 : 500,
                     cursor: onSortChange ? 'pointer' : 'default',
                     userSelect: 'none',
                     borderLeft: key === 'name' ? 'none' : '1px solid',
                     borderColor: 'divider',
                     pl: key === 'name' ? 0 : 1,
                     '&:hover': onSortChange ? { color: 'primary.main' } : undefined,
                 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                {active && <SortIcon fontSize="small" />}
            </Box>
        );
    };
    return (
        <Box role="row" sx={(theme) => ({
            position: 'sticky',
            top: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            height: 34,
            px: 1,
            // expand icon (16px) + gap, checkbox
            pl: `calc(${theme.spacing(1)} + 24px + ${checkboxSelection ? '32px' : '0px'})`,
            backgroundColor: theme.palette.background.paper,
            borderBottom: `1px solid ${theme.palette.divider}`,
            fontSize: '0.8125rem',
            color: theme.palette.text.secondary,
        })}>
            {headerCell('name', nameLabel || 'Name', { flex: 1, minWidth: 0 })}
            {columns.map(column => headerCell(column.key, column.label, { ...columnSx(column), display: column.hideBelow ? { xs: 'none', [column.hideBelow]: 'flex' } : 'flex' }))}
        </Box>
    );
}

// row styles of the list view (compact rows, zebra stripes through a background with the row height)
const listViewSx = (theme) => ({
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 1,
    overflow: 'hidden',
    backgroundColor: theme.palette.background.paper,
    '& .fe-tree': {
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${LIST_ROW_HEIGHT}px, ${alpha(theme.palette.text.primary, 0.035)} ${LIST_ROW_HEIGHT}px, ${alpha(theme.palette.text.primary, 0.035)} ${LIST_ROW_HEIGHT * 2}px)`,
        backgroundAttachment: 'local',
        padding: 0,
        margin: 0,
    },
    '& .fe-row': {
        flexDirection: 'row',
        height: LIST_ROW_HEIGHT,
        marginTop: 0,
        marginBottom: 0,
        paddingTop: 0,
        paddingBottom: 0,
        borderRadius: '6px',
    },
    '& .fe-row .MuiCheckbox-root': { order: 0 },
    '& .fe-row .labelIcon': { width: '1.25rem !important', height: '1.25rem !important', fontSize: '1.25rem !important' },
    '& .fe-row .labelIcon::before': { display: 'none' },
    '& .fe-row[data-focused] .fe-cell, & .fe-row[data-selected] .fe-cell': { opacity: 0.9 },
    '& ul': { padding: 0, margin: 0 },
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
/**
 * Returns a sorted copy of the tree. The root node (id 'root') stays on top, its children are the
 * top level items themselves (see init), so it is not recursed into.
 */
const sortTreeItems = (items, compareItems) => {
    if (!items || !compareItems) return items;
    const sortLevel = (list) => {
        const rootNodes = list.filter(item => item.id === 'root');
        const rest = list.filter(item => item.id !== 'root')
            .map(item => item.children?.length ? { ...item, children: sortLevel(item.children) } : item)
            .sort(compareItems);
        return [...rootNodes, ...rest];
    };
    return sortLevel(items);
};

const FileExplorer = React.forwardRef(function FileExplorer({
                                                                onFetch,
                                                                onItemClick,
                                                                ContextMenu,
                                                                onItemAction,
                                                                defaultExpandedItems,
                                                                enableDragAndDrop = false,
                                                                checkboxSelection = false,
                                                                multiSelect = false,
                                                                selectionPropagation,
                                                                isItemSelectionDisabled,
                                                                onSelectionChange,
                                                                compareItems,
                                                                // list view like the Finder: [{key, label, width, align, hideBelow, render(item)}]
                                                                columns,
                                                                nameLabel,
                                                                sort,
                                                                onSortChange
                                                            }, ref) {

    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [expandedItems, setExpandedItems] = useState([]);
    const [contextMenu, setContextMenu] = useState(null); // { position, item }
    const [draggedId, setDraggedId] = useState(null);
    const [selectedItems, setSelectedItems] = useState([]);
    const [loadingItems, setLoadingItems] = useState(new Set());
    const apiRef = useRichTreeViewApiRef();

    // Keep the latest values reachable from the imperative handle (created once)
    const latestRef = React.useRef({});
    latestRef.current = { data, selectedItems };

    const updateSelection = (newSelected) => setSelectedItems(newSelected);

    // Report every selection change (user clicks, programmatic toggles, propagation to lazy loaded children)
    useEffect(() => {
        onSelectionChange?.(selectedItems);
    }, [selectedItems]);

    // Clicking the checkbox also fires the item click. It must neither expand nor trigger item actions.
    const isCheckboxClick = (event) => !!(checkboxSelection && event?.target?.closest?.('.MuiCheckbox-root'));


    // Stable ref passed via context so CustomTreeItem always has latest data
    const contextMenuRef = React.useRef(null);
    contextMenuRef.current = {
        loadingItems,
        columns,
        onContextMenu: (event, item) => {
            // In checkbox mode the selection belongs to the user, a right click must not reset it
            if (!checkboxSelection) setSelectedItems([item.id]);
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

        getItem: (id) => findById(latestRef.current.data || [], id),

        getSelectedItemIds: () => latestRef.current.selectedItems,

        // Select / deselect an item programmatically (selection propagation is applied by the tree)
        toggleItemSelection: (id, event) => {
            if (!id || id === 'root') return;
            if (isItemSelectionDisabled?.(findById(latestRef.current.data || [], id))) return;
            apiRef.current?.setItemSelection({ itemId: id, event, keepExistingSelection: true });
        },

        // Escape hatch: force a full reload of the tree from the data source
        reload: () => {
            setData(null);
            setExpandedItems([]);
            setSelectedItems([]);
        },
    }), []);

    // Sorted copy for rendering only: the state (data) keeps its order, so the imperative api, drag and drop
    // and lazy loading keep working on the same objects. Changing the sort keeps expanded folders open.
    const items = React.useMemo(() => sortTreeItems(data, compareItems), [data, compareItems]);

    if (error) return error.message;
    if (!data) return null;

    return (
        <TreeContextMenuContext.Provider value={contextMenuRef}>
            <Box sx={columns?.length ? listViewSx : undefined}>
            {columns?.length > 0 && <ListHeader columns={columns}
                                                nameLabel={nameLabel}
                                                sort={sort}
                                                onSortChange={onSortChange}
                                                checkboxSelection={checkboxSelection}/>}
            <RichTreeView
                className="fe-tree"
                apiRef={apiRef}
                checkboxSelection={checkboxSelection}
                multiSelect={multiSelect}
                selectionPropagation={selectionPropagation}
                isItemSelectionDisabled={isItemSelectionDisabled}
                selectedItems={multiSelect ? selectedItems : (selectedItems[0] ?? null)}
                onSelectedItemsChange={(event, newSelected) => {
                    updateSelection(Array.isArray(newSelected) ? newSelected : (newSelected ? [newSelected] : []));
                }}
                expandedItems={expandedItems}
                items={items}
                onExpandedItemsChange={(event, newExpandedItems) => {
                    setExpandedItems(newExpandedItems);
                }}
                getItemChildren={(item) => {
                    if (item.children && item.id!=='root') return item.children;
                    return [];
                }}
                onItemClick={(event, id) => {
                    if (id === 'root' || isCheckboxClick(event)) return;

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

                            // Children loaded after their folder was checked inherit the selection
                            if (checkboxSelection && multiSelect && selectionPropagation?.descendants && hasChildren) {
                                setSelectedItems(prev => {
                                    if (!prev.includes(id)) return prev;
                                    const childIds = fetchedItem.children.map(c => c.id).filter(c => !prev.includes(c));
                                    return childIds.length ? [...prev, ...childIds] : prev;
                                });
                            }

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
                itemChildrenIndentation={columns?.length ? 20 : 24}
            />
            </Box>
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