// server/util/requestRules.mjs
//
// Declarative per-hostrule request rules: block, redirect or rewrite
// requests based on field matching.
//
// Hostrule config example:
//   "requestRules": [
//     {"match": {"userAgent": "/curl|python-requests/i", "pathname": "/\\/api\\//"},
//      "action": {"type": "block", "statusCode": 403}},
//     {"match": {"pathname": "/old-path"},
//      "action": {"type": "redirect", "location": "/new-path", "statusCode": 301}},
//     {"match": {"allowedQueryParams": ["q", "page", "sort"], "pathname": "/^\\/produktfinder/"}, 
//      "action": {"type": "block", "statusCode": 400}}
//   ]
//
// Match semantics:
//   - all fields of a rule must match (AND); rules are checked in order,
//     the first rule with a terminating action wins
//   - string values starting and ending with / are compiled as regex
//     ("/bot/i"), everything else is exact string comparison
//   - allowedQueryParams matches when AT LEAST ONE query parameter is NOT
//     in the given list (i.e. it targets requests carrying unexpected
//     params). Requests without any query params never match this field.
//
// Actions:
//   - block:    terminate with statusCode (default 403)
//   - redirect: terminate with Location header (default 301)
//   - rewrite:  NON-terminating - sets the rewritten url on req and lets
//               the pipeline continue. The caller must consume it (see
//               applyRequestRules return contract below).
//
// Robustness:
//   - g/y regex flags are stripped at compile time: RegExp#test with /g
//     keeps lastIndex state on the (cached!) regex object, which would
//     make a rule match only every other request
//   - an invalid regex disables only that rule (logged once), not the host

const rulesCache = new WeakMap()

function compileRules(rules) {
    if (rulesCache.has(rules)) {
        return rulesCache.get(rules)
    }

    const compiled = []

    for (const rule of rules) {
        if (!rule || !rule.match || !rule.action) {
            console.warn('requestRules: skipping malformed rule', JSON.stringify(rule))
            continue
        }

        const compiledMatch = {}
        let valid = true

        for (const [field, value] of Object.entries(rule.match)) {

            if (field === 'allowedQueryParams') {
                compiledMatch[field] = new Set(value) // O(1) lookup
                continue
            }

            const regexMatch = typeof value === 'string' && value.match(/^\/(.+)\/([gimsuy]*)$/)
            if (regexMatch) {
                try {
                    // strip g and y: stateful flags corrupt cached regexes,
                    // and they are meaningless for .test() matching anyway
                    const flags = regexMatch[2].replace(/[gy]/g, '')
                    compiledMatch[field] = new RegExp(regexMatch[1], flags)
                } catch (e) {
                    // one broken regex must not take down the whole host -
                    // disable this rule only
                    console.error(`requestRules: invalid regex for field "${field}": ${value} - rule disabled (${e.message})`)
                    valid = false
                    break
                }
            } else {
                compiledMatch[field] = value
            }
        }

        if (valid) {
            compiled.push({action: rule.action, match: compiledMatch})
        }
    }

    rulesCache.set(rules, compiled)
    return compiled
}

function getFieldValue(field, req, parsedUrl, remoteAddress, host) {
    switch (field) {
        case 'userAgent': return req.headers['user-agent'] ?? ''
        case 'pathname':  return parsedUrl.pathname ?? ''
        case 'search':    return parsedUrl.search ?? ''   // e.g. "?foo=bar"
        case 'method':    return req.method ?? ''
        // resolved host from the caller (getHostFromHeaders handles
        // x-forwarded-host etc.), raw header only as fallback
        case 'host':      return host ?? req.headers['host'] ?? ''
        case 'ip':        return remoteAddress ?? ''
        default:          return req.headers[field.toLowerCase()] ?? ''
    }
}

/**
 * @returns {boolean} true if the action TERMINATED the request
 *                    (response was sent), false if processing continues
 */
function executeAction(action, req, res) {
    switch (action.type) {
        case 'block':
            res.writeHead(action.statusCode ?? 403)
            res.end()
            return true

        case 'redirect':
            if (!action.location) {
                // a redirect without target would send "Location: undefined" -
                // fail safe and treat it as block
                console.error('requestRules: redirect action without location - blocking instead')
                res.writeHead(400)
                res.end()
                return true
            }
            res.writeHead(action.statusCode ?? 301, {Location: action.location})
            res.end()
            return true

        case 'rewrite':
            // NON-terminating: expose the rewritten url and continue.
            // Previously this returned true like the others - the caller
            // then returned without ever sending a response, leaving the
            // connection hanging until the request timeout.
            req.rewrittenUrl = action.url
            return false

        default:
            console.warn(`requestRules: unknown action type "${action.type}" - ignored`)
            return false
    }
}

/**
 * @returns {boolean} true if the request was fully handled (response sent) -
 *                    the caller must stop processing. false = continue; if a
 *                    rewrite rule matched, req.rewrittenUrl is set and the
 *                    caller should re-resolve pathname/query from it.
 */
export function applyRequestRules(req, res, parsedUrl, remoteAddress, rules, host) {
    if (!rules?.length) return false

    const compiledRules = compileRules(rules)

    for (let i = 0; i < compiledRules.length; i++) {
        const {match, action} = compiledRules[i]
        let matched = true

        for (const field in match) {
            if (field === 'allowedQueryParams') {
                const allowedParams = match[field] // Set
                const hit = Object.keys(parsedUrl.query).some(param => !allowedParams.has(param))
                if (!hit) {
                    matched = false
                    break
                }
                continue
            }

            const pattern = match[field]
            const value = getFieldValue(field, req, parsedUrl, remoteAddress, host)
            const hit = pattern instanceof RegExp
                ? pattern.test(value)
                : pattern === value

            if (!hit) {
                matched = false
                break // short-circuit: check next rule
            }
        }

        if (matched) {
            console.log(`Request Rule action match "${action.type}" --> ${req.url}`)

            if (executeAction(action, req, res)) {
                return true
            }
            // non-terminating action (rewrite): continue with further rules
        }
    }

    return false
}