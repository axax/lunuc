export const fixAndParseJSON = (jsonString) => {

    const errors= []
    let fixed = jsonString.trim()

    // Return early if empty
    if (!fixed) {
        return {
            json: {},
            errors: ['Input is empty'],
            success: false
        }
    }

    try {
        // First, try to parse as-is
        return {
            json: JSON.parse(fixed),
            errors: [],
            success: true
        }
    } catch (e) {
        // Continue with fixes
    }

    // Fix 0: add commas at end of line / remove empty lines
    const lines = fixed.split('\n').filter(lines => !!lines.trim());
    const lastLineIndex = lines.length - 1;
    const updated = lines.map((line, i) => {
        // Don't change the last line
        if (i === lastLineIndex) return line;
        // Trim right to check for comma
        const trimmed = line.trim();
        // If line starts with "{" skip
        if (trimmed.startsWith('{')) return line;
        // If already ends with comma, skip
        if (trimmed.endsWith(',')) return line;
        // Otherwise, add comma at end
        return line + ',';
    });
    fixed = updated.join('\n')

    // Fix 1: Replace single quotes with double quotes (but not inside strings)
    let inString = false;
    let escaped = false;
    let result = '';

    for (let i = 0; i < fixed.length; i++) {
        const char = fixed[i];
        const prevChar = i > 0 ? fixed[i - 1] : '';

        if (escaped) {
            result += char;
            escaped = false;
            continue;
        }

        if (char === '\\') {
            escaped = true;
            result += char;
            continue;
        }

        if (char === '"' && prevChar !== '\\') {
            inString = !inString;
            result += char;
            continue;
        }

        if (char === "'" && !inString) {
            result += '"';
            errors.push('Replaced single quotes with double quotes');
            continue;
        }

        result += char;
    }

    fixed = result;

    // Fix 2: Add quotes around unquoted keys
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, (match, prefix, key) => {
        if (!key.match(/^".*"$/)) {
            errors.push(`Added quotes around key: ${key}`);
            return `${prefix}"${key}":`;
        }
        return match;
    });

    // Fix 3: Add missing commas between object properties
    fixed = fixed.replace(/("\s*:\s*(?:"[^"]*"|'[^']*'|[^,}\]]+))\s*\n?\s*("[^"]+"\s*:)/g, (match, prop1, prop2) => {
        errors.push('Added missing comma between object properties');
        return `${prop1}, ${prop2}`;
    });

    // Fix 4: Add missing commas between array elements
    fixed = fixed.replace(/(["\d}\]true|false|null])\s*\n?\s*(["\d\[{])/g, (match, elem1, elem2, offset, string) => {
        // Don't add comma if we're between object and array boundaries
        const beforeMatch = string.substring(0, offset + elem1.length);
        const afterElem1 = string.substring(offset + elem1.length);

        // Check if this is actually inside an array by looking for unmatched brackets
        let bracketCount = 0;
        let inArray = false;

        for (let i = 0; i < beforeMatch.length; i++) {
            if (beforeMatch[i] === '[') {
                bracketCount++;
                inArray = true;
            } else if (beforeMatch[i] === ']') {
                bracketCount--;
                if (bracketCount === 0) inArray = false;
            }
        }

        if (inArray && bracketCount > 0) {
            errors.push('Added missing comma between array elements');
            return `${elem1}, ${elem2}`;
        }

        return match;
    });

    // Fix 5: Remove trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, (match, suffix) => {
        errors.push('Removed trailing comma');
        return suffix;
    });

    // Fix 6: Fix undefined values
    fixed = fixed.replace(/:\s*undefined/g, ': null');
    if (fixed !== jsonString && fixed.includes('null')) {
        errors.push('Replaced undefined with null');
    }

    // Fix 7: Fix unquoted string values that aren't boolean, null, or numbers
    fixed = fixed.replace(/:\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([,}\]])/g, (match, value, suffix) => {
        if (!['true', 'false', 'null'].includes(value) && isNaN(Number(value))) {
            errors.push(`Added quotes around value: ${value}`);
            return `: "${value}"${suffix}`;
        }
        return match;
    });

    // Fix 8: Handle missing brackets
    if (!fixed.startsWith('{') && !fixed.startsWith('[')) {
        if (fixed.includes(':')) {
            fixed = `{${fixed}}`;
            errors.push('Wrapped content in object brackets');
        } else if (fixed.includes(',')) {
            fixed = `[${fixed}]`;
            errors.push('Wrapped content in array brackets');
        }
    }

    // Fix 9: Balance brackets
    const openBrackets = (fixed.match(/\{/g) || []).length;
    const closeBrackets = (fixed.match(/\}/g) || []).length;
    const openSquare = (fixed.match(/\[/g) || []).length;
    const closeSquare = (fixed.match(/\]/g) || []).length;


    if (openBrackets > closeBrackets) {
        fixed += '}'.repeat(openBrackets - closeBrackets);
        errors.push('Added missing closing braces');
    }

    if (openSquare > closeSquare) {
        fixed += ']'.repeat(openSquare - closeSquare);
        errors.push('Added missing closing brackets');
    }

    // Final validation
    try {
        return {
            json:JSON.parse(fixed),
            errors,
            success: true,
            fixed:true
        };
    } catch (e) {
        return {
            errors: [...errors, `Still invalid: ${e instanceof Error ? e.message : 'Unknown error'}`],
            success: false
        };
    }
}