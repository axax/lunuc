
const mobilenet = require('@tensorflow-models/mobilenet')
const tf = require('@tensorflow/tfjs-node')
const fs = require('fs');
const jpeg = require('jpeg-js')
const request = require('request')

const NUMBER_OF_CHANNELS = 3

const readImageFromFile = path => {
    const buf = fs.readFileSync(path)
    return decodeImageBuffer(buf)
}

const imageByteArray = (image, numChannels) => {
    const pixels = image.data
    const numPixels = image.width * image.height;
    const values = new Int32Array(numPixels * numChannels);

    for (let i = 0; i < numPixels; i++) {
        for (let channel = 0; channel < numChannels; ++channel) {
            values[i * numChannels + channel] = pixels[i * 4 + channel];
        }
    }

    return values
}

const imageToInput = (image, numChannels) => {
    const values = imageByteArray(image, numChannels)
    const outShape = [image.height, image.width, numChannels];
    const input = tf.tensor3d(values, outShape, 'int32');

    return input
}


let cachedModel = false
const loadModel = () => {
    console.log('load model')

    return new Promise((resolve, reject) => {

        if( cachedModel ){
            resolve(cachedModel)
        }else{
            mobilenet.load(2.0,1.0 ).then(model => {
                //cache model
                cachedModel = model
                resolve(model)

            }).catch(reject)
        }
    })
}


const decodeImageBuffer = (buf) => {
    return jpeg.decode(buf, true)
}


//classify('/Users/simonscharer/IMG_0966.JPG');

const ImageClassifier = {


    classifyByUrl: (url) => {

        return new Promise((resolve, reject) => {
            console.log(`Requesting image from url ${url}`)
            request({url, method: 'get', encoding: null}, (error, response, body) => {

                if (error) {
                    console.error('error:', error)
                    reject(error)
                } else {
                    console.log('Response: StatusCode:', response && response.statusCode)
                    console.log('Response: Body: Length: %d. Is buffer: %s', body.length, (body instanceof Buffer))
                    loadModel().then(model => {


                        const image = decodeImageBuffer(body)
                        const input = imageToInput(image, NUMBER_OF_CHANNELS)


                        // Classify the image.
                        model.classify(input).then(predictions => {
                            console.log('Predictions: ');
                            console.log(predictions);
                            resolve(predictions)
                        }).catch(reject)

                    }).catch(reject)

                }
            })
        })
    }
}


export default ImageClassifier
