import {formatCss} from './formatCss'

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