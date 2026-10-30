import {ObjectId} from 'mongodb'

/* number of soft bounces (in different mailings) after which a subscriber is set to invalid */
export const SOFT_BOUNCE_LIMIT = 3

const HARD_TEXT = /(user unknown|unknown user|no such user|does not exist|doesn't exist|mailbox (is )?unavailable|mailbox not found|invalid recipient|recipient address rejected|address rejected|account (has been )?disabled|no mailbox)/i
const POLICY_TEXT = /(spam|blocked|block list|blocklist|blacklist|spf|dkim|dmarc|reputation|policy|rbl|spamhaus|banned)/i

/*
 * Extract a plain, serializable summary from whatever sendMail returned
 * (nodemailer info object, nodemailer error, or {error: '...'} from mail.mjs)
 */
export const getMailResult = (result) => {
    if (!result) {
        return {failed: true, responseCode: '', error: 'No response from sendMail'}
    }

    // validation error returned by api/util/mail.mjs (e.g. invalid recipient address)
    if (typeof result.error === 'string') {
        return {failed: true, responseCode: '', error: result.error, invalidAddress: true}
    }

    const isError = result instanceof Error || !!result.code || !!result.errors
    if (isError) {
        // combined error of the direct transport
        const inner = result.errors?.[0]?.rejectedErrors?.[0] || result.errors?.[0] || result
        const response = inner.response || result.response || inner.message || result.message || ''
        return {
            failed: true,
            responseCode: String(inner.responseCode || result.responseCode || ''),
            error: response,
            code: inner.code || result.code,
            command: inner.command || result.command
        }
    }

    if (Array.isArray(result.rejected) && result.rejected.length > 0 && (!result.accepted || result.accepted.length === 0)) {
        const rej = result.rejectedErrors?.[0] || {}
        return {
            failed: true,
            responseCode: String(rej.responseCode || ''),
            error: rej.response || `Recipient rejected: ${result.rejected.join(', ')}`
        }
    }

    return {failed: false, responseCode: String(result.response || '').substring(0, 3), error: ''}
}

/*
 * Classify a failed delivery
 *  hard   -> address does not exist / is rejected permanently -> set subscriber invalid immediately
 *  soft   -> temporary problem (mailbox full, timeouts, 4xx) -> count, invalid after SOFT_BOUNCE_LIMIT
 *  policy -> rejected because of spam/reputation/auth -> problem on sender side, don't blame the subscriber
 */
export const classifyBounce = ({responseCode, error, invalidAddress}) => {
    if (invalidAddress) {
        return 'hard'
    }
    const text = error || ''
    const enhanced = text.match(/\b([245])\.(\d{1,3})\.(\d{1,3})\b/)
    const code = parseInt(responseCode) || 0

    if (enhanced) {
        const [, cls, subject, detail] = enhanced
        if (cls === '5') {
            if (subject === '7') return 'policy'
            if (subject === '1') return 'hard'
            if (subject === '2' && detail === '1') return 'hard' // mailbox disabled
            if (subject === '4' && detail === '1') return 'hard' // e.g. Exchange Online "Access denied" (DBEB)
            if (subject === '2' && detail === '2') return 'soft' // mailbox full
        }
        if (cls === '4') return POLICY_TEXT.test(text) ? 'policy' : 'soft'
    }

    if (POLICY_TEXT.test(text)) return 'policy'
    if (code >= 500 && code < 600 && HARD_TEXT.test(text)) return 'hard'
    return 'soft'
}

/*
 * Store the delivery result on NewsletterSent and the bounce information on the subscriber
 */
export const recordMailResult = async (db, {sentId, subscriberId, mailingId, result, email}) => {
    const mailResult = getMailResult(result)

    if (sentId) {
        await db.collection('NewsletterSent').updateOne({_id: sentId}, {
            $set: {
                status: mailResult.failed ? 'failed' : 'sent',
                responseCode: mailResult.responseCode,
                error: mailResult.error,
                mailResponse: JSON.parse(JSON.stringify({...mailResult, raw: result}))
            }
        })
    }

    if (!subscriberId) {
        return mailResult
    }

    const subId = subscriberId.constructor === String ? new ObjectId(subscriberId) : subscriberId

    if (!mailResult.failed) {
        // successful delivery resets the counter
        await db.collection('NewsletterSubscriber').updateOne({_id: subId, bounceCount: {$gt: 0}}, {$set: {bounceCount: 0}})
        return mailResult
    }

    const bounceType = classifyBounce(mailResult)
    mailResult.bounceType = bounceType

    const $set = {
        lastBounceAt: Date.now(),
        lastBounceCode: mailResult.responseCode,
        lastBounceMessage: `[${bounceType}] ${mailResult.error}`.substring(0, 1000),
        lastBounceMailing: mailingId ? new ObjectId(mailingId) : null
    }

    if (bounceType === 'policy') {
        // not the subscribers fault -> only remember it, don't count
        console.warn(`sendNewsletter: policy rejection for ${email}: ${mailResult.error}`)
        await db.collection('NewsletterSubscriber').updateOne({_id: subId}, {$set})
        return mailResult
    }

    const updated = await db.collection('NewsletterSubscriber').findOneAndUpdate(
        {_id: subId},
        {$set, $inc: {bounceCount: 1}},
        {returnDocument: 'after'}
    )
    const subscriber = updated?.value !== undefined ? updated.value : updated

    if (bounceType === 'hard' || (subscriber?.bounceCount || 0) >= SOFT_BOUNCE_LIMIT) {
        console.warn(`sendNewsletter: set subscriber ${email} to invalid (${bounceType}, bounces=${subscriber?.bounceCount}): ${mailResult.error}`)
        await db.collection('NewsletterSubscriber').updateOne({_id: subId}, {$set: {state: 'invalid'}})
        mailResult.invalidated = true
    }

    return mailResult
}
