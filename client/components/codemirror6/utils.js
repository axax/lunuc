import {formatCss} from './formatCss'
import {formatJs} from './formatJs'

export function scrollToLine(view, firstVisibleLine) {
    if (firstVisibleLine > 1 && view.state.doc.lines > firstVisibleLine) {
        const line = view.state.doc.line(firstVisibleLine + 1)
        //console.debug(`codemirror scroll to line ${firstVisibleLine}`, line, view.coordsAtPos(line.from))
        view.dispatch({selection: {anchor: line.from}, scrollIntoView: true})
        const coords = view.coordsAtPos(line.from)
        if (coords && coords.top) {
            view.scrollDOM.scrollTo(0, coords.top - view.documentTop)
        }
    }
}
export function replaceLineWithText(view, lineNumberToReplace, newText) {
    const lineInfo = view.state.doc.line(lineNumberToReplace)
    // Replace the entire line
    view.dispatch({
        changes: {
            from: lineInfo.from, // Start position of the line
            to: lineInfo.to,     // End position of the line
            insert: newText      // New text to insert
        }
    })
}

export function formatCode(view, type) {
    const code = view.state.doc.toString()
    console.log(`format code for type ${type}`)
    let formattedCode
    if(type==='json') {
        formattedCode = JSON.stringify(JSON.parse(code), null, 2)
    }else if(type==='css'){
        formattedCode = formatCss(code)
    }else if(type==='js' || type==='customJs'){
        formattedCode = formatJs(code)
    }

    if(formattedCode){
        const fistVisibleLine = view.state.doc.lineAt(view.elementAtHeight(view.dom.getBoundingClientRect().top - view.documentTop).from).number
        view.dispatch({
            changes: {from: 0, to: view.state.doc.length, insert: formattedCode}
        })
        scrollToLine(view, fistVisibleLine)
    }
}

export const jumpToLine = (view) => {
    const lineNumber = Number(prompt("Enter line number:"))
    if (!isNaN(lineNumber) && lineNumber > 0) {
        const targetPosition = view.state.doc.line(lineNumber).from
        view.dispatch({
            selection: { anchor: targetPosition },
            scrollIntoView: true
        })
    }
}

const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

// Splits a diff into hunks. Each hunk carries its body lines and, if present,
// the parsed @@ header (oldStart is 1-based, as in unified diff format).
// Supports plain -/+ block diffs without any @@ header too.
function parseDiffHunks(diffLines) {
    const hunks = []
    let i = 0
    while (i < diffLines.length) {
        const line = diffLines[i]
        const headerMatch = line.match(HUNK_HEADER_REGEX)

        const isMeta = !headerMatch && (
            line.startsWith('diff --git') ||
            line.startsWith('index ') ||
            /^---(\s|$)/.test(line) ||
            /^\+\+\+(\s|$)/.test(line)
        )

        if (isMeta) {
            i++
            continue
        }

        let header = null
        if (headerMatch) {
            header = {oldStart: parseInt(headerMatch[1], 10)}
            i++
        }

        if (i < diffLines.length &&
            (diffLines[i].startsWith('-') || diffLines[i].startsWith('+') || diffLines[i].startsWith(' '))) {
            const body = []
            while (i < diffLines.length &&
            (diffLines[i].startsWith('-') || diffLines[i].startsWith('+') || diffLines[i].startsWith(' ')) &&
            !/^---(\s|$)/.test(diffLines[i]) && !/^\+\+\+(\s|$)/.test(diffLines[i])) {
                body.push(diffLines[i])
                i++
            }
            hunks.push({header, body})
        } else if (!header) {
            i++
        } else {
            // header with no body lines following - ignore
        }
    }
    return hunks
}

function splitHunkBody(body) {
    const removed = []
    const added = []
    for (const l of body) {
        const marker = l.charAt(0)
        const content = l.slice(1)
        if (marker === ' ') {
            removed.push(content)
            added.push(content)
        } else if (marker === '-') {
            removed.push(content)
        } else if (marker === '+') {
            added.push(content)
        }
    }
    return {removed, added}
}

function matchesAt(lines, start, removed) {
    if (start < 0 || start + removed.length > lines.length) return false
    for (let k = 0; k < removed.length; k++) {
        if (lines[start + k] !== removed[k]) return false
    }
    return true
}

function searchForBlock(lines, removed, searchFrom) {
    for (let start = searchFrom; start <= lines.length - removed.length; start++) {
        if (matchesAt(lines, start, removed)) return start
    }
    return -1
}

// Applies a diff to text. Supports:
//  - unified diff hunks with "@@ -a,b +c,d @@" headers (uses line numbers, with
//    fallback to content search if the numbers don't line up with the current text)
//  - plain "-"/"+"/" " blocks without any header (positioned purely by content search)
// Throws an Error if a block can't be located/verified in the original content.
export function applyUnifiedDiff(originalText, diffText) {
    let lines = originalText.split('\n')
    const hunks = parseDiffHunks(diffText.split('\n'))

    if (hunks.length === 0) {
        throw new Error('Kein gültiger Patch-Inhalt gefunden (keine Zeilen mit "-" oder "+").')
    }

    let searchFrom = 0
    let lineOffset = 0 // cumulative shift between original and header line numbers

    for (const {header, body} of hunks) {
        const {removed, added} = splitHunkBody(body)

        if (removed.length === 0) {
            throw new Error('Patch enthält einen reinen Einfüge-Block ohne Kontext- oder Entfernungszeilen; die Position kann nicht eindeutig bestimmt werden.')
        }

        let start = -1

        if (header) {
            const candidate = header.oldStart - 1 + lineOffset
            if (matchesAt(lines, candidate, removed)) {
                start = candidate
            }
        }

        if (start === -1) {
            start = searchForBlock(lines, removed, searchFrom)
        }

        if (start === -1) {
            const preview = removed.slice(0, 3).join('\n') + (removed.length > 3 ? '\n...' : '')
            throw new Error(`Patch passt nicht auf den Code, folgender Block wurde nicht gefunden:\n${preview}`)
        }

        const end = start + removed.length
        lines = lines.slice(0, start).concat(added, lines.slice(end))

        lineOffset += added.length - removed.length
        searchFrom = start + added.length
    }

    return lines.join('\n')
}