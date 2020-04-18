import React from 'react'
import PropTypes from 'prop-types'
import DomUtil from 'client/util/dom'

class TinyEditor extends React.Component {

    static instanceCounter = 0
    static loadedStyles = []

    isInit = false

    constructor(props) {
        super(props)
        TinyEditor.instanceCounter++
        this.instanceId = TinyEditor.instanceCounter
        this.state = TinyEditor.propsToState(props)
    }

    static propsToState(props) {
        return {value: props.children}
    }

    shouldComponentUpdate(props, state) {
        const readOnlyChanged = props.readOnly !== this.props.readOnly
        if (readOnlyChanged) {
            this.isInit = false
        } else if (this.state.value !== state.value) {

        }

        return readOnlyChanged || props.error !== this.props.error
    }

    isReadOnly(props) {
        return props.readOnly !== undefined && (props.readOnly === true || props.readOnly === 'true')
    }

    initEditor() {

        if (!this.isReadOnly(this.props) && !this.isInit) {

            const assestLoaded = () => {

                if (!window.tinymce) return
                this.isInit = true
                tinymce.init({
                    selector:'#TinyEditor' + this.instanceId,
                    height: 450,
                    formats: {
                        // Changes the alignment buttons to add a class to each of the matching selector elements
                        alignleft: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'left' },
                        aligncenter: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'center' },
                        alignright: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'right' },
                        alignjustify: { selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li,table,img', classes: 'full' }
                    },
                    plugins: [
                        'advlist autolink link image lists charmap print preview hr anchor pagebreak spellchecker',
                        'searchreplace wordcount visualblocks visualchars code fullscreen insertdatetime media nonbreaking',
                        'table emoticons template paste help'
                    ],
                    toolbar: this.props.toolbar || 'undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | ' +
                        'bullist numlist outdent indent | link image | print preview media fullpage | ' +
                        'forecolor backcolor emoticons | help',
                    menu: {
                        favs: {title: 'My Favorites', items: 'code visualaid | searchreplace | spellchecker | emoticons'}
                    },
                    menubar: 'favs file edit view insert format tools table help',
                    init_instance_callback: (editor) => {
                        editor.on('Change', (e) => {
                            const {onChange, name} = this.props
                            if (onChange) {


                                let html = e.level.content
                                if (html === '<p><br data-mce-bogus="1"></p>') {
                                    html = ''
                                }

                                if (name) {
                                    onChange({target: {name, value: html}})
                                } else {
                                    onChange(html)
                                }
                            }
                        })
                    },
                    content_css : "/css/tinymce.css"
                })

            }
            if (!window.tinymce) {
                DomUtil.addScript('https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.2.1/tinymce.min.js', {
                    onload: assestLoaded
                })
            } else {
                assestLoaded()
            }
        }

    }

    componentDidMount() {
        setTimeout(()=> {
            this.initEditor()
        },(this.instanceId-1)*50)
        /*this.css = document.createElement('style')
        this.css.innerHTML = `
        `
        document.body.appendChild(this.css)*/

    }

    componentWillUnmount() {
        tinymce.remove('#TinyEditor' + this.instanceId)
        //document.body.removeChild(this.css)
    }

    componentDidUpdate() {
        this.initEditor()
    }

    render() {
        const {children, readOnly, toolbar, required, theme, name, placeholder, value, error, ...rest} = this.props
        if (this.isReadOnly(this.props)) {
            return <div className="richtext-content"
                        dangerouslySetInnerHTML={{__html: this.state.value}} {...rest}></div>
        }
        if( error){
            if(!rest.style){
                rest.style = {}
            }
            rest.style.border= 'solid 1px red'
        }


        return <div {...rest}>
            <textarea id={'TinyEditor' + this.instanceId} defaultValue={this.state.value} />
        </div>

    }

}


TinyEditor.propTypes = {
    children: PropTypes.any,
    onChange: PropTypes.func,
    className: PropTypes.string,
    name: PropTypes.string,
    style: PropTypes.object,
    toolbar: PropTypes.array,
    readOnly: PropTypes.any
}

export default TinyEditor
