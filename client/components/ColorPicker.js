import React from 'react'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import ClearIcon from '@mui/icons-material/Clear'
import ColorizeIcon from '@mui/icons-material/Colorize'

/*
 Color picker form field (GenericForm uitype "color_picker").
 Loaded lazily (own chunk "colorpicker"), no external dependencies.

 Field options:
 - presets: list of colors shown as swatches (default: some neutral colors)
 - alpha: false to hide the opacity slider (default true)
 - placeholder, helperText, readOnly, fullWidth

 The value is stored as string: #rrggbb or #rrggbbaa (with opacity). Any other css color
 (rgb(), named colors, var(--x)) can be typed into the text field and is kept as it is.
 */

const DEFAULT_PRESETS = ['#ffffff', '#f2f2f2', '#d9d9d9', '#a6a6a6', '#7f7f7f', '#4a4a4a', '#262626', '#000000',
    '#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#16a085', '#2980b9', '#8e44ad', 'transparent']

const CHECKER = 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 10px 10px'

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v))
const toHex2 = n => Math.round(n).toString(16).padStart(2, '0')

let parseCtx
// parse any css color into {r,g,b,a} (null if invalid or not resolvable, e.g. var(--x))
const parseColor = (str) => {
    if (!str || typeof str !== 'string') return null
    str = str.trim()
    let m = str.match(/^#?([0-9a-f]{3,8})$/i)
    if (m && [3, 4, 6, 8].indexOf(m[1].length) >= 0) {
        let h = m[1]
        if (h.length <= 4) h = h.split('').map(c => c + c).join('')
        return {
            r: parseInt(h.substr(0, 2), 16),
            g: parseInt(h.substr(2, 2), 16),
            b: parseInt(h.substr(4, 2), 16),
            a: h.length === 8 ? parseInt(h.substr(6, 2), 16) / 255 : 1
        }
    }
    if (typeof document === 'undefined') return null
    if (!parseCtx) {
        parseCtx = document.createElement('canvas').getContext('2d')
    }
    // the canvas ignores invalid values -> test with two different defaults
    parseCtx.fillStyle = '#000'
    parseCtx.fillStyle = str
    const first = parseCtx.fillStyle
    parseCtx.fillStyle = '#fff'
    parseCtx.fillStyle = str
    if (first !== parseCtx.fillStyle) return null
    if (first[0] === '#') return parseColor(first)
    m = first.match(/rgba?\(([^)]+)\)/)
    if (m) {
        const [r, g, b, a] = m[1].split(',').map(s => parseFloat(s))
        return {r, g, b, a: isNaN(a) ? 1 : a}
    }
    return null
}

const rgbToHsv = ({r, g, b, a}) => {
    r /= 255; g /= 255; b /= 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    let h = 0
    if (d) {
        if (max === r) h = ((g - b) / d) % 6
        else if (max === g) h = (b - r) / d + 2
        else h = (r - g) / d + 4
        h *= 60
        if (h < 0) h += 360
    }
    return {h, s: max ? d / max : 0, v: max, a}
}

const hsvToRgb = ({h, s, v, a}) => {
    const f = n => {
        const k = (n + h / 60) % 6
        return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255
    }
    return {r: f(5), g: f(3), b: f(1), a}
}

const hsvToHex = (hsv) => {
    const {r, g, b, a} = hsvToRgb(hsv)
    return '#' + toHex2(r) + toHex2(g) + toHex2(b) + (a < 1 ? toHex2(a * 255) : '')
}

// pointer drag helper: calls cb(x,y) with relative values 0..1, onEnd after release
const startDrag = (e, el, cb, onEnd) => {
    if (!el) return
    e.preventDefault()
    const move = ev => {
        const rect = el.getBoundingClientRect()
        cb(clamp((ev.clientX - rect.left) / rect.width), clamp((ev.clientY - rect.top) / rect.height))
    }
    const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        onEnd && onEnd()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    move(e)
}

const sliderStyle = {
    position: 'relative', height: 12, borderRadius: 6, marginTop: 12, cursor: 'pointer', touchAction: 'none'
}
const thumbStyle = (left) => ({
    position: 'absolute', top: '50%', left: (left * 100) + '%', width: 14, height: 14, borderRadius: '50%',
    border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', transform: 'translate(-50%,-50%)',
    pointerEvents: 'none', boxSizing: 'border-box'
})

