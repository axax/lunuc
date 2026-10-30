/**
 * Helpers for the formatting of Excel files that the table libraries (SheetJS, ExcelJS) do not provide as html.
 * Used by the content import (api/util/contentToJson.mjs) and the Api system/excel2html (live tables).
 */
import AdmZip from 'adm-zip'

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const textHtml = s => esc(s).replace(/\r?\n/g, '<br>')

/**
 * swiss thousands separator: 12’000 / 12`000 / 12´000 / 12‘000 -> 12'000
 * (only between a digit and exactly three digits, also an already escaped backtick \` of a template)
 */
export const normalizeThousands = str => String(str === undefined || str === null ? '' : str)
    .replace(/(\d)(?:\\`|[`’‘´′ʼ])(?=\d{3}(?!\d))/g, "$1'")

/**
 * rich text of a cell (ExcelJS value.richText, runs with own fonts) -> html with <strong> / <em>, line breaks as <br>.
 * null when all runs look the same (then the cell is plain text with the font of the cell).
 */
export const richTextHtml = (richText, cellFont) => {
    if (!Array.isArray(richText) || richText.length === 0) return null
    const fontOf = run => run.font || cellFont || {}
    const runs = richText.filter(run => run && run.text)
    const style = run => (fontOf(run).bold ? 'b' : '') + (fontOf(run).italic ? 'i' : '')
    if (runs.length === 0 || runs.every(run => style(run) === style(runs[0]))) return null
    return runs.map(run => {
        const font = fontOf(run)
        // line breaks outside of the formatting: «<strong>Titel</strong><br>Text»
        const parts = String(run.text).split(/(\r?\n)/)
        return parts.map(part => {
            if (/^\r?\n$/.test(part)) return '<br>'
            if (!part) return ''
            let html = esc(normalizeThousands(part))
            if (font.bold && part.trim()) html = `<strong>${html}</strong>`
            if (font.italic && part.trim()) html = `<em>${html}</em>`
            return html
        }).join('')
    }).join('')
}

// <a:p> of a text box -> html paragraph (runs with bold / italic), '' for an empty paragraph
const paragraphHtml = (pXml) => {
    let html = '', text = ''
    const runRe = /<a:(r|br)\b[^>]*?(?:\/>|>([\s\S]*?)<\/a:r>)/g
    let m
    while ((m = runRe.exec(pXml)) !== null) {
        if (m[1] === 'br') {
            html += '<br>'
            continue
        }
        const body = m[2] || ''
        const t = (body.match(/<a:t>([\s\S]*?)<\/a:t>/) || [])[1]
        if (!t) continue
        const raw = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
        const rPr = (body.match(/<a:rPr\b[^>]*>/) || [''])[0]
        let part = esc(normalizeThousands(raw))
        if (/\sb="1"/.test(rPr) && raw.trim()) part = `<strong>${part}</strong>`
        if (/\si="1"/.test(rPr) && raw.trim()) part = `<em>${part}</em>`
        html += part
        text += raw
    }
    return text.trim() ? `<p>${html.replace(/<\/strong><strong>/g, '').replace(/<\/em><em>/g, '')}</p>` : ''
}

/**
 * text boxes (Insert > Text box) of the sheets of an xlsx file - not read by SheetJS / ExcelJS.
 * Returns {sheetName: [{row, col, html}]} with the 1-based row / column of the top left corner, sorted by position.
 * Empty object for other formats or when nothing is found.
 */
export const excelTextBoxes = (bufferOrPath) => {
    const result = {}
    try {
        const zip = new AdmZip(bufferOrPath)
        const read = name => {
            const entry = zip.getEntry(name)
            return entry ? entry.getData().toString('utf8') : ''
        }
        const workbook = read('xl/workbook.xml')
        if (!workbook) return result
        const relTarget = (relsXml, id) => {
            const rel = (relsXml.match(new RegExp(`<Relationship\\b[^>]*\\bId="${id}"[^>]*>`)) || [''])[0]
            return (rel.match(/Target="([^"]+)"/) || [])[1]
        }
        const workbookRels = read('xl/_rels/workbook.xml.rels')
        const sheetRe = /<sheet\b[^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"/g
        let s
        while ((s = sheetRe.exec(workbook)) !== null) {
            const name = s[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            const target = relTarget(workbookRels, s[2])
            if (!target) continue
            const sheetFile = target.replace(/^\/?xl\//, '').replace(/^\//, '')
            const sheetRels = read('xl/worksheets/_rels/' + sheetFile.split('/').pop() + '.rels')
            const drawings = (sheetRels.match(/Target="[^"]*drawings\/[^"]+"/g) || []).map(t => t.match(/drawings\/([^"]+)"/)[1])
            const boxes = []
            drawings.forEach(drawing => {
                const xml = read('xl/drawings/' + drawing)
                const anchorRe = /<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>/g
                let a
                while ((a = anchorRe.exec(xml)) !== null) {
                    const anchor = a[0]
                    // only real text boxes (txBox): shapes with text are buttons («zum Inhaltsverzeichnis»)
                    // or stamps («nicht verwendet»)
                    const txBody = /\btxBox="1"/.test(anchor) && anchor.match(/<xdr:txBody>([\s\S]*?)<\/xdr:txBody>/)
                    if (!txBody) continue
                    const html = (txBody[1].match(/<a:p>[\s\S]*?<\/a:p>|<a:p\b[^>]*>[\s\S]*?<\/a:p>/g) || []).map(paragraphHtml).join('')
                    if (!html) continue
                    const from = anchor.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)
                    boxes.push({row: from ? parseInt(from[2]) + 1 : 1, col: from ? parseInt(from[1]) + 1 : 1, html})
                }
            })
            if (boxes.length) {
                result[name] = boxes.sort((x, y) => (x.row - y.row) || (x.col - y.col))
            }
        }
    } catch (e) {
        // not an xlsx file or a damaged drawing: no text boxes
    }
    return result
}
