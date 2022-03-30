import React from 'react';
import PropTypes from 'prop-types';
import Autosuggest from 'react-autosuggest';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import MenuItem from '@mui/material/MenuItem';
import {withStyles} from '@mui/styles';
import Util from 'client/util'


const renderInputComponent = (inputProps) => {
    const {
        helperText,
        classes, inputRef = () => {
        }, ref, ...other
    } = inputProps
    return <TextField
        fullWidth
        helperText={helperText}
        InputProps={{
            inputRef: node => {
                ref(node);
                inputRef(node);
            },
            classes: {
                input: classes.input,
            },
        }}
        {...other}
    />
}

const getSuggestionValue = (suggestion) => {
    return suggestion.value
}


const getSuggestions = (suggestions, value) => {
    if (!value) return []
    const inputValue = value.trim().toLowerCase()
    const inputLength = inputValue.length
    let count = 0

    return inputLength === 0
        ? []
        : suggestions.filter(suggestion => {
            const keep =
                count < 5 && (suggestion.name.toLowerCase().indexOf(inputValue) >= 0 || suggestion.value.toLowerCase().indexOf(inputValue) >= 0)
            /*suggestion.name.slice(0, inputLength).toLowerCase() === inputValue*/

            if (keep) {
                count += 1
            }

            return keep
        })
}


const styles = theme => ({
    root: {},
    hightlight: {
        backgroundColor: '#FFF59D'
    },
    container: {
        position: 'relative'
    },
    suggestionsContainerOpen: {
        position: 'absolute',
        zIndex: 1,
        marginTop: theme.spacing(1),
        left: 0,
        right: 0
    },
    suggestion: {
        display: 'block'
    },
    suggestionsList: {
        margin: 0,
        padding: 0,
        listStyleType: 'none'
    },
    divider: {
        height: theme.spacing(2)
    }
})

class SimpleAutosuggest extends React.Component {


    constructor(props) {
        super(props)

        this.state = {
            single: props.value || '',
            suggestions: []
        }
    }

    handleSuggestionsFetchRequested = ({value}) => {
        this.setState({
            suggestions: getSuggestions(this.props.items, value)
        })
    }

    handleSuggestionsClearRequested = () => {
        this.setState({
            suggestions: []
        })
    }

    handleChange = name => (event, {newValue}) => {
        this.setState({
            [name]: newValue
        }, () => {
            const {onChange} = this.props
            if (onChange) {
                onChange(event, newValue)
            }
        })
    }

    renderSuggestion = (suggestion, {query, isHighlighted}) => {
        const {classes} = this.props
        const pattern = new RegExp(`(${query.replace(/\s/g, '|')})`, 'gi')
        return <MenuItem selected={isHighlighted} component="div">
            <span
                dangerouslySetInnerHTML={{__html: Util.hightlight(`${suggestion.value} (${suggestion.name})`, query, classes.hightlight)}}/>
        </MenuItem>
    }

    helperText = () => {
        const a = this.props.items.filter(o => o.value === this.state.single)
        return a.length > 0 && a[0].name || ''
    }

    render() {
        const {classes, placeholder, onClick, onBlur} = this.props;
        const autosuggestProps = {
            renderInputComponent,
            suggestions: this.state.suggestions,
            onSuggestionsFetchRequested: this.handleSuggestionsFetchRequested,
            onSuggestionsClearRequested: this.handleSuggestionsClearRequested,
            getSuggestionValue,
            renderSuggestion: this.renderSuggestion
        }

        return <div className={classes.root}>
            <Autosuggest
                {...autosuggestProps}
                inputProps={{
                    classes,
                    placeholder,
                    helperText: this.helperText(),
                    value: this.state.single,
                    onChange: this.handleChange('single'),
                    onClick,
                    onBlur
                }}
                theme={{
                    container: classes.container,
                    suggestionsContainerOpen: classes.suggestionsContainerOpen,
                    suggestionsList: classes.suggestionsList,
                    suggestion: classes.suggestion,
                }}
                renderSuggestionsContainer={options => (
                    <Paper {...options.containerProps} square>
                        {options.children}
                    </Paper>
                )}
            />
        </div>
    }
}

SimpleAutosuggest.propTypes = {
    classes: PropTypes.object.isRequired,
    placeholder: PropTypes.string,
    value: PropTypes.string,
    items: PropTypes.array.isRequired,
    onClick: PropTypes.func,
    onBlur: PropTypes.func,
    onChange: PropTypes.func
}

export default withStyles(styles, {withTheme: true})(SimpleAutosuggest)
