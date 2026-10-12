/**
 * Converts content of other formats into JsonDom elements (the lunuc template structure), e.g. for the
 * content import of the cms editor (Api system/content2json) or the import of the Jahresbericht.
 *
 *   const {elements, medias, warnings} = await convertContent({db, context, buffer, fileName, mimeType})
 *   const {elements} = await convertContent({db, context, url: 'https://...'})
 *   const {elements} = await convertContent({db, context, html: '<p>..</p>'})   // or text: '...'
 *
 * Supported: Word (.docx), PDF (text), Excel (.xlsx/.xlsm/.xls/.csv -> tables), HTML / web page (url),
 * Markdown / text, pictures. Text becomes rich text elements (headings, lists, tables, links are kept),
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
    const styles = {}
    const $s = load(read('word/styles.xml'))
    $s('w\\:style').each((i, el) => {
        const nameEl = $s(el).children('w\\:name')[0]
        styles[el.attribs['w:styleId']] = norm(nameEl ? nameEl.attribs['w:val'] : el.attribs['w:styleId'])
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

    const paragraph = (p, inTable) => {
        const pPr = child(p, 'w:pPr')
        const styleEl = pPr && child(pPr, 'w:pStyle')
        const style = styleEl ? (styles[styleEl.attribs['w:val']] || norm(styleEl.attribs['w:val'])) : ''
        const numPr = pPr && child(pPr, 'w:numPr')
        const r = runsOf(p)
        return {style, numPr, ...r}
    }

    const handleParagraph = (p) => {
        const {style, numPr, html: h, text, allBold, images} = paragraph(p)
        const t = text.trim()
        if (t) {
            const heading = /^(heading|ueberschrift|title|titel|subtitle|untertitel)/.test(style)
            const shortBold = allBold && t.length < 120 && !/[.:,;]$/.test(t) && !numPr
            if (numPr) {
                const numIdEl = child(numPr, 'w:numId')
                const fmt = numIdEl ? numFormats[numIdEl.attribs['w:val']] : 'bullet'
                const tag = fmt && fmt !== 'bullet' && fmt !== 'none' ? 'ol' : 'ul'
                if (!list || list.tag !== tag) {
                    flushList()
                    list = {tag, items: []}
                }
                list.items.push(h)
            } else if (heading || shortBold) {
                flushList()
                html.push(`<h3>${esc(t)}</h3>`)
            } else {
                flushList()
                html.push(`<p>${h}</p>`)
            }
        }
        images.forEach(img => {
            flushHtml()
            blocks.push({type: 'image', file: img})
        })
    }

    const handleTable = (tbl) => {
        flushList()
        const rows = kids(tbl).filter(c => c.name === 'w:tr')
        const images = []
        const body = rows.map((tr, ri) => {
            const cells = kids(tr).filter(c => c.name === 'w:tc').map(tc => {
                const paras = kids(tc).filter(c => c.name === 'w:p').map(p => paragraph(p, true))
                paras.forEach(pp => images.push(...pp.images))
                const content = paras.map(pp => pp.html).filter(Boolean).join('<br>')
                const tcPr = child(tc, 'w:tcPr')
                const span = tcPr && child(tcPr, 'w:gridSpan')
                const colspan = span ? ` colspan="${parseInt(span.attribs['w:val']) || 1}"` : ''
                return {content, colspan, bold: paras.length > 0 && paras.every(pp => !pp.text.trim() || pp.allBold)}
            })
            const header = ri === 0 && cells.length > 1 && cells.every(c => c.bold)
            return '<tr>' + cells.map(c => header ? `<th${c.colspan}>${c.content}</th>` : `<td${c.colspan}>${c.content}</td>`).join('') + '</tr>'
        })
        if (rows.length) html.push(`<table><tbody>${body.join('')}</tbody></table>`)
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
    const table = (t) => {
        const rows = []
        $(t).find('tr').each((i, tr) => {
            const cells = []
            $(tr).children('th, td').each((k, c) => {
                const tag = c.name.toLowerCase()
                const span = c.attribs.colspan ? ` colspan="${parseInt(c.attribs.colspan) || 1}"` : ''
                cells.push(`<${tag}${span}>${inline(c).trim()}</${tag}>`)
            })
            if (cells.length) rows.push('<tr>' + cells.join('') + '</tr>')
        })
        return rows.length ? `<table><tbody>${rows.join('')}</tbody></table>` : ''
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
                if (text) buf.push(`<h${level}>${esc(text)}</h${level}>`)
            } else if (tag === 'p' || tag === 'blockquote' || tag === 'figcaption') {
                const h = inline(c).trim()
                if (h) buf.push(tag === 'blockquote' ? `<blockquote><p>${h}</p></blockquote>` : `<p>${h}</p>`)
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

export const pdfToHtml = async (buffer) => {
    const {extractText, getDocumentProxy} = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
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

// ---------- main ----------

const typeOf = (fileName, mimeType) => {
    const x = ext(fileName), m = String(mimeType || '').toLowerCase()
    if (x === 'docx' || m.includes('wordprocessingml')) return 'docx'
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
