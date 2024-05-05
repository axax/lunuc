import sharp from 'sharp'
import {heicConvert} from './heicConvert.mjs'
import MimeType from '../../util/mime.mjs'
import fs from 'fs'
import path from 'path'

const DEFAULT_FORMAT = 'jpeg'

export const resizeImage = async (parsedUrl, req, filename) => {
    let mimeType, exists = false
    // resize image file
    if (parsedUrl && (parsedUrl.query.width || parsedUrl.query.height || parsedUrl.query.format || parsedUrl.query.flip || parsedUrl.query.flop)) {
        const width = parseInt(parsedUrl.query.width),
            height = parseInt(parsedUrl.query.height),
            fit = parsedUrl.query.fit,
            bg = parsedUrl.query.bg,
            flip = parsedUrl.query.flip,
            flop = parsedUrl.query.flop,
            position = parsedUrl.query.position,
            withoutEnlargement = parsedUrl.query.noenlarge

        let format = parsedUrl.query.format || DEFAULT_FORMAT
        if (format === 'webp' && req.headers['accept'] && req.headers['accept'].indexOf('image/webp') < 0) {
            format = DEFAULT_FORMAT
        }

        if (!isNaN(width) || !isNaN(height) || format || flip || flop) {

            const resizeOptions = {fit: fit || sharp.fit.cover, background: bg || { r: 0, g: 0, b: 0, alpha: 0 }}
            if (!isNaN(width)) {
                resizeOptions.width = width
            }
            if(position){
                resizeOptions.position = position
            }

            if(withoutEnlargement){
                resizeOptions.withoutEnlargement = withoutEnlargement=='true'
            }

            if (!isNaN(height)) {
                resizeOptions.height = height
            }

            let quality = parseInt(parsedUrl.query.quality)
            if (isNaN(quality)) {
                quality = 80
            }

            let ext = path.extname(parsedUrl.pathname).toLowerCase()
            if(ext==='.svg' && !format){
                // convert svg to png by default
                format = 'png'
            }

            let modfilename = `${filename}@${width}x${height}-${quality}${fit ? '-' + fit : ''}${position ? '-' + position : ''}${format ? '-' + format : ''}${flip ? '-flip' : ''}${flop ? '-flop' : ''}${withoutEnlargement ? '-noenlarge' : ''}${bg ? '-' + bg : ''}`
            if (format) {
                mimeType = MimeType.detectByExtension(format)
            }
            exists = true

            if (!fs.existsSync(modfilename)) {
                console.log(`modify file ${filename} to ${modfilename}`)
                try {

                    if(ext==='.heic'){
                        const heicTarget = `${filename}@${quality}.jpg`
                        if (!fs.existsSync(heicTarget)) {
                            const response = await heicConvert({
                                source: filename,
                                target: heicTarget,
                                quality: quality
                            })
                            if (response.error) {
                                console.warn(response)
                                return {filename, exists, mimeType}
                            }
                        }
                        filename = heicTarget
                    }
                    const sharpOptions = {}
                    if (ext === '.gif') {
                        // might be animated
                        sharpOptions.animated = true
                    }

                    let resizedFile = await sharp(filename, sharpOptions).resize(resizeOptions)/*.withMetadata()*/

                    if (flip) {
                        resizedFile = await resizedFile.flip()
                    }
                    if (flop) {
                        resizedFile = await resizedFile.flop()
                    }


                    if (format === 'webp') {
                        await resizedFile.webp({
                            quality,
                            alphaQuality: quality,
                            lossless: false,
                            force: true
                        }).toFile(modfilename)
                    } else if (format === 'png') {
                        await resizedFile.png({
                            quality,
                            force: true
                        }).toFile(modfilename)
                    } else if (format === 'jpg' || format === 'jpeg') {
                        await resizedFile.jpeg({
                            quality,
                            force: true
                        }).toFile(modfilename)
                    } else {
                        await resizedFile.jpeg({
                            quality,
                            chromaSubsampling: '4:2:0',
                            force: false
                        }).toFile(modfilename)
                    }
                    filename = modfilename
                } catch (e) {
                    fs.unlinkSync(modfilename)
                    console.error(e)
                }
            } else {
                filename = modfilename
            }
        }
    }
    return {filename, exists, mimeType}
}
