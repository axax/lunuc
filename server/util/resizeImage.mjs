import sharp from 'sharp'
import {heicConvert} from './heicConvert.mjs'
import MimeType from '../../util/mime.mjs'
import fs from 'fs'
import path from 'path'
import {parseOrElse} from "../../client/util/json.mjs";

const DEFAULT_FORMAT = 'jpeg'


export const resizeImage = async (parsedUrl, req, filename) => {
    let mimeType, exists = false
    // resize image file
    if (parsedUrl &&
        (parsedUrl.query.width || parsedUrl.query.height || parsedUrl.query.format || parsedUrl.query.flip || parsedUrl.query.flop ||
        parsedUrl.query.removebg)) {

        const width = parseInt(parsedUrl.query.width),
            height = parseInt(parsedUrl.query.height),
            fit = parsedUrl.query.fit,
            bg = parsedUrl.query.bg,
            flip = parsedUrl.query.flip,
            flop = parsedUrl.query.flop,
            position = parsedUrl.query.position,
            withoutEnlargement = parsedUrl.query.noenlarge,
            density = parsedUrl.query.density,
            removeBg = parsedUrl.query.removebg

        let format = parsedUrl.query.format
        if (format === 'webp' && req.headers['accept'] && req.headers['accept'].indexOf('image/webp') < 0) {
            format = ''
        }

        if (!isNaN(width) || !isNaN(height) || format || flip || flop || removeBg) {

            const resizeOptions = {fit: fit || sharp.fit.cover, background: bg || {r: 0, g: 0, b: 0, alpha: 0}}
            if (!isNaN(width)) {
                resizeOptions.width = width
            }
            if (position) {
                resizeOptions.position = position
            }

            if (withoutEnlargement) {
                resizeOptions.withoutEnlargement = withoutEnlargement == 'true'
            }

            if (!isNaN(height)) {
                resizeOptions.height = height
            }

            let quality = parseInt(parsedUrl.query.quality)
            if (isNaN(quality)) {
                quality = 80
            }

            let ext = path.extname(parsedUrl.pathname).toLowerCase()
            if (!format) {
                if (ext === '.svg') {
                    // convert svg to png by default
                    format = 'png'
                }else if(ext){
                    format = ext.substring(1)
                }else{
                    format = DEFAULT_FORMAT
                }
            }

            let modfilename = `${filename}@${width}x${height}-${quality}${fit ? '-' + fit : ''}${position ? '-' + position : ''}${format ? '-' + format : ''}${flip ? '-flip' : ''}${flop ? '-flop' : ''}${withoutEnlargement ? '-noenlarge' : ''}${bg ? '-' + bg : ''}${density?'-'+density:''}${removeBg?'-'+removeBg:''}`

            mimeType = MimeType.detectByExtension(format)
            exists = true

            if (!fs.existsSync(modfilename) || parsedUrl.query.force === 'true') {
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
                    if(!isNaN(density)){
                        sharpOptions.density = parseInt(density)
                    }

                    let pipeline = await sharp(filename, sharpOptions)
                    pipeline = await removeBackgroundIfNeeded(removeBg, pipeline)


                    let resizedFile = pipeline.resize(resizeOptions)/*.withMetadata()*/

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
                    console.error(e)
                    if(fs.existsSync(modfilename)) {
                        fs.unlinkSync(modfilename)
                    }
                }
            } else {
                filename = modfilename
            }
        }
    }
    return {filename, exists, mimeType}
}



async function removeBackgroundIfNeeded(removeBg, pipeline) {

    if (removeBg) {
        const removeBgOptions = {tolerance:50,...parseOrElse(removeBg, {})}

        if(removeBgOptions.tolerance>0) {
            // Remove a solid background color (commonly white), set those pixels as transparent
            const {data, info} = await pipeline.ensureAlpha().raw().toBuffer({resolveWithObject: true});

            const backgroundColor = detectBackgroundColor(data, info); // background color to remove

            // Convert background color to transparency
            const pixels = Buffer.from(data);
            for (let i = 0; i < pixels.length; i += 4) {
                const rgb = [data[i], data[i + 1], data[i + 2]];
                if (colorDistance(rgb, backgroundColor) < removeBgOptions.tolerance) {
                    pixels[i + 3] = 0;        // Alpha: fully transparent
                }
            }

            pipeline = sharp(pixels, {
                raw: info
            })
        }
    }
    return pipeline
}

function detectBackgroundColor(data, info) {

    const { width, height, channels } = info;
    let rTotal = 0, gTotal = 0, bTotal = 0, count = 0;

    // Sample border pixels
    for (let y = 0; y < height; y++) {
        for (let x of [0, width - 1]) { // left and right columns
            const idx = (y * width + x) * channels;
            rTotal += data[idx];
            gTotal += data[idx + 1];
            bTotal += data[idx + 2];
            count++;
        }
    }
    for (let x = 0; x < width; x++) {
        for (let y of [0, height - 1]) { // top and bottom rows
            const idx = (y * width + x) * channels;
            rTotal += data[idx];
            gTotal += data[idx + 1];
            bTotal += data[idx + 2];
            count++;
        }
    }

    // Calculate average
    return {
        r: Math.round(rTotal / count),
        g: Math.round(gTotal / count),
        b: Math.round(bTotal / count)
    }
}


function colorDistance(p, bg) {
    return Math.sqrt(
        Math.pow(p[0] - bg.r, 2) +
        Math.pow(p[1] - bg.g, 2) +
        Math.pow(p[2] - bg.b, 2)
    )
}
