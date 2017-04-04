var devMode = process.env.NODE_ENV !== 'production'

var path = require('path')
var webpack = require('webpack')


var config = {
	entry: './src/index.js',
	output: {
		path: path.resolve(__dirname, 'build'),
		filename: 'bundle.js'
	},
	module: {
		loaders: [
			{
				test: /\.js$/,
				loader: 'babel-loader',
				exclude: /node_modules/,
				query: {
					presets: ['es2015', 'react', 'stage-0']
				}
			}
		]
	},
	plugins: []
}

/**
 *  Developer / Debug Config
 */
if (devMode) {
	console.log('Build for developing')

	config.devServer = {
		inline: true,
		hot: true,
		port: 3000,
		host: '127.0.0.1',
		proxy: {
			'/graphql': {target: 'http://127.0.0.1:8080'}
		}
	}

	/* For Debugging porpuses */
	config.devtool = 'eval'

	config.plugins.push(new webpack.HotModuleReplacementPlugin())

} else {
	console.log('Build for production')

	config.devtool = 'source-map'
}


module.exports = config
/* --port 8080 --hot --host 0.0.0.0 --content-base . */