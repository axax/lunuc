import Bot from './classes/Bot'
import Util from 'api/util'

let registeredBots = {}

const registerBots = async (db) => {
    const bots = (await db.collection('Bot').find({active: true}).toArray())

    bots.forEach(async botData => {
            // only if execfilter matches connect bot to messangers
            if (botData.execfilter && !Util.matchFilterExpression(botData.execfilter, Util.systemProperties())) {
                botData.telegramToken = null
            }
            const bot = new Bot(botData, db)

            await bot.loadCommands(db)

            bot.start()

            registeredBots[botData._id] = bot

        }
    )
}


const unregisterBots = (db) => {
    Object.keys(registeredBots).forEach(id => {
        registeredBots[id].destroy()
        delete registeredBots[id]
    })

    registeredBots = {}
}

export {unregisterBots, registerBots, registeredBots}
