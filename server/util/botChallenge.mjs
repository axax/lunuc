// server/util/botChallenge.mjs
//
// "Click to confirm you are not a bot" interstitial, used by countryPolicy
// (and reusable by asnPolicy) mode "challenge".
//
// Design goals:
//   - No JavaScript required to pass - a plain link click. This keeps the
//     interstitial itself immune to becoming a challenge-loop and works
//     even against the many bots/scrapers that don't render JS at all.
//   - Fully self-contained HTML (a <style> block + one inline svg icon, no
//     external assets, no scripts) - the page renders correctly even
//     though css/js/image requests from the same flagged ip would ALSO be
//     challenged, since there is nothing external to fetch.
//   - Low-friction gate, not a hardened anti-bot system: no puzzle, no
//     captcha. It filters out bots that don't bother rendering/clicking.
//     Combine with asnPolicy/countryPolicy block/throttle modes for
//     actors that click through it repeatedly and deserve harsher handling.
//
// Cookie: <expiry-epoch-seconds>.<hmac>, HttpOnly + SameSite=Lax (+Secure
// on https), Domain set to the registrable domain (see cookieDomainFor)
// so ONE confirmation covers the bare domain and all its subdomains
// (e.g. shop.ch and www.shop.ch) - without this, a visitor landing on
// shop.ch, confirming, then being redirected to www.shop.ch (forceWWW)
// would see the challenge a second time, since a host-only cookie (no
// Domain attribute) is invisible on a different host. Deliberately NOT
// ip-bound either - mobile users switch networks mid-session, binding to
// ip would force needless re-confirmation.

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

// Derives the registrable domain from a host so the cookie applies to the
// bare domain and every subdomain (shop.ch, www.shop.ch, m.shop.ch, ...).
// Deliberately simple (last two dot-separated labels) rather than a full
// Public Suffix List lookup - correct for standard single-label TLDs
// (.ch, .com, .de, .net, ...) which covers normal shop setups. It is NOT
// correct for two-part TLDs like .co.uk - if any host ever uses one of
// those, this needs a proper PSL-based implementation instead.
// IPs and "localhost" are returned unchanged: a Domain attribute on those
// would either be rejected by the browser or is meaningless.
const cookieDomainFor = (host) => {
    if (!host || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) {
        return null // ipv4/ipv6/localhost - no Domain attribute, host-only cookie
    }
    const labels = host.split('.')
    if (labels.length < 2) {
        return null
    }
    return labels.slice(-2).join('.')
}


/* ------------------------------------------------------------------ */
/* i18n - German default, English fallback for everything else          */
/* ------------------------------------------------------------------ */

const TRANSLATIONS = {
    de: {
        htmlLang: 'de',
        title: 'Bestätigung erforderlich',
        heading: 'Kurze Bestätigung',
        body: 'Um fortzufahren, bestätige bitte, dass du kein automatisiertes Programm bist.',
        button: 'Ich bin kein Bot',
        footnote: 'Das dauert nur einen Klick.'
    },
    en: {
        htmlLang: 'en',
        title: 'Confirmation required',
        heading: 'Quick confirmation',
        body: 'To continue, please confirm that you are not an automated program.',
        button: "I'm not a robot",
        footnote: 'This only takes one click.'
    }
}

/**
 * Picks 'de' or 'en' from an Accept-Language header. German is the site
 * default - it wins on a tie or when the header is missing/unparsable.
 * English is the fallback for every other language. Only the two
 * highest-priority (by q value) tags are considered; a client asking for
 * French with no German/English at all still gets the English fallback,
 * never a raw/undefined page.
 */
const pickLanguage = (acceptLanguageHeader) => {
    if (!acceptLanguageHeader) {
        return 'de'
    }
    const parsed = acceptLanguageHeader.split(',')
        .map(part => {
            const [tag, qPart] = part.trim().split(';q=')
            const primary = tag.split('-')[0].toLowerCase()
            const q = qPart ? parseFloat(qPart) : 1
            return {primary, q: isNaN(q) ? 1 : q}
        })
        .sort((a, b) => b.q - a.q)

    const top = parsed.find(p => p.primary === 'de' || p.primary === 'en')
    return top?.primary === 'en' ? 'en' : 'de'
}


