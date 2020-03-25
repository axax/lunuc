import React from 'react'
import PropTypes from 'prop-types'
import DomUtil from 'client/util/dom'

//https://github.com/benwinding/quill-html-edit-button
class QuillEditor extends React.Component {

    static instanceCounter = 0
    static loadedStyles = []

    isInit = false

    constructor(props) {
        super(props)
        QuillEditor.instanceCounter++
        this.instanceId = QuillEditor.instanceCounter
        this.state = QuillEditor.propsToState(props)
    }

    /* static getDerivedStateFromProps(nextProps, prevState) {
         if (prevState.value !== nextProps.children) {
             console.log(nextProps.children, prevState.value)
             return QuillEditor.propsToState(nextProps)
         }
         return null
     }*/

    static propsToState(props) {
        return {value: props.children}
    }

    shouldComponentUpdate(props, state) {
        const readOnlyChanged = props.readOnly !== this.props.readOnly
        if (readOnlyChanged) {
            this.isInit = false
        } else if (this.state.value !== state.value) {
            setTimeout(() => {
                this.quill.setContents([])
                this.quill.clipboard.dangerouslyPasteHTML(0, state.value)
            }, 0)
        }

        return readOnlyChanged
    }

    isReadOnly(props) {
        return props.readOnly !== undefined && (props.readOnly === true || props.readOnly === 'true')
    }

    initEditor() {
        const theme = this.props.theme || 'snow'

        if (!this.isReadOnly(this.props) && !this.isInit) {

            const quillIsReady = () => {

                if (!window.Quill || !window.quillTableUI) return

                this.isInit = true

                Quill.register({
                    'modules/tableUI': quillTableUI.default
                }, true)


                const toolbar = this.props.toolbar || [
                    ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
                    /* ['blockquote', 'code-block'],*/
                    ['link', 'image', 'blockquote'],

                    /*[{ 'header': 1 }, { 'header': 2 }],   */            // custom button values
                    [{'list': 'ordered'}, {'list': 'bullet'}],
                    /*[{ 'script': 'sub'}, { 'script': 'super' }],  */    // superscript/subscript
                    /*[{ 'indent': '-1'}, { 'indent': '+1' }],  */        // outdent/indent
                    /*[{ 'direction': 'rtl' }],      */                   // text direction

                    /*[{ 'size': ['small', false, 'large', 'huge'] }], */ // custom dropdown
                    [{'header': [1, 2, 3, 4, 5, 6, false]}],

                    [{'color': []}, {'background': []}],          // dropdown with defaults from theme
                    /*[{ 'font': [] }],*/
                    [{'align': []}],
                    ['clean'],
                    ['bettertable'],
                    ['showhtml']

                    /*['clean']  */                                       // remove formatting button
                ]
                this.quill = new Quill('#quilleditor' + this.instanceId, {
                    modules: {
                        table: true,
                        tableUI: true,
                        toolbar: {
                            container: toolbar,
                            handlers: {
                                bettertable: () => {
                                    let tableModule = this.quill.getModule('table')
                                    tableModule.insertTable(3, 3)
                                },
                                showhtml: () => {
                                    if (this.txtArea.style.display === '') {
                                        const html = this.txtArea.value
                                        this.quill.root.innerHTML = html
                                    } else {
                                        this.txtArea.value = this.quill.root.innerHTML
                                    }
                                    this.txtArea.style.display =
                                        this.txtArea.style.display === "none" ? "" : "none";
                                }
                            }
                        },
                        history: {
                            delay: 2000,
                            maxStack: 500,
                            userOnly: true
                        }
                    },
                    theme
                })

                this.txtArea = document.createElement("textarea")
                this.txtArea.style.cssText =
                    "width: 100%;margin: 0px;background: rgb(29, 29, 29);box-sizing: border-box;color: rgb(204, 204, 204);font-size: 15px;outline: none;padding: 20px;line-height: 24px;font-family: Consolas, Menlo, Monaco, &quot;Courier New&quot;, monospace;position: absolute;top: 0;bottom: 0;border: noe;display:none;resize: none;"

                const htmlEditor = this.quill.addContainer("ql-custom")
                htmlEditor.appendChild(this.txtArea)

                this.quill.on('text-change', (e) => {
                    const {onChange, name} = this.props
                    if (onChange) {
                       /* this.quill.root.querySelectorAll('a').forEach(a => {
                            const href = a.getAttribute('href')
                            if (href && href.indexOf('/') === 0) {
                                a.removeAttribute('target')
                            }
                        })*/
                        let html = this.quill.root.innerHTML
                        if (html === '<p><br></p>') {
                            html = ''
                        }
                        if (name) {
                            onChange({target: {name, value: html}})
                        } else {
                            onChange(html)
                        }
                    }
                })
            }

            if (!window.Quill) {
                DomUtil.addScript('https://cdnjs.cloudflare.com/ajax/libs/quill/2.0.0-dev.3/quill.min.js', {
                    onload: () => {
                        DomUtil.addScript('https://unpkg.com/quill-table-ui@1.0.5/dist/umd/index.js', {
                            onload: quillIsReady
                        })
                    }
                })


            } else {
                quillIsReady()
            }
        }
        if (QuillEditor.loadedStyles.indexOf(theme) < 0) {
            DomUtil.addStyle(`https://cdnjs.cloudflare.com/ajax/libs/quill/2.0.0-dev.3/quill.${theme}.min.css`, {id: 'quill' + theme})
            DomUtil.addStyle('https://unpkg.com/quill-table-ui@1.0.5/dist/index.css', {id: 'quill-better-table'})
            QuillEditor.loadedStyles.push(theme)
        }

    }

    componentDidMount() {
        this.initEditor()
        this.css = document.createElement('style')
        this.css.innerHTML = `
        .ql-showhtml:before {
            display: inline-block;
            content: "html";
        }
        .ql-bettertable:before {
            display: inline-block;
            content: "table";
        }
        `
        document.body.appendChild(this.css)

    }

    componentWillUnmount() {
        document.body.removeChild(this.css)
    }

    componentDidUpdate() {
        this.initEditor()
    }

    render() {
        const {children, readOnly, toolbar, required, theme, name, placeholder, value, ...rest} = this.props
        console.log('render QuillEditor')
        if (this.isReadOnly(this.props)) {
            return <div className="richtext-content"
                        dangerouslySetInnerHTML={{__html: this.state.value}} {...rest}></div>
        }
        return <div {...rest}>
            <div id={'quilleditor' + this.instanceId} dangerouslySetInnerHTML={{__html: this.state.value}}/>
        </div>

    }

}


QuillEditor.propTypes = {
    children: PropTypes.any,
    onChange: PropTypes.func,
    className: PropTypes.string,
    name: PropTypes.string,
    style: PropTypes.object,
    toolbar: PropTypes.array,
    readOnly: PropTypes.any
}

export default QuillEditor
