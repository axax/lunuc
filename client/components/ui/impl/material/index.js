/*
 There are different options for styling
 1. Add styles to the style.less file
 2. Change properties in the theme (see const theme below)
 3. use withStyles (see const styles below)
 */

import './style.less'
import React from 'react'
import Hook from 'util/hook'

// material theme
import {MuiThemeProvider, createMuiTheme} from 'material-ui/styles'
const defaultTheme = createMuiTheme()

// override the default theme
export const theme = createMuiTheme({
    overrides: {
        MuiButton: {
            // Name of the styleSheet
            root: {
                margin: defaultTheme.spacing.unit
            },
        },
        MuiInput: {
            root: {
                margin: defaultTheme.spacing.unit
            },
            formControl: {
                margin: 0
            }
        },
        MuiFormControl: {
            root: {
                margin: defaultTheme.spacing.unit
            },
            fullWidth: {
                margin: `${defaultTheme.spacing.unit}px 0`
            }
        },
        MuiChip: {
            root: {
                margin: defaultTheme.spacing.unit
            },
        }
    },
    typography: {
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


import JssProvider from 'react-jss/lib/JssProvider'
import {createGenerateClassName} from 'material-ui/styles'

const generateClassName = createGenerateClassName({
    dangerouslyUseGlobalCSS: false,
    productionPrefix: 'c',
})

// Theme provider
export const UIProvider = ({children, ...rest}) => {
    return <JssProvider generateClassName={generateClassName}>
        <MuiThemeProvider disableStylesGeneration={false} theme={theme} {...rest}>{children}</MuiThemeProvider>
    </JssProvider>
}

// define some styles so it can be used in the components
export {withStyles} from 'material-ui/styles'

//Typography
import Typography from 'material-ui/Typography'

// Export material-ui coponents directly
export {Typography}
export Button from 'material-ui/Button'
export Input from 'material-ui/Input'
export TextField from 'material-ui/TextField'
export Select from 'material-ui/Select'
export Checkbox from 'material-ui/Checkbox'
export Switch from 'material-ui/Switch'
export {FormLabel, FormControl, FormControlLabel, FormHelperText} from 'material-ui/Form'
export Chip from 'material-ui/Chip'
export Divider from 'material-ui/Divider'
export Drawer from 'material-ui/Drawer'
export Snackbar from 'material-ui/Snackbar'
export Tooltip from 'material-ui/Tooltip'
export {LinearProgress, CircularProgress} from 'material-ui/Progress'
export {MenuItem} from 'material-ui/Menu'
export Paper from 'material-ui/Paper'


// simple components are extended componente with features easy to use
export SimpleHeaderMenu from './SimpleHeaderMenu'
export SimpleMenu from './SimpleMenu'
export SimpleTable from './SimpleTable'
export SimpleDialog from './SimpleDialog'
export SimpleSelect from './SimpleSelect'
export SimpleSwitch from './SimpleSwitch'
export SimpleButton from './SimpleButton'
export SimpleList from './SimpleList'

// grid
import Grid from 'material-ui/Grid'

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
export const SimpleToolbar = ({title, children, ...rest}) => {
    return <MaterialAppBar {...rest} ><MaterialToolbar>
        <Typography variant="title" color="inherit">
            {title}
        </Typography>
        {children}
    </MaterialToolbar></MaterialAppBar>
}

