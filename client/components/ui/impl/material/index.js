/*
 There are different options for styling
 1. Add styles to the style.less file
 2. Change properties in the theme (see const theme below)
 3. use withStyles (see const styles below)
 */

import './style.less'
import React from 'react'
import blue from '@material-ui/core/colors/blue'

// material theme
import {MuiThemeProvider, createTheme} from '@material-ui/core/styles'
import defaultTheme from '@material-ui/core/styles/defaultTheme'
import CssBaseline from '@material-ui/core/CssBaseline'


// override the default theme
export const theme = createTheme({
    palette: {
        primary: blue,
    },
    overrides: {
        MuiButton: {
            // Name of the styleSheet
            root: {
                margin: defaultTheme.spacing(1)
            },
        },
        MuiInput: {
            root: {
                margin: defaultTheme.spacing(1)
            },
            formControl: {
                margin: 0
            }
        },
        MuiFormControl: {
            root: {
                margin: defaultTheme.spacing(1)
            },
            fullWidth: {
                margin: `${defaultTheme.spacing(1)}px`
            }
        },
        MuiChip: {
            root: {
                margin: defaultTheme.spacing(1)
            },
        }
    },
    typography: {
        useNextVariants: true,
        display4: {
            fontSize: '3rem'
        },
        display3: {
            fontSize: '2.5rem'
        },
        display1: {
            margin: '1em 0 0.7em'
        }
    }
})


import {JssProvider} from 'react-jss'
import {createGenerateClassName} from '@material-ui/styles'


const generateClassName = createGenerateClassName({
    dangerouslyUseGlobalCSS: false,
    productionPrefix: 'c',
})

// Theme provider
export const UIProvider = ({children, ...rest}) => {
    return <JssProvider generateClassName={generateClassName}>
        <CssBaseline/>
        <MuiThemeProvider theme={theme} {...rest}>{children}</MuiThemeProvider>
    </JssProvider>
}

// define some styles so it can be used in the components
export {withStyles} from '@material-ui/core/styles'

// Export material-ui coponents directly
export Typography from '@material-ui/core/Typography'
export AppBar from '@material-ui/core/AppBar'
export Toolbar from '@material-ui/core/Toolbar'
export Button from '@material-ui/core/Button'
export ButtonGroup from '@material-ui/core/ButtonGroup'
export Fab from '@material-ui/core/Fab'
export Input from '@material-ui/core/Input'
export InputBase from '@material-ui/core/InputBase'
export TextField from '@material-ui/core/TextField'
export InputLabel from '@material-ui/core/InputLabel'
export InputAdornment from '@material-ui/core/InputAdornment'
export IconButton from '@material-ui/core/IconButton'
export Select from '@material-ui/core/Select'
export Checkbox from '@material-ui/core/Checkbox'
export Switch from '@material-ui/core/Switch'
export FormLabel from '@material-ui/core/FormLabel'
export FormControl from '@material-ui/core/FormControl'
export FormControlLabel from '@material-ui/core/FormControlLabel'
export FormHelperText from '@material-ui/core/FormHelperText'
export Chip from '@material-ui/core/Chip'
export Divider from '@material-ui/core/Divider'
export Drawer from '@material-ui/core/Drawer'
export Snackbar from '@material-ui/core/Snackbar'
export Tooltip from '@material-ui/core/Tooltip'
export LinearProgress from '@material-ui/core/LinearProgress'
export CircularProgress from '@material-ui/core/CircularProgress'
export MenuItem from '@material-ui/core/MenuItem'
export Paper from '@material-ui/core/Paper'
export Avatar from '@material-ui/core/Avatar'
export Tabs from '@material-ui/core/Tabs'
export Tab from '@material-ui/core/Tab'
export Box from '@material-ui/core/Box'

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
import Grid from '@material-ui/core/Grid'

export const Row = ({...rest}) => {
    return <Grid container {...rest} />
}
export const Col = ({...rest}) => {
    return <Grid item {...rest} />
}

// Drawer layouts
export DrawerLayout from './layouts/DrawerLayout'
export ResponsiveDrawerLayout from './layouts/ResponsiveDrawerLayout'


// list
import List from '@material-ui/core/List'
import ListItem from '@material-ui/core/ListItem'
import ListItemText from '@material-ui/core/ListItemText'

export List from '@material-ui/core/List'
export ListItem from '@material-ui/core/ListItem'
export ListItemText from '@material-ui/core/ListItemText'
export ListItemSecondaryAction from '@material-ui/core/ListItemSecondaryAction'
export Collapse from '@material-ui/core/Collapse';

export const MenuList = ({children, ...rest}) => {
    return <List {...rest}>
        {children}
    </List>
}

export const MenuListItem = ({primary, secondary, ...rest}) => {
    return <ListItem {...rest}>
        <ListItemText
            primary={primary}
            secondary={secondary}
        />
    </ListItem>
}


// cards
import MaterialCard from '@material-ui/core/Card'
import MaterialCardActions from '@material-ui/core/CardActions'
import MaterialCardContent from '@material-ui/core/CardContent'
export CardContent from '@material-ui/core/CardContent'
export CardActions from '@material-ui/core/CardActions'

export const Card = ({children, ...rest}) => {
    return <MaterialCard {...rest}>
        <MaterialCardContent>
            {children}
        </MaterialCardContent>
    </MaterialCard>
}

// ExpansionPanel
import MaterialExpansionPanel from '@material-ui/core/Accordion'
import ExpansionPanelSummary from '@material-ui/core/AccordionSummary'
import ExpansionPanelDetails from '@material-ui/core/AccordionDetails'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';


export const ExpansionPanel = ({className, heading, children, ...rest}) => {
    return <MaterialExpansionPanel {...rest}>
        <ExpansionPanelSummary className={className && className.heading} expandIcon={<ExpandMoreIcon/>}>
            {heading}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails className={className && className.detail}>
            {children}
        </ExpansionPanelDetails>
    </MaterialExpansionPanel>
}

