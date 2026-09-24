global._app_ = {start: new Date()}

import {startJsonMonitor} from '../util/jsonMonitor.mjs'
import './server.mjs'

// diagnostic only, opt-in via LUNUC_JSON_MONITOR=true
startJsonMonitor('server')
