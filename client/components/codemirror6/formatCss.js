export const formatCss = (cssCode) => {
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
        let newLine = '',
            indentOffset = 0
        for (let i = 0; i < trimmedLine.length; i++) {
            const char = trimmedLine[i]
            if(char==='{'){
                if((i>0 && trimmedLine[i-1]==='$') || inCmd>0) {
                    newLine+=char
                    inCmd++
                }else{
                    indentOffset++
                    indentLevel++
                    newLine += char + '\n'
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
                    indentLevel--
                    newLine += char
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

    return formattedCode
}
