import fs from 'fs'
import {sendFileFromDir} from './file.mjs'
import ffmpeg from 'fluent-ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import {getDynamicConfig} from '../../util/config.mjs'
import path from 'path'

const config = getDynamicConfig()

const ROOT_DIR = path.resolve(),
    SERVER_DIR = path.join(ROOT_DIR, './server'),
    ABS_UPLOAD_DIR = path.join(ROOT_DIR, config.UPLOAD_DIR)

const noCacheHeaders = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: 0
}

export const transcodeVideoOptions = (parsedUrl, filename) => {

    if (!parsedUrl || !parsedUrl.query.transcode) {
        return false
    }

    //http://localhost:8080/240.1824.mp4?ext=mp4&transcode={"audioQuality":3,"videoBitrate":800,"fps":25,"size":"720x?","crf":28}
    //https://www.lunuc.com/uploads/5f676c358ebac32c662cdb02/-/La%20maison%20du%20bonheur-2006.mp4?ext=mp4&transcode={%22audioQuality%22:3,%22videoBitrate%22:800,%22fps%22:25,%22size%22:%22720x?%22,%22crf%22:28}
    // default options
    let options = {
        noAudio: false,
        /*"audioVolume": 1,*/
        /*"audioQuality": 0,*/
        /*"fps": 24,*/
        /*"size": "720x?",*/
        crf: 22,
        /*"speed": 1,*/
        /*"preset": "slow",*/
        keep: false,
        format: 'mp4',
        hvc1: false, /* for libx265 */
        audioBitrate: '160k',
        /*videoFilters: ['format=yuv420p']*/
    }

    try {
        Object.assign(options, JSON.parse(parsedUrl.query.transcode))
    } catch (e) {
        console.log(e)
        return false
    }

    let modfilename = filename

    let filnameObject
    if(options.screenshot){
        modfilename += '-videoframe'
        if(options.screenshot.constructor!==Object){
            options.screenshot = {time: options.screenshot }
        }
        filnameObject = options.screenshot
    }else {
        filnameObject = options
    }

    Object.keys(filnameObject).forEach(k => {
        if (k !== 'keep') {
            const value = String(filnameObject[k].constructor === Array ? filnameObject[k].join('') : filnameObject[k])
            modfilename += `-${value.replace(/[^a-zA-Z0-9-_\.]/g, '')}`
        }
    })

    options.filename = modfilename

    options.exists = fs.existsSync(modfilename)

    return options
}

