export const formatJs = (code) => {
    // Step 1: Add spaces around binary operators
    // Remove existing whitespace
    code = code.trim();

    // Track indentation level
    let indentLevel = 0;
    const indentChar = '  '; // 2 spaces for indentation

    // Split code into lines and process each line
    const lines = code.split(/[\r\n]+/);
    const formattedLines = [];

    // Process each line
    for (let line of lines) {
        line = line.trim();

        // Handle closing braces/brackets - decrease indent before adding
        if (line.startsWith('}') || line.startsWith(']') || line.startsWith(')')) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        // Add proper indentation
        if (line.length > 0) {
            formattedLines.push(indentChar.repeat(indentLevel) + formatLine(line));
        }

        // Handle opening braces/brackets - increase indent after adding
        if (line.endsWith('{') || line.endsWith('[') || line.endsWith('(')) {
            indentLevel++;
        }
    }

    return formattedLines.join('\n');
}

/**
 * Format individual line by adding spaces around operators
 * @param line - Single line of code
 * @returns Formatted line
 */
function formatLine(line) {
    // Add space around operators
    line = line.replace(/(?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|([+\-*/%=&|<>!]+))/g, function(match, group) {
        return group ? ' ' + group + ' ' : match
    })

    // Remove extra spaces
    line = line.replace(/\s+/g, ' ');

    // Fix spacing around parentheses
    line = line.replace(/\(\s+/g, '(');
    line = line.replace(/\s+\)/g, ')');

    // Fix spacing around commas
    line = line.replace(/\s*,\s*/g, ', ');

    // Fix spacing around semicolons
    line = line.replace(/\s*;\s*/g, ';');

    // Fix spacing around colons
    line = line.replace(/\s*:\s*/g, ': ');

    return line.trim();
}

// Example usage:
const code = `function test(a, b) {let x= a + b; if(x>10){console.log('x is greater than 10');} else{console.log('x is not greater than 10');}}`;
console.log(formatJs(code));