import React from 'react'
import PropTypes from 'prop-types'
import DomUtil from 'client/util/dom'

//https://github.com/benwinding/quill-html-edit-button
class QuillEditor extends React.Component {

    static instanceCounter = 0

    isInit = false

    constructor(props) {
        super(props)
        QuillEditor.instanceCounter++
        this.instanceId = QuillEditor.instanceCounter
        this.state = QuillEditor.propsToState(props)
    }

    static getDerivedStateFromProps(nextProps, prevState) {
        if (prevState.value !== nextProps.children) {
            return QuillEditor.propsToState(nextProps)
        }
        return null
    }

    static propsToState(props) {
        return {value:props.children}
    }

    shouldComponentUpdate(props, state) {
        const readOnlyChanged = props.readOnly !== this.props.readOnly
        if (readOnlyChanged) {
            this.isInit = false
        }else if(this.state.value !== state.value){
            setTimeout(()=>{
                this.quill.setContents([])
                this.quill.clipboard.dangerouslyPasteHTML(0,state.value)
            },0)
        }

        return readOnlyChanged
    }

    isReadOnly(props) {
        return props.readOnly !== undefined && (props.readOnly === true || props.readOnly === 'true')
    }

    initEditor() {
        if (!this.isReadOnly(this.props) && !this.isInit) {

            const quillIsReady = () => {

                this.isInit = true
                const toolbar = this.props.toolbar || [
                    [{header: [1, 2, false]}],
                    ['bold', 'italic', 'underline'],
                    ['image', 'code-block']
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
                    theme: 'snow'
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
                DomUtil.addStyle('https://cdn.quilljs.com/1.3.6/quill.snow.css')

                DomUtil.addScript('https://cdn.quilljs.com/1.3.6/quill.min.js', {
                    onload: quillIsReady
                })
            } else {
                quillIsReady()
            }


        }
    }

    componentDidMount() {
        this.initEditor()
    }

    componentDidUpdate() {
        this.initEditor()
    }

    render() {
        const {children, readOnly, toolbar, required, name, placeholder, value, ...rest} = this.props
        console.log('render QuillEditor')
        if (this.isReadOnly(this.props)) {
            return <div dangerouslySetInnerHTML={{__html: this.state.value}} {...rest}></div>
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
