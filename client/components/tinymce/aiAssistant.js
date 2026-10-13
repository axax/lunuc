import {_t, registerTrs} from 'util/i18n.mjs'
import {
    streamLlm,
    fetchLlmModels,
    answerToHtml,
    htmlToText,
    createContextKey
} from './llmClient'

// AI assistant for TinyMCE backed by the lunuc system LLM (/system/llm).
//
// Registers
//   sidebar      'aichat'            chat panel on the right (also a toggle button)
//   menu button  'aiactions'         toolbar menu with quick actions
//   menu items   'lunucai_*'         usable in menubar, context menu and quickbars
//   context menu 'lunucai'           right click entry
//   command      'LunucAiAction'     editor.execCommand('LunucAiAction', false, 'shorten')
//   event        'LunucAiApply'      fired after an AI result was written into the document

const SIDEBAR_NAME = 'aichat'
const MAX_DOCUMENT_CHARS = 40000
const MODEL_STORAGE_KEY = 'lunuc.tinyai.model'

registerTrs({
    de: {
        'TinyAi.title': 'KI-Assistent',
        'TinyAi.menu': 'KI',
        'TinyAi.openChat': 'KI-Chat öffnen',
        'TinyAi.newChat': 'Neuer Chat',
        'TinyAi.close': 'Schliessen',
        'TinyAi.placeholder': 'Frag etwas oder gib eine Anweisung…',
        'TinyAi.send': 'Senden (Enter)',
        'TinyAi.stop': 'Stoppen',
        'TinyAi.intro': 'Ich kann Texte verbessern, umschreiben, übersetzen, zusammenfassen oder neue Inhalte für dieses Dokument erstellen. Markiere Text, um gezielt damit zu arbeiten.',
        'TinyAi.contextSelection': 'Auswahl: %words% Wörter',
        'TinyAi.contextDocument': 'Kontext: ganzes Dokument',
        'TinyAi.contextEmpty': 'Dokument ist leer',
        'TinyAi.replace': 'Ersetzen',
        'TinyAi.replaceDocument': 'Dokument ersetzen',
        'TinyAi.insert': 'Einfügen',
        'TinyAi.copy': 'Kopieren',
        'TinyAi.copied': 'Kopiert',
        'TinyAi.retry': 'Nochmals',
        'TinyAi.thinking': 'Denkprozess',
        'TinyAi.working': 'Arbeite…',
        'TinyAi.error': 'Fehler',
        'TinyAi.aborted': 'Abgebrochen',
        'TinyAi.modelDefault': 'Standardmodell',
        'TinyAi.onSelection': 'Auswahl',
        'TinyAi.onDocument': 'Ganzes Dokument',
        'TinyAi.atCursor': 'an Cursorposition',
        'TinyAi.applied': 'Übernommen',
        'TinyAi.action.improve': 'Text verbessern',
        'TinyAi.action.rewrite': 'Umformulieren',
        'TinyAi.action.shorten': 'Kürzen',
        'TinyAi.action.expand': 'Ausführlicher schreiben',
        'TinyAi.action.simplify': 'Vereinfachen',
        'TinyAi.action.summarize': 'Zusammenfassen',
        'TinyAi.action.continue': 'Weiterschreiben',
        'TinyAi.action.headings': 'Überschriften vorschlagen',
        'TinyAi.action.custom': 'Eigene Anweisung…',
        'TinyAi.tone': 'Tonalität ändern',
        'TinyAi.tone.professional': 'Professionell',
        'TinyAi.tone.friendly': 'Freundlich',
        'TinyAi.tone.casual': 'Locker',
        'TinyAi.tone.persuasive': 'Überzeugend',
        'TinyAi.translate': 'Übersetzen',
        'TinyAi.lang.de': 'Deutsch',
        'TinyAi.lang.en': 'Englisch',
        'TinyAi.lang.fr': 'Französisch',
        'TinyAi.lang.it': 'Italienisch',
        'TinyAi.lang.es': 'Spanisch'
    },
    en: {
        'TinyAi.title': 'AI assistant',
        'TinyAi.menu': 'AI',
        'TinyAi.openChat': 'Open AI chat',
        'TinyAi.newChat': 'New chat',
        'TinyAi.close': 'Close',
        'TinyAi.placeholder': 'Ask something or give an instruction…',
        'TinyAi.send': 'Send (Enter)',
        'TinyAi.stop': 'Stop',
        'TinyAi.intro': 'I can improve, rewrite, translate or summarize text, or write new content for this document. Select text to work on it directly.',
        'TinyAi.contextSelection': 'Selection: %words% words',
        'TinyAi.contextDocument': 'Context: whole document',
        'TinyAi.contextEmpty': 'Document is empty',
        'TinyAi.replace': 'Replace',
        'TinyAi.replaceDocument': 'Replace document',
        'TinyAi.insert': 'Insert',
        'TinyAi.copy': 'Copy',
        'TinyAi.copied': 'Copied',
        'TinyAi.retry': 'Retry',
        'TinyAi.thinking': 'Reasoning',
        'TinyAi.working': 'Working…',
        'TinyAi.error': 'Error',
        'TinyAi.aborted': 'Aborted',
        'TinyAi.modelDefault': 'Default model',
        'TinyAi.onSelection': 'Selection',
        'TinyAi.onDocument': 'Whole document',
        'TinyAi.atCursor': 'at cursor',
        'TinyAi.applied': 'Applied',
        'TinyAi.action.improve': 'Improve writing',
        'TinyAi.action.rewrite': 'Rephrase',
        'TinyAi.action.shorten': 'Make shorter',
        'TinyAi.action.expand': 'Make longer',
        'TinyAi.action.simplify': 'Simplify',
        'TinyAi.action.summarize': 'Summarize',
        'TinyAi.action.continue': 'Continue writing',
        'TinyAi.action.headings': 'Suggest headings',
        'TinyAi.action.custom': 'Custom instruction…',
        'TinyAi.tone': 'Change tone',
        'TinyAi.tone.professional': 'Professional',
        'TinyAi.tone.friendly': 'Friendly',
        'TinyAi.tone.casual': 'Casual',
        'TinyAi.tone.persuasive': 'Persuasive',
        'TinyAi.translate': 'Translate',
        'TinyAi.lang.de': 'German',
        'TinyAi.lang.en': 'English',
        'TinyAi.lang.fr': 'French',
        'TinyAi.lang.it': 'Italian',
        'TinyAi.lang.es': 'Spanish'
    }
}, 'TinyAi')

