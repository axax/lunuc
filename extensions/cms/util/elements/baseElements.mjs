import {CAPABILITY_MANAGE_CMS_TEMPLATE} from '../../constants/index.mjs'
import {_t} from '../../../../util/i18n.mjs'
import {
    DEFAULT_TAB,
    MARGIN_TAB,
    MISC_TAB,
    MEDIA_PROJECTION,
    alignmentOptions,
    classIconListOptions,
    classLayoutColumnOptions,
    classLayoutOptions,
    classLinkStylingOptions,
    classOptions,
    classTextOptions,
    condition,
    eventOptions,
    imageOptions,
    imgFigureOptions,
    invisibleOptions,
    lazyImageOptions,
    marginOptions,
    observeOptions,
    SCREENSHOT_TAB,
    SLIDES_TAB,
    sizeOptions,
    trOptions,
    VIDEO_TAB
} from './optionHelpers.mjs'
import {
    BACKGROUND_IMAGE_TEMPLATE,
    DOCUMENT_EXTENSION_TEMPLATE,
    DOCUMENT_HREF_TEMPLATE,
    DOCUMENT_LABEL_TEMPLATE,
    SCREENSHOT_SRC_TEMPLATE,
    VIDEO_POSTER_TEMPLATE,
    VIDEO_TAG_TEMPLATE,
    YOUTUBE_TAG_TEMPLATE
} from './elementTemplates.mjs'

/**
 * All row layouts are identical apart from the column count and the default
 * breakpoint widths. Previously each one was ~45 lines of copy-paste.
 */
export const LAYOUT_VARIANTS = [
    {count: 2, cols: {lg: 6, md: 6, sm: 6, xs: 12}, icon: 'pause'},
    {count: 3, cols: {lg: 4, md: 4, sm: 4, xs: 12}},
    {count: 4, cols: {lg: 3, md: 3, sm: 3, xs: 6}},
    {count: 6, cols: {md: 2, sm: 3, xs: 6}}
]

export const LAYOUT_ELEMENT_KEYS = LAYOUT_VARIANTS.map(v => `layout-1-${v.count}`)

