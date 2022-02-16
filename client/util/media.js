import React from 'react'
import config from 'gen/config-client'

const {UPLOAD_URL} = config

const getImageSrc = (item) => {
    return item.src ? item.src : UPLOAD_URL + '/' + item._id + (item.name ? '/' + config.PRETTYURL_SEPERATOR + '/' + item.name : '')
}

const isValidImage = (item) => {
    return item && item.__typename === 'Media' && item.mimeType && item.mimeType.indexOf('image') === 0
}

const getImageTag = (item, props) => {
    return <img src={getImageSrc(item)} {...props}/>
}


export {getImageSrc,isValidImage,getImageTag}
