/*
 * Excel ui in plain DOM (no framework), shared by
 *  - the admin form fields (components/ExcelFields.js, uitype excelPreview)
 *  - the cms page digithal/jahresbericht-import (loads it on demand with _app_.excelUi(), see ../client.js)
 *
 * rangePicker(box, grid, options)  the sheet as grid (api system/excel2html format=grid): drag = new range,
 *                                  edges / corners = adjust the range, lower edge of the yellow box or a click on a
 *                                  row number = header rows
 * previewTable(data, options)      table of the api format=data (with layout=1) as on the website, desktop or phone
 *                                  (mobile modes scroll / switch / cards like digithal/element/jahresbericht/bereich)
 * The styles are added to the document once (all classes start with xlui-).
 */
import {colLetters, parseRange} from './excel.mjs'

const esc = v => String(v === undefined || v === null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag)
    Object.keys(attrs).forEach(k => {
        const v = attrs[k]
        if (v === null || v === undefined || v === false) return
        if (k === 'class') node.className = v
        else if (k === 'html') node.innerHTML = v
        else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v)
        else node.setAttribute(k, v === true ? '' : v)
    })
    ;[].concat(children).flat(Infinity).forEach(c => {
        if (c === null || c === undefined || c === false) return
        node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c)
    })
    return node
}

// ---------- styles ----------

