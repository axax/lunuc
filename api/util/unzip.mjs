import zlib from 'zlib'

// Max size of an incoming gzip body AFTER decompression. Protects against
// decompression bombs (a tiny gzip payload that inflates to gigabytes).
// Generous enough for large CMS templates but bounded.
const MAX_INFLATED_BODY_BYTES = 200 * 1024 * 1024 // 200 MB

/**
 * Express middleware: transparently decompress gzip-encoded request bodies.
 *
 * The browser client (finalFetch) compresses large GraphQL payloads with
 * CompressionStream('gzip') and sets `Content-Encoding: gzip`. body-parser
 * does NOT understand request-side Content-Encoding, so without this the
 * compressed bytes would be parsed as raw JSON and fail.
 *
 * This middleware reads the stream, inflates it, parses the JSON itself and
 * assigns `req.body`. It then strips the encoding headers and flags the
 * request so the downstream body-parser is skipped (the stream is already
 * consumed; letting body-parser read it again would hang the request).
 *
 * Only requests with `Content-Encoding: gzip` are touched; everything else
 * (uploads, plain JSON, urlencoded) passes straight through untouched.
 */
export const gunzipJsonBody = (req, res, next) => {
    if (req.headers['content-encoding'] !== 'gzip') {
        return next()
    }

    const chunks = []
    let compressedSize = 0
    let settled = false

    const fail = (status, message, err) => {
        if (settled) return
        settled = true
        if (err) console.error('gunzipJsonBody:', message, '-', err.message)
        else console.warn('gunzipJsonBody:', message)

        if (!res.headersSent) {
            res.writeHead(status, {'content-type': 'application/json'})
            res.end(`{"errors":[{"message":"${message}"}]}`)
        }
        // Always tear down the inbound request. On the error/limit path the
        // client may still be uploading; replying before the body is fully
        // read can corrupt a keep-alive connection, so we destroy it rather
        // than leave a half-read stream behind.
        req.destroy()
    }

    // Collect the compressed bytes, then inflate in one shot with
    // zlib.gunzipSync. We deliberately do NOT use the streaming
    // zlib.createGunzip()/req.pipe(): in this setup the request arrives via the
    // upstream proxy (apiProxy.mjs) and the streaming decompressor never
    // emitted 'data'/'end' for the piped body, so the request hung forever.
    // Reading the stream explicitly and decompressing the assembled buffer is
    // robust regardless of how the request stream was wrapped, and trivial in
    // cost for typical payload sizes (tens of KB).
    req.on('data', (chunk) => {
        compressedSize += chunk.length
        // Guard against an oversized compressed payload before we even inflate.
        // A 10 MB gzip body is already far beyond any legitimate request here.
        if (compressedSize > 10 * 1024 * 1024) {
            fail(413, 'Compressed body too large')
            return
        }
        chunks.push(chunk)
    })

    req.on('end', () => {
        if (settled) return
        try {
            const inflated = zlib.gunzipSync(Buffer.concat(chunks), {
                maxOutputLength: MAX_INFLATED_BODY_BYTES
            })
            const raw = inflated.toString('utf8')
            req.body = raw.length ? JSON.parse(raw) : {}
            // Strip encoding-related headers so any downstream parser sees a
            // plain, already-available JSON body instead of trying to re-read
            // the (now consumed) stream. content-length no longer matches the
            // inflated size, so it must go too.
            delete req.headers['content-encoding']
            delete req.headers['content-length']
            req.headers['content-type'] = 'application/json'

            // Signal to the body-parser wrapper below that parsing is done.
            req._bodyParsed = true

            settled = true
            next()
        } catch (e) {
            // gunzipSync throws on invalid gzip, on JSON.parse failure, and
            // (with a RangeError) when maxOutputLength is exceeded.
            const tooLarge = e instanceof RangeError
            fail(tooLarge ? 413 : 400,
                tooLarge ? 'Decompressed body too large' : 'Invalid gzip or JSON body',
                e)
        }
    })

    // The client can drop the connection mid-upload (slow link, tab closed,
    // navigation). 'aborted' fires without a preceding 'error'; handle both
    // so we clean up and log instead of leaving a half-read request behind.
    req.on('error', (e) => fail(400, 'Request stream error', e))
    req.on('aborted', () => fail(400, 'Request aborted during upload'))
}