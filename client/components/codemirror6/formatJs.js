/**
 * Lightweight heuristic JavaScript formatter.
 *
 * The input is tokenized first so that strings, template literals, comments and
 * regular expressions are never modified. Afterwards the token stream is
 * re-indented (block statements) and spacing around operators and punctuation
 * is normalized.
 *
 * Statement boundaries are recognized both from `;` and from significant line
 * breaks in the source (ASI-style), so semicolon-free code is not glued onto a
 * single line. Line breaks are preserved only at expression depth zero and are
 * suppressed for obvious continuations (leading `.`, trailing operators, etc.).
 *
 * NOTE: This is a pretty-printer based on heuristics, not a full parser.
 * Object/array/parenthesized expressions are kept on a single line, and a few
 * ambiguous cases (regex vs. division, block `{` vs. object literal `{`) are
 * resolved with simple rules. For production-grade formatting use a real
 * parser such as Prettier or acorn + escodegen.
 */

// Keywords after which `(` should be preceded by a space (control structures).
const KEYWORDS_BEFORE_PAREN = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'do', 'return', 'typeof',
    'instanceof', 'in', 'of', 'new', 'void', 'delete', 'await', 'yield',
    'else', 'case', 'throw'
])

// Keywords after which `/` starts a regex and `+`/`-` are unary operators.
const EXPR_KEYWORDS = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
    'do', 'else', 'yield', 'await', 'case', 'throw'
])

// Keywords after which `{` opens an object literal instead of a block.
const OBJECT_CONTEXT_WORDS = new Set([
    'return', 'yield', 'throw', 'typeof', 'void', 'delete',
    'in', 'of', 'instanceof', 'await', 'new'
])

// Words that may follow a closing block brace on the same line.
const CONTINUE_AFTER_BRACE_WORDS = new Set(['else', 'catch', 'finally', 'while'])

// Keywords after which a source line break is a continuation, not a statement
// end (so `return\n  x` stays `return x` instead of breaking).
const CONTINUATION_KEYWORDS = new Set([
    'return', 'throw', 'yield', 'await', 'typeof', 'void', 'delete',
    'in', 'of', 'instanceof', 'new', 'case', 'else', 'do',
    'const', 'let', 'var'
])

const NO_SPACE_BEFORE = new Set([',', ';', ')', ']', '.', '?.'])
const NO_SPACE_AFTER = new Set(['(', '[', '.', '?.', '!', '...'])

// Punctuation that can legitimately begin a new statement (so a preceding line
// break should NOT be treated as a continuation).
const STATEMENT_STARTING_PUNCT = new Set(['{', '!', '~', '...'])

// Punctuation after which a statement can end (a line break here may break).
const STATEMENT_ENDING_PUNCT = new Set([')', ']', '}', '++', '--'])

const OPS3 = new Set(['===', '!==', '**=', '...', '>>>', '<<=', '>>=', '&&=', '||=', '??='])
const OPS2 = new Set([
    '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '=>',
    '+=', '-=', '*=', '/=', '%=', '**', '++', '--', '<<', '>>', '&=', '|=', '^='
])

/**
 * Whether an expression (and therefore a regex / unary operator) is expected
 * after the given token.
 * @param token - The preceding significant token, or null at start of input.
 * @returns True if an expression is expected next.
 */
const isExpressionExpected = (token) => {
    if (!token) return true
    if (token.type === 'word') return EXPR_KEYWORDS.has(token.value)
    if (token.type === 'punct') {
        return !(token.value === ')' || token.value === ']' || token.value === '}')
    }
    // After a string / number / template / regex an operand is already present.
    return false
}

/**
 * Split source code into tokens without touching the content of strings,
 * template literals, comments or regular expressions.
 * @param code - The JavaScript source to tokenize.
 * @returns The list of tokens with `type` and `value`.
 */
