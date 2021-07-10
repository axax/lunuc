import https from 'https'
import http from 'http'

export const request = (options) => {

    const finalOptions = Object.assign({timeout: 5000}, options)

    let httpx = https
    if (finalOptions.url) {
        const parsedUrl = new URL(finalOptions.url)

        finalOptions.hostname = parsedUrl.host
        finalOptions.protocol = parsedUrl.protocol
        finalOptions.port = parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80)
        finalOptions.path = parsedUrl.pathname + parsedUrl.search

        if (parsedUrl.protocol === 'http:') {
            httpx = http
        }
    }

    return new Promise((resolve, reject) => {

        const req = httpx.request(finalOptions, res => {

            console.log(finalOptions.url, res.statusCode)
            if(finalOptions.followAllRedirects && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307)) {


                if(res.headers.location.indexOf('/')===0){
                    finalOptions.url = finalOptions.protocol + '//' + finalOptions.hostname + res.headers.location
                }else{
                    finalOptions.url = res.headers.location
                }
                console.log('redirect '+finalOptions.url)

                request(finalOptions).then(resolve).catch(reject)

                return
                //request()

               // return get(res.headers.location, resolve, reject)
            }


            let data = ''

            res.on('data', (chunk) => {
                data += chunk
            });

            res.on('end', () => {
                if(finalOptions.json){
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
console.log(error)
            reject(error)
        })


        if (options.body) {
            req.write(finalOptions.body)
        }
        req.end()

    })
}

export default request