const GREEN = '#239442', LIGHT = '#ecf2d0', INK = '#241c15'
const switchRules = (prefix, display) => {
    const sel = []
    for (let i = 0; i < 24; i++) sel.push(`${prefix}[data-sel="${i}"] .c${i}`)
    return sel.join(',') + `{display:${display};flex:0 0 auto}`
}
const CSS = `
.xlui-grid-bar{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem 1rem;margin-bottom:.5rem;font-size:.82rem}
.xlui-hint{color:#666}
.xlui-grid-info{font-weight:600;color:${GREEN}}
.xlui-btn{font:inherit;font-size:.8rem;font-weight:600;padding:.3em .8em;border-radius:4px;border:1px solid ${GREEN};background:#fff;color:${GREEN};cursor:pointer;margin-left:auto}
.xlui-grid-scroll{position:relative;max-height:26rem;overflow:auto;border:1px solid #e3e8d0;user-select:none;background:#fff;color:#333}
.xlui-grid-table{border-collapse:collapse;font-size:.72rem;line-height:1.25;table-layout:fixed}
.xlui-grid-table td{border:1px solid #edf0e4;padding:.2em .35em;width:6.5rem;max-width:6.5rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:cell}
.xlui-grid-table td.n{text-align:right}
.xlui-grid-table td.b{font-weight:700}
.xlui-grid-table th{position:sticky;background:#f1f4e6;color:#6b7752;font-weight:600;border:1px solid #e3e8d0;padding:.2em .35em;z-index:2}
.xlui-grid-table thead th{top:0}
.xlui-grid-table th.xlui-row{left:0;min-width:2.4rem;text-align:right;cursor:pointer;z-index:3}
.xlui-grid-table th.xlui-row:hover{background:#dff0c8;color:#1b6e30}
.xlui-grid-table th.xlui-corner{left:0;z-index:4}
.xlui-grid-table .xlui-hidden,.xlui-grid-table tr.xlui-hidden td{color:#bbb;background:repeating-linear-gradient(45deg,#fafafa,#fafafa 4px,#f0f0f0 4px,#f0f0f0 8px)}
.xlui-sel,.xlui-head{position:absolute;display:none;pointer-events:none;z-index:1}
.xlui-sel{border:2px solid ${GREEN};background:rgba(35,148,66,.08)}
.xlui-head{background:rgba(224,168,0,.18)}
.xlui-h{position:absolute;pointer-events:auto;box-sizing:border-box;z-index:2}
.xlui-h-nw,.xlui-h-ne,.xlui-h-sw,.xlui-h-se{width:10px;height:10px;background:#fff;border:2px solid ${GREEN};border-radius:2px}
.xlui-h-nw{left:-6px;top:-6px;cursor:nwse-resize}.xlui-h-ne{right:-6px;top:-6px;cursor:nesw-resize}
.xlui-h-sw{left:-6px;bottom:-6px;cursor:nesw-resize}.xlui-h-se{right:-6px;bottom:-6px;cursor:nwse-resize}
.xlui-h-n,.xlui-h-s{left:6px;right:6px;height:8px;cursor:ns-resize}.xlui-h-n{top:-5px}.xlui-h-s{bottom:-5px}
.xlui-h-e,.xlui-h-w{top:6px;bottom:6px;width:8px;cursor:ew-resize}.xlui-h-e{right:-5px}.xlui-h-w{left:-5px}
.xlui-h-n:hover,.xlui-h-s:hover,.xlui-h-e:hover,.xlui-h-w:hover{background:rgba(35,148,66,.35)}
.xlui-h-head{left:0;right:0;bottom:-4px;height:8px;cursor:ns-resize}
.xlui-h-head::after{content:'';position:absolute;left:50%;top:1px;width:2.4rem;height:6px;margin-left:-1.2rem;border-radius:3px;background:#e0a800}
.xlui-h-head:hover{background:rgba(224,168,0,.35)}
.xlui-dragging .xlui-h{pointer-events:none}
.xlui-dragging{cursor:grabbing}

.xlui-preview{color:#1d1d1d;background:#fff}
.xlui-bar{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem 1rem;margin-bottom:.6rem;font-size:.82rem}
.xlui-segs{display:inline-flex;border:1px solid ${GREEN};border-radius:4px;overflow:hidden}
.xlui-seg{font:inherit;font-size:.8rem;padding:.3em .9em;border:none;background:#fff;color:${GREEN};cursor:pointer}
.xlui-seg+.xlui-seg{border-left:1px solid ${GREEN}}
.xlui-seg.active{background:${GREEN};color:#fff;font-weight:600}
.xlui-table{width:100%;border-collapse:collapse;font-size:.85rem;line-height:1.35;margin-bottom:.5rem}
.xlui-table th{color:${GREEN};text-transform:uppercase;font-size:.78rem;font-weight:600;text-align:left;padding:.45em .5em;border-bottom:2px solid ${INK}}
.xlui-table td{padding:.4em .5em;border-bottom:1px solid ${INK};vertical-align:top}
.xlui-table .num{text-align:right;white-space:nowrap}
.xlui-table .bold{font-weight:700}
.xlui-table .al-left{text-align:left}.xlui-table .al-center{text-align:center}.xlui-table .al-right{text-align:right}
.xlui-table tr.sum td{font-weight:700;background:${LIGHT};border-top:2px solid ${GREEN};border-bottom:2px solid ${GREEN}}
.xlui-table tr.section td{font-weight:700;padding-top:1em}
.xlui-table tr.text td{border-bottom:none;padding-top:1em;font-weight:400;text-align:left;white-space:normal}
.xlui-table tr.text td p{margin:0 0 .5em}
.xlui-table th.fill,.xlui-table td.fill{background:${LIGHT}}
.xlui-list td{border-bottom-color:${GREEN}}
.xlui-list tr.sum td{background:none;border-top:none;border-bottom:1px solid ${GREEN}}
.xlui-list tr.sum td.fill{background:${LIGHT}}
.xlui-table.xl-lines tr th,.xlui-table.xl-lines tr td{border-top:none;border-bottom:none}
.xlui-table.xl-lines tr th.l-h,.xlui-table.xl-lines tr td.l-h{border-bottom:1px solid rgba(35,148,66,.35)}
.xlui-table.xl-lines tr th.l-t,.xlui-table.xl-lines tr td.l-t{border-bottom:1px solid ${GREEN}}
.xlui-table.xl-lines tr th.l-m,.xlui-table.xl-lines tr td.l-m{border-bottom:2px solid ${INK}}
.xlui-more{color:#666;font-size:.8rem}

.xlui-phone{width:375px;max-width:100%;margin:0 auto;border:10px solid #222;border-radius:26px;padding:14px 12px;max-height:640px;overflow-y:auto;background:#fff;box-sizing:border-box;font-size:13px}
.xlui-phone-scroll{overflow-x:auto}
.xlui-phone .xlui-table{font-size:12px}
.xlui-phone .xlui-table tr.note{display:none}
.xlui-notes{font-size:12px;line-height:1.5;margin-top:.8rem}
.xlui-notes p{margin:0 0 .7em}
.xlui-notes strong,.xlui-notes .xlui-note-head{display:block;font-weight:700}
.xlui-notes .xlui-note-head{margin-top:.8em}
.xlui-phone .jb-m-scroll .lc{position:sticky;left:0;z-index:1;background:#fff;min-width:8.5em;max-width:10em;box-shadow:6px 0 6px -6px rgba(0,0,0,.25)}
.xlui-phone .jb-m-scroll tr.sum .lc,.xlui-phone .jb-m-scroll .lc.fill{background:${LIGHT}}
.xlui-colswitch{display:flex;gap:.35em;overflow-x:auto;margin:0 0 .7rem;padding-bottom:.25em}
.xlui-colswitch-btn{flex:0 0 auto;font:inherit;font-size:11.5px;padding:.45em .8em;border:1px solid ${GREEN};border-radius:999px;background:#fff;color:${GREEN};cursor:pointer;white-space:nowrap}
.xlui-colswitch-btn.active{background:${GREEN};color:#fff;font-weight:600}
.xlui-phone .xlui-table.jb-m-switch,.xlui-phone .jb-m-switch thead,.xlui-phone .jb-m-switch tbody{display:block;width:100%}
.xlui-phone .jb-m-switch tr{display:flex;align-items:stretch}
.xlui-phone .jb-m-switch th,.xlui-phone .jb-m-switch td{display:block}
.xlui-phone .jb-m-switch .lc{flex:1 1 auto;min-width:0}
.xlui-phone .jb-m-switch .vc,.xlui-phone .jb-m-switch .sp{display:none}
${switchRules('.xlui-phone .jb-m-switch', 'block')}
.xlui-phone .jb-m-switch tr:not(.sum) .vc.fill{background:none}
.xlui-phone .jb-m-switch tr.tx{display:block}
.xlui-phone .jb-m-switch tr.tx>td:not(.e){display:block}
.xlui-phone .xlui-table.jb-m-switch tr.tx>td{padding-top:.2em;padding-bottom:.2em;border:none}
.xlui-phone .xlui-table.jb-m-cards,.xlui-phone .jb-m-cards thead,.xlui-phone .jb-m-cards tbody,.xlui-phone .jb-m-cards tr{display:block;width:100%;box-sizing:border-box}
.xlui-phone .jb-m-cards th,.xlui-phone .jb-m-cards td{display:block}
.xlui-phone .jb-m-cards tr.colhead,.xlui-phone .jb-m-cards .sp{display:none}
.xlui-phone .xlui-table.jb-m-cards.jb-m-cards tr th,.xlui-phone .xlui-table.jb-m-cards.jb-m-cards tr td{border:none;background:none;padding:.12em 0;text-align:left;white-space:normal}
.xlui-phone .jb-m-cards tr{padding:.7em 0;border-bottom:1px solid ${GREEN}}
.xlui-phone .jb-m-cards tr.sum{background:${LIGHT};padding-left:.6em;padding-right:.6em}
.xlui-phone .xlui-list.jb-m-cards tr.sum{background:none;padding-left:0;padding-right:0}
.xlui-phone .xlui-table.jb-m-cards.jb-m-cards tr td.lc{font-weight:700;padding-bottom:.3em}
.xlui-phone .xlui-table.jb-m-cards.jb-m-cards tr td.vc{display:flex;justify-content:space-between;gap:1em;text-align:right}
.xlui-phone .jb-m-cards td.vc::before{content:attr(data-label);text-align:left;font-weight:400;color:#555}
.xlui-phone .xlui-table.jb-m-cards.jb-m-cards tr td.vc.fill{font-weight:700}
.xlui-phone .xlui-table.jb-m-cards.jb-m-cards tr td.e,.xlui-phone .xlui-table.jb-m-cards.jb-m-cards tr th.e{display:none}
.xlui-phone .xlui-table.jb-m-cards.jb-m-cards tr.tx td.vc{display:block;text-align:left}
.xlui-phone .jb-m-cards tr.tx td.vc::before{content:none}
`
let stylesAdded = false
export const injectStyles = () => {
    if (stylesAdded || typeof document === 'undefined') return
    stylesAdded = true
    document.head.appendChild(el('style', {'data-xlui': ''}, CSS))
}