const ColorPanel = ({hsv, setHsv, commit, alpha, presets, onPreset}) => {
    const areaRef = React.useRef(), hueRef = React.useRef(), alphaRef = React.useRef()
    const {r, g, b} = hsvToRgb({...hsv, a: 1})
    const opaque = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`

    return <div style={{width: 232, padding: 12, userSelect: 'none'}}>
        <div ref={areaRef}
             onPointerDown={e => startDrag(e, areaRef.current, (x, y) => setHsv(c => ({...c, s: x, v: 1 - y})), commit)}
             style={{
                 position: 'relative', height: 150, borderRadius: 4, cursor: 'crosshair', touchAction: 'none',
                 background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hsv.h},100%,50%)`
             }}>
            <div style={{...thumbStyle(hsv.s), top: ((1 - hsv.v) * 100) + '%', background: opaque}}/>
        </div>
        <div ref={hueRef}
             onPointerDown={e => startDrag(e, hueRef.current, x => setHsv(c => ({...c, h: x * 360})), commit)}
             style={{
                 ...sliderStyle,
                 background: 'linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)'
             }}>
            <div style={{...thumbStyle(hsv.h / 360), background: `hsl(${hsv.h},100%,50%)`}}/>
        </div>
        {alpha !== false && <div ref={alphaRef}
                                 onPointerDown={e => startDrag(e, alphaRef.current, x => setHsv(c => ({...c, a: Math.round(x * 100) / 100})), commit)}
                                 style={{...sliderStyle, background: CHECKER}}>
            <div style={{position: 'absolute', inset: 0, borderRadius: 6, background: `linear-gradient(to right, transparent, ${opaque})`}}/>
            <div style={{...thumbStyle(hsv.a), background: opaque}}/>
        </div>}
        {presets && presets.length > 0 && <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12}}>
            {presets.map(p => {
                const color = typeof p === 'string' ? p : p.value
                const name = typeof p === 'string' ? p : (p.name || p.value)
                return <Tooltip key={color} title={name}>
                    <button type="button" onClick={() => onPreset(color)}
                            style={{
                                width: 20, height: 20, padding: 0, borderRadius: 3, cursor: 'pointer',
                                border: '1px solid rgba(0,0,0,0.25)', background: `linear-gradient(${color},${color}), ${CHECKER}`
                            }}/>
                </Tooltip>
            })}
        </div>}
    </div>
}

const ColorPicker = ({
                         name, label, value, onChange, onBlur, sx, className, fullWidth, readOnly,
                         placeholder, helperText, error, presets, alpha, languageCode, endAdornment
                     }) => {
    const [anchor, setAnchor] = React.useState(null)
    const [hsv, setHsvState] = React.useState(() => rgbToHsv(parseColor(value) || {r: 74, g: 74, b: 74, a: 1}))
    const hsvRef = React.useRef(hsv)
    const strValue = value || ''

    // keep the panel in sync when the value is changed from outside / typed in
    React.useEffect(() => {
        const parsed = parseColor(strValue)
        if (parsed && hsvToHex(hsvRef.current) !== hsvToHex(rgbToHsv(parsed))) {
            hsvRef.current = rgbToHsv(parsed)
            setHsvState(hsvRef.current)
        }
    }, [strValue])

    const emit = (newValue) => {
        if (onChange) {
            onChange({target: {name, value: newValue, dataset: {language: languageCode}}})
        }
    }

    // live preview while dragging, the form value is only written on release (the whole form re-renders on change)
    const setHsv = (fn) => {
        hsvRef.current = typeof fn === 'function' ? fn(hsvRef.current) : fn
        setHsvState(hsvRef.current)
    }
    const commit = () => emit(hsvToHex(hsvRef.current))

    const previewColor = anchor ? hsvToHex(hsv) : strValue
    const canEyeDrop = typeof window !== 'undefined' && !!window.EyeDropper

    return <>
        <TextField name={name}
                   label={label}
                   value={anchor ? previewColor : strValue}
                   placeholder={placeholder || '#rrggbb'}
                   helperText={helperText}
                   error={error}
                   className={className}
                   sx={sx}
                   fullWidth={fullWidth}
                   onBlur={onBlur}
                   onChange={e => emit(e.target.value)}
                   slotProps={{
                       inputLabel: {shrink: true},
                       htmlInput: {readOnly, spellCheck: false, 'data-language': languageCode},
                       input: {
                           startAdornment: <InputAdornment position="start">
                               <button type="button"
                                       aria-label="Farbe wählen"
                                       disabled={readOnly}
                                       onClick={e => setAnchor(e.currentTarget)}
                                       style={{
                                           width: 26, height: 26, padding: 0, borderRadius: 4, cursor: readOnly ? 'default' : 'pointer',
                                           border: '1px solid rgba(0,0,0,0.3)',
                                           background: previewColor ? `linear-gradient(${previewColor},${previewColor}), ${CHECKER}` : CHECKER
                                       }}/>
                           </InputAdornment>,
                           endAdornment: <InputAdornment position="end">
                               {canEyeDrop && !readOnly && <IconButton size="small" title="Farbe vom Bildschirm übernehmen"
                                                                      onClick={() => {
                                                                          new window.EyeDropper().open().then(res => emit(res.sRGBHex)).catch(() => {
                                                                          })
                                                                      }}><ColorizeIcon fontSize="small"/></IconButton>}
                               {strValue && !readOnly && <IconButton size="small" title="Farbe entfernen"
                                                                     onClick={() => emit('')}><ClearIcon fontSize="small"/></IconButton>}
                               {endAdornment}
                           </InputAdornment>
                       }
                   }}/>
        <Popover open={!!anchor}
                 anchorEl={anchor}
                 onClose={() => setAnchor(null)}
                 anchorOrigin={{vertical: 'bottom', horizontal: 'left'}}
                 transformOrigin={{vertical: 'top', horizontal: 'left'}}>
            <ColorPanel hsv={hsv}
                        setHsv={setHsv}
                        commit={commit}
                        alpha={alpha}
                        presets={presets || DEFAULT_PRESETS}
                        onPreset={color => {
                            const parsed = parseColor(color)
                            if (parsed) {
                                setHsv(rgbToHsv(parsed))
                            }
                            emit(color)
                        }}/>
        </Popover>
    </>
}

export default ColorPicker
