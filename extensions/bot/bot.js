import Bot from './classes/Bot'

let registeredBots = {}

const registerBots = async (db) => {
    const bots = (await db.collection('Bot').find({active: true}).toArray())


    bots.forEach(async botData => {
            const bot = new Bot(botData)

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
