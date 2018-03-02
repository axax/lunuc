import React from 'react'
import config from 'gen/config'
const {UPLOAD_URL} = config

const getImageSrc = (id,props) => {
    return  UPLOAD_URL + '/' + id
}

export const getImageTag = (id,props) => {
    return  <img src={getImageSrc(id,props)} {...props}/>
}

export {getImageSrc}