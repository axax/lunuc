export const formatCss = (cssCode, run=0) => {
    let formattedCode = ''

    // Remove leading and trailing whitespace
    cssCode = cssCode.trim()

    // Add indentation
    let indentLevel = 0
    const indentSize = 2
    const lines = cssCode.split('\n')
    let inCmd = 0
    lines.forEach((line) => {
        const trimmedLine = line.trim()

        // Handle `@import` and similar at-rule statements
        if (trimmedLine.startsWith('@import') || trimmedLine.startsWith('@charset')) {
            formattedCode += (formattedCode && !formattedCode.endsWith('\n') ? '\n' : '') + trimmedLine + '\n'
            return
        }

        let newLine = '',
            indentOffset = 0
        for (let i = 0; i < trimmedLine.length; i++) {
            const char = trimmedLine[i]
            if(char===';'){
                newLine+=char
                if(!inCmd && i<trimmedLine.length-1) {
                    // if not last char
                    newLine += '\n' + ' '.repeat((indentLevel) * indentSize)
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
                        newLine += '\n' + ' '.repeat((indentLevel) * indentSize)
                    }
                }
            } else if(char==='}'){
                if(inCmd>0){
                    newLine+=char
                    inCmd--
                }else{
                    if(i>0){
                        newLine = newLine.trim() + '\n' + ' '.repeat((indentLevel-indentOffset) * indentSize)
                    }
                    if(indentOffset>0){
                        indentOffset--
                    }
                    if(i>0){
                        newLine = newLine.trim() + '\n' + ' '.repeat((indentLevel) * indentSize)
                    }
                    indentLevel--
                    newLine += char
                    if(i<trimmedLine.length-1) {
                        // if not last char
                        newLine += '\n' + ' '.repeat((indentLevel) * indentSize)
                    }
                }
            }else{
                newLine+=char
            }
        }

        if(!newLine) {
            // keep breaks
            //formattedCode += '\n'
        }else {

            if (formattedCode && !formattedCode.endsWith('\n')) {
                formattedCode += '\n'
            }
            formattedCode += ' '.repeat((indentLevel - indentOffset) * indentSize) + newLine
        }
    })
    if(run===0){
        // do another run
        return formatCss(formattedCode, run+1)
    }
    return formattedCode
}