export const transcodeAndStreamVideo = async ({options, headers, req, res, filename}) => {
    // make sure ffmpeg is install on your device
    // brew install ffmpeg
    //sudo apt install ffmpeg
    // http://localhost:8080/uploads/5f935f98f5ca78b7cbeaa853/-/test.mpg?ext=mp4&transcode={"audioQuality":2,"fps":24,"size":"720x?","crf":24,"keep":true,"nostream":true}

    delete headers['Content-Length']
    delete headers.ETag
    delete headers['Cache-Control']

    if(options.keep && !options.nostream && fs.existsSync(options.filename+ '.temp'))
    {
        await sendFileFromDir(req,res,{filename: SERVER_DIR+'/loading.mp4',headers:{...headers,...noCacheHeaders}})
        return true
    }

    ffmpeg.setFfprobePath(ffprobeInstaller.path)
    ffmpeg.setFfmpegPath( ffmpegInstaller.path)

    const video = ffmpeg(filename)

    if(options.screenshot){
        video.on('filenames', (filenames) => {
            console.log('Will generate ' + filenames.join(', '))
        }).on('end', function() {
            console.log('Screenshots taken')
            fs.rename(options.filename + '.png', options.filename, async () => {
                console.log('transcode ended and file saved as ' + options.filename)
                await sendFileFromDir(req,res,{filename:options.filename, headers})
            })
        }).screenshots({
            // Will take screens at 20%, 40%, 60% and 80% of the video
            timestamps: [options.screenshot.time],
            size: options.screenshot.size || '320x240',
            count: 1,
            folder: ABS_UPLOAD_DIR,
            filename:options.filename.replace(/^.*[\\\/]/, '')
        })
        return true
    }


    const outputOptions = []

    if (!options.nostream) {
        outputOptions.push('-movflags frag_keyframe+empty_moov+faststart')
        outputOptions.push('-frag_duration 3600')
    }
    if (options.crf) {
        outputOptions.push('-crf ' + options.crf)
    }
    if (options.preset) {
        outputOptions.push('-preset ' + options.preset)
    }

    if (options.pass) {
        outputOptions.push('-pass ' + options.pass)
    }
    if (options.duration) {
        outputOptions.push('-t ' + options.duration)
    }
    if (options.hvc1) {
        outputOptions.push('-tag:v hvc1')
    }
    if (options.custom) {
        outputOptions.push(...options.custom)
    }

    const inputOptions = [
        '-probesize 100M',
        '-analyzeduration 100M'
    ]

    if (options.inputOptions) {
        inputOptions.push(options.inputOptions)
    }

    video.inputOptions(inputOptions)

    if (options.noAudio) {
        console.log('no audio was set')
        video.noAudio()
    } else {
        const aFilter = []

        if (options.audioVolume) {
            aFilter.push('volume=' + options.audioVolume)
        }
        if (options.speed) {
            aFilter.push('atempo=' + options.speed)
        }

        video.audioCodec('aac').audioFilters(aFilter)//.audioBitrate(options.audioBitrate || '160k')

        if (options.audioQuality) {
            video.audioQuality(options.audioQuality)
        }

    }

    const vFilter = []

    if (options.speed) {
        vFilter.push(`setpts=${1 / options.speed}*PTS`)
    }
    //vFilter.push(`scale=iw*min(1,min(640/iw,360/ih)):-1`)
    if(options.videoFilters){
        vFilter.push(...options.videoFilters)
    }

    video.videoCodec(options.codec || 'libx264')
        .videoFilter(vFilter)
        .outputOptions(outputOptions)
        .format(options.format)

    if (options.videoBitrate) {
        video.videoBitrate(options.videoBitrate)
    }
    if (options.fps) {
        video.fps(options.fps)
    }
    if (options.size) {
        video.size(options.size)
    }


    video.on('progress', (progress) => {
        console.log('Processing: ' + progress.timemark + ' done')
    }).on('start', console.log).on('end', () => {

        if (options.keep) {
            // rename
            fs.rename(options.filename + '.temp', options.filename, () => {
                console.log('transcode ended and file saved as ' + options.filename)
            })

        }
        console.log(`transcode ended: ${filename}`)

    }).on('error', (e)=>{
        //console.error('video error',e)
        if(options.keep) {
            try {
                fs.unlinkSync(options.filename+ '.temp')
            } catch (e2) {
                console.log(e2)
            }
        }
    })


    if (options.keep) {

        console.log(`save video as ${options.filename}`)
        video.output(options.filename+ '.temp').run()
        /*const videoDummy = ffmpeg(SERVER_DIR+'/loading.mp4')
        res.writeHead(200, {'Content-Type': 'video/mp4', 'Connection': 'keep-alive'});
        videoDummy.size('640x?')
            .inputOptions([
                '-probesize 100M',
                '-analyzeduration 100M'
            ])
            .outputOptions([
                '-preset ultrafast',
                '-crf 35',
                '-movflags frag_keyframe+empty_moov+faststart',
                '-frag_duration 3600'
            ])
            .videoFilter([
                {filter: 'drawtext',
                    options: {
                    fontfile: '/Users/simonscharer/Downloads/open-sans/OpenSans-Bold.ttf',
                        text: 'Video wird vorbereitet',
                        fontsize: 40,
                        fontcolor: 'white',
                        x: 250,
                        y: 330
                }},
                { filter: 'scale', options: [640, -1] },
                'fade=in:0:5'
            ]).videoCodec('libx264').noAudio()
            .inputFPS(15).fps(5).format('mp4')
            .pipe(res, {end: true})*/


        await sendFileFromDir(req,res,{filename:SERVER_DIR+'/loading.mp4',headers:{...headers,...noCacheHeaders}})

    } else {
        //headers['Transfer-Encoding'] = 'chunked'
        headers['Accept-Ranges'] = 'bytes'
        res.writeHead(200, headers)
        video.pipe(res, {end: true})
    }

    return true
}

