import AdmZip from 'adm-zip'
import {htmlToBlocks, docxToBlocks} from '../../api/util/contentToJson.mjs'

const html = h => htmlToBlocks(h).blocks.map(b => b.html).join('')

// minimal docx with the given body xml
const docx = body => {
    const zip = new AdmZip()
    zip.addFile('word/document.xml', Buffer.from(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`))
    return docxToBlocks(zip.toBuffer()).blocks.map(b => b.html).join('')
}
const p = (text, jc) => `<w:p>${jc ? `<w:pPr><w:jc w:val="${jc}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`
const tc = (content, pr = '') => `<w:tc><w:tcPr>${pr}</w:tcPr>${content}</w:tc>`

describe('content import: tables', () => {
    test('html: alignment, rowspan, header and paragraphs in cells', () => {
        const out = html(`<p align="center">Mitte</p><table align="center"><thead><tr><th>A</th><th>B</th></tr></thead>
            <tr><td rowspan="2"><p class="MsoNormal">Zwei</p></td><td style="text-align:right">10</td></tr>
            <tr><td><p>x</p><p>y</p></td></tr></table>`)
        expect(out).toContain('<p style="text-align:center">Mitte</p>')
        expect(out).toContain('<table style="margin-left:auto;margin-right:auto"><thead><tr><th>A</th><th>B</th></tr></thead>')
        expect(out).toContain('<td rowspan="2">Zwei</td><td style="text-align:right">10</td>')
        expect(out).toContain('<td><p>x</p><p>y</p></td>')
    })

    test('html: nested table stays in its cell', () => {
        const out = html('<table><tr><td><table><tr><td>inner</td></tr></table></td><td>b</td></tr></table>')
        expect(out).toBe('<table><tbody><tr><td><table><tbody><tr><td>inner</td></tr></tbody></table></td><td>b</td></tr></tbody></table>')
    })

    test('docx: vertical merge, colspan, header row and alignment', () => {
        const out = docx(`${p('Rechts', 'right')}<w:tbl><w:tblPr><w:jc w:val="center"/></w:tblPr>
            <w:tr><w:trPr><w:tblHeader/></w:trPr>${tc(p('A'))}${tc(p('B'))}${tc(p('C'))}</w:tr>
            <w:tr>${tc(p('Zwei'), '<w:vMerge w:val="restart"/>')}${tc(p('1', 'right'))}${tc(p('2', 'right'))}</w:tr>
            <w:tr>${tc('<w:p/>', '<w:vMerge/>')}${tc(p('3', 'right'))}${tc(p('4', 'right'))}</w:tr>
            <w:tr>${tc(p('Total', 'center'), '<w:gridSpan w:val="2"/>')}${tc(p('9', 'right'))}</w:tr>
            </w:tbl>`)
        expect(out).toContain('<p style="text-align:right">Rechts</p>')
        expect(out).toContain('<table style="margin-left:auto;margin-right:auto"><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>')
        expect(out).toContain('<tr><td rowspan="2">Zwei</td><td style="text-align:right">1</td><td style="text-align:right">2</td></tr>')
        expect(out).toContain('<tr><td style="text-align:right">3</td><td style="text-align:right">4</td></tr>')
        expect(out).toContain('<td colspan="2" style="text-align:center">Total</td>')
    })
})
