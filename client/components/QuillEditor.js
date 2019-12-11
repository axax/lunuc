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

        DomUtil.addScript('https://cdn.quilljs.com/1.3.6/quill.js',{onload:()=>{
                this.initEditor()
            }})
        DomUtil.addStyle('https://cdn.quilljs.com/1.3.6/quill.snow.css')
    }

    shouldComponentUpdate() {
        return !this.isInit
    }

    initEditor(){
        if( window.Quill && !this.isInit ) {
            this.isInit = true

            const quill = new Quill('#quilleditor' + this.instanceId, {
                modules: {
                    toolbar: [
                        [{ header: [1, 2, false] }],
                        ['bold', 'italic', 'underline'],
                        ['image', 'code-block']
                    ],
                    history: {
                        delay: 2000,
                        maxStack: 500,
                        userOnly: true
                    }
                },
                theme: 'snow'
            })

            quill.on('text-change', (e) => {
                const {onChange, name} = this.props
                if( onChange ){
                    if( name){
                        onChange({target:{name,value:quill.root.innerHTML}})
                    }else {
                        onChange(quill.root.innerHTML)
                    }
                }
            })
        }
    }

    componentDidMount() {
        this.initEditor()
    }

    render() {
        const {children, className, style} = this.props
        console.log('render QuillEditor')
        return <div className={className} style={style}><div id={'quilleditor'+this.instanceId} dangerouslySetInnerHTML={{__html: children}}/></div>

    }

}


QuillEditor.propTypes = {
    children: PropTypes.any,
    onChange: PropTypes.func,
    className: PropTypes.string,
    name: PropTypes.string,
    style: PropTypes.object
}

export default QuillEditor
