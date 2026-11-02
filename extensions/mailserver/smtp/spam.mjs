import Util from '../../../api/util/index.mjs'
import ClientUtil from '../../../client/util/index.mjs'

/*



    {
      "key": "x-recommended-action",
      "line": "X-Recommended-Action: accept"
    },


 */
// Weights can be overridden/disabled via MailSpamFilter.structural in the global store
const DEFAULT_STRUCTURAL = {
    enabled: true,
    riskyAttachment: 4,          // .html/.svg/.js/... attachment
    riskyAttachmentInvoice: 7,   // same, but mail talks about invoice/payment
    scriptInAttachment: 5,       // external <script src>, eval, atob, location redirect in attachment
    linkMismatch: 2,             // visible mail/domain differs from href target
    senderNotInBody: 2,          // sender domain unrelated to all mail addresses in the body
    fillerParagraphs: 1,         // many empty &nbsp; paragraphs
    redirectCloak: 3,            // link on unknown host wraps another url (e.g. evil.com/?https://zefix.ch)
    authoritySender: 4,          // display name / local part claims to be an authority, domain is not official
    authorityBody: 1,            // body talks like an authority, sender domain is not official
    pressurePhrases: 2,          // per category hit (deadline, threat, call to action) if >= 2 categories
    // known click-tracking services: their embedded target url is used for the mismatch check
    trackingDomains: ['awstrack.me', 'sendgrid.net', 'list-manage.com', 'mailchimp.com', 'mcsv.net', 'mandrillapp.com',
        'hubspotlinks.com', 'hs-sites.com', 'mailjet.com', 'sparkpostmail.com', 'rs6.net', 'exacttarget.com',
        'brevo.com', 'sendibt3.com', 'sendinblue.com', 'mailgun.org', 'cmail19.com', 'cmail20.com', 'mjt.lu', 'safelinks.protection.outlook.com'],
    // domains allowed to use authority terms
    officialDomains: ['admin.ch', 'zefix.ch', 'ch.ch', 'post.ch', 'postfinance.ch', 'sif.admin.ch'],
    authorityTerms: ['ehra', 'handelsregister', 'zefix', 'eidgenössisch', 'eidgenoessisch', 'bundesamt', 'steuerverwaltung',
        'estv', 'seco', 'kantonspolizei', 'bundespolizei', 'fedpol', 'betreibungsamt', 'zollverwaltung', 'bazg', 'serafe', 'admin.ch'],
    maxAttachmentScan: 200000,   // bytes of attachment content to inspect
    maxBodyScan: 500000,         // chars of text/html to inspect
}

