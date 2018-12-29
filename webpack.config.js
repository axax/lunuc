const path = require('path')
const fs = require('fs');
const glob = require('glob')
const merge = require("merge")
const webpack = require('webpack')

// webpack plugins
const UglifyJSPlugin = require('uglifyjs-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CompressionPlugin = require("compression-webpack-plugin")
const GenSourceCode = require('./webpack.gensrc')
const WebpackI18nPlugin = require("./webpack.i18n");


const DEV_MODE = process.env.NODE_ENV !== 'production' && process.argv.indexOf('-p') === -1


/*---------------------------------------------------
 Define which directories are included from the build based on the config file
  ---------------------------------------------------*/


const EXCLUDE_FROM_BUILD = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, 'test'),
    path.resolve(__dirname, 'server'),
    path.resolve(__dirname, 'build'),
    path.resolve(__dirname, 'extensions'),
    path.resolve(__dirname, 'client/components/ui'),
    path.resolve(__dirname, './api')]

const INCLUDE_IN_BUILD = []

const APP_CONFIG = require('./buildconfig.json')

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


const config = {
    entry: './client/index.js',
    target: 'web',
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].bundle.js',
        chunkFilename: '[name].bundle.js',
        publicPath: '/'
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
                test: /\.global\.css$/,
                exclude: excludeFunction,
                use: [
                    MiniCssExtractPlugin.loader,
                    "css-loader"
                ]
            },
            {
                test: /^(?:(?!\.global).)*\.css$/,
                use: ['style-loader','css-loader']
            },
            {
                test: /\.global\.less$/,
                exclude: excludeFunction,
                use: [
                    MiniCssExtractPlugin.loader,
                    "css-loader",
                    "less-loader"
                ]
            },
            {
                test: /^(?:(?!\.global).)*\.less$/,
                use: ['style-loader','css-loader', 'less-loader']
            }
        ]
    },
    plugins: [
        new GenSourceCode(), /* Generate some source code based on the buildconfig.json file */
        new MiniCssExtractPlugin({
            filename: 'style.css',
            allChunks: true
        }), /* Extract css from bundle */
        new WebpackI18nPlugin({
            src: './**/*.tr.json',
            dest: '[name].js'
        })
    ],
    optimization: {
        minimizer: []
    }
}

/**
 *  Developer / Debug Config
 */
if (DEV_MODE) {
    console.log('Build for developing')
    config.mode = 'development'

    const PORT = (process.env.PORT || 8080)
    const API_PORT = (process.env.API_PORT || 3000)


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
    config.mode = 'production'


    config.plugins.push(
        new CompressionPlugin({
            minRatio: 0.8
        })
    )

    const CopyWebpackPlugin = require('copy-webpack-plugin')
    config.plugins.push(
        new CopyWebpackPlugin([
            {from: 'serviceworker.js', to: 'serviceworker.js'},
            {from: 'manifest.json', to: 'manifest.json'},
            {from: 'favicon.ico', to: 'favicon.ico'}
        ])
    )


    config.optimization.minimizer.push(
            new UglifyJSPlugin({
                uglifyOptions: {
                    compress: {
                        drop_console: true
                    }
                }
            }))

    const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
     config.plugins.push(new BundleAnalyzerPlugin())

    //config.devtool = 'source-map'
}

module.exports = config


/* --port 8080 --hot --host 0.0.0.0 --content-base . */