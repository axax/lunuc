/**
 * Converts content of other formats into JsonDom elements (the lunuc template structure), e.g. for the
 * content import of the cms editor (Api system/content2json) or the import of the Jahresbericht.
 *
 *   const {elements, medias, warnings} = await convertContent({db, context, buffer, fileName, mimeType})
 *   const {elements} = await convertContent({db, context, url: 'https://...'})
 *   const {elements} = await convertContent({db, context, html: '<p>..</p>'})   // or text: '...'
 *
 * Supported: Word (.docx), PDF (text, tables are recognized by the position of the text), Excel (.xlsx/.xlsm/.xls/.csv
 * -> tables), HTML / web page (url), Markdown / text, pictures. Pages, Numbers, .doc, .odt, .rtf are converted with
 * LibreOffice (if installed, SOFFICE_PATH) to Word / Excel first; Pages without LibreOffice: embedded pdf preview.
 * Tables keep colspan / rowspan, header rows and the alignment (style="text-align:.."). Text becomes rich text elements (headings, lists, tables, links are kept),
 * pictures become image elements: they are stored as Media (scaled down to max. 2400px).
 *
 * Elements:
 *   rich text  {t: 'div', $c: '<html>', $inlineEditor: {elementKey: 'richText', richText: true, ...}}
 *   picture    {t: 'SmartImage', p: {src: [{__typename: 'Media', _id, name, mimeType}]}, $inlineEditor: {elementKey: 'image'}}
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import {ObjectId} from 'mongodb'
import AdmZip from 'adm-zip'
import * as cheerio from 'cheerio'

const MAX_IMAGE = 2400
const MAX_REMOTE_IMAGES = 40
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'tif', 'tiff', 'heic', 'svg']

const ext = name => ((String(name || '').match(/\.([^./?#]+)(?:[?#].*)?$/) || [])[1] || '').toLowerCase()
const baseName = name => String(name || '').split(/[\\/]/).pop()
const norm = s => String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const genId = () => 'genid_' + crypto.randomBytes(5).toString('hex').slice(0, 8)

// ---------- elements ----------

export const richTextElement = html => ({
    t: 'div',
    $c: html,
    $inlineEditor: {elementKey: 'richText', richText: true, options: {$c: {trKey: genId()}}},
    p: {'data-element-key': 'richText'}
})

export const mediaRef = m => ({__typename: 'Media', _id: String(m._id), name: m.name, mimeType: m.mimeType})

export const imageElement = (m, {alt = '', caption = ''} = {}) => ({
    t: 'SmartImage',
    $inlineEditor: {elementKey: 'image', picker: {type: 'Media', baseFilter: 'mimeType=image'}},
    p: {wrapper: 'true', 'data-element-key': 'image', src: [mediaRef(m)], alt, caption}
})

// blocks [{type: 'html', html} | {type: 'image', media}] -> elements
const blocksToElements = blocks => blocks.map(b => b.type === 'image' ? imageElement(b.media, b) : richTextElement(b.html))
    .filter(Boolean)

// ---------- media ----------

const imageMime = x => x === 'png' ? 'image/png' : x === 'gif' ? 'image/gif' : x === 'webp' ? 'image/webp' : x === 'svg' ? 'image/svg+xml' : 'image/jpeg'

/**
 * stores a picture as Media (scaled down, jpg for photos), returns {_id, name, mimeType}
 */
export const createImageMedia = async ({db, context, buffer, name, uploadDir, resolver, warnings = []}) => {
    const x = ext(name)
    let out = buffer, outName = baseName(name) || 'bild.jpg', mime = imageMime(x)
    if (x !== 'svg') {
        try {
            const sharp = (await import('sharp')).default
            const img = sharp(buffer, {failOn: 'none'}).rotate()
            const meta = await img.metadata()
            const big = (meta.width || 0) > MAX_IMAGE || (meta.height || 0) > MAX_IMAGE
            if (['jpg', 'jpeg', 'tif', 'tiff', 'heic'].includes(x) || !x || (big && x !== 'png' && x !== 'gif')) {
                out = await img.resize({width: MAX_IMAGE, height: MAX_IMAGE, fit: 'inside', withoutEnlargement: true})
                    .jpeg({quality: 82, mozjpeg: true}).toBuffer()
                outName = outName.replace(/\.[^.]+$/, '') + '.jpg'
                mime = 'image/jpeg'
            } else if (big) {
                out = await img.resize({width: MAX_IMAGE, height: MAX_IMAGE, fit: 'inside', withoutEnlargement: true}).toBuffer()
            }
        } catch (e) {
            warnings.push(`Bild ${name} konnte nicht verkleinert werden (${e.message})`)
        }
    }
    return createMedia({db, context, buffer: out, name: outName, mimeType: mime, uploadDir, resolver})
}

export const createMedia = async ({db, context, buffer, name, mimeType, uploadDir, resolver}) => {
    if (!resolver) resolver = (await import('../resolver/generic/genericResolver.mjs')).default
    if (!uploadDir) uploadDir = path.join(path.resolve(), (await import('../../gensrc/config.mjs')).default.UPLOAD_DIR)
    const oid = new ObjectId(), _id = oid.toString()
    // file first, so the media is never without file
    fs.writeFileSync(path.join(uploadDir, _id), buffer)
    try {
        // as ObjectId (a string _id would be stored as string)
        await resolver.createEntity(db, {context}, 'Media', {_id: oid, name, mimeType, size: buffer.length}, {skipCheck: false})
    } catch (e) {
        try {
            fs.unlinkSync(path.join(uploadDir, _id))
        } catch (err) {
        }
        throw e
    }
    return {_id, name, mimeType}
}

