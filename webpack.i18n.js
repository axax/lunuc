const glob = require('glob'),
    fs = require('fs'),
    path = require('path');

function WebpackI18nPlugin(options) {
    this.src = options.src;
    this.dest = options.dest;
}

WebpackI18nPlugin.prototype.apply = function(compiler) {
    var self = this;

    this.filesTimeStamps = {};

    compiler.plugin('emit', function(compilation, callback) {
        glob(self.src, function(error, files) {
            var json = {},
                filesChanged = [],
                isAtLeastOneFileChanged;

            files.forEach(function(fileName) {
                var filePath = path.join(compiler.context, fileName),
                    isFileChanged;

                self.addJsonToMergedJson(fileName, json);

                self.addFileToWebPackDependencies(compilation, filePath);

                isFileChanged = self.isFileChanged(compilation, filePath);

                filesChanged.push(isFileChanged);

                self.updateFileStamp(compilation, filePath);
            });

            isAtLeastOneFileChanged = filesChanged.some(function(isChanged) {
                return isChanged;
            });

            if (isAtLeastOneFileChanged) {
                self.addJsonToWebPackAssets(compilation, json);
            }

            callback();
        });
    });
};

WebpackI18nPlugin.prototype.addFileToWebPackDependencies = function(compilation, filePath) {
    compilation.fileDependencies.add(filePath);
};

WebpackI18nPlugin.prototype.addJsonToWebPackAssets = function(compilation, json) {

    Object.keys(json).map((key) => {
        const jsonString = 'window._app_.tr='+JSON.stringify(json[key])
        compilation.assets[key+'.js'] = {
            source: function() {
                return new Buffer(jsonString)
            },
            size: function() {
                return Buffer.byteLength(jsonString)
            }
        }
    })




};

WebpackI18nPlugin.prototype.addJsonToMergedJson = function(fileName, json) {
    const file = fs.readFileSync(fileName, 'utf8'),
        name = path.parse(fileName).name

    try {
        var fileContent = JSON.parse(file);
        if( !json[name] ) json[name] = {}

        Object.assign(json[name], fileContent);

    } catch(e) {

    }
};

WebpackI18nPlugin.prototype.isFileChanged = function(compilation, filePath) {
    var newFileTimeStamp = compilation.fileTimestamps[filePath],
        fileTimeStamp = this.filesTimeStamps[filePath];

    if (!fileTimeStamp || fileTimeStamp !== newFileTimeStamp) {
        return true;
    }
};

WebpackI18nPlugin.prototype.updateFileStamp = function(compilation, filePath) {
    this.filesTimeStamps[filePath] = compilation.fileTimestamps[filePath];
};

module.exports = WebpackI18nPlugin;