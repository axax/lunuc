import Bot from './classes/Bot'

let registeredBots = {}

const registerBots = async (db) => {
    const bots = (await db.collection('Bot').find({active: true}).toArray())


    bots.forEach(async botData => {
            const bot = new Bot(botData)

            await bot.loadCommands(db)

            bot.start()

            registeredBots[botData._id] = bot


            /*
             bot.start((ctx) => ctx.reply('Welcome!'))
             bot.help((ctx) => ctx.reply('Send me a sticker'))
             bot.on('sticker', (ctx) => ctx.reply('👍'))
             bot.hears('hi', (ctx) => ctx.reply('Hey there'))
             bot.hears(/rahel/i, (ctx) => ctx.reply('Ach Rahel ist die beste 😍🥰😘'))
             bot.hears(/salo/i, (ctx) => ctx.reply('Meinst du mit salo Salomè?'))
             bot.launch()*/
            // console.log(botCommand)
            /* let match = true
             if (cronJob.execfilter) {
             match = cronjobUtil.execFilter(cronJob.execfilter)
             }

             if (match) {

             registeredBots.push(cron.schedule(cronJob.expression, () => {

             const context = {lang: 'en', id: cronJob.createdBy, username: 'unknown'}
             cronjobUtil.runScript({cronjobId: cronJob._id, script: cronJob.script, context, db})

             }))
             }*/
        }
    )
}


const unregisterBots = (db) => {
    Object.keys(registeredBots).forEach(id => {
        registeredBots[id].destroy()
    })

    registeredBots = {}
}

export {unregisterBots, registerBots, registeredBots}
