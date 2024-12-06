import React from 'react'
import {UnControlled} from 'react-codemirror2'

class CodeMirrorWrapper extends UnControlled {

    shouldComponentUpdate(nextProps, nextState) {
        return !nextProps.hasError
    }
}

export default CodeMirrorWrapper