const tokenize = (code) => {
    const tokens = []
    let i = 0
    const n = code.length

    const lastSignificant = () => {
        for (let k = tokens.length - 1; k >= 0; k--) {
            const t = tokens[k]
            if (t.type !== 'ws' && t.type !== 'lineComment' && t.type !== 'blockComment') {
                return t
            }
        }
        return null
    }

    while (i < n) {
        const c = code[i]

        // Whitespace (collapsed later; newlines are remembered for ASI).
        if (/\s/.test(c)) {
            let j = i + 1
            while (j < n && /\s/.test(code[j])) j++
            tokens.push({ type: 'ws', value: code.slice(i, j) })
            i = j
            continue
        }

        // Line comment.
        if (c === '/' && code[i + 1] === '/') {
            let j = i + 2
            while (j < n && code[j] !== '\n') j++
            tokens.push({ type: 'lineComment', value: code.slice(i, j) })
            i = j
            continue
        }

        // Block comment.
        if (c === '/' && code[i + 1] === '*') {
            let j = i + 2
            while (j < n && !(code[j] === '*' && code[j + 1] === '/')) j++
            j = Math.min(n, j + 2)
            tokens.push({ type: 'blockComment', value: code.slice(i, j) })
            i = j
            continue
        }

        // String literal (single or double quoted).
        if (c === '"' || c === "'") {
            let j = i + 1
            while (j < n) {
                if (code[j] === '\\') { j += 2; continue }
                if (code[j] === c) { j++; break }
                j++
            }
            tokens.push({ type: 'string', value: code.slice(i, j) })
            i = j
            continue
        }

        // Template literal. Consumed verbatim, including ${ } expressions.
        // Nested braces inside the expression are balanced, but strings holding
        // a stray `}` inside an expression are not deeply parsed.
        if (c === '`') {
            let j = i + 1
            let depth = 0
            while (j < n) {
                const ch = code[j]
                if (ch === '\\') { j += 2; continue }
                if (depth === 0 && ch === '`') { j++; break }
                if (depth === 0 && ch === '$' && code[j + 1] === '{') { depth++; j += 2; continue }
                if (depth > 0 && ch === '{') depth++
                if (depth > 0 && ch === '}') depth--
                j++
            }
            tokens.push({ type: 'template', value: code.slice(i, j) })
            i = j
            continue
        }

        // Regular expression literal (only when an expression is expected).
        if (c === '/' && isExpressionExpected(lastSignificant())) {
            let j = i + 1
            let inCharClass = false
            let terminated = false
            while (j < n) {
                const ch = code[j]
                if (ch === '\n') break
                if (ch === '\\') { j += 2; continue }
                if (ch === '[') inCharClass = true
                else if (ch === ']') inCharClass = false
                else if (ch === '/' && !inCharClass) { j++; terminated = true; break }
                j++
            }
            if (terminated) {
                while (j < n && /[a-z]/i.test(code[j])) j++ // flags
                tokens.push({ type: 'regex', value: code.slice(i, j) })
                i = j
                continue
            }
            // Not a valid regex: fall through and treat `/` as an operator.
        }

        // Number literal (rough but sufficient: decimals, hex, binary, exponent).
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(code[i + 1]))) {
            let j = i + 1
            while (j < n) {
                const ch = code[j]
                if ((ch === '+' || ch === '-') && !/[eE]/.test(code[j - 1])) break
                if (!/[0-9a-fA-FxXob_.eE+\-]/.test(ch)) break
                j++
            }
            tokens.push({ type: 'number', value: code.slice(i, j) })
            i = j
            continue
        }

        // Identifier or keyword.
        if (/[A-Za-z_$]/.test(c)) {
            let j = i + 1
            while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++
            tokens.push({ type: 'word', value: code.slice(i, j) })
            i = j
            continue
        }

        // Operators and punctuation (longest match first).
        const three = code.substr(i, 3)
        const two = code.substr(i, 2)
        if (OPS3.has(three)) { tokens.push({ type: 'punct', value: three }); i += 3; continue }
        if (OPS2.has(two)) { tokens.push({ type: 'punct', value: two }); i += 2; continue }
        tokens.push({ type: 'punct', value: c })
        i++
    }

    return tokens
}

/**
 * Find the previous non-comment token in a token array.
 * @param tokens - The token array.
 * @param index - The current index.
 * @returns The previous significant token, or null.
 */
const previousReal = (tokens, index) => {
    for (let k = index - 1; k >= 0; k--) {
        const t = tokens[k]
        if (t.type !== 'lineComment' && t.type !== 'blockComment') return t
    }
    return null
}

/**
 * Drop whitespace tokens and remember whether a source line break preceded each
 * remaining token.
 * @param tokens - The full token stream.
 * @returns Significant tokens annotated with `newlineBefore`.
 */