const KEEP_LANGUAGE = 'Keep the language of the text.'

// apply: what the primary button does with the result
//   'replace' → replaces the selection (or the whole document without selection)
//   'insert'  → inserts after the selection / at the cursor
const ACTIONS = {
    improve: {
        icon: 'ai-review', apply: 'replace',
        prompt: `Fix spelling, grammar and punctuation and improve clarity and flow. Do not change the meaning. ${KEEP_LANGUAGE}`
    },
    rewrite: {
        icon: 'edit-block', apply: 'replace',
        prompt: `Rephrase the text with different wording while keeping the meaning and approximately the length. ${KEEP_LANGUAGE}`
    },
    shorten: {
        icon: 'ai', apply: 'replace',
        prompt: `Make the text noticeably shorter (about half) while keeping the key information. ${KEEP_LANGUAGE}`
    },
    expand: {
        icon: 'ai', apply: 'replace',
        prompt: `Make the text more detailed and about twice as long. Add useful details, do not invent facts. ${KEEP_LANGUAGE}`
    },
    simplify: {
        icon: 'ai', apply: 'replace',
        prompt: `Rewrite the text in plain, easy to understand language with short sentences. ${KEEP_LANGUAGE}`
    },
    summarize: {
        icon: 'ai-chat-response', apply: 'insert',
        prompt: `Write a concise summary of the text (a short paragraph or a few bullet points). ${KEEP_LANGUAGE}`
    },
    continue: {
        icon: 'ai-prompt', apply: 'insert', useTextBefore: true,
        prompt: `Continue writing the text naturally from where it ends. Write one or two paragraphs. Return ONLY the new continuation, not the existing text. ${KEEP_LANGUAGE}`
    },
    headings: {
        icon: 'ai', apply: 'replace',
        prompt: `Structure the text with meaningful h2/h3 headings and paragraphs. Keep the wording of the text. ${KEEP_LANGUAGE}`
    }
}

const TONES = ['professional', 'friendly', 'casual', 'persuasive']
const LANGUAGES = {de: 'German', en: 'English', fr: 'French', it: 'Italian', es: 'Spanish'}

TONES.forEach(tone => {
    ACTIONS['tone_' + tone] = {
        icon: 'ai', apply: 'replace', labelKey: 'TinyAi.tone.' + tone,
        prompt: `Rewrite the text in a ${tone} tone. Keep the meaning. ${KEEP_LANGUAGE}`
    }
})
Object.keys(LANGUAGES).forEach(lang => {
    ACTIONS['translate_' + lang] = {
        icon: 'translate', apply: 'replace', labelKey: 'TinyAi.lang.' + lang,
        prompt: `Translate the text into ${LANGUAGES[lang]}. Keep the HTML structure and formatting.`
    }
})

const actionLabel = (id) => _t(ACTIONS[id].labelKey || 'TinyAi.action.' + id)

const BASE_INSTRUCTIONS = `You are the writing assistant inside the rich text (HTML) editor of the lunuc CMS.
Reply in the language of the user's message unless asked otherwise.
When you write or rewrite content that is meant to be put into the document, reply ONLY with the resulting HTML fragment: allowed tags are p, h2, h3, h4, strong, em, u, a, ul, ol, li, blockquote, table, thead, tbody, tr, th, td, br. No code fences, no explanations, no html/head/body tags, no inline styles, no scripts.
For questions about the document, answer briefly; markdown is fine there.`

const ACTION_INSTRUCTIONS = `You are a text transformation engine inside a rich text (HTML) editor.
Reply ONLY with the resulting HTML fragment (tags: p, h2, h3, h4, strong, em, u, a, ul, ol, li, blockquote, table, thead, tbody, tr, th, td, br).
Preserve existing links and inline formatting where it makes sense. Never add explanations, comments, code fences or quotes around the result.`


