import React from 'react'
import DomUtil from 'client/util/dom.mjs'
import Util from '../util/index.mjs'
import config from 'gen/config-client'
import {addLoremipsumPlugin} from './tinymce/loremipsum'
import {addCleanHtmlPlugin} from './tinymce/cleanHtml'
import {addAiAssistantPlugin} from './tinymce/aiAssistant'
import {openWindow} from '../util/window'

const {DEFAULT_LANGUAGE} = config

// TinyMCE 7+ is licensed under GPLv2+ (the open source build needs
// license_key: 'gpl'). It is loaded from the CDN at runtime and not bundled
// into lunuc. Plugins, skin and icons are resolved relative to this URL.
const TINYMCE_VERSION = '8.9.3'
const TINYMCE_URL = `https://cdn.jsdelivr.net/npm/tinymce@${TINYMCE_VERSION}/tinymce.min.js`
const TINYMCE_I18N_URL = 'https://cdn.jsdelivr.net/npm/tinymce-i18n@26.9.28/langs/'

// lunuc language → tinymce-i18n file name (english is built in)
const TINYMCE_LANGUAGES = {
    de: 'de',
    fr: 'fr_FR',
    it: 'it'
}

const DEFAULT_HEIGHT = 500

const DEFAULT_TOOLBAR = 'undo redo | blocks | bold italic underline forecolor backcolor removeformat | ' +
    'alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | ' +
    'link image media table | charmap emoticons | searchreplace code fullscreen'

const AI_TOOLBAR = ' | aiactions aichat'

// Single shared promise for loading the TinyMCE script. Prevents duplicate
// <script> tags and lets every instance know exactly when tinymce is ready.
let tinymceLoadPromise = null
let pluginsRegistered = false

function loadTinyMCE() {
    if (!tinymceLoadPromise) {
        tinymceLoadPromise = new Promise((resolve, reject) => {
            if (window.tinymce && window.tinymce.majorVersion >= 8) {
                resolve()
                return
            }
            const script = document.createElement('script')
            script.src = TINYMCE_URL
            script.async = true
            script.crossOrigin = 'anonymous'
            script.referrerPolicy = 'origin'
            script.onload = () => resolve()
            script.onerror = () => {
                script.remove()
                reject(new Error('TinyMCE could not be loaded from ' + TINYMCE_URL))
            }
            document.head.appendChild(script)
        }).then(() => {
            // register custom plugins exactly once, not per instance
            if (!pluginsRegistered && window.tinymce) {
                pluginsRegistered = true
                addLoremipsumPlugin()
                addCleanHtmlPlugin()
                addAiAssistantPlugin()
            }
        }).catch(error => {
            // allow a later instance to try again
            tinymceLoadPromise = null
            throw error
        })
    }
    return tinymceLoadPromise
}

function getUiLanguage() {
    const lang = (_app_.user && _app_.user.language) || _app_.lang || DEFAULT_LANGUAGE
    const file = TINYMCE_LANGUAGES[lang]
    return file ? {language: file, language_url: `${TINYMCE_I18N_URL}${file}.js`} : {}
}

