import React from 'react'
import {Box, Chip, IconButton, Stack, Tab, Tabs, Tooltip, Typography} from 'ui/admin'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlineOutlined'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {_t} from '../../../util/i18n.mjs'
import {formatRuntime} from './RunningCronJobs'

// above this number of lines the output is rendered as plain text (no per-line styling) to keep rendering fast
const MAX_STYLED_LINES = 3000

const SECTIONS = [
    {key: 'scriptError', label: 'CronJob.result.error', color: 'error'},
    {key: 'scriptLog', label: 'CronJob.result.log'},
    {key: 'scriptDebug', label: 'CronJob.result.debug'}
]
const KNOWN_KEYS = new Set(['scriptLog', 'scriptDebug', 'scriptError', 'endTime', '_id'])

const RE_ERROR = /\b(error|errors|fehler|failed|exception)\b/i
const RE_WARN = /\b[1-9]\d*\s+(conflicts?|skipped|warnings?)\b|\bconflict\b|\bwarn(ing)?\b/i
const RE_LABEL = /^([\w.\-\/ ]{1,60}):(\s|$)/

const copy = text => navigator.clipboard && navigator.clipboard.writeText(text)

const CopyButton = ({text, title}) => <Tooltip title={title || _t('CronJob.result.copy')}>
    <IconButton size="small" sx={{p: 0.25}} onClick={() => copy(text)}>
        <ContentCopyIcon sx={{fontSize: 14}}/>
    </IconButton>
</Tooltip>

const LogLine = React.memo(({line}) => {
    const indented = /^\s/.test(line)
    const color = RE_ERROR.test(line) ? 'error.main' : RE_WARN.test(line) ? 'warning.main' : indented ? 'text.secondary' : 'text.primary'
    const m = !indented && line.match(RE_LABEL)
    return <Box sx={{color, pl: indented ? 2 : 0, minHeight: '1.5em'}}>
        {m ? <><Box component="span" sx={{fontWeight: 700}}>{m[1]}</Box>{line.substring(m[1].length)}</> : line.trim()}
    </Box>
})

const LogOutput = ({text, color}) => {
    const lines = React.useMemo(() => text.split('\n'), [text])
    const styled = lines.length <= MAX_STYLED_LINES

    return <Box sx={{position: 'relative'}}>
        <Box sx={{position: 'absolute', top: 6, right: 6, zIndex: 1}}>
            <CopyButton text={text}/>
        </Box>
        <Box component="pre" sx={{
            m: 0,
            p: 2,
            pr: 5,
            borderRadius: 2,
            border: 1,
            borderColor: color ? `${color}.main` : 'divider',
            bgcolor: 'action.hover',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            maxHeight: '55vh',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: color ? `${color}.main` : 'text.primary'
        }}>
            {styled && !color ? lines.map((line, i) => <LogLine key={i} line={line}/>) : text}
        </Box>
    </Box>
}

const renderValue = value => value !== null && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)

const CronJobResult = ({status, result, error, duration}) => {

    const resultJson = React.useMemo(() => {
        if (!result) return {}
        try {
            return JSON.parse(result)
        } catch (e) {
            return {scriptLog: result}
        }
    }, [result])

    const started = !error && status && status.startsWith('Job started')
    const hasError = !!(error || resultJson.scriptError)

    const sections = SECTIONS.filter(s => resultJson[s.key])
    const extraKeys = Object.keys(resultJson).filter(k => !KNOWN_KEYS.has(k) && resultJson[k] !== undefined && resultJson[k] !== null && resultJson[k] !== '')
    const [tab, setTab] = React.useState(0)
    const current = sections[Math.min(tab, sections.length - 1)]

    const state = error ? 'failed' : started ? 'started' : hasError ? 'error' : 'success'
    const stateColor = {failed: 'error', error: 'error', started: 'info', success: 'success'}[state]
    const StateIcon = {failed: ErrorOutlineIcon, error: ErrorOutlineIcon, started: PlayCircleOutlineIcon, success: CheckCircleOutlineIcon}[state]

    return <Box>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{mb: 2}}>
            <StateIcon sx={{fontSize: 36, color: `${stateColor}.main`}}/>
            <Box sx={{minWidth: 0}}>
                <Typography variant="h6" sx={{lineHeight: 1.2, fontWeight: 600}}>
                    {_t(`CronJob.result.state.${state}`)}
                </Typography>
                {(error || started) && <Typography variant="body2" sx={{color: 'text.secondary', wordBreak: 'break-word'}}>
                    {error || status}
                </Typography>}
            </Box>
        </Stack>

        <Stack direction="row" spacing={1} sx={{mb: 2, flexWrap: 'wrap', rowGap: 1}}>
            {!started && duration !== undefined && <Chip size="small" variant="outlined"
                                                          label={`${_t('CronJob.result.duration')}: ${duration < 1000 ? duration + 'ms' : formatRuntime(duration)}`}/>}
            {resultJson.endTime && <Chip size="small" variant="outlined"
                                         label={`${_t('CronJob.result.endTime')}: ${new Date(resultJson.endTime).toLocaleString()}`}/>}
            {resultJson._id && <Chip size="small" variant="outlined"
                                     sx={{fontFamily: 'monospace'}}
                                     label={`${_t('CronJob.result.execution')}: ${resultJson._id}`}
                                     onDelete={() => copy(resultJson._id)}
                                     deleteIcon={<ContentCopyIcon titleAccess={_t('CronJob.result.copy')} sx={{fontSize: '14px !important'}}/>}/>}
        </Stack>

        {sections.length > 0 ? <>
            {sections.length > 1 && <Tabs value={sections.indexOf(current)} onChange={(e, v) => setTab(v)}
                                          sx={{mb: 1.5, minHeight: 36, '& .MuiTab-root': {minHeight: 36, textTransform: 'none'}}}>
                {sections.map(s => <Tab key={s.key}
                                        sx={s.color ? {color: `${s.color}.main`} : null}
                                        label={`${_t(s.label)} (${resultJson[s.key].split('\n').length})`}/>)}
            </Tabs>}
            <LogOutput key={current.key} text={resultJson[current.key]} color={current.color}/>
        </> : !started && !error && <Typography variant="body2" sx={{color: 'text.secondary', fontStyle: 'italic'}}>
            {_t('CronJob.result.empty')}
        </Typography>}

        {extraKeys.length > 0 && <Box sx={{mt: 2, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 0.5}}>
            {extraKeys.map(k => <React.Fragment key={k}>
                <Typography variant="body2" sx={{fontWeight: 600}}>{k}</Typography>
                <Typography variant="body2" component="pre" sx={{m: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>
                    {renderValue(resultJson[k])}
                </Typography>
            </React.Fragment>)}
        </Box>}
    </Box>
}

export default CronJobResult
