import React from 'react'
import {Box, Chip, MenuItem, Stack, TextField, Typography} from 'ui/admin'
import {cronToReadableString, getNextCronRuns} from '../util/cronexpression.mjs'
import {_t} from '../../../util/i18n.mjs'

const PRESETS = [
    {key: 'everyMinute', value: '* * * * *'},
    {key: 'every5Minutes', value: '*/5 * * * *'},
    {key: 'every15Minutes', value: '*/15 * * * *'},
    {key: 'hourly', value: '0 * * * *'},
    {key: 'daily', value: '0 0 * * *'},
    {key: 'nightly', value: '0 3 * * *'},
    {key: 'weekly', value: '0 0 * * 1'},
    {key: 'monthly', value: '0 0 1 * *'},
    {key: 'startup', value: 'STARTUP'}
]

const MINUTE_INTERVALS = [1, 2, 5, 10, 15, 20, 30]
const HOUR_INTERVALS = [1, 2, 3, 4, 6, 8, 12]
// Monday first, values as in cron (0 = Sunday)
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0]

const pad2 = (v) => String(v).padStart(2, '0')
const toTime = (hour, minute) => `${pad2(hour)}:${pad2(minute)}`

const DEFAULT_STATE = {mode: 'custom', interval: 15, minute: 0, hour: 0, weekdays: [1], dayOfMonth: 1}

// recognizes the expressions the builder can produce, everything else is 'custom'
export const parseBuilderState = (expression) => {
    const raw = (expression || '').trim()
    if (raw.toUpperCase() === 'STARTUP') return {...DEFAULT_STATE, mode: 'startup'}
    const t = raw.split(/\s+/)
    if (t.length !== 5) return {...DEFAULT_STATE}
    const [mi, h, dom, mon, dow] = t
    const num = (s) => /^\d+$/.test(s) ? Number(s) : null
    if (mon !== '*') return {...DEFAULT_STATE}

    if (h === '*' && dom === '*' && dow === '*') {
        if (mi === '*') return {...DEFAULT_STATE, mode: 'minutes', interval: 1}
        const m = mi.match(/^\*\/(\d+)$/)
        if (m) return {...DEFAULT_STATE, mode: 'minutes', interval: Number(m[1])}
    }
    if (num(mi) !== null && dom === '*' && dow === '*') {
        if (h === '*') return {...DEFAULT_STATE, mode: 'hourly', interval: 1, minute: num(mi)}
        const m = h.match(/^\*\/(\d+)$/)
        if (m) return {...DEFAULT_STATE, mode: 'hourly', interval: Number(m[1]), minute: num(mi)}
    }
    if (num(mi) !== null && num(h) !== null) {
        const time = {minute: num(mi), hour: num(h)}
        if (dom === '*' && dow === '*') return {...DEFAULT_STATE, ...time, mode: 'daily'}
        if (dom === '*' && /^[0-7](,[0-7])*$/.test(dow)) {
            return {...DEFAULT_STATE, ...time, mode: 'weekly', weekdays: dow.split(',').map(d => Number(d) % 7)}
        }
        if (num(dom) !== null && dow === '*') return {...DEFAULT_STATE, ...time, mode: 'monthly', dayOfMonth: num(dom)}
    }
    return {...DEFAULT_STATE}
}

export const buildExpression = (s) => {
    switch (s.mode) {
        case 'minutes':
            return s.interval > 1 ? `*/${s.interval} * * * *` : '* * * * *'
        case 'hourly':
            return `${s.minute} ${s.interval > 1 ? '*/' + s.interval : '*'} * * *`
        case 'daily':
            return `${s.minute} ${s.hour} * * *`
        case 'weekly': {
            const days = (s.weekdays.length ? s.weekdays : [1]).slice().sort((a, b) => a - b)
            return `${s.minute} ${s.hour} * * ${days.join(',')}`
        }
        case 'monthly':
            return `${s.minute} ${s.hour} ${s.dayOfMonth} * *`
        case 'startup':
            return 'STARTUP'
        default:
            return null
    }
}

const formatDate = (date) => {
    try {
        return date.toLocaleString(_app_.lang === 'en' ? 'en-GB' : _app_.lang + '-CH', {
            weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        })
    } catch (e) {
        return date.toString()
    }
}

const smallField = {minWidth: '8rem', '& .MuiInputBase-root': {margin: 0}}

