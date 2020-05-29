const glob = require('glob'),
    fs = require('fs'),
    path = require('path');


const GENSRC_PATH = './gensrc';

function WebpackI18nPlugin(options) {
    this.src = options.src;
    this.dest = options.dest;
}

WebpackI18nPlugin.prototype.apply = function (compiler) {
    var self = this;

    this.filesTimeStamps = {};
    compiler.hooks.emit.tap('I18n', function (compilation) {
        glob(self.src, function (error, files) {
            var json = {},
                filesChanged = [],
                isAtLeastOneFileChanged;

            files.forEach(function (fileName) {
                var filePath = path.join(compiler.context, fileName),
                    isFileChanged;

                self.addJsonToMergedJson(fileName, json);

                self.addFileToWebPackDependencies(compilation, filePath);

                isFileChanged = self.isFileChanged(compilation, filePath);

                filesChanged.push(isFileChanged);

                self.updateFileStamp(compilation, filePath);
            });

            isAtLeastOneFileChanged = filesChanged.some(function (isChanged) {
                return isChanged;
            });

            if (isAtLeastOneFileChanged) {

                // add all translations to gensrc
                fs.writeFile(GENSRC_PATH + "/tr.js", 'export default ' + JSON.stringify(json), function (err) {
                    if (err) {
                        return console.log(err)
                    }
                })

                // add frontend translations to assets path so they can be loaded from the client
                self.addJsonToWebPackAssets(compilation, json);
            }

        })
    })
}

WebpackI18nPlugin.prototype.addFileToWebPackDependencies = function (compilation, filePath) {
    compilation.fileDependencies.add(filePath)
    console.log(filePath)
}

WebpackI18nPlugin.prototype.addJsonToWebPackAssets = function (compilation, json) {

    Object.keys(json).map((key) => {
        const jsonString = 'window._app_.tr=' + JSON.stringify(json[key])
        compilation.assets[key + '.tr.js'] = {
            source: function () {
                return new Buffer(jsonString)
            },
            size: function () {
                return Buffer.byteLength(jsonString)
            }
        }
    })
};

WebpackI18nPlugin.prototype.addJsonToMergedJson = function (fileName, json) {
    const file = fs.readFileSync(fileName, 'utf8')

    let name = path.parse(fileName).name

    if (name.endsWith('.tr')) {
        name = name.substring(0, name.length - 3)
    }


    try {
        var fileContent = JSON.parse(file);
        if (!json[name]) json[name] = {}

        Object.assign(json[name], fileContent);

    } catch (e) {

    }
};

WebpackI18nPlugin.prototype.isFileChanged = function (compilation, filePath) {
    var newFileTimeStamp = compilation.fileTimestamps[filePath],
        fileTimeStamp = this.filesTimeStamps[filePath];

    if (!fileTimeStamp || fileTimeStamp !== newFileTimeStamp) {
        return true;
    }
};

WebpackI18nPlugin.prototype.updateFileStamp = function (compilation, filePath) {
    this.filesTimeStamps[filePath] = compilation.fileTimestamps[filePath];
};

module.exports = WebpackI18nPlugin;
