import Hook from '../../util/hook'
import StockTicker from './components/StockTicker'
import CurrencyTicker from './components/CurrencyTicker'


Hook.on('JsonDom', ({components}) => {
    components['StockTicker'] = StockTicker
    components['CurrencyTicker'] = CurrencyTicker
})