// ---------- preview ----------

export const MOBILE_MODES = ['scroll', 'switch', 'cards']
export const MOBILE_NAMES = {scroll: 'seitlich wischen', switch: 'Spaltenumschalter', cards: 'Karten'}
// mode on the phone: field mobileView, auto = up to 4 value columns scroll, otherwise switch (as on the website)
export const mobileMode = (data, mobileView) => MOBILE_MODES.includes(mobileView) ? mobileView : ((data.cols || []).length > 4 ? 'switch' : 'scroll')
// '.vc.c3' (classes of the api in the syntax of the cms templates) -> 'vc c3'
const mcClass = mc => (mc || '').split('.').filter(Boolean).join(' ')

/**
 * @param data    response of the api format=data (with layout=1 for the phone)
 * @param options variant ('statement' | 'list'), view ('desktop' | 'phone'), mobileView, col (selected column of the
 *                switch), onCol(i), viewSwitch (show the buttons Desktop / Handy), onView(view), maxRows
 * @returns element
 */
export const previewTable = (data, options = {}) => {
    injectStyles()
    const phone = options.view === 'phone'
    const rows = data.rows || []
    const cols = data.cols || []
    const mode = phone ? mobileMode(data, options.mobileView) : ''
    const sel = options.col !== undefined && options.col !== null && options.col < cols.length ? options.col : (data.defaultCol || 0)
    const max = options.maxRows || (phone ? 40 : 80)
    const cell = (tag, c) => el(tag, {
        class: [c.n ? 'num' : '', c.b ? 'bold' : '', c.a ? 'al-' + c.a : '', c.f ? 'fill' : '', c.l ? 'l-' + c.l : '', phone ? mcClass(c.mc) : '']
            .filter(Boolean).join(' ') || null,
        colspan: c.span > 1 ? c.span : null, rowspan: c.rowspan > 1 ? c.rowspan : null,
        'data-label': phone && c.ml ? c.ml : null,
        // rich text (e.g. a bold first line) and text boxes of the sheet come as html (escaped by the api)
        html: c.h || null
    }, c.h ? null : c.v)
    const header = (data.header || []).map(r => Array.isArray(r) ? r : (r.cells || []))
    const headerMc = data.headerMc || []
    let content
    if (rows.length || header.length) {
        content = el('table', {
            class: 'xlui-table' + (options.variant === 'list' ? ' xlui-list' : '') + (data.lines ? ' xl-lines' : '') + (mode ? ' jb-m-' + mode : ''),
            'data-sel': mode === 'switch' ? sel : null
        }, [
            el('thead', {}, header.map((r, i) => el('tr', {class: phone ? mcClass(headerMc[i]) || null : null}, r.filter(Boolean).map(c => cell('th', c))))),
            el('tbody', {}, rows.slice(0, max).map(r => el('tr', {
                class: [r.sum ? 'sum' : '', r.section ? 'section' : '', r.text ? 'text' : '', phone ? mcClass(r.mc) : ''].filter(Boolean).join(' ') || null
            }, (r.cells || []).filter(Boolean).map(c => cell('td', c)))))
        ])
    } else {
        content = el('div', {class: 'xlui-hint'}, options.emptyText || 'Im gewählten Ausschnitt sind keine Werte.')
    }
    const viewBtn = (view, label) => el('button', {
        type: 'button', class: 'xlui-seg' + ((options.view || 'desktop') === view ? ' active' : ''),
        onClick: () => options.onView && options.onView(view)
    }, label)
    const notes = phone && (data.notes || []).length ? el('div', {class: 'xlui-notes'}, data.notes.map(n => el('p', {
        html: (n.head ? '<b class="xlui-note-head">' + n.head + '</b>' : '') + (n.term ? '<strong>' + n.term + '</strong>' : '') + n.text
    }))) : null
    return el('div', {class: 'xlui-preview'}, [
        options.viewSwitch ? el('div', {class: 'xlui-bar'}, [
            el('span', {class: 'xlui-segs'}, [viewBtn('desktop', 'Desktop'), viewBtn('phone', 'Handy')]),
            phone ? el('span', {class: 'xlui-hint'}, 'Handy: ' + MOBILE_NAMES[mode] + (MOBILE_MODES.includes(options.mobileView) ? '' : ' (automatisch)')) : null
        ]) : null,
        phone ? el('div', {class: 'xlui-phone'}, [
            mode === 'switch' ? el('div', {class: 'xlui-colswitch'}, cols.map((c, i) => el('button', {
                type: 'button', class: 'xlui-colswitch-btn' + (i === sel ? ' active' : ''),
                onClick: () => options.onCol && options.onCol(i)
            }, c.label || 'Spalte ' + (i + 1)))) : null,
            el('div', {class: 'xlui-phone-scroll'}, content),
            notes
        ]) : content,
        rows.length > max ? el('div', {class: 'xlui-more'}, `… und ${rows.length - max} weitere Zeilen`) : null
    ])
}


