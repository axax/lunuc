import React, {useEffect, useState} from 'react'
import {excelApiUrl, fetchExcelJson, mediaIdFromValue, parseHeaderRows, sumRowsOnly} from '../util/excel.mjs'

/*
 * Cms component ExcelTable (element «Excel-Tabelle» in extensions/cms/util/elements/advancedElements.mjs):
 * renders a sheet / cell range of an excel file (Media) as html table, loaded from the api system/excel2html (format=data).
 *
 * props: excel (Media value or id), sheet, range (e.g. A9:H38), headerRows (default 1), sumOnly, caption, emptyText
 * css classes: .excel-table (wrapper), table, .is-sum / .is-section (rows), .is-num (numeric cells)
 */
export default function ExcelTable({excel, sheet, range, headerRows, sumOnly, caption, emptyText, className, children, ...rest}) {
    const mediaId = mediaIdFromValue(excel)
    const url = mediaId ? excelApiUrl({mediaId, format: 'data', sheet, range, headerRows: parseHeaderRows(headerRows)}) : ''
    const [state, setState] = useState({data: null, error: ''})

    useEffect(() => {
        if (!url) {
            setState({data: null, error: ''})
            return
        }
        let active = true
        fetchExcelJson(url)
            .then(data => active && setState({data, error: ''}))
            .catch(e => active && setState({data: null, error: e.message}))
        return () => {
            active = false
        }
    }, [url])

    const wrapperClass = 'excel-table' + (className ? ' ' + className : '')
    const sumOnlyActive = sumOnly === true || sumOnly === 'true'
    const data = state.data && sumOnlyActive ? sumRowsOnly(state.data) : state.data

    let content
    if (!mediaId) {
        content = <p className="excel-table__message">{emptyText || 'Keine Excel-Datei gewählt'}</p>
    } else if (state.error) {
        content = <p className="excel-table__message excel-table__message--error">{state.error}</p>
    } else if (!data) {
        content = <p className="excel-table__message excel-table__message--loading" aria-busy="true"/>
    } else {
        const cell = (c, i, isHeader) => {
            const props = {
                key: i,
                className: c.n ? 'is-num' : undefined,
                colSpan: c.span || undefined,
                rowSpan: c.rowspan || undefined,
                style: c.n ? {textAlign: 'right', whiteSpace: 'nowrap'} : (c.b && !isHeader ? {fontWeight: 'bold'} : undefined)
            }
            return isHeader ? <th scope="col" {...props}>{c.v}</th> : <td {...props}>{c.v}</td>
        }
        content = <table style={{borderCollapse: 'collapse', width: '100%'}}>
            {caption && <caption>{caption}</caption>}
            {data.header && data.header.length > 0 &&
            <thead>{data.header.map((cells, r) => <tr key={r}>{cells.map((c, i) => cell(c, i, true))}</tr>)}</thead>}
            <tbody>{(data.rows || []).map((row, r) =>
                <tr key={r}
                    className={[row.sum && 'is-sum', row.section && 'is-section'].filter(Boolean).join(' ') || undefined}
                    style={row.sum || row.section ? {fontWeight: 'bold'} : undefined}>
                    {row.cells.map((c, i) => cell(c, i, false))}
                </tr>)}
            </tbody>
        </table>
    }

    return <div className={wrapperClass} style={{overflowX: 'auto'}} {...rest}>{content}{children}</div>
}
