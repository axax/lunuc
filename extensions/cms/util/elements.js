const baseElements = [
    {
        subHeader: 'Basic components',
        tagName: 'SmartImage',
        name: 'Image',
        defaults: {
            $inlineEditor: {
                elementKey: 'image',
                picker: {type: 'Media', baseFilter: 'mimeType=image'}
            }
        }
    },
    {
        tagName: 'Link',
        name: 'Link',
        options: {
            c: {value: '', placeholder: 'Name eingeben', label: 'Name'},
            p_href: {value: '', placeholder: 'Url eingeben', label: 'Url'},
            p_className: {
                label: 'Style',
                uitype: 'select',
                enum: [
                    {
                        name: 'Button',
                        value: 'button'
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
            c_0_p_src: {value: '', label: 'Image', uitype: 'type_picker', type: 'Media'},
            c_1_c: {value: '', placeholder: 'Text eingeben', label: 'Text'},
            p_href: {value: '', placeholder: 'Url eingeben', label: 'Url'},
            p_className: {value: '', placeholder: 'Klasse eingeben', label: 'CSS Klasse'}
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'imageLink'
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
            }
        }
    },
    {
        tagName: 'h1$', name: 'Header 1',
        defaults: {
            $inlineEditor: {
                elementKey: 'h1$'
            },
            c: 'Header 1'
        },
        options: {
            c: {
                label: 'Text'
            }
        }
    },
    {
        tagName: 'h2$', name: 'Header 2',
        defaults: {
            $inlineEditor: {
                elementKey: 'h2$'
            },
            c: 'Header 2'
        },
        options: {
            c: {
                label: 'Text'
            }
        }
    },
    {
        tagName: 'p$',
        name: 'Text block',
        defaults: {
            $c: "Paragraph",
            $inlineEditor: {
                elementKey: 'p$'
            }
        },
        options: {
            $c: {
                label: 'Text'
            }
        }
    },
    {
        tagName: 'QuillEditor',
        name: 'Rich-Text block',
        defaults: {
            c: "${_t('__uid__',null,'...')}",
            p: {
                name: '__uid__',
                readOnly: '${!inlineEditor}',
                theme: 'bubble'
            },
            $inlineEditor: {
                elementKey: 'QuillEditor',
                source: ':tr.${_app_.lang}.__uid__:{multiline:true}'
            }
        }
    },
    {
        tagName: 'a',
        name: 'Document', defaults: {
            c: 'Select a Document',
            $inlineEditor: {
                elementKey: 'documentLink',
                picker: {
                    type: 'Media',
                    baseFilter: 'mimeType=pdf',
                    template: "<a title='$\\{name}' href='${_app_.config.UPLOAD_URL}/$\\{_id}'>$\\{name}</a>"
                }
            },
            p: {target: '_blank'}
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
        subHeader: 'Advanced components',
        tagName: 'Row',
        name: 'Layout 1/2',
        defaults: {
            $inlineEditor: {
                elementKey: 'layout-1-2'
            },
            c: [
                {$inlineEditor: {menu:{remove:false, editTemplate:false, addBelow:false}}, t: 'Col.col-sm-6', c: [{c: 'Spalte 1'}]},
                {$inlineEditor: {menu:{remove:false, editTemplate:false, addBelow:false}}, t: 'Col.col-sm-6', c: [{c: 'Spalte 1'}]}
            ]
        },
        options: {
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
                {$inlineEditor: {menu:{remove:false, editTemplate:false, addBelow:false}},t: 'Col.col-md-1-5.col-sm-4.col-xs-6', c: [{c: 'Spalte 1'}]},
                {$inlineEditor: {menu:{remove:false, editTemplate:false, addBelow:false}},t: 'Col.col-md-1-5.col-sm-4.col-xs-6', c: [{c: 'Spalte 2'}]},
                {$inlineEditor: {menu:{remove:false, editTemplate:false, addBelow:false}},t: 'Col.col-md-1-5.col-sm-4.col-xs-6', c: [{c: 'Spalte 3'}]},
                {$inlineEditor: {menu:{remove:false, editTemplate:false, addBelow:false}},t: 'Col.col-md-1-5.col-sm-4.col-xs-6', c: [{c: 'Spalte 4'}]},
                {$inlineEditor: {menu:{remove:false, editTemplate:false, addBelow:false}},t: 'Col.col-md-1-5.col-sm-4.col-xs-6', c: [{c: 'Spalte 5'}]}
            ]
        },
        options: {
            p_style_marginBottom: {
                label: 'Abstand unten'
            }
        }
    },
    {
        subHeader: 'Advanced components',
        tagName: 'Row',
        name: 'Layout 3/4 - 1/4',
        defaults: {
            $inlineEditor: {
                elementKey: 'layout-3-4-1'
            },
            c: [
                {$inlineEditor: {menu:{remove:false, editTemplate:false, addBelow:false}}, t: 'Col.col-sm-8', c: [{c: 'Spalte 1'}]},
                {$inlineEditor: {menu:{remove:false, editTemplate:false, addBelow:false}}, t: 'Col.col-sm-4', c: [{c: 'Spalte 2'}]}
            ]
        },
        options: {
            p_style_marginBottom: {
                label: 'Abstand unten'
            }
        }
    },
    {
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
        name: 'Component',
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
            c_$for_c_c: {
                label: 'Template',
                uitype: 'editor',
                value: '$.loop{loop.data.title}'
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
