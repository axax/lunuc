import {gutter, GutterMarker} from "@codemirror/view"

const emptyMarker = new class extends GutterMarker {
    toDOM() { return document.createTextNode("ø") }
}

export const emptyLineGutter = gutter({
    lineMarker(view, line) {
        return line.from == line.to ? emptyMarker : null
    },
    initialSpacer: () => emptyMarker
})