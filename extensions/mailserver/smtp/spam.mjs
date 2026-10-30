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
    maxAttachmentScan: 200000    // bytes of attachment content to inspect
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

/**
 * Structure based checks (attachments, links, sender vs. content).
 * Complements the keyword list, scores are added to the keyword score.
 */
export const structuralScore = ({text = '', sender, html, attachments}, options = {}) => {
    const w = {...DEFAULT_STRUCTURAL, ...options}
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
        for (const m of html.matchAll(/<a\s[^>]*href\s*=\s*["']https?:\/\/([^/"'?#:]+)[^>]*>([\s\S]*?)<\/a>/gi)) {
            const host = m[1].toLowerCase().replace(/^www\./, '')
            const shown = m[2].replace(/<[^>]+>/g, '').match(/[a-z0-9._-]+\.[a-z]{2,}/i)
            if (shown) {
                const shownDomain = shown[0].toLowerCase().split('@').pop().replace(/^www\./, '')
                if (!rootDomainsRelated(shownDomain, host)) {
                    add(w.linkMismatch, `link text "${shownDomain}" points to "${host}"`)
                    break
                }
            }
        }

        const fillers = html.match(/<p[^>]*>\s*(<span[^>]*>)?\s*(&nbsp;| )\s*(<\/span>)?\s*<\/p>/gi)
        if (fillers && fillers.length > 5) add(w.fillerParagraphs, 'filler paragraphs')
    }

    if (sender) {
        const fromDomain = (sender.match(/@([a-z0-9.-]+\.[a-z]{2,})/i) || [])[1]
        const bodyDomains = [...(text + ' ' + (html || '')).matchAll(/[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})/gi)].map(x => x[1].toLowerCase())
        if (fromDomain && bodyDomains.length > 0 && !bodyDomains.some(d => rootDomainsRelated(d, fromDomain.toLowerCase()))) {
            add(w.senderNotInBody, `sender domain "${fromDomain.toLowerCase()}" not in body`)
        }
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

