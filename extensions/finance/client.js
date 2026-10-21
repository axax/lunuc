import React from 'react'
import Hook from 'util/hook.cjs'
import {lazy} from 'client/components/Async'

const StockTicker = lazy(() => import(/* webpackChunkName: "finance" */ './components/StockTicker'))
const CurrencyTicker = lazy(() => import(/* webpackChunkName: "finance" */ './components/CurrencyTicker'))

export default () => {
    Hook.on('JsonDom', ({components}) => {
        components['StockTicker'] = StockTicker
        components['CurrencyTicker'] = CurrencyTicker
    })
}
