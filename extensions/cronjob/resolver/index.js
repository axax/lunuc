

export default db => ({
    testJob: async ({script}, {context}) => {
        const tpl = new Function(`let _consoleLog =''; const console = {
  log:msg => {_consoleLog+=msg.toString()},
  info:msg=> {},
  warn:msg=> {},
}
const require = this.require;${script};return _consoleLog`)
        const result = tpl.call({require, db})



        console.log(result)
        return {status: result}
    }
})
