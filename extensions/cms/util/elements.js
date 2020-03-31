const baseElements = [
    {
        subHeader: 'Basic components',
        tagName: 'SmartImage',
        name: 'Bild',
        defaults: {
            $inlineEditor: {
                elementKey: 'image',
                picker: {type: 'Media', baseFilter: 'mimeType=image'}
            },
            p:{
                wrapper:'true',
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
                filter: 'mimeType=image'
            },
            p_style_marginTop: {
                label: 'Abstand oben'
            },
            p_style_marginBottom: {
                label: 'Abstand unten'
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
                ]
            },
            p_className: {
                label: 'Klassname'
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
    }, {
        tagName: 'div',
        name: 'Bildergalerie',
        defaults: {
            $inlineEditor: {
                elementKey: 'gallery',
                menu: {addBelow: false},
                allowDrop:false
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
                            wrapper:'true',
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
        tagName: 'Link',
        name: 'Link',
        options: {
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
                elementKey: 'link'
            }
        }
    },
    {
        tagName: 'Link.lu-image-link',
        name: 'Image Link',
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
        tagName: 'hr', name: 'Trennlinie',
        defaults: {
            $inlineEditor: {
                elementKey: 'hr'
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
        tagName: '', name: 'Überschrift',
        defaults: {
            $inlineEditor: {
                elementKey: 'headline'
            },
            c: 'Headline'
        },
        options: {
            t: {
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
            c: {
                label: 'Text',
                fullWidth: true
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
        tagName: 'p',
        name: 'Text block',
        defaults: {
            c: "Paragraph",
            $inlineEditor: {
                elementKey: 'p'
            }
        },
        options: {
            c: {
                label: 'Text',
                fullWidth: true,
                uitype: 'textarea'
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
        tagName: 'div.lu-rich-text',
        name: 'Rich-Text block',
        defaults: {
            $c: '',
            $inlineEditor: {
                elementKey: 'QuillEditor'
            }
        },
        options: {
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
        tagName: 'a',
        name: 'Dokument',
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
                template: '${_app_.config.UPLOAD_URL}/${_id}'
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
        tagName: 'div',
        name: 'Container',
        defaults: {
            $inlineEditor: {
                elementKey: 'container'
            },
            c: '',
            p: {
                ['data-element-key']: 'container'
            }
        },
        options: {
            p_style_marginBottom: {
                label: 'Abstand unten'
            },
            p_className: {
                label: 'Klassname'
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
            c: [
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 1'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 1'}]
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
            c: [
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 1'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 2'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 3'}]
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
            c: [
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 1'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 2'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 3'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 4'}]
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
            c: [
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 1'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 2'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 3'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 4'}]
                },
                {
                    $inlineEditor: {menu: {remove: false, editTemplate: false, addBelow: false}},
                    t: 'Col',
                    c: [{c: 'Spalte 5'}]
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
    },
    {
        subHeader: 'Advanced components',
        tagName: 'div',
        name: 'Data Container',
        defaults: {
            c: 'New container',
            $inlineEditor: {
                elementKey: 'dataContainer',
                picker: {type: 'GenericData', baseFilter: 'mimeType=pdf', template: ''}
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
        name: 'Query',
        defaults: {
            $inlineEditor: {
                allowDrop: false,
                elementKey: 'query',
                dataResolver: {}
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
                theme: 'bubble'
            },
            $inlineEditor: {
                elementKey: 'QuillEditorInline',
                source: ':tr.${_app_.lang}.__uid__:{multiline:true}'
            }
        }
    }
]

let baseElementsMap


export function getJsonDomElements(value) {
    if (!baseElementsMap) {
        baseElementsMap = {}
        baseElements.forEach(element => {
            element.value = element.defaults.$inlineEditor.elementKey
            baseElementsMap[element.value] = element
        })
    }
    if (value) {
        return baseElementsMap[value]
    }
    return baseElements
}
