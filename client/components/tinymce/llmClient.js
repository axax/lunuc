// Thin client for the lunuc system LLM endpoint (/lunucapi/system/llm).
//
// The endpoint streams plain text that is interleaved with a few control tags:
//   <think>…</think>               reasoning of the model
//   <tool_call …>…</tool_call>     status line of a running tool
//   <tool_result>…</tool_result>   raw tool output (never shown)
//   <ask_user>{json}</ask_user>    the model asks a clarifying question
//   <ping …/> <model_hint …/>      heartbeat / delegated model
//   <reset_content/>               everything streamed so far is obsolete
//   <stream_aborted/>              the server aborted the generation
// Everything else is the answer itself and may contain HTML or markdown.

export const LLM_ENDPOINT = '/lunucapi/system/llm'

const CONTROL_TAG_PREFIXES = ['<think', '</think', '<tool_call', '</tool_call', '<tool_result', '</tool_result',
    '<ask_user', '</ask_user', '<ping', '<model_hint', '<reset_content', '<stream_aborted']

const removeBlock = (text, open, close, collect) => {
    let result = '', pos = 0
    while (true) {
        const start = text.indexOf(open, pos)
        if (start < 0) {
            result += text.substring(pos)
            break
        }
        result += text.substring(pos, start)
        const openEnd = text.indexOf('>', start)
        if (openEnd < 0) {
            // tag itself is not complete yet
            if (collect) collect(null, '', true)
            break
        }
        const end = text.indexOf(close, openEnd)
        const attrs = text.substring(start + open.length, openEnd)
        if (end < 0) {
            // block still streaming
            if (collect) collect(attrs, text.substring(openEnd + 1), true)
            break
        }
        if (collect) collect(attrs, text.substring(openEnd + 1, end), false)
        pos = end + close.length
    }
    return result
}

/**
 * Splits the raw stream into its parts. Called with the complete raw text on
 * every chunk, so it must be pure and cheap enough for a few hundred KB.
 */
export const parseLlmStream = (raw) => {
    const state = {
        answer: '',
        thinking: '',
        isThinking: false,
        tools: [],
        askUser: null,
        model: null,
        aborted: false,
        status: null
    }
    let text = raw || ''

    const resetIdx = text.lastIndexOf('<reset_content/>')
    if (resetIdx >= 0) {
        text = text.substring(resetIdx + '<reset_content/>'.length)
    }

    if (text.indexOf('<stream_aborted/>') >= 0) {
        state.aborted = true
        text = text.replace(/<stream_aborted\/>/g, '')
    }

    let lastPing = null
    text = text.replace(/<ping\b([^>]*)\/>/g, (m, attrs) => {
        lastPing = attrs
        return ''
    })
    if (lastPing) {
        const label = /label="([^"]*)"/.exec(lastPing)
        if (label) state.status = label[1]
    }

    text = text.replace(/<model_hint\b([^>]*)\/>/g, (m, attrs) => {
        const model = /model="([^"]*)"/.exec(attrs)
        if (model) state.model = model[1]
        return ''
    })

    const thinkingParts = []
    text = removeBlock(text, '<think', '</think>', (attrs, content, open) => {
        thinkingParts.push(content)
        if (open) state.isThinking = true
    })
    state.thinking = thinkingParts.join('\n').trim()

    text = removeBlock(text, '<tool_result', '</tool_result>')

    text = removeBlock(text, '<tool_call', '</tool_call>', (attrs, content, open) => {
        if (attrs === null) return
        const status = /status="([^"]*)"/.exec(attrs || '')
        state.tools.push({label: content.trim(), running: open, status: status ? status[1] : null})
    })

    text = removeBlock(text, '<ask_user', '</ask_user>', (attrs, content, open) => {
        if (open) return
        try {
            const data = JSON.parse(content)
            if (data && data.question) state.askUser = data
        } catch (e) {
            state.askUser = {question: content}
        }
    })

    // hide a control tag that is cut in the middle of the current chunk
    const lastLt = text.lastIndexOf('<')
    if (lastLt >= 0 && text.indexOf('>', lastLt) < 0) {
        const tail = text.substring(lastLt)
        if (CONTROL_TAG_PREFIXES.some(p => p.startsWith(tail) || tail.startsWith(p))) {
            text = text.substring(0, lastLt)
        }
    }

    state.answer = text.replace(/^\s+/, '')
    return state
}

/**
 * Streams a request against the LLM endpoint.
 * @param {object} body       request parameters (content, contextKey, model, …)
 * @param {function} onUpdate called with (parsedState, rawText) on every chunk
 * @param {AbortSignal} signal
 * @returns {Promise<object>} final parsed state
 */