const layoutElement = ({count, cols, icon = 'viewColum'}) => {
    const elementKey = `layout-1-${count}`
    return {
        tagName: 'Row',
        icon,
        name: _t(`elements.key.${elementKey}`),
        defaults: {
            $inlineEditor: {elementKey},
            p: {['data-element-key']: elementKey},
            c: Array.from({length: count}, () => ({
                $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                t: 'Col',
                c: []
            }))
        },
        options: {
            ...marginOptions('p_'),
            ...classLayoutColumnOptions(count, cols),
            ...classLayoutOptions('p_', {tabPosition: 1}),
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    }
}

export const buildBaseElements = () => [
    {
        subHeader: _t('elements.general'),
        tagName: 'SmartImage',
        icon: 'image',
        name: _t('elements.key.image'),
        xhint: _t('elements.image.hintAdd'),
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
                label: _t('elements.image.select'),
                uitype: 'type_picker',
                type: 'Media',
                localized: true,
                localizedFallback: true,
                filter: 'mimeType=image',
                tab: DEFAULT_TAB,
                projection: MEDIA_PROJECTION,
                showAlwaysAsImage: true,
                keepTextValue: true
            },
            'p_src@imageSrc': {
                fullWidth: true,
                value: '',
                label: _t('elements.image.enterUrl'),
                tab: DEFAULT_TAB
            },
            p_alt: {
                fullWidth: true,
                label: _t('elements.altText'),
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            'p_style@align': {
                label: _t('elements.alignment'),
                enum: [
                    {name: _t('elements.none'), value: {float: ''}},
                    {name: _t('elements.right'), value: {float: 'right'}},
                    {name: _t('elements.left'), value: {float: 'left'}},
                    {
                        name: _t('elements.center'),
                        value: {marginLeft: 'auto', marginRight: 'auto', display: 'block'}
                    }
                ],
                tab: DEFAULT_TAB
            },
            ...imgFigureOptions('p_'),
            ...classOptions('p_'),
            ...imageOptions('p_'),
            // FIX: srcKey was hardcoded to c_0_p_src before -> ratio hint was dead here
            ...sizeOptions('p_', {srcKey: 'p_src'}),
            ...lazyImageOptions('$observe_'),
            ...observeOptions({if: true}),
            ...condition()
        }
    },
    {
        tagName: 'div',
        name: _t('elements.key.video'),
        icon: 'video',
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
                label: _t('elements.video.poster'),
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                projection: MEDIA_PROJECTION,
                tabPosition: 1,
                tab: VIDEO_TAB,
                template: VIDEO_POSTER_TEMPLATE
            },
            $set_posterSrc: {
                fullWidth: true,
                value: '',
                label: _t('elements.video.posterUrl'),
                tab: VIDEO_TAB
            },
            $set_controls: {
                type: 'Boolean',
                newLine: true,
                label: _t('elements.video.controls'),
                value: true,
                tab: VIDEO_TAB
            },
            $set_autoplay: {
                type: 'Boolean',
                newLine: true,
                label: _t('elements.video.autoplay'),
                value: true,
                tab: VIDEO_TAB
            },
            $set_loop: {
                type: 'Boolean',
                newLine: true,
                label: _t('elements.video.loop'),
                value: true,
                tab: VIDEO_TAB
            },
            $set_muted: {
                type: 'Boolean',
                newLine: true,
                label: _t('elements.video.muted'),
                value: true,
                tab: VIDEO_TAB
            },
            $set_preload: {
                fullWidth: true,
                value: '',
                label: _t('elements.video.preload'),
                enum: [
                    {name: _t('elements.none'), value: 'none'},
                    {name: _t('elements.auto'), value: 'auto'},
                    {name: 'Metadata', value: 'metadata'}
                ],
                projection: MEDIA_PROJECTION,
                tab: VIDEO_TAB
            },
            $set_url: {
                fullWidth: true,
                value: '',
                label: _t('elements.key.video'),
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=video',
                projection: MEDIA_PROJECTION,
                tabPosition: 0,
                tab: DEFAULT_TAB,
                template: VIDEO_TAG_TEMPLATE
            },
            $set_yt: {
                fullWidth: true,
                value: '',
                label: 'Youtube',
                tab: DEFAULT_TAB,
                template: YOUTUBE_TAG_TEMPLATE
            },
            $set_style: {
                fullWidth: true,
                value: '',
                label: 'Style',
                tab: DEFAULT_TAB
            },
            $c: {
                template: '${_comp.$set.url?_comp.$set.url:_comp.$set.yt}',
                readOnly: true,
                value: ''
            },
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...observeOptions()
        }
    },
    {
        tagName: 'Link',
        name: _t('elements.key.screenshot'),
        icon: 'screenshot',
        xhint: _t('elements.screenshot.hint'),
        defaults: {
            $inlineEditor: {elementKey: 'screenshot'},
            p: {
                ['data-element-key']: 'screenshot',
                'rel': 'noopener',
                'target': '_blank'
            },
            c: [
                {$inlineEditor: false, t: 'SmartImage'},
                {$inlineEditor: false, t: 'span', c: ''}
            ]
        },
        options: {
            $set_pdf: {
                fullWidth: true,
                value: '',
                label: _t('elements.screenshot.fromFile'),
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=pdf',
                projection: MEDIA_PROJECTION,
                tab: SCREENSHOT_TAB
            },
            $set_url: {
                fullWidth: true,
                value: '',
                label: _t('elements.screenshot.fromUrl'),
                tab: SCREENSHOT_TAB
            },
            $set_width: {
                fullWidth: true,
                value: '',
                label: _t('elements.width'),
                tab: SCREENSHOT_TAB
            },
            $set_height: {
                fullWidth: true,
                value: '',
                label: _t('elements.height'),
                tab: SCREENSHOT_TAB
            },
            $set_padding: {
                fullWidth: true,
                value: '',
                label: _t('elements.screenshot.padding'),
                tab: SCREENSHOT_TAB
            },
            c_1_c: {
                label: _t('elements.caption'),
                fullWidth: true,
                tab: SCREENSHOT_TAB
            },
            $set_islink: {
                type: 'Boolean',
                newLine: true,
                label: _t('elements.screenshot.asLink'),
                value: true,
                tab: SCREENSHOT_TAB
            },
            $set_timestamp: {
                uitype: 'timestamp',
                newLine: true,
                label: _t('elements.screenshot.newVariant'),
                value: true,
                tab: SCREENSHOT_TAB
            },
            c_0_p_src: {
                readOnly: true,
                fullWidth: true,
                value: '',
                label: _t('elements.finalUrl'),
                template: SCREENSHOT_SRC_TEMPLATE
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
                template: '${_comp.$set.url?_comp.$set.url:_app_.config.UPLOAD_URL+\'/\'+_comp.$set.pdf[0]._id+\'/-/\'+_comp.$set.pdf[0].name}'
            },
            t: {
                readOnly: true,
                value: '',
                template: "${_comp.$set.islink?'Link':'div'}"
            },
            ...marginOptions('p_'),
            p_style_float: {
                label: _t('elements.alignment'),
                enum: [
                    {name: _t('elements.none'), value: 'none'},
                    {name: _t('elements.right'), value: 'right'},
                    {name: _t('elements.left'), value: 'left'}
                ],
                tab: DEFAULT_TAB
            },
            ...classOptions('p_'),
            ...imageOptions('p_'),
            ...lazyImageOptions('$observe_'),
            c_0_p_width: {
                template: '${_comp.$set.width||""}',
                invisible: true
            },
            c_0_p_height: {
                template: '${_comp.$set.height||""}',
                invisible: true
            }
        }
    },
    {
        tagName: 'div',
        name: _t('elements.key.gallery'),
        icon: 'collections',
        defaults: {
            $inlineEditor: {
                elementKey: 'gallery',
                allowDrop: false
            },
            p: {['data-element-key']: 'gallery'},
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
                label: _t('elements.images'),
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                projection: MEDIA_PROJECTION,
                multi: true,
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'div',
        name: _t('elements.key.headline'),
        icon: 'format',
        defaults: {
            $contentEditable: false,
            $inlineEditor: {
                elementKey: 'headline',
                options: {c: {trKey: '__uid__'}}
            },
            p: {['data-element-key']: 'headline'},
            c: 'Headline'
        },
        options: {
            ...trOptions('$inlineEditor_options_c_'),
            t: {
                tabPosition: 0,
                tab: DEFAULT_TAB,
                label: _t('elements.htmlTagSeo'),
                enum: [
                    ...Array.from({length: 6}, (_, i) => ({
                        name: `H${i + 1} (${_t('elements.headline')} ${i + 1})`,
                        value: `h${i + 1}`
                    })),
                    {name: `p (${_t('elements.key.p')})`, value: 'p'},
                    {name: `div (${_t('elements.block')})`, value: 'div'},
                    {name: `span (${_t('elements.inlineElement')})`, value: 'span'},
                    {name: 'strong', value: 'strong'},
                    {name: 'small', value: 'small'},
                    {name: 'time', value: 'time'},
                    {name: 'label', value: 'label'}
                ]
            },
            p_for: {
                label: 'For',
                fullWidth: false,
                tab: DEFAULT_TAB,
                uistate: {visible: 't==label'}
            },
            c: {
                label: _t('elements.text'),
                fullWidth: true,
                uitype: 'textarea',
                tab: DEFAULT_TAB
            },
            $c: {
                onlyShowIfData: true,
                label: _t('elements.textWithHtml'),
                fullWidth: true,
                uitype: 'textarea',
                tab: DEFAULT_TAB,
                role: CAPABILITY_MANAGE_CMS_TEMPLATE
            },
            $toHtml: {
                label: _t('elements.key.keepLineBreaks'),
                fullWidth: false,
                type: 'Boolean',
                tab: DEFAULT_TAB
            },
            $contentEditable: {
                label: _t('elements.key.contentEditable'),
                fullWidth: false,
                type: 'Boolean',
                tab: DEFAULT_TAB
            },
            ...alignmentOptions('p_'),
            ...marginOptions('p_'),
            ...classTextOptions('p_'),
            ...classOptions('p_'),
            ...observeOptions(),
            ...condition()
        }
    },
    {
        tagName: 'div',
        icon: 'wysiwyg',
        name: _t('elements.key.richText'),
        defaults: {
            $c: '',
            $inlineEditor: {
                elementKey: 'richText',
                richText: true,
                options: {$c: {trKey: '__uid__'}}
            },
            p: {['data-element-key']: 'richText'}
        },
        options: {
            ...trOptions('$inlineEditor_options_$c_'),
            $c: {
                label: _t('elements.text'),
                uitype: 'html',
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...marginOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    },
    {
        tagName: 'Link',
        name: _t('elements.key.link'),
        icon: 'link',
        defaults: {
            $inlineEditor: {
                elementKey: 'link',
                options: {c: {trKey: '__uid__'}}
            },
            p: {['data-element-key']: 'link'}
        },
        options: {
            ...trOptions('$inlineEditor_options_c_'),
            c: {
                fullWidth: true,
                value: '',
                placeholder: _t('elements.enterName'),
                label: _t('elements.name'),
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            $toHtml: {
                label: _t('elements.key.keepLineBreaks'),
                fullWidth: false,
                type: 'Boolean',
                tab: DEFAULT_TAB
            },
            p_href: {
                fullWidth: true,
                value: '',
                placeholder: _t('elements.enterUrl'),
                label: 'Url',
                tab: DEFAULT_TAB
            },
            p_title: {
                fullWidth: true,
                value: '',
                placeholder: _t('elements.linkTitle'),
                label: _t('elements.linkTitleSeo'),
                tab: DEFAULT_TAB
            },
            ...classIconListOptions('p_'),
            p_target: {
                fullWidth: false,
                value: '',
                label: 'Target',
                enum: [
                    {name: _t('elements.target.self'), value: '_self'},
                    {name: _t('elements.target.blank'), value: '_blank'},
                    {name: '_parent', value: '_parent'},
                    {name: '_top', value: '_top'}
                ],
                tab: DEFAULT_TAB
            },
            ...classOptions('p_'),
            p_gotop: {
                fullWidth: true,
                defaultValue: true,
                type: 'Boolean',
                label: _t('elements.scrollTop'),
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...eventOptions('p_'),
            ...observeOptions(),
            ...condition()
        }
    },
    {
        tagName: 'Link',
        name: _t('elements.key.imageLink'),
        icon: 'datasetLink',
        defaults: {
            $inlineEditor: {elementKey: 'imageLink'},
            p: {
                ['data-element-key']: 'imageLink',
                'rel': 'noopener'
            },
            c: [
                {$inlineEditor: false, t: 'SmartImage'},
                {$inlineEditor: false, t: 'span', c: ''}
            ]
        },
        options: {
            c_0_p_src: {
                fullWidth: true,
                value: '',
                label: _t('elements.image'),
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                projection: MEDIA_PROJECTION,
                localized: true,
                localizedFallback: true,
                tab: DEFAULT_TAB,
                showAlwaysAsImage: true,
                keepTextValue: true
            },
            p_href: {
                fullWidth: true,
                value: '',
                placeholder: _t('elements.enterUrl'),
                label: 'Url',
                localized: true,
                localizedFallback: true,
                tab: DEFAULT_TAB
            },
            p_title: {
                fullWidth: true,
                value: '',
                placeholder: _t('elements.enterUrlTitle'),
                label: _t('elements.urlTitle'),
                localized: true,
                tab: DEFAULT_TAB
            },
            p_target: {
                fullWidth: true,
                value: '',
                placeholder: 'Target',
                label: 'Target',
                tab: DEFAULT_TAB
            },
            p_gotop: {
                fullWidth: true,
                defaultValue: true,
                type: 'Boolean',
                label: _t('elements.scrollTop'),
                tab: DEFAULT_TAB
            },
            ...imgFigureOptions('c_0_p_'),
            c_0_p_className: {
                label: _t('elements.cssClassImage'),
                tab: MISC_TAB
            },
            c_1_c: {
                fullWidth: true,
                value: '',
                localized: true,
                placeholder: _t('elements.textBelowImage'),
                label: _t('elements.text'),
                tab: MISC_TAB
            },
            ['p_data-hover-text']: {
                fullWidth: true,
                value: '',
                placeholder: _t('elements.textBelowImageHover'),
                label: _t('elements.textHover'),
                localized: true,
                tab: MISC_TAB
            },
            ...invisibleOptions('p_'),
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...imageOptions('c_0_p_'),
            ...sizeOptions('c_0_p_', {srcKey: 'c_0_p_src'}),
            ...lazyImageOptions('c_0_$observe_')
        }
    },
    {
        tagName: 'a',
        name: _t('elements.key.documentLink'),
        icon: 'attachment',
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
            $inlineEditor: {elementKey: 'documentLink'}
        },
        options: {
            ...trOptions('$inlineEditor_options_c_'),
            p_href: {
                fullWidth: true,
                value: '',
                label: _t('elements.file'),
                uitype: 'type_picker',
                type: 'Media',
                projection: MEDIA_PROJECTION,
                template: DOCUMENT_HREF_TEMPLATE,
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            c: {
                fullWidth: true,
                value: '',
                label: _t('elements.label'),
                tab: DEFAULT_TAB,
                template: DOCUMENT_LABEL_TEMPLATE
            },
            ...marginOptions('p_'),
            ...classIconListOptions('p_'),
            ...classOptions('p_'),
            'p_className@extension': {
                value: '',
                invisible: true,
                label: _t('elements.fileExtension'),
                tab: DEFAULT_TAB,
                template: DOCUMENT_EXTENSION_TEMPLATE
            }
        }
    },
    {
        tagName: 'hr',
        name: _t('elements.key.hr'),
        icon: 'horizontalRule',
        defaults: {
            $inlineEditor: {elementKey: 'hr'},
            p: {['data-element-key']: 'hr'}
        },
        options: {
            ...marginOptions('p_'),
            ...classOptions('p_'),
            // no srcKey -> no aspect ratio hint (a <hr> has no image)
            ...sizeOptions('p_style_')
        }
    },
    {
        tagName: 'section',
        name: _t('elements.key.slideshow'),
        icon: 'slideshow',
        defaults: {
            $inlineEditor: {
                elementKey: 'slider',
                allowDrop: false,
                groupOptions: {
                    $set_0_value: {text: {trKey: '__uid__'}}
                }
            },
            p: {['data-element-key']: 'slider'},
            $set: [
                {
                    key: '__sliderData',
                    value: [],
                    chunkOptions: {fill: {data: {}}}
                }
            ],
            c: [
                {
                    $for: {
                        $d: '__sliderData',
                        s: 'slide',
                        c: {
                            $inlineEditor: false,
                            t: 'input',
                            p: {
                                type: 'radio',
                                binding: false,
                                name: '__uid__',
                                defaultValue: '$.slide{slide._index}',
                                id: '__uid__$.slide{slide._index}',
                                defaultChecked: "$.slide{slide._index===0?'checked':''}",
                                'data-slide-timeout': "$.slide{slide.data && slide.data.length>0 && !isNaN(slide.data[0].timeout)?slide.data[0].timeout:''}"
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
                                    ['data-slide-timeout']: "$.slide{isNaN(slide.timeout)?'':slide.timeout}",
                                    style: {left: "$.slide{slide._index*100}%"}
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
                                                p: {'href': '$.item{item.link?item.link:\'\'}'},
                                                c: [
                                                    {
                                                        $inlineEditor: false,
                                                        $is: '$.item{item.title?true:false}',
                                                        t: 'div.slide-title',
                                                        $c: '$.item{_e(_t(item.title))}'
                                                    },
                                                    {
                                                        $is: '$.item{item.image?true:false}',
                                                        $inlineEditor: false,
                                                        t: 'SmartImage',
                                                        p: {
                                                            caption: "$.item{_e(_t(item.text))}",
                                                            src: "$.item{_e(item.image)}",
                                                            className: "$.item{_e(_t(item.className))}"
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
                                    p: {
                                        "style": "$.slide{slide.data && slide.data.length>0 && !isNaN(slide.data[0].timeout)?'--timeout:'+slide.data[0].timeout+'ms':''}"
                                    },
                                    c: {
                                        $inlineEditor: false,
                                        t: 'label',
                                        p: {htmlFor: '__uid__$.slide{slide._index}'}
                                    }
                                }
                            }
                        }
                    }
                },
                {
                    $inlineEditor: false,
                    $is: '__sliderData.length>1',
                    t: 'div.arrownav',
                    c: [
                        {
                            $for: {
                                $d: '__sliderData',
                                s: 'slide',
                                c: [
                                    {
                                        $inlineEditor: false,
                                        t: 'label',
                                        p: {
                                            htmlFor: '__uid__$.slide{slide._index==0?this.scope.__sliderData.length-1:slide._index-1}',
                                            rel: 'prev'
                                        }
                                    },
                                    {
                                        $inlineEditor: false,
                                        t: 'div.slide-count',
                                        c: '$.slide{slide._index+1} | $.slide{this.scope.__sliderData.length}'
                                    },
                                    {
                                        $inlineEditor: false,
                                        t: 'label',
                                        p: {
                                            htmlFor: '__uid__$.slide{slide._index+1>=this.scope.__sliderData.length?0:slide._index+1}',
                                            rel: 'next'
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            ]
        },
        groupOptions: {
            $set_0_value: {
                image: {
                    tab: SLIDES_TAB,
                    expandable: _t('elements.slide'),
                    fullWidth: true,
                    value: '',
                    label: _t('elements.image'),
                    uitype: 'type_picker',
                    type: 'Media',
                    filter: 'mimeType=~video|image',
                    projection: MEDIA_PROJECTION
                },
                link: {tab: SLIDES_TAB, label: _t('elements.link'), fullWidth: true},
                title: {
                    tab: SLIDES_TAB,
                    label: _t('elements.title'),
                    fullWidth: true,
                    replaceBreaks: true,
                    uitype: 'textarea',
                    localized: true
                },
                text: {tab: SLIDES_TAB, label: _t('elements.text'), uitype: 'html', localized: true},
                timeout: {
                    tab: SLIDES_TAB,
                    label: _t('elements.slider.timeout'),
                    fullWidth: true,
                    expandable: false
                }
            }
        },
        options: {
            ['p_data-slide-timeout']: {
                tab: DEFAULT_TAB,
                value: '7000',
                label: _t('elements.slider.timeout')
            },
            'p_style@timeout': {
                value: '7000',
                invisible: true,
                template: '${_comp.p["data-slide-timeout"]?"--timeout:"+_comp.p["data-slide-timeout"]+"ms;":""}'
            },
            $set_0_chunk: {value: '1', label: _t('elements.slider.perPage')},
            $set_0_chunkOptions_randomize: {
                type: 'Boolean',
                value: '1',
                label: _t('elements.slider.randomize')
            },
            $set_0_chunkOptions_fill: {
                type: 'Boolean',
                value: '1',
                label: _t('elements.slider.fill')
            },
            ...classOptions('p_'),
            ...marginOptions('p_'),
            ...imageOptions('c_1_c_$for_c_c_1_$for_c_c_1_p_'),
            c_1_c_$for_c_c_1_$for_c_c_1_p_className: {
                label: _t('elements.cssClassImage'),
                tab: DEFAULT_TAB
            },
            ...lazyImageOptions('c_1_c_$for_c_c_1_$for_c_c_1_$observe_'),
            ...invisibleOptions('p_'),
            // NOTE: observe stays on the root element on purpose. Moving it to the
            // slide image prefix would change where the value is persisted and
            // would require a content migration.
            ...observeOptions()
        }
    },
    {
        tagName: 'p',
        icon: 'subject',
        name: _t('elements.key.p'),
        defaults: {
            $c: 'Paragraph',
            $contentEditable: false,
            $inlineEditor: {
                elementKey: 'p',
                options: {$c: {trKey: '__uid__'}}
            }
        },
        options: {
            ...trOptions('$inlineEditor_options_$c_'),
            $c: {
                label: _t('elements.text'),
                fullWidth: true,
                uitype: 'textarea',
                replaceBreaks: true,
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            $contentEditable: {
                label: _t('elements.key.contentEditable'),
                fullWidth: true,
                type: 'Boolean',
                tab: DEFAULT_TAB
            },
            ...alignmentOptions('p_'),
            ...marginOptions('p_'),
            ...classTextOptions('p_'),
            ...classOptions('p_'),
            ...observeOptions(),
            ...condition()
        }
    },
    {
        tagName: 'iframe',
        name: _t('elements.key.iframe'),
        icon: 'webAsset',
        defaults: {
            $inlineEditor: {elementKey: 'iframe'},
            p: {
                ['data-element-key']: 'iframe',
                'frameBorder': '0',
                'style': 'border:0;'
            }
        },
        options: {
            p_src: {fullWidth: true, value: '', label: 'Url', tab: DEFAULT_TAB},
            p_width: {value: '', label: _t('elements.width'), tab: DEFAULT_TAB},
            p_height: {value: '', label: _t('elements.height'), tab: DEFAULT_TAB},
            p_frameBorder: {fullWidth: true, value: '', label: 'Frameborder', tab: DEFAULT_TAB},
            p_style: {fullWidth: true, value: '', label: 'Style', tab: DEFAULT_TAB},
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...observeOptions(),
            ...condition()
        }
    },
    {
        tagName: 'div',
        name: _t('elements.key.codeBlock'),
        icon: 'code',
        defaults: {
            $inlineEditor: {
                allowDrop: false,
                elementKey: 'code',
                options: {c: {trKey: '__uid__'}}
            },
            p: {['data-element-key']: 'code'},
            c: [
                {
                    $inlineEditor: false,
                    t: 'CodeEditor',
                    c: '',
                    p: {
                        height: 'auto',
                        identifier: 'code${Date.now()}',
                        readOnly: 'nocursor',
                        lineNumbers: true
                    }
                }
            ]
        },
        options: {
            c_0_p_type: {
                fullWidth: true,
                value: '',
                label: _t('elements.formatting'),
                uitype: 'select',
                enum: [
                    {name: 'Text', value: ''},
                    {name: 'Javascript', value: 'js'},
                    {name: 'CSS', value: 'css'},
                    {name: 'HTML', value: 'htmlmixed'},
                    {name: 'XML', value: 'htmlmixed'},
                    {name: 'JSON', value: 'json'}
                ],
                tab: DEFAULT_TAB
            },
            c_0_c: {
                fullWidth: true,
                value: '',
                uitype: 'textarea',
                label: _t('elements.code'),
                tab: DEFAULT_TAB
            },
            c_0_p_lineNumbers: {
                fullWidth: true,
                value: true,
                type: 'Boolean',
                label: _t('elements.lineNumbers'),
                tab: DEFAULT_TAB
            },
            ...classOptions('p_')
        }
    },
    {
        tagName: 'Redirect',
        name: _t('elements.key.redirect'),
        icon: 'replay',
        defaults: {
            $inlineEditor: {elementKey: 'redirect'},
            p: {['data-element-key']: 'redirect'}
        },
        options: {
            p_to: {
                fullWidth: true,
                value: '',
                label: _t('elements.redirect.to')
            }
        }
    },
    {
        tagName: 'input',
        name: _t('elements.key.formElement'),
        icon: 'input',
        defaults: {
            $inlineEditor: {elementKey: 'formElement'},
            p: {['data-element-key']: 'formElement'}
        },
        options: {
            t: {
                tabPosition: 0,
                tab: DEFAULT_TAB,
                label: _t('elements.tag'),
                defaultValue: 'input',
                enum: ['input', 'textarea', 'button', 'select']
            },
            p_type: {
                tab: DEFAULT_TAB,
                label: 'type',
                // FIX: 'reset' and 'submit' were listed twice
                enum: [
                    'text', 'number', 'email', 'checkbox', 'radio', 'password', 'file',
                    'submit', 'reset', 'hidden', 'range', 'color', 'date',
                    'datetime-local', 'month', 'time', 'week', 'image', 'button'
                ],
                uistate: {visible: 't==input'}
            },
            p_name: {label: _t('elements.name'), tab: DEFAULT_TAB},
            c: {
                label: _t('elements.buttonLabel'),
                tab: DEFAULT_TAB,
                localized: true,
                uistate: {visible: 't==button'}
            },
            p_value: {label: 'Value', tab: DEFAULT_TAB, uistate: {visible: 't!=button'}},
            p_placeholder: {label: 'Placeholder', tab: DEFAULT_TAB, uistate: {visible: 't!=button'}},
            p_required: {
                label: 'Required',
                type: 'Boolean',
                tab: DEFAULT_TAB,
                uistate: {visible: 't!=button'}
            },
            ...classOptions('p_'),
            p_binding: {
                defaultValue: true,
                type: 'Boolean',
                label: 'Binding',
                tab: DEFAULT_TAB
            },
            ...eventOptions('p_'),
            ...marginOptions('p_')
        }
    },
    {
        subHeader: _t('elements.layoutElements'),
        tagName: 'div',
        icon: 'grid',
        name: _t('elements.key.grid'),
        defaults: {
            allowDrop: true,
            $inlineEditor: {elementKey: 'grid'},
            p: {['data-element-key']: 'grid'},
            c: []
        },
        options: {
            'p_style@xs_--grid-template-columns-xs': {
                value: 'repeat(1, 1fr)',
                label: 'Grid Template Columns (xs)',
                tab: DEFAULT_TAB
            },
            'p_style@sm_--grid-template-columns-sm': {
                value: 'repeat(2, 1fr)',
                label: 'Grid Template Columns (sm)',
                tab: DEFAULT_TAB
            },
            'p_style@md_--grid-template-columns-md': {
                value: 'repeat(4, 1fr)',
                label: 'Grid Template Columns (md)',
                tab: DEFAULT_TAB
            },
            'p_style@lg_--grid-template-columns-lg': {
                value: 'repeat(5, 1fr)',
                label: 'Grid Template Columns (lg)',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    },
    ...LAYOUT_VARIANTS.map(layoutElement),
    {
        tagName: 'Col',
        name: _t('elements.column'),
        icon: 'viewColum',
        // was ['layout-1-5'] which no longer exists -> the element was unreachable.
        // Now bound to the layouts that actually exist.
        conditions: {
            parent: LAYOUT_ELEMENT_KEYS
        },
        defaults: {
            $inlineEditor: {elementKey: 'column'}
        },
        options: {
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...observeOptions()
        }
    },
    {
        tagName: 'div',
        name: _t('elements.key.background'),
        icon: 'wallpaper',
        defaults: {
            $inlineEditor: {elementKey: 'background'},
            p: {['data-element-key']: 'background'}
        },
        options: {
            t: {value: '', label: _t('elements.tagName')},
            p_href: {value: '', label: 'Href'},
            $set_image_mobileImage: {
                fullWidth: true,
                value: '',
                label: _t('elements.background.mobileImage'),
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                projection: MEDIA_PROJECTION
            },
            $set_image_mobileBreak: {
                value: '',
                label: _t('elements.background.mobileBreak')
            },
            ...imageOptions('$set_image_'),
            $set_image_options_background: {
                newLine: true,
                fullWidth: true,
                label: _t('elements.background.extra'),
                tab: 'elements.imageTab'
            },
            p_style_backgroundImage: {
                fullWidth: true,
                value: '',
                label: _t('elements.background.image'),
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                projection: MEDIA_PROJECTION,
                template: BACKGROUND_IMAGE_TEMPLATE,
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            p_style_backgroundSize: {
                value: '',
                label: _t('elements.size'),
                tab: DEFAULT_TAB
            },
            p_style_backgroundPosition: {
                value: '',
                label: _t('elements.position'),
                tab: DEFAULT_TAB
            },
            p_style_backgroundColor: {
                value: '',
                label: _t('elements.color'),
                tab: DEFAULT_TAB
            },
            p_style_backgroundRepeat: {
                value: '',
                label: _t('elements.repeat'),
                enum: [
                    {name: _t('elements.none'), value: 'no-repeat'},
                    {name: _t('elements.bothSides'), value: 'repeat'}
                ],
                tab: DEFAULT_TAB
            },
            ...invisibleOptions('p_'),
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...marginOptions('p_'),
            ...observeOptions()
        }
    }
]
