export const formatCss = (cssCode) => {
    let formattedCode = ''

    // Remove leading and trailing whitespace
    cssCode = cssCode.trim()

    // Add indentation
    let indentLevel = 0
    const indentSize = 2
    const lines = cssCode.split('\n')
    lines.forEach((line) => {
        let hasBrackets = false
        if (line.includes('{')) {
            formattedCode += ' '.repeat(indentLevel * indentSize) + line.trim() + '\n'
            indentLevel++
            hasBrackets=true
        }
        if (line.includes('}')) {
            indentLevel--
            formattedCode += ' '.repeat(indentLevel * indentSize) + line.trim() + '\n'
            hasBrackets=true
        }
        if(!hasBrackets){
            formattedCode += ' '.repeat(indentLevel * indentSize) + line.trim() + '\n'
        }
    })

    return formattedCode
}