// ─── tiny DOM helper ─────────────────────────────────────────────────────────
const h = (tag, props, ...children) => {
    const el = document.createElement(tag)
    if (props) {
        Object.keys(props).forEach(key => {
            const value = props[key]
            if (value === undefined || value === null || value === false) return
            if (key === 'className') el.className = value
            else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value)
            else if (key === 'html') el.innerHTML = value
            else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.substring(2).toLowerCase(), value)
            else el.setAttribute(key, value === true ? '' : value)
        })
    }
    children.flat().forEach(child => {
        if (child === undefined || child === null || child === false) return
        el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
    })
    return el
}

const STYLE_ID = 'lunucai-style'
const STYLES = `
.tox .lai{display:flex;flex-direction:column;height:100%;width:100%;min-width:0;background:#fff;font-size:14px;color:#222f3e;box-sizing:border-box}
.tox .lai *{box-sizing:border-box}
.tox .lai-head{display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid #e3e3e3;min-height:42px}
.tox .lai-head__title{flex:1;display:flex;align-items:center;gap:6px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tox .lai-head__title svg{flex:none}
.tox .lai-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border:0;border-radius:4px;background:none;cursor:pointer;padding:0;color:inherit}
.tox .lai-icon-btn:hover{background:#f0f0f0}
.tox .lai-icon-btn svg{width:24px;height:24px}
.tox .lai-model{max-width:150px;height:28px;border:1px solid #ddd;border-radius:4px;font-size:12px;background:#fff;color:inherit}
.tox .lai-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:12px;min-height:0}
.tox .lai-intro{color:#555;line-height:1.5}
.tox .lai-intro p{margin:0 0 10px}
.tox .lai-chips{display:flex;flex-wrap:wrap;gap:6px}
.tox .lai-chip{border:1px solid #d6d6d6;background:#fff;border-radius:16px;padding:4px 10px;font-size:12px;cursor:pointer;color:inherit}
.tox .lai-chip:hover{background:#f3f6ff;border-color:#207ab7;color:#207ab7}
.tox .lai-msg{max-width:100%;line-height:1.5;word-wrap:break-word}
.tox .lai-msg--user{align-self:flex-end;background:#207ab7;color:#fff;padding:8px 12px;border-radius:12px 12px 2px 12px;max-width:88%;white-space:pre-wrap}
.tox .lai-msg__tag{display:block;font-size:11px;opacity:.8;margin-bottom:2px}
.tox .lai-msg--assistant{align-self:stretch}
.tox .lai-answer{border:1px solid #e3e3e3;border-radius:8px;padding:8px 12px;background:#fafafa;overflow-x:auto}
.tox .lai-answer>:first-child{margin-top:0}.lai-answer>:last-child{margin-bottom:0}
.tox .lai-answer table{border-collapse:collapse}.lai-answer td,.lai-answer th{border:1px solid #ccc;padding:2px 6px}
.tox .lai-answer pre{white-space:pre-wrap;background:#f0f0f0;padding:6px;border-radius:4px;font-size:12px}
.tox .lai-answer--error{border-color:#e0a1a1;background:#fff5f5;color:#a52a2a}
.tox .lai-status{display:flex;align-items:center;gap:8px;color:#666;font-size:12px;padding:4px 0}
.tox .lai-dots{display:inline-flex;gap:3px}
.tox .lai-dots i{width:6px;height:6px;border-radius:50%;background:#207ab7;animation:lai-blink 1.2s infinite ease-in-out}
.tox .lai-dots i:nth-child(2){animation-delay:.2s}.lai-dots i:nth-child(3){animation-delay:.4s}
@keyframes lai-blink{0%,80%,100%{opacity:.25}40%{opacity:1}}
.tox .lai-tool{font-size:12px;color:#555;padding:2px 0 2px 8px;border-left:2px solid #ccc;margin-bottom:4px}
.tox .lai-think{font-size:12px;color:#666;margin-bottom:6px}
.tox .lai-think summary{cursor:pointer;user-select:none}
.tox .lai-think div{white-space:pre-wrap;max-height:160px;overflow:auto;padding:4px 8px;border-left:2px solid #ddd;margin-top:4px}
.tox .lai-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.tox .lai-btn{display:inline-flex;align-items:center;gap:4px;border:1px solid #c5c5c5;background:#fff;border-radius:4px;padding:3px 10px;font-size:12px;cursor:pointer;color:#222f3e;line-height:20px}
.tox .lai-btn:hover{background:#f0f0f0}
.tox .lai-btn--primary{background:#207ab7;border-color:#207ab7;color:#fff}
.tox .lai-btn--primary:hover{background:#1c6ca1}
.tox .lai-btn:disabled{opacity:.5;cursor:default}
.tox .lai-btn svg{width:24px;height:24px;margin:-4px -4px -4px -6px;fill:currentColor}
.tox .lai-ask{border:1px solid #f0d58c;background:#fffaf0;border-radius:8px;padding:8px 12px;margin-top:6px}
.tox .lai-ask p{margin:0 0 6px}
.tox .lai-foot{border-top:1px solid #e3e3e3;padding:8px}
.tox .lai-ctx{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:#666;margin-bottom:6px;gap:6px}
.tox .lai-ctx span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tox .lai-input-wrap{display:flex;align-items:flex-end;gap:6px;border:1px solid #c5c5c5;border-radius:8px;padding:4px 4px 4px 8px;background:#fff}
.tox .lai-input-wrap:focus-within{border-color:#207ab7;box-shadow:0 0 0 2px rgba(32,122,183,.15)}
.tox .lai-input{flex:1;border:0;outline:0;resize:none;font:inherit;font-size:14px;line-height:20px;max-height:160px;min-height:28px;padding:4px 0;background:transparent;color:inherit}
.tox .lai-send{flex:none;width:32px;height:32px;border-radius:6px;border:0;background:#207ab7;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}
.tox .lai-send:disabled{background:#b8cfe0;cursor:default}
.tox .lai-send svg{width:20px;height:20px;fill:#fff}
.tox .lai-send--stop{background:#c0392b}
.tox .lai-answer p,.tox .lai-answer ul,.tox .lai-answer ol,.tox .lai-answer blockquote,.tox .lai-answer pre,.tox .lai-answer table{margin:0 0 8px}
.tox .lai-answer ul,.tox .lai-answer ol{padding-left:20px}
.tox .lai-answer ul{list-style:disc}.tox .lai-answer ol{list-style:decimal}
.tox .lai-answer h1,.tox .lai-answer h2,.tox .lai-answer h3,.tox .lai-answer h4{font-weight:700;margin:4px 0 6px}.tox .lai-answer h2{font-size:17px}.tox .lai-answer h3{font-size:15px}
.tox .lai-answer strong,.tox .lai-answer b,.tox .lai-answer th{font-weight:700}.tox .lai-answer em,.tox .lai-answer i{font-style:italic}
.tox .lai-answer a{color:#207ab7;text-decoration:underline}.tox .lai-answer blockquote{border-left:3px solid #ccc;padding-left:8px;color:#555}
.tox .lai-answer code{font-family:monospace;background:#eee;padding:0 3px;border-radius:3px}
.tox .lai-think summary{display:list-item}
`

