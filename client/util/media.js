import React from 'react'
import config from 'gen/config-client'

const {UPLOAD_URL} = config

const getImageSrc = (item, size = 'thumbnail') => {
    let src = item.src ? item.src : UPLOAD_URL + '/' + item._id + (item.name ? '/' + config.PRETTYURL_SEPERATOR + '/' + item.name : '')

    if(size && (!item.mimeType || item.mimeType.indexOf('svg')<0)) {
        if(size=='thumbnail') {
            src += '?webp=true&quality=65&width=96'
        }else if(size=='avatar'){
            src += '?webp=true&quality=65&width=48&height=48'
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


export {getImageSrc,isValidImage,getImageTag}
