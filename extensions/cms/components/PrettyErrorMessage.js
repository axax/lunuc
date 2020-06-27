import React from 'react'
import ReactDOM from 'react-dom'

class PrettyErrorMessage extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        const {e,code,msg,offset} = this.props
        if( code ) {
            return <span
                dangerouslySetInnerHTML={{__html: this.prettyErrorMessage(e, code, offset)}}/>
        }else{
            return <b><i>{msg || e.message}</i></b>
        }
    }

    prettyErrorMessage = (e, code, offset=0) => {
        let lineNrStr, column, errorMsg = '<pre style="margin-top:2rem">'

        if(e.message.indexOf('in JSON at')>0){
            const pos = parseInt(e.message.substring(e.message.lastIndexOf(' ')))
            lineNrStr = code.substring(0,pos).split('\n').length - 1
            column=0
        }else {
            const line = e.stack.split('\n')[1], matches = line.match(/:(\d*):(\d*)/)
            if (matches && matches.length > 2) {
                lineNrStr = matches[1]
                column = matches[2]
            } else {
                lineNrStr = column = offset
            }
        }
        if (lineNrStr !== undefined) {
            const lineNr = parseInt(lineNrStr)
            const cbLines = code.split('\n'),
                start = Math.max(offset, lineNr - 3),
                end = Math.min(cbLines.length, lineNr + 4)
            for (let i = start; i < end; i++) {

                const str = cbLines[i - offset]
                if (i === lineNr) {
                    errorMsg += `<i style="background:red;color:#fff">Line ${i - (offset-1)}: ${e.message}</i>\n<i style="background:yellow">${str}</i>\n`
                } else {
                    errorMsg += str + '\n'
                }
            }
        } else {
            errorMsg += e.message
        }
        errorMsg += '</pre>'
        return errorMsg
    }
}
export default PrettyErrorMessage
