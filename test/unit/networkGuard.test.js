/*
 * Urls from the request may only be opened by the server (headless browser) if they are
 * http(s) to public addresses (SSRF protection).
 */
import assert from 'node:assert'
import {isPrivateAddress, isPublicHttpUrl, isPrivateHostname} from '../../util/networkGuard.mjs'
import {convertContent} from '../../api/util/contentToJson.mjs'
import Util from '../../api/util/index.mjs'
import Cache from '../../util/cache.mjs'
import {templateSegment} from '../../extensions/cms/util/dataResolverCore.mjs'
import {openInBrowser} from '../../extensions/cms/util/browser.mjs'

describe('network guard', () => {

    it('detects private addresses', () => {
        for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
            '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
            assert.strictEqual(isPrivateAddress(ip), true, ip)
        }
        for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2a00:1450:4001::1']) {
            assert.strictEqual(isPrivateAddress(ip), false, ip)
        }
    })

    it('only allows public http(s) urls', async () => {
        for (const url of ['file:///etc/passwd', 'http://localhost:3000/graphql', 'http://127.0.0.1/', 'http://[::1]/',
            'http://169.254.169.254/latest/meta-data', 'https://localhost:9002/hac', 'ftp://8.8.8.8/', 'javascript:alert(1)',
            'http://foo.localhost/', 'not an url']) {
            assert.strictEqual(await isPublicHttpUrl(url), false, url)
        }
        assert.strictEqual(await isPublicHttpUrl('https://8.8.8.8/'), true)
    })

    it('marks website segments with a templated url', () => {
        const seg = templateSegment({key: 'x', website: {url: '${params.url}', pipeline: [{screenshot: {}}]}},
            {scope: {params: {url: 'https://example.com'}, props: {}}, resolvedData: {}, context: {}})
        assert.strictEqual(seg.website._restrictNetwork, true)
        const staticSeg = templateSegment({key: 'x', website: {url: 'https://localhost:9002/hac'}},
            {scope: {params: {}, props: {}}, resolvedData: {}, context: {}})
        assert.strictEqual(staticSeg.website._restrictNetwork, undefined)
    })

    it('refuses a templated url to a local file before the browser is started', async () => {
        const result = await openInBrowser({url: 'file:///etc/passwd', _restrictNetwork: true}, {}, {})
        assert.strictEqual(result.error, 'URL not allowed')
    })

    it('isPrivateHostname without dns', () => {
        for (const host of ['localhost', '127.0.0.1', '[::1]', '10.0.0.1', 'x.local', 'db.internal', '100.64.1.1']) {
            assert.strictEqual(isPrivateHostname(host), true, host)
        }
        for (const host of ['example.com', '8.8.8.8', '100.1.2.3']) {
            assert.strictEqual(isPrivateHostname(host), false, host)
        }
    })

    it('own domains (hostrules) are allowed, also if they resolve to 127.0.0.1', async () => {
        // hostrules/lunuc.com.json is part of the repository
        assert.strictEqual(await isPublicHttpUrl('https://lunuc.com/seite'), true)
        assert.strictEqual(await isPublicHttpUrl('https://www.lunuc.com/seite'), true)
        // not every sub domain and no other protocols
        assert.strictEqual(await isPublicHttpUrl('file://lunuc.com/etc/passwd'), false)
    })

    it('content import refuses internal urls', async () => {
        await assert.rejects(convertContent({url: 'http://127.0.0.1:1/x'}), /nicht erlaubt/)
    })
})

describe('user cache', () => {
    it('clearUserCache also removes the old name after a rename', () => {
        Cache.set('User1', {_id: '1', username: 'old'})
        Cache.set('Userold', {_id: '1', username: 'old'})
        Util.clearUserCache('1', 'new')
        assert.strictEqual(Cache.get('User1'), undefined)
        assert.strictEqual(Cache.get('Userold'), undefined)
    })
})
