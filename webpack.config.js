const path = require('path')
const fs = require('fs')
const glob = require('glob')
const webpack = require('webpack')

// webpack plugins
const UglifyJSPlugin = require('uglifyjs-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CompressionPlugin = require("compression-webpack-plugin")
const GenSourceCode = require('./webpack.gensrc')
const WebpackI18nPlugin = require('./webpack.i18n')

const date = new Date()
const DEV_MODE = process.env.NODE_ENV !== 'production' && process.argv.indexOf('-p') === -1,
    BUILD_NUMBER = `${date.getYear() - 100}${date.getMonth() + 1}${date.getDate()}.${Math.ceil((date - new Date().setHours(0, 0, 0, 0)) / 8641)}`

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
const PACKAGE_JSON = require('./package.json')


const APP_VALUES = {
    DEV_MODE,
    BUILD_NUMBER,
    APP_NAME: PACKAGE_JSON.name,
    APP_VERSION: PACKAGE_JSON.version,
    APP_DESCRIPTION: PACKAGE_JSON.description,
    APP_DESCRIPTION: PACKAGE_JSON.description,
    APP_COLOR: '#2196f3',
    ...APP_CONFIG.options
}

if (process.env.LUNUC_UPLOAD_DIR) {
    APP_VALUES.UPLOAD_DIR = process.env.LUNUC_UPLOAD_DIR
}
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


const replacePlaceholders = (content, path) => {

    const result = new Function('const {' + Object.keys(APP_VALUES).join(',') + '} = this.APP_VALUES;return `' + content + '`').call({APP_VALUES})
    return result
}


const config = {
    entry: ['./client/index.js'],
    target: 'web',
    output: {
        path: path.resolve(__dirname, 'build'),
        filename: '[name].bundle.js?v=' + BUILD_NUMBER,
        chunkFilename: '[name].bundle.js?v=' + BUILD_NUMBER,
        publicPath: '/'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: excludeFunction,
                loader: 'babel-loader'
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
                use: ['style-loader', 'css-loader']
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
                use: ['style-loader', 'css-loader', 'less-loader']
            }
        ]
    },
    plugins: [
        new GenSourceCode(APP_VALUES), /* Generate some source code based on the buildconfig.json file */
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
        usedExports: true,
        /*splitChunks: {
         cacheGroups: {
         style: {
         name: 'style',
         test: (c) => {
         if (c.type === 'css/mini-extract') {
         const path = c._identifier
         //console.log(path.substring(path.lastIndexOf('/')+1))
         return true
         }
         return false
         },
         chunks: 'all',
         enforce: true
         }
         }
         },*/
        minimizer: []
    },/*optimization: {
     // We no not want to minimize our code.
     minimize: false
     }*/
}

const CopyWebpackPlugin = require('copy-webpack-plugin')
config.plugins.push(
    new CopyWebpackPlugin([
        {
            from: 'index.html', to: 'index.html',
            transform: replacePlaceholders
        },
        {
            from: 'index.min.html', to: 'index.min.html',
            transform: replacePlaceholders
        },
        {
            from: 'serviceworker.js', to: 'serviceworker.js',
            transform: replacePlaceholders
        },
        {
            from: 'manifest.json', to: 'manifest.json',
            transform: replacePlaceholders
        },
        {from: 'favicon.ico', to: 'favicon.ico'},
        {from: 'favicon.svg', to: 'favicon.svg'},
        {from: 'favicon-192x192.png', to: 'favicon-192x192.png'},
        {from: 'favicon-512x512.png', to: 'favicon-512x512.png'}
    ])
)

/**
 *  Developer / Debug Config
 */
if (DEV_MODE) {
    console.log('Build for developing')
    config.mode = 'development'

    const PORT = (process.env.PORT || 8080)
    const API_PORT = (process.env.API_PORT || 3000)


    config.devServer = {
        contentBase: [path.join(__dirname, ''), path.join(__dirname, 'static'), path.join(__dirname, APP_VALUES.UPLOAD_DIR)],
        historyApiFallback:  {
            rewrites: [
                {
                    from: /.\/-\/./,
                    to: function(context) {
                        return context.request.url.split('/'+APP_CONFIG.PRETTYURL_SEPERATOR+'/')[0]
                    }
                }
            ]
        },
        inline: true,
        hot: true,
        stats: 'errors-only',
        port: PORT,
        host: '0.0.0.0',
        proxy: {
            '/graphql': {target: `http://0.0.0.0:${API_PORT}`},
            ['/' + APP_VALUES.API_PREFIX]: {target: `http://0.0.0.0:${API_PORT}`},
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
            minRatio: 0.95
        })
    )


    config.optimization.minimizer.push(
        new UglifyJSPlugin({
            uglifyOptions: {
                compress: {
                    drop_console: true
                },
                output: {
                    comments: false,
                    semicolons: true,
                    shebang: true,
                    beautify: false
                }
            }
        }))

    /*config.optimization.minimizer.push(new TerserPlugin({
        terserOptions: {
            extractComments: 'all',
            compress: {
                drop_console: true
            },
            output: {
                comments: false,
                semicolons: true,
                shebang: true,
                beautify: false
            }
        },
    }))*/

    config.resolve = {
        alias: {
            'react': 'preact/compat',
            'react-dom': 'preact/compat'
        },
    }

   /* const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
    config.plugins.push(new BundleAnalyzerPlugin())*/

    //config.devtool = 'source-map'
    config.devtool = 'none'


    //config.devtool = "#eval-source-map"
}

module.exports = config


/* --port 8080 --hot --host 0.0.0.0 --content-base . */
