import util from 'node:util'

const DEFAULT_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

export function createDefaultLogger(settings) {
    let levelMaxLen = 0;
    let levelNames = new Map();
    DEFAULT_LEVELS.forEach(level => {
        if (level.length > levelMaxLen) {
            levelMaxLen = level.length;
        }
    });

    DEFAULT_LEVELS.forEach(level => {
        let levelName = level.toUpperCase();
        if (levelName.length < levelMaxLen) {
            levelName += ' '.repeat(levelMaxLen - levelName.length);
        }
        levelNames.set(level, levelName);
    });

    let print = (level, entry, message, ...args) => {
        if(!settings.enableLogger){
            return
        }
        let prefix = '';
        if (entry) {
            if (entry.tnx === 'server') {
                prefix = 'S: ';
            } else if (entry.tnx === 'client') {
                prefix = 'C: ';
            }

            if (entry.sid) {
                prefix = '[' + entry.sid + '] ' + prefix;
            }

            if (entry.cid) {
                prefix = '[#' + entry.cid + '] ' + prefix;
            }
        }

        message = util.format(message, ...args);
        message.split(/\r?\n/).forEach(line => {
            console.log('[%s] %s %s', new Date().toISOString().substr(0, 19).replace(/T/, ' '), levelNames.get(level), prefix + line);
        });
    };

    let logger = {};
    DEFAULT_LEVELS.forEach(level => {
        logger[level] = print.bind(null, level);
    });

    return logger;
}
