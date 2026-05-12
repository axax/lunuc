const rulesCache = new WeakMap();

function compileRules(rules) {
    if (rulesCache.has(rules)) {
        return rulesCache.get(rules);
    }

    const compiled = rules.map(rule => {
        const compiledMatch = {};

        for (const [field, value] of Object.entries(rule.match)) {

            if (field === 'allowedQueryParams') {
                compiledMatch[field] = new Set(value); // O(1) Lookup
                continue;
            }

            const regexMatch = typeof value === 'string' && value.match(/^\/(.+)\/([gimsuy]*)$/);
            compiledMatch[field] = regexMatch
                ? new RegExp(regexMatch[1], regexMatch[2])
                : value;
        }

        return { action: rule.action, match: compiledMatch };
    });

    rulesCache.set(rules, compiled);
    return compiled;
}

function getFieldValue(field, req, parsedUrl) {
    switch (field) {
        case 'userAgent': return req.headers['user-agent'] ?? '';
        case 'pathname':      return parsedUrl.pathname ?? '';
        case 'search':     return parsedUrl.search ?? '';   // z.B. "?foo=bar"
        case 'method':    return req.method ?? '';
        case 'host':      return req.headers['host'] ?? '';
        case 'ip':        return req.socket?.remoteAddress ?? '';
        default:          return req.headers[field.toLowerCase()] ?? '';
    }
}

function executeAction(action, res) {
    switch (action.type) {
        case 'block':
            res.writeHead(action.statusCode ?? 403);
            res.end();
            break;

        case 'redirect':
            res.writeHead(action.statusCode ?? 301, { Location: action.location });
            res.end();
            break;

        case 'rewrite':
            res.locals ??= {};
            res.locals.rewrittenUrl = action.url;
            break;

        default:
            return false
    }
    return true;
}


export function applyRequestRules(req, res, parsedUrl, rules) {
    if(!rules?.length) return false;

    const compiledRules = compileRules(rules);



    for (let i = 0; i < compiledRules.length; i++) {
        const { match, action } = compiledRules[i];
        let matched = true;

        for (const field in match) {
            if (field === 'allowedQueryParams') {
                const allowedParams = match[field]; // Set
                const hit = Object.keys(parsedUrl.query).some(param => !allowedParams.has(param));
                if (!hit) {
                    matched = false;
                    break;
                }
                continue;
            }

            const pattern = match[field];
            const value   = getFieldValue(field, req, parsedUrl);
            const hit = pattern instanceof RegExp
                ? pattern.test(value)
                : pattern === value;

            if (!hit) {
                matched = false;
                break; // Short-circuit: nächste Regel prüfen
            }
        }

        if (matched) {
            console.log(`Request Rule action match "${action.type}" --> ${req.url}`);

            if(executeAction(action, res)) {
                return true;
            }
        }
    }

    return false;
}
