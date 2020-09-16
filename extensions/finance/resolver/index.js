import Util from '../../../api/util'
import request from 'request-promise'


const ALPHA_VANTAGE_API_KEY = process.env.LUNUC_ALPHA_VANTAGE_API_KEY


export default db => ({
    Query: {
        stockData: async ({symbols}, {context}) => {

            if (!ALPHA_VANTAGE_API_KEY) {
                throw new Error('Api key missing for alpha vantage. Please define the env var LUNUC_ALPHA_VANTAGE_API_KEY')
            }

            const uri = `https://www.alphavantage.co/query?function=BATCH_STOCK_QUOTES&symbols=${symbols.join(',')}&apikey=${ALPHA_VANTAGE_API_KEY}`
            console.log(uri)
            const response = (await request({
                method: 'GET',
                uri,
                json: true
            }))
            const stockdata = response["Stock Quotes"].map(d => {
                return {
                    symbol: d["1. symbol"],
                    price: d["2. price"],
                    volume: d["3. volume"],
                    timestamp: d["4. timestamp"],
                }
            })

            return stockdata
        },
        currencyData: async ({from, to}, {context}) => {

            if (!ALPHA_VANTAGE_API_KEY) {
                throw new Error('Api key missing for alpha vantage. Please define the env var LUNUC_ALPHA_VANTAGE_API_KEY')
            }

            const uri = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=${to}&apikey=${ALPHA_VANTAGE_API_KEY}`
            const response = (await request({
                method: 'GET',
                uri,
                json: true
            }))

            const raw = response["Realtime Currency Exchange Rate"]
            if (raw) {
                return {
                    from: raw["1. From_Currency Code"],
                    to: raw["3. To_Currency Code"],
                    fromName: raw["2. From_Currency Name"],
                    toName: raw["4. To_Currency Name"],
                    rate: raw["5. Exchange Rate"],
                    timestamp: raw["6. Last Refreshed"]
                }
            } else {
                console.log(response)
                return null
            }
        }
    }
})
