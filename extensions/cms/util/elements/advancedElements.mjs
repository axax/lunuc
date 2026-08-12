import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../../constants/index.mjs'
import {_t} from '../../../../util/i18n.mjs'
import {
    DATA_TAB,
    DEFAULT_TAB,
    ENTRIES_TAB,
    HTML_TAB,
    TEMPLATE_TAB,
    MEDIA_PROJECTION,
    classOptions,
    condition,
    invisibleOptions,
    marginOptions,
    observeOptions,
    styleIndented,
    trOptions
} from './optionHelpers.mjs'


export const buildAdvancedElements = () => [
    {
        subHeader: _t('elements.advancedComponents'),
        tagName: 'section',
        name: _t('elements.key.timeline'),
        icon: 'timeline',
        defaults: {
            $inlineEditor: {
                elementKey: 'timeline',
                allowDrop: false
            },
            p: {['data-element-key']: 'timeline'},
            $set: {value: []},
            c: [
                {
                    $inlineEditor: false,
                    t: 'ul',
                    c: {
                        $for: {
                            $d: '$set.value',
                            s: 'item',
                            c: {
                                $inlineEditor: false,
                                t: 'li',
                                c: {
                                    $inlineEditor: false,
                                    $observe: {
                                        waitVisible: true,
                                        initialClass: 'animation',
                                        visibleClass: 'fade-in-$.item{item._index%2 == 0?\'right\':\'left\'}'
                                    },
                                    c: [
                                        {
                                            $inlineEditor: false,
                                            t: 'time',
                                            c: '$.item{Util.escapeForJson(item.title)}'
                                        },
                                        {
                                            $inlineEditor: false,
                                            $c: '$.item{Util.escapeForJson(item.text)}'
                                        }
                                    ]
                                }
                            }
                        }
                    }
                }
            ]
        },
        groupOptions: {
            $set_value: {
                _addButton: {
                    tab: ENTRIES_TAB,
                    label: _t('elements.addEntry')
                },
                title: {
                    expandable: _t('elements.entry'),
                    tab: ENTRIES_TAB,
                    label: _t('elements.title'),
                    fullWidth: true
                },
                text: {
                    tab: ENTRIES_TAB,
                    expandable: false,
                    label: _t('elements.text'),
                    uitype: 'html'
                }
            }
        },
        options: {
            ...trOptions('$set_'),
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'section',
        name: _t('elements.key.accordion'),
        icon: 'horizontalSplit',
        defaults: {
            $inlineEditor: {
                elementKey: 'accordion',
                allowDrop: false
            },
            p: {['data-element-key']: 'accordion'},
            $set: {value: []},
            c: {
                t: 'Cms',
                $inlineEditor: false,
                p: {
                    slug: 'core/accordion',
                    props: {title: '', items: []}
                }
            }
        },
        groupOptions: {
            c_p_props_items: {
                _addButton: {
                    tab: ENTRIES_TAB,
                    label: _t('elements.addEntry')
                },
                title: {
                    expandable: _t('elements.entry'),
                    tab: ENTRIES_TAB,
                    label: _t('elements.headline'),
                    fullWidth: true,
                    localized: true
                },
                img: {
                    fullWidth: true,
                    label: _t('elements.image'),
                    uitype: 'type_picker',
                    type: 'Media',
                    filter: 'mimeType=image',
                    projection: MEDIA_PROJECTION
                },
                html: {
                    tab: ENTRIES_TAB,
                    expandable: false,
                    localized: true,
                    label: _t('elements.text'),
                    uitype: 'html'
                }
            }
        },
        options: {
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'div',
        name: _t('elements.key.dataContainer'),
        icon: 'storage',
        defaults: {
            c: 'New container',
            $inlineEditor: {
                elementKey: 'dataContainer',
                picker: {type: 'Media', baseFilter: 'mimeType=pdf', template: ''}
            },
            p: {['data-element-key']: 'dataContainer'}
        },
        options: {
            $inlineEditor_picker_type: {
                label: _t('elements.type'),
                uitype: 'select',
                enum: '$TYPES'
            },
            $inlineEditor_picker_baseFilter: {
                label: _t('elements.filter')
            },
            ...condition(),
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'Cms',
        name: _t('elements.cmsComponent'),
        icon: 'functions',
        defaults: {
            $inlineEditor: {elementKey: 'Cms'},
            p: {
                forceEditMode: '${editMode}',
                ['data-element-key']: 'cms'
            }
        },
        options: {
            p_component: {
                tab: 'elements.cmsComponent',
                label: 'elements.selectComponent',
                type: 'CmsPage',
                uitype: 'type_picker',
                projection: ['slug'],
                queryFields: ['slug'],
                searchFields: ['slug', 'name'],
                multi: false,
                fullWidth: true
            },
            p_forceInlineEditor: {
                tab: 'elements.cmsComponent',
                type: 'Boolean',
                newLine: true,
                label: _t('elements.forceInlineEditor')
            },
            p_slug: {
                tab: DEFAULT_TAB,
                label: 'Slug (deprecated)'
            },
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...observeOptions(),
            ...condition(),
            ...invisibleOptions('p_')
        },
        trigger: {
            change: [`
            if(['p_component'].indexOf(this.name)>=0){
                const response = await fetch('/lunucapi/system/man?type=CmsPage&slug='+state.fields.p_component[0].slug)
                if(response){
                    const json = await response.json()
                    if(json && json.fields){
                        this.props.onFieldsChange(json.fields)
                    }
                }
            }`
            ]
        }
    },
    {
        tagName: 'div',
        name: _t('elements.key.custom'),
        icon: 'widgets',
        defaults: {
            $inlineEditor: {
                allowDrop: true,
                elementKey: 'custom'
            },
            p: {['data-element-key']: 'custom'}
        },
        options: {
            t: {label: _t('elements.tag')},
            ...styleIndented(),
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions(),
            ...condition()
        }
    },
    {
        tagName: 'div',
        name: _t('elements.key.query'),
        icon: 'search',
        defaults: {
            $inlineEditor: {
                allowDrop: false,
                elementKey: 'query',
                dataResolver: {}
            },
            p: {['data-element-key']: 'query'},
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
                role: CAPABILITY_MANAGE_CMS_TEMPLATE,
                tab: DATA_TAB,
                label: _t('elements.dataResolver'),
                uitype: 'json',
                value: {
                    key: '__uid__',
                    t: 'GenericData',
                    genericType: 'DemoType',
                    d: [
                        '_id',
                        {'definition': ['name']},
                        {
                            data: [
                                'title',
                                'description',
                                'state',
                                'date',
                                'location',
                                'image'
                            ]
                        }
                    ],
                    l: 1000,
                    f: '_id>${ObjectId.createFromTime(Date.now()/1000-60*60*24*50)}',
                    returnMeta: false,
                    removeDefinition: false
                }
            },
            c_$for_d: {
                role: CAPABILITY_MANAGE_CMS_TEMPLATE,
                tab: DATA_TAB,
                label: _t('elements.dataSource'),
                value: 'data.__uid__.results'
            },
            c_$for_c_c: {
                role: CAPABILITY_MANAGE_CMS_TEMPLATE,
                tab: TEMPLATE_TAB,
                label: _t('elements.template'),
                uitype: 'editor',
                type: 'Object',
                value: {
                    t: 'Row.row-space-4.entry',
                    '$inlineEditor': {
                        if: false,
                        mode: 'source',
                        menuTitle: {
                            source: `\${_t('elements.query.editSource', {name:'$.loop{loop.definition.name}'})}`,
                            sourceClone: `\${_t('elements.query.cloneSource', {name:'$.loop{loop.definition.name}'})}`,
                            sourceRemove:`\${_t('elements.query.removeSource', {name:'$.loop{loop.definition.name}'})}`
                        },
                        menu: {
                            remove: false,
                            clone: false,
                            clipboard: false,
                            addBelow: false,
                            addAbove: false,
                            addSpace: false,
                            convert: false,
                            add: false,
                            allowDrop: false,
                            wrap: false
                        },
                        source: {
                            allowClone: true,
                            allowRemove: true,
                            type: 'GenericData',
                            genericType: '$.loop{loop.definition.name}',
                            _id: '$.loop{loop._id}',
                            resolverKey: '__uid__'
                        }
                    },
                    c: [
                        {
                            $inlineEditor: false,
                            t: 'Col',
                            p: {className: 'col-xs-12 col-sm-6 col-md-8 col-lg-8'},
                            c: [
                                {
                                    t: 'h2',
                                    '$inlineEditor': false,
                                    c: '$.loop{loop.data.title}'
                                },
                                {
                                    t: 'p',
                                    '$inlineEditor': false,
                                    c: '$.loop{Util.formatDate(loop.data.date,{hour:undefined, minute:undefined, second:undefined})} - $.loop{loop.data.state || \'\'} in $.loop{loop.data.location || \'\'}'
                                },
                                {
                                    t: 'div',
                                    '$inlineEditor': false,
                                    $c: '$.loop{loop.data.description || \'\'}'
                                }
                            ]
                        },
                        {
                            $inlineEditor: false,
                            t: 'Col',
                            p: {className: 'col-xs-12 col-sm-6 col-md-4 col-lg-4'},
                            c: [
                                {
                                    $for: {
                                        d: 'loop.data.image',
                                        s: 'img',
                                        c: {
                                            t: 'SmartImage',
                                            '$inlineEditor': false,
                                            p: {
                                                src: '$.img{Util.getImageObject(img).src}',
                                                options: {
                                                    quality: '90',
                                                    resize: {width: 600, height: 500},
                                                    webp: true
                                                }
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            },
            c_$for_c_$c: {
                role: CAPABILITY_MANAGE_CMS_TEMPLATE,
                tab: TEMPLATE_TAB,
                label: _t('elements.templateAlternative'),
                value: ''
            },
            ...condition(),
            ...marginOptions('p_'),
            ...classOptions('p_'),
            t: {
                tab: DEFAULT_TAB,
                label: _t('elements.htmlTag')
            }
        }
    },
    {
        tagName: 'div',
        name: _t('elements.key.web'),
        icon: 'html',
        defaults: {
            $inlineEditor: {
                allowDrop: true,
                elementKey: 'web'
            },
            p: {['data-element-key']: 'web'}
        },
        options: {
            t: {label: _t('elements.tag')},
            $c: {
                tab: HTML_TAB,
                label: _t('elements.plainHtml'),
                fullWidth: true,
                uitype: 'editor',
                escapeTemplateVars: true
            },
            ...styleIndented(),
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions(),
            ...condition()
        }
    }
]