const ensureStyles = () => {
    if (!document.getElementById(STYLE_ID)) {
        document.head.appendChild(h('style', {id: STYLE_ID}, STYLES))
    }
}

const storage = {
    get(key) {
        try {
            return window.localStorage.getItem(key)
        } catch (e) {
            return null
        }
    },
    set(key, value) {
        try {
            if (value) window.localStorage.setItem(key, value)
            else window.localStorage.removeItem(key)
        } catch (e) {
            // storage not available (private mode, blocked) - ignore
        }
    }
}

const countWords = (text) => (text.match(/\S+/g) || []).length

const truncate = (text, max) => text.length > max
    ? text.substring(0, max) + '\n[… truncated, document is longer …]'
    : text


export const addAiAssistantPlugin = () => {
    tinymce.PluginManager.add('lunucai', function (editor) {

        editor.options.register('lunucai_instructions', {processor: 'string', default: ''})
        editor.options.register('lunucai_model', {processor: 'string', default: ''})

        const icons = () => editor.ui.registry.getAll().icons
        const icon = (name) => h('span', {html: icons()[name] || '', style: {display: 'inline-flex'}})

        const state = {
            contextKey: createContextKey(),
            messages: [],
            running: null, // {controller, message}
            model: storage.get(MODEL_STORAGE_KEY) || editor.options.get('lunucai_model') || '',
            ui: null
        }

        // ─── sanitizing ─────────────────────────────────────────────────────
        // Answers are model output: everything that ends up in the DOM goes
        // through the editor's own parser/serializer (schema + DOMPurify).
        const sanitize = (html) => {
            try {
                const fragment = editor.parser.parse(html || '', {forced_root_block: 'p'})
                return tinymce.html.Serializer({}, editor.schema).serialize(fragment)
            } catch (e) {
                return h('div', null, html || '').innerHTML
            }
        }

        // ─── selection & context ────────────────────────────────────────────
        const captureTarget = () => {
            const hasSelection = !editor.selection.isCollapsed() && htmlToText(editor.selection.getContent()).length > 0
            let bookmark = null
            try {
                bookmark = editor.selection.getBookmark(2, true)
            } catch (e) {
                bookmark = null
            }
            return {
                hasSelection,
                selectionHtml: hasSelection ? editor.selection.getContent() : '',
                bookmark
            }
        }

        const getTextBeforeCursor = () => {
            try {
                const rng = editor.selection.getRng().cloneRange()
                rng.collapse(false)
                const before = editor.getDoc().createRange()
                before.setStart(editor.getBody(), 0)
                before.setEnd(rng.endContainer, rng.endOffset)
                return before.toString()
            } catch (e) {
                return htmlToText(editor.getContent())
            }
        }

        const buildContextInstructions = (target, base) => {
            const parts = [base]
            const custom = editor.options.get('lunucai_instructions')
            if (custom) parts.push(custom)
            const doc = editor.getContent()
            if (doc) {
                parts.push(`CURRENT DOCUMENT (HTML):\n<document>\n${truncate(doc, MAX_DOCUMENT_CHARS)}\n</document>`)
            } else {
                parts.push('The document is currently empty.')
            }
            if (target && target.hasSelection) {
                parts.push(`The user has SELECTED this part of the document:\n<selection>\n${target.selectionHtml}\n</selection>\nIf the request refers to "this", "the text" or similar, it means the selection.`)
            }
            return parts.join('\n\n')
        }

        // ─── applying results ───────────────────────────────────────────────
        const restoreSelection = (message) => {
            editor.focus()
            if (message.target && message.target.bookmark) {
                try {
                    editor.selection.moveToBookmark(message.target.bookmark)
                } catch (e) {
                    // document changed in between - fall back to the current selection
                }
            }
        }

        const notifyApplied = () => {
            editor.setDirty(true)
            editor.nodeChanged()
            editor.dispatch('LunucAiApply')
        }

        const applyResult = (message, mode) => {
            const html = sanitize(answerToHtml(message.state.answer))
            if (!html) return

            if (mode === 'replace-document') {
                editor.undoManager.transact(() => editor.setContent(html))
            } else {
                if (mode === 'replace' || message.action) {
                    // replace / action results go back to where they came from
                    restoreSelection(message)
                } else {
                    // chat answers go to the current cursor, so the user can
                    // pick the position after reading the answer
                    editor.focus()
                }
                if (mode === 'insert' && !editor.selection.isCollapsed()) {
                    editor.selection.collapse(false)
                }
                editor.undoManager.transact(() => editor.insertContent(html))
            }
            message.applied = true
            notifyApplied()
            renderMessage(message)
        }

        const copyResult = async (message, button) => {
            const html = sanitize(answerToHtml(message.state.answer))
            const text = htmlToText(html)
            try {
                if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
                    await navigator.clipboard.write([new window.ClipboardItem({
                        'text/html': new Blob([html], {type: 'text/html'}),
                        'text/plain': new Blob([text], {type: 'text/plain'})
                    })])
                } else {
                    await navigator.clipboard.writeText(text)
                }
                button.lastChild.textContent = _t('TinyAi.copied')
                setTimeout(() => {
                    button.lastChild.textContent = _t('TinyAi.copy')
                }, 1500)
            } catch (e) {
                console.warn('copy failed', e)
            }
        }

        // ─── rendering ──────────────────────────────────────────────────────
        const isNearBottom = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 60

        const scrollToBottom = (force) => {
            const ui = state.ui
            if (ui && (force || ui.stickToBottom)) {
                ui.msgs.scrollTop = ui.msgs.scrollHeight
            }
        }

        const button = (label, iconName, onClick, primary) => h('button', {
            type: 'button',
            className: 'lai-btn' + (primary ? ' lai-btn--primary' : ''),
            onClick
        }, iconName ? icon(iconName) : null, h('span', null, label))

        const renderAssistantBody = (message) => {
            const s = message.state || {}
            const isRunning = state.running && state.running.message === message
            const nodes = []

            s.tools && s.tools.forEach(tool => {
                nodes.push(h('div', {className: 'lai-tool'}, (tool.running ? '⏳ ' : '✓ ') + tool.label))
            })

            if (s.thinking) {
                const details = h('details', {className: 'lai-think', open: s.isThinking && !s.answer},
                    h('summary', null, _t('TinyAi.thinking') + (s.isThinking ? '…' : '')),
                    h('div', null, s.thinking))
                nodes.push(details)
            }

            if (message.error) {
                nodes.push(h('div', {className: 'lai-answer lai-answer--error'},
                    `${_t('TinyAi.error')}: ${message.error}`))
            } else if (s.answer) {
                nodes.push(h('div', {className: 'lai-answer', html: sanitize(answerToHtml(s.answer))}))
            }

            if (isRunning && (!s.answer || s.isThinking)) {
                nodes.push(h('div', {className: 'lai-status'},
                    h('span', {className: 'lai-dots'}, h('i'), h('i'), h('i')),
                    s.status || (s.isThinking ? _t('TinyAi.thinking') + '…' : _t('TinyAi.working'))))
            }

            if (s.aborted || message.aborted) {
                nodes.push(h('div', {className: 'lai-status'}, _t('TinyAi.aborted')))
            }

            if (s.askUser && !isRunning) {
                const options = Array.isArray(s.askUser.options) ? s.askUser.options : []
                nodes.push(h('div', {className: 'lai-ask'},
                    h('p', null, s.askUser.question),
                    options.length ? h('div', {className: 'lai-actions'}, options.map(opt => {
                        const label = typeof opt === 'string' ? opt : (opt.label || opt.value || JSON.stringify(opt))
                        return button(label, null, () => sendChat(label))
                    })) : null))
            }

            if (!isRunning) {
                const actions = []
                if (s.answer && !message.error) {
                    const target = message.target || {}
                    const primaryMode = message.apply === 'insert'
                        ? 'insert'
                        : (target.hasSelection ? 'replace' : (message.action ? 'replace-document' : 'insert'))

                    if (message.applied) {
                        actions.push(h('span', {className: 'lai-status'}, '✓ ' + _t('TinyAi.applied')))
                    }
                    if (primaryMode === 'replace' || primaryMode === 'replace-document') {
                        actions.push(button(
                            primaryMode === 'replace' ? _t('TinyAi.replace') : _t('TinyAi.replaceDocument'),
                            'checkmark', () => applyResult(message, primaryMode), !message.applied))
                    }
                    actions.push(button(_t('TinyAi.insert'), 'paste',
                        () => applyResult(message, 'insert'), primaryMode === 'insert' && !message.applied))
                    const copyBtn = button(_t('TinyAi.copy'), 'copy', () => copyResult(message, copyBtn))
                    actions.push(copyBtn)
                }
                if (message.request && (message.error || s.answer || message.aborted)) {
                    actions.push(button(_t('TinyAi.retry'), 'reload', () => retry(message)))
                }
                if (actions.length) nodes.push(h('div', {className: 'lai-actions'}, actions))
            }
            return nodes
        }

        const renderMessage = (message) => {
            const ui = state.ui
            if (!ui) return
            let el = message.el
            if (!el) {
                el = message.el = h('div', {className: 'lai-msg lai-msg--' + message.role})
                ui.msgs.appendChild(el)
            }
            el.innerHTML = ''
            if (message.role === 'user') {
                if (message.tag) el.appendChild(h('span', {className: 'lai-msg__tag'}, message.tag))
                el.appendChild(document.createTextNode(message.text))
            } else {
                renderAssistantBody(message).forEach(n => el.appendChild(n))
            }
        }

        const renderIntro = () => {
            const ui = state.ui
            const chips = ['improve', 'summarize', 'continue', 'headings', 'translate_en'].map(id =>
                h('button', {
                    type: 'button',
                    className: 'lai-chip',
                    onClick: () => runAction(id)
                }, actionLabel(id) + (id === 'translate_en' ? ` (${_t('TinyAi.translate')})` : '')))
            ui.intro = h('div', {className: 'lai-intro'},
                h('p', null, _t('TinyAi.intro')),
                h('div', {className: 'lai-chips'}, chips))
            ui.msgs.appendChild(ui.intro)
        }

        const renderAll = () => {
            const ui = state.ui
            if (!ui) return
            ui.msgs.innerHTML = ''
            if (state.messages.length === 0) {
                renderIntro()
            }
            state.messages.forEach(m => {
                m.el = null
                renderMessage(m)
            })
            updateComposer()
            scrollToBottom(true)
        }

        const updateContextInfo = () => {
            const ui = state.ui
            if (!ui || !ui.visible) return
            let info
            if (!editor.selection.isCollapsed()) {
                const words = countWords(htmlToText(editor.selection.getContent()))
                info = words > 0 ? _t('TinyAi.contextSelection', {words}) : null
            }
            if (!info) {
                info = editor.getContent() ? _t('TinyAi.contextDocument') : _t('TinyAi.contextEmpty')
            }
            ui.ctxText.textContent = info
        }

        const updateComposer = () => {
            const ui = state.ui
            if (!ui) return
            const running = !!state.running
            ui.send.className = 'lai-send' + (running ? ' lai-send--stop' : '')
            ui.send.title = running ? _t('TinyAi.stop') : _t('TinyAi.send')
            ui.send.innerHTML = icons()[running ? 'stop' : 'send'] || (running ? '■' : '➤')
            ui.send.disabled = !running && !ui.input.value.trim()
        }

        const autoGrow = () => {
            const input = state.ui.input
            input.style.height = 'auto'
            input.style.height = Math.min(input.scrollHeight, 160) + 'px'
        }

        // ─── model picker ───────────────────────────────────────────────────
        const fillModels = (select) => {
            fetchLlmModels().then(models => {
                if (!models.length) {
                    select.style.display = 'none'
                    return
                }
                select.innerHTML = ''
                select.appendChild(h('option', {value: ''}, _t('TinyAi.modelDefault')))
                let found = !state.model
                models.forEach(m => {
                    if (m.value === state.model) found = true
                    select.appendChild(h('option', {value: m.value, title: m.value}, m.label))
                })
                if (!found) {
                    select.appendChild(h('option', {value: state.model}, state.model))
                }
                select.value = state.model
                select.style.display = ''
            })
        }

        // ─── panel ──────────────────────────────────────────────────────────
        const buildPanel = (container) => {
            ensureStyles()
            const ui = state.ui = {stickToBottom: true, visible: false}

            ui.model = h('select', {
                className: 'lai-model',
                title: 'Model',
                style: {display: 'none'},
                onChange: (e) => {
                    state.model = e.target.value
                    storage.set(MODEL_STORAGE_KEY, state.model)
                }
            })

            ui.msgs = h('div', {
                className: 'lai-msgs',
                onScroll: () => {
                    ui.stickToBottom = isNearBottom(ui.msgs)
                }
            })

            ui.input = h('textarea', {
                className: 'lai-input',
                rows: 1,
                placeholder: _t('TinyAi.placeholder'),
                onInput: () => {
                    autoGrow()
                    updateComposer()
                },
                onKeydown: (e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                        e.preventDefault()
                        submitInput()
                    } else if (e.key === 'Escape') {
                        if (state.running) stop()
                        else editor.focus()
                    }
                }
            })

            ui.send = h('button', {
                type: 'button',
                className: 'lai-send',
                onClick: () => state.running ? stop() : submitInput()
            })

            ui.ctxText = h('span')

            const head = h('div', {className: 'lai-head'},
                h('div', {className: 'lai-head__title'}, icon('ai'), _t('TinyAi.title')),
                ui.model,
                h('button', {
                    type: 'button', className: 'lai-icon-btn', title: _t('TinyAi.newChat'),
                    onClick: newChat
                }, icon('new-document')),
                h('button', {
                    type: 'button', className: 'lai-icon-btn', title: _t('TinyAi.close'),
                    onClick: () => toggleSidebar(false)
                }, icon('close')))

            const foot = h('div', {className: 'lai-foot'},
                h('div', {className: 'lai-ctx'}, ui.ctxText),
                h('div', {className: 'lai-input-wrap'}, ui.input, ui.send))

            container.appendChild(h('div', {className: 'lai'}, head, ui.msgs, foot))
            fillModels(ui.model)
            renderAll()
        }

        const isSidebarOpen = () => editor.queryCommandValue('ToggleSidebar') === SIDEBAR_NAME

        const toggleSidebar = (show) => {
            const open = isSidebarOpen()
            const wanted = show === undefined ? !open : show
            if (wanted !== open) {
                editor.execCommand('ToggleSidebar', false, SIDEBAR_NAME, {skip_focus: true})
            }
        }

        // ─── requests ───────────────────────────────────────────────────────
        const run = async (message) => {
            const controller = new AbortController()
            state.running = {controller, message}
            message.error = null
            message.aborted = false
            message.applied = false
            message.state = {answer: '', tools: []}
            renderMessage(message)
            updateComposer()
            scrollToBottom(true)

            let frame = null
            try {
                await streamLlm({
                    body: message.request,
                    signal: controller.signal,
                    onUpdate: (parsed) => {
                        message.state = parsed
                        if (!frame) {
                            frame = requestAnimationFrame(() => {
                                frame = null
                                renderMessage(message)
                                scrollToBottom()
                            })
                        }
                    }
                })
            } catch (e) {
                if (e.name === 'AbortError') {
                    message.aborted = true
                } else {
                    message.error = e.message || String(e)
                }
            } finally {
                if (frame) cancelAnimationFrame(frame)
                if (state.running && state.running.message === message) {
                    state.running = null
                }
                renderMessage(message)
                updateComposer()
                scrollToBottom()
            }
        }

        const stop = () => {
            if (state.running) {
                state.running.controller.abort()
            }
        }

        const retry = (message) => {
            if (state.running) return
            // refresh the document snapshot, the user may have edited meanwhile
            if (message.action) {
                message.request = buildActionRequest(message.action, message.target, message.sourceHtml)
            }
            run(message)
        }

        const pushMessages = (userMessage, assistantMessage) => {
            const ui = state.ui
            if (ui && ui.intro) {
                ui.intro.remove()
                ui.intro = null
            }
            state.messages.push(userMessage, assistantMessage)
            renderMessage(userMessage)
            run(assistantMessage)
        }

        const modelParams = () => state.model ? {model: state.model} : {}

        const sendChat = (text) => {
            text = (text || '').trim()
            if (!text || state.running) return
            const target = captureTarget()
            const request = {
                ...modelParams(),
                content: text,
                contextKey: state.contextKey,
                contextInstructions: buildContextInstructions(target, BASE_INSTRUCTIONS)
            }
            pushMessages(
                {role: 'user', text, tag: target.hasSelection ? _t('TinyAi.onSelection') : null},
                {role: 'assistant', request, target}
            )
        }

        const submitInput = () => {
            const ui = state.ui
            const text = ui.input.value
            if (!text.trim() || state.running) return
            ui.input.value = ''
            autoGrow()
            sendChat(text)
        }

        const buildActionRequest = (actionId, target, sourceHtml) => {
            const action = ACTIONS[actionId]
            const content = `${action.prompt}\n\nTEXT:\n${sourceHtml}`
            return {
                ...modelParams(),
                content,
                noContext: true,
                thinking: false,
                contextInstructions: [ACTION_INSTRUCTIONS, editor.options.get('lunucai_instructions')]
                    .filter(Boolean).join('\n\n')
            }
        }

        const runAction = (actionId) => {
            const action = ACTIONS[actionId]
            if (!action || state.running) return

            // the selection has to be captured BEFORE the sidebar takes the focus
            const target = captureTarget()
            let sourceHtml
            if (action.useTextBefore) {
                sourceHtml = truncate(getTextBeforeCursor(), MAX_DOCUMENT_CHARS)
                // a continuation is always inserted at the cursor
                target.hasSelection = false
            } else {
                sourceHtml = target.hasSelection ? target.selectionHtml : editor.getContent()
            }
            if (!htmlToText(sourceHtml)) {
                editor.notificationManager.open({text: _t('TinyAi.contextEmpty'), type: 'info', timeout: 2500})
                return
            }

            toggleSidebar(true)
            const tag = action.useTextBefore
                ? _t('TinyAi.atCursor')
                : (target.hasSelection ? _t('TinyAi.onSelection') : _t('TinyAi.onDocument'))

            const doPush = () => pushMessages(
                {role: 'user', text: actionLabel(actionId), tag},
                {
                    role: 'assistant',
                    action: actionId,
                    apply: action.apply,
                    target,
                    sourceHtml,
                    request: buildActionRequest(actionId, target, sourceHtml)
                }
            )
            // the panel is built lazily when the sidebar is shown the first time
            if (state.ui) doPush()
            else setTimeout(doPush, 0)
        }

        const newChat = () => {
            stop()
            state.contextKey = createContextKey()
            state.messages = []
            renderAll()
            if (state.ui) state.ui.input.focus()
        }

        const openChatWithFocus = () => {
            toggleSidebar(true)
            setTimeout(() => {
                if (state.ui) {
                    updateContextInfo()
                    state.ui.input.focus()
                }
            }, 0)
        }

        // ─── registration ───────────────────────────────────────────────────
        editor.ui.registry.addSidebar(SIDEBAR_NAME, {
            tooltip: _t('TinyAi.title') + ' (Ctrl+Alt+A)',
            icon: 'ai',
            resizable: true,
            onSetup: (api) => {
                buildPanel(api.element())
                return () => {
                    stop()
                    state.ui = null
                }
            },
            onShow: () => {
                if (state.ui) {
                    state.ui.visible = true
                    updateContextInfo()
                    scrollToBottom(true)
                }
            },
            onHide: () => {
                if (state.ui) state.ui.visible = false
            }
        })

        Object.keys(ACTIONS).forEach(id => {
            editor.ui.registry.addMenuItem('lunucai_' + id, {
                text: actionLabel(id),
                icon: ACTIONS[id].icon,
                onAction: () => runAction(id)
            })
        })

        editor.ui.registry.addNestedMenuItem('lunucai_tone', {
            text: _t('TinyAi.tone'),
            icon: 'ai',
            getSubmenuItems: () => TONES.map(t => 'lunucai_tone_' + t).join(' ')
        })

        editor.ui.registry.addNestedMenuItem('lunucai_translate', {
            text: _t('TinyAi.translate'),
            icon: 'translate',
            getSubmenuItems: () => Object.keys(LANGUAGES).map(l => 'lunucai_translate_' + l).join(' ')
        })

        editor.ui.registry.addMenuItem('lunucai_chat', {
            text: _t('TinyAi.openChat'),
            icon: 'ai-assistant',
            shortcut: 'Meta+Alt+A',
            onAction: openChatWithFocus
        })

        editor.ui.registry.addMenuItem('lunucai_custom', {
            text: _t('TinyAi.action.custom'),
            icon: 'ai-prompt',
            onAction: openChatWithFocus
        })

        const MENU_ITEMS = 'lunucai_improve lunucai_rewrite lunucai_shorten lunucai_expand lunucai_simplify | ' +
            'lunucai_tone lunucai_translate | lunucai_summarize lunucai_continue lunucai_headings | ' +
            'lunucai_custom lunucai_chat'

        editor.ui.registry.addMenuButton('aiactions', {
            icon: 'ai',
            text: _t('TinyAi.menu'),
            tooltip: _t('TinyAi.title'),
            search: true,
            fetch: (callback) => callback(MENU_ITEMS)
        })

        editor.ui.registry.addNestedMenuItem('lunucai_menu', {
            text: _t('TinyAi.title'),
            icon: 'ai',
            getSubmenuItems: () => MENU_ITEMS
        })

        editor.ui.registry.addContextMenu('lunucai', {
            update: () => 'lunucai_menu'
        })

        editor.addCommand('LunucAiAction', (ui, value) => runAction(value))
        editor.addCommand('LunucAiChat', (ui, value) => {
            openChatWithFocus()
            if (value) setTimeout(() => sendChat(value), 0)
        })

        editor.addShortcut('meta+alt+a', _t('TinyAi.openChat'), () => {
            if (isSidebarOpen()) toggleSidebar(false)
            else openChatWithFocus()
        })

        let ctxTimer = null
        editor.on('SelectionChange NodeChange', () => {
            if (!state.ui || !state.ui.visible) return
            clearTimeout(ctxTimer)
            ctxTimer = setTimeout(updateContextInfo, 150)
        })

        editor.on('remove', () => {
            stop()
            clearTimeout(ctxTimer)
        })

        return {
            getMetadata: () => ({
                name: 'lunuc AI assistant'
            })
        }
    })
}