const LINK_CLASS_LIST = [
    {title: 'None', value: ''},
    {title: 'Schwarz', value: 'black'},
    {
        title: 'Button', menu: [
            {title: 'Button 1', value: 'button'},
            {title: 'Button 2', value: 'button1'},
            {title: 'Button 3', value: 'button2'},
            {title: 'Button 4', value: 'button3'},
            {title: 'Button 5', value: 'button5'}
        ]
    },
    {
        title: 'Icon farbig',
        menu: [
            {title: 'Telefon', value: 'icon-phone black'},
            {title: 'PDF', value: 'icon-pdf black'},
            {title: 'Fax', value: 'icon-fax black'},
            {title: 'Email', value: 'icon-email black'},
            {title: 'Maps', value: 'icon-maps black'},
            {title: 'Website', value: 'icon-website black'},
            {title: 'Pfeil nach rechts', value: 'icon-right black'},
            {title: 'Popup', value: 'icon-popup black'},
            {title: 'Telefon klein', value: 'icon-phone small-icon black'},
            {title: 'Fax klein', value: 'icon-fax small-icon black'},
            {title: 'Email klein', value: 'icon-email small-icon black'}
        ]
    },
    {
        title: 'Icon schwarz',
        menu: [
            {title: 'Telefon', value: 'icon-phone black-icon black'},
            {title: 'PDF', value: 'icon-pdf black-icon black'},
            {title: 'Fax', value: 'icon-fax black-icon black'},
            {title: 'Email', value: 'icon-email black-icon black'},
            {title: 'Maps', value: 'icon-maps black-icon black'},
            {title: 'Website', value: 'icon-website black-icon black'},
            {title: 'Pfeil nach rechts', value: 'icon-right black-icon black'},
            {title: 'Popup', value: 'icon-popup black-icon black'},
            {title: 'Popup (rechts)', value: 'icon-popup push-icon-left black-icon black'}
        ]
    }
]

const ALIGN_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img'

class TinyEditor extends React.Component {

    // only used to build a unique DOM id - no timing depends on it anymore
    static instanceCounter = 0

    // true once tinymce.init() has been called for this instance
    isInitStarted = false
    // true once init_instance_callback actually fired (editor is usable)
    isEditorReady = false
    isEditorFocused = false
    // most recent content that arrived before the editor was ready
    pendingValue = undefined
    // guards a late-resolving loadTinyMCE() promise against acting on an
    // already unmounted component
    isUnmounted = false

    constructor(props) {
        super(props)
        TinyEditor.instanceCounter++
        this.instanceId = TinyEditor.instanceCounter
    }

    getEditorId() {
        return 'TinyEditor' + this.instanceId
    }

    getEditorSelector() {
        return '#' + this.getEditorId()
    }

    isReadOnly(props = this.props) {
        return props.readOnly !== undefined && (props.readOnly === true || props.readOnly === 'true')
    }

    isAiEnabled(props = this.props) {
        return props.ai !== false && props.ai !== 'false'
    }

    getHeight() {
        const height = parseInt(this.props.height)
        return isNaN(height) ? DEFAULT_HEIGHT : height
    }

    shouldComponentUpdate(nextProps) {
        const wasReadOnly = this.isReadOnly(this.props)
        const willBeReadOnly = this.isReadOnly(nextProps)
        const readOnlyChanged = wasReadOnly !== willBeReadOnly
        const childrenChanged = this.props.children !== nextProps.children
        const errorChanged = nextProps.error !== this.props.error

        if (readOnlyChanged) {
            // a read-only switch requires a full teardown: the DOM id gets
            // reused, so a leftover instance would collide on switching back
            this.destroyEditor()
        } else if (childrenChanged && !willBeReadOnly) {
            this.applyContentUpdate(nextProps.children)
        }

        // re-render when read-only content changes, otherwise the read-only
        // markup would keep showing stale html
        return readOnlyChanged || errorChanged || (childrenChanged && willBeReadOnly)
    }

    componentDidMount() {
        this.initEditor()
    }

    componentDidUpdate() {
        // relevant when switching back from read-only to editable
        this.initEditor()
    }

    componentWillUnmount() {
        this.isUnmounted = true
        this.destroyEditor()
    }

    destroyEditor() {
        this.isInitStarted = false
        this.isEditorReady = false
        this.isEditorFocused = false
        this.pendingValue = undefined
        if (window.tinymce && tinymce.get(this.getEditorId())) {
            tinymce.remove(this.getEditorSelector())
        }
    }

    // Central place to push new content into the editor from the outside.
    // If the editor is not ready yet, the value is remembered and applied in
    // init_instance_callback instead of being silently dropped.
    applyContentUpdate(value) {
        if (!this.isEditorReady) {
            this.pendingValue = value
            return
        }

        // While the editor has focus it is the source of truth. TinyMCE only
        // fires 'Change' on undo-level boundaries, so an incoming value can
        // already be behind what the user typed - overwriting here would
        // discard those keystrokes.
        if (this.isEditorFocused) {
            return
        }

        const editor = tinymce.get(this.getEditorId())
        if (!editor) {
            this.pendingValue = value
            return
        }

        const newContent = value == null ? '' : value
        if (editor.getContent() !== newContent) {
            editor.setContent(newContent)
        }
        this.pendingValue = undefined
    }

