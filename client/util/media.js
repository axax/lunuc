import React from 'react'
import config from 'gen/config-client'
import {replacePlaceholders} from '../../util/placeholders.mjs'

const {UPLOAD_URL} = config

const getImageSrc = (item, size = 'thumbnail') => {

    if(!item){
        return ''
    }
    if(item.constructor === Array) {
        if(item.length>0){
            item = item[0]
        }else{
            item = ''
        }
    }

    let src = item.constructor === String ? item : item.src ? item.src : UPLOAD_URL + '/' + item._id + (item.name ? '/' + config.PRETTYURL_SEPERATOR + '/' + item.name : '')

    if(size && (!item.mimeType || item.mimeType.indexOf('svg')<0)) {
        if(size=='thumbnail') {
            src += '?format=webp&quality=65&width=96'
        }else if(size=='avatar'){
            src += '?format=webp&quality=65&width=48&height=48'
        }
    }

    return src
}

const isValidImage = (item, type) => {
    return item && (item.__typename === 'Media' || type==='Media') && item.mimeType && item.mimeType.indexOf('image') === 0
}

const getImageTag = (item, {size,...props}) => {
    return <img src={getImageSrc(item,size)} {...props}/>
}


// media server behind DynDNS: the api simple/proxy resolves the host (KeyValueGlobal DynDNSService)
const MEDIA_HOST_REGEX = /^https?:\/\/stinkis\.lunuc\.com:900[12]/

// media with an external source (src is an absolute url, e.g. http://stinkis.lunuc.com:9001/${name})
const isExternalMedia = (item) => !!(item && item.src && /^https?:\/\//i.test(item.src))

// url to play / show the original file: placeholders in src resolved, media server through the proxy
const getMediaPlaybackSrc = (item) => {
    const src = replacePlaceholders(getImageSrc(item, null), item)
    return MEDIA_HOST_REGEX.test(src) ? `/lunucapi/simple/proxy/-/${src}` : src
}

export {getImageSrc,isValidImage,getImageTag,isExternalMedia,getMediaPlaybackSrc}
