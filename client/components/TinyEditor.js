import React from 'react'
import PropTypes from 'prop-types'
import DomUtil from 'client/util/dom.mjs'
import Util from '../util/index.mjs'
import config from 'gen/config-client'
import {addLoremipsumPlugin} from './tinymce/loremipsum'
import {openWindow} from '../util/window'
const {DEFAULT_LANGUAGE} = config

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

                addLoremipsumPlugin()

                tinymce.init({
                    selector: '#TinyEditor' + this.instanceId,
                    height: 450,
                    language:'de',
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
                                {title: 'Popup (rechts)', value: 'icon-popup push-icon-left black-icon black'},
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
                        'table emoticons template paste help loremipsum',
                        /*'quickbars'*/
                    ],
                    quickbars_selection_toolbar: 'bold italic | formatselect | quicklink blockquote',
                    quickbars_insert_toolbar: false,
                    quickbars_image_toolbar: 'alignleft aligncenter alignright | rotateleft rotateright | imageoptions',
                    toolbar: this.props.toolbar || 'undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | ' +
                        'bullist numlist outdent indent | link image | print preview media fullpage | ' +
                        'forecolor backcolor emoticons | help',
                    menu: {
                        favs: {title: 'Favoriten', items: 'code visualaid | searchreplace | emoticons | loremipsum'}
                    },
                    menubar: 'favs file edit view insert format tools table help',
                    file_picker_callback: function (callback, value, meta) {

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

                        const newwindow = openWindow({url:`${_app_.lang !== DEFAULT_LANGUAGE ? '/' + _app_.lang : ''}/admin/typesblank/?opener=true&fixType=Media&baseFilter=${encodeURIComponent(baseFilter || '')}`})


                        setTimeout(() => {
                            newwindow.addEventListener('beforeunload', (e) => {
                                console.log(newwindow.resultValue)
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

                                    //_cmsActions.editCmsComponent(rest._key, _json, _scope)
                                    /*const source = getComponentByKey(_key, _json)
                                    if (source) {
                                        if (picker.template) {
                                            source.$c = Util.replacePlaceholders(picker.template.replace(/\\\{/g, '{'), newwindow.resultValue)
                                        } else {
                                            if (!source.p) {
                                                source.p = {}
                                            }
                                            source.p.src = newwindow.resultValue.constructor !== Array ? [newwindow.resultValue] : newwindow.resultValue
                                        }
                                        setTimeout(() => {
                                            _onChange(_json)
                                        }, 0)
                                    }*/
                                }
                            })
                        }, 0)
                    },
                    init_instance_callback: (editor) => {

                        editor.on('Change', (e) => {
                            const {onChange, name} = this.props
                            if (onChange) {

                                let html = editor.getContent()

                                if (name) {
                                    onChange({target: {name, value: html}})
                                } else {
                                    onChange(html)
                                }
                            }
                        })
                    },
                    content_css: "/css/tinymce.css"
                })


            }
            if (!window.tinymce) {
                DomUtil.addScript('https://cdnjs.cloudflare.com/ajax/libs/tinymce/5.10.2/tinymce.min.js', {
                    onload: assestLoaded
                }, {ignoreIfExist: true})
            } else {
                assestLoaded()
            }
        }

    }

    componentDidMount() {
        setTimeout(() => {
            this.initEditor()
        }, (this.instanceId - 1) * 50)
        /*this.css = document.createElement('style')
        this.css.innerHTML = `
        `
        document.body.appendChild(this.css)*/

    }

    componentWillUnmount() {
        if (window.tinymce) {
            tinymce.remove('#TinyEditor' + this.instanceId)
        }
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
        if (error) {
            if (!rest.style) {
                rest.style = {}
            }
            rest.style.border = 'solid 1px red'
        }


        return <div {...rest}>
            <textarea id={'TinyEditor' + this.instanceId} style={{visibility: 'hidden', height: '446px'}}
                      defaultValue={this.state.value}/>
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
