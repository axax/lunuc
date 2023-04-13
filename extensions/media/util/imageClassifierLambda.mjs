import { Lambda } from '@aws-sdk/client-lambda'

const ImageClassifier = {


    classifyByUrl: (url) => {

        return new Promise((resolve, reject) => {

                var lambda = new Lambda({
                    credentials: {
                        accessKeyId: process.env.AWS_KEY,
                        secretAccessKey: process.env.AWS_SECRET
                    },
                    region: 'us-east-1' })
                var params = {
                    FunctionName: 'imageClassifier',
                    Payload: `{"options": {"url": "${url}"}}`
                }

                lambda.invoke(params, function (err, data) {
                    if (err) {
                        console.log(err)
                        reject(err) // an error occurred
                    } else {
                        resolve(JSON.parse(data.Payload))  // successful response
                    }
                })

            }
        );
    }
}


export default ImageClassifier
