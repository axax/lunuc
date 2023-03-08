import https from 'https'
import http from 'http'

export const request = (options) => {

    const finalOptions = Object.assign({timeout: 60000, headers: {}}, options)

    let httpx = https
    if (finalOptions.url) {
        const parsedUrl = new URL(finalOptions.url)

        finalOptions.hostname = parsedUrl.host.split(':')[0]
        finalOptions.protocol = parsedUrl.protocol
        finalOptions.port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80)
        finalOptions.path = parsedUrl.pathname + parsedUrl.search

        if (parsedUrl.protocol === 'http:') {
            httpx = http
        }
    }

    if( finalOptions.body && !finalOptions.headers['Content-Length']) {
        finalOptions.headers['Content-Length'] = Buffer.byteLength(finalOptions.body)
    }

    return new Promise((resolve, reject) => {
        const req = httpx.request(finalOptions, res => {

            if(finalOptions.followAllRedirects && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307)) {


                if(res.headers.location.indexOf('/')===0) {
                    finalOptions.url = finalOptions.protocol + '//' + finalOptions.hostname + res.headers.location
                }else if(res.headers.location.indexOf('//')<0){
                    finalOptions.url = finalOptions.protocol + '//' + finalOptions.hostname + '/'+res.headers.location
                }else{
                    finalOptions.url = res.headers.location
                }
                if(!finalOptions.redirectCount){
                    finalOptions.redirectCount=0
                }
                finalOptions.redirectCount++
                //console.log('redirect '+finalOptions.url)
                if(finalOptions.redirectCount<10) {
                    request(finalOptions).then(resolve).catch(reject)
                }else{
                    reject({message:'too many redirects'})
                }
                return
            }


            let data = ''

            res.on('data', (chunk) => {
                data += chunk
            });

            res.on('end', () => {
                if(finalOptions.raw){
                    res.body = data
                    res.finalUrl = finalOptions.url
                    res.finalRemoteIp = req.socket.remoteAddress
                    resolve(res)
                }else if(finalOptions.json){
                    let json
                    try {
                        json = JSON.parse(data)
                    }catch (e) {
                        json = {}
                    }
                    resolve(json)
                }else {
                    resolve(data)
                }
            })

        }).on('error', error => {
            reject(error)
        })


        if (options.body) {
            req.write(finalOptions.body)
        }
        req.end()

    })
}

export default request
