// server/util/botChallenge.mjs
//
// "Click to confirm you are not a bot" interstitial, used by countryPolicy
// (and reusable by asnPolicy) mode "challenge".
//
// Design goals:
//   - No JavaScript required to pass - a plain link click. This keeps the
//     interstitial itself immune to becoming a challenge-loop and works
//     even against the many bots/scrapers that don't render JS at all.
//   - Fully self-contained HTML (inline styles, no external assets, no
//     scripts) - the page renders correctly even though css/js/image
//     requests from the same flagged ip would ALSO be challenged, since
//     there is nothing external to fetch.
//   - Low-friction gate, not a hardened anti-bot system: no puzzle, no
//     captcha. It filters out bots that don't bother rendering/clicking.
//     Combine with asnPolicy/countryPolicy block/throttle modes for
//     actors that click through it repeatedly and deserve harsher handling.
//
// Cookie: <expiry-epoch-seconds>.<hmac>, HttpOnly + SameSite=Lax (+Secure
// on https). Deliberately NOT ip-bound - mobile users switch networks
// mid-session, binding to ip would force needless re-confirmation.

import crypto from 'crypto'

const COOKIE_NAME = 'lunuc_botok'
const TOKEN_TTL_SECONDS = 24 * 3600 // 24h - re-confirm once a day

const SECRET = process.env.LUNUC_BOTCHECK_SECRET ||
    // fallback: derived per process start. Fine for a single frontend
    // process, but every restart then invalidates all outstanding
    // confirmations (everyone has to click again). Set the env var for
    // stable confirmations across restarts/deploys.
    crypto.randomBytes(32).toString('hex')

const sign = (expiry) => crypto.createHmac('sha256', SECRET).update(String(expiry)).digest('hex').substring(0, 32)

const createToken = () => {
    const expiry = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
    return `${expiry}.${sign(expiry)}`
}

const verifyToken = (token) => {
    if (!token || typeof token !== 'string') {
        return false
    }
    const dot = token.indexOf('.')
    if (dot <= 0) {
        return false
    }
    const expiry = parseInt(token.substring(0, dot))
    const mac = token.substring(dot + 1)
    if (!expiry || expiry < Math.floor(Date.now() / 1000)) {
        return false
    }
    const expected = sign(expiry)
    if (mac.length !== expected.length) {
        return false
    }
    try {
        return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
    } catch (e) {
        return false
    }
}

// minimal cookie header parser - kept local so this module has no
// dependency on the api-side cookie parser
const getCookieValue = (cookieHeader, name) => {
    if (!cookieHeader) {
        return null
    }
    const match = cookieHeader.split(';').map(p => p.trim()).find(p => p.startsWith(name + '='))
    return match ? decodeURIComponent(match.substring(name.length + 1)) : null
}

/**
 * @returns {boolean} true if this request already carries a valid,
 * unexpired confirmation cookie
 */
export const isChallengePassed = (cookieHeader) => {
    return verifyToken(getCookieValue(cookieHeader, COOKIE_NAME))
}

// only allow relative, same-host redirect targets - a raw "redirect" query
// param reflected into a Location header is a classic open-redirect
// vector, and this domain must never be usable to redirect elsewhere
const sanitizeRedirectTarget = (target) => {
    if (!target || typeof target !== 'string') {
        return '/'
    }
    if (!target.startsWith('/') || target.startsWith('//') || target.includes('://')) {
        return '/'
    }
    return target
}

/**
 * Renders the interstitial page. Self-contained (inline css, no external
 * requests, no js) so it renders correctly regardless of whether asset
 * requests from the same flagged ip are also being challenged.
 */
export const renderChallengePage = (targetUrl) => {
    const confirmHref = `/__botcheck/confirm?redirect=${encodeURIComponent(targetUrl)}`
    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Bestätigung erforderlich</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 15vh auto; padding: 0 20px; text-align: center; color: #222;">
<h1 style="font-size: 1.4rem;">Kurze Bestätigung</h1>
<p style="color: #555; line-height: 1.5;">Um fortzufahren, bestätige bitte, dass du kein automatisiertes Programm bist.</p>
<p style="margin-top: 2rem;">
<a href="${confirmHref}" style="display: inline-block; padding: 0.75rem 1.75rem; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">Ich bin kein Bot</a>
</p>
</body>
</html>`
}

/**
 * Handles GET /__botcheck/confirm?redirect=<url> - sets the confirmation
 * cookie and redirects back to the originally requested page. Must be
 * routed BEFORE the geo/asn checks run, so the confirm request itself is
 * never caught by the gate it is meant to satisfy.
 */
export const handleChallengeConfirm = (req, res, parsedUrl) => {
    const target = sanitizeRedirectTarget(parsedUrl.query.redirect)
    const token = createToken()

    const cookieParts = [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        `Max-Age=${TOKEN_TTL_SECONDS}`,
        'HttpOnly',
        'SameSite=Lax'
    ]
    if (req.isHttps) {
        cookieParts.push('Secure')
    }

    res.writeHead(302, {
        'Set-Cookie': cookieParts.join('; '),
        'Location': target,
        'Cache-Control': 'no-store'
    })
    res.end()
}