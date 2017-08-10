var devMode = process.env.NODE_ENV !== 'production' && process.argv.indexOf('-p') === -1

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


	const PORT = (process.env.PORT || 8080)
	const API_PORT = (process.env.WS_PORT || 3000)

	config.devServer = {
		historyApiFallback: true,
		inline: true,
		hot: true,
		port: PORT,
		host: '0.0.0.0',
		proxy: {
			'/graphql': {target: `http://0.0.0.0:${API_PORT}`},
			'/ws': {
				target: `ws://localhost:${API_PORT}`,
				ws: true
			}
		}
	}

	/* For Debugging porpuses */
	config.devtool = 'eval'

	config.plugins.push(new webpack.HotModuleReplacementPlugin())

} else {
	console.log('Build for production')

	//config.devtool = 'source-map'
}


module.exports = config
/* --port 8080 --hot --host 0.0.0.0 --content-base . */