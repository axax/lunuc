import React from 'react'
import Hook from 'util/hook.cjs'
import Async from 'client/components/Async'

const StockTicker = (props) => <Async {...props} load={import(/* webpackChunkName: "finance" */ './components/StockTicker')} />
const CurrencyTicker = (props) => <Async {...props} load={import(/* webpackChunkName: "finance" */ './components/CurrencyTicker')} />

export default () => {
    Hook.on('JsonDom', ({components}) => {
        components['StockTicker'] = StockTicker
        components['CurrencyTicker'] = CurrencyTicker
    })
}
