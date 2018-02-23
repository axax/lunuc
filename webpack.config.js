const path = require('path')
const webpack = require('webpack')
const ExtractTextPlugin = require('extract-text-webpack-plugin')
const JoinPlugin = require("join-webpack-plugin")
const merge = require("merge")

const DEV_MODE = process.env.NODE_ENV !== 'production' && process.argv.indexOf('-p') === -1

const EXCLUDE_FROM_BUILD = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, 'test'),
    path.resolve(__dirname, 'server'),
    path.resolve(__dirname, 'build'),
    path.resolve(__dirname, 'extensions'),
    path.resolve(__dirname, 'client/components/ui'),
    path.resolve(__dirname, './api')]

const INCLUDE_IN_BUILD = []

const APP_CONFIG = require('./config.json')

if (APP_CONFIG.extensions) {
    for (const extensionName in APP_CONFIG.extensions) {
        if (APP_CONFIG.extensions[extensionName].active) {
            INCLUDE_IN_BUILD.push(path.resolve(__dirname, 'extensions/' + extensionName))
        }
    }
}

if (APP_CONFIG.ui) {
    APP_CONFIG.ui.forEach(ui => {
        INCLUDE_IN_BUILD.push(path.resolve(__dirname, 'client/components/ui/impl/' + ui.impl))
    })
}

const excludeFunction = (path) => {

    for (let i = 0; i < EXCLUDE_FROM_BUILD.length; i++) {
        if (path.indexOf(EXCLUDE_FROM_BUILD[i]) === 0) {
            // it belongs to the excluded files

            for (let j = 0; j < INCLUDE_IN_BUILD.length; j++) {
                if (path.indexOf(INCLUDE_IN_BUILD[j]) === 0) {
                    // it is an exception and should be included anyway
                    return false
                }
            }

            return true
        }
    }
    return false
}


const GenSourceCode = require('./webpack.gensrc.js')


const config = {
    entry: './client/index.js',
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].bundle.js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: excludeFunction,
                loader: 'babel-loader',
                query: {
                    presets: ['env', 'react', 'stage-0']
                }
            },
            {
                test: /\.tr\.json$/i,
                exclude: excludeFunction,
                use: [JoinPlugin.loader()],
            }
        ]
    },
    plugins: [
        new JoinPlugin({
            search: './**/*.tr.json',
            join: function(common, addition) {
                return merge.recursive(
                    common ? common : {}, JSON.parse(addition)
                );
            },
            save: function(common) {
                return 'window._app_.tr='+JSON.stringify(common);
            },
            group: '[name]',
            name: '[name].json.js',
        }),
        new GenSourceCode(), /* Generate some source code based on the config.json file */

        /*new webpack.optimize.CommonsChunkPlugin({
         name: 'react',
         minChunks: (m) => /node_modules\/(react)/.test(m.context)
         }),
         new webpack.optimize.CommonsChunkPlugin({
         name: 'draftjs',
         minChunks: (m) => /node_modules\/(draft-js|immutable)/.test(m.context)
         }),*/

        /*new webpack.optimize.CommonsChunkPlugin({
         name: 'vendor',
         minChunks: (m) => /node_modules\/(material-ui)/.test(m.context)
         }),*/
        /*new webpack.optimize.CommonsChunkPlugin({
         name: 'vendor',
         minChunks: (m) => /node_modules/.test(m.context)
         })*/
    ]
}

/**
 *  Developer / Debug Config
 */
if (DEV_MODE) {
    console.log('Build for developing')

    const PORT = (process.env.PORT || 8080)
    const API_PORT = (process.env.API_PORT || 3000)


    config.module.rules.push(
        {
            test: /\.css$/,
            exclude: excludeFunction,
            use: ['style-loader', 'css-loader']
        },
        {
            test: /\.less$/,
            exclude: excludeFunction,
            use: ['style-loader', 'css-loader', 'less-loader']
        }
    )

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


    config.module.rules.push(
        {
            test: /\.css$/,
            exclude: excludeFunction,
            use: ExtractTextPlugin.extract({
                fallback: 'style-loader',
                use: ['css-loader']
            })
        },
        {
            test: /\.less$/,
            exclude: excludeFunction,
            use: ExtractTextPlugin.extract({
                fallback: 'style-loader',
                use: ['css-loader', 'less-loader']
            })
        }
    )

    config.plugins.push(
        new ExtractTextPlugin('style.css'), /* Extract css from bundle */
        new webpack.optimize.ModuleConcatenationPlugin(),
        new webpack.optimize.UglifyJsPlugin({
            compress: {
                warnings: false,
                drop_debugger: true,
                drop_console: true
            }
        }),
        new webpack.optimize.AggressiveMergingPlugin()
    )

    const CopyWebpackPlugin = require('copy-webpack-plugin')
    config.plugins.push(
        new CopyWebpackPlugin([
            {from: 'serviceworker.js', to: 'serviceworker.js'}
        ])
    )

    /*const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
     config.plugins.push(new BundleAnalyzerPlugin())*/

    //config.devtool = 'source-map'
}

module.exports = config


/* --port 8080 --hot --host 0.0.0.0 --content-base . */