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
 * Recursively flattens a CSS string. This version is optimized to use a single-pass
 * parser for efficiency.
 * @param {string} css - The CSS string to process.
 * @param {string} [parentSelector=''] - The selector of the parent context.
 * @returns {string} The processed, flattened CSS for the given context.
 */
function flatten(css, parentSelector = '') {
    const resultParts = [];
    const { properties, rules } = parseCssBlocks(css);

    // 1. Process any direct properties found at this level.
    if (properties) {

        if(parentSelector) {
            const propsArray = splitProperties(properties);
            if (propsArray.length > 0) {
                const formattedProps = propsArray.map(p => `  ${p.trim()};`).join('\n');
                resultParts.push(`${parentSelector} {\n${formattedProps}\n}\n`);
            }
        }else{
            // for @import
            resultParts.push(`${properties}\n`)
        }
    }

    // 2. Process all the nested rule blocks found at this level.
    for (const rule of rules) {
        if (rule.selector.startsWith('@')) {
            if (rule.selector.startsWith('@media') || rule.selector.startsWith('@supports')) {
                // For these at-rules, recurse, passing the parent selector down.
                const innerCss = flatten(rule.content, parentSelector);
                if (innerCss) {
                    resultParts.push(`${rule.selector} {\n${innerCss}}\n`);
                }
            } else {
                // Other at-rules like @keyframes are preserved as-is.
                resultParts.push(`${rule.selector} {${rule.content}}\n`);
            }
        } else {
            // For standard selectors, build the new selector and recurse.
            const newSelector = buildSelector(parentSelector, rule.selector);
            resultParts.push(flatten(rule.content, newSelector));
        }
    }

    return resultParts.join('');
}

/**
 * A highly efficient and robust single-pass parser that separates a CSS string into
 * its top-level properties and a list of rule blocks.
 * @param {string} css - The CSS content to parse.
 * @returns {{properties: string, rules: Array<{selector: string, content: string}>}}
 */
function parseCssBlocks(css) {
    const propertiesParts = [];
    const rules = [];
    let braceLevel = 0;
    let lastBreak = 0;
    let currentRule = null;

    for (let i = 0; i < css.length; i++) {
        if (css[i] === '{') {
            if (braceLevel === 0) {
                // Start of a new top-level rule.
                // The text from lastBreak to here is the selector and any preceding properties.
                const precedingText = css.substring(lastBreak, i);
                const lastSemicolon = precedingText.lastIndexOf(';');

                let selector;
                if (lastSemicolon !== -1) {
                    propertiesParts.push(precedingText.substring(0, lastSemicolon + 1));
                    selector = precedingText.substring(lastSemicolon + 1).trim();
                } else {
                    selector = precedingText.trim();
                }

                // We have the selector, create a new rule object to be populated.
                currentRule = { selector: selector, startIndex: i + 1 };
            }
            braceLevel++;
        } else if (css[i] === '}') {
            braceLevel--;
            if (braceLevel === 0 && currentRule) {
                // We have closed the top-level rule we were in.
                const content = css.substring(currentRule.startIndex, i);
                rules.push({ selector: currentRule.selector, content: content });
                currentRule = null;
                lastBreak = i + 1;
            }
        }
    }

    // Any remaining text after the last rule block is properties.
    if (lastBreak < css.length) {
        propertiesParts.push(css.substring(lastBreak));
    }

    return {
        properties: propertiesParts.join(' ').trim(),
        rules: rules
    };
}


/**
 * Splits a string of CSS properties into an array of individual properties.
 * This function correctly handles semicolons inside strings and parentheses.
 * @param {string} propertiesString - A string containing one or more CSS properties.
 * @returns {string[]} An array of property strings.
 */
function splitProperties(propertiesString) {
    const properties = [];
    let currentProp = '';
    let inString = null;
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
 * Combines a parent selector with a child selector.
 * @param {string} parent - The parent selector.
 * @param {string} child - The child/nested selector.
 * @returns {string} The combined, flattened selector.
 */
function buildSelector(parent, child) {
    if (!parent.trim()) return child;

    const parentParts = parent.split(',').map(p => p.trim());
    const childParts = child.split(',').map(c => c.trim());

    // If :root is one of the selectors in the child string, it should not be nested.
    // In this case, we return the child selector as-is, treating it as a top-level rule.
    if (childParts.some(c => c === ':root')) {
        return child;
    }

    const newSelectors = [];

    parentParts.forEach(p => {
        childParts.forEach(c => {
            if (c.includes('&')) {
                newSelectors.push(c.replace(/&/g, p));
            } else {
                newSelectors.push(`${p} ${c}`);
            }
        });
    });

    return newSelectors.join(', ');
}