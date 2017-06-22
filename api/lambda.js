import AWS from 'aws-sdk'


AWS.config.region = 'us-east-1'
var lambda = new AWS.Lambda()

exports.handler = function(event, context) {
	var params = {
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