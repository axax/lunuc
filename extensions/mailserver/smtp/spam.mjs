import Util from '../../../api/util/index.mjs'

/*



    {
      "key": "x-recommended-action",
      "line": "X-Recommended-Action: accept"
    },


 */
export const detectSpam = async (db, context, {text, sender, threshold}) => {

    if(threshold===0 || threshold === null){
        return false
    }else if(isNaN(threshold)){
        threshold = 7
    }

    let spamFilter
    if(db && context){
        const values = await Util.keyValueGlobalMap(db, context, ['MailSpamFilter'])
        spamFilter = values.MailSpamFilter
    }

    if (!spamFilter) {
        console.warn('Spam filter is not configured in global store with Key MailSpamFilter')
        spamFilter = {
            senderBlacklist:[
                'coletolakervresort.com'
            ],
            keywords:{
                'bitcoingewinner':10,
                'potenz': 4,
                'hoehepunkt': 2,
                'liebesleben': 2,
                'arzneien': 2,
                'apotheke': 2,
                'free': 2,
                'winner': 3,
                'credit card': 5,
                'click here': 4,
                'unsubscribe': 1,
                'million dollars': 5
            }
        }
    }
    if(sender && spamFilter.senderBlacklist){
        const senderLowerCase = sender.toLowerCase()

        const containsWord = spamFilter.senderBlacklist.some(word => senderLowerCase.includes(word))
        if(containsWord){
            return true
        }
    }

    const lowerCaseText = text.toLowerCase()

    let totalScore = 0

    for (const [keyword, score] of Object.entries(spamFilter.keywords)) {
        if (lowerCaseText.includes(keyword)) {
            totalScore += score
        }
    }
    return totalScore >= threshold
}

// Example usage:
/*const message = "Congratulations! You are a winner! Click here to claim your million dollars now!";
const isSpamMessage =  detectSpam(null, null, message)*/