const collectSignificant = (tokens) => {
    const significant = []
    let pendingNewline = false
    for (const t of tokens) {
        if (t.type === 'ws') {
            if (t.value.includes('\n')) pendingNewline = true
            continue
        }
        t.newlineBefore = pendingNewline
        pendingNewline = false
        significant.push(t)
    }
    return significant
}

/**
 * Annotate unary/postfix operators and ternary colons so spacing can be
 * decided locally during the assembly phase.
 * @param tokens - Significant tokens (whitespace already removed).
 */
const annotate = (tokens) => {
    let ternaryDepth = 0
    for (let k = 0; k < tokens.length; k++) {
        const t = tokens[k]
        if (t.type !== 'punct') continue
        const prev = previousReal(tokens, k)

        if (t.value === '+' || t.value === '-' || t.value === '~') {
            t.unary = isExpressionExpected(prev)
        } else if (t.value === '++' || t.value === '--') {
            t.postfix = !!prev && (
                prev.type === 'word' || prev.type === 'number' ||
                (prev.type === 'punct' && (prev.value === ')' || prev.value === ']'))
            )
        } else if (t.value === '?') {
            ternaryDepth++
        } else if (t.value === ':') {
            if (ternaryDepth > 0) { t.ternary = true; ternaryDepth-- }
        } else if (t.value === ';') {
            ternaryDepth = 0
        }
    }
}

/**
 * Whether a `{` opens a statement block (as opposed to an object literal).
 * @param prev - The preceding significant token.
 * @returns True for a block, false for an object literal.
 */
const isBlockBrace = (prev) => {
    if (!prev) return true
    if (prev.type === 'punct') {
        return prev.value === ')' || prev.value === '=>' ||
            prev.value === '{' || prev.value === '}' || prev.value === ';'
    }
    if (prev.type === 'word') return !OBJECT_CONTEXT_WORDS.has(prev.value)
    return false
}

/**
 * Whether a token may follow a closing block brace on the same line
 * (e.g. `} else`, `})`, `};`).
 * @param token - The token following the brace.
 * @returns True if no line break should be inserted.
 */
const continuesAfterBrace = (token) => {
    if (token.type === 'word') return CONTINUE_AFTER_BRACE_WORDS.has(token.value)
    if (token.type === 'punct') {
        return token.value === ')' || token.value === ']' || token.value === ',' ||
            token.value === ';' || token.value === '.' || token.value === '?.'
    }
    return false
}

/**
 * Whether a source line break before this token is a continuation (e.g. a
 * leading `.` in a method chain or a leading operator), so no break is forced.
 * @param token - The token following the line break.
 * @returns True if the break should be suppressed.
 */
const startsContinuation = (token) => {
    if (!token || token.type !== 'punct') return false
    return !STATEMENT_STARTING_PUNCT.has(token.value)
}

/**
 * Whether the previous token leaves a statement open (trailing operator, comma,
 * dot, opening bracket, continuation keyword, ...), so a following line break is
 * a continuation rather than a statement end.
 * @param prev - The previous token.
 * @returns True if the break should be suppressed.
 */
const endsContinuation = (prev) => {
    if (!prev) return true
    if (prev.type === 'word') return CONTINUATION_KEYWORDS.has(prev.value)
    if (prev.type === 'punct') return !STATEMENT_ENDING_PUNCT.has(prev.value)
    // string / number / template / regex: a statement can end here.
    return false
}

/**
 * Decide whether a single space is needed between two adjacent tokens.
 * @param prev - The previous token.
 * @param cur - The current token.
 * @returns True if a space should be inserted.
 */
const needsSpace = (prev, cur) => {
    if (!prev) return false

    if (cur.type === 'punct' && NO_SPACE_BEFORE.has(cur.value)) return false
    if (cur.type === 'punct' && (cur.value === '++' || cur.value === '--') && cur.postfix) return false
    if (cur.type === 'punct' && cur.value === ':' && !cur.ternary) return false

    if (prev.type === 'punct' && NO_SPACE_AFTER.has(prev.value)) return false
    if (prev.type === 'punct' && (prev.value === '++' || prev.value === '--') && !prev.postfix) return false
    if (prev.type === 'punct' && (prev.value === '+' || prev.value === '-' || prev.value === '~') && prev.unary) return false

    if (cur.value === '(') {
        if (prev.type === 'word') return KEYWORDS_BEFORE_PAREN.has(prev.value)
        if (prev.type === 'punct') return !(prev.value === ')' || prev.value === ']')
        return false
    }

    if (cur.value === '[') {
        if (prev.type === 'word' || prev.type === 'number' || prev.type === 'string' ||
            prev.type === 'template' || prev.type === 'regex' ||
            (prev.type === 'punct' && (prev.value === ')' || prev.value === ']'))) {
            return false
        }
        return true
    }

    return true
}

/**
 * Re-assemble tokens into formatted source code.
 * @param tokens - The full token stream (including whitespace).
 * @returns The formatted code.
 */
const formatTokens = (tokens) => {
    const indentChar = '  '
    const significant = collectSignificant(tokens)
    annotate(significant)

    let out = ''
    let line = ''
    let indent = 0
    let parenDepth = 0
    let bracketDepth = 0
    let objectDepth = 0
    let pendingBlockClose = false
    let prev = null
    const braceStack = []

    const flush = () => {
        if (line.trim().length) {
            out += indentChar.repeat(Math.max(0, indent)) + line.trim() + '\n'
        }
        line = ''
    }

    const append = (token) => {
        if (line.length && needsSpace(prev, token)) line += ' '
        line += token.value
        prev = token
    }

    for (let k = 0; k < significant.length; k++) {
        const t = significant[k]
        const v = t.value
        const exprDepth = parenDepth + bracketDepth + objectDepth

        // Statement break from an original line break (ASI-style), only at
        // expression depth zero and only between non-continuation tokens.
        if (t.newlineBefore && exprDepth === 0 && line.trim().length &&
            !startsContinuation(t) && !endsContinuation(prev)) {
            flush()
            pendingBlockClose = false
        }

        // Resolve a pending line break after a block-closing brace.
        if (pendingBlockClose) {
            if (!continuesAfterBrace(t)) flush()
            pendingBlockClose = false
        }

        if (t.type === 'lineComment') {
            if (line.trim().length) line += ' '
            line += v
            flush()
            prev = t
            continue
        }

        if (t.type === 'punct' && v === '{') {
            const next = significant[k + 1]
            const block = isBlockBrace(prev)
            if (line.length && needsSpace(prev, t)) line += ' '
            line += '{'

            // Keep empty braces compact: `{}`.
            if (next && next.type === 'punct' && next.value === '}') {
                line += '}'
                prev = { type: 'punct', value: '}' }
                k++
                continue
            }

            if (block) {
                // Inside a block, statements are at expression depth zero again,
                // even if the block is nested in a call (e.g. `cb(() => { ... })`).
                braceStack.push({ kind: 'block', parenDepth, bracketDepth, objectDepth })
                parenDepth = 0
                bracketDepth = 0
                objectDepth = 0
                flush()
                indent++
            } else {
                braceStack.push({ kind: 'object' })
                objectDepth++
            }
            prev = t
            continue
        }

        if (t.type === 'punct' && v === '}') {
            const frame = braceStack.pop() || { kind: 'block' }
            if (frame.kind === 'object') {
                objectDepth = Math.max(0, objectDepth - 1)
                line += ' }'
                prev = t
                continue
            }
            // Restore the expression depth that was active before the block.
            parenDepth = frame.parenDepth || 0
            bracketDepth = frame.bracketDepth || 0
            objectDepth = frame.objectDepth || 0
            flush()
            indent = Math.max(0, indent - 1)
            line = '}'
            prev = t
            pendingBlockClose = true
            continue
        }

        if (t.type === 'punct' && v === ';') {
            line += ';'
            prev = t
            if (parenDepth === 0) flush()
            continue
        }

        append(t)
        if (v === '(') parenDepth++
        else if (v === ')') parenDepth = Math.max(0, parenDepth - 1)
        else if (v === '[') bracketDepth++
        else if (v === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    }

    flush()
    return out.replace(/\n+$/, '\n').trimEnd()
}

/**
 * Format JavaScript source code.
 * @param code - The source to format.
 * @returns The formatted code.
 */
export const formatJs = (code) => {
    if (typeof code !== 'string' || !code.trim()) return ''
    return formatTokens(tokenize(code.trim()))
}

// Example usage:
// const code = `function test(a, b) {let x= a + b; if(x>10){console.log('x is greater than 10');} else{console.log('x is not greater than 10');}}`
// console.log(formatJs(code))