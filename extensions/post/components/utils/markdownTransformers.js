import {CHECK_LIST, TRANSFORMERS} from '@lexical/markdown'
import {
    $createHorizontalRuleNode,
    $isHorizontalRuleNode,
    HorizontalRuleNode
} from '@lexical/react/LexicalHorizontalRuleNode'
import {$createImageNode, $isImageNode, ImageNode} from '../nodes/ImageNode.js'

export const HR = {
    dependencies: [HorizontalRuleNode],
    export: (node) => $isHorizontalRuleNode(node) ? '***' : null,
    regExp: /^(---|\*\*\*|___)\s?$/,
    replace: (parentNode, _children, _match, isImport) => {
        const line = $createHorizontalRuleNode()
        if (isImport || parentNode.getNextSibling() != null) {
            parentNode.replace(line)
        } else {
            parentNode.insertBefore(line)
        }
        line.selectNext()
    },
    type: 'element'
}

export const IMAGE = {
    dependencies: [ImageNode],
    export: (node) => {
        if (!$isImageNode(node)) {
            return null
        }
        return `![${node.getAltText()}](${node.getSrc()})`
    },
    importRegExp: /!(?:\[([^[]*)\])(?:\(([^(]+)\))/,
    regExp: /!(?:\[([^[]*)\])(?:\(([^(]+)\))$/,
    replace: (textNode, match) => {
        const [, altText, src] = match
        const imageNode = $createImageNode({altText, src})
        textNode.replace(imageNode)
    },
    trigger: ')',
    type: 'text-match'
}

// Bild und Trennlinie zuerst, damit sie vor den Standard-Transformern greifen
export const EXTENDED_TRANSFORMERS = [HR, IMAGE, CHECK_LIST, ...TRANSFORMERS]