const RISKY_EXT = /\.(html?|shtml|xhtml|svg|js|vbs|hta|lnk|scr|exe|iso|img)$/i
const RISKY_TYPE = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml)/i
const INVOICE = /(rechnung|invoice|factuur|facture|fattura|zahlung|mahnung|payment)/i
const SCRIPT_IN_ATTACHMENT = /<script[^>]+src\s*=\s*["']?https?:|\beval\s*\(|\batob\s*\(|window\.location|document\.write\s*\(|location\.(href|replace)\s*=/i

const rootDomainsRelated = (a, b) => {
    if (a === b || a.endsWith('.' + b) || b.endsWith('.' + a)) return true
    const root = (d) => d.split('.').slice(-2).join('.')
    return root(a) === root(b)
}

// Tracking/redirect services (awstrack.me, sendgrid, mailchimp, ...) wrap the real target
// URL-encoded in path or query. Returns the innermost target host, or null.
const EMBEDDED_URL = /https?(?::|%3A)(?:\/\/|%2F%2F)(?:www\.)?([a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,8}\.[a-z]{2,24})/gi
const unwrapTrackingHost = (href, trackingDomains) => {
    if (trackingDomains) {
        const host = (href.match(/^https?:\/\/([^/"'?#:]+)/i) || [])[1]?.toLowerCase()
        if (!host || !trackingDomains.some(d => host === d || host.endsWith('.' + d))) return null
    }
    href = href.slice(0, 2048)
    const rest = href.replace(/^https?:\/\/[^/"'?#]+/i, '')
    let target = null
    for (const m of rest.matchAll(EMBEDDED_URL)) target = m[1].toLowerCase()
    return target
}

const embeddedHost = (href) => unwrapTrackingHost(href)

// pressure language typical for phishing (de/en/fr)
const PRESSURE = {
    deadline: /(\bfrist\b|innerhalb (von )?\d+ (arbeits)?tag|innert \d+|spätestens|sofort|umgehend|within \d+ (business )?days|immediately|dans les \d+ jours)/i,
    threat: /(sanktion|löschung|loeschung|sperrung|gesperrt|deaktiviert|konsequenzen|strafe|busse|betreibung|suspend|terminated|closed|poursuite|suppression)/i,
    action: /(daten (jetzt )?(aktualisieren|bestätigen|überprüfen)|konto (bestätigen|verifizieren|aktualisieren)|jetzt (bestätigen|verifizieren|aktualisieren)|verify your|update your (account|details|information)|confirm your|mettre à jour)/i
}

const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termsRegex = (terms) => new RegExp(`(^|[^a-zäöü])(${terms.map(escapeRe).join('|')})($|[^a-zäöü])`, 'i')

const extractAddress = (sender) => {
    if (!sender) return null
    const m = sender.match(/<([^>]+)>/) || sender.match(/([a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24})/i)
    return m ? m[1].trim().toLowerCase() : sender.trim().toLowerCase()
}

/**
 * Structure based checks (attachments, links, sender vs. content).
 * Complements the keyword list, scores are added to the keyword score.
 */
export const structuralScore = ({text = '', sender, html, attachments}, options = {}) => {
    const w = {...DEFAULT_STRUCTURAL, ...options}
    // hard cap so huge mails can't stall the smtp process
    text = text.slice(0, w.maxBodyScan)
    if (html) html = html.slice(0, w.maxBodyScan)
    let score = 0
    const reasons = []
    const add = (s, r) => {
        score += s
        reasons.push(r)
    }
    const lowerText = text.toLowerCase()

    for (const a of (attachments || [])) {
        const filename = a.filename || ''
        const contentType = a.contentType || ''
        if (!(RISKY_EXT.test(filename) || RISKY_TYPE.test(contentType))) continue

        // inline svg logos (cid) in signatures are fine; html is never exempt
        if (/^image\/svg/i.test(contentType) && a.contentDisposition === 'inline' && a.cid) continue

        const isInvoice = INVOICE.test(lowerText) || INVOICE.test(filename)
        add(isInvoice ? w.riskyAttachmentInvoice : w.riskyAttachment, `risky attachment "${filename}"${isInvoice ? ' (invoice)' : ''}`)

        let content = a.content
        if (content && content.toString) {
            content = content.toString('utf8', 0, w.maxAttachmentScan)
            if (SCRIPT_IN_ATTACHMENT.test(content)) {
                add(w.scriptInAttachment, `script in attachment "${filename}"`)
            }
        }
    }

    if (html) {
        // visible text looks like mail/domain but href points elsewhere
        for (const m of html.matchAll(/<a\s[^>]{0,1000}?href\s*=\s*["'](https?:\/\/([^/"'?#:]{1,253})[^"']{0,2048})["'][^>]{0,1000}>([\s\S]{0,2000}?)<\/a>/gi)) {
            const host = m[2].toLowerCase().replace(/^www\./, '')
            // resolve click-tracking redirects to the real destination
            const target = unwrapTrackingHost(m[1], w.trackingDomains) || host
            const shown = m[3].replace(/<[^>]+>/g, '').match(/[a-z0-9._-]{1,253}\.[a-z]{2,24}/i)
            if (shown) {
                const shownDomain = shown[0].toLowerCase().split('@').pop().replace(/^www\./, '')
                if (!rootDomainsRelated(shownDomain, host) && !rootDomainsRelated(shownDomain, target)) {
                    add(w.linkMismatch, `link text "${shownDomain}" points to "${target}"${target !== host ? ` (via ${host})` : ''}`)
                    break
                }
            }
        }

        // redirect cloaking: unknown host carrying another url, e.g. https://evil.com/?https://www.zefix.ch
        for (const m of html.matchAll(/<a\s[^>]{0,1000}?href\s*=\s*["']?(https?:\/\/[^"'\s>]{1,2048})/gi)) {
            const host = (m[1].match(/^https?:\/\/([^/"'?#:]+)/i) || [])[1]?.toLowerCase().replace(/^www\./, '')
            const inner = embeddedHost(m[1])
            if (host && inner && !rootDomainsRelated(host, inner) &&
                !w.trackingDomains.some(d => host === d || host.endsWith('.' + d))) {
                add(w.redirectCloak, `link "${host}" disguised as "${inner}"`)
                break
            }
        }

        const fillers = html.match(/<p[^>]{0,500}>\s{0,50}(<span[^>]{0,500}>)?\s{0,50}(&nbsp;| )\s{0,50}(<\/span>)?\s{0,50}<\/p>/gi)
        if (fillers && fillers.length > 5) add(w.fillerParagraphs, 'filler paragraphs')
    }

    if (sender) {
        const fromDomain = (sender.match(/@([a-z0-9.-]{1,253}\.[a-z]{2,24})/i) || [])[1]
        const bodyDomains = [...(text + ' ' + (html || '')).matchAll(/[a-z0-9._%+-]{1,64}@([a-z0-9.-]{1,253}\.[a-z]{2,24})/gi)].map(x => x[1].toLowerCase())
        if (fromDomain && bodyDomains.length > 0 && !bodyDomains.some(d => rootDomainsRelated(d, fromDomain.toLowerCase()))) {
            add(w.senderNotInBody, `sender domain "${fromDomain.toLowerCase()}" not in body`)
        }
    }
    const fromAddress = extractAddress(sender) || ''
    const fromDomainLc = fromAddress.split('@').pop()
    const isOfficial = fromDomainLc && w.officialDomains.some(d => fromDomainLc === d || fromDomainLc.endsWith('.' + d))
    if (sender && !isOfficial && w.authorityTerms?.length) {
        const authRe = termsRegex(w.authorityTerms)
        // display name + local part, e.g. "ehra auskunft ch <ehrakontakt@...>"
        const displayName = sender.replace(/<[^>]{0,500}>/, ' ') + ' ' + fromAddress.split('@')[0]
        const nameHit = displayName.match(authRe) || fromAddress.split('@')[0].match(/(ehra|handelsregister|zefix|estv|admin)/i)
        if (nameHit) {
            add(w.authoritySender, `sender claims authority "${(nameHit[2] || nameHit[1]).toLowerCase()}" from "${fromDomainLc}"`)
        } else {
            const bodyHit = lowerText.match(authRe)
            if (bodyHit) add(w.authorityBody, `authority term "${bodyHit[2]}" from non official sender`)
        }
    }

    const categories = Object.keys(PRESSURE).filter(k => PRESSURE[k].test(lowerText))
    if (categories.length >= 2) {
        add(w.pressurePhrases * categories.length, `pressure language (${categories.join(', ')})`)
    }

    return {score, reasons}
}

export const detectSpam = async (db, context, {text, sender, threshold, html, attachments}) => {

    if(threshold===0 || threshold === null){
        return {isSpam:false,spamScore:-1}
    }else if(isNaN(threshold)){
        threshold = 7
    }

    let spamFilter
    if(db && context){
        const values = await Util.keyValueGlobalMap(db, context, ['MailSpamFilter'])
        spamFilter = values.MailSpamFilter
    }

    if (!spamFilter) {
        console.warn('Spam filter is not configured in global store with Key MailSpamFilter')
        spamFilter = {
            senderBlacklist:[
                'coletolakervresort.com'
            ],
            keywords:{
                'bitcoingewinner':10,
                'potenz': 4,
                'hoehepunkt': 2,
                'liebesleben': 2,
                'arzneien': 2,
                'apotheke': 2,
                'free': 2,
                'winner': 3,
                'credit card': 5,
                'click here': 4,
                'unsubscribe': 1,
                'million dollars': 5
            }
        }
    }
    // trusted senders: exact address or domain (incl. subdomains), e.g. "uptimerobot.com"
    // Note: From is not verified (no SPF/DKIM/DMARC check here), so only whitelist low-risk senders
    if(sender && spamFilter.senderWhitelist){
        const address = extractAddress(sender)
        const domain = address.split('@').pop()
        const entry = spamFilter.senderWhitelist.find(w => {
            w = (w || '').toLowerCase().trim()
            return w && (address === w || domain === w || domain.endsWith('.' + w))
        })
        if(entry){
            return {spamScore: 0, isSpam: false, reason: `"${address}" is in senderWhitelist (${entry})`}
        }
    }

    if(sender && spamFilter.senderBlacklist){
        const senderLowerCase = sender.toLowerCase()

        const containsWord = spamFilter.senderBlacklist.some(word => senderLowerCase.includes(word))
        if(containsWord){
            return {spamScore:threshold, isSpam: true, reason: `"${senderLowerCase}" is in senderBlacklist`}
        }
    }

    const attachmentNames = (attachments || []).map(a => a.filename || '').join(' ')
    const lowerCaseText = ClientUtil.removeControlChars((text + ' ' + attachmentNames).toLowerCase())

    let totalScore = 0
    const foundKeywords = []
    if(spamFilter.keywords) {
        for (const [keyword, score] of Object.entries(spamFilter.keywords)) {
            if (lowerCaseText.includes(keyword)) {
                foundKeywords.push(keyword)
                totalScore += score
            }
        }
    }
    let reason = `Found keywords: ${foundKeywords.join(', ')}`
    if (!spamFilter.structural || spamFilter.structural.enabled !== false) {
        const structural = structuralScore({text, sender, html, attachments}, spamFilter.structural)
        totalScore += structural.score
        if (structural.reasons.length > 0) {
            reason += `; Structural: ${structural.reasons.join(', ')}`
        }
    }
    return {spamScore:totalScore, isSpam: totalScore >= threshold, reason}
}

// Example usage:
/*const message = "Congratulations! You are a winner! Click here to claim your million dollars now!";
const isSpamMessage =  detectSpam(null, null, message)*/

