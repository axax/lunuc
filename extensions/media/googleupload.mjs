import {Storage} from '@google-cloud/storage'
import fs from 'fs'
import path from 'path'
import config from '../../gensrc/config.mjs'

const {STATIC_PRIVATE_DIR} = config

const staticPrivateDir = path.join(path.resolve(),STATIC_PRIVATE_DIR)


const projectId = 'lunuc-storage'
const keyFilename= `${staticPrivateDir}/firebase.json`
const bucketName = `${projectId}.appspot.com`


const storage = new Storage({
    projectId,
    keyFilename
})


const bucket = storage.bucket(bucketName)

/*
let file = req.file;
  if (file) {
    uploadImageToStorage(file).then((success) => {
      res.status(200).send({
        status: 'success'
      });
    }).catch((error) => {
      console.error(error);
    });
  }
*/


/**
 * Upload the image file to Google Storage
 * @param {File} file object that will be uploaded to Google Storage
 */
export const uploadImageToStorage = ({file}) => {
    return new Promise((resolve) => {
        if (!file) {
            resolve({error:'No image file'})
        }
        let newFileName = `${file.name}_${Date.now()}`

        let fileUpload = bucket.file(newFileName)

        const blobStream = fileUpload.createWriteStream({
            metadata: {
                contentType: file.type
            }
        })

        blobStream.on('error', (error) => {
            console.log(error)
            resolve({error:`Error uploading file ${error.message}`})
        })

        blobStream.on('finish', () => {
            // The public URL can be used to directly access the file via HTTP.
            const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${newFileName}?alt=media`

            resolve({url})
        })
        blobStream.end(fs.readFileSync(file.path))
    })
}
