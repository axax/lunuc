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

/*
 * Reload after changes to Bot / BotCommand: debounced and one reload after the other.
 * Before, every changed entry (e.g. an import of several bot commands) started its own
 * unregister + register at the same time - bots were started twice, the extra instance was no
 * longer in registeredBots (could not be stopped) and Telegram answered with
 * "409 Conflict: terminated by other getUpdates request".
 */
let reloadQueue = Promise.resolve(), reloadTimer
const reloadBots = (db) => {
    clearTimeout(reloadTimer)
    reloadTimer = setTimeout(() => {
        reloadQueue = reloadQueue.then(async () => {
            unregisterBots()
            // Telegram ends the long poll (getUpdates) of the stopped instance only after a moment
            await new Promise(resolve => setTimeout(resolve, 3000))
            await registerBots(db)
        }).catch(e => console.error('reload bots failed', e))
    }, 1000)
}

export {unregisterBots, registerBots, reloadBots, registeredBots, botConnectors}