    // The target element can be missing at init time: the field may be inside
    // an inactive tab, a collapsed Expandable, or the parent re-rendered while
    // the script was still loading.
    async resolveTargetElement() {
        const direct = document.getElementById(this.getEditorId())
        if (direct) {
            return direct
        }
        if (DomUtil.waitForElement) {
            try {
                return await DomUtil.waitForElement(this.getEditorSelector())
            } catch (e) {
                return null
            }
        }
        return null
    }

    emitChange(editor) {
        const {onChange, name} = this.props
        if (onChange) {
            const html = editor.getContent()
            if (html === this.lastEmitted) {
                return
            }
            this.lastEmitted = html
            if (name) {
                onChange({target: {name, value: html}})
            } else {
                onChange(html)
            }
        }
    }

    filePicker(callback, value, meta) {
        let baseFilter
        if (meta.filetype === 'image') {
            baseFilter = 'mimeType=image'
        } else if (meta.filetype === 'media') {
            baseFilter = 'mimeType=video'
        }

        const newwindow = openWindow({url: `${_app_.lang !== DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/typesblank/?opener=true&fixType=Media&baseFilter=${encodeURIComponent(baseFilter || '')}`})

        setTimeout(() => {
            newwindow.addEventListener('beforeunload', () => {
                if (newwindow.resultValue) {
                    const mediaObj = Util.getImageObject(newwindow.resultValue)
                    if (meta.filetype === 'image') {
                        callback(mediaObj.src, {alt: mediaObj.alt})
                    } else if (meta.filetype === 'media') {
                        callback(mediaObj.src, {source2: '', poster: ''})
                    } else {
                        callback(mediaObj.src, {text: mediaObj.alt})
                    }
                }
            })
        }, 0)
    }

