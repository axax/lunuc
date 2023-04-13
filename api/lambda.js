import { Lambda } from '@aws-sdk/client-lambda'


const lambda = new Lambda({
	credentials: {
		accessKeyId: process.env.AWS_KEY,
		secretAccessKey: process.env.AWS_SECRET
	},
	region: 'us-east-1' })

exports.handler = function(event, context) {
	const params = {
		FunctionName: 'Lambda_TEST', // the lambda function we are going to invoke
		InvocationType: 'RequestResponse',
		LogType: 'Tail',
		Payload: '{ "name" : "Arpit" }'
	}


	lambda.invoke(params, function(err, data) {
		if (err) {
			context.fail(err)
		} else {
			context.succeed('Lambda_TEST said '+ data.Payload)
		}
	})
};