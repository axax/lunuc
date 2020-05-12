import {
    CAPABILITY_MANAGE_CMS_PAGES
} from '../constants'


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
                tab: 'Allgemein'
            },
            p_style_marginTop: {
                label: 'Abstand oben',
                tab: 'Allgemein'
            },
            p_style_marginBottom: {
                label: 'Abstand unten',
                tab: 'Allgemein'
            },
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
                tab: 'Allgemein'
            },
            p_className: {
                label: 'Klassname',
                tab: 'Allgemein'
            },
            p_wrapper: {
                label: 'Zoom',
                type: 'Boolean'
            },
            p_caption: {
                label: 'Beschreibung',
                uitype: 'html',
                fullWidth: true
            }
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
                multi: true
            },
            p_style_marginTop: {
                label: 'Abstand oben'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            },
            p_className: {
                label: 'Klassname'
            }
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
            t: {
                tab: 'Allgemein',
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
                    }
                ]
            },
            $inlineEditor_options_c_trKey: {
                label: 'Übersetzungsschlüssel',
                value: '__uid__'
            },
            $inlineEditor_options_c_tr: {
                label: 'Sprachabhängig',
                type: 'Boolean',
                tab: 'Allgemein',
                role: CAPABILITY_MANAGE_CMS_PAGES
            },
            c: {
                label: 'Text',
                fullWidth: true,
                tab: 'Allgemein'
            },
            p_style_marginTop: {
                label: 'Abstand oben',
                tab: 'Allgemein'
            },
            p_style_marginBottom: {
                label: 'Abstand unten',
                tab: 'Allgemein'
            },
            p_className: {
                label: 'Klassname',
                tab: 'Allgemein'
            }
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
            $inlineEditor_options_$c_tr: {
                label: 'Sprachabhängig',
                type: 'Boolean',
                role: CAPABILITY_MANAGE_CMS_PAGES
            },
            $c: {
                label: 'Text',
                uitype: 'html'
            },
            p_style_marginTop: {
                label: 'Abstand oben'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            }
        }
    },
    {
        tagName: 'Link',
        name: 'Link',
        options: {
            $inlineEditor_options_c_tr: {
                label: 'Sprachabhängig',
                type: 'Boolean',
                role: CAPABILITY_MANAGE_CMS_PAGES
            },
            c: {fullWidth: true, value: '', placeholder: 'Name eingeben', label: 'Name'},
            p_href: {fullWidth: true, value: '', placeholder: 'Url eingeben', label: 'Url'},
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
                    }
                ]
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            }
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
                filter: 'mimeType=image'
            },
            c_1_c: {fullWidth: true, value: '', placeholder: 'Text eingeben', label: 'Text'},
            p_href: {fullWidth: true, value: '', placeholder: 'Url eingeben', label: 'Url'},
            p_className: {value: '', placeholder: 'Klasse eingeben', label: 'CSS Klasse'}
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'imageLink'
            },
            p: {
                ['data-element-key']: 'imageLink'
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

                template: '${_app_.config.UPLOAD_URL}/${_id}/-/${name}'
            },
            c: {
                fullWidth: true,
                value: '',
                label: 'Bezeichnung'
            },
            p_style_marginTop: {
                label: 'Abstand oben'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            },
            p_className: {
                label: 'Klassname'
            }
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
            p_style_marginTop: {
                label: 'Abstand oben'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            },
            p_className: {
                label: 'Klassname'
            }
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
                                                c: {
                                                    $inlineEditor: false,
                                                    t: 'SmartImage',
                                                    p: {
                                                        caption: "$.item{Util.escapeForJson(item.text)}",
                                                        src: "$.item{Util.escapeForJson(item.image)}"
                                                    }
                                                }
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
                    expandable: "Slide",
                    fullWidth: true,
                    value: '',
                    label: 'Bild',
                    uitype: 'type_picker',
                    type: 'Media',
                    filter: 'mimeType=image'
                },
                link: {
                    label: 'Link',
                    fullWidth: true
                },
                text: {
                    expandable: false,
                    label: 'Text',
                    uitype: 'html'
                }
            }
        },
        options: {
            ['$inlineEditor_groupOptions_$set\\_0\\_value_text_tr']: {
                label: 'Sprachabhängig',
                type: 'Boolean',
                role: CAPABILITY_MANAGE_CMS_PAGES
            },
            $set_0_chunk: {value: '1', label: 'Anzahl pro Seite'},
            p_className: {value: '', placeholder: 'Klasse eingeben', label: 'CSS Klasse'}
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
            $inlineEditor_options_$c_tr: {
                label: 'Sprachabhängig',
                type: 'Boolean',
                role: CAPABILITY_MANAGE_CMS_PAGES
            },
            $c: {
                label: 'Text',
                fullWidth: true,
                uitype: 'textarea',
                replaceBreaks: true
            },
            p_style_marginTop: {
                label: 'Abstand oben'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            }
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
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                }
            ]
        },
        options: {
            c_0_p_className: {
                label: 'Spalte 1',
                value: 'col-sm-6'
            },
            c_1_p_className: {
                label: 'Spalte 2',
                value: 'col-sm-6'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            },
            p_className: {
                label: 'Klassname'
            }
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
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
            ]
        },
        options: {
            c_0_p_className: {
                label: 'Spalte 1',
                value: 'col-md-4 col-sm-4 col-xs-12'
            },
            c_1_p_className: {
                label: 'Spalte 2',
                value: 'col-md-4 col-sm-4 col-xs-12'
            },
            c_2_p_className: {
                label: 'Spalte 3',
                value: 'col-md-4 col-sm-4 col-xs-12'
            },
            p_style_marginTop: {
                label: 'Abstand oben'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            }
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
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                }
            ]
        },
        options: {
            c_0_p_className: {
                label: 'Spalte 1',
                value: 'col-md-3 col-sm-3 col-xs-6'
            },
            c_1_p_className: {
                label: 'Spalte 2',
                value: 'col-md-3 col-sm-3 col-xs-6'
            },
            c_2_p_className: {
                label: 'Spalte 3',
                value: 'col-md-3 col-sm-3 col-xs-6'
            },
            c_3_p_className: {
                label: 'Spalte 4',
                value: 'col-md-3 col-sm-3 col-xs-6'
            },
            p_style_marginTop: {
                label: 'Abstand oben'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            }
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
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: []
                }
            ]
        },
        options: {
            c_0_p_className: {
                label: 'Spalte 1',
                value: 'col-md-1-5 col-sm-4 col-xs-6'
            },
            c_1_p_className: {
                label: 'Spalte 2',
                value: 'col-md-1-5 col-sm-4 col-xs-6'
            },
            c_2_p_className: {
                label: 'Spalte 3',
                value: 'col-md-1-5 col-sm-4 col-xs-6'
            },
            c_3_p_className: {
                label: 'Spalte 4',
                value: 'col-md-1-5 col-sm-4 col-xs-6'
            },
            c_4_p_className: {
                label: 'Spalte 5',
                value: 'col-md-1-5 col-sm-4 col-xs-6'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
            },
            p_className: {
                label: 'Klassname'
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
