export const formatCss = (cssCode, run=0) => {
    let formattedCode = ''

    // Remove leading and trailing whitespace
    cssCode = cssCode.trim()

    // Add indentation
    let indentLevel = 0
    const indentSize = 2
    // never allow negative indentation (e.g. unbalanced closing braces)
    const indent = (level) => ' '.repeat(Math.max(0, level) * indentSize)
    const lines = cssCode.split('\n')
    let inCmd = 0
    // content inside template literals (`...`) must not be formatted
    let inBacktick = false
    const findBacktick = (str) => {
        for (let i = 0; i < str.length; i++) {
            if (str[i] === '`' && (i === 0 || str[i - 1] !== '\\')) {
                return i
            }
        }
        return -1
    }
    lines.forEach((line) => {
        let rawPrefix = ''
        if (inBacktick) {
            const idx = findBacktick(line)
            if (idx < 0) {
                // whole line is inside a template literal -> keep as is
                formattedCode += (formattedCode ? '\n' : '') + line
                return
            }
            // keep everything up to the closing backtick untouched
            rawPrefix = line.substring(0, idx + 1)
            line = line.substring(idx + 1)
            inBacktick = false
        }
        const trimmedLine = rawPrefix ? line.trimEnd() : line.trim()

        // Handle `@import` and similar at-rule statements
        if (trimmedLine.startsWith('@import') || trimmedLine.startsWith('@charset')) {
            formattedCode += (formattedCode && !formattedCode.endsWith('\n') ? '\n' : '') + trimmedLine + '\n'
            return
        }

        let newLine = '',
            indentOffset = 0
        for (let i = 0; i < trimmedLine.length; i++) {
            const char = trimmedLine[i]
            if (inBacktick) {
                newLine += char
                if (char === '`' && trimmedLine[i - 1] !== '\\') {
                    inBacktick = false
                }
                continue
            }
            if (char === '`') {
                newLine += char
                inBacktick = true
                continue
            }
            if(char===';'){
                newLine+=char
                // not in url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 19.4142132 11.1213207"><path d="M9.707 11.121l-9.707-9.707 1.414-1.414 8.293 8.293 8.293-8.293 1.414 1.414z"/></svg>');
                const isInUrl = newLine.indexOf('url(')>=0

                if(!inCmd && !isInUrl && i<trimmedLine.length-1) {
                    // if not last char
                    newLine += '\n' + indent(indentLevel)
                }
            }else if(char==='{'){
                if((i>0 && trimmedLine[i-1]==='$') || inCmd>0) {
                    newLine+=char
                    inCmd++
                }else{
                    indentOffset++
                    indentLevel++
                    newLine += char
                    if(i<trimmedLine.length-1) {
                        // if not last char
                        newLine += '\n' + indent(indentLevel)
                    }
                }
            } else if(char==='}'){
                if(inCmd>0){
                    newLine+=char
                    inCmd--
                }else{
                    if(i>0){
                        newLine = newLine.trim() + '\n' + indent(indentLevel-indentOffset)
                    }
                    if(indentOffset>0){
                        indentOffset--
                    }
                    if(i>0){
                        newLine = newLine.trim() + '\n' + indent(indentLevel)
                    }
                    if (indentLevel > 0) {
                        indentLevel--
                    }
                    newLine += char
                    if(i<trimmedLine.length-1) {
                        // if not last char
                        newLine += '\n' + indent(indentLevel)
                    }
                }
            }else{
                newLine+=char
            }
        }

        if (rawPrefix) {
            formattedCode += (formattedCode ? '\n' : '') + rawPrefix + newLine
            return
        }

        if(!newLine) {
            // keep breaks
            //formattedCode += '\n'
        }else {

            if (formattedCode && !formattedCode.endsWith('\n')) {
                formattedCode += '\n'
            }
            formattedCode += indent(indentLevel - indentOffset) + newLine
        }
    })
    if(run===0){
        // do another run
        return formatCss(formattedCode, run+1)
    }
    return formattedCode
}
