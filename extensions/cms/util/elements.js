import {
    CAPABILITY_MANAGE_CMS_PAGES
} from '../constants'

const DEFAULT_TAB = 'Allgemein', IMAGE_OPTIMIZATION_TAB = 'Bild Optimierung', MARGIN_TAB = 'Abstände',
    TRANSLATION_TAB = 'Übersetzung'
const imageOptions = key => ({
    [`${key}options_quality`]: {
        type: 'number',
        label: 'Qualität (Wert zwischen 1 und 100)',
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_resize_width`]: {
        label: 'Breite in Pixel',
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_resize_height`]: {
        label: 'Höhe in Pixel',
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_webp`]: {
        type: 'Boolean',
        newLine: true,
        label: 'WebP',
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_resize_responsive`]: {
        type: 'Boolean',
        label: 'Auto responsive',
        tab: IMAGE_OPTIMIZATION_TAB
    }
})

const lazyImageOptions = key => ({
    [`${key}lazyImage_width`]: {
        newLine: true,
        label: 'LazyImage: Breite in Pixel',
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}lazyImage_height`]: {
        label: 'LazyImage: Höhe in Pixel',
        tab: IMAGE_OPTIMIZATION_TAB
    }
})


const trOptions = key => ({
    [`${key}tr`]: {
        label: 'Sprachabhängig',
        type: 'Boolean',
        tab: TRANSLATION_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    [`${key}trKey`]: {
        label: 'Übersetzungsschlüssel',
        value: '__uid__',
        tab: TRANSLATION_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    }
})

const classOptions = key => ({
    [`${key}className`]: {
        label: 'Klassname'
    }
})

const marginOptions = key => ({
    [`${key}style_marginTop`]: {
        label: 'Abstand oben',
        tab: MARGIN_TAB
    },
    [`${key}style_marginBottom`]: {
        label: 'Abstand unten',
        tab: MARGIN_TAB
    },
    [`${key}style_marginLeft`]: {
        label: 'Abstand links',
        tab: MARGIN_TAB
    },
    [`${key}style_marginRight`]: {
        label: 'Abstand recht',
        tab: MARGIN_TAB
    }
})


const baseElements = [
    {
        subHeader: 'Allgemeine Elemente',
        tagName: 'SmartImage',
        name: 'Bild',
        xhint: 'Ein Bild von der Mediatheke hinzufügen',
        defaults: {
            $inlineEditor: {
                elementKey: 'image',
                picker: {type: 'Media', baseFilter: 'mimeType=image'}
            },
            p: {
                wrapper: 'true',
                ['data-element-key']: 'image'
            }
        },
        options: {
            p_src: {
                fullWidth: true,
                value: '',
                label: 'Bild',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            p_style_float: {
                label: 'Ausrichtung',
                enum: [
                    {
                        name: 'Keine',
                        value: 'none'
                    },
                    {
                        name: 'Rechts',
                        value: 'right'
                    },
                    {
                        name: 'Links',
                        value: 'left'
                    },
                ],
                tab: DEFAULT_TAB
            },
            p_className: {
                label: 'Bild Klassenname'
            },
            p_figureClassName: {
                label: 'Figure Klassenname'
            },
            p_wrapper: {
                label: 'Zoom',
                type: 'Boolean'
            },
            p_caption: {
                label: 'Beschreibung',
                uitype: 'html',
                fullWidth: true
            },
            ...imageOptions('p_'),
            ...lazyImageOptions('$observe_')
        }
    },
    {
        tagName: 'div',
        name: 'Video',
        defaults: {
            $observe: {},
            $inlineEditor: {
                elementKey: 'video',
                picker: {type: 'Media', baseFilter: 'mimeType=video'}
            },
            p: {
                ['data-element-key']: 'video',
                id: '__uid__'
            }
        },
        options: {
            $set_transcode: {
                fullWidth: true,
                value: '',
                label: 'Transcode'
            },
            $set_poster: {
                fullWidth: true,
                value: '',
                label: 'Standbild',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                tab: DEFAULT_TAB,
                template: '${this.context._id?_app_.config.UPLOAD_URL+\'/\'+_id+\'/-/\'+name:\'\'}',
            },
            $set_url: {
                fullWidth: true,
                value: '',
                label: 'Video',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=video',
                tab: DEFAULT_TAB,
                template: '${this.context._id?\'<video controls poster="\'+_comp.$set.poster+\'"><source src="\'+_app_.config.UPLOAD_URL+\'/\'+_id+\'/-/\'+name+(_comp.$set.transcode?\'?transcode=\'+encodeURIComponent(_comp.$set.transcode):\'\')+\'" type="\'+mimeType+\'"/></video>\':\'\'}',
            },
            $set_yt: {
                fullWidth: true,
                value: '',
                label: 'Youtube',
                tab: DEFAULT_TAB,
                template: '${this.context.data?\'<iframe src="https://www.youtube-nocookie.com/embed/\'+data.match(/^(https?:\\/\\/)?((www\\.)?(youtube(-nocookie)?|youtube.googleapis)\\.com.*(v\\/|v=|vi=|vi\\/|e\\/|embed\\/|user\\/.*\\/u\\/\\d+\\/)|youtu\\.be\\/)([_0-9a-z-]+)/i)[7]+\'" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreencontrols></iframe>\':\'\'}'
            },
            $c: {
                template: '${_comp.$set.url?_comp.$set.url:_comp.$set.yt}',
                readOnly: true,
                value: ''
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'Link',
        name: 'Screenshot',
        xhint: 'Erzeugt ein screenshot einer Webseite',
        defaults: {
            $inlineEditor: {
                elementKey: 'screenshot'
            },
            p: {
                ['data-element-key']: 'screenshot',
                'rel': 'noopener',
                'target': '_blank'
            },
            c: [
                {
                    $inlineEditor: false,
                    t: 'SmartImage'
                },
                {
                    $inlineEditor: false,
                    t: 'span',
                    c: ''
                }
            ]
        },
        options: {
            $set_pdf: {
                fullWidth: true,
                value: '',
                label: 'Screenshot von Datei',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=pdf',
                tab: DEFAULT_TAB
            },
            $set_url: {
                fullWidth: true,
                value: '',
                label: 'Screenshot von Url',
                tab: DEFAULT_TAB
            },
            $set_width: {
                fullWidth: true,
                value: '',
                label: 'Breite',
                tab: DEFAULT_TAB
            },
            $set_height: {
                fullWidth: true,
                value: '',
                label: 'Höhe',
                tab: DEFAULT_TAB
            },
            $set_padding: {
                fullWidth: true,
                value: '',
                label: 'Bildrand reduzieren',
                tab: DEFAULT_TAB
            },
            $set_islink: {
                type: 'Boolean',
                newLine: true,
                label: 'Verlinken',
                value: true,
                tab: DEFAULT_TAB
            },
            c_0_p_src: {
                readOnly: true,
                fullWidth: true,
                value: '',
                label: 'Final url',
                template: '/-/-/%7B%22screenshot%22%3A%7B%22url%22%3A%22${encodeURIComponent(_comp.$set.pdf?\'/core/pdfviewer?pdf=\'+_app_.config.UPLOAD_URL+\'/\'+_comp.$set.pdf[0]._id :_comp.$set.url)}%22%2C%22options%22%3A%7B%22height%22%3A${(_comp.$set.height || 1600)}%2C%22delay%22%3A10000%2C%22width%22%3A${(_comp.$set.width || 1200)}%2C%22padding%22%3A${(_comp.$set.padding || 0)}%7D%7D%7D',
                tab: DEFAULT_TAB
            },
            c_1_c: {
                label: 'Beschriftung',
                fullWidth: true,
                tab: DEFAULT_TAB
            },
            c_0_p_alt: {
                value: '',
                template: 'Screenshot ${_comp.$set.pdf?_comp.$set.pdf[0].name:\'Website\'}',
                readOnly: true,
                fullWidth: true
            },
            p_href: {
                readOnly: true,
                value: '',
                template: '${_comp.$set.url?_comp.$set.url:_app_.config.UPLOAD_URL+\'/\'+_comp.$set.pdf[0]._id+\'/-/\'+_comp.$set.pdf[0].name}',
            },
            t: {
                readOnly: true,
                value: '',
                template: "${_comp.$set.islink?'Link':'div'}"
            },
            ...marginOptions('p_'),
            p_style_float: {
                label: 'Ausrichtung',
                enum: [
                    {
                        name: 'Keine',
                        value: 'none'
                    },
                    {
                        name: 'Rechts',
                        value: 'right'
                    },
                    {
                        name: 'Links',
                        value: 'left'
                    },
                ],
                tab: DEFAULT_TAB
            },
            ...classOptions('p_'),
            ...imageOptions('p_'),
            ...lazyImageOptions('$observe_')
        }
    },
    {
        tagName: 'div',
        name: 'Bildergalerie',
        defaults: {
            $inlineEditor: {
                elementKey: 'gallery',
                allowDrop: false
            },
            p: {
                ['data-element-key']: 'gallery'
            },
            c: {
                $loop: {
                    d: [],
                    s: 'item',
                    convert: 'String',
                    c: {
                        $inlineEditor: false,
                        t: 'SmartImage',
                        p: {
                            wrapper: 'true',
                            src: '$.item{data}'
                        }
                    }
                }
            }
        },
        options: {
            c_$loop_d: {
                fullWidth: true,
                value: '',
                label: 'Bilder',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                multi: true,
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: '', name: 'Überschrift',
        defaults: {
            $inlineEditor: {
                elementKey: 'headline',
                options: {
                    c: {
                        trKey: '__uid__'
                    }
                }
            },
            p: {
                ['data-element-key']: 'headline'
            },
            c: 'Headline'
        },
        options: {
            ...trOptions('$inlineEditor_options_c_'),
            t: {
                tabPosition: 0,
                tab: DEFAULT_TAB,
                label: 'Type',
                enum: [
                    {
                        name: 'H1',
                        value: 'h1'
                    },
                    {
                        name: 'H2',
                        value: 'h2'
                    },
                    {
                        name: 'H3',
                        value: 'h3'
                    },
                    {
                        name: 'H4',
                        value: 'h4'
                    },
                    {
                        name: 'H5',
                        value: 'h5'
                    },
                    {
                        name: 'H6',
                        value: 'h6'
                    },
                    {
                        name: 'p',
                        value: 'p'
                    },
                    {
                        name: 'div',
                        value: 'div'
                    },
                    {
                        name: 'span',
                        value: 'span'
                    }
                ]
            },
            c: {
                label: 'Text',
                fullWidth: true,
                tab: DEFAULT_TAB
            },
            p_style_textAlign: {
                label: 'Ausrichtung',
                enum: [
                    {
                        name: 'Links',
                        value: 'left'
                    },
                    {
                        name: 'Rechts',
                        value: 'right'
                    },
                    {
                        name: 'Zentriert',
                        value: 'center'
                    },
                ],
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'div',
        name: 'Texteditor',
        defaults: {
            $c: '',
            $inlineEditor: {
                elementKey: 'richText',
                options: {
                    $c: {
                        trKey: '__uid__'
                    }
                }
            },
            p: {
                ['data-element-key']: 'richText'
            }
        },
        options: {
            ...trOptions('$inlineEditor_options_$c_'),
            $c: {
                label: 'Text',
                uitype: 'html',
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            ...classOptions('p_'),
            ...marginOptions('p_')
        }
    },
    {
        tagName: 'Link',
        name: 'Link',
        options: {
            ...trOptions('$inlineEditor_options_c_'),
            c: {
                fullWidth: true,
                value: '',
                placeholder: 'Name eingeben',
                label: 'Name',
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            p_href: {
                fullWidth: true,
                value: '',
                placeholder: 'Url eingeben',
                label: 'Url',
                tab: DEFAULT_TAB
            },
            p_className: {
                label: 'Style',
                uitype: 'select',
                enum: [
                    {
                        name: 'Kein Style',
                        value: ''
                    },
                    {
                        name: 'Button',
                        value: 'button'
                    },
                    {
                        name: 'Button 1',
                        value: 'button1'
                    },
                    {
                        name: 'Button 2',
                        value: 'button2'
                    },
                    {
                        name: 'Button 3',
                        value: 'button3'
                    },
                    {
                        name: 'Button 4',
                        value: 'button4'
                    },
                    {
                        name: 'Button 5',
                        value: 'button5'
                    }
                ],
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_')
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'link',
                options: {
                    c: {
                        trKey: '__uid__'
                    }
                }
            },
            p: {
                ['data-element-key']: 'link'
            }
        }
    },
    {
        tagName: 'Link',
        name: 'Link mit Bild',
        options: {
            c_0_p_src: {
                fullWidth: true,
                value: '',
                label: 'Bild',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                tab: DEFAULT_TAB
            },
            c_1_c: {
                fullWidth: true,
                value: '',
                placeholder: 'Text eingeben',
                label: 'Text',
                tab: DEFAULT_TAB
            },
            p_href: {
                fullWidth: true,
                value: '',
                placeholder: 'Url eingeben',
                label: 'Url',
                tab: DEFAULT_TAB
            },
            p_title: {
                fullWidth: true,
                value: '',
                placeholder: 'Url Titel eingeben',
                label: 'Url Titel',
                tab: DEFAULT_TAB
            },
            p_target: {
                fullWidth: true,
                value: '',
                placeholder: 'Target',
                label: 'Target',
                tab: DEFAULT_TAB
            },
            ['data-is-invisible']: {
                fullWidth: true,
                type:'Boolean',
                value: false,
                placeholder: 'Ausblenden',
                label: 'Ausblenden',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...imageOptions('c_0_p_'),
            ...lazyImageOptions('c_0_$observe_')
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'imageLink'
            },
            p: {
                ['data-element-key']: 'imageLink',
                'rel': 'noopener'
            },
            c: [
                {
                    $inlineEditor: false,
                    t: 'SmartImage'
                },
                {
                    $inlineEditor: false,
                    t: 'span',
                    c: ''
                }
            ]
        }
    },
    {
        tagName: 'a',
        name: 'Dokument Link',
        xicon: '/icons/pdf.svg',
        defaults: {
            c: '',
            p: {
                title: '',
                target: '_blank',
                rel: 'noopener',
                href: '',
                ['data-element-key']: 'documentLink'
            },
            $inlineEditor: {
                elementKey: 'documentLink'
            }
        },
        options: {
            p_href: {
                fullWidth: true,
                value: '',
                label: 'Datei',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=pdf',
                template: '${_app_.config.UPLOAD_URL}/${_id}/-/${name}',
                tab: DEFAULT_TAB
            },
            c: {
                fullWidth: true,
                value: '',
                label: 'Bezeichnung',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'hr', name: 'Trennlinie',
        defaults: {
            $inlineEditor: {
                elementKey: 'hr'
            },
            p: {
                ['data-element-key']: 'hr'
            }
        },
        options: {
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'section',
        name: 'Slideshow',
        defaults: {
            $inlineEditor: {
                elementKey: 'slider',
                allowDrop: false,
                groupOptions: {
                    $set_0_value: {
                        text: {
                            trKey: '__uid__'
                        }
                    }
                }
            },
            p: {
                ['data-element-key']: 'slider'
            },
            $set: [
                {
                    key: '__sliderData',
                    value: []
                }
            ],
            c: [
                {
                    $for: {
                        $d: '__sliderData',
                        s: 'slide',
                        c:
                            {
                                $inlineEditor: false,
                                t: 'input',
                                p: {
                                    type: 'radio',
                                    binding: false,
                                    name: '__uid__',
                                    defaultValue: '$.slide{slide._index}',
                                    id: '__uid__$.slide{slide._index}',
                                    defaultChecked: "$.slide{slide._index===0?'checked':''}"
                                }
                            }
                    }
                },
                {
                    $inlineEditor: false,
                    t: 'ul',
                    c: {
                        $for: {
                            $d: '__sliderData',
                            s: 'slide',
                            c: {
                                $inlineEditor: false,
                                t: 'li',
                                p: {
                                    ['data-slide-count']: '$.slide{this.scope.__sliderData.length}',
                                    style: {
                                        left: "$.slide{slide._index*100}%"
                                    }
                                },
                                c: [
                                    {
                                        $inlineEditor: false,
                                        $is: '__sliderData.length>1',
                                        t: 'label',
                                        p: {
                                            htmlFor: '__uid__$.slide{slide._index>0?slide._index-1:this.scope.__sliderData.length-1}'
                                        }
                                    },
                                    {
                                        $for: {
                                            $d: 'slide.data',
                                            s: 'item',
                                            c: {
                                                $inlineEditor: false,
                                                t: '$.item{item.link?\'Link\':\'#\'}',
                                                p: {
                                                    'href': '$.item{item.link?item.link:\'\'}'
                                                },
                                                c: [
                                                    {
                                                        $inlineEditor: false,
                                                        $is: '$.item{item.title?true:false}',
                                                        t: 'div.slide-title',
                                                        c: '$.item{item.title}'

                                                    },
                                                    {
                                                        $inlineEditor: false,
                                                        t: 'SmartImage',
                                                        p: {
                                                            caption: "$.item{Util.escapeForJson(item.text)}",
                                                            src: "$.item{Util.escapeForJson(item.image)}"
                                                        }
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        $inlineEditor: false,
                                        $is: '__sliderData.length>1',
                                        t: 'label',
                                        p: {
                                            htmlFor: '__uid__$.slide{slide._index<this.scope.__sliderData.length-1?slide._index+1:0}'
                                        }
                                    }
                                ]
                            }
                        }
                    }
                },
                {
                    $inlineEditor: false,
                    $is: '__sliderData.length>1',
                    t: 'nav',
                    c: {
                        $inlineEditor: false,
                        t: 'ul',
                        c: {
                            $for: {
                                $d: '__sliderData',
                                s: 'slide',
                                c: {
                                    $inlineEditor: false,
                                    t: 'li',
                                    c: {
                                        $inlineEditor: false,
                                        t: 'label',
                                        p: {
                                            htmlFor: '__uid__$.slide{slide._index}'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

            ]
        },
        groupOptions: {
            $set_0_value: {
                image: {
                    tab: 'Slides',
                    expandable: "Slide",
                    fullWidth: true,
                    value: '',
                    label: 'Bild',
                    uitype: 'type_picker',
                    type: 'Media',
                    filter: 'mimeType=image'
                },
                link: {
                    tab: 'Slides',
                    label: 'Link',
                    fullWidth: true
                },
                title: {
                    tab: 'Slides',
                    label: 'Title',
                    fullWidth: true
                },
                text: {
                    tab: 'Slides',
                    expandable: false,
                    label: 'Text',
                    uitype: 'html',
                }
            }
        },
        options: {
            $set_0_chunk: {value: '1', label: 'Anzahl pro Seite'},
            ...trOptions('$inlineEditor_groupOptions_$set\\_0\\_value_text_'),
            ...classOptions('p_'),
            ...imageOptions('c_1_c_$for_c_c_1_$for_c_c_1_p_'),
            ...lazyImageOptions('c_1_c_$for_c_c_1_$for_c_c_1_$observe_')
        }
    },
    {
        tagName: 'p',
        name: 'Text block',
        defaults: {
            $c: "Paragraph",
            $inlineEditor: {
                elementKey: 'p',
                options: {
                    $c: {
                        trKey: '__uid__'
                    }
                }
            }
        },
        options: {
            ...trOptions('$inlineEditor_options_$c_'),
            $c: {
                label: 'Text',
                fullWidth: true,
                uitype: 'textarea',
                replaceBreaks: true,
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'iframe',
        name: 'iFrame',
        options: {
            p_src: {
                fullWidth: true,
                value: '',
                label: 'Url',
                tab: DEFAULT_TAB
            },
            p_width: {
                value: '',
                label: 'Breite',
                tab: DEFAULT_TAB
            },
            p_height: {
                value: '',
                label: 'Höhe',
                tab: DEFAULT_TAB
            },
            p_frameBorder: {
                fullWidth: true,
                value: '',
                label: 'Frameborder',
                tab: DEFAULT_TAB
            },
            p_style: {
                fullWidth: true,
                value: '',
                label: 'Style',
                tab: DEFAULT_TAB
            },
            ...classOptions('p_')
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'iframe',
                options: {
                    c: {
                        trKey: '__uid__'
                    }
                }
            },
            p: {
                ['data-element-key']: 'iframe',
                'frameBorder': '0',
                'style': 'border:0;'
            }
        }
    },
    {
        tagName: 'div',
        name: 'Code block',
        options: {
            c_0_p_type: {
                fullWidth: true,
                value: '',
                label: 'Formatierung',
                uitype: 'select',
                enum: [
                    {
                        name: 'Text',
                        value: ''
                    },
                    {
                        name: 'Javascript',
                        value: 'js'
                    },
                    {
                        name: 'CSS',
                        value: 'css'
                    },
                    {
                        name: 'HTML',
                        value: 'htmlmixed'
                    },
                    {
                        name: 'XML',
                        value: 'htmlmixed'
                    },
                    {
                        name: 'JSON',
                        value: 'json'
                    }
                ],
                tab: DEFAULT_TAB
            },
            c_0_c: {
                fullWidth: true,
                value: '',
                uitype: 'textarea',
                label: 'Code',
                tab: DEFAULT_TAB
            },
            c_0_p_lineNumbers: {
                fullWidth: true,
                value: true,
                type: 'Boolean',
                label: 'Zeilennummern',
                tab: DEFAULT_TAB
            },
            ...classOptions('p_')
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'code',
                options: {
                    c: {
                        trKey: '__uid__'
                    }
                }
            },
            p: {
                ['data-element-key']: 'code'
            },
            c: [
                {
                    $inlineEditor: false,
                    t: 'CodeEditor',
                    c: '',
                    p: {
                        height: 'auto',
                        controlled: true,
                        readOnly: 'nocursor',
                        lineNumbers: true
                    }
                }
            ]
        }
    },
    {
        subHeader: 'Layout Elemente',
        tagName: 'Row',
        name: 'Layout 1/2',
        defaults: {
            $inlineEditor: {
                elementKey: 'layout-1-2'
            },
            p: {
                ['data-element-key']: 'layout-1-2'
            },
            c: [
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                }
            ]
        },
        options: {
            c_0_p_className: {
                fullWidth: true,
                label: 'Spalte 1',
                value: 'col-md-6 col-sm-6 col-xs-12',
                tab: DEFAULT_TAB
            },
            c_1_p_className: {
                fullWidth: true,
                label: 'Spalte 2',
                value: 'col-md-6 col-sm-6 col-xs-12',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'Row',
        name: 'Layout 1/3',
        defaults: {
            $inlineEditor: {
                elementKey: 'layout-1-3'
            },
            p: {
                ['data-element-key']: 'layout-1-3'
            },
            c: [
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
            ]
        },
        options: {
            c_0_p_className: {
                label: 'Spalte 1',
                fullWidth: true,
                value: 'col-md-4 col-sm-4 col-xs-12',
                tab: DEFAULT_TAB
            },
            c_1_p_className: {
                label: 'Spalte 2',
                fullWidth: true,
                value: 'col-md-4 col-sm-4 col-xs-12',
                tab: DEFAULT_TAB
            },
            c_2_p_className: {
                label: 'Spalte 3',
                fullWidth: true,
                value: 'col-md-4 col-sm-4 col-xs-12',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'Row',
        name: 'Layout 1/4',
        defaults: {
            $inlineEditor: {
                elementKey: 'layout-1-4'
            },
            p: {
                ['data-element-key']: 'layout-1-4'
            },
            c: [
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                }
            ]
        },
        options: {
            c_0_p_className: {
                label: 'Spalte 1',
                value: 'col-md-3 col-sm-3 col-xs-6',
                tab: DEFAULT_TAB
            },
            c_1_p_className: {
                label: 'Spalte 2',
                value: 'col-md-3 col-sm-3 col-xs-6',
                tab: DEFAULT_TAB
            },
            c_2_p_className: {
                label: 'Spalte 3',
                value: 'col-md-3 col-sm-3 col-xs-6',
                tab: DEFAULT_TAB
            },
            c_3_p_className: {
                label: 'Spalte 4',
                value: 'col-md-3 col-sm-3 col-xs-6',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'Row',
        name: 'Layout 1/5',
        defaults: {
            $inlineEditor: {
                elementKey: 'layout-1-5'
            },
            p: {
                ['data-element-key']: 'layout-1-5'
            },
            c: [
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                }
            ]
        },
        options: {
            c_0_p_className: {
                label: 'Spalte 1',
                value: 'col-md-1-5 col-sm-4 col-xs-6',
                tab: DEFAULT_TAB
            },
            c_1_p_className: {
                label: 'Spalte 2',
                value: 'col-md-1-5 col-sm-4 col-xs-6',
                tab: DEFAULT_TAB
            },
            c_2_p_className: {
                label: 'Spalte 3',
                value: 'col-md-1-5 col-sm-4 col-xs-6',
                tab: DEFAULT_TAB
            },
            c_3_p_className: {
                label: 'Spalte 4',
                value: 'col-md-1-5 col-sm-4 col-xs-6',
                tab: DEFAULT_TAB
            },
            c_4_p_className: {
                label: 'Spalte 5',
                value: 'col-md-1-5 col-sm-4 col-xs-6',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'Col',
        name: 'Spalte',
        conditions: {
            parent: ['layout-1-5']
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'column'
            }
        },
        options: {
            ...classOptions('p_')
        }
    },
    {
        tagName: 'div',
        name: 'Hintergrund',
        options: {
            ...imageOptions('$set_image_'),
            $set_image_options_background: {
                newLine: true,
                fullWidth: true,
                label: 'Background Extra (Gradient)',
                tab: IMAGE_OPTIMIZATION_TAB
            },
            p_style_backgroundImage: {
                fullWidth: true,
                value: '',
                label: 'Hintergrundbild',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                template: '${_comp.$set.image.options.background?_comp.$set.image.options.background+", ":""}${this.context._id?\'url(\\\'\'+_app_.config.UPLOAD_URL+\'/\'+_id+\'/-/\'+encodeURIComponent(name)+\'?format=\'+(_comp.$set.image.options.webp?\'webp\':\'\')+\'&quality=\'+(_comp.$set.image.options.quality || \'\')+\'&width=\'+(_comp.$set.image.options.resize.width || \'\')+\'&height=\'+(_comp.$set.image.options.resize.height || \'\')+\'\\\')\':\'\'}',
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            p_style_backgroundSize: {
                value: '',
                label: 'Grösse',
                tab: DEFAULT_TAB
            },
            p_style_backgroundPosition: {
                value: '',
                label: 'Position',
                tab: DEFAULT_TAB
            },
            p_style_backgroundColor: {
                value: '',
                label: 'Farbe',
                tab: DEFAULT_TAB
            },
            t: {
                value: '',
                label: 'Tag Name'
            },
            ...classOptions('p_'),
            ...marginOptions('p_')
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'background'
            },
            p: {
                ['data-element-key']: 'background'
            }
        }
    }
]
const advancedElements = [
    {
        subHeader: 'Advanced components',
        tagName: 'div',
        name: 'Data Container',
        defaults: {
            c: 'New container',
            $inlineEditor: {
                elementKey: 'dataContainer',
                picker: {type: 'GenericData', baseFilter: 'mimeType=pdf', template: ''}
            },
            p: {
                ['data-element-key']: 'dataContainer'
            }
        },
        options: {
            $inlineEditor_picker_type: {
                label: 'Style',
                uitype: 'select',
                enum: [
                    {
                        name: 'GenericData',
                        value: 'GenericData'
                    }
                ]
            },
            $inlineEditor_picker_baseFilter: {
                label: 'Filter'
            }
        }
    },
    {
        tagName: 'Cms',
        name: 'Komponente',
        defaults: {
            $inlineEditor: {
                elementKey: 'Cms'
            },
            p: {
                ['data-element-key']: 'cms'
            }
        },
        options: {
            p_slug: {
                label: 'Slug'
            },
            p_id: {
                label: 'Id'
            }
        }
    },
    {
        tagName: 'div',
        name: 'Custom',
        defaults: {
            $inlineEditor: {
                elementKey: 'custom'
            },
            p: {
                ['data-element-key']: 'custom'
            }
        },
        options: {
            p_style_marginTop: {
                label: 'Abstand oben'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            },
            p_className: {
                label: 'Klassname'
            },
            $is: {
                label: 'Bedingung'
            }
        }
    },
    {
        tagName: 'div',
        name: 'Query',
        defaults: {
            $inlineEditor: {
                allowDrop: false,
                elementKey: 'query',
                dataResolver: {}
            },
            p: {
                ['data-element-key']: 'query'
            },
            c: {
                $for: {
                    d: 'data.__uid__.results',
                    c: {
                        $inlineEditor: false,
                        t: 'div',
                        c: ''
                    }
                }
            }
        },
        options: {
            $inlineEditor_dataResolver: {
                label: 'Data Resolver',
                uitype: 'json',
                value: {
                    key: '__uid__',
                    t: 'GenericData',
                    d: [
                        '_id',
                        'definition',
                        {
                            data: [
                                'title'
                            ]
                        },
                    ],
                    f: 'definition.name=BlogEntry && _id>${ObjectId.createFromTime(Date.now()/1000-60*60*24)}'
                }
            },
            c_$for_d: {
                label: 'Data source',
                value: 'data.__uid__.results'
            },
            c_$for_c_$c: {
                label: 'Template',
                uitype: 'editor',
                value: '$.loop{loop.data.title}'
            }
        }
    },
    {
        tagName: 'QuillEditor',
        name: 'Rich-Text Inline (Datasource)',
        defaults: {
            c: "${_t('__uid__',null,'...')}",
            p: {
                name: '__uid__',
                readOnly: '${!inlineEditor}',
                theme: 'bubble',
                ['data-element-key']: 'QuillEditorInline'
            },
            $inlineEditor: {
                elementKey: 'QuillEditorInline',
                source: ':tr.${_app_.lang}.__uid__:{multiline:true}'
            }
        }
    }
]

let elementsMap, elementsMapAdvanced


export function getJsonDomElements(value, options) {
    if (!elementsMap) {
        elementsMap = {}
        baseElements.forEach(element => {
            element.value = element.defaults.$inlineEditor.elementKey
            elementsMap[element.value] = element
        })
    }
    if (!elementsMapAdvanced) {
        elementsMapAdvanced = {}
        advancedElements.forEach(element => {
            element.value = element.defaults.$inlineEditor.elementKey
            elementsMapAdvanced[element.value] = element
        })
    }
    if (value) {
        return elementsMap[value] || elementsMapAdvanced[value]
    }
    if (options && options.advanced) {
        return [...baseElements, ...advancedElements]
    }
    return baseElements
}
