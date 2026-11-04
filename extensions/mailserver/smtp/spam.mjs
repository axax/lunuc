import Util from '../../../api/util/index.mjs'
import ClientUtil from '../../../client/util/index.mjs'

/*



    {
      "key": "x-recommended-action",
      "line": "X-Recommended-Action: accept"
    },


 */
// Weights can be overridden/disabled via MailSpamFilter.structural in the global store
export const DEFAULT_STRUCTURAL = {
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
    pressurePhrases: 2,          // per category hit (deadline, threat, action, pretext) if >= 2 categories
    brandSender: 4,              // display name uses a known brand, sender domain doesn't belong to it
    genericBrandSender: 3,       // "<Name> Client Services/Support/Team" but domain doesn't contain <Name>
    foreignLinks: 2,             // sender claims a brand and all links go to an unrelated domain
    suspiciousTld: 2,
    bigMoney: 2,                 // "$2.7 Million US Dollars", "5,5 Mio. EUR"
    scamPhrases: 3,              // >= 2 advance fee fraud phrases (relief funds, inheritance, next of kin, ...)
    personalDataRequest: 3,      // asks for >= 3 kinds of personal data (name, birth date, phone, bank account, ...)
    foreignContacts: 2,
    freemailTitle: 3,            // freemail sender claims a high position (minister, prince, barrister, bank director, ...)
    invalidMessageId: 2,
    missingAttachment: 3,        // invoice text announces an attachment, but there is none (lure to a link/fake)
    pdfForeignLink: 2,           // invoice pdf links to a domain unrelated to the sender
    pdfActiveContent: 4,         // pdf with /JavaScript or /Launch action
    fakeReply: 3,                // subject "Re:/AW:" but no In-Reply-To/References header
    coldOutreach: 3,             // >= 2 typical cold sales phrases ("came across your website", "quick call", ...)
    htmlInPlainText: 1,
    selfDomainSender: 3,         // unauthenticated mail claims to come from the same domain it is delivered to (spoofed own domain)
    mailboxLure: 4,              // >= 2 mailbox/webmail lure terms (quota, validate, cpanel, ...) and all links point away from the sender
    freeHostLink: 2,             // link to a free hosting / preview domain (mypreview.site, pages.dev, ...)
    freeHostDomains: ['mypreview.site', 'pages.dev', 'workers.dev', 'netlify.app', 'web.app', 'firebaseapp.com', 'weebly.com',
        'wixsite.com', 'godaddysites.com', 'webflow.io', 'vercel.app', 'glitch.me', 'herokuapp.com', 'github.io', 'blogspot.com',
        'framer.website', 'carrd.co', 'my.canva.site', 'sites.google.com', 'r2.dev', 'ipfs.io'],
    hiddenLink: 2,               // invisible link (left:-9999px, opacity:0, font-size:0, display:none)
    hypePhrases: 3,              // >= 2 marketing hype / fomo phrases ("gab es noch nie", "fast umsonst", ...)
    energyOffer: 2,              // solar / heat pump offer combined with subsidy / free / tax promises          // text/plain part contains html markup (broken bulk mail template)         // Message-ID without valid domain, e.g. <5$7c$-650$9nf-l@qeq6.i3t>
    freemailDomains: ['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'hotmail.com', 'outlook.com',
        'live.com', 'msn.com', 'aol.com', 'gmx.com', 'gmx.net', 'gmx.de', 'gmx.ch', 'web.de', 'mail.com', 'mail.ru',
        'yandex.com', 'yandex.ru', 'proton.me', 'protonmail.com', 'icloud.com', 'zoho.com', 'bluewin.ch', 'hispeed.ch'],          // >= 2 different contact mail domains in body, none related to sender            // links to cheap tlds often used for phishing
    suspiciousTlds: ['live', 'xyz', 'top', 'click', 'icu', 'buzz', 'rest', 'cfd', 'sbs', 'cyou', 'monster', 'quest',
        'lol', 'mom', 'bond', 'zip', 'mov', 'country', 'gq', 'tk', 'ml', 'cf', 'ga', 'pw', 'work', 'support',
        'beauty', 'hair', 'makeup', 'skin', 'autos', 'boats', 'homes', 'yachts', 'motorcycles', 'christmas', 'cam', 'cyou'],
    suspiciousSenderTld: 3,      // sender domain itself on such a tld (women-flowers.beauty)
    punycodeLink: 2,             // link host with punycode (xn--...), often lookalike domains
    idnTlds: ['ch', 'li', 'de', 'at', 'fr', 'it'],
    brFiller: 1,                 // >= 20 consecutive <br> (pushes opt-out/footer out of sight)
    charsetMismatch: 1,          // html declares cyrillic/asian charset but text contains none of it
    brandImages: 2,              // images hotlinked from a brand domain, sender doesn't belong to that brand
    urlShortener: 3,             // link via url shortener (bit.ly, shorten.as, ...)
    deadLinks: 1,                // >= 3 href="#" (typical for copied phishing templates)
    shortenerDomains: ['bit.ly', 'bitly.com', 'tinyurl.com', 'shorten.as', 'goo.gl', 'ow.ly', 'is.gd', 'v.gd', 'cutt.ly',
        'rebrand.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 's.id', 't.ly', 'soo.gd', 'short.io', 'shorte.st', 'urlz.fr',
        'qrco.de', 'tiny.one', 'clck.ru', 'u.to', 'x.gd', 'lnk.to', 'surl.li', 'bit.do', 'linktr.ee'],
    // known click-tracking services: their embedded target url is used for the mismatch check
    trackingDomains: ['awstrack.me', 'sendgrid.net', 'list-manage.com', 'mailchimp.com', 'mcsv.net', 'mandrillapp.com',
        'hubspotlinks.com', 'hs-sites.com', 'mailjet.com', 'sparkpostmail.com', 'rs6.net', 'exacttarget.com',
        'brevo.com', 'sendibt3.com', 'sendinblue.com', 'mailgun.org', 'cmail19.com', 'cmail20.com', 'mjt.lu', 'safelinks.protection.outlook.com'],
    // domains allowed to use authority terms
    officialDomains: ['admin.ch', 'zefix.ch', 'ch.ch', 'post.ch', 'postfinance.ch', 'sif.admin.ch'],
    authorityTerms: ['ehra', 'handelsregister', 'zefix', 'eidgenössisch', 'eidgenoessisch', 'bundesamt', 'steuerverwaltung',
        'estv', 'seco', 'kantonspolizei', 'bundespolizei', 'fedpol', 'betreibungsamt', 'zollverwaltung', 'bazg', 'serafe', 'admin.ch',
        'mautservice', 'maut', 'vignette', 'strassenverkehrsamt'],
    // brand -> domain fragments the brand legitimately sends from (empty = the brand name itself)
    brands: {
        asfinag: [], dhl: [], ups: [], fedex: [], dpd: [], gls: [], 'die post': ['post'], 'swiss post': ['post'],
        postfinance: [], swisscom: [], sunrise: [], salt: [], ubs: [], raiffeisen: [], twint: [],
        sbb: ['sbb', 'swisspass.ch', 'cff.ch', 'ffs.ch'], swisspass: ['swisspass', 'sbb', 'cff.ch', 'ffs.ch'],
        paypal: [], microsoft: ['microsoft', 'office', 'outlook', 'live.com'], 'office 365': ['microsoft', 'office'],
        outlook: ['microsoft', 'outlook'], apple: [], icloud: ['apple', 'icloud'], netflix: [], amazon: [], google: [],
        ricardo: [], tutti: [], galaxus: [], digitec: [], visa: ['visa', 'viseca'], mastercard: [], viseca: [],
        cembra: [], migros: [], 'credit suisse': ['credit-suisse', 'ubs'], swica: [], helsana: [], sanitas: [],
        spotify: [], booking: [], 'interactive brokers': ['interactivebrokers', 'ibkr'], ibkr: ['interactivebrokers', 'ibkr'],
        swissquote: [], revolut: [], wise: [], n26: [], binance: [], coinbase: [], kraken: [], degiro: [], postbank: [],
        sparkasse: [], stripe: [], 'zürcher kantonalbank': ['zkb'], zkb: [], 'valiant': [], 'bancastato': [], yuh: [], neon: []
    },
    // entries with a dot are domains (root domain must match), others are fragments of the sender domain
    maxAttachmentScan: 200000,   // bytes of attachment content to inspect
    maxBodyScan: 500000,         // chars of text/html to inspect
}

