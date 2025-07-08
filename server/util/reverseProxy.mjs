import http from 'http'
import https from 'https'
import http2 from 'http2'
import {HOSTRULE_HEADER} from '../../api/constants/index.mjs'



export function isUrlValidForPorxing(urlPathname, hostrule) {
    if(hostrule.reverseProxy){
        if(hostrule.reverseProxy.exceptions){
            for(const exception of hostrule.reverseProxy.exceptions){
                const regex = new RegExp(exception)
                if (regex.test(urlPathname)) {
                    // URL matches an exception pattern, skip validation
                    return false
                }
            }
        }
        return true
    }
    return false
}

export async function actAsReverseProxy(req, res, { parsedUrl, hostrule, host }) {
    const isHttps = hostrule.reverseProxy.ssl === false ? false : req.isHttps

    // Remove HTTP/2 pseudo-headers if present
    const filteredHeaders = Object.fromEntries(
        Object.entries(req.headers).filter(
            ([name]) => name && !name.startsWith(':')
        )
    )
    filteredHeaders[HOSTRULE_HEADER] = host

    if(isHttps) {
        // HTTP/2 requires special pseudo-headers
        const http2Headers = {
            ':method': req.method || 'GET',
            ':path': req.url,
            ':authority': hostrule.reverseProxy.ip + ':' + (parsedUrl.port || '8080'),
            ':scheme': isHttps ? 'https' : 'http',
            ...filteredHeaders
        }

        // Try HTTP/2 first
        try {
            const session = http2.connect(
                `${isHttps ? 'https' : 'http'}://${hostrule.reverseProxy.ip}:${parsedUrl.port || '8080'}`,
                {rejectUnauthorized: false}
            );

            session.on('error', err => {
                throw err; // Fallback to HTTP/1.1
            });

            const proxyReq = session.request(http2Headers);

            proxyReq.on('response', (headers, flags) => {
                // Convert HTTP/2 headers to HTTP/1.1
                const status = headers[':status'] || 502;
                const respHeaders = {};
                for (const [key, value] of Object.entries(headers)) {
                    if (!key.startsWith(':')) respHeaders[key] = value;
                }
                res.writeHead(status, respHeaders);
            });

            proxyReq.on('data', chunk => res.write(chunk));
            proxyReq.on('end', () => {
                res.end();
                session.close();
            });

            proxyReq.on('error', err => {
                console.log('Proxy error', err);
                res.writeHead(502);
                res.end('Proxy error');
                session.close();
            });

            req.pipe(proxyReq);
            return;
        } catch (error) {
            console.log('HTTP/2 failed, falling back to HTTP/1.1', error);
            // Fallback to HTTP/1.1/HTTPS below
        }
    }

    // Fallback to HTTP/1.1 or HTTPS
    const options = {
        hostname: hostrule.reverseProxy.ip,
        port: parsedUrl.port || '8080',
        path: req.url,
        method: req.method || 'GET',
        headers: filteredHeaders,
        rejectUnauthorized: false
    };

    const proxyReq = (isHttps ? https : http).request(options, proxyRes => {
        res.writeHead(proxyRes.statusCode || proxyRes[':status'], proxyRes.headers)
        if (proxyRes.pipe) {
            proxyRes.pipe(res, {end: true})
        } else {
            proxyRes.on('data', chunk => res.write(chunk))
            proxyRes.on('end', () => res.end())
        }
    })

    req.pipe(proxyReq, { end: true });

    proxyReq.on('error', err => {
        console.log('Proxy error', err);
        res.writeHead(502);
        res.end('Proxy error');
    });
}