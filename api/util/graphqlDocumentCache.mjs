import {parse, validate} from 'graphql'

// Memoized parse/validate for express-graphql (customParseFn/customValidateFn).
// The clients send the same few query strings over and over - parsing and
// validating them against the big schema on every request is pure CPU on the
// event loop. Semantics stay identical:
// - only successful parses and error-free validations are cached; syntax
//   errors and validation errors are computed fresh every time (same errors,
//   same positions, same messages)
// - a validation result is only reused for the same document, the same schema
//   object and the same rule set
// - the AST is only read (never mutated) by graphql-js and the lunuc resolvers

const MAX_ENTRIES = parseInt(process.env.LUNUC_GRAPHQL_DOC_CACHE || 1000)
const MAX_QUERY_LENGTH = 100000

const parseCache = new Map() // query text -> documentAST (insertion order = LRU)
const validatedDocuments = new WeakMap() // documentAST -> {schema, rules}

const sameRules = (a, b) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

export const cachedParse = (source) => {
    const body = source.body
    if (MAX_ENTRIES <= 0 || typeof body !== 'string' || body.length > MAX_QUERY_LENGTH) {
        return parse(source)
    }
    const hit = parseCache.get(body)
    if (hit) {
        // refresh LRU position
        parseCache.delete(body)
        parseCache.set(body, hit)
        return hit
    }
    const document = parse(source) // throws on syntax error -> not cached
    parseCache.set(body, document)
    if (parseCache.size > MAX_ENTRIES) {
        parseCache.delete(parseCache.keys().next().value)
    }
    return document
}

export const cachedValidate = (schema, document, rules) => {
    const entry = validatedDocuments.get(document)
    if (entry && entry.schema === schema && sameRules(entry.rules, rules)) {
        return []
    }
    const errors = validate(schema, document, rules)
    if (errors.length === 0) {
        validatedDocuments.set(document, {schema, rules: rules.slice()})
    }
    return errors
}
