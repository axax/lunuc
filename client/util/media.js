import React from 'react'
import config from 'gen/config-client'

const {UPLOAD_URL} = config

const getImageSrc = (item, size = 'thumbnail') => {

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


export {getImageSrc,isValidImage,getImageTag}
