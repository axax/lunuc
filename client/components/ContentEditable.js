import React from 'react'
import PropTypes from 'prop-types'


const ContentEditable = ({tag, children, onChange, ...props}) => {
    return React.createElement(tag, {
        contentEditable: true,
        onInput: (e) => {
            onChange(e.target.innerText)
        },
        suppressContentEditableWarning: true, ...props
    }, children)
}


ContentEditable.propTypes = {
    tag: PropTypes.string,
    children: PropTypes.any,
    onChange: PropTypes.func,
}

export default ContentEditable