// ---------- range picker ----------

/**
 * The sheet as grid. Rendered as one html string, the selection is shown with two positioned boxes (no class changes
 * on the cells), while dragging at most once per animation frame.
 * @param box      container (its content is replaced)
 * @param grid     response of the api format=grid
 * @param options  range ('A4:H38' or ''), fullRange (used range of the sheet, default: from the grid), headerRows,
 *                 onPick(range, headerRows) (headerRows null = unchanged)
 * @returns {sync(range, headerRows)} to update the marking after a change in the fields
 */
export const rangePicker = (box, grid, options) => {
    injectStyles()
    let headerRowsValue = parseInt(options.headerRows) || 0
    let firstRow = 0, firstCol = 0, lastRow = 0, lastCol = 0
    grid.rows.forEach(row => row.cells.forEach((c, i) => {
        if (c) {
            if (!firstRow || row.r < firstRow) firstRow = row.r
            if (!firstCol || i + 1 < firstCol) firstCol = i + 1
            lastRow = Math.max(lastRow, row.r)
            lastCol = Math.max(lastCol, i + 1)
        }
    }))
    // «ganzes Blatt»: the used range (given, or the cells with a value in the grid)
    const full = parseRange(options.fullRange) || (firstRow ? {top: firstRow, left: firstCol, bottom: lastRow, right: lastCol} : null)
    // only the used part of the sheet (+ 1 empty row / column)
    lastRow = Math.min(grid.rows.length, lastRow + 1)
    lastCol = Math.min(grid.cols, lastCol + 1)
    const hidden = new Set(grid.hiddenCols || [])
    let html = '<table class="xlui-grid-table"><thead><tr><th class="xlui-corner"></th>'
    for (let c = 1; c <= lastCol; c++) html += `<th${hidden.has(c) ? ' class="xlui-hidden"' : ''}>${colLetters(c)}</th>`
    html += '</tr></thead><tbody>'
    for (let i = 0; i < lastRow; i++) {
        const row = grid.rows[i]
        html += `<tr${row.hidden ? ' class="xlui-hidden"' : ''}><th class="xlui-row" data-r="${row.r}" title="Titelzeilen bis hier">${row.r}</th>`
        for (let c = 1; c <= lastCol; c++) {
            const cell = row.cells[c - 1]
            html += `<td data-r="${row.r}" data-c="${c}"${cell ? ` class="${cell.n ? 'n' : ''}${cell.b ? ' b' : ''}" title="${esc(cell.v)}"` : ''}>${cell ? esc(cell.v) : ''}</td>`
        }
        html += '</tr>'
    }
    html += '</tbody></table>'
    const wrap = el('div', {class: 'xlui-grid-scroll', html})
    const table = wrap.firstChild
    // handles: edges and corners of the range (only these sides change), lower edge of the header rows
    const selBox = el('div', {class: 'xlui-sel'}, ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'].map(d => el('span', {class: 'xlui-h xlui-h-' + d, 'data-h': d})))
    const headBox = el('div', {class: 'xlui-head'}, el('span', {class: 'xlui-h xlui-h-head', 'data-h': 'head', title: 'Titelzeilen: ziehen'}))
    wrap.append(headBox, selBox)
    const info = el('span', {class: 'xlui-grid-info'})
    box.replaceChildren(el('div', {class: 'xlui-grid-bar'}, [
        el('span', {class: 'xlui-hint'}, 'Ziehen = neuer Ausschnitt · Ränder / Ecken ziehen = anpassen · gelbe Kante ziehen oder Klick auf Zeilennummer = Titelzeilen'),
        info,
        full ? el('button', {type: 'button', class: 'xlui-btn', onClick: () => pick(full, null)}, 'ganzes Blatt') : null
    ]), wrap)

    const td = (r, c) => table.querySelector(`td[data-r="${r}"][data-c="${c}"]`)
    // empty and hidden rows do not count as header rows (as in the api)
    const rowUsed = (r, range) => {
        const row = grid.rows[r - 1]
        if (!row || row.hidden) return false
        for (let c = range.left; c <= range.right; c++) if (row.cells[c - 1]) return true
        return false
    }
    const headerEnd = (range, n) => {
        let r = range.top - 1
        while (n > 0 && r < range.bottom) {
            r++
            if (rowUsed(r, range)) n--
        }
        return r
    }
    const countHeader = (range, r) => {
        let n = 0
        for (let y = range.top; y <= r; y++) if (rowUsed(y, range)) n++
        return n
    }
    let current = parseRange(options.range) || full
    const place = (node, range, toRow) => {
        const a = td(range.top, range.left), b = td(Math.min(toRow, lastRow), Math.min(range.right, lastCol))
        if (!a || !b || toRow < range.top) {
            node.style.display = 'none'
            return
        }
        node.style.display = 'block'
        node.style.left = a.offsetLeft + 'px'
        node.style.top = a.offsetTop + 'px'
        node.style.width = (b.offsetLeft + b.offsetWidth - a.offsetLeft) + 'px'
        node.style.height = (b.offsetTop + b.offsetHeight - a.offsetTop) + 'px'
    }
    const rangeText = range => range ? `${colLetters(range.left)}${range.top}:${colLetters(range.right)}${range.bottom}` : ''
    const show = (range, headerRows) => {
        if (!range) {
            selBox.style.display = headBox.style.display = 'none'
            info.textContent = ''
            return
        }
        const hr = headerRows !== undefined && headerRows !== null ? headerRows : headerRowsValue
        place(selBox, range, range.bottom)
        place(headBox, range, headerEnd(range, hr))
        info.textContent = `${rangeText(range)} · ${hr} Titelzeile(n)`
    }
    const pick = (range, headerRows) => {
        current = range
        if (headerRows !== null && headerRows !== undefined) headerRowsValue = headerRows
        options.onPick(rangeText(range), headerRows)
        show(range)
    }
    const fromEvent = e => {
        const t = e.target.closest && e.target.closest('td[data-r]')
        return t ? {r: parseInt(t.dataset.r), c: parseInt(t.dataset.c)} : null
    }
    const rangeOf = (a, b) => ({top: Math.min(a.r, b.r), bottom: Math.max(a.r, b.r), left: Math.min(a.c, b.c), right: Math.max(a.c, b.c)})
    // one routine for all drags: compute(cell under the mouse) -> {range, headerRows}; taken over on mouse up
    let frame = 0
    const drag = (compute, first) => {
        let last = first || null
        if (last) show(last.range, last.headerRows)
        wrap.classList.add('xlui-dragging')
        const move = ev => {
            const q = fromEvent(ev)
            if (!q) return
            last = compute(q)
            if (!frame) frame = requestAnimationFrame(() => {
                frame = 0
                show(last.range, last.headerRows)
            })
        }
        const up = () => {
            table.removeEventListener('mouseover', move)
            window.removeEventListener('mouseup', up)
            wrap.classList.remove('xlui-dragging')
            if (last) pick(last.range, last.headerRows)
        }
        table.addEventListener('mouseover', move)
        window.addEventListener('mouseup', up)
    }
    // new range from a cell (shift + click: the current range from its top left corner to this cell)
    table.addEventListener('mousedown', e => {
        const p = fromEvent(e)
        if (!p || e.button !== 0) return
        e.preventDefault()
        const start = e.shiftKey && current ? {r: current.top, c: current.left} : p
        drag(q => ({range: rangeOf(start, q), headerRows: null}), {range: rangeOf(start, p), headerRows: null})
    })
    // handles: an edge / corner changes only its sides, the edge of the header box the header rows
    wrap.addEventListener('mousedown', e => {
        const handle = e.target.closest && e.target.closest('.xlui-h')
        if (!handle || !current || e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        const d = handle.dataset.h, base = current
        if (d === 'head') {
            drag(q => ({range: base, headerRows: q.r < base.top ? 0 : countHeader(base, Math.min(q.r, base.bottom))}))
            return
        }
        drag(q => {
            const r = Object.assign({}, base)
            if (d.includes('n')) r.top = q.r
            if (d.includes('s')) r.bottom = q.r
            if (d.includes('w')) r.left = q.c
            if (d.includes('e')) r.right = q.c
            return {range: rangeOf({r: r.top, c: r.left}, {r: r.bottom, c: r.right}), headerRows: null}
        })
    })
    // row number: header rows from the top of the range down to this row
    table.addEventListener('click', e => {
        const th = e.target.closest && e.target.closest('th.xlui-row')
        if (!th || !current) return
        const r = parseInt(th.dataset.r)
        if (r < current.top || r > current.bottom) return
        pick(current, countHeader(current, r))
    })
    // positions are only known once the table is in the document (also when the box is inserted after this call)
    requestAnimationFrame(() => {
        show(current)
        const a = current && td(current.top, current.left)
        if (a) wrap.scrollTop = Math.max(0, a.offsetTop - 40)
    })
    return {
        sync: (range, headerRows) => {
            current = parseRange(range) || full
            headerRowsValue = parseInt(headerRows) || 0
            show(current)
        }
    }
}
