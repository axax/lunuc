import './style.less'
import React from 'react'

// material theme
import {ThemeProvider} from '@mui/material/styles'

import CssBaseline from '@mui/material/CssBaseline'


import theme from './theme'

export {theme}

import {CacheProvider} from '@emotion/react'
import createCache from '@emotion/cache'

const emotionCache = createCache({
    key: 'emotion-cache-no-speedy',
    speedy: !_app_.ssr && !window._elementWatchForceVisible,
})

// Theme provider
export const UIProvider = ({children, ...rest}) => {
    return <ThemeProvider theme={theme} {...rest}>
        <CacheProvider value={emotionCache}>
            {children}
        </CacheProvider>
        <CssBaseline/>
    </ThemeProvider>
}


// Export material-ui coponents directly
export Pagination from '@mui/material/Pagination'
export Stack from '@mui/material/Stack'
export Typography from '@mui/material/Typography'
export AppBar from '@mui/material/AppBar'
export Toolbar from '@mui/material/Toolbar'
export Button from '@mui/material/Button'
export ButtonGroup from '@mui/material/ButtonGroup'
export Fab from '@mui/material/Fab'
export Input from '@mui/material/Input'
export InputBase from '@mui/material/InputBase'
export TextField from '@mui/material/TextField'
export InputLabel from '@mui/material/InputLabel'
export InputAdornment from '@mui/material/InputAdornment'
export IconButton from '@mui/material/IconButton'
export Select from '@mui/material/Select'
export Checkbox from '@mui/material/Checkbox'
export Switch from '@mui/material/Switch'
export FormLabel from '@mui/material/FormLabel'
export FormControl from '@mui/material/FormControl'
export FormControlLabel from '@mui/material/FormControlLabel'
export FormHelperText from '@mui/material/FormHelperText'
export Chip from '@mui/material/Chip'
export Divider from '@mui/material/Divider'
export Drawer from '@mui/material/Drawer'
export Snackbar from '@mui/material/Snackbar'
export Tooltip from '@mui/material/Tooltip'
export LinearProgress from '@mui/material/LinearProgress'
export CircularProgress from '@mui/material/CircularProgress'
export MenuItem from '@mui/material/MenuItem'
export Paper from '@mui/material/Paper'
export Avatar from '@mui/material/Avatar'
export Tabs from '@mui/material/Tabs'
export Tab from '@mui/material/Tab'
export Box from '@mui/material/Box'

// simple components are extended componente with features easy to use
export SimpleHeaderMenu from './SimpleHeaderMenu'
export SimpleMenu from './SimpleMenu'
export SimpleTable from './SimpleTable'
export SimpleDialog from './SimpleDialog'
export SimpleSelect from './SimpleSelect'
export SimpleSwitch from './SimpleSwitch'
export SimpleButton from './SimpleButton'
export SimpleList from './SimpleList'
export SimpleToolbar from './SimpleToolbar'
export SimpleAutosuggest from './SimpleAutosuggest'
export {SimpleTab, SimpleTabPanel, SimpleTabs} from './SimpleTab'

export ContentBlock from './ContentBlock'

// grid
import Grid from '@mui/material/Grid'

export const Row = ({...rest}) => {
    return <Grid container {...rest} />
}
export const Col = ({...rest}) => {
    return <Grid item {...rest} />
}

// Drawer layouts
export DrawerLayout from './layouts/DrawerLayout'
export ResponsiveDrawerLayout from './layouts/ResponsiveDrawerLayout'

// Slider
export Slider from '@mui/material/Slider'


// list
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'

export List from '@mui/material/List'
export ListItem from '@mui/material/ListItem'
export ListItemText from '@mui/material/ListItemText'
import ListItemAvatar from '@mui/material/ListItemAvatar'
import Avatar from '@mui/material/Avatar'
export Collapse from '@mui/material/Collapse'
export ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction'


export const MenuList = ({children, ...rest}) => {
    return <List {...rest}>
        {children}
    </List>
}

export const MenuListItem = ({primary, secondary, image, ...rest}) => {
    return <ListItem {...rest}>
        {image?
            <ListItemAvatar sx={{ marginRight: 2}}>
                {image}
            </ListItemAvatar>:null
        }
        <ListItemText
            primary={primary}
            secondary={secondary}
        />
    </ListItem>
}


// cards
import MaterialCard from '@mui/material/Card'
import MaterialCardActions from '@mui/material/CardActions'
import MaterialCardContent from '@mui/material/CardContent'

export CardContent from '@mui/material/CardContent'
export CardActions from '@mui/material/CardActions'

export const Card = ({children, ...rest}) => {
    return <MaterialCard {...rest}>
        <MaterialCardContent>
            {children}
        </MaterialCardContent>
    </MaterialCard>
}

// ExpansionPanel
import MaterialExpansionPanel from '@mui/material/Accordion'
import ExpansionPanelSummary from '@mui/material/AccordionSummary'
import ExpansionPanelDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'


export const ExpansionPanel = ({className, disableGutters, heading, children, ...rest}) => {
    return <MaterialExpansionPanel disableGutters={disableGutters} className={className && className.constructor === String ? className : ''} {...rest}>
        <ExpansionPanelSummary className={className && className.heading} expandIcon={<ExpandMoreIcon/>}>
            {heading}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails className={className && className.detail}>
            {children}
        </ExpansionPanelDetails>
    </MaterialExpansionPanel>
}

