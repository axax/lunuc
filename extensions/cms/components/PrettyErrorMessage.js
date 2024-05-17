import React from 'react'

class PrettyErrorMessage extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        const {e,code,msg,offset} = this.props
        if( code && e ) {
            return <span dangerouslySetInnerHTML={{__html: this.prettyErrorMessage(e, code, offset)}}/>
        }else{
            return <b><i>{msg || e.message}</i></b>
        }
    }

    prettyErrorMessage = (e, code, offset=1) => {
        let lineNrStr, columnNrStr='0', errorMsg = '<pre style="margin-top:2rem">'

        if(e.message.indexOf('is not valid JSON')>0){
            const pos = e.message.lastIndexOf('..."')
            if(pos>=0){
                let tmp = e.message.substring(pos+4).split('\n')[0]
                tmp = tmp.substring(0,tmp.indexOf('"...'))
                const lines = code.split('\n')
                for(let i = 0;i< lines.length;i++){
                    if(lines[i].indexOf(tmp)>=0){
                        lineNrStr=i
                        break
                    }
                }
            }
        }else if(e.message.indexOf('in JSON at')>0){
            columnNrStr = e.message.substring(e.message.indexOf(' column ')+8)
            columnNrStr = columnNrStr.substring(0,columnNrStr.indexOf(')'))
            lineNrStr = e.message.substring(e.message.indexOf('(line ')+6)
            lineNrStr = lineNrStr.substring(0,lineNrStr.indexOf(' ')+1)
        }else {
            let line = e.stack.split('\n')[1]
            const anPos = line.indexOf('<anonymous>:')
            if(anPos>=0){
                line = line.substring(anPos-1)
            }
            const matches = line.match(/:(\d*):(\d*)/)
            if (matches && matches.length > 2) {
                lineNrStr = matches[1]
                columnNrStr = matches[2]
            } else {
                lineNrStr = offset
            }
        }
        if (lineNrStr !== undefined) {
            const cbLines = code.split('\n'),
                lineNr = Math.min(parseInt(lineNrStr),cbLines.length),
                columnNr = parseInt(columnNrStr),
                start = Math.max(offset, lineNr - 3),
                end = Math.min(cbLines.length, lineNr + 4)

            for (let i = start; i <= end; i++) {

                let str = cbLines[i - offset]
                if (i === lineNr) {
                    if(columnNr>0 && str.length>100){
                        str = '...'+str.substring(columnNr-25, columnNr+25)+'...'
                    }
                    errorMsg += `<i style="background:rgba(255,255,200,1);color:#000;font-size: 0.9rem">Line ${i - (offset-1)}: ${e.message}</i><br/><strong><i style="background:red;color:#fff">${str}</i></strong>\n`
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