/**
 * Renders the interstitial page. Self-contained (a <style> block + one
 * inline svg, no external requests, no js) so it renders correctly
 * regardless of whether asset requests from the same flagged ip are also
 * being challenged.
 *
 * acceptLanguageHeader: pass req.headers['accept-language'] - German is
 * shown unless the client clearly prefers another language, in which case
 * English is used as the fallback (see pickLanguage).
 */
export const renderChallengePage = (targetUrl, acceptLanguageHeader) => {
    const lang = pickLanguage(acceptLanguageHeader)
    const t = TRANSLATIONS[lang]
    const confirmHref = `/__botcheck/confirm?redirect=${encodeURIComponent(targetUrl)}`
    return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${t.title}</title>
<style>
    :root {
        color-scheme: light;
    }
    * {
        box-sizing: border-box;
    }
    html, body {
        height: 100%;
    }
    body {
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 24px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        background: radial-gradient(circle at 50% 0%, #f3f4f8 0%, #e7e9f0 55%, #dcdfe9 100%);
        color: #1a1a2e;
    }
    .card {
        width: 100%;
        max-width: 420px;
        background: #ffffff;
        border-radius: 20px;
        padding: 40px 36px 36px;
        text-align: center;
        box-shadow: 0 1px 2px rgba(20, 20, 43, 0.04), 0 16px 40px -12px rgba(20, 20, 43, 0.18);
        animation: rise 0.35s ease-out;
    }
    .icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: linear-gradient(135deg, #eef0ff, #e2e6ff);
    }
    .icon svg {
        width: 28px;
        height: 28px;
    }
    h1 {
        margin: 0 0 10px;
        font-size: 1.25rem;
        font-weight: 650;
        letter-spacing: -0.01em;
    }
    p {
        margin: 0;
        color: #5c5f72;
        font-size: 0.95rem;
        line-height: 1.55;
    }
    .btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-top: 28px;
        padding: 0.8rem 1.9rem;
        background: #1a1a2e;
        color: #ffffff;
        text-decoration: none;
        border-radius: 12px;
        font-size: 0.95rem;
        font-weight: 600;
        transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        box-shadow: 0 6px 16px -6px rgba(26, 26, 46, 0.5);
    }
    .btn:hover {
        background: #2a2a45;
        transform: translateY(-1px);
        box-shadow: 0 10px 20px -6px rgba(26, 26, 46, 0.55);
    }
    .btn:active {
        transform: translateY(0);
    }
    .btn:focus-visible {
        outline: 2px solid #7b7fd6;
        outline-offset: 3px;
    }
    .footnote {
        margin-top: 22px;
        font-size: 0.78rem;
        color: #9a9db0;
    }
    @keyframes rise {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
    }
</style>
</head>
<body>
<div class="card">
    <div class="icon">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" stroke="#4b4fd6" stroke-width="1.6" stroke-linejoin="round"/>
            <path d="M9 12.2l2.1 2.1L15.5 10" stroke="#4b4fd6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    </div>
    <h1>${t.heading}</h1>
    <p>${t.body}</p>
    <a class="btn" href="${confirmHref}">${t.button}</a>
    <div class="footnote">${t.footnote}</div>
</div>
</body>
</html>`
}

/**
 * Handles GET /__botcheck/confirm?redirect=<url> - sets the confirmation
 * cookie and redirects back to the originally requested page. Must be
 * routed BEFORE the geo/asn checks run, so the confirm request itself is
 * never caught by the gate it is meant to satisfy.
 *
 * host is the request's Host header (same value used elsewhere for
 * hostrule matching) - used only to derive the cookie's Domain attribute
 * so the confirmation carries over to www./other subdomains.
 */
export const handleChallengeConfirm = (req, res, parsedUrl, remoteAddress, host) => {
    const target = sanitizeRedirectTarget(parsedUrl.query.redirect)
    const token = createToken()

    console.log(`bot challenge confirmed by ${remoteAddress} -> redirecting to ${target}`)

    const cookieParts = [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        `Max-Age=${TOKEN_TTL_SECONDS}`,
        'HttpOnly',
        'SameSite=Lax'
    ]

    const domain = cookieDomainFor(host)
    if (domain) {
        cookieParts.push(`Domain=${domain}`)
    }

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