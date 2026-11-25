import React, {useEffect, useReducer, useRef, useState} from 'react'
import styled from '@emotion/styled'
import {alpha, useTheme} from '@mui/material/styles'
import {client} from '../../../client/middleware/graphql'
import {_t} from '../../../util/i18n.mjs'

/*
 Page statistics in the cms editor:
   AnalyticsToolbarButton  button in the toolbar, opens the tab
   AnalyticsPanel          tab "Analytics" in the bottom tool bar (CmsPageTools)
 The button loads a small summary (only the views), the tab loads the details only while it is open.
 Each is requested once per page, period and 2 minutes.
*/

export const DAYS_OPTIONS = [7, 30, 90, 365]
const CACHE_MS = 2 * 60 * 1000
const QUERY = 'query userTrackingPageStats($slug:String!,$days:Int,$detail:Boolean){userTrackingPageStats(slug:$slug,days:$days,detail:$detail)}'

// ---------------------------------------------------------------- store

const store = new Map()

const getEntry = (key) => {
    let entry = store.get(key)
    if (!entry) {
        entry = {data: null, error: null, time: 0, promise: null, listeners: new Set()}
        store.set(key, entry)
    }
    return entry
}

const notify = (entry) => entry.listeners.forEach(fn => fn())

const storeKey = (slug, days, detail) => slug + '|' + days + '|' + (detail ? 'd' : 's')

const load = (slug, days, detail, force) => {
    const entry = getEntry(storeKey(slug, days, detail))
    if (entry.promise || (!force && entry.data && Date.now() - entry.time < CACHE_MS)) {
        return
    }
    entry.promise = client.query({
        fetchPolicy: 'no-cache',
        query: QUERY,
        variables: {slug, days, detail}
    }).then(res => {
        const raw = res.data && res.data.userTrackingPageStats
        entry.data = raw ? JSON.parse(raw) : null
        entry.error = null
        entry.time = Date.now()
    }).catch(e => {
        entry.error = e.message || String(e)
    }).finally(() => {
        entry.promise = null
        notify(entry)
    })
    notify(entry)
}

const usePageStats = (slug, days, detail) => {
    const [, rerender] = useReducer(x => x + 1, 0)
    const key = storeKey(slug, days, detail)
    const valid = slug !== undefined && slug !== null

    useEffect(() => {
        if (!valid) return
        const entry = getEntry(key)
        entry.listeners.add(rerender)
        load(slug, days, detail)
        return () => entry.listeners.delete(rerender)
    }, [key])

    const entry = valid ? store.get(key) : null
    return {
        data: entry ? entry.data : null,
        error: entry ? entry.error : null,
        loading: !!(entry && entry.promise),
        reload: () => load(slug, days, detail, true)
    }
}

// ---------------------------------------------------------------- formatting

const nf = new Intl.NumberFormat('de-CH')
const formatNumber = n => n === null || n === undefined ? '–' : nf.format(Math.round(n))

const formatDuration = ms => {
    if (ms === null || ms === undefined) return '–'
    const s = Math.round(ms / 1000)
    if (s < 60) return s + ' s'
    const m = Math.floor(s / 60)
    return m + ':' + String(s % 60).padStart(2, '0') + ' min'
}

const formatDay = (date, withYear) => {
    const [y, m, d] = date.split('-')
    return `${parseInt(d)}.${parseInt(m)}.${withYear ? y : ''}`
}