export const streamLlm = async ({body, onUpdate, signal}) => {
    const response = await fetch(LLM_ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        credentials: 'same-origin',
        body: JSON.stringify({stream: true, ...body}),
        signal
    })

    if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => '')
        throw new Error(errorText || `HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let raw = ''
    let parsed = parseLlmStream('')

    while (true) {
        const {value, done} = await reader.read()
        if (done) {
            raw += decoder.decode()
            break
        }
        raw += decoder.decode(value, {stream: true})
        parsed = parseLlmStream(raw)
        if (onUpdate) onUpdate(parsed, raw)
    }
    parsed = parseLlmStream(raw)
    parsed.isThinking = false
    parsed.tools.forEach(t => t.running = false)
    if (onUpdate) onUpdate(parsed, raw)
    return parsed
}

let modelsPromise = null
/** Lists the models the current user may use. Cached for the page lifetime. */
export const fetchLlmModels = () => {
    if (!modelsPromise) {
        modelsPromise = fetch(`${LLM_ENDPOINT}?listModels=true`, {credentials: 'same-origin'})
            .then(r => r.ok ? r.json() : {})
            .then(data => (data.models || []).map(m => ({
                value: m.name || m.model,
                label: m.label || m.rawName || m.name || m.model
            })).filter(m => m.value))
            .catch(() => {
                modelsPromise = null
                return []
            })
    }
    return modelsPromise
}


const escapeHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const inlineMarkdown = (s) => {
    const codes = []
    let out = s.replace(/`([^`]+)`/g, (m, code) => {
        codes.push(code)
        return `\u0000${codes.length - 1}\u0000`
    })
    out = escapeHtml(out)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|mailto:)[^)\s]+)\)/g, '<a href="$2">$1</a>')
    return out.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${escapeHtml(codes[+i])}</code>`)
}

/** Minimal markdown → HTML conversion, good enough for chat answers. */
export const markdownToHtml = (md) => {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n')
    const html = []
    let list = null, paragraph = [], inCode = false, code = []

    const flushParagraph = () => {
        if (paragraph.length) {
            html.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`)
            paragraph = []
        }
    }
    const flushList = () => {
        if (list) {
            html.push(`<${list.type}>${list.items.map(i => `<li>${inlineMarkdown(i)}</li>`).join('')}</${list.type}>`)
            list = null
        }
    }

    for (const line of lines) {
        if (/^\s*```/.test(line)) {
            if (inCode) {
                html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
                code = []
                inCode = false
            } else {
                flushParagraph()
                flushList()
                inCode = true
            }
            continue
        }
        if (inCode) {
            code.push(line)
            continue
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
        const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
        if (heading) {
            flushParagraph()
            flushList()
            const level = Math.min(heading[1].length + 1, 6)
            html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`)
        } else if (bullet || ordered) {
            flushParagraph()
            const type = bullet ? 'ul' : 'ol'
            if (list && list.type !== type) flushList()
            if (!list) list = {type, items: []}
            list.items.push((bullet || ordered)[1])
        } else if (/^\s*>\s?/.test(line)) {
            flushParagraph()
            flushList()
            html.push(`<blockquote><p>${inlineMarkdown(line.replace(/^\s*>\s?/, ''))}</p></blockquote>`)
        } else if (/^\s*$/.test(line)) {
            flushParagraph()
            flushList()
        } else {
            flushList()
            paragraph.push(line)
        }
    }
    if (inCode) html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
    flushParagraph()
    flushList()
    return html.join('\n')
}

// An answer counts as HTML when it starts with a tag or contains block level
// markup. Markdown with a stray inline tag is still treated as markdown.
const BLOCK_HTML = /<(p|div|h[1-6]|ul|ol|table|blockquote|section|figure|pre)\b[^>]*>/i
const STARTS_WITH_TAG = /^<[a-z][a-z0-9]*\b[^>]*>/i

/**
 * Turns an answer into insertable HTML: strips code fences around HTML and
 * converts markdown when the answer is not already HTML.
 */
export const answerToHtml = (answer) => {
    let text = String(answer || '').trim()
    const fenced = /^```(?:html|HTML)?\s*\n([\s\S]*?)\n?```\s*$/.exec(text)
    if (fenced) {
        text = fenced[1].trim()
    }
    if (STARTS_WITH_TAG.test(text) || BLOCK_HTML.test(text)) {
        return text
    }
    return markdownToHtml(text)
}

/** Strips the markup of a html fragment. */
export const htmlToText = (html) => {
    const div = document.createElement('div')
    div.innerHTML = html || ''
    return (div.innerText || div.textContent || '').trim()
}

export const createContextKey = () => {
    if (window.crypto && window.crypto.randomUUID) {
        return 'tinyai-' + window.crypto.randomUUID()
    }
    return 'tinyai-' + Date.now().toString(36) + Math.random().toString(36).substring(2)
}