const RISKY_EXT = /\.(html?|shtml|xhtml|svg|js|vbs|hta|lnk|scr|exe|iso|img|vhdx?|zip|rar|7z|cab|ace|arj|gz|tgz|xz|bat|cmd|ps1|jar|msi|docm|xlsm|pptm|one)$/i
// attachment announced in the text ("Im Anhang finden Sie ...")
const ANNOUNCED_ATTACHMENT = /(im anhang|anbei|beiliegend|in der beilage|in der anlage|angehaengt|attached (is|you will find|please find)|please find attached|see attached|en piece jointe|in bijlage|in allegato)/i
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

// pressure language typical for phishing (de/en/fr); applied to text with umlauts folded (ä->ae, ß->ss)
const PRESSURE = {
    deadline: /(\bfrist\b|frist bis|zahlungsfrist|innerhalb (von )?\d+ (arbeits)?tag|innert \d+|spaetestens|sofort|umgehend|zeitnah|zwingend erforderlich|ab sofort|within \d+ (business )?days|immediately|promptly|as soon as possible|without delay|dans les \d+ jours)/i,
    threat: /(sanktion|loeschung|sperrung|einschraenkung|eingeschraenkt|gesperrt|deaktiviert|konsequenzen|strafe|busse|betreibung|inkasso|mahngebuehr|behoerdenweiterleitung|weiterleitung an (die )?behoerde|zusaetzliche (kosten|gebuehren|bearbeitung)|suspend|terminated|closed|(affect|restrict|limit|lock)(ed|s)? (your )?account|account (will be )?(restricted|limited|locked|suspended)|poursuite|suppression)/i,
    action: /((daten|angaben|kontodaten|informationen|identitaet)\b.{0,60}\b(ueberpruefen|bestaetigen|aktualisieren|verifizieren)|konto (bestaetigen|verifizieren|aktualisieren)|jetzt (bestaetigen|verifizieren|aktualisieren|bezahlen|begleichen)|jetzt (den |ihren )?(vorgang|zahlung|sendung|details).{0,30}(pruefen|einsehen|bestaetigen|freigeben)|begleichen sie|(betrag|gebuehr|rechnung) (jetzt |online )?(begleichen|bezahlen)|verify your|update your (account|details|information)|confirm your|pay now|enable (passkey|2fa|two-factor)|complete the .{0,30}(verification|configuration|setup)|mettre a jour|mettre à jour)/i
}
PRESSURE.pretext = /(sicherheitsstandard|zwei-faktor|\b2fa\b|schutz ihres (online-banking|kontos)|systemaktualisierung|systemumstellung|sicherheitsupdate|sicherheitsueberpruefung|aus sicherheitsgruenden|ungewoehnliche (aktivitaet|anmeldung)|verdaechtige (aktivitaet|anmeldung)|unbefugte|unusual (activity|sign-in)|suspicious activity|security reasons|security (notice|policy|department|alert)|phishing threats|account (protection|security)|verifizierung erforderlich|activite inhabituelle)/i
const domainBelongsToBrand = (domain, brand, frags) =>
    (frags && frags.length ? frags : [brand]).map(f => f.replace(/\s+/g, ''))
        .some(f => f.includes('.') ? rootDomainsRelated(domain, f) : domain.includes(f))

