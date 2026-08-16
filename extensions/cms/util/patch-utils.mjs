// patch-utils.mjs
// Whitespace tolerant patch application for lunuc component parts.

const TAB_SIZE = 4

export class PatchError extends Error {
    constructor(code, message, details = {}) {
        super(message)
        this.name = 'PatchError'
        this.code = code
        this.details = details
    }
}

const splitLines = (s) => s.split('\n')
const normalizeEol = (s) => s.replace(/\r\n?/g, '\n')
const leadingWs = (line) => (line.match(/^[ \t]*/) || [''])[0]

const indentWidth = (ws) => {
    let w = 0
    for (const ch of ws) {
        w += ch === '\t' ? TAB_SIZE - (w % TAB_SIZE) : 1
    }
    return w
}

/**
 * Matching levels, ordered from strict to lenient.
 * A level is only tried when every stricter level found zero matches.
 * As soon as a level finds more than one match we abort instead of escalating:
 * looser levels can only produce more matches, never fewer.
 */
const LEVELS = [
    {name: 'line-exact', line: (l) => l, skipBlank: false},
    {name: 'trailing-ws', line: (l) => l.replace(/[ \t]+$/, ''), skipBlank: false},
    {name: 'indent', line: (l) => l.trim(), skipBlank: false},
    {name: 'indent-blank', line: (l) => l.trim(), skipBlank: true},
    {name: 'inner-ws', line: (l) => l.trim().replace(/[ \t]+/g, ' '), skipBlank: true}
]

// 'inner-ws' rewrites whitespace inside the line and can produce false
// positives in string literals, so it is only enabled for whitespace
// insensitive content like CSS.
const MAX_LEVEL_BY_KEY = {
    style: LEVELS.length - 1,
    script: LEVELS.length - 2,
    serverScript: LEVELS.length - 2,
    dataResolver: LEVELS.length - 2
}

function significantLines(lines, level) {
    const out = []
    for (let i = 0; i < lines.length; i++) {
        const text = level.line(lines[i])
        if (level.skipBlank && text === '') {
            continue
        }
        out.push({index: i, text})
    }
    return out
}

/** Returns every match as a half open line range { start, end }. */
function findLineMatches(originalLines, oldLines, level) {
    const a = significantLines(originalLines, level)
    const b = significantLines(oldLines, level)
    if (!b.length) {
        return []
    }

    const hits = []
    for (let s = 0; s + b.length <= a.length; s++) {
        let ok = true
        for (let k = 0; k < b.length; k++) {
            if (a[s + k].text !== b[k].text) {
                ok = false
                break
            }
        }
        if (ok) {
            hits.push({start: a[s].index, end: a[s + b.length - 1].index + 1})
        }
    }
    return hits
}

function countOccurrences(haystack, needle) {
    if (!needle) {
        return 0
    }
    let count = 0
    let pos = haystack.indexOf(needle)
    while (pos !== -1) {
        count++
        pos = haystack.indexOf(needle, pos + needle.length)
    }
    return count
}

/** Character offset of the first character of each line. */
function lineOffsets(lines) {
    const offsets = [0]
    for (let i = 0; i < lines.length; i++) {
        offsets.push(offsets[i] + lines[i].length + 1)
    }
    return offsets
}

/**
 * Shifts newData to the indentation actually present in the target, not the
 * indentation the model assumed when it wrote the replacement.
 */
function reindent(newData, oldLines, originalLines, start) {
    const oldFirst = oldLines.findIndex((l) => l.trim() !== '')
    if (oldFirst === -1) {
        return newData
    }

    let origFirst = start
    while (origFirst < originalLines.length && originalLines[origFirst].trim() === '') {
        origFirst++
    }

    const fromWs = leadingWs(oldLines[oldFirst])
    const toWs = leadingWs(originalLines[origFirst] ?? '')
    if (fromWs === toWs) {
        return newData
    }

    const delta = indentWidth(toWs) - indentWidth(fromWs)
    const unit = toWs.includes('\t') ? '\t' : ' '

    return splitLines(newData).map((line) => {
        if (line.trim() === '') {
            return ''
        }
        if (fromWs && line.startsWith(fromWs)) {
            return toWs + line.slice(fromWs.length)
        }
        const cur = leadingWs(line)
        const target = Math.max(0, indentWidth(cur) + delta)
        const count = unit === '\t' ? Math.round(target / TAB_SIZE) : target
        return unit.repeat(count) + line.slice(cur.length)
    }).join('\n')
}

