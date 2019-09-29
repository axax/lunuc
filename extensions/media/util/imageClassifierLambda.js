var AWS = require('aws-sdk/index');

AWS.config.region = 'us-east-1'

// you shouldn't hardcode your keys in production! See http://docs.aws.amazon.com/AWSJavaScriptSDK/guide/node-configuring.html
AWS.config.update({accessKeyId: process.env.AWS_KEY, secretAccessKey: process.env.AWS_SECRET});


const ImageClassifier = {


    classifyByUrl: (url) => {

        return new Promise((resolve, reject) => {

                var lambda = new AWS.Lambda();
                var params = {
                    FunctionName: 'imageClassifier',
                    Payload: `{"options": {"url": "${url}"}}`
                }

                lambda.invoke(params, function (err, data) {
                    if (err) {
                        console.log(err)
                        reject(err) // an error occurred
                    } else {
                        resolve(JSON.parse(data.Payload))           // successful response
                    }
                })

            }
        )
    }
}


export default ImageClassifier