export const docxToBlocks = (buffer) => {
    const zip = new AdmZip(buffer)
    const read = n => {
        const e = zip.getEntry(n)
        return e ? e.getData().toString('utf8') : ''
    }
    const load = xml => cheerio.load(xml || '<x/>', {xml: {xmlMode: true, decodeEntities: true}})

    const rels = {}
    const $r = load(read('word/_rels/document.xml.rels'))
    $r('Relationship').each((i, el) => {
        rels[el.attribs.Id] = {target: el.attribs.Target, external: el.attribs.TargetMode === 'External'}
    })
    const styles = {}, styleNum = {}, firstRowStyles = {}
    const $s = load(read('word/styles.xml'))
    $s('w\\:style').each((i, el) => {
        // table styles that format the first row as header (used with tblLook firstRow)
        if ($s(el).children('w\\:tblStylePr[w\\:type="firstRow"]').length) firstRowStyles[el.attribs['w:styleId']] = true
        const nameEl = $s(el).children('w\\:name')[0]
        styles[el.attribs['w:styleId']] = norm(nameEl ? nameEl.attribs['w:val'] : el.attribs['w:styleId'])
        // numbering defined by the style (e.g. "List Bullet" / "Aufzählungszeichen")
        const num = $s(el).find('w\\:pPr > w\\:numPr > w\\:numId')[0]
        if (num) styleNum[el.attribs['w:styleId']] = num.attribs['w:val']
    })
    const numFormats = {}
    const $n = load(read('word/numbering.xml'))
    const abstract = {}
    $n('w\\:abstractNum').each((i, el) => {
        const lvl = $n(el).find('w\\:lvl[w\\:ilvl="0"] > w\\:numFmt')[0]
        abstract[el.attribs['w:abstractNumId']] = lvl ? lvl.attribs['w:val'] : 'bullet'
    })
    $n('w\\:num').each((i, el) => {
        const a = $n(el).children('w\\:abstractNumId')[0]
        numFormats[el.attribs['w:numId']] = a ? abstract[a.attribs['w:val']] : 'bullet'
    })

    const $ = load(read('word/document.xml'))
    const kids = n => (n.children || []).filter(c => c.type === 'tag')
    const child = (n, name) => kids(n).find(c => c.name === name)
    const blocks = []
    let html = []
    let list = null // {tag, items}
    const flushList = () => {
        if (list) {
            html.push(`<${list.tag}>${list.items.map(i => `<li>${i}</li>`).join('')}</${list.tag}>`)
            list = null
        }
    }
    const flushHtml = () => {
        flushList()
        if (html.length) {
            blocks.push({type: 'html', html: html.join('')})
            html = []
        }
    }
    const isOn = (rPr, name) => {
        const el = rPr && child(rPr, name)
        return !!el && !['0', 'false', 'none'].includes(el.attribs['w:val'])
    }

    // runs of a paragraph -> {html, text, allBold, images}
    const runsOf = (p) => {
        let out = '', text = '', boldChars = 0, chars = 0
        const images = []
        const run = (r, link) => {
            const rPr = child(r, 'w:rPr')
            const b = isOn(rPr, 'w:b'), i = isOn(rPr, 'w:i'), u = isOn(rPr, 'w:u')
            let s = ''
            kids(r).forEach(c => {
                if (c.name === 'w:t') {
                    const t = $(c).text()
                    s += esc(t)
                    text += t
                    chars += t.trim().length
                    if (b) boldChars += t.trim().length
                } else if (c.name === 'w:br' || c.name === 'w:cr') {
                    s += '<br>'
                    text += '\n'
                } else if (c.name === 'w:tab') {
                    s += ' '
                    text += ' '
                } else if (c.name === 'w:drawing' || c.name === 'w:pict') {
                    $(c).find('a\\:blip, v\\:imagedata').each((k, blip) => {
                        const id = blip.attribs['r:embed'] || blip.attribs['r:id']
                        if (id && rels[id] && !rels[id].external) images.push('word/' + rels[id].target.replace(/^\.?\//, '').replace(/^word\//, ''))
                    })
                }
            })
            if (!s) return
            if (b) s = `<strong>${s}</strong>`
            if (i) s = `<em>${s}</em>`
            if (u && !link) s = `<u>${s}</u>`
            out += s
        }
        kids(p).forEach(c => {
            if (c.name === 'w:r') {
                run(c)
            } else if (c.name === 'w:hyperlink') {
                const rel = rels[c.attribs['r:id']]
                const before = out
                out = ''
                kids(c).filter(r => r.name === 'w:r').forEach(r => run(r, true))
                const inner = out
                out = before + (rel && rel.external ? `<a href="${esc(rel.target)}" target="_blank" rel="noopener">${inner}</a>` : inner)
            } else if (c.name === 'w:ins' || c.name === 'w:smartTag' || c.name === 'w:sdt' || c.name === 'w:sdtContent') {
                kids(c).filter(r => r.name === 'w:r').forEach(r => run(r))
            }
        })
        return {html: out.replace(/<\/strong><strong>/g, '').replace(/<\/em><em>/g, ''), text, allBold: chars > 0 && boldChars >= chars * 0.9, images}
    }

    // paragraph alignment (w:jc) -> css text-align (left is the default and not written)
    const ALIGN = {center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify'}
    const alignOf = pPr => {
        const jc = pPr && child(pPr, 'w:jc')
        return jc ? (ALIGN[jc.attribs['w:val']] || '') : ''
    }
    const alignAttr = a => a ? ` style="text-align:${a}"` : ''
    const isHeadingStyle = style => /^(heading|ueberschrift|title|titel|subtitle|untertitel)/.test(style)

    const paragraph = (p) => {
        const pPr = child(p, 'w:pPr')
        const styleEl = pPr && child(pPr, 'w:pStyle')
        const styleId = styleEl ? styleEl.attribs['w:val'] : ''
        const style = styleId ? (styles[styleId] || norm(styleId)) : ''
        const numPr = pPr && child(pPr, 'w:numPr')
        const numIdEl = numPr && child(numPr, 'w:numId')
        let numId = numIdEl ? numIdEl.attribs['w:val'] : styleNum[styleId]
        if (numId === '0') numId = null
        const r = runsOf(p)
        return {style, numId, align: alignOf(pPr), ...r}
    }

    // 'ul' | 'ol' for a list paragraph, otherwise null
    const listTagOf = pp => {
        if (!pp.numId) return null
        const fmt = numFormats[pp.numId] || 'bullet'
        return fmt !== 'bullet' && fmt !== 'none' ? 'ol' : 'ul'
    }

    const handleParagraph = (p) => {
        const pp = paragraph(p)
        const {style, html: h, text, allBold, images, align} = pp
        const t = text.trim()
        if (t) {
            const tag = listTagOf(pp)
            const shortBold = allBold && t.length < 120 && !/[.:,;]$/.test(t) && !tag
            if (tag) {
                if (!list || list.tag !== tag) {
                    flushList()
                    list = {tag, items: []}
                }
                list.items.push(h)
            } else if (isHeadingStyle(style) || shortBold) {
                flushList()
                html.push(`<h3${alignAttr(align)}>${esc(t)}</h3>`)
            } else {
                flushList()
                html.push(`<p${alignAttr(align)}>${h}</p>`)
            }
        }
        images.forEach(img => {
            flushHtml()
            blocks.push({type: 'image', file: img})
        })
    }

    // content of a table cell: paragraphs, lists and nested tables
    // -> {content, align (when the cell is a single paragraph), bold, hasText}
    const cellContent = (tc, images) => {
        const out = []
        let cellList = null, bold = true, hasText = false
        const flushCellList = () => {
            if (cellList) {
                out.push({block: true, html: `<${cellList.tag}>${cellList.items.map(i => `<li>${i}</li>`).join('')}</${cellList.tag}>`})
                cellList = null
            }
        }
        const walkCell = nodes => nodes.forEach(n => {
            if (n.name === 'w:p') {
                const pp = paragraph(n)
                images.push(...pp.images)
                if (!pp.text.trim()) return
                hasText = true
                if (!pp.allBold) bold = false
                const tag = listTagOf(pp)
                if (tag) {
                    if (!cellList || cellList.tag !== tag) {
                        flushCellList()
                        cellList = {tag, items: []}
                    }
                    cellList.items.push(pp.html)
                    return
                }
                flushCellList()
                out.push({html: pp.html, align: pp.align})
            } else if (n.name === 'w:tbl') {
                flushCellList()
                const h = tableHtml(n, images)
                if (h) {
                    hasText = true
                    out.push({block: true, html: h})
                }
            } else if (n.name === 'w:sdt' || n.name === 'w:customXml') {
                const c = child(n, 'w:sdtContent') || n
                walkCell(kids(c))
            }
        })
        walkCell(kids(tc))
        flushCellList()
        if (out.length === 1 && !out[0].block) {
            return {content: out[0].html, align: out[0].align, bold, hasText}
        }
        // several paragraphs: same alignment for all -> on the cell
        const aligns = [...new Set(out.filter(o => !o.block).map(o => o.align))]
        const cellAlign = aligns.length === 1 && out.every(o => !o.block) ? aligns[0] : ''
        return {
            content: out.map(o => o.block ? o.html : `<p${cellAlign ? '' : alignAttr(o.align)}>${o.html}</p>`).join(''),
            align: cellAlign, bold, hasText
        }
    }

    // cells of a row (also inside content controls)
    const cellsOf = tr => {
        const result = []
        kids(tr).forEach(c => {
            if (c.name === 'w:tc') result.push(c)
            else if (c.name === 'w:sdt' || c.name === 'w:customXml') {
                const content = child(c, 'w:sdtContent') || c
                result.push(...cellsOf(content))
            }
        })
        return result
    }

    // table -> html: colspan (gridSpan), rowspan (vMerge), header rows (tblHeader or bold first row),
    // alignment of the cells and of the table, lists and nested tables in cells
    const tableHtml = (tbl, images) => {
        const tblPr = child(tbl, 'w:tblPr')
        const jc = tblPr && child(tblPr, 'w:jc')
        const tableAlign = jc ? ALIGN[jc.attribs['w:val']] : ''
        const tableStyle = tableAlign === 'center' ? ' style="margin-left:auto;margin-right:auto"'
            : tableAlign === 'right' ? ' style="margin-left:auto;margin-right:0"' : ''
        // header row by the table style ("Kopfzeile" checked in Word)
        const tblStyle = tblPr && child(tblPr, 'w:tblStyle')
        const look = tblPr && child(tblPr, 'w:tblLook')
        const lookFirstRow = !!look && (look.attribs['w:firstRow'] === '1' || look.attribs['w:firstRow'] === 'true' ||
            (look.attribs['w:val'] && (parseInt(look.attribs['w:val'], 16) & 0x20) > 0))
        const styledHeader = lookFirstRow && !!tblStyle && !!firstRowStyles[tblStyle.attribs['w:val']]
        const rows = []
        const origin = {} // grid column -> cell that is continued downwards (vMerge)
        kids(tbl).filter(c => c.name === 'w:tr').forEach(tr => {
            const trPr = child(tr, 'w:trPr')
            const headerEl = trPr && child(trPr, 'w:tblHeader')
            const header = !!headerEl && !['0', 'false'].includes(headerEl.attribs['w:val'])
            const before = trPr && child(trPr, 'w:gridBefore')
            let col = before ? parseInt(before.attribs['w:val']) || 0 : 0
            const cells = []
            cellsOf(tr).forEach(tc => {
                const tcPr = child(tc, 'w:tcPr')
                const spanEl = tcPr && child(tcPr, 'w:gridSpan')
                const span = spanEl ? parseInt(spanEl.attribs['w:val']) || 1 : 1
                const vm = tcPr && child(tcPr, 'w:vMerge')
                const vMerge = vm ? (vm.attribs['w:val'] === 'restart' ? 'restart' : 'continue') : null
                if (vMerge === 'continue' && origin[col]) {
                    origin[col].rowspan++
                    // text in a continued cell (rare) is added to the merged cell
                    const extra = cellContent(tc, images)
                    if (extra.hasText) origin[col].content += '<br>' + extra.content
                    col += span
                    return
                }
                const cell = {span, rowspan: 1, ...cellContent(tc, images)}
                for (let i = col; i < col + span; i++) delete origin[i]
                if (vMerge === 'restart') origin[col] = cell
                cells.push(cell)
                col += span
            })
            if (cells.length) rows.push({header, cells})
        })
        if (!rows.length) return ''
        // no header row marked: a first row with only bold text is the header
        if (!rows.some(r => r.header) && rows.length > 1 && rows[0].cells.length > 1 &&
            (styledHeader || rows[0].cells.every(c => c.bold)) && rows[0].cells.some(c => c.hasText)) {
            rows[0].header = true
        }
        let headCount = 0
        while (headCount < rows.length - 1 && rows[headCount].header) headCount++
        const rowHtml = (r, tag) => '<tr>' + r.cells.map(c => {
            const attrs = (c.span > 1 ? ` colspan="${c.span}"` : '') + (c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : '') + alignAttr(c.align)
            return `<${tag}${attrs}>${c.content}</${tag}>`
        }).join('') + '</tr>'
        const head = rows.slice(0, headCount).map(r => rowHtml(r, 'th')).join('')
        const bodyRows = rows.slice(headCount).map(r => rowHtml(r, 'td')).join('')
        return `<table${tableStyle}>${head ? `<thead>${head}</thead>` : ''}<tbody>${bodyRows}</tbody></table>`
    }

    const handleTable = (tbl) => {
        flushList()
        const images = []
        const h = tableHtml(tbl, images)
        if (h) html.push(h)
        images.forEach(img => {
            flushHtml()
            blocks.push({type: 'image', file: img})
        })
    }

    const body = $('w\\:body')[0]
    const walk = (nodes) => nodes.forEach(n => {
        if (n.name === 'w:p') handleParagraph(n)
        else if (n.name === 'w:tbl') handleTable(n)
        else if (n.name === 'w:sdt') {
            const c = child(n, 'w:sdtContent')
            if (c) walk(kids(c))
        }
    })
    if (body) walk(kids(body))
    flushHtml()
    return {blocks, getFile: name => {
        const e = zip.getEntry(name)
        return e ? e.getData() : null
    }}
}



// ---------- html -> blocks ----------

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'blockquote', 'sup', 'sub', 'span', 'hr', 'figure', 'figcaption']
const BLOCK_DROP = 'script, style, noscript, iframe, object, embed, form, button, input, select, textarea, svg, canvas, nav, header, footer, aside, [role=navigation], [role=banner], [role=contentinfo], [aria-hidden=true], .cookie, .cookies, #cookie-banner'

/**
 * main content of a page: <main>, <article>, [role=main] or the body without navigation / header / footer
 */
// alignment of an element (style text-align, align attribute or a usual class name) -> 'right' | 'center' | 'justify' | ''
const alignOfEl = el => {
    const a = (el && el.attribs) || {}
    const m = String(a.style || '').match(/text-align\s*:\s*(left|right|center|justify|start|end)/i)
    let v = m ? m[1].toLowerCase() : String(a.align || '').toLowerCase()
    if (!v) {
        const c = String(a.class || '').match(/(?:^|\s)(?:has-text-align-|text-|align-?|ql-align-)(right|center|justify)(?:\s|$)/i)
        if (c) v = c[1].toLowerCase()
    }
    if (v === 'end') v = 'right'
    return ['right', 'center', 'justify'].includes(v) ? v : ''
}
const alignStyle = a => a ? ` style="text-align:${a}"` : ''

const mainContent = ($) => {
    const candidates = ['main', 'article', '[role=main]', '#content', '.content', '#main', '.main']
    for (const sel of candidates) {
        const el = $(sel).first()
        if (el.length && el.text().trim().length > 200) return el
    }
    return $('body').length ? $('body') : $.root()
}

/**
 * html -> blocks: the text stays html (only basic formatting is kept, classes / styles are removed),
 * pictures are taken out as own blocks ({type: 'img', src, alt})
 */
export const htmlToBlocks = (html, {baseUrl} = {}) => {
    const $ = cheerio.load(html || '')
    const root = mainContent($)
    root.find(BLOCK_DROP).remove()
    const blocks = []
    let buf = []
    const flush = () => {
        const h = buf.join('').replace(/(<p>\s*<\/p>)+/g, '').trim()
        if (h) blocks.push({type: 'html', html: h})
        buf = []
    }
    const absUrl = u => {
        if (!u) return ''
        try {
            return baseUrl ? new URL(u, baseUrl).href : u
        } catch (e) {
            return u
        }
    }
    const inline = (node) => {
        // inline content of a node as clean html
        let out = ''
        ;(node.children || []).forEach(c => {
            if (c.type === 'text') {
                out += esc(c.data.replace(/\s+/g, ' '))
            } else if (c.type === 'tag') {
                const tag = c.name.toLowerCase()
                if (tag === 'img') {
                    // pictures inside text: taken out as own block after the text
                    pendingImages.push({src: absUrl(c.attribs.src || c.attribs['data-src']), alt: c.attribs.alt || ''})
                    return
                }
                const inner = inline(c)
                if (tag === 'br') out += '<br>'
                else if (tag === 'a') {
                    const href = absUrl(c.attribs.href)
                    out += href && !href.startsWith('javascript:') ? `<a href="${esc(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>` : inner
                } else if (['strong', 'b'].includes(tag)) out += inner.trim() ? `<strong>${inner}</strong>` : inner
                else if (['em', 'i'].includes(tag)) out += inner.trim() ? `<em>${inner}</em>` : inner
                else if (['u', 'sup', 'sub'].includes(tag)) out += `<${tag}>${inner}</${tag}>`
                else out += inner
            }
        })
        return out
    }
    let pendingImages = []
    const flushImages = () => {
        if (pendingImages.length) {
            flush()
            pendingImages.forEach(img => img.src && blocks.push({type: 'img', src: img.src, alt: img.alt}))
            pendingImages = []
        }
    }
    const rowsOf = t => {
        const rows = []
        $(t).children().each((i, el) => {
            const name = el.name.toLowerCase()
            if (name === 'tr') rows.push({el, head: false})
            else if (['thead', 'tbody', 'tfoot'].includes(name)) {
                $(el).children('tr').each((k, tr) => rows.push({el: tr, head: name === 'thead'}))
            }
        })
        return rows
    }
    const CELL_BLOCKS = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'section', 'article']
    // content of a cell: inline html, or paragraphs / lists / tables -> {html, align}
    const cellHtml = (c) => {
        if (!$(c).children('p, div, ul, ol, table, h1, h2, h3, h4, h5, h6, blockquote, section, article').length) {
            return {html: inline(c).trim(), align: ''}
        }
        const parts = []
        let inl = []
        const flushInline = () => {
            const h = inline({children: inl}).trim()
            if (h) parts.push({html: h, align: ''})
            inl = []
        }
        ;(c.children || []).forEach(n => {
            const tag = n.type === 'tag' ? n.name.toLowerCase() : ''
            if (tag === 'ul' || tag === 'ol') {
                flushInline()
                parts.push({html: list(n), block: true})
            } else if (tag === 'table') {
                flushInline()
                parts.push({html: table(n), block: true})
            } else if (CELL_BLOCKS.includes(tag)) {
                flushInline()
                const inner = cellHtml(n)
                if (inner.html) parts.push({...inner, align: inner.align || alignOfEl(n), block: inner.html.startsWith('<')})
            } else {
                inl.push(n)
            }
        })
        flushInline()
        if (parts.length === 1 && !parts[0].block) return {html: parts[0].html, align: parts[0].align}
        return {html: parts.map(p => p.block ? p.html : `<p${alignStyle(p.align)}>${p.html}</p>`).join(''), align: ''}
    }
    const table = (t) => {
        const rows = rowsOf(t).map(({el, head}) => {
            const cells = []
            $(el).children('th, td').each((k, c) => {
                const colspan = parseInt(c.attribs.colspan) || 1, rowspan = parseInt(c.attribs.rowspan) || 1
                const {html: content, align} = cellHtml(c)
                cells.push({
                    th: c.name.toLowerCase() === 'th', content, colspan, rowspan,
                    align: alignOfEl(c) || align || alignOfEl(el)
                })
            })
            return {head: head || (cells.length > 0 && cells.every(cell => cell.th)), cells}
        }).filter(r => r.cells.length)
        if (!rows.length) return ''
        let headCount = 0
        while (headCount < rows.length - 1 && rows[headCount].head) headCount++
        const rowHtml = (r, inHead) => '<tr>' + r.cells.map(cell => {
            const tag = inHead || cell.th ? 'th' : 'td'
            const attrs = (cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '') + (cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '') + alignStyle(cell.align)
            return `<${tag}${attrs}>${cell.content}</${tag}>`
        }).join('') + '</tr>'
        const tAlign = String(t.attribs.align || '').toLowerCase() ||
            (/margin-left\s*:\s*auto/i.test(t.attribs.style || '') ? (/margin-right\s*:\s*auto/i.test(t.attribs.style || '') ? 'center' : 'right') : '')
        const tStyle = tAlign === 'center' ? ' style="margin-left:auto;margin-right:auto"' : tAlign === 'right' ? ' style="margin-left:auto;margin-right:0"' : ''
        const head = rows.slice(0, headCount).map(r => rowHtml(r, true)).join('')
        return `<table${tStyle}>${head ? `<thead>${head}</thead>` : ''}<tbody>${rows.slice(headCount).map(r => rowHtml(r, false)).join('')}</tbody></table>`
    }
    const list = (l) => {
        const tag = l.name.toLowerCase()
        const items = []
        $(l).children('li').each((i, li) => {
            const nested = $(li).children('ul, ol').toArray().map(list).join('')
            $(li).children('ul, ol').remove()
            items.push(`<li>${inline(li).trim()}${nested}</li>`)
        })
        return items.length ? `<${tag}>${items.join('')}</${tag}>` : ''
    }
    const walk = (node) => {
        (node.children || []).forEach(c => {
            if (c.type === 'text') {
                const t = c.data.replace(/\s+/g, ' ').trim()
                if (t) buf.push(`<p>${esc(t)}</p>`)
                return
            }
            if (c.type !== 'tag') return
            const tag = c.name.toLowerCase()
            if (/^h[1-6]$/.test(tag)) {
                const text = $(c).text().replace(/\s+/g, ' ').trim()
                // h1 of the page is the title of the entry, the content starts with h2
                const level = Math.min(6, Math.max(2, parseInt(tag[1]) + (tag === 'h1' ? 1 : 0)))
                if (text) buf.push(`<h${level}${alignStyle(alignOfEl(c))}>${esc(text)}</h${level}>`)
            } else if (tag === 'p' || tag === 'blockquote' || tag === 'figcaption') {
                const h = inline(c).trim()
                if (h) buf.push(tag === 'blockquote' ? `<blockquote><p>${h}</p></blockquote>` : `<p${alignStyle(alignOfEl(c))}>${h}</p>`)
                flushImages()
            } else if (tag === 'ul' || tag === 'ol') {
                buf.push(list(c))
                flushImages()
            } else if (tag === 'table') {
                buf.push(table(c))
                flushImages()
            } else if (tag === 'img') {
                pendingImages.push({src: absUrl(c.attribs.src || c.attribs['data-src']), alt: c.attribs.alt || ''})
                flushImages()
            } else if (tag === 'hr') {
                buf.push('<hr>')
            } else if (tag === 'br') {
                // ignore
            } else if (['strong', 'b', 'em', 'i', 'a', 'span', 'u', 'small', 'label', 'time'].includes(tag)) {
                const h = inline({children: [c]}).trim()
                if (h) buf.push(`<p>${h}</p>`)
                flushImages()
            } else {
                // div, section, figure, picture ... -> their content
                if (tag === 'picture') {
                    const img = $(c).find('img').first()
                    if (img.length) pendingImages.push({src: absUrl(img.attr('src') || img.attr('data-src')), alt: img.attr('alt') || ''})
                    flushImages()
                    return
                }
                walk(c)
            }
        })
    }
    walk(root[0] || {children: []})
    flushImages()
    flush()
    const title = ($('h1').first().text() || $('title').first().text() || '').replace(/\s+/g, ' ').trim()
    return {blocks, title}
}

// ---------- text / markdown -> html ----------

export const textToHtml = (text) => {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
    const out = []
    let para = [], list = null
    const inlineMd = s => esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    const flushPara = () => {
        if (para.length) out.push(`<p>${para.map(inlineMd).join('<br>')}</p>`)
        para = []
    }
    const flushList = () => {
        if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inlineMd(i)}</li>`).join('')}</${list.tag}>`)
        list = null
    }
    lines.forEach(line => {
        const t = line.trim()
        let m
        if (!t) {
            flushPara()
            flushList()
        } else if ((m = t.match(/^(#{1,6})\s+(.*)$/))) {
            flushPara()
            flushList()
            const level = Math.min(6, Math.max(2, m[1].length + 1))
            out.push(`<h${level}>${inlineMd(m[2])}</h${level}>`)
        } else if ((m = t.match(/^([-*•]|\d+[.)])\s+(.*)$/))) {
            flushPara()
            const tag = /^\d/.test(m[1]) ? 'ol' : 'ul'
            if (!list || list.tag !== tag) {
                flushList()
                list = {tag, items: []}
            }
            list.items.push(m[2])
        } else {
            flushList()
            para.push(t)
        }
    })
    flushPara()
    flushList()
    return out.join('')
}

// ---------- excel -> html ----------

export const excelToHtml = async (buffer, {sheet, maxRows = 500} = {}) => {
    const XLSX = (await import('xlsx')).default || (await import('xlsx'))
    const wb = XLSX.read(buffer, {type: 'buffer', cellDates: true})
    const names = sheet ? [sheet] : wb.SheetNames
    const parts = []
    names.forEach(name => {
        const ws = wb.Sheets[name]
        if (!ws) return
        const rows = XLSX.utils.sheet_to_json(ws, {header: 1, raw: false, defval: '', blankrows: false})
            .filter(r => r.some(c => String(c).trim() !== ''))
            .slice(0, maxRows)
        if (!rows.length) return
        // drop empty columns
        const width = Math.max(...rows.map(r => r.length))
        const used = []
        for (let i = 0; i < width; i++) {
            if (rows.some(r => String(r[i] || '').trim() !== '')) used.push(i)
        }
        const html = rows.map((r, ri) => '<tr>' + used.map(i => {
            const v = esc(String(r[i] === undefined ? '' : r[i]).trim())
            return ri === 0 ? `<th>${v}</th>` : `<td>${v}</td>`
        }).join('') + '</tr>').join('')
        if (names.length > 1) parts.push(`<h3>${esc(name)}</h3>`)
        parts.push(`<table><tbody>${html}</tbody></table>`)
    })
    return parts.join('')
}

// ---------- pdf -> html ----------

const PDF_NUM = /^[-+–]?\s*(?:CHF|EUR|Fr\.|€|\$)?\s*[\d'’.,\s]+\s*%?$/

/**
 * text lines of a pdf page from its positioned text items: [{y, size, segments: [{x0, x1, text}], text}]
 * items with a gap of less than ~1em are one segment, a larger gap starts a new segment (table column)
 */
const pdfLines = (items) => {
    const words = items.filter(i => i.str && i.str.trim() && i.transform)
        .map(i => ({
            x0: i.transform[4],
            x1: i.transform[4] + (i.width || 0),
            y: i.transform[5],
            size: Math.abs(i.transform[3]) || i.height || 10,
            str: i.str
        }))
    words.sort((a, b) => b.y - a.y || a.x0 - b.x0)
    const lines = []
    words.forEach(w => {
        const line = lines.slice(-3).find(l => Math.abs(l.y - w.y) < Math.max(2, Math.min(l.size, w.size) * 0.5))
        if (line) {
            line.words.push(w)
            line.size = Math.max(line.size, w.size)
        } else {
            lines.push({y: w.y, size: w.size, words: [w]})
        }
    })
    lines.forEach(l => {
        l.words.sort((a, b) => a.x0 - b.x0)
        l.segments = []
        l.words.forEach(w => {
            const seg = l.segments[l.segments.length - 1]
            const gap = seg ? w.x0 - seg.x1 : Infinity
            if (seg && gap < Math.max(l.size * 0.9, 4)) {
                seg.text += (gap > l.size * 0.12 && !/\s$/.test(seg.text) && !/^\s/.test(w.str) ? ' ' : '') + w.str
                seg.x1 = Math.max(seg.x1, w.x1)
            } else {
                l.segments.push({x0: w.x0, x1: w.x1, text: w.str})
            }
        })
        l.segments.forEach(sg => {
            sg.text = sg.text.replace(/\s+/g, ' ').trim()
        })
        l.text = l.segments.map(sg => sg.text).join(' ')
        l.x0 = l.segments[0].x0
        l.x1 = l.segments[l.segments.length - 1].x1
        delete l.words
    })
    return lines
}

// column ranges of table rows: the n-th cell of the rows with the most cells is the n-th column
const pdfColumns = (rows) => {
    const real = rows.filter(r => !r.cont)
    if (!real.length) return []
    const maxSeg = Math.max(...real.map(r => r.segments.length))
    const ref = real.filter(r => r.segments.length === maxSeg)
    let cols = []
    for (let i = 0; i < maxSeg; i++) {
        cols.push({x0: Math.min(...ref.map(r => r.segments[i].x0)), x1: Math.max(...ref.map(r => r.segments[i].x1))})
    }
    if (cols.some((c, i) => i > 0 && c.x0 <= cols[i - 1].x1)) {
        // not in a clean order: overlapping ranges are one column
        cols = []
        ref.forEach(r => r.segments.forEach(sg => cols.push({x0: sg.x0, x1: sg.x1})))
        cols.sort((a, b) => a.x0 - b.x0)
        cols = cols.reduce((all, c) => {
            const last = all[all.length - 1]
            if (last && c.x0 <= last.x1 + 1) last.x1 = Math.max(last.x1, c.x1)
            else all.push({...c})
            return all
        }, [])
    }
    return cols
}

// columns a segment lies in {first, last}, nearest column if it is in a gap
const pdfColumnOf = (cols, sg) => {
    let first = -1, last = -1
    cols.forEach((c, i) => {
        if (sg.x0 < c.x1 - 1 && sg.x1 > c.x0 + 1) {
            if (first < 0) first = i
            last = i
        }
    })
    if (first < 0) {
        const cx = (sg.x0 + sg.x1) / 2
        let best = 0, dist = Infinity
        cols.forEach((c, i) => {
            const d = cx < c.x0 ? c.x0 - cx : cx > c.x1 ? cx - c.x1 : 0
            if (d < dist) {
                dist = d
                best = i
            }
        })
        first = last = best
    }
    return {first, last}
}

const words = t => t.split(/\s+/).filter(Boolean).length

/**
 * rows (lines with >= 2 segments, wrapped cell text with .cont) -> {html} for a table,
 * {columns: [[line]]} for text in columns (page layout), or null
 */
const pdfTable = (rows) => {
    const cols = pdfColumns(rows)
    if (cols.length < 2) return null

    const grid = [], gridLines = []
    rows.forEach(r => {
        if (r.cont && grid.length) {
            // wrapped text of a cell
            const row = grid[grid.length - 1]
            r.segments.forEach(sg => {
                const {first} = pdfColumnOf(cols, sg)
                if (row[first]) row[first].text += '\n' + sg.text
                else row[first] = {text: sg.text, x0: sg.x0, x1: sg.x1, span: 1}
            })
            gridLines[gridLines.length - 1].push(r)
            return
        }
        const row = cols.map(() => null)
        r.segments.forEach(sg => {
            const {first, last} = pdfColumnOf(cols, sg)
            if (row[first]) {
                row[first].text += ' ' + sg.text
                row[first].x1 = Math.max(row[first].x1, sg.x1)
            } else {
                row[first] = {text: sg.text, x0: sg.x0, x1: sg.x1, span: last - first + 1}
            }
        })
        grid.push(row)
        gridLines.push([r])
    })

    // text in columns (page layout) is no table: (nearly) every cell is running text
    const filled = grid.flat().filter(Boolean)
    if (filled.filter(c => words(c.text) >= 4).length >= filled.length * 0.6) {
        const columns = cols.map(() => [])
        rows.forEach(r => r.segments.forEach(sg => {
            const {first} = pdfColumnOf(cols, sg)
            columns[first].push({y: r.y, size: r.size, x0: sg.x0, x1: sg.x1, text: sg.text, segments: [sg]})
        }))
        return {columns}
    }

    // header: first row without numbers when the other rows contain numbers
    const isNum = c => c && PDF_NUM.test(c.text) && /\d/.test(c.text)
    const header = grid.length > 1 && !grid[0].some(isNum) && grid.slice(1).some(row => row.some(isNum))

    // alignment of a column: same right edge -> right, same center -> center
    const aligns = cols.map((c, i) => {
        const cells = grid.slice(header ? 1 : 0).map(row => row[i]).filter(cell => cell && cell.span === 1 && !cell.text.includes('\n'))
        if (cells.length < 2) return ''
        const spread = vals => Math.max(...vals) - Math.min(...vals)
        const left = spread(cells.map(cell => cell.x0)), right = spread(cells.map(cell => cell.x1))
        const center = spread(cells.map(cell => (cell.x0 + cell.x1) / 2))
        if (left <= 2) return ''
        if (right <= 2) return 'right'
        if (center <= 2) return 'center'
        return ''
    })

    const rowHtml = (row, tag) => {
        let out = ''
        for (let i = 0; i < row.length; i++) {
            const cell = row[i]
            let span = cell ? cell.span : 1
            // a cell spans over empty columns only
            for (let k = 1; k < span; k++) {
                if (row[i + k]) {
                    span = k
                    break
                }
            }
            const attrs = (span > 1 ? ` colspan="${span}"` : '') + (aligns[i] && span === 1 ? ` style="text-align:${aligns[i]}"` : '')
            out += `<${tag}${attrs}>${cell ? esc(cell.text).replace(/\n/g, ' ') : ''}</${tag}>`
            i += span - 1
        }
        return '<tr>' + out + '</tr>'
    }
    const head = header ? `<thead>${rowHtml(grid[0], 'th')}</thead>` : ''
    return {html: `<table>${head}<tbody>${grid.slice(header ? 1 : 0).map(row => rowHtml(row, 'td')).join('')}</tbody></table>`}
}

// text lines (no table) -> html, paragraphs from the line spacing and short lines, larger font -> heading
const pdfTextHtml = (lines, bodySize) => {
    const isHeading = l => l && l.size >= bodySize * 1.25 && l.text.length < 120
    const maxRight = Math.max(...lines.map(l => l.x1 || 0))
    const minLeft = Math.min(...lines.map(l => l.x0 || 0))
    let text = ''
    lines.forEach((l, i) => {
        const prev = lines[i - 1]
        if (prev) {
            const gap = prev.y - l.y
            // next column / page: the paragraph goes on when the sentence goes on
            const goesOn = /[a-zäöü,]$/.test(prev.text) && /^[a-zäöü]/.test(l.text)
            const newPara = isHeading(l) || isHeading(prev) || (gap < 0 && !goesOn) || gap > Math.max(prev.size, l.size) * (goesOn ? 4 : 1.6) ||
                // a short line ending a sentence ends the paragraph
                (/[.:!?]["»“)]?$/.test(prev.text) && prev.x1 < minLeft + (maxRight - minLeft) * 0.8)
            if (newPara) {
                text += '\n\n'
            } else if (/^([-*•–]|\d+[.)])\s/.test(l.text)) {
                text += '\n'
            } else if (/[a-zäöü]-$/.test(prev.text) && /^[a-zäöü]/.test(l.text)) {
                // hyphenation
                text = text.slice(0, -1)
            } else {
                text += ' '
            }
        }
        text += (isHeading(l) && !(isHeading(prev) && prev.y - l.y < l.size * 1.6) ? '## ' : '') + l.text
    })
    return textToHtml(text)
}

// line of a part of the segments
const pdfSubLine = (l, segments) => ({
    y: l.y, size: l.size, segments, text: segments.map(sg => sg.text).join(' '),
    x0: segments[0].x0, x1: segments[segments.length - 1].x1
})

/**
 * page layout with text columns: lines are read column by column (left column, then right column),
 * lines over the whole width (title, wide tables) stay where they are
 */
const pdfReadColumns = (lines) => {
    const wordy = sg => words(sg.text) >= 3
    const candidates = []
    lines.forEach(l => l.segments.forEach((sg, i) => {
        const next = l.segments[i + 1]
        if (next && wordy(sg) && wordy(next)) candidates.push((sg.x1 + next.x0) / 2)
    }))
    if (candidates.length < 4) return lines
    // gutter: the position most lines are split at
    let gutter = null, best = 0
    candidates.forEach(x => {
        const count = lines.filter(l => l.segments.some((sg, i) => {
            const next = l.segments[i + 1]
            return next && sg.x1 < x && next.x0 > x && wordy(sg) && wordy(next)
        })).length
        if (count > best) {
            best = count
            gutter = x
        }
    })
    if (best < 4 || best < lines.length * 0.2) return lines
    const crosses = l => l.segments.some(sg => sg.x0 < gutter - 2 && sg.x1 > gutter + 2)
    const out = []
    let left = [], right = []
    const flushBand = () => {
        out.push(...left, ...right)
        left = []
        right = []
    }
    lines.forEach(l => {
        if (crosses(l)) {
            flushBand()
            out.push(l)
            return
        }
        const ls = l.segments.filter(sg => sg.x1 <= gutter), rs = l.segments.filter(sg => sg.x0 >= gutter)
        if (ls.length) left.push(pdfSubLine(l, ls))
        if (rs.length) right.push(pdfSubLine(l, rs))
    })
    flushBand()
    return out
}

const pdfPageHtml = (items) => {
    const lines = pdfReadColumns(pdfLines(items))
    if (!lines.length) return ''
    // most common font size = body text
    const sizes = {}
    lines.forEach(l => {
        const k = Math.round(l.size)
        sizes[k] = (sizes[k] || 0) + l.text.length
    })
    const bodySize = parseInt(Object.keys(sizes).sort((a, b) => sizes[b] - sizes[a])[0]) || 10

    const parts = []
    let textLines = [], tableRows = []
    const flushText = () => {
        if (textLines.length) parts.push(pdfTextHtml(textLines, bodySize))
        textLines = []
    }
    const flushTable = () => {
        const real = tableRows.filter(r => !r.cont)
        const res = real.length >= 2 ? pdfTable(tableRows) : null
        if (res && res.html) {
            flushText()
            parts.push(res.html)
        } else if (res && res.columns) {
            res.columns.forEach(col => textLines.push(...col))
        } else {
            textLines.push(...tableRows)
        }
        tableRows = []
    }
    const near = (a, b, factor = 3) => a && b && a.y - b.y > 0 && a.y - b.y < Math.max(a.size, b.size) * factor
    // a row fits to the table so far: no long text over several columns
    const fits = (l) => {
        if (tableRows.filter(r => !r.cont).length < 2) return true
        const cols = pdfColumns(tableRows)
        return l.segments.every(sg => {
            const {first, last} = pdfColumnOf(cols, sg)
            return first === last || words(sg.text) < 4
        })
    }
    // a line with one segment inside a table: wrapped text of a cell
    const isContinuation = (i) => {
        const l = lines[i]
        const last = tableRows[tableRows.length - 1]
        if (!last || !near(last, l, 1.6)) return false
        const cols = pdfColumns(tableRows)
        // clearly not in the first column: body text never starts there
        if (cols.length > 1 && l.segments[0].x0 > cols[0].x1) return true
        // otherwise another row of the table has to follow
        let prev = l
        for (let k = i + 1; k < lines.length; k++) {
            const n = lines[k]
            if (!near(prev, n, 1.6)) return false
            if (n.segments.length >= 2) return fits(n)
            prev = n
        }
        return false
    }
    lines.forEach((l, i) => {
        const last = tableRows[tableRows.length - 1]
        if (l.segments.length >= 2 && (!last || (near(last, l) && fits(l)))) {
            tableRows.push(l)
        } else if (l.segments.length === 1 && tableRows.length && isContinuation(i)) {
            tableRows.push({...l, cont: true})
        } else {
            if (tableRows.length) flushTable()
            if (l.segments.length >= 2) tableRows.push(l)
            else textLines.push(l)
        }
    })
    if (tableRows.length) flushTable()
    flushText()
    return parts.join('')
}

export const pdfToHtml = async (buffer) => {
    const {extractText, getDocumentProxy} = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    try {
        // with the positions of the text: tables and headings are recognized
        const pages = []
        for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n)
            const content = await page.getTextContent()
            pages.push(pdfPageHtml(content.items))
        }
        const h = pages.join('')
        if (h) return h
    } catch (e) {
        console.warn('pdfToHtml: positions not readable, plain text is used', e.message)
    }
    const {text} = await extractText(pdf, {mergePages: false})
    const pages = Array.isArray(text) ? text : [text]
    // lines of a paragraph are joined, an empty line (or a short line ending with no punctuation) starts a new one
    return pages.map(page => textToHtml(String(page || '')
        .replace(/-\n(?=[a-zäöü])/g, '')
        .replace(/([^\n.:!?])\n(?=[a-zäöü0-9(])/g, '$1 '))).join('')
}

// ---------- remote ----------

const fetchBuffer = async (url, {maxBytes = 15 * 1024 * 1024, timeout = 20000} = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: {'User-Agent': 'Mozilla/5.0 (compatible; lunuc content import)', 'Accept': '*/*'}
        })
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
        const length = parseInt(res.headers.get('content-length') || '0')
        if (length > maxBytes) throw new Error(`${url}: zu gross (${Math.round(length / 1024 / 1024)} MB)`)
        const buffer = Buffer.from(await res.arrayBuffer())
        if (buffer.length > maxBytes) throw new Error(`${url}: zu gross`)
        return {buffer, contentType: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), url: res.url || url}
    } finally {
        clearTimeout(timer)
    }
}

