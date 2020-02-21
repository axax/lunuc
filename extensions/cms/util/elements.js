const baseElements = [
    {
        subHeader: 'Basic components',
        value: 'SmartImage',
        name: 'Image',
        defaults: {$inlineEditor: {picker: {type: 'Media', baseFilter: 'mimeType=image'}}}
    },
    {
        value: 'Link',
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
            }
        },
        defaults: {}
    },
    {value: 'hr', name: 'Divider'},
    {value: 'h1$', name: 'Header 1', defaults: {c: 'Header 1'}},
    {value: 'h2$', name: 'Header 2', defaults: {c: 'Header 2'}},
    {
        value: 'QuillEditor', name: 'Rich-Text block',
        defaults: {
            c: "${_t('__uid__',null,'...')}",
            p: {
                name: '__uid__',
                readOnly: '${!inlineEditor}',
                theme: 'bubble'
            },
            $inlineEditor: {
                source: ':tr.${_app_.lang}.__uid__:{multiline:true}'
            }
        }
    },
    {
        value: 'p$', name: 'Text block',
        defaults: {
            $c: "Paragraph"
        }
    },
    {
        value: 'a', name: 'Document', defaults: {
            c: 'Select a Document',
            $inlineEditor: {
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
        value: 'Row', name: 'Layout 1/2', defaults: {
            c: [
                {t: 'Col.col-sm-6', c: [{c: 'Spalte 1'}]},
                {t: 'Col.col-sm-6', c: [{c: 'Spalte 1'}]}
            ]
        }
    },
    {
        value: 'div',
        name: 'Data Container',
        defaults: {
            c: 'New container',
            $inlineEditor: {picker: {type: 'GenericData', baseFilter: 'mimeType=pdf', template: ''}}
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
        value: 'Cms',
        name: 'Component',
        defaults: {
            $inlineEditor: {picker: {type: 'GenericData', baseFilter: 'mimeType=pdf', template: ''}}
        }
    },
    {
        value: 'div.query',
        name: 'Query',
        defaults: {
            $inlineEditor: {
                dataResolver:{}
            },
            c: {
                $for: {
                    d: 'data.__uid__.results',
                    c: {
                        $inlineEditor:false,
                        t: 'div',
                        c: ''
                    }
                }
            }
        },
        options: {
            $inlineEditor_dataResolver:{
                label: 'Data Resolver',
                uitype: 'json',
                value: {
                    key:'__uid__',
                    t: 'GenericData',
                    d: [
                        '_id',
                        {
                            data: [
                                'title'
                            ]
                        },
                    ],
                    f:'definition.name=BlogEntry && _id>${ObjectId.createFromTime(Date.now()/1000-60*60*24)}'
                }
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
    if (value) {
        if (!baseElementsMap) {
            baseElementsMap = {}
            baseElements.forEach(element => {
                baseElementsMap[element.value] = element
            })
        }
        return baseElementsMap[value]
    }
    return baseElements
}
