/*
 * Attachments of sendMail: a file path or url (read by nodemailer) is only allowed for admins or
 * trusted server code - public forms pass attachments from the browser.
 */
import assert from 'node:assert'
import Util from '../../api/util/index.mjs'
import {sanitizeAttachments} from '../../api/util/mail.mjs'

describe('mail attachments', () => {
    const origHasCapability = Util.userHasCapability
    afterEach(() => {
        Util.userHasCapability = origHasCapability
    })

    const list = [
        {filename: 'form.pdf', path: 'data:application/pdf;base64,JVBERi0='},
        {filename: 'inline.txt', content: 'hello'},
        {filename: 'passwd', path: '/etc/passwd'},
        {filename: 'rel', path: '../../buildconfig.json'},
        {filename: 'url', path: 'http://127.0.0.1:27017/'},
        {filename: 'href', href: 'http://169.254.169.254/latest/meta-data'}
    ]

    it('removes paths and urls for anonymous users', async () => {
        Util.userHasCapability = async () => false
        const result = await sanitizeAttachments(null, {}, list, false)
        assert.deepStrictEqual(result.map(a => a.filename), ['form.pdf', 'inline.txt'])
    })

    it('removes paths and urls for users without admin_options', async () => {
        Util.userHasCapability = async () => false
        const result = await sanitizeAttachments(null, {id: 'x', username: 'u'}, list, false)
        assert.deepStrictEqual(result.map(a => a.filename), ['form.pdf', 'inline.txt'])
    })

    it('keeps everything for admins and trusted callers', async () => {
        Util.userHasCapability = async (db, context, capability) => capability === 'admin_options'
        assert.strictEqual((await sanitizeAttachments(null, {id: 'x'}, list, false)).length, list.length)
        Util.userHasCapability = async () => false
        assert.strictEqual((await sanitizeAttachments(null, {}, list, true)).length, list.length)
    })

    it('does not check the capability without file attachments', async () => {
        let called = false
        Util.userHasCapability = async () => { called = true; return false }
        await sanitizeAttachments(null, {}, [list[0], list[1]], false)
        assert.strictEqual(called, false)
    })

    it('handles a single attachment object and empty values', async () => {
        Util.userHasCapability = async () => false
        assert.deepStrictEqual(await sanitizeAttachments(null, {}, {path: '/etc/passwd'}, false), [])
        assert.strictEqual(await sanitizeAttachments(null, {}, undefined, false), undefined)
    })
})