const isPrivateUrl = (u) => {
    try {
        const {hostname, protocol} = new URL(u)
        if (!/^https?:$/.test(protocol)) return true
        return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?|169\.254\.)/i.test(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')
    } catch (e) {
        return true
    }
}

// ---------- other office formats (Pages, Numbers, doc, odt, rtf) ----------

const TO_DOCX = ['pages', 'doc', 'docm', 'dot', 'dotx', 'odt', 'ott', 'rtf', 'wpd', 'wps']
const TO_XLSX = ['numbers']

const findSoffice = () => {
    const candidates = [process.env.SOFFICE_PATH,
        ...String(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(d => path.join(d, 'soffice')),
        '/usr/bin/soffice', '/usr/local/bin/soffice', '/usr/lib/libreoffice/program/soffice',
        '/opt/libreoffice/program/soffice', '/snap/bin/libreoffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice']
    return candidates.filter(Boolean).find(p => {
        try {
            fs.accessSync(p, fs.constants.X_OK)
            return true
        } catch (e) {
            return false
        }
    })
}

/**
 * converts a file with LibreOffice (if installed, path can be set with SOFFICE_PATH), e.g. Pages -> docx
 * returns the converted buffer or null when LibreOffice is not available
 */
export const convertWithLibreOffice = async (buffer, fileName, target) => {
    const soffice = findSoffice()
    if (!soffice) return null
    const os = await import('os')
    const {execFile} = await import('child_process')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lunuc-import-'))
    try {
        const src = path.join(dir, 'source.' + (ext(fileName) || 'bin'))
        fs.writeFileSync(src, buffer)
        await new Promise((resolve, reject) => execFile(soffice, [
            '-env:UserInstallation=file://' + path.join(dir, 'profile'),
            '--headless', '--norestore', '--convert-to', target, '--outdir', dir, src
        ], {timeout: 120000}, (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message).trim())) : resolve()))
        const out = path.join(dir, 'source.' + target)
        return fs.existsSync(out) ? fs.readFileSync(out) : null
    } finally {
        fs.rmSync(dir, {recursive: true, force: true})
    }
}

