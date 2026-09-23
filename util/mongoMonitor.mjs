// util/mongoMonitor.mjs
//
// Diagnostic only (opt-in): finds the code that loads large or slow results
// from MongoDB. Uses the driver's command monitoring and records, for every
// command, the calling lunuc code (async stack trace captured when the
// command starts). getMore batches are attributed to the find/aggregate that
// opened the cursor.
//
//   LUNUC_MONGO_MONITOR=true         enable
//   LUNUC_MONGO_MONITOR_DOCS=1000    log single commands returning >= N docs
//   LUNUC_MONGO_MONITOR_MS=200       log single commands taking >= N ms
//
// Every minute a summary of the top callers (docs, time, count) is logged.

export const MONGO_MONITOR_ENABLED = process.env.LUNUC_MONGO_MONITOR === 'true'
const DOCS_THRESHOLD = parseInt(process.env.LUNUC_MONGO_MONITOR_DOCS) || 1000
const MS_THRESHOLD = parseInt(process.env.LUNUC_MONGO_MONITOR_MS) || 200
const SUMMARY_INTERVAL_MS = 60000
const MAX_LOGS_PER_MINUTE = 30
const IGNORED_COMMANDS = new Set(['hello', 'isMaster', 'ismaster', 'ping', 'saslStart', 'saslContinue', 'endSessions', 'buildInfo', 'serverStatus'])

const started = new Map()      // requestId -> {start, origin, cmd, coll}
const cursorOrigin = new Map() // cursorId -> origin (for getMore)
const summary = new Map()      // origin -> {count, docs, ms, cmd, coll}
let logsThisMinute = 0

// first frames from lunuc code (not node_modules / node internals)
const originFromStack = (stack) => {
    const frames = String(stack).split('\n').slice(1)
        .map(l => l.trim())
        .filter(l => l.includes('/') && !l.includes('node_modules') && !l.includes('node:') && !l.includes('mongoMonitor.mjs'))
        .map(l => l.replace(/^at (async )?/, '').replace(/file:\/\/[^ )]*?\/(api|extensions|util|server|client)\//, '$1/'))
    return frames.slice(0, 3).join(' <- ') || '(unknown)'
}

const docsInReply = (reply) => {
    try {
        const c = reply && reply.cursor
        if (c) {
            return (c.firstBatch || c.nextBatch || []).length
        }
        if (reply && typeof reply.n === 'number') {
            return reply.n
        }
    } catch (e) {
        // ignore
    }
    return 0
}

const cursorIdOf = (reply) => {
    try {
        const id = reply && reply.cursor && reply.cursor.id
        if (id === undefined || id === null) return null
        const s = id.toString()
        return s === '0' ? null : s
    } catch (e) {
        return null
    }
}

export const attachMongoMonitor = (client) => {
    if (!MONGO_MONITOR_ENABLED || !client || typeof client.on !== 'function') {
        return
    }
    console.log(`[mongo] command monitor enabled (log >= ${DOCS_THRESHOLD} docs or >= ${MS_THRESHOLD}ms)`)

    client.on('commandStarted', (e) => {
        try {
            if (IGNORED_COMMANDS.has(e.commandName)) return
            const cmd = e.command || {}
            const coll = e.commandName === 'getMore' ? (cmd.collection || '') : (cmd[e.commandName] || cmd.collection || '')
            let origin
            if (e.commandName === 'getMore') {
                origin = cursorOrigin.get(String(cmd.getMore)) || '(getMore, origin unknown)'
            } else {
                const limit = Error.stackTraceLimit
                Error.stackTraceLimit = 40
                origin = originFromStack(new Error().stack)
                Error.stackTraceLimit = limit
            }
            started.set(e.requestId, {start: Date.now(), origin, cmd: e.commandName, coll: String(coll)})
            if (started.size > 10000) started.clear() // safety net
        } catch (err) {
            // never break a db call
        }
    })

    const finish = (e, failed) => {
        try {
            const s = started.get(e.requestId)
            if (!s) return
            started.delete(e.requestId)
            const ms = Date.now() - s.start
            const docs = failed ? 0 : docsInReply(e.reply)
            const cid = failed ? null : cursorIdOf(e.reply)
            if (cid) {
                cursorOrigin.set(cid, s.origin)
                if (cursorOrigin.size > 10000) cursorOrigin.clear()
            } else if (s.cmd === 'getMore') {
                // cursor exhausted
                for (const [k, v] of cursorOrigin) if (v === s.origin) { cursorOrigin.delete(k); break }
            }
            const key = s.origin
            const agg = summary.get(key) || {count: 0, docs: 0, ms: 0, cmd: s.cmd, coll: s.coll}
            agg.count++
            agg.docs += docs
            agg.ms += ms
            summary.set(key, agg)
            if ((docs >= DOCS_THRESHOLD || ms >= MS_THRESHOLD) && logsThisMinute++ < MAX_LOGS_PER_MINUTE) {
                console.warn(`[mongo] ${s.cmd} ${s.coll} ${docs} docs ${ms}ms${failed ? ' FAILED' : ''} <- ${s.origin}`)
            }
        } catch (err) {
            // ignore
        }
    }
    client.on('commandSucceeded', (e) => finish(e, false))
    client.on('commandFailed', (e) => finish(e, true))

    const timer = setInterval(() => {
        logsThisMinute = 0
        if (summary.size === 0) return
        const top = [...summary.entries()].sort((a, b) => b[1].docs - a[1].docs || b[1].ms - a[1].ms).slice(0, 8)
        console.warn('[mongo] top callers last 60s (by docs):\n' + top.map(([origin, a]) =>
            `  ${a.docs} docs / ${a.ms}ms / ${a.count}x  ${a.cmd} ${a.coll}  <- ${origin}`).join('\n'))
        summary.clear()
    }, SUMMARY_INTERVAL_MS)
    timer.unref()
}