const relativeTime = (time) => {
    const diff = Date.now() - time
    if (diff < 60 * 1000) return _t('UserTracking.editor.justNow')
    if (diff < 60 * 60 * 1000) return _t('UserTracking.editor.minutesAgo', {n: Math.floor(diff / 60000)})
    if (diff < 24 * 60 * 60 * 1000) return _t('UserTracking.editor.hoursAgo', {n: Math.floor(diff / 3600000)})
    return new Date(time).toLocaleString('de-CH', {day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'})
}

const lastVisitText = (data) => {
    if (!data) return {main: '–'}
    if (data.lastVisit) {
        return {
            main: relativeTime(data.lastVisit),
            sub: new Date(data.lastVisit).toLocaleString('de-CH')
        }
    }
    if (data.lastActiveDate) {
        return {main: formatDay(data.lastActiveDate, true), sub: _t('UserTracking.editor.olderThanDay')}
    }
    return {main: '–', sub: _t('UserTracking.editor.noViews')}
}

/** change in percent against the previous period, null if not comparable */
const trend = (current, previous) => {
    if (current === null || current === undefined || previous === null || previous === undefined) return null
    if (!previous) return current > 0 ? {label: _t('UserTracking.editor.new'), up: true} : null
    const pct = Math.round((current - previous) / previous * 100)
    return {label: (pct > 0 ? '↑ ' : pct < 0 ? '↓ ' : '') + Math.abs(pct) + ' %', up: pct > 0, down: pct < 0}
}

// ---------------------------------------------------------------- toolbar button

const StyledToolbarButton = styled('button', {
    shouldForwardProp: prop => prop !== 'active'
})(({theme, active}) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 28,
    padding: '0 10px',
    marginRight: theme.spacing(1),
    border: 'none',
    borderRadius: 14,
    cursor: 'pointer',
    color: 'inherit',
    font: 'inherit',
    fontSize: '0.8125rem',
    whiteSpace: 'nowrap',
    background: active ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.14)',
    transition: 'background 0.15s ease',
    '&:hover': {background: 'rgba(255,255,255,0.24)'}
}))

