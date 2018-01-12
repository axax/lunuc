import Hook from '../../util/hook'
import StockTicker from './components/StockTicker'


Hook.on('JsonDom', ({components}) => {
    components['StockTicker'] = StockTicker
})