const CronExpressionField = ({name, label, value, error, readOnly, onChange, onBlur}) => {
    const expression = value || ''
    const [builder, setBuilder] = React.useState(() => parseBuilderState(expression))

    // keep the builder in sync when the expression is typed in by hand
    React.useEffect(() => {
        const parsed = parseBuilderState(expression)
        const current = buildExpression(builder)
        if (current !== expression.trim()) {
            setBuilder(parsed.mode === 'custom' ? {...builder, mode: 'custom'} : parsed)
        }
    }, [expression])

    const updateBuilder = (changes) => {
        const next = {...builder, ...changes}
        setBuilder(next)
        const newExpression = buildExpression(next)
        if (newExpression !== null && newExpression !== expression) {
            onChange(newExpression)
        }
    }

    const description = cronToReadableString(expression)
    const invalid = description === 'invalid cron expression'
    const isStartup = expression.trim().toUpperCase() === 'STARTUP'
    const nextRuns = !invalid && !isStartup ? getNextCronRuns(expression, 3) : []
    const timeValue = toTime(builder.hour, builder.minute)
    const setTime = (e) => {
        const [h, m] = (e.target.value || '00:00').split(':').map(Number)
        updateBuilder({hour: h || 0, minute: m || 0})
    }

    return <Box sx={{mb: 2, width: '100%'}}>
        <TextField
            fullWidth
            label={label}
            name={name}
            value={expression}
            error={!!error || invalid}
            placeholder="* * * * *"
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            slotProps={{
                inputLabel: {shrink: true},
                htmlInput: {readOnly, style: {fontFamily: 'monospace', letterSpacing: '0.05em'}}
            }}
            helperText={error || (expression ? description : _t('CronJob.cron.hint'))}/>

        {!readOnly && <Box sx={{mt: 1, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1}}>
            <Stack direction="row" spacing={1} useFlexGap sx={{flexWrap: 'wrap', mb: 1.5}}>
                {PRESETS.map(preset => <Chip
                    key={preset.key}
                    size="small"
                    label={_t('CronJob.cron.preset.' + preset.key)}
                    title={preset.value}
                    color={expression.trim() === preset.value ? 'primary' : 'default'}
                    variant={expression.trim() === preset.value ? 'filled' : 'outlined'}
                    onClick={() => onChange(preset.value)}/>)}
            </Stack>

            <Stack direction="row" spacing={1.5} useFlexGap sx={{flexWrap: 'wrap', alignItems: 'center'}}>
                <TextField select size="small" sx={smallField} label={_t('CronJob.cron.mode')}
                           value={builder.mode}
                           onChange={e => {
                               const mode = e.target.value
                               const interval = mode === 'minutes' ? 15 : mode === 'hourly' ? 1 : builder.interval
                               updateBuilder({mode, interval})
                           }}>
                    {['minutes', 'hourly', 'daily', 'weekly', 'monthly', 'startup', 'custom'].map(mode =>
                        <MenuItem key={mode} value={mode}>{_t('CronJob.cron.mode.' + mode)}</MenuItem>)}
                </TextField>

                {(builder.mode === 'minutes' || builder.mode === 'hourly') &&
                <TextField select size="small" sx={smallField} label={_t('CronJob.cron.interval')}
                           value={builder.interval}
                           onChange={e => updateBuilder({interval: Number(e.target.value)})}>
                    {(builder.mode === 'minutes' ? MINUTE_INTERVALS : HOUR_INTERVALS)
                        .concat((builder.mode === 'minutes' ? MINUTE_INTERVALS : HOUR_INTERVALS).indexOf(builder.interval) < 0 ? [builder.interval] : [])
                        .map(n => <MenuItem key={n} value={n}>
                            {_t(builder.mode === 'minutes' ? 'CronJob.cron.everyNMinutes' : 'CronJob.cron.everyNHours', {n})}
                        </MenuItem>)}
                </TextField>}

                {builder.mode === 'hourly' &&
                <TextField select size="small" sx={smallField} label={_t('CronJob.cron.atMinute')}
                           value={builder.minute}
                           onChange={e => updateBuilder({minute: Number(e.target.value)})}>
                    {Array.from({length: 60}, (_, i) => i).map(n => <MenuItem key={n} value={n}>:{pad2(n)}</MenuItem>)}
                </TextField>}

                {builder.mode === 'monthly' &&
                <TextField select size="small" sx={smallField} label={_t('CronJob.cron.dayOfMonth')}
                           value={builder.dayOfMonth}
                           onChange={e => updateBuilder({dayOfMonth: Number(e.target.value)})}>
                    {Array.from({length: 31}, (_, i) => i + 1).map(n => <MenuItem key={n} value={n}>{n}.</MenuItem>)}
                </TextField>}

                {(builder.mode === 'daily' || builder.mode === 'weekly' || builder.mode === 'monthly') &&
                <TextField size="small" type="time" sx={smallField} label={_t('CronJob.cron.time')}
                           value={timeValue} onChange={setTime}
                           slotProps={{inputLabel: {shrink: true}}}/>}

                {builder.mode === 'weekly' &&
                <Stack direction="row" spacing={0.5} useFlexGap sx={{flexWrap: 'wrap'}}>
                    {WEEKDAYS.map(day => {
                        const active = builder.weekdays.indexOf(day) >= 0
                        return <Chip key={day} size="small"
                                     label={_t('CronJob.cron.weekday.' + day)}
                                     color={active ? 'primary' : 'default'}
                                     variant={active ? 'filled' : 'outlined'}
                                     onClick={() => {
                                         const weekdays = active ? builder.weekdays.filter(d => d !== day) : builder.weekdays.concat(day)
                                         if (weekdays.length) updateBuilder({weekdays})
                                     }}/>
                    })}
                </Stack>}

                {builder.mode === 'custom' &&
                <Typography variant="caption" color="text.secondary">
                    {_t('CronJob.cron.customHint')}
                </Typography>}
            </Stack>

            {nextRuns.length > 0 && <Typography variant="caption" component="div" color="text.secondary" sx={{mt: 1.5}}>
                {_t('CronJob.cron.nextRuns')}: {nextRuns.map(formatDate).join(' · ')}
            </Typography>}
        </Box>}
    </Box>
}

export default CronExpressionField
