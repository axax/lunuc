export const formatCss = (cssCode) => {
    let formattedCode = '';

    // Remove leading and trailing whitespace
    cssCode = cssCode.trim();

    // Add indentation
    let indentLevel = 0;
    const indentSize = 2;
    const lines = cssCode.split('\n');
    lines.forEach((line) => {
        if (line.includes('{')) {
            formattedCode += ' '.repeat(indentLevel * indentSize) + line.trim() + '\n';
            indentLevel++;
        } else if (line.includes('}')) {
            indentLevel--;
            formattedCode += ' '.repeat(indentLevel * indentSize) + line.trim() + '\n';
        } else {
            formattedCode += ' '.repeat(indentLevel * indentSize) + line.trim() + '\n';
        }
    });

    return formattedCode
}