// advance fee fraud (419) – applied to umlaut folded lower case text
const BIG_MONEY = /((\$|usd|us\$|eur|€|£|gbp|chf)\s?\(?\s?\d[\d.,]{0,12}\s?(million|billion|mio|mrd|m\b)|\d[\d.,]{0,12}\s?(million|billion|millionen|milliarden|mio\.?|mrd\.?)\s?(us |u\.s\. )?(dollars?|usd|euros?|eur|pounds?|gbp|chf|franken))/i
const SCAM_PHRASES = [
    /relief funds?/, /compensat(e|ion) (fund|payment|every|all)/, /unclaimed (funds?|inheritance|deposit)/, /next of kin/,
    /inheritance/, /beneficiar(y|ies)/, /lottery|lotto win|you have won/, /consignment box/, /atm (master )?card/,
    /diplomat(ic)? (agent|courier)/, /funds? (transfer|release|administrator)/, /foreign funds?/, /western union|moneygram/,
    /barrister|attorney at law/, /\b(un|imf|world bank|federal government|fbi)\b.{0,40}(compensat|fund|payment)/,
    /donation of|charity (donation|fund)/, /business proposal|mutually beneficial/, /erbschaft|nachlass/, /lotteriegewinn|gewinnbenachrichtigung/,
    /beguenstigte[rn]?/, /entschaedigung(szahlung)?/,
    // investment / "minister" scams
    /(former )?(minister|secretary) of (finance|petroleum|oil|energy)/, /invest .{0,40}in your (country|company)/,
    /move (the|this|my) funds?|transfer (the|this|my) funds?|(contract|investment|dormant) funds?/,
    /avoid .{0,30}(query|queries|authorit|tax|scrutiny)/, /kindly (get back|reply|respond|contact)/, /for further (discussion|details) and documentation/,
    /strictly confidential|utmost confidentiality/, /percentage (of|for) (your|the)|commission of \d+ ?%/
]
// positions typically claimed in advance fee / investment scams
// unsolicited sales / cold outreach (applied to umlaut folded lower case text)
const COLD_OUTREACH = [
    /(came|stumbled) across your (website|site|company|profile)|i (visited|checked|reviewed|had a (quick )?look at) your (website|site)/,
    /bin auf ihre (website|webseite|homepage) gestossen|habe mir ihre (website|webseite) angesehen/,
    /quick (\d+.{0,3}\d*.?minute )?(call|chat)|\d+.{0,3}\d*.?minute (call|chat)|open to a (quick )?(call|chat)|hop on a call|schedule a (call|meeting)/,
    /(\d+\+? years of experience)|we are a (leading|team of)|our team (of experts|specializes)/,
    /(mobile )?app development|web(site)? (design|development|redesign)|seo (services|ranking)|first page of google|rank (higher|on google)|lead generation|outsourc/,
    /i can share (a few|some) (simple )?ideas|free (audit|consultation|quote|proposal)|let me know if you('re| are) interested|would you be (open|interested)/,
    /unverbindliche(s|n)? (angebot|beratung)|kurzes (telefonat|gespraech)/
]

// marketing hype / fomo (umlaut folded)
const HYPE = [
    /gab es (so )?noch nie|einmalige (chance|gelegenheit)|nur (noch )?fuer kurze zeit|solange (der )?vorrat/,
    /fast (umsonst|geschenkt|gratis)|(komplett|voellig|nahezu) kostenlos|zum nulltarif|doppelt kassieren/,
    /verschenkt bares geld|laesst geld liegen|wer (jetzt nicht|spaeter kommt|wartet)|bares geld/,
    /(foerdertoepfe|foerderung|angebot)\w* .{0,30}(auslaufen|enden|begrenzt)|niemand weiss, was/,
    /kostenlos\s*[·|•-]\s*unverbindlich|unverbindlich\s*[·|•-]\s*kostenlos|in nur \d+ minuten|dauert (nur )?(drei|zwei|\d+) minuten/,
    /das ist kein tippfehler|wir sagen es direkt|klartext fuer/
]
const ENERGY_TOPIC = /(solaranlage|photovoltaik|pv-anlage|solarstrom|waermepumpe|heizungstausch|neue heizung|stromspeicher)/
const ENERGY_PROMISE = /(foerderung|zuschuss|steuerfrei|ohne mehrwertsteuer|kostenlos|nulltarif|geschenkt|umsonst|stromkosten (gegen )?null)/

const SCAM_TITLE = /\b(former )?(minister|prince|princess|sheikh|ambassador|diplomat|barrister|colonel|bank (manager|director)|director of (the )?(bank|finance|operations)|chief executive|ceo of|widow of)\b/i
const PERSONAL_DATA = [
    /full name|vollstaendiger name|vor- und nachname/, /date of birth|geburtsdatum/, /(mobile|phone|cell|telephone) (number|no)|whatsapp|telefonnummer|handynummer/,
    /occupation|beruf\b/, /bank (account|details|name)|bankverbindung|iban|kontonummer/, /passport|id card|identity card|ausweis|reisepass/,
    /home address|residential address|wohnadresse|postadresse/, /\bage\b|marital status|zivilstand/, /country.{0,10}city|nationality|nationalitaet/
]

// mailbox / webmail credential phishing (applied to umlaut folded lower case text)
const MAILBOX_LURE = [
    /(mail(box)?|storage|disk) (storage )?quota|quota .{0,30}(limit|exceed|full)|mailbox (is )?full|speicherplatz|postfach (ist )?voll/,
    /re-?validate|re-?verify|re-?activate|revalidier|bestaetig\w* sie ihr(e|en)? (postfach|konto|e-?mail)/,
    /\bcpanel\b|\bwebmail\b|\broundcube\b|\bzimbra\b|\bplesk\b/,
    /ssl\/?tls|certificate (expir|renew)|zertifikat (laeuft|ablauf)/,
    /(resolve|restore|upgrade|increase|unlock|release) (your |the )?(mailbox|account|storage|quota|pending (mail|message)s?)|held (mail|message)s?|pending (mail|message)s?/,
    /(email|mail|account) (will be |has been |is )?(deactivated|suspended|blocked|closed|deleted)|prevent (data|mail) loss|ask your (system )?administrator/
]

const foldUmlauts = (t) => t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')


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
export const structuralScore = ({text = '', sender, html, attachments, messageId, subject, inReplyTo, references, plainText, recipients, ownServer}, options = {}) => {
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
    const foldedText = foldUmlauts(lowerText)

    const senderDomain = ((extractAddress(sender) || '').split('@')[1] || '')
    const isInvoiceMail = INVOICE.test(lowerText)
    const realAttachments = (attachments || []).filter(a => !(a.contentDisposition === 'inline' && /^image\//i.test(a.contentType || '')))
    if (isInvoiceMail && realAttachments.length === 0 && ANNOUNCED_ATTACHMENT.test(foldedText)) {
        add(w.missingAttachment, 'invoice announces an attachment that is missing')
    }

    for (const a of (attachments || [])) {
        const filename = a.filename || ''
        const contentType = a.contentType || ''

        // pdf: active content and links to foreign domains (pdf annotations are usually uncompressed)
        if ((/pdf/i.test(contentType) || /\.pdf$/i.test(filename)) && a.content && a.content.toString) {
            const pdf = a.content.toString('latin1', 0, w.maxAttachmentScan)
            if (/\/(JavaScript|JS|Launch)\b/.test(pdf)) add(w.pdfActiveContent, `active content in pdf "${filename}"`)
            if (isInvoiceMail && senderDomain) {
                const hosts = [...pdf.matchAll(/\/URI\s{0,5}\(\s{0,5}https?:\/\/([^/)\s:]{1,253})/g)].map(m => m[1].toLowerCase().replace(/^www\./, ''))
                const foreign = hosts.find(h => !rootDomainsRelated(h, senderDomain) && !w.trackingDomains.some(d => h === d || h.endsWith('.' + d)))
                if (foreign) add(w.pdfForeignLink, `invoice pdf links to "${foreign}"`)
                const bad = hosts.find(h => w.suspiciousTlds.includes(h.split('.').pop()))
                if (bad) add(w.suspiciousTld, `pdf links to suspicious tld "${bad}"`)
            }
            continue
        }

        if (!(RISKY_EXT.test(filename) || RISKY_TYPE.test(contentType))) continue

        // inline svg logos (cid) in signatures are fine; html is never exempt
        if (/^image\/svg/i.test(contentType) && a.contentDisposition === 'inline' && a.cid) continue

        const isInvoice = INVOICE.test(lowerText) || INVOICE.test(filename)
        add(isInvoice ? w.riskyAttachmentInvoice : w.riskyAttachment, `risky attachment "${filename}"${isInvoice ? ' (invoice)' : ''}`)

        let content = a.content
        if (content && content.toString && !/pdf/i.test(contentType) && !/\.pdf$/i.test(filename)) {
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

        if (/(<br\s{0,5}\/?>\s{0,10}){20}/i.test(html)) add(w.brFiller, 'br filler')

        const declared = (html.match(/charset\s{0,3}=\s{0,3}["']?([a-z0-9_-]{1,30})/i) || [])[1]?.toLowerCase()
        if (declared && /^(windows-1251|koi8-[ru]|iso-8859-5|gb2312|gbk|big5|shift_jis|euc-kr)$/.test(declared)) {
            const nonLatin = /^(windows-1251|koi8-[ru]|iso-8859-5)$/.test(declared) ? /[\u0400-\u04ff]/ : /[\u3000-\u9fff\uac00-\ud7af]/
            if (!nonLatin.test(text)) add(w.charsetMismatch, `declared charset "${declared}" doesn't match content`)
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
    // received without authentication (smtp receive branch) but "from" is our own recipient domain;
    // mails relayed by this server itself (direct transport to its own MX) are excluded
    if (fromDomainLc && !isOfficial && !ownServer && recipients?.length &&
        recipients.some(r => String(r || '').toLowerCase().endsWith('@' + fromDomainLc))) {
        add(w.selfDomainSender, `sender domain "${fromDomainLc}" equals recipient domain (unauthenticated)`)
    }

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

    // brand impersonation: "ASFINAG Mautservice <service@gmconsulting.gr>"
    if (sender && fromDomainLc && w.brands && !isOfficial) {
        const displayOnly = sender.replace(/<[^>]{0,500}>/, ' ').toLowerCase()
        for (const [brand, frags] of Object.entries(w.brands)) {
            if (!new RegExp(`(^|[^a-z0-9äöü])${escapeRe(brand)}($|[^a-z0-9äöü])`).test(displayOnly)) continue
            if (!domainBelongsToBrand(fromDomainLc, brand, frags)) {
                add(w.brandSender, `sender name "${brand}" but domain "${fromDomainLc}"`)
                break
            }
        }
    }

    // generic: "Interactive Brokers Client Services <x@mail.tongrentangtea.com>"
    const CORP = /\b(client services?|customer (service|support|care)|kundendienst|kundenservice|support team|service desk|security (team|department|update)|system administrator|mail (admin|support|team)|account (team|services))\b/i
    let claimedIdentity = reasons.some(r => r.startsWith('sender name') || r.startsWith('sender claims'))
    if (sender && fromDomainLc && !isOfficial && !claimedIdentity) {
        const displayOnly = sender.replace(/<[^>]{0,500}>/, ' ').replace(/["']/g, '').trim().toLowerCase()
        if (CORP.test(displayOnly)) {
            const name = displayOnly.replace(CORP, ' ').replace(/[^a-z0-9äöü ]/g, ' ').trim()
            const words = name.split(/\s+/).filter(x => x.length >= 4)
            const domainLetters = fromDomainLc.replace(/[^a-z0-9]/g, '')
            if (words.length > 0 && !words.some(x => domainLetters.includes(x)) && !domainLetters.includes(words.join(''))) {
                add(w.genericBrandSender, `sender name "${name}" not in domain "${fromDomainLc}"`)
                claimedIdentity = true
            }
        }
    }

    if (html) {
        const hrefs = [...html.matchAll(/<a\s[^>]{0,1000}?href\s*=\s*["']?([^"'\s>]{0,2048})/gi)].map(m => m[1])
        const hostOf = (u) => ((u.match(/^https?:\/\/([^/"'?#:]{1,253})/i) || [])[1] || '').toLowerCase().replace(/^www\./, '')

        const shortener = hrefs.map(hostOf).find(h => h && w.shortenerDomains.some(d => h === d || h.endsWith('.' + d)))
        if (shortener) add(w.urlShortener, `link via url shortener "${shortener}"`)

        if (hrefs.filter(h => h === '#').length >= 3) add(w.deadLinks, 'dead links (href="#")')

        const linkHosts = [...new Set(hrefs.map(hostOf).filter(Boolean))]
        const badTld = linkHosts.find(h => w.suspiciousTlds.includes(h.split('.').pop()))
        if (badTld) add(w.suspiciousTld, `link to suspicious tld "${badTld}"`)

        const freeHost = linkHosts.find(h => w.freeHostDomains.some(d => h === d || h.endsWith('.' + d)))
        if (freeHost) add(w.freeHostLink, `link to free hosting domain "${freeHost}"`)

        // mailbox lure: generic credential phishing without a brand, all links lead away from the sender
        if (fromDomainLc && linkHosts.length > 0 && linkHosts.every(h => !rootDomainsRelated(h, fromDomainLc) &&
            !w.trackingDomains.some(d => h === d || h.endsWith('.' + d)))) {
            const lureHits = MAILBOX_LURE.map(re => (foldedText.match(re) || [])[0]).filter(Boolean)
            if (lureHits.length >= 2) add(w.mailboxLure, `mailbox lure (${lureHits.slice(0, 3).join(', ')}) with links to "${linkHosts[0]}"`)
        }

        // IDN under local country tlds (xn--zrich-kva.ch) is normal, elsewhere often a lookalike
        const puny = linkHosts.find(h => h.split('.').some(l => l.startsWith('xn--')) && !w.idnTlds.includes(h.split('.').pop()))
        if (puny) add(w.punycodeLink, `punycode link "${puny}"`)

        // claimed identity, but links lead elsewhere (trackers and well known orgs ignored)
        if (claimedIdentity && fromDomainLc) {
            const foreign = linkHosts.filter(h => !rootDomainsRelated(h, fromDomainLc) &&
                !w.trackingDomains.some(d => h === d || h.endsWith('.' + d)))
            if (foreign.length > 0 && foreign.length === linkHosts.length) {
                add(w.foreignLinks, `links point to "${foreign[0]}" unrelated to sender`)
            }
        }

        // brand images (e.g. swisspass.ch logo) while sender is unrelated
        if (fromDomainLc && !isOfficial && w.brands) {
            const imgHosts = [...new Set([...html.matchAll(/<img\s[^>]{0,1000}?src\s*=\s*["']?(https?:\/\/[^"'\s>]{1,2048})/gi)].map(m => hostOf(m[1])))]
            outer: for (const host of imgHosts) {
                const labels = host.split('.')
                for (const [brand, frags] of Object.entries(w.brands)) {
                    const list = frags && frags.length ? frags : [brand]
                    const isBrandHost = list.some(f => f.includes('.') ? rootDomainsRelated(host, f) : labels.includes(f.replace(/\s+/g, '')))
                    if (isBrandHost && !domainBelongsToBrand(fromDomainLc, brand, frags)) {
                        add(w.brandImages, `images from "${host}" (${brand}) but sender "${fromDomainLc}"`)
                        break outer
                    }
                }
            }
        }
    }

    const money = foldedText.match(BIG_MONEY)
    if (money) add(w.bigMoney, `big money amount "${money[0].trim()}"`)

    const scamHits = SCAM_PHRASES.map(re => (foldedText.match(re) || [])[0]).filter(Boolean)
    if (scamHits.length >= 2) add(w.scamPhrases, `advance fee phrases (${scamHits.slice(0, 4).join(', ')})`)

    const piiHits = PERSONAL_DATA.filter(re => re.test(foldedText)).length
    if (piiHits >= 3) add(w.personalDataRequest, `asks for personal data (${piiHits} kinds)`)

    if (fromDomainLc) {
        const contactDomains = [...new Set([...lowerText.matchAll(/[a-z0-9._%+-]{1,64}@([a-z0-9.-]{1,253}\.[a-z]{2,24})/g)].map(x => x[1]))]
            .filter(d => !rootDomainsRelated(d, fromDomainLc))
        if (contactDomains.length >= 2) add(w.foreignContacts, `contact addresses at ${contactDomains.slice(0, 3).join(', ')}`)
    }

    if (fromDomainLc && w.suspiciousTlds.includes(fromDomainLc.split('.').pop())) {
        add(w.suspiciousSenderTld, `sender on suspicious tld "${fromDomainLc}"`)
    }

    if (fromDomainLc && w.freemailDomains.includes(fromDomainLc)) {
        const title = foldedText.match(SCAM_TITLE)
        if (title) add(w.freemailTitle, `freemail sender claims to be "${title[0].trim()}"`)
    }

    // "Re: ..." without any reference to a previous message
    if (subject && /^\s*(re|aw|antw|sv|rif)\s*(\[\d+\])?\s*:/i.test(subject) && !inReplyTo && !(references && references.length)) {
        add(w.fakeReply, 'reply subject without In-Reply-To/References')
    }

    const hypeHits = HYPE.map(re => (foldedText.match(re) || [])[0]).filter(Boolean)
    if (hypeHits.length >= 2) add(w.hypePhrases, `hype phrases (${hypeHits.slice(0, 3).join(', ')})`)

    if (ENERGY_TOPIC.test(foldedText) && ENERGY_PROMISE.test(foldedText)) add(w.energyOffer, 'solar/heat pump subsidy offer')

    if (html && /<a\s[^>]{0,1000}?style\s*=\s*["'][^"']{0,500}?(left\s*:\s*-\d{3,}px|opacity\s*:\s*0(\.0+)?\s*[;"']|font-size\s*:\s*0(px)?\s*[;"']|display\s*:\s*none)/i.test(html)) {
        add(w.hiddenLink, 'hidden link')
    }

    const coldHits = COLD_OUTREACH.map(re => (foldedText.match(re) || [])[0]).filter(Boolean)
    if (coldHits.length >= 2) add(w.coldOutreach, `cold outreach (${coldHits.slice(0, 3).join(', ')})`)

    if (plainText && (String(plainText).slice(0, w.maxBodyScan).match(/<(p|div|br|span|table|td|b|strong)[\s>\/]/gi) || []).length >= 3) {
        add(w.htmlInPlainText, 'html markup in text/plain part')
    }

    if (messageId) {
        const mid = String(messageId).trim().replace(/^<|>$/g, '').slice(0, 500)
        const midDomain = mid.includes('@') ? mid.split('@').pop().toLowerCase() : null
        const validDomain = midDomain === null || /^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63}){0,10}\.[a-z]{2,24}$/.test(midDomain) || /^(localhost|localhost\.localdomain)$/.test(midDomain)
        if (!validDomain) add(w.invalidMessageId, `invalid message-id domain "${midDomain || mid.slice(0, 40)}"`)
    }

    const categories = Object.keys(PRESSURE).filter(k => PRESSURE[k].test(foldedText))
    if (categories.length >= 2) {
        add(w.pressurePhrases * categories.length, `pressure language (${categories.join(', ')})`)
    }

    return {score, reasons}
}

export const detectSpam = async (db, context, {text, sender, threshold, html, attachments, messageId, subject, inReplyTo, references, plainText, recipients, ownServer}) => {

    if(threshold===0 || threshold === null){
        return {isSpam:false, spamScore:-1, threshold, reason: 'spam filter disabled for this account'}
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
            return {spamScore: 0, isSpam: false, threshold, reason: `"${address}" is in senderWhitelist (${entry})`}
        }
    }

    if(sender && spamFilter.senderBlacklist){
        const senderLowerCase = sender.toLowerCase()

        const containsWord = spamFilter.senderBlacklist.some(word => word && senderLowerCase.includes(String(word).toLowerCase().trim()))
        if(containsWord){
            return {spamScore:threshold, isSpam: true, threshold, reason: `"${senderLowerCase}" is in senderBlacklist`}
        }
    }

    const attachmentNames = (attachments || []).map(a => a.filename || '').join(' ')
    const lowerCaseText = ClientUtil.removeControlChars((text + ' ' + attachmentNames).toLowerCase())

    let totalScore = 0
    const foundKeywords = []
    if(spamFilter.keywords) {
        for (const [keyword, score] of Object.entries(spamFilter.keywords)) {
            // keywords are matched case-insensitive (entries like "shipment from China" would never match otherwise)
            if (keyword && lowerCaseText.includes(keyword.toLowerCase())) {
                foundKeywords.push(keyword)
                totalScore += score
            }
        }
    }
    const parts = foundKeywords.length ? [`Found keywords: ${foundKeywords.join(', ')}`] : []
    if (!spamFilter.structural || spamFilter.structural.enabled !== false) {
        const structural = structuralScore({text, sender, html, attachments, messageId, subject, inReplyTo, references, plainText, recipients, ownServer}, spamFilter.structural)
        totalScore += structural.score
        if (structural.reasons.length > 0) {
            parts.push(`Structural: ${structural.reasons.join(', ')}`)
        }
    }
    return {spamScore:totalScore, isSpam: totalScore >= threshold, threshold, reason: parts.join('; ') || 'nothing found'}
}

// Example usage:
/*const message = "Congratulations! You are a winner! Click here to claim your million dollars now!";
const isSpamMessage =  detectSpam(null, null, message)*/

