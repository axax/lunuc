/**
 * Human readable descriptions for cron expressions.
 *
 * Supports:
 *  - 5 field expressions: minute hour dayOfMonth month dayOfWeek
 *  - 6 field expressions: second minute hour dayOfMonth month dayOfWeek (node-cron style)
 *  - lists (1,2,3), ranges (1-5), steps (STAR/5, 1-20/2), names (JAN, MON), '?' as '*'
 *  - macros (@daily, @hourly, ...) and the custom 'STARTUP' marker
 *
 * Invalid input never throws, it returns 'invalid cron expression'.
 */

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
]

const WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday',
    'Thursday', 'Friday', 'Saturday'
]

const buildAliases = (names, offset) => names.reduce((acc, name, index) => {
    acc[name.slice(0, 3).toUpperCase()] = index + offset
    return acc
}, {})

const MONTH_ALIASES = buildAliases(MONTHS, 1)
const WEEKDAY_ALIASES = buildAliases(WEEKDAYS, 0)

const MACROS = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *'
}

const pad2 = (value) => String(value).padStart(2, '0')

const ordinal = (value) => {
    const lastTwo = value % 100
    if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`
    switch (value % 10) {
        case 1:
            return `${value}st`
        case 2:
            return `${value}nd`
        case 3:
            return `${value}rd`
        default:
            return `${value}th`
    }
}

// dayOfWeek allows 7 as an alias for Sunday, therefore label() wraps with % 7
const FIELD_SPECS = {
    second: {min: 0, max: 59, unit: 'second', label: (v) => String(v)},
    minute: {min: 0, max: 59, unit: 'minute', label: (v) => String(v)},
    hour: {min: 0, max: 23, unit: 'hour', label: (v) => String(v)},
    dayOfMonth: {min: 1, max: 31, unit: 'day', label: (v) => `the ${ordinal(v)}`},
    month: {min: 1, max: 12, unit: 'month', aliases: MONTH_ALIASES, label: (v) => MONTHS[v - 1]},
    dayOfWeek: {min: 0, max: 7, unit: 'weekday', aliases: WEEKDAY_ALIASES, label: (v) => WEEKDAYS[v % 7]}
}

const FIELD_NAMES_5 = ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek']
const FIELD_NAMES_6 = ['second', ...FIELD_NAMES_5]

const parseNumber = (token, spec) => {
    if (!token) throw new Error(`Empty value for ${spec.unit}`)
    const alias = spec.aliases ? spec.aliases[token.toUpperCase()] : undefined
    const value = alias !== undefined ? alias : Number(token)
    if (!Number.isInteger(value) || value < spec.min || value > spec.max) {
        throw new Error(`Invalid value "${token}" for ${spec.unit}`)
    }
    return value
}

const parseItem = (token, spec) => {
    let base = token
    let step = 1

    const slashIndex = token.indexOf('/')
    if (slashIndex !== -1) {
        base = token.slice(0, slashIndex)
        step = Number(token.slice(slashIndex + 1))
        if (!Number.isInteger(step) || step < 1) {
            throw new Error(`Invalid step in "${token}"`)
        }
    }

    if (base === '*' || base === '?') {
        return {kind: step === 1 ? 'all' : 'step', from: spec.min, to: spec.max, step}
    }

    const dashIndex = base.indexOf('-')
    if (dashIndex > 0) {
        const from = parseNumber(base.slice(0, dashIndex), spec)
        const to = parseNumber(base.slice(dashIndex + 1), spec)
        if (to < from) throw new Error(`Reversed range "${base}" for ${spec.unit}`)
        return {kind: step === 1 ? 'range' : 'step', from, to, step}
    }

    const value = parseNumber(base, spec)
    if (step !== 1) return {kind: 'step', from: value, to: spec.max, step}
    return {kind: 'single', from: value, to: value, step: 1}
}

const parseField = (raw, spec) => ({
    spec,
    items: raw.split(',').map(part => parseItem(part.trim(), spec))
})

const isEvery = (field) => field.items.length === 1 && field.items[0].kind === 'all'
const isSingle = (field) => field.items.length === 1 && field.items[0].kind === 'single'
const singleValue = (field) => field.items[0].from
const isSingleValue = (field, value) => isSingle(field) && singleValue(field) === value
const isPlainStep = (field) => field.items.length === 1
    && field.items[0].kind === 'step'
    && field.items[0].from === field.spec.min
    && field.items[0].to === field.spec.max

const formatItem = (item, spec) => {
    if (item.kind === 'all') return `every ${spec.unit}`
    if (item.kind === 'single') return spec.label(item.from)
    if (item.kind === 'range') return `${spec.label(item.from)} through ${spec.label(item.to)}`
    const bounded = item.from !== spec.min || item.to !== spec.max
    const suffix = bounded ? ` from ${spec.label(item.from)} through ${spec.label(item.to)}` : ''
    return `every ${ordinal(item.step)} ${spec.unit}${suffix}`
}

const formatField = (field) => field.items.map(item => formatItem(item, field.spec)).join(', ')

const describeClock = ({second, minute, hour}) => {
    const secondIsZero = !second || isSingleValue(second, 0)

    // exact time of day
    if (isSingle(minute) && isSingle(hour)) {
        const time = `${pad2(singleValue(hour))}:${pad2(singleValue(minute))}`
        if (secondIsZero) return `at ${time}`
        if (second && isSingle(second)) return `at ${time}:${pad2(singleValue(second))}`
    }

    // common shorthands
    if (secondIsZero && isEvery(hour) && isSingle(minute)) {
        return `every hour at minute ${singleValue(minute)}`
    }
    if (secondIsZero && isSingleValue(minute, 0) && isPlainStep(hour)) {
        return `every ${hour.items[0].step} hours`
    }
    if (secondIsZero && isEvery(hour) && isPlainStep(minute)) {
        return `every ${minute.items[0].step} minutes`
    }

    const segments = []

    if (second && !secondIsZero) {
        segments.push(isEvery(second) || isPlainStep(second)
            ? formatItem(second.items[0], second.spec).replace(/^every (\d+)/, 'every $1')
            : `at second ${formatField(second)}`)
    }

    if (isEvery(minute)) {
        if (!segments.length) segments.push('every minute')
    } else if (isPlainStep(minute)) {
        segments.push(`every ${minute.items[0].step} minutes`)
    } else {
        segments.push(`at minute ${formatField(minute)}`)
    }

    if (!isEvery(hour)) {
        const text = formatField(hour)
        segments.push(text.startsWith('every')
            ? `during ${text}`
            : `during ${isSingle(hour) ? 'hour' : 'hours'} ${text}`)
    }

    return segments.join(', ')
}

const describe = (fields) => {
    const parts = [describeClock(fields)]

    // cron combines dayOfMonth and dayOfWeek with OR when both are restricted
    const dayParts = []
    if (!isEvery(fields.dayOfMonth)) dayParts.push(`on ${formatField(fields.dayOfMonth)}`)
    if (!isEvery(fields.dayOfWeek)) dayParts.push(`on ${formatField(fields.dayOfWeek)}`)
    if (dayParts.length) parts.push(dayParts.join(' or '))

    if (!isEvery(fields.month)) parts.push(`in ${formatField(fields.month)}`)

    return parts.filter(Boolean).join(', ')
}

export const cronToReadableString = (cronExpression) => {
    if (!cronExpression) return 'never'

    const raw = String(cronExpression).trim()
    if (!raw) return 'never'
    if (raw.toUpperCase() === 'STARTUP' || raw.toLowerCase() === '@reboot') {
        return 'runs only once on startup'
    }

    const normalized = MACROS[raw.toLowerCase()] || raw
    const tokens = normalized.split(/\s+/)
    if (tokens.length !== 5 && tokens.length !== 6) return 'invalid cron expression'

    const names = tokens.length === 6 ? FIELD_NAMES_6 : FIELD_NAMES_5

    try {
        const fields = names.reduce((acc, name, index) => {
            acc[name] = parseField(tokens[index], FIELD_SPECS[name])
            return acc
        }, {})
        return describe(fields)
    } catch (error) {
        return 'invalid cron expression'
    }
}

export default cronToReadableString