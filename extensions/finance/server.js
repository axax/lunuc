import Hook from '../../util/hook'
import schema from './schema/'
import resolver from './resolver/'
import StockTicker from './components/StockTicker'
import CurrencyTicker from './components/CurrencyTicker'
import {deepMergeToFirst} from 'util/deepMerge'

// Hook to add mongodb resolver
Hook.on('resolver', ({db, resolvers}) => {
    deepMergeToFirst(resolvers, resolver(db))
})

// Hook to add mongodb schema
Hook.on('schema', ({schemas}) => {
    schemas.push(schema)
})

// we need this components for server side rendering
Hook.on('JsonDom', ({components}) => {
    components['StockTicker'] = StockTicker
    components['CurrencyTicker'] = CurrencyTicker
})
