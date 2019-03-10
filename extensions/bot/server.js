import Hook from 'util/hook'
import schemaGen from './gensrc/schema'
import resolverGen from './gensrc/resolver'
import schema from './schema'
import resolver from './resolver'
import {deepMergeToFirst} from 'util/deepMerge'
import Bot from './bot'

let registeredBots = []

const registerBots = async (db) => {
    const bots = (await db.collection('Bot').find({active: true}).toArray())


    bots.forEach(async botData => {
        const bot = new Bot(botData)

        await bot.loadCommands(db)

        bot.start()

        registeredBots.push(bot)





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
    registeredBots.forEach(bot => {
        bot.destroy()
    })

    registeredBots = []
}


// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db), resolverGen(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schemaGen)
    schemas.push(schema)
})


// Hook when db is ready
Hook.on('appready', ({db}) => {
    registerBots(db)
})

// Hook when the type CronJob has changed
Hook.on(['typeUpdated_Bot', 'typeUpdated_BotCommand'], ({db}) => {
    unregisterBots()
    registerBots(db)
})