// ---------- main ----------

const typeOf = (fileName, mimeType) => {
    const x = ext(fileName), m = String(mimeType || '').toLowerCase()
    if (x === 'docx' || m.includes('wordprocessingml')) return 'docx'
    if (TO_DOCX.includes(x) || TO_XLSX.includes(x) || m.includes('iwork') || m === 'application/msword' ||
        m === 'application/rtf' || m === 'text/rtf' || m.includes('opendocument.text')) return 'office'
    if (x === 'pdf' || m === 'application/pdf') return 'pdf'
    if (['xlsx', 'xlsm', 'xls', 'ods', 'csv'].includes(x) || m.includes('spreadsheetml') || m.includes('ms-excel') || m === 'text/csv') return 'excel'
    if (['html', 'htm'].includes(x) || m === 'text/html' || m === 'application/xhtml+xml') return 'html'
    if (['md', 'markdown', 'txt'].includes(x) || m.startsWith('text/')) return 'text'
    if (IMAGE_EXT.includes(x) || m.startsWith('image/')) return 'image'
    return ''
}

/**
 * converts a file (buffer + fileName/mimeType), a web page (url), html or text into elements
 * options: {importImages: true, uploadDir, resolver, allowPrivateUrls: false}
 * returns {elements, medias, warnings, title, type}
 */