    buildConfig() {
        const ai = this.isAiEnabled()
        const toolbar = this.props.toolbar || (DEFAULT_TOOLBAR + (ai ? AI_TOOLBAR : ''))

        const plugins = [
            'accordion', 'advlist', 'anchor', 'autolink', 'charmap', 'code', 'codesample', 'emoticons',
            'fullscreen', 'help', 'image', 'insertdatetime', 'link', 'lists', 'media', 'nonbreaking',
            'pagebreak', 'preview', 'quickbars', 'searchreplace', 'table', 'visualblocks', 'visualchars',
            'wordcount', 'loremipsum', 'cleanhtml'
        ]
        if (ai) {
            plugins.push('lunucai')
        }

        const menu = {
            favs: {
                title: 'Extras',
                items: 'code visualaid visualblocks visualchars | searchreplace | emoticons charmap | loremipsum | cleanhtml'
            }
        }
        if (ai) {
            menu.ai = {
                title: 'KI',
                items: 'lunucai_chat | lunucai_improve lunucai_rewrite lunucai_shorten lunucai_expand lunucai_simplify | ' +
                    'lunucai_tone lunucai_translate | lunucai_summarize lunucai_continue lunucai_headings'
            }
        }

        return {
            selector: this.getEditorSelector(),
            license_key: 'gpl',
            promotion: false,
            branding: false,
            ...getUiLanguage(),

            height: this.getHeight(),
            min_height: 300,
            resize: true,
            toolbar_mode: 'sliding',
            toolbar_sticky: !!this.props.stickyToolbar,
            menubar: 'favs file edit view insert format table' + (ai ? ' ai' : '') + ' help',
            menu,
            toolbar,
            plugins,
            contextmenu: (ai ? 'lunucai ' : '') + 'link image table',

            // inline toolbar when text is selected
            quickbars_selection_toolbar: 'bold italic underline | blocks | quicklink blockquote' + (ai ? ' | aiactions' : ''),
            quickbars_insert_toolbar: false,
            quickbars_image_toolbar: 'alignleft aligncenter alignright | imageoptions',

            sidebar_width: 380,
            sidebar_min_width: 300,
            sidebar_max_width: 700,

            lunucai_instructions: this.props.aiInstructions || '',

            browser_spellcheck: true,
            paste_data_images: false,
            relative_urls: false,
            remove_script_host: false,
            convert_urls: false,
            link_default_protocol: 'https',
            link_class_list: LINK_CLASS_LIST,
            image_advtab: true,
            image_caption: true,
            image_title: true,
            table_toolbar: 'tableprops tabledelete | tableinsertrowbefore tableinsertrowafter tabledeleterow | tableinsertcolbefore tableinsertcolafter tabledeletecol',
            formats: {
                // the alignment buttons add a class instead of an inline style
                alignleft: {selector: ALIGN_SELECTOR, classes: 'left'},
                aligncenter: {selector: ALIGN_SELECTOR, classes: 'center'},
                alignright: {selector: ALIGN_SELECTOR, classes: 'right'},
                alignjustify: {selector: ALIGN_SELECTOR, classes: 'full'}
            },
            file_picker_types: 'file image media',
            file_picker_callback: (callback, value, meta) => this.filePicker(callback, value, meta),
            content_css: '/css/tinymce.css',

            init_instance_callback: (editor) => {

                if (this.isUnmounted) {
                    tinymce.remove(this.getEditorSelector())
                    return
                }

                this.isEditorReady = true

                // Apply whatever arrived while the script was loading or while
                // we were waiting for the DOM element.
                const initialContent = this.pendingValue !== undefined
                    ? this.pendingValue
                    : this.props.children

                if (initialContent != null && editor.getContent() !== initialContent) {
                    editor.setContent(initialContent)
                }
                this.pendingValue = undefined
                this.lastEmitted = editor.getContent()

                // 'LunucAiApply' is fired by the AI plugin after it wrote into
                // the document, Undo/Redo do not always create a 'Change'
                editor.on('Change Undo Redo LunucAiApply', () => this.emitChange(editor))

                editor.on('focus', () => {
                    this.isEditorFocused = true
                })

                editor.on('blur', () => {
                    this.isEditorFocused = false
                    // the editor content is newer than any value that arrived
                    // while the user was typing
                    this.pendingValue = undefined
                    this.emitChange(editor)
                })
            }
        }
    }

    async initEditor() {
        if (this.isReadOnly() || this.isInitStarted) {
            return
        }
        this.isInitStarted = true

        try {
            await loadTinyMCE()
        } catch (e) {
            console.error(e)
            this.isInitStarted = false
            return
        }

        if (this.isUnmounted || this.isReadOnly() || !window.tinymce) {
            this.isInitStarted = false
            return
        }

        const target = await this.resolveTargetElement()

        if (this.isUnmounted || this.isReadOnly()) {
            this.isInitStarted = false
            return
        }

        if (!target) {
            // give a later mount/update another chance
            this.isInitStarted = false
            return
        }

        // defensive: drop a leftover instance bound to the same id
        if (tinymce.get(this.getEditorId())) {
            tinymce.remove(this.getEditorSelector())
        }

        tinymce.init(this.buildConfig())
    }

    render() {
        const {children, readOnly, toolbar, required, theme, name, placeholder, value, error,
            ai, aiInstructions, height, stickyToolbar, ...rest} = this.props

        if (this.isReadOnly()) {
            // render from props instead of state so late-arriving content
            // is not shown stale
            return <div className="richtext-content"
                        dangerouslySetInnerHTML={{__html: children || ''}} {...rest}></div>
        }

        if (error) {
            rest.style = {...rest.style, border: 'solid 1px red'}
        }

        return <div {...rest}>
            <textarea id={this.getEditorId()}
                      style={{visibility: 'hidden', height: (this.getHeight() - 4) + 'px'}}
                      defaultValue={children || ''}/>
        </div>
    }

}

export default TinyEditor
