import config from 'gen/config-client'


const debugStyle = 'color: #006400; font-weight:bold'
const debugStyle2 = 'font-size:11px; color: #ddd;'

const getStackTrace = () => {
    let stack = new Error().stack || '';
    stack = stack.split('\n').map(function (line) { return line.trim(); });
    return stack.splice(stack[0] == 'Error' ? 2 : 1);
}

export default function (name) {
    const START_TIME = new Date().getTime()
    return {
        debug: (msg, data) => {
            if (config.DEBUG) {
                const end = new Date().getTime(), time = end - START_TIME
                let link
                var matches = getStackTrace()[1].match(/\(([^)]+)\)/);
                if (matches) {
                    link = matches[1];
                }
                console.log(`%c\n${msg} %cin ${name} (${time} ms): ${link}`, debugStyle,debugStyle2,(data?data:''))
            }
        }
    }
}