export const convertContent = async ({db, context, buffer, fileName = '', mimeType = '', url, html, text, options = {}}) => {
    const warnings = [], medias = []
    const {importImages = true, uploadDir, resolver, allowPrivateUrls = false} = options
    const mediaOpts = {db, context, uploadDir, resolver, warnings}
    let type, title = ''

    if (url) {
        if (!allowPrivateUrls && isPrivateUrl(url)) throw new Error('Diese Adresse ist nicht erlaubt')
        const res = await fetchBuffer(url)
        buffer = res.buffer
        mimeType = res.contentType
        fileName = baseName(new URL(res.url).pathname) || 'seite.html'
        url = res.url
        type = typeOf(fileName, mimeType) || (mimeType.includes('html') ? 'html' : '')
        if (type === 'html' || type === 'text') {
            html = buffer.toString('utf8')
            if (type === 'text') {
                text = html
                html = undefined
            }
        }
    } else if (html !== undefined) {
        type = 'html'
    } else if (text !== undefined) {
        type = 'text'
    } else {
        type = typeOf(fileName, mimeType)
        if (type === 'html') html = buffer.toString('utf8')
        if (type === 'text') text = buffer.toString('utf8')
    }
    if (!type) throw new Error(`Dateityp wird nicht unterstützt: ${fileName || mimeType}`)

    if (type === 'office') {
        // Pages, Numbers, doc, odt, rtf: converted to Word / Excel with LibreOffice
        const x = ext(fileName)
        const toXlsx = TO_XLSX.includes(x)
        const label = x === 'pages' ? 'Pages' : x === 'numbers' ? 'Numbers' : x.toUpperCase()
        let converted = null, preview = null
        if (x === 'pages' || x === 'numbers') {
            // older iWork files contain a pdf preview
            try {
                const entry = new AdmZip(buffer).getEntry('QuickLook/Preview.pdf')
                if (entry) preview = entry.getData()
            } catch (e) {
                // a Pages "package" (folder) or a damaged file
            }
        }
        try {
            converted = await convertWithLibreOffice(buffer, fileName, toXlsx ? 'xlsx' : 'docx')
        } catch (e) {
            warnings.push(`${label}-Datei konnte nicht umgewandelt werden (${e.message.split('\n')[0].replace(/\/\S+/g, '').trim()})`)
        }
        if (converted) {
            buffer = converted
            fileName = (fileName.replace(/\.[^.]+$/, '') || 'dokument') + (toXlsx ? '.xlsx' : '.docx')
            type = toXlsx ? 'excel' : 'docx'
        } else if (preview) {
            buffer = preview
            type = 'pdf'
            warnings.push(`${label}-Datei: es wurde die eingebettete PDF-Vorschau übernommen, Bilder fehlen. Für ein besseres Ergebnis in ${label} als Word exportieren.`)
        } else {
            throw new Error(`${label}-Dateien können auf diesem Server nicht direkt gelesen werden. Bitte in ${label} über „Ablage → Exportieren nach → ${toXlsx ? 'Excel' : 'Word'}“ (oder als PDF) exportieren und diese Datei importieren.`)
        }
    }

    let blocks = []
    if (type === 'docx') {
        const {blocks: docBlocks, getFile} = docxToBlocks(buffer)
        for (const b of docBlocks) {
            if (b.type === 'html') {
                blocks.push(b)
            } else if (importImages) {
                const data = getFile(b.file)
                if (data && IMAGE_EXT.includes(ext(b.file))) {
                    const m = await createImageMedia({...mediaOpts, buffer: data, name: (fileName.replace(/\.[^.]+$/, '') || 'bild') + '-' + baseName(b.file)})
                    medias.push(m)
                    blocks.push({type: 'image', media: m})
                }
            }
        }
    } else if (type === 'pdf') {
        const h = await pdfToHtml(buffer)
        if (h) blocks.push({type: 'html', html: h})
        else warnings.push('Im PDF wurde kein Text gefunden (gescanntes Dokument?)')
    } else if (type === 'excel') {
        const h = ext(fileName) === 'csv' ? await excelToHtml(Buffer.from(buffer.toString('utf8')), {}) : await excelToHtml(buffer)
        if (h) blocks.push({type: 'html', html: h})
    } else if (type === 'text') {
        const h = textToHtml(text)
        if (h) blocks.push({type: 'html', html: h})
    } else if (type === 'html') {
        const res = htmlToBlocks(html, {baseUrl: url})
        title = res.title
        let count = 0
        for (const b of res.blocks) {
            if (b.type === 'html') {
                blocks.push(b)
            } else if (b.type === 'img' && importImages && count < MAX_REMOTE_IMAGES && /^https?:/.test(b.src)) {
                count++
                try {
                    if (!allowPrivateUrls && isPrivateUrl(b.src)) throw new Error('Adresse nicht erlaubt')
                    const img = await fetchBuffer(b.src, {maxBytes: 20 * 1024 * 1024})
                    if (!img.contentType.startsWith('image/')) throw new Error('kein Bild')
                    let name = baseName(new URL(img.url).pathname) || 'bild'
                    if (!ext(name)) name += '.' + (img.contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('svg+xml', 'svg')
                    const m = await createImageMedia({...mediaOpts, buffer: img.buffer, name})
                    medias.push(m)
                    blocks.push({type: 'image', media: m, alt: b.alt})
                } catch (e) {
                    warnings.push(`Bild ${b.src} nicht übernommen: ${e.message}`)
                }
            }
        }
    } else if (type === 'image') {
        const m = await createImageMedia({...mediaOpts, buffer, name: fileName || 'bild.jpg'})
        medias.push(m)
        blocks.push({type: 'image', media: m})
    }

    // neighbouring text blocks into one rich text
    const merged = []
    blocks.forEach(b => {
        const last = merged[merged.length - 1]
        if (b.type === 'html' && last && last.type === 'html') last.html += b.html
        else merged.push({...b})
    })
    return {elements: blocksToElements(merged), medias, warnings, title, type}
}
