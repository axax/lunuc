const path = require('path')
const fs = require('fs')
const glob = require('glob')
const webpack = require('webpack')
const zlib = require('zlib')

// webpack plugins
const TerserPlugin = require('terser-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const CompressionPlugin = require("compression-webpack-plugin")
const GenSourceCode = require('./webpack.gensrc')

const date = new Date()
const DEV_MODE = process.env.NODE_ENV !== 'production' && process.argv.indexOf('-p') === -1,
    BUILD_NUMBER = `${date.getYear() - 100}${date.getMonth() + 1}${date.getDate()}.${Math.ceil((date - new Date().setHours(0, 0, 0, 0)) / 8641)}`

/*---------------------------------------------------
 Define which directories are included from the build based on the config file
 ---------------------------------------------------*/


const EXCLUDE_FROM_BUILD = [
    path.resolve(__dirname, 'node_modules'),
    path.resolve(__dirname, 'mongodb_tmp'),
    path.resolve(__dirname, 'test'),
    path.resolve(__dirname, 'server'),
    path.resolve(__dirname, 'build'),
    path.resolve(__dirname, 'extensions'),
    path.resolve(__dirname, 'client/components/ui'),
    path.resolve(__dirname, './api')]

const INCLUDE_IN_BUILD = []

let APP_CONFIG

if (fs.existsSync('/etc/lunuc/buildconfig.json')) {
    APP_CONFIG = require('/etc/lunuc/buildconfig.json')
} else {
    APP_CONFIG = require('./buildconfig.json')
}
const PACKAGE_JSON = require('./package.json')


const APP_VALUES = {
    DEV_MODE,
    BUILD_NUMBER,
    APP_NAME: PACKAGE_JSON.name,
    APP_VERSION: PACKAGE_JSON.version,
    APP_DESCRIPTION: PACKAGE_JSON.description,
    APP_DESCRIPTION: PACKAGE_JSON.description,
    APP_COLOR: '#2196f3',
    HTML_HEAD: '',
    ...APP_CONFIG.options
}

APP_VALUES.UPLOAD_DIR_ABSPATH = path.join(__dirname, APP_VALUES.UPLOAD_DIR)

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


const replacePlaceholders = (content, hostrule) => {

    const result = new Function('const {' + Object.keys(APP_VALUES).join(',') + '} = this.APP_VALUES;return `' + content + '`').call({
        APP_VALUES,
        hostrule
    })
    return result
}
if (fs.existsSync(APP_VALUES.HOSTRULES_ABSPATH)) {
    console.log('Replace hostrules templates')

    fs.readdir(APP_VALUES.HOSTRULES_ABSPATH, function (err, files) {
        if (err) {
            console.error("Could not list the directory.", err)
        }

        files.forEach(function (file, index) {
            // Make one pass and make the file complete
            const hostpath = path.join(APP_VALUES.HOSTRULES_ABSPATH, file)

            let HOSTRULE_JSON = {}
            try {
                HOSTRULE_JSON = require(path.join(APP_VALUES.HOSTRULES_ABSPATH, file + '.json'))
            } catch (e) {
            }

            fs.stat(hostpath, function (error, stat) {
                if (stat.isDirectory()) {
                    fs.readdir(hostpath, function (err, subFiles) {
                        if (err) {
                            console.error("Could not list the directory.", err)
                        }
                        subFiles.forEach(function (file, index) {
                            if (file.endsWith('.template')) {
                                fs.readFile(path.join(hostpath, file), 'utf8', function (err, contents) {
                                    fs.writeFile(path.join(hostpath, file.substring(0, file.length - 9)), replacePlaceholders(contents, HOSTRULE_JSON), function (err) {
                                        if (err) {
                                            console.error("Error writing to file " + file, err)
                                        }
                                    })
                                })
                            }
                        })
                    })
                }
            })
        })
    })
}

const config = {
    entry: ['./client/index.js'],
    target: ['web', 'es5'],
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
                /*resolve: {
                    fullySpecified: false
                },*/
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
        {
            apply: (compiler) => {
                compiler.hooks.thisCompilation.tap('Replace', (compilation) => {
                    compilation.hooks.processAssets.tap(
                        {
                            name: 'Replace',
                            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
                        },
                        () => {
                            // get the file main.js
                            const key = 'main.bundle.js?v=' + BUILD_NUMBER

                            const file = compilation.getAsset(key)

                            let content = file.source.source()

                            content = content.replace(/new Error\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/g, 'new Error()')
                            content = content.replace(/new URIError\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/g, 'new URIError()')
                            content = content.replace(/new TypeError\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/g, 'new TypeError()')
                            content = content.replace(/new ReferenceError\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/g, 'new ReferenceError()')
                            content = content.replace(/throw E\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/g, 'throw E()')
                            content = content.replace(/throw Error\((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*\)/g, 'throw Error()')
                            // update main.js with new content
                            compilation.updateAsset(
                                key,
                                new webpack.sources.RawSource(content)
                            )
                        }
                    )
                })
            }
        },
        new GenSourceCode(APP_VALUES), /* Generate some source code based on the buildconfig.json file */
        new MiniCssExtractPlugin({
            filename: 'style.css'
        }) /* Extract css from bundle */
    ],
    optimization: {
        usedExports: true,
        minimizer: []
    }
}

const CopyWebpackPlugin = require('copy-webpack-plugin')
config.plugins.push(
    new CopyWebpackPlugin({
        patterns:
            [
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
            ]
    })
)

/**
 *  Developer / Debug Config
 */
if (DEV_MODE) {
    console.log('Build for developing')
    config.mode = 'development'

    const PORT = (process.env.PORT || 8080)
    const API_PORT = (process.env.API_PORT || 3000)

   // config.plugins.push(new webpack.HotModuleReplacementPlugin())

    config.devServer = {
        /*contentBase: [path.join(__dirname, ''), path.join(__dirname, 'static'), path.join(__dirname, APP_VALUES.UPLOAD_DIR)],*/
        static: [
            {
                directory: path.resolve(__dirname, 'static'),
                publicPath: '/'
            },
            {
                directory: path.resolve(__dirname, APP_VALUES.UPLOAD_DIR),
                publicPath: '/'
            }
        ],
        historyApiFallback: {
            rewrites: [
                {
                    from: /.*\/-\/.*/,
                    to: function (context) {
                        const url = context.request.url, match = '/' + APP_CONFIG.options.PRETTYURL_SEPERATOR + '/'
                        if (url.indexOf(match) > -1) {
                            if (url.indexOf(APP_VALUES.UPLOAD_DIR) === 0) {
                                return url.split(match)[0]
                            }
                            return '/'
                        }
                        return context.request.url
                    }
                }
            ]
        },
        /*inline: true,*/
        hot: false,
        port: PORT,
        host: '0.0.0.0',
        proxy: {
            '/graphql': {target: `http://0.0.0.0:${API_PORT}`},
            ['/' + APP_VALUES.API_PREFIX]: {target: `http://0.0.0.0:${API_PORT}`},
            '/lunucws': {
                target: `ws://0.0.0.0:${API_PORT}`,
                ws: true
            }
        },
        client: {
            logging: 'info'
        },
        liveReload:true,
        watchFiles: {
            paths: ['client/**/*'],
            options: {
                usePolling: false,
            },
        },
        devMiddleware: {

            publicPath: '/',
            stats: 'errors-only'

        }
    }

    config.resolve = {
        alias: {
            'react': 'preact/compat',
            'react-dom': 'preact/compat'
        },
    }

    config.devtool = 'inline-source-map'

} else {
    console.log('Build for production')
    config.mode = 'production'

    config.plugins.push(
        new CompressionPlugin({
            minRatio: 0.95
        }),
        new CompressionPlugin({
            filename: '[path][base].br[query]',
            algorithm: 'brotliCompress',
            compressionOptions: {
                params: {
                    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
                },
            },
            threshold: 10240,
            minRatio: 0.95,
        })
    )


    const terserOptions = {
        extractComments: {
            condition: false,
            banner: () => {
                return ''
            }
        },
        terserOptions: {
            ecma: undefined,
            parse: {},
            module: true,
            mangle: {},
            compress: {
                booleans_as_integers: false,
                drop_console: true,
                pure_getters: true, /* 1kb */
                unsafe: false,
                passes: 2,
                arguments: true, /* 50 bytes */
                //unsafe: true /* 80 Bytes */
                //toplevel: true /* 10 bytes */
                //arguments: true /* 50 bytes */
                //unsafe_proto:true /* 20 bytes */
                //booleans_as_integers:true, /* 200 bytes */
                //unsafe_Function: true /* 10 Bytes */
                //unsafe_proto:true /* 10 Bytes */
            },
            format: {
                comments: false
            }
        }
    }
    config.optimization.minimize = true
    config.optimization.minimizer.push(
        new TerserPlugin(terserOptions)
    )

    config.resolve = {
        alias: {
            'react': 'preact/compat',
            'react-dom': 'preact/compat'
        },
    }

    /*const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin
    config.plugins.push(new BundleAnalyzerPlugin())*/

}

module.exports = config


/* --port 8080 --hot --host 0.0.0.0 --content-base . */