/**
 * Resolves a patch to a character range in `text`.
 * `text`, `oldData` and `newData` must already be EOL normalized.
 */
function resolvePatch(text, oldData, newData, key) {
    // Tier 0: raw substring match. Keeps sub line patches working.
    const exactCount = countOccurrences(text, oldData)
    if (exactCount === 1) {
        const from = text.indexOf(oldData)
        return {from, to: from + oldData.length, replacement: newData, matchedVia: 'exact'}
    }
    if (exactCount > 1) {
        throw new PatchError('PATCH_AMBIGUOUS',
            `old_data occurs ${exactCount} times. Extend it by whole lines to make it unique.`,
            {key, occurrences: exactCount})
    }

    // Tiers 1..n: line based, increasingly whitespace tolerant.
    const lines = splitLines(text)
    const oldLines = splitLines(oldData)
    const offsets = lineOffsets(lines)
    const maxLevel = MAX_LEVEL_BY_KEY[key] ?? LEVELS.length - 2

    for (let li = 0; li <= maxLevel; li++) {
        const level = LEVELS[li]
        const hits = findLineMatches(lines, oldLines, level)

        if (hits.length > 1) {
            throw new PatchError('PATCH_AMBIGUOUS',
                `old_data matches ${hits.length} locations (level "${level.name}"). ` +
                'Extend it by whole lines to make it unique.',
                {key, occurrences: hits.length, level: level.name})
        }
        if (hits.length === 1) {
            const {start, end} = hits[0]
            // The matched range covers the newline of its last line, so the
            // replacement has to bring its own - unless the region is deleted,
            // in which case its newline goes with it.
            const trailingNl = end < lines.length ? '\n' : ''
            const replacement = newData === ''
                ? ''
                : reindent(newData, oldLines, lines, start) + trailingNl

            return {
                from: offsets[start],
                to: Math.min(offsets[end], text.length),
                replacement,
                matchedVia: level.name
            }
        }
    }

    throw new PatchError('PATCH_NO_MATCH',
        'old_data was not found, not even with whitespace tolerant matching.', {key})
}

/**
 * Applies a single patch and returns the new content.
 *
 * Replacement is done by slicing, never by String.replace: the replacement text
 * may contain $&, $1 or similar patterns that replace() would expand.
 *
 * @param {string} original current value of the part
 * @param {{oldData: string, data: string}} patch
 * @param {{key?: string}} options
 * @returns {{result: string, matchedVia: string, degraded: boolean}}
 */
export function applyPatch(original, patch, options = {}) {
    const key = options.key || 'style'
    const oldData = normalizeEol(patch.oldData ?? '')
    const newData = normalizeEol(patch.data ?? '')

    if (!oldData.trim()) {
        throw new PatchError('PATCH_EMPTY_OLD_DATA',
            'old_data is empty or whitespace only.', {key})
    }
    if (typeof original !== 'string' || !original.length) {
        throw new PatchError('PATCH_NO_CONTENT',
            `No existing content for key "${key}".`, {key})
    }

    const text = normalizeEol(original)
    const {from, to, replacement, matchedVia} = resolvePatch(text, oldData, newData, key)

    return {
        result: text.slice(0, from) + replacement + text.slice(Math.min(to, text.length)),
        matchedVia,
        degraded: matchedVia !== 'exact'
    }
}

/** Structured feedback the LLM can act on in the next turn. */
export function buildPatchFeedback(error, key) {
    return `${error.code} for key="${key}": ${error.message}\n` +
        `Re-emit this change once as <lunuc_component key="${key}" op="replace"> ` +
        'containing the complete new value of the part. Do not retry with a modified old_data.'
}