const Sparkline = ({values, width = 44, height = 14}) => {
    if (!values || values.length < 2) return null
    const max = Math.max(...values, 1)
    const step = width / (values.length - 1)
    const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 1 - v / max * (height - 2)).toFixed(1)}`).join(' ')
    return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <polyline fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" points={points}/>
    </svg>
}

export const AnalyticsToolbarButton = ({slug, active, onClick}) => {
    const {data} = usePageStats(slug, 30, false)
    const t = data ? trend(data.current.views, data.previous.views) : null
    return <StyledToolbarButton type="button" active={active} onClick={onClick}
                                title={_t('UserTracking.editor.buttonTitle')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19h16"/>
            <path d="M4 15l4 -6l4 2l4 -5l4 4"/>
        </svg>
        {data ? <>
            <span>{formatNumber(data.current.views)} · 30 T</span>
            <Sparkline values={data.series.map(d => d.views)}/>
            {t && <span style={{opacity: 0.85}}>{t.label}</span>}
        </> : <span>{_t('UserTracking.editor.title')}</span>}
    </StyledToolbarButton>
}

// ---------------------------------------------------------------- panel

const Panel = styled('div')(({theme}) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.5, 2),
    // fills the box exactly, the chart takes the remaining height (no scrollbar)
    height: '100%',
    boxSizing: 'border-box',
    fontFamily: theme.typography.fontFamily,
    fontSize: '0.8125rem',
    color: theme.palette.text.primary
}))

const Header = styled('div')({
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
})

const Segment = styled('button', {
    shouldForwardProp: prop => prop !== 'selected'
})(({theme, selected}) => ({
    font: 'inherit',
    fontSize: '0.75rem',
    padding: '3px 10px',
    borderRadius: theme.shape.borderRadius,
    cursor: 'pointer',
    border: `1px solid ${selected ? 'transparent' : theme.palette.divider}`,
    background: selected ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
    color: selected ? theme.palette.primary.main : theme.palette.text.secondary,
    fontWeight: selected ? 600 : 400
}))

const Tiles = styled('div')({
    flexShrink: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 10
})

const Tile = styled('div')(({theme}) => ({
    background: alpha(theme.palette.text.primary, 0.04),
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1, 1.5),
    minWidth: 0
}))

const TileLabel = styled('div')(({theme}) => ({
    fontSize: '0.75rem',
    color: theme.palette.text.secondary
}))

const TileValue = styled('div')({
    fontSize: '1.25rem',
    fontWeight: 600,
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
})

const TileSub = styled('div', {
    shouldForwardProp: prop => prop !== 'tone'
})(({theme, tone}) => ({
    fontSize: '0.75rem',
    color: tone === 'up' ? theme.palette.success.main : tone === 'down' ? theme.palette.error.main : theme.palette.text.secondary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
}))

const Kpi = ({label, value, sub, tone, children}) => <Tile>
    <TileLabel>{label}</TileLabel>
    <TileValue>{value}</TileValue>
    {children}
    {sub && <TileSub tone={tone} title={typeof sub === 'string' ? sub : undefined}>{sub}</TileSub>}
</Tile>

const TrendKpi = ({label, value, current, previous, format, invert}) => {
    const t = trend(current, previous)
    let tone
    if (t) tone = (invert ? t.down : t.up) ? 'up' : (invert ? t.up : t.down) ? 'down' : undefined
    return <Kpi label={label} value={value}
                sub={t ? `${t.label} ${_t('UserTracking.editor.vsPrevious')}` : (previous !== null && previous !== undefined ? `${_t('UserTracking.editor.previous')}: ${format(previous)}` : null)}
                tone={tone}/>
}

const Chart = ({series, previousSeries}) => {
    const theme = useTheme()
    const ref = useRef(null)
    const [hover, setHover] = useState(null)
    const n = series.length
    if (!n) return null

    const values = series.map(d => d.views)
    const max = Math.max(...values, ...(previousSeries || []), 1)
    const W = 1000, H = 100
    const barW = W / n
    const gap = n > 120 ? 0 : barW * 0.2
    const prevPoints = previousSeries && previousSeries.length === n
        ? previousSeries.map((v, i) => `${(i * barW + barW / 2).toFixed(1)},${(H - v / max * H).toFixed(1)}`).join(' ')
        : null

    const onMove = (e) => {
        const rect = ref.current.getBoundingClientRect()
        const idx = Math.min(n - 1, Math.max(0, Math.floor((e.clientX - rect.left) / rect.width * n)))
        setHover(idx)
    }
    const hovered = hover !== null ? series[hover] : null

    return <div style={{position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column'}}>
        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: theme.palette.text.secondary, marginBottom: 4}}>
            <span>{_t('UserTracking.editor.viewsPerDay')}</span>
            <span style={{display: 'inline-flex', alignItems: 'center', gap: 12}}>
                <span><span style={{display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: theme.palette.primary.main, marginRight: 4, verticalAlign: -1}}/>{_t('UserTracking.editor.currentPeriod')}</span>
                {prevPoints && <span><span style={{display: 'inline-block', width: 12, borderTop: `2px dashed ${theme.palette.text.disabled}`, marginRight: 4, verticalAlign: 3}}/>{_t('UserTracking.editor.previousPeriod')}</span>}
                <span>max. {formatNumber(max)}</span>
            </span>
        </div>
        <div ref={ref} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
             style={{position: 'relative', flex: 1, minHeight: 40, cursor: 'crosshair'}}>
            <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                 role="img" aria-label={_t('UserTracking.editor.viewsPerDay')}
                 style={{display: 'block', position: 'absolute', inset: 0}}>
                <line x1="0" y1={H} x2={W} y2={H} stroke={theme.palette.divider} vectorEffect="non-scaling-stroke"/>
                {values.map((v, i) => v > 0 && <rect key={i}
                                                     x={i * barW + gap / 2} width={Math.max(barW - gap, 0.5)}
                                                     y={H - v / max * H} height={v / max * H}
                                                     fill={theme.palette.primary.main}
                                                     opacity={hover === null || hover === i ? 0.85 : 0.4}/>)}
                {prevPoints && <polyline points={prevPoints} fill="none" stroke={theme.palette.text.disabled}
                                         strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke"/>}
            </svg>
            {hovered && <div style={{
                position: 'absolute', bottom: '100%', marginBottom: 4,
                left: `${(hover + 0.5) / n * 100}%`,
                transform: `translateX(${hover / n > 0.8 ? '-100%' : hover / n < 0.2 ? '0' : '-50%'})`,
                background: theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.shadows[2],
                borderRadius: theme.shape.borderRadius,
                padding: '4px 8px', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 1
            }}>
                <strong>{formatNumber(hovered.views)}</strong> {_t('UserTracking.editor.viewsShort')} · {formatDay(hovered.date, true)}
                {previousSeries && previousSeries[hover] !== undefined &&
                    <span style={{color: theme.palette.text.secondary}}> ({_t('UserTracking.editor.previous')}: {formatNumber(previousSeries[hover])})</span>}
            </div>}
        </div>
        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: theme.palette.text.secondary, marginTop: 2}}>
            <span>{formatDay(series[0].date)}</span>
            {n > 2 && <span>{formatDay(series[Math.floor(n / 2)].date)}</span>}
            <span>{_t('UserTracking.editor.today')}</span>
        </div>
    </div>
}

export const AnalyticsPanel = ({slug, height}) => {
    const theme = useTheme()
    const [days, setDays] = useState(() => {
        try {
            const v = parseInt(localStorage.getItem('UserTracking.editor.days'))
            return DAYS_OPTIONS.indexOf(v) >= 0 ? v : 30
        } catch (e) {
            return 30
        }
    })
    const {data, error, loading, reload} = usePageStats(slug, days, true)

    const changeDays = (d) => {
        setDays(d)
        try {
            localStorage.setItem('UserTracking.editor.days', d)
        } catch (e) {
        }
    }

    const last = lastVisitText(data)

    return <Panel>
        <Header>
            {DAYS_OPTIONS.map(d => <Segment key={d} type="button" selected={d === days}
                                            onClick={() => changeDays(d)}>{d} {_t('UserTracking.editor.daysShort')}</Segment>)}
            <span style={{color: theme.palette.text.secondary, marginLeft: 4}}>
                {loading && !data ? _t('UserTracking.editor.loading') : data ? _t('UserTracking.editor.comparedTo', {days}) : ''}
            </span>
            <span style={{marginLeft: 'auto', display: 'inline-flex', gap: 12, alignItems: 'center'}}>
                <Segment type="button" onClick={reload} title={_t('UserTracking.editor.reload')}
                         style={{opacity: loading ? 0.5 : 1}}>↻</Segment>
                <a href="/system/visitors/v2" target="_blank" rel="noopener"
                   style={{color: theme.palette.primary.main, textDecoration: 'none'}}>
                    {_t('UserTracking.editor.allAnalytics')} ↗
                </a>
            </span>
        </Header>

        {error && !data && <div style={{color: theme.palette.error.main}}>{_t('UserTracking.editor.error')}: {error}</div>}

        {data && <>
            <Tiles>
                <TrendKpi label={_t('UserTracking.editor.views')} value={formatNumber(data.current.views)}
                          current={data.current.views} previous={data.previous.views} format={formatNumber}/>
                <TrendKpi label={_t('UserTracking.editor.avgTime')} value={formatDuration(data.current.avgTime)}
                          current={data.current.avgTime} previous={data.previous.avgTime} format={formatDuration}/>
                <Kpi label={_t('UserTracking.editor.avgScroll')}
                     value={data.current.avgScroll === null ? '–' : data.current.avgScroll + ' %'}>
                    {data.current.avgScroll !== null && <div style={{height: 4, borderRadius: 2, background: theme.palette.divider, margin: '4px 0 2px'}}>
                        <div style={{width: Math.min(100, data.current.avgScroll) + '%', height: 4, borderRadius: 2, background: theme.palette.primary.main}}/>
                    </div>}
                </Kpi>
                <Kpi label={_t('UserTracking.editor.entriesExits')}
                     value={`${formatNumber(data.current.entries)} / ${formatNumber(data.current.exits)}`}
                     sub={data.current.views ? _t('UserTracking.editor.entryRate', {n: Math.round(data.current.entries / data.current.views * 100)}) : null}/>
                <Kpi label={_t('UserTracking.editor.lastVisit')} value={last.main} sub={last.sub}/>
            </Tiles>
            {data.current.views === 0 && data.previous.views === 0 &&
                <div style={{color: theme.palette.text.secondary}}>{_t('UserTracking.editor.empty')}</div>}
            <Chart series={data.series} previousSeries={data.previousSeries}/>
        </>}
    </Panel>
}
