/*
 There are different options for styling
 1. Add styles to the style.less file
 2. Change properties in the theme (see const theme below)
 3. use withStyles (see const styles below)
 */

import './style.less'
import React from 'react'

// material theme
import {MuiThemeProvider, createMuiTheme} from 'material-ui/styles'
import indigo from 'material-ui/colors/indigo'
import pink from 'material-ui/colors/pink'
import red from 'material-ui/colors/red'
const defaultTheme = createMuiTheme()

// override the default theme
const theme = createMuiTheme({
    overrides: {
        body:{
          background:  indigo[300]
        },
        MuiButton: {
            // Name of the styleSheet
            root: {

            },
        },
    },
    palette: {
        contrastThreshold: 3.1,
        tonalOffset: 0.07,
        primary: {
            light: indigo[300],
            main: indigo[500],
            dark: indigo[700],
            contrastText: defaultTheme.palette.getContrastText(indigo[500]),
        },
        secondary: {
            light: pink.A200,
            main: pink.A400,
            dark: pink.A700,
            contrastText: defaultTheme.palette.getContrastText(pink.A400),
        },
        error: red.A400,
    }
})

import JssProvider from 'react-jss/lib/JssProvider'
import { createGenerateClassName } from 'material-ui/styles'

const generateClassName = createGenerateClassName({
    dangerouslyUseGlobalCSS: false,
    productionPrefix: 'c',
})

// Theme provider
export const UIProvider = ({children, ...rest}) => {
    return <JssProvider generateClassName={generateClassName}><MuiThemeProvider disableStylesGeneration theme={theme} {...rest}>{children}</MuiThemeProvider></JssProvider>
}

// define some styles so it can be used in the components
export {withStyles} from 'material-ui/styles'


//Typography
import Typography from 'material-ui/Typography'
export {Typography}


// Button
export Button from 'material-ui/Button'

// Inputs
export Input from 'material-ui/Input'
export TextField from 'material-ui/TextField'
export Select from 'material-ui/Select'
export Checkbox from 'material-ui/Checkbox'
export FormControl from 'material-ui/Form'

// Chip
export Chip from 'material-ui/Chip'

// Divider
export Divider from 'material-ui/Divider'



//Switch
import {FormControlLabel} from 'material-ui/Form'
import MaterialSwitch from 'material-ui/Switch'
export const Switch = ({label, ...rest}) => {
    return <FormControlLabel
        control={
            <MaterialSwitch
                {...rest}
            />
        }
        label={label}
    />
}


// layout components
export const Layout = ({children, ...rest}) => {
    return <div {...rest}>{children}</div>
}
export const LayoutHeader = Layout
export const LayoutContent = Layout
export const LayoutFooter = Layout


// menu components
export {default as HeaderMenu} from './HeaderMenu'
export {default as SimpleMenu} from './SimpleMenu'
export {MenuItem} from 'material-ui/Menu'


// pagination
export {default as Pagination} from './Pagination'


// grid
import MaterialGrid from 'material-ui/Grid'

export const Row = ({...rest}) => {
    return <MaterialGrid container {...rest} />
}
export const Col = ({...rest}) => {
    return <MaterialGrid item {...rest} />
}

//drawer
export Drawer from 'material-ui/Drawer'


// Drawer layouts
export DrawerLayout from './DrawerLayout'

// Tables
export SimpleTable from './SimpleTable'

// Dialogs
export SimpleDialog from './SimpleDialog'



// list
import MaterialList, {
    ListItem as MaterialListItem,
    ListItemIcon as MaterialListItemIcon,
    ListItemText as MaterialListItemText
} from 'material-ui/List'

export const MenuList = ({children, ...rest}) => {
    return <MaterialList {...rest}>
        {children}
    </MaterialList>
}

export const MenuListItem = ({primary, ...rest}) => {
    return <MaterialListItem {...rest}>
        <MaterialListItemText
            primary={primary}
            secondary={null}
        />
    </MaterialListItem>
}


// snackbar
import MaterialSnackbar from 'material-ui/Snackbar'
export const Snackbar = ({children, ...rest}) => {
    return <MaterialSnackbar message={children} {...rest} />
}


// cards
import MaterialCard, {CardActions as MaterialCardActions, CardContent as MaterialCardContent} from 'material-ui/Card'
export const Card = ({children, ...rest}) => {
    return <MaterialCard {...rest}>
        <MaterialCardContent>
            {children}
        </MaterialCardContent>
    </MaterialCard>
}

// ExpansionPanel
import MaterialExpansionPanel, {
    ExpansionPanelSummary,
    ExpansionPanelDetails,
} from 'material-ui/ExpansionPanel'
import ExpandMoreIcon from 'material-ui-icons/ExpandMore';


export const ExpansionPanel = ({heading, children, ...rest}) => {
    return <MaterialExpansionPanel>
        <ExpansionPanelSummary expandIcon={<ExpandMoreIcon />}>
            {heading}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails>
            {children}
        </ExpansionPanelDetails>
    </MaterialExpansionPanel>
}


// toolbar
import MaterialAppBar from 'material-ui/AppBar'
import MaterialToolbar from 'material-ui/Toolbar'
export const Toolbar = ({title, children, ...rest}) => {
    return <MaterialAppBar {...rest} ><MaterialToolbar>
        <Typography type="title" color="inherit">
            {title}
        </Typography>
    </MaterialToolbar></MaterialAppBar>
}


// tooltip
export Tooltip from 'material-ui/Tooltip'


// linear progress
export {LinearProgress} from 'material-ui/Progress'
