/**
 * Main function to convert a nested CSS-style string into a flat CSS string.
 * It handles nested selectors, media queries, keyframes, and CSS variables.
 *
 * @param {string} nestedCss The input string containing nested CSS.
 * @returns {string} A standard, flat CSS string.
 */
export const preprocessCss = (nestedCss) => {
    const startTime = new Date()

    // First, remove all comments to simplify the parsing logic.
    // This regex handles both multi-line (/*...*/) and single-line (//...) comments.
    const cssWithoutComments = nestedCss.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1')
    // Start the recursive flattening process.
    const flatCss = flatten(cssWithoutComments).trim()

    console.log(`css preprocessed in ${new Date() - startTime}ms`)
    return flatCss
}


/**
 * Recursively flattens a CSS string. This version is optimized to build the
 * result string using an array and join, avoiding inefficient concatenation in a loop.
 * @param {string} css - The CSS string to process.
 * @param {string} [parentSelector=''] - The selector of the parent context, used for nesting.
 * @returns {string} The processed, flattened CSS for the given context.
 */
function flatten(css, parentSelector = '') {
    const resultParts = []; // Use an array for efficient string building
    let i = 0;

    // Loop through the CSS string to find and process each rule block.
    while (i < css.length) {
        const selectorEnd = css.indexOf('{', i);
        if (selectorEnd === -1) {
            break;
        }

        // Find the matching '}' for the current block, correctly handling nested blocks.
        let braceCount = 1;
        let blockEnd = -1;
        for (let j = selectorEnd + 1; j < css.length; j++) {
            if (css[j] === '{') {
                braceCount++;
            } else if (css[j] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    blockEnd = j;
                    break;
                }
            }
        }

        if (blockEnd === -1) {
            console.error("Malformed CSS: Unterminated block.");
            break;
        }

        const selector = css.substring(i, selectorEnd).trim();
        const blockContent = css.substring(selectorEnd + 1, blockEnd);

        if (selector.startsWith('@')) {
            if (selector.startsWith('@media') || selector.startsWith('@supports')) {
                const innerCss = flatten(blockContent, parentSelector);
                if (innerCss) {
                    resultParts.push(`${selector} {\n${innerCss}}\n`);
                }
            } else {
                resultParts.push(`${selector} {${blockContent}}\n`);
            }
        } else if (selector) {
            const newSelector = buildSelector(parentSelector, selector);
            const {
                properties,
                nestedCss
            } = separatePropertiesAndNestedRules(blockContent);

            if (properties) {
                const propsArray = splitProperties(properties);
                if (propsArray.length > 0) {
                    const formattedProps = propsArray.map(p => `  ${p.trim()};`).join('\n');
                    resultParts.push(`${newSelector} {\n${formattedProps}\n}\n`);
                }
            }

            if (nestedCss) {
                resultParts.push(flatten(nestedCss, newSelector));
            }
        }

        i = blockEnd + 1;
    }

    const remainingCss = css.substring(i).trim();
    if (remainingCss && parentSelector) {
        const propsArray = splitProperties(remainingCss);
        if (propsArray.length > 0) {
            const formattedProps = propsArray.map(p => `  ${p.trim()};`).join('\n');
            resultParts.push(`${parentSelector} {\n${formattedProps}\n}\n`);
        }
    }

    return resultParts.join('');
}

/**
 * Splits a string of CSS properties into an array of individual properties.
 * This function correctly handles semicolons inside strings (e.g., in data URIs)
 * and parentheses (e.g., in `url()`).
 * @param {string} propertiesString - A string containing one or more CSS properties.
 * @returns {string[]} An array of property strings.
 */
function splitProperties(propertiesString) {
    const properties = [];
    let currentProp = '';
    let inString = null; // Can be ' or "
    let parenLevel = 0;

    for (let i = 0; i < propertiesString.length; i++) {
        const char = propertiesString[i];
        const prevChar = i > 0 ? propertiesString[i - 1] : null;

        if (inString) {
            currentProp += char;
            if (char === inString && prevChar !== '\\') {
                inString = null;
            }
        } else if (char === "'" || char === '"') {
            currentProp += char;
            inString = char;
        } else if (char === '(') {
            parenLevel++;
            currentProp += char;
        } else if (char === ')') {
            parenLevel--;
            currentProp += char;
        } else if (char === ';' && parenLevel === 0) {
            if (currentProp.trim()) {
                properties.push(currentProp.trim());
            }
            currentProp = '';
        } else {
            currentProp += char;
        }
    }

    if (currentProp.trim()) {
        properties.push(currentProp.trim());
    }

    return properties;
}


/**
 * Separates properties from nested rules within a CSS block's content. This version
 * is optimized to build strings using arrays and join.
 * @param {string} blockContent - The string from inside a CSS rule's braces.
 * @returns {{properties: string, nestedCss: string}} An object containing the properties and the nested rules.
 */
function separatePropertiesAndNestedRules(blockContent) {
    let properties = '';
    let nestedCss = '';
    let braceLevel = 0;
    let lastBreak = 0;

    for (let i = 0; i < blockContent.length; i++) {
        const char = blockContent[i];

        if (char === '{') {
            if (braceLevel === 0) {
                // Extract properties chunk before this nested block
                const chunk = blockContent.slice(lastBreak, i);
                const lastSemicolon = chunk.lastIndexOf(';');

                if (lastSemicolon !== -1) {
                    properties += chunk.slice(0, lastSemicolon + 1);
                    lastBreak += lastSemicolon + 1;
                }
            }
            braceLevel++;
        } else if (char === '}') {
            braceLevel--;
            if (braceLevel === 0) {
                // Extract nested block including braces
                nestedCss += blockContent.slice(lastBreak, i + 1) + '\n';
                lastBreak = i + 1;
            }
        }
    }

    // Append any remaining properties after last nested block
    if (lastBreak < blockContent.length) {
        properties += blockContent.slice(lastBreak);
    }

    return {
        properties,
        nestedCss: nestedCss.trim()
    };
}

/**
 * Combines a parent selector with a child selector.
 * Handles comma-separated lists and the '&' parent reference.
 * E.g., parent='.a, .b', child='&:hover' -> '.a:hover, .b:hover'
 * E.g., parent='.a', child='.c, .d' -> '.a .c, .a .d'
 *
 * @param {string} parent - The parent selector.
 * @param {string} child - The child/nested selector.
 * @returns {string} The combined, flattened selector.
 */
function buildSelector(parent, child) {
    if (!parent.trim()) return child
    let result = '',
        pParts = parent.split(','),
        cParts = child.split(',')
    for (let i = 0; i < pParts.length; i++) {
        let p = pParts[i].trim()
        for (let j = 0; j < cParts.length; j++) {
            let c = cParts[j].trim()
            result && (result += ', ')
            result += c.includes('&') ? c.replace('&', p) : p + ' ' + c
        }
    }
    return result
}