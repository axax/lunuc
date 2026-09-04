/**
 * Lenient JSON parser.
 *
 * Instead of applying a chain of regular expressions to the raw text (which is
 * blind to string boundaries and re-scans the input for every fix), the input is
 * parsed in a single pass and the resulting value is built directly. That makes
 * it O(n), removes the final re-parse and, most importantly, lets the repair
 * logic know whether it is currently inside a string, an object or an array.
 *
 * Handled defects:
 *  - unescaped quotes inside a string value      {"f":"a=~"b""}
 *  - single quotes / backticks as string delimiter
 *  - unquoted keys and unquoted string values
 *  - missing commas, extra commas, trailing commas
 *  - missing colon after a key
 *  - unterminated strings, unclosed objects/arrays
 *  - // and /* *\/ comments
 *  - undefined / NaN / Infinity / True / False / None
 *  - top level content without surrounding brackets
 */

const MAX_ERRORS = 100
const LOOKAHEAD = 256   // max chars inspected when disambiguating a quote

const isWs = (c) =>
    c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v' ||
    c === '\u00a0' || c === '\ufeff'

const ESCAPES = {'"': '"', "'": "'", '`': '`', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t'}

class LenientParser {

    constructor(src) {
        this.s = src
        this.i = 0
        this.errors = []
        this.stack = []      // '{' or '[' of the enclosing container
        this.repaired = false
    }

    error(msg) {
        this.repaired = true
        if (this.errors.length < MAX_ERRORS) {
            this.errors.push(msg)
        }
    }

    /* ---------- scanning helpers ---------- */

    skipWsAt(j) {
        const s = this.s
        while (j < s.length) {
            if (isWs(s[j])) {
                j++
                continue
            }
            if (s[j] === '/' && (s[j + 1] === '/' || s[j + 1] === '*')) {
                j = this.commentEndAt(j)
                continue
            }
            break
        }
        return j
    }

    commentEndAt(j) {
        const s = this.s
        if (s[j + 1] === '/') {
            const nl = s.indexOf('\n', j + 2)
            return nl === -1 ? s.length : nl + 1
        }
        const end = s.indexOf('*/', j + 2)
        return end === -1 ? s.length : end + 2
    }

    ws() {
        const before = this.i
        this.i = this.skipWsAt(this.i)
        if (this.i !== before && this.s.slice(before, this.i).includes('/')) {
            this.error('Removed comment')
        }
    }

    peek() {
        return this.s[this.i]
    }

    /* ---------- entry point ---------- */

    parse() {
        this.ws()
        const c = this.peek()

        let value
        if (c === undefined) {
            this.error('Input contains no value')
            return {}
        }

        if (c === '{' || c === '[') {
            value = this.parseValue()
        } else if (this.looksLikeImplicitObject()) {
            this.error('Wrapped content in object brackets')
            value = {}
            this.parseMembers(value, true)
        } else {
            value = this.parseValue()
            this.ws()
            if (this.i < this.s.length) {
                // more than one top level value -> collect them as an array
                this.error('Wrapped content in array brackets')
                const arr = [value]
                this.parseElements(arr, true)
                value = arr
            }
        }

        this.ws()
        if (this.i < this.s.length) {
            this.error('Ignored trailing content after the parsed value')
        }
        return value
    }

    looksLikeImplicitObject() {
        // a bare `key: value` list at top level
        const s = this.s
        for (let j = this.i; j < s.length; j++) {
            const c = s[j]
            if (c === ':') return true
            if (c === '{' || c === '[' || c === ',') return false
        }
        return false
    }

    /* ---------- values ---------- */

    parseValue() {
        this.ws()
        const c = this.peek()

        if (c === '{') {
            this.i++
            this.stack.push('{')
            const obj = {}
            this.parseMembers(obj, false)
            this.stack.pop()
            return obj
        }

        if (c === '[') {
            this.i++
            this.stack.push('[')
            const arr = []
            this.parseElements(arr, false)
            this.stack.pop()
            return arr
        }

        if (c === '"' || c === "'" || c === '`') {
            return this.parseString(false)
        }

        return this.parseBareValue()
    }

    parseBareValue() {
        const s = this.s
        const start = this.i
        while (this.i < s.length) {
            const c = s[this.i]
            if (c === ',' || c === '}' || c === ']' || c === '\n' || c === '\r') break
            this.i++
        }

        const raw = s.slice(start, this.i).trim()

        if (raw === '') {
            this.error('Inserted null for a missing value')
            return null
        }
        if (raw === 'true' || raw === 'True') return true
        if (raw === 'false' || raw === 'False') return false
        if (raw === 'null') return null
        if (raw === 'undefined' || raw === 'None' || raw === 'NaN') {
            this.error(`Replaced ${raw} with null`)
            return null
        }

        const num = Number(raw)
        if (raw !== '' && Number.isFinite(num) && /^[+-]?[\d.]/.test(raw)) {
            return num
        }

        this.error(`Added quotes around value: ${raw}`)
        return raw
    }

    /* ---------- strings ---------- */

    /**
     * Decides whether the quote at the current position really terminates the
     * string, or whether it is an unescaped quote inside the value.
     * The lookahead takes the enclosing container into account, which removes
     * most false positives of a naive "next char is , : } ]" check.
     */
    isClosingQuote(isKey) {
        const s = this.s
        const j = this.skipWsAt(this.i + 1)
        const next = s[j]
        const ctx = this.stack[this.stack.length - 1]

        if (next === undefined) return true
        if (isKey) return next === ':'
        if (next === ':') return ctx === '{'
        if (next === '}') return ctx === '{'
        if (next === ']') return ctx === '['
        if (next === ',') {
            if (ctx !== '{') return true
            // inside an object the next member has to start with a key
            const k = this.skipWsAt(j + 1)
            const kc = s[k]
            return kc === undefined || kc === '"' || kc === "'" || kc === '`' || kc === '}'
        }
        if (next === '"' || next === "'" || next === '`') {
            // ambiguous: either an unescaped quote inside the value, or a missing
            // separator before the next member / element
            return this.startsPlausibleToken(j, ctx)
        }
        return false
    }

    /**
     * Checks whether a well formed quoted token starts at j, followed by the
     * separator its container requires. Lookahead is bounded, so a value that
     * merely contains quotes does not trigger an expensive scan.
     */
    startsPlausibleToken(j, ctx) {
        const s = this.s
        const quote = s[j]
        const limit = Math.min(s.length, j + LOOKAHEAD)

        let k = j + 1
        while (k < limit) {
            const c = s[k]
            if (c === '\\') {
                k += 2
                continue
            }
            if (c === quote) break
            k++
        }
        if (k >= limit) return false

        const c = s[this.skipWsAt(k + 1)]
        if (ctx === '{') return c === ':'
        return c === ',' || c === ']' || c === undefined
    }

    parseString(isKey) {
        const s = this.s
        const quote = s[this.i]

        if (quote === "'") this.error('Replaced single quotes with double quotes')
        else if (quote === '`') this.error('Replaced backticks with double quotes')

        this.i++
        let out = ''
        let chunk = this.i

        while (this.i < s.length) {
            const c = s[this.i]

            if (c === '\\') {
                out += s.slice(chunk, this.i)
                const esc = s[this.i + 1]

                if (esc === undefined) {
                    this.error('Removed dangling escape at end of input')
                    this.i++
                    chunk = this.i
                    continue
                }
                if (esc === 'u') {
                    const hex = s.substr(this.i + 2, 4)
                    if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                        out += String.fromCharCode(parseInt(hex, 16))
                        this.i += 6
                    } else {
                        this.error('Removed invalid unicode escape')
                        out += 'u'
                        this.i += 2
                    }
                    chunk = this.i
                    continue
                }
                if (ESCAPES[esc] !== undefined) {
                    out += ESCAPES[esc]
                } else {
                    this.error(`Removed invalid escape: \\${esc}`)
                    out += esc
                }
                this.i += 2
                chunk = this.i
                continue
            }

            if (c === quote) {
                if (this.isClosingQuote(isKey)) {
                    out += s.slice(chunk, this.i)
                    this.i++
                    return out
                }
                out += s.slice(chunk, this.i + 1)
                this.i++
                chunk = this.i
                this.error(isKey
                    ? 'Escaped quote inside string key'
                    : 'Escaped quote inside string value')
                continue
            }

            this.i++
        }

        out += s.slice(chunk)
        this.error('Closed unterminated string')
        return out
    }

    /* ---------- objects ---------- */

    parseKey() {
        this.ws()
        const c = this.peek()

        if (c === '"' || c === "'" || c === '`') {
            return this.parseString(true)
        }

        const s = this.s
        const start = this.i
        while (this.i < s.length) {
            const ch = s[this.i]
            if (ch === ':' || ch === ',' || ch === '}' || ch === '\n' || ch === '\r') break
            this.i++
        }

        const raw = s.slice(start, this.i).trim()
        if (raw === '') {
            // never leave the caller without progress
            this.error(`Skipped unexpected character: ${c}`)
            this.i++
            return null
        }
        this.error(`Added quotes around key: ${raw}`)
        return raw
    }

    assign(obj, key, value) {
        if (key === '__proto__' || key === 'constructor') {
            Object.defineProperty(obj, key, {value, enumerable: true, writable: true, configurable: true})
        } else {
            obj[key] = value
        }
    }

    parseMembers(obj, implicit) {
        const s = this.s
        let expectComma = false

        for (; ;) {
            this.ws()
            const c = this.peek()

            if (c === undefined) {
                if (!implicit) this.error('Added missing closing brace')
                return
            }
            if (c === '}') {
                this.i++
                if (implicit) {
                    this.error('Removed unmatched closing brace')
                    continue
                }
                return
            }
            if (c === ']') {
                // mismatched closer, treat it as the end of this object
                this.i++
                this.error('Fixed mismatched closing bracket')
                if (implicit) continue
                return
            }
            if (c === ',') {
                this.i++
                const next = s[this.skipWsAt(this.i)]
                if (next === '}' || next === undefined) this.error('Removed trailing comma')
                else if (!expectComma) this.error('Removed extra comma')
                expectComma = false
                continue
            }

            if (expectComma) {
                this.error('Added missing comma between object properties')
            }

            const key = this.parseKey()
            if (key === null) continue

            this.ws()
            if (this.peek() === ':') {
                this.i++
            } else {
                this.error(`Added missing colon after key: ${key}`)
            }

            this.assign(obj, key, this.parseValue())
            expectComma = true
        }
    }

    /* ---------- arrays ---------- */

    parseElements(arr, implicit) {
        const s = this.s
        let expectComma = false

        for (; ;) {
            this.ws()
            const c = this.peek()

            if (c === undefined) {
                if (!implicit) this.error('Added missing closing bracket')
                return
            }
            if (c === ']') {
                this.i++
                if (implicit) {
                    this.error('Removed unmatched closing bracket')
                    continue
                }
                return
            }
            if (c === '}') {
                this.i++
                this.error('Fixed mismatched closing brace')
                if (implicit) continue
                return
            }
            if (c === ',') {
                this.i++
                const next = s[this.skipWsAt(this.i)]
                if (next === ']' || next === undefined) this.error('Removed trailing comma')
                else if (!expectComma) this.error('Removed extra comma')
                expectComma = false
                continue
            }

            if (expectComma) {
                this.error('Added missing comma between array elements')
            }

            const before = this.i
            arr.push(this.parseValue())
            if (this.i === before) {
                // defensive: guarantee progress
                this.i++
            }
            expectComma = true
        }
    }
}

/**
 * Parses JSON, repairing common defects when the native parser fails.
 *
 * @param {string} jsonString
 * @returns {{json?:Object, errors:String[], success:Boolean, fixed?:Boolean}}
 */
export const fixAndParseJSON = (jsonString) => {

    if (typeof jsonString !== 'string' || !jsonString.trim()) {
        return {json: {}, errors: ['Input is empty'], success: false}
    }

    // fast path, no allocation beyond the result itself
    try {
        return {json: JSON.parse(jsonString), errors: [], success: true}
    } catch (e) {
        console.error('fixAndParseJSON', e)
        // fall through to the lenient parser
    }

    try {
        const parser = new LenientParser(jsonString)
        const json = parser.parse()
        return {json, errors: parser.errors, success: true, fixed: parser.repaired}
    } catch (e) {
        return {
            errors: [`Still invalid: ${e instanceof Error ? e.message : 'Unknown error'}`],
            success: false
        }
    }
}