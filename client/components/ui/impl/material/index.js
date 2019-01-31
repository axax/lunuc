/*
 There are different options for styling
 1. Add styles to the style.less file
 2. Change properties in the theme (see const theme below)
 3. use withStyles (see const styles below)
 */

import './style.less'
import React from 'react'
import blue from '@material-ui/core/colors/blue';

// material theme
import {MuiThemeProvider, createMuiTheme} from '@material-ui/core/styles'
import defaultSpacing from '@material-ui/core/styles/spacing'

// override the default theme
export const theme = createMuiTheme({
    palette: {
        primary: blue,
    },
    overrides: {
        MuiButton: {
            // Name of the styleSheet
            root: {
                margin: defaultSpacing.unit
            },
        },
        MuiInput: {
            root: {
                margin: defaultSpacing.unit
            },
            formControl: {
                margin: 0
            }
        },
        MuiFormControl: {
            root: {
                margin: defaultSpacing.unit
            },
            fullWidth: {
                margin: `${defaultSpacing.unit}px 0`
            }
        },
        MuiChip: {
            root: {
                margin: defaultSpacing.unit
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
import {createGenerateClassName} from '@material-ui/core/styles'

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
export {withStyles} from '@material-ui/core/styles'

// Export material-ui coponents directly
export Typography from '@material-ui/core/Typography'
export Button from '@material-ui/core/Button'
export Fab from '@material-ui/core/Fab'
export Input from '@material-ui/core/Input'
export TextField from '@material-ui/core/TextField'
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
export Stepper, {Step, StepLabel, StepContent} from '@material-ui/core/Stepper'
export Tabs from '@material-ui/core/Tabs'
export Tab from '@material-ui/core/Tab'

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

export const MenuListItem = ({primary, ...rest}) => {
    return <ListItem {...rest}>
        <ListItemText
            primary={primary}
            secondary={null}
        />
    </ListItem>
}


// cards
import MaterialCard from '@material-ui/core/Card'
import MaterialCardActions from '@material-ui/core/CardActions'
import MaterialCardContent from '@material-ui/core/CardContent'
export const Card = ({children, ...rest}) => {
    return <MaterialCard {...rest}>
        <MaterialCardContent>
            {children}
        </MaterialCardContent>
    </MaterialCard>
}

// ExpansionPanel
import MaterialExpansionPanel from '@material-ui/core/ExpansionPanel'
import ExpansionPanelSummary from '@material-ui/core/ExpansionPanelSummary'
import ExpansionPanelDetails from '@material-ui/core/ExpansionPanelDetails'
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';


export const ExpansionPanel = ({heading, children, ...rest}) => {
    return <MaterialExpansionPanel {...rest}>
        <ExpansionPanelSummary expandIcon={<ExpandMoreIcon />}>
            {heading}
        </ExpansionPanelSummary>
        <ExpansionPanelDetails>
            {children}
        </ExpansionPanelDetails>
    </MaterialExpansionPanel>
}

