/**
 * Editor warning for the data resolver: finds `params` / `props` values that are inserted
 * into a template expression ${...} without being escaped.
 *
 * Background: templateSegment (dataResolverCore.mjs) turns a segment into JSON text and
 * evaluates it as a template string. A raw ${params.q} ends up unescaped in that JSON, so
 * a value with " or \ can break out of the string and inject its own keys.
 * Safe is ${_e(params.q)} (Util.escapeForJson).
 *
 * Heuristic on the text (no JS parser): one pass over the text, only the ${...} parts are
 * looked at in detail. Runs in the editor only (debounced by the CodeMirror linter).
 *
 * Returns [{from, to, name}] - from/to are offsets in the text, name is e.g. "params.q"
 */

// calls whose result is safe to insert (escaped, converted to a number/boolean or encoded)
const SAFE_CALLS = new Set(['_e', 'escapeForJson', 'parseInt', 'parseFloat', 'Number', 'Boolean',
    'JSON.stringify', 'encodeURIComponent', 'Math.min', 'Math.max', 'Math.round', 'Math.floor', 'Math.ceil'])

// methods on the value that return a number or boolean
const SAFE_METHODS = new Set(['includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'localeCompare', 'hasOwnProperty'])

const SCOPE_NAMES = ['params', 'props']

const isIdentChar = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$'
const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r'

// end of the ${...} expression that starts at `start` (position after "${"), -1 if not closed
const findExpressionEnd = (text, start) => {
    let depth = 0, quote = null
    for (let i = start; i < text.length; i++) {
        const c = text[i]
        if (quote) {
            if (c === '\\') {
                i++
            } else if (c === quote) {
                quote = null
            }
            continue
        }
        if (c === '\'' || c === '`') {
            quote = c
        } else if (c === '{') {
            depth++
        } else if (c === '}') {
            if (depth === 0) {
                return i
            }
            depth--
        }
    }
    return -1
}

// name of the function directly in front of an opening bracket at position `pos`, e.g. "_e" or "JSON.stringify"
const callNameBefore = (expr, pos) => {
    let i = pos - 1
    while (i >= 0 && isSpace(expr[i])) i--
    let end = i + 1
    while (i >= 0 && (isIdentChar(expr[i]) || expr[i] === '.')) i--
    return expr.substring(i + 1, end)
}

const isSafeCall = (name) => {
    if (SAFE_CALLS.has(name)) return true
    // Util.escapeForJson, ClientUtil.escapeForJson, ...
    const dot = name.lastIndexOf('.')
    return dot >= 0 && name.substring(dot + 1) === 'escapeForJson'
}

// checks one occurrence of params/props inside an expression
const isSafeUsage = (expr, start, end, openCalls) => {
    // inside a safe call like _e(...) or parseInt(...)
    for (let k = 0; k < openCalls.length; k++) {
        if (isSafeCall(openCalls[k])) return true
    }

    // what follows the member chain
    let j = end
    while (j < expr.length && isSpace(expr[j])) j++
    const next = expr.substring(j, j + 3)
    if (next.startsWith('===') || next.startsWith('!==') || next.startsWith('==') || next.startsWith('!=') ||
        next.startsWith('&&') || next.startsWith('<') || next.startsWith('>') ||
        (next[0] === '?' && next[1] !== '?' && next[1] !== '.')) {
        // comparison or condition: the value itself is not inserted
        return true
    }

    // what is in front
    let i = start - 1
    while (i >= 0 && isSpace(expr[i])) i--
    const prev = expr[i]
    if (prev === '!' || prev === '<' || prev === '>' || (prev === '=' && (expr[i - 1] === '=' || expr[i - 1] === '!'))) {
        return true
    }
    if (expr.substring(i - 5, i + 1) === 'typeof' && !isIdentChar(expr[i - 6] || '')) {
        return true
    }
    return false
}

// scans one ${...} expression, pushes findings
const lintExpression = (expr, offset, results) => {
    const openCalls = [] // function names of the currently open brackets ('' for plain brackets)
    let quote = null

    for (let i = 0; i < expr.length; i++) {
        const c = expr[i]
        if (quote) {
            if (c === '\\') {
                i++
            } else if (c === quote) {
                quote = null
            }
            continue
        }
        if (c === '\'' || c === '`') {
            quote = c
            continue
        }
        if (c === '(') {
            openCalls.push(callNameBefore(expr, i))
            continue
        }
        if (c === ')') {
            openCalls.pop()
            continue
        }
        if (c !== 'p' || (i > 0 && (isIdentChar(expr[i - 1]) || expr[i - 1] === '.'))) {
            continue
        }

        for (let n = 0; n < SCOPE_NAMES.length; n++) {
            const scopeName = SCOPE_NAMES[n]
            if (!expr.startsWith(scopeName, i)) continue
            let j = i + scopeName.length
            if (expr[j] !== '.' && expr[j] !== '[') continue

            // member chain: .a.b['c'][0]
            let lastProp = '', methodCall = ''
            while (j < expr.length) {
                if (expr[j] === '.' || (expr[j] === '?' && expr[j + 1] === '.')) {
                    j += expr[j] === '?' ? 2 : 1
                    const s = j
                    while (j < expr.length && isIdentChar(expr[j])) j++
                    const prop = expr.substring(s, j)
                    let k = j
                    while (k < expr.length && isSpace(expr[k])) k++
                    if (expr[k] === '(') {
                        // method call on the value -> the chain ends here
                        methodCall = prop
                        j = s - 1
                        if (expr[j - 1] === '?') j--
                        break
                    }
                    lastProp = prop
                } else if (expr[j] === '[') {
                    let depth = 0
                    for (; j < expr.length; j++) {
                        if (expr[j] === '[') depth++
                        else if (expr[j] === ']' && --depth === 0) {
                            j++
                            break
                        }
                    }
                    lastProp = '[]'
                } else {
                    break
                }
            }

            const name = expr.substring(i, j)
            if (lastProp === 'length' || SAFE_METHODS.has(methodCall) ||
                isSafeUsage(expr, i, j, openCalls)) {
                // ok
            } else if (name.length > scopeName.length + 1) {
                results.push({from: offset + i, to: offset + j, name})
            }
            i = j - 1
            break
        }
    }
}

export const lintDataResolver = (text) => {
    const results = []
    if (!text || (text.indexOf('params') < 0 && text.indexOf('props') < 0)) {
        return results
    }
    let pos = text.indexOf('${')
    while (pos >= 0) {
        const start = pos + 2
        const end = findExpressionEnd(text, start)
        if (end < 0) {
            break
        }
        const expr = text.substring(start, end)
        if (expr.indexOf('params') >= 0 || expr.indexOf('props') >= 0) {
            lintExpression(expr, start, results)
        }
        pos = text.indexOf('${', end + 1)
    }
    return results
}
