import React from 'react'
import config from 'gen/config-client'
const {UPLOAD_URL} = config

const getImageSrc = (item) => {
    return item.src ? item.src : UPLOAD_URL + '/' + item._id
}

export const getImageTag = (item, props) => {
    return <img src={getImageSrc(item)} {...props}/>
}

export {getImageSrc}
