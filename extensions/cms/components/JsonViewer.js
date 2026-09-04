import React, { createContext, useContext, useState, useCallback } from 'react';
import { styled } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {_t} from '../../../util/i18n.mjs'

// Styled Components
const JsonContainer = styled(Box)(({ theme }) => ({
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    backgroundColor: theme.palette.grey[50],
    padding: theme.spacing(3),
    overflow: 'auto',
    maxHeight: '80vh',
    height: '100%',
    lineHeight: 1.5,
}));

const JsonLine = styled(Box)(({ theme, indent = 0 }) => ({
    padding: '3px 2px',
    paddingLeft: `${indent}px`,
    display: 'flex',
    alignItems: 'flex-start',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    '&:hover': {
        backgroundColor: theme.palette.grey[100],
    },
}));

const JsonKey = styled('span')({ color: '#1976d2', fontWeight: 500 });
const JsonString = styled('span')({ color: '#2e7d32' });
const JsonNumber = styled('span')({ color: '#ed6c02' });
const JsonBoolean = styled('span')({ color: '#9c27b0' });
const JsonNull = styled('span')({ color: '#757575' });
const JsonBracket = styled('span')({ color: '#546e7a', fontWeight: 600 });
const JsonLength = styled('span')({ color: '#78909c', fontSize: '0.8em', marginLeft: '4px' });
const CircularRef = styled('span')({ color: '#d32f2f', fontStyle: 'italic' });

// Context, um den Rechtsklick-Handler an alle Nodes weiterzugeben,
// ohne ihn manuell durch jede Ebene durchzureichen
const JsonViewerContext = createContext(null);

// ====================== JSON NODE ======================
const JsonNode = ({ data, name = null, level = 0, ancestors = [] }) => {
    const [isExpanded, setIsExpanded] = useState(level === 0);
    const indent = level * 10;
    const { openContextMenu } = useContext(JsonViewerContext);

    const handleContextMenu = (event) => {
        event.preventDefault();
        event.stopPropagation();
        openContextMenu(event, data);
    };

    // Primitives
    if (data === null) {
        return (
            <JsonLine indent={indent} onContextMenu={handleContextMenu}>
                {name && <JsonKey>{name}: </JsonKey>}
                <JsonNull>null</JsonNull>
            </JsonLine>
        );
    }
    if (typeof data === 'boolean') {
        return (
            <JsonLine indent={indent} onContextMenu={handleContextMenu}>
                {name && <JsonKey>{name}: </JsonKey>}
                <JsonBoolean>{data.toString()}</JsonBoolean>
            </JsonLine>
        );
    }
    if (typeof data === 'number') {
        return (
            <JsonLine indent={indent} onContextMenu={handleContextMenu}>
                {name && <JsonKey>{name}: </JsonKey>}
                <JsonNumber>{data}</JsonNumber>
            </JsonLine>
        );
    }
    if (typeof data === 'string') {
        return (
            <JsonLine indent={indent} onContextMenu={handleContextMenu}>
                {name && <JsonKey>{name}: </JsonKey>}
                <JsonString>"{data}"</JsonString>
            </JsonLine>
        );
    }

    // Object or Array
    if (data !== null && typeof data === 'object') {
        const isArray = Array.isArray(data);
        const isEmpty = isArray ? data.length === 0 : Object.keys(data).length === 0;

        if (ancestors.includes(data)) {
            return (
                <JsonLine indent={indent} onContextMenu={handleContextMenu}>
                    {name && <JsonKey>{name}: </JsonKey>}
                    <CircularRef>[Circular Reference]</CircularRef>
                </JsonLine>
            );
        }

        const toggle = () => setIsExpanded(!isExpanded);
        const currentAncestors = [...ancestors, data];

        return (
            <Box sx={{ paddingLeft: `${indent}px` }}>
                {/* Opening */}
                <JsonLine
                    indent={0}
                    onClick={toggle}
                    onContextMenu={handleContextMenu}
                    sx={{ cursor: 'pointer', userSelect: 'none' }}
                >
                    {name && <JsonKey>{name}: </JsonKey>}
                    <JsonBracket>
                        {isArray ? '[' : '{'}{isExpanded ? '−' : '+'}{isArray ? ']' : '}'}
                    </JsonBracket>
                    <JsonLength>
                        {' '}
                        {isArray ? `${data.length} items` : `${Object.keys(data).length} properties`}
                    </JsonLength>
                </JsonLine>

                {/* Children */}
                {isExpanded && !isEmpty && (
                    <>
                        {isArray
                            ? data.map((item, index) => (
                                <JsonNode
                                    key={index}
                                    data={item}
                                    level={level + 1}
                                    ancestors={currentAncestors}
                                />
                            ))
                            : Object.entries(data).map(([key, value]) => (
                                <JsonNode
                                    key={key}
                                    data={value}
                                    name={key}
                                    level={level + 1}
                                    ancestors={currentAncestors}
                                />
                            ))}
                    </>
                )}

                {/* Closing Bracket */}
                {isExpanded && (
                    <JsonLine indent={0}>
                        <JsonBracket>{isArray ? ']' : '}'}</JsonBracket>
                    </JsonLine>
                )}
            </Box>
        );
    }

    return null;
};

// ====================== MAIN COMPONENT ======================
const JsonViewer = ({ json }) => {
    const [contextMenu, setContextMenu] = useState(null); // { mouseX, mouseY, data }

    const openContextMenu = useCallback((event, data) => {
        setContextMenu({
            mouseX: event.clientX + 2,
            mouseY: event.clientY - 6,
            data,
        });
    }, []);

    const handleClose = () => setContextMenu(null);

    const handleCopy = async () => {
        if (contextMenu) {
            try {
                const seen = new WeakSet();
                const jsonString = JSON.stringify(
                    contextMenu.data,
                    (key, value) => {
                        if (typeof value === 'object' && value !== null) {
                            if (seen.has(value)) return '[Circular Reference]';
                            seen.add(value);
                        }
                        return value;
                    },
                    2
                );
                await navigator.clipboard.writeText(jsonString);
            } catch (err) {
                console.error('Kopieren fehlgeschlagen', err);
            }
        }
        handleClose();
    };

    return (
        <JsonViewerContext.Provider value={{ openContextMenu }}>
            <JsonContainer>
                <JsonNode data={json} />
            </JsonContainer>
            <Menu
                open={contextMenu !== null}
                onClose={handleClose}
                anchorReference="anchorPosition"
                anchorPosition={
                    contextMenu !== null
                        ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
                        : undefined
                }
            >
                <MenuItem onClick={handleCopy}>
                    <ListItemIcon>
                        <ContentCopyIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{_t('JsonViewer.copy.value')}</ListItemText>
                </MenuItem>
            </Menu>
        </JsonViewerContext.Provider>
    );
};

export default JsonViewer;