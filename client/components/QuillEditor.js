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

                this.isInit = true
                const toolbar = this.props.toolbar || [
                        ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
                        /* ['blockquote', 'code-block'],*/

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

                        /*['clean']  */                                       // remove formatting button
                    ]
                this.quill = new Quill('#quilleditor' + this.instanceId, {
                    modules: {
                        toolbar,
                        history: {
                            delay: 2000,
                            maxStack: 500,
                            userOnly: true
                        }
                    },
                    theme
                })

                this.quill.on('text-change', (e) => {
                    const {onChange, name} = this.props
                    if (onChange) {
                        if (name) {
                            onChange({target: {name, value: this.quill.root.innerHTML}})
                        } else {
                            onChange(this.quill.root.innerHTML)
                        }
                    }
                })
            }

            if (!window.Quill) {
                DomUtil.addScript('https://cdnjs.cloudflare.com/ajax/libs/quill/1.3.7/quill.min.js', {
                    onload: quillIsReady
                })
            } else {
                quillIsReady()
            }
        }
        if( QuillEditor.loadedStyles.indexOf(theme)<0) {
            DomUtil.addStyle(  `https://cdnjs.cloudflare.com/ajax/libs/quill/1.3.7/quill.${theme}.min.css`, {id: 'quill' + theme})
            QuillEditor.loadedStyles.push(theme)
        }

    }

    componentDidMount() {
        this.initEditor()
    }

    componentDidUpdate() {
        this.initEditor()
    }

    render() {
        const {children, readOnly, toolbar, required, theme, name, placeholder, value, ...rest} = this.props
        console.log('render QuillEditor')
        if (this.isReadOnly(this.props)) {
            return <div className="richtext-content" dangerouslySetInnerHTML={{__html: this.state.value}} {...rest}></div>
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
