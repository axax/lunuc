import React from 'react'
import DomUtil from 'client/util/dom.mjs'
import Util from '../util/index.mjs'
import config from 'gen/config-client'
import {addLoremipsumPlugin} from './tinymce/loremipsum'
import {addCleanHtmlPlugin} from './tinymce/cleanHtml'
import {openWindow} from '../util/window'

const {DEFAULT_LANGUAGE} = config

const TINYMCE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.2/tinymce.min.js'

// Single shared promise for loading the TinyMCE script. Prevents duplicate
// <script> tags and lets every instance know exactly when tinymce is ready,
// without the artificial setTimeout stagger that was previously derived from
// an ever-growing static instance counter.
let tinymceLoadPromise = null
let pluginsRegistered = false

function loadTinyMCE() {
    if (!tinymceLoadPromise) {
        tinymceLoadPromise = new Promise((resolve) => {
            if (window.tinymce) {
                resolve()
                return
            }
            DomUtil.addScript(TINYMCE_URL, {onload: resolve}, {ignoreIfExist: true})
        }).then(() => {
            // register custom plugins exactly once, not per instance
            if (!pluginsRegistered && window.tinymce) {
                pluginsRegistered = true
                addLoremipsumPlugin()
                addCleanHtmlPlugin()
            }
        })
    }
    return tinymceLoadPromise
}

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
    // init_instance_callback instead of being silently dropped - that was the
    // reason content sometimes never showed up.
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

    async initEditor() {
        if (this.isReadOnly() || this.isInitStarted) {
            return
        }
        this.isInitStarted = true

        await loadTinyMCE()

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

        tinymce.init({
            selector: this.getEditorSelector(),
            height: 450,
            language: 'de',
            language_url: '/lang/tinymce/de.js',
            relative_urls: false,
            remove_script_host: false,
            convert_urls: false,
            link_class_list: [
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
            ],
            formats: {
                // Changes the alignment buttons to add a class to each of the matching selector elements
                alignleft: {selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'left'},
                aligncenter: {selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'center'},
                alignright: {selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'right'},
                alignjustify: {selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'full'}
            },
            plugins: [
                'advlist autolink link image lists charmap print preview hr anchor pagebreak',
                'searchreplace wordcount visualblocks visualchars code fullscreen insertdatetime media nonbreaking',
                'table emoticons template paste help loremipsum cleanhtml'
                /*'quickbars'*/
            ],
            quickbars_selection_toolbar: 'bold italic | formatselect | quicklink blockquote',
            quickbars_insert_toolbar: false,
            quickbars_image_toolbar: 'alignleft aligncenter alignright | rotateleft rotateright | imageoptions',
            toolbar: this.props.toolbar || 'undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | ' +
                'bullist numlist outdent indent | link image | print preview media fullpage | ' +
                'forecolor backcolor emoticons | help',
            menu: {
                favs: {title: 'Extras', items: 'code visualaid | searchreplace | emoticons | loremipsum | cleanhtml'}
            },
            menubar: 'favs file edit view insert format tools table help',
            file_picker_callback: (callback, value, meta) => {

                let baseFilter
                // Provide file and text for the link dialog
                if (meta.filetype == 'file') {
                    //callback('mypage.html', {text: 'My text'});
                }

                // Provide image and alt text for the image dialog
                if (meta.filetype == 'image') {
                    baseFilter = 'mimeType=image'
                }

                // Provide alternative source and posted for the media dialog
                if (meta.filetype == 'media') {
                    baseFilter = 'mimeType=video'
                    //callback('movie.mp4', {source2: 'alt.ogg', poster: 'image.jpg'});
                }

                const newwindow = openWindow({url: `${_app_.lang !== DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/typesblank/?opener=true&fixType=Media&baseFilter=${encodeURIComponent(baseFilter || '')}`})

                setTimeout(() => {
                    newwindow.addEventListener('beforeunload', (e) => {
                        if (newwindow.resultValue) {

                            const mediaObj = Util.getImageObject(newwindow.resultValue)

                            // Provide image and alt text for the image dialog
                            if (meta.filetype == 'image') {
                                callback(mediaObj.src, {alt: mediaObj.alt})
                            } else if (meta.filetype == 'media') {
                                callback(mediaObj.src, {source2: '', poster: ''})
                            } else {
                                callback(mediaObj.src, {text: mediaObj.alt})
                            }
                        }
                    })
                }, 0)
            },
            init_instance_callback: (editor) => {

                if (this.isUnmounted) {
                    tinymce.remove(this.getEditorSelector())
                    return
                }

                this.isEditorReady = true

                // Apply whatever arrived while the script was loading or while
                // we were waiting for the DOM element. Without this the update
                // was lost and the editor stayed empty.
                const initialContent = this.pendingValue !== undefined
                    ? this.pendingValue
                    : this.props.children

                if (initialContent != null && editor.getContent() !== initialContent) {
                    editor.setContent(initialContent)
                }
                this.pendingValue = undefined

                editor.on('Change', () => {
                    const {onChange, name} = this.props
                    if (onChange) {
                        const html = editor.getContent()
                        if (name) {
                            onChange({target: {name, value: html}})
                        } else {
                            onChange(html)
                        }
                    }
                })

                editor.on('focus', () => {
                    this.isEditorFocused = true
                })

                editor.on('blur', () => {
                    this.isEditorFocused = false
                    // deliberately no flush of pendingValue here: the editor
                    // content is newer than any value that arrived while the
                    // user was typing
                    this.pendingValue = undefined
                })
            },
            content_css: '/css/tinymce.css'
        })
    }

    render() {
        const {children, readOnly, toolbar, required, theme, name, placeholder, value, error, ...rest} = this.props

        if (this.isReadOnly()) {
            // render from props instead of state so late-arriving content
            // is not shown stale
            return <div className="richtext-content"
                        dangerouslySetInnerHTML={{__html: children || ''}} {...rest}></div>
        }

        if (error) {
            if (!rest.style) {
                rest.style = {}
            }
            rest.style.border = 'solid 1px red'
        }

        return <div {...rest}>
            <textarea id={this.getEditorId()}
                      style={{visibility: 'hidden', height: '446px'}}
                      defaultValue={children || ''}/>
        </div>
    }

}

export default TinyEditor