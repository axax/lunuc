import Bot from './classes/Bot.mjs'
import Util from '../../api/util/index.mjs'


// TODO: clean up unsed connectors
let botConnectors = {}

let registeredBots = {}

const registerBots = async (db) => {
    const bots = (await db.collection('Bot').find({active: true}).toArray())

    for (const botData of bots) {
        // only if execfilter matches connect bot to messangers
        if (botData.execfilter && !Util.execFilter(botData.execfilter)) {
            botData.telegramToken = null
        }
        console.log(`register bot ${botData.name} with telegramToken ${botData.telegramToken}`)
        const bot = new Bot(botData, db)

        await bot.loadCommands(db)

        bot.start()

        registeredBots[botData._id] = bot
    }
}


const unregisterBots = (db) => {
    Object.keys(registeredBots).forEach(id => {
        registeredBots[id].destroy()
        delete registeredBots[id]
    })

    registeredBots = {}
}

export {unregisterBots, registerBots, registeredBots, botConnectors}
