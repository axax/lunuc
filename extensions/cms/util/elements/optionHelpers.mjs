import {
    CAPABILITY_MANAGE_CMS_PAGES
} from '../../constants/index.mjs'
import {_t} from '../../../../util/i18n.mjs'

export const DEFAULT_TAB = 'elements.generalTab'
export const IMAGE_OPTIMIZATION_TAB = 'elements.imageTab'
export const MARGIN_TAB = 'elements.marginTab'
export const TRANSLATION_TAB = 'elements.translationTab'
export const MISC_TAB = 'elements.miscTab'
export const VISIBILITY_TAB = 'elements.visibilityTab'
export const EVENT_TAB = 'elements.eventTab'
export const EXTENDED_TAB = 'elements.extendedTab'
export const VIDEO_TAB = 'elements.videoTab'
export const SCREENSHOT_TAB = 'elements.screenshotTab'
export const SLIDES_TAB = 'elements.slidesTab'
export const ENTRIES_TAB = 'elements.entriesTab'
export const DATA_TAB = 'elements.dataTab'
export const TEMPLATE_TAB = 'elements.templateTab'
export const HTML_TAB = 'elements.htmlTab'
export const RESPONSIVE_TAB = 'elements.responsiveTab'

// frozen: the projection is exported and shared across all element definitions,
// a consumer mutating it would corrupt every picker at once
export const MEDIA_PROJECTION = Object.freeze([
    '_id', 'size', 'name', 'group', 'src', 'mimeType',
    Object.freeze({'info': Object.freeze(['width', 'height'])})
])

export const imageOptions = key => ({
    [`${key}options_hint`]: {
        uitype: 'htmlParser',
        html: `<i style="display:block;margin-bottom:1rem;font-size:0.8rem;padding:0.5rem;background-color:#fbfce1;">${
            _t('elements.image.hint', {tab: _t(MARGIN_TAB)})
        }</i>`,
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_quality`]: {
        type: 'number',
        newLine: true,
        label: _t('elements.image.quality'),
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_resize_width`]: {
        label: _t('elements.image.resizeWidth'),
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_resize_height`]: {
        label: _t('elements.image.resizeHeight'),
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_position`]: {
        label: _t('elements.image.position'),
        tab: IMAGE_OPTIMIZATION_TAB,
        enum: [
            {value: '', name: _t('elements.none')},
            'center',
            'north',
            'northeast',
            'east',
            'southeast',
            'south',
            'southwest',
            'west',
            'northwest',
            'entropy'
        ]
    },
    [`${key}options_format`]: {
        enum: [
            {value: '', name: _t('elements.image.noConversion')},
            'png', 'gif', 'jpeg'
        ],
        newLine: false,
        label: _t('elements.image.convertTo'),
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_removebg_tolerance`]: {
        type: 'number',
        uitype: 'slider',
        max: 300,
        min: 0,
        defaultValue: 0,
        label: _t('elements.image.removebg'),
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
        label: _t('elements.image.autoResponsive'),
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_flip`]: {
        type: 'Boolean',
        label: 'Flip (Vertical Y)',
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_flop`]: {
        type: 'Boolean',
        label: 'Flop (Horizontal X)',
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_noenlarge`]: {
        type: 'Boolean',
        label: _t('elements.image.noEnlarge'),
        tab: IMAGE_OPTIMIZATION_TAB
    }
})

export const lazyImageOptions = key => ({
    [`${key}lazyImage_width`]: {
        newLine: true,
        label: _t('elements.lazyImage.width'),
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}lazyImage_height`]: {
        label: _t('elements.lazyImage.height'),
        tab: IMAGE_OPTIMIZATION_TAB
    }
})

export const trOptions = key => ({
    [`${key}tr`]: {
        label: _t('elements.languageDependent'),
        type: 'Boolean',
        tab: TRANSLATION_TAB,
        defaultValue: !!(_app_.languages && _app_.languages.length > 1),
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    [`${key}trGlobal`]: {
        label: _t('elements.tr.global'),
        type: 'Boolean',
        tab: TRANSLATION_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    [`${key}trKey`]: {
        label: _t('elements.tr.key'),
        value: '__uid__',
        tab: TRANSLATION_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    [`${key}trContext`]: {
        // typo fixed: "Plazhalter" -> "Platzhalter"
        label: _t('elements.tr.context'),
        value: '',
        tab: TRANSLATION_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    }
})

export const classOptions = (key, tab) => ({
    [`${key}id`]: {
        newLine: true,
        label: 'ID',
        tab: tab || DEFAULT_TAB
    },
    [`${key}className`]: {
        label: _t('elements.cssClass'),
        tab: tab || DEFAULT_TAB,
        uitype: 'autosuggest',
        multipleSeparator: ' ',
        autosuggestUrl: '/lunucapi/autosuggest/classnames?slug=${props.slug}&s=%search%'
    },
    [`${key}style@custom`]: {
        label: 'CSS Style',
        fullWidth: true,
        tab: tab || DEFAULT_TAB
    }
})

export const invisibleOptions = key => ({
    [`${key}data-is-invisible`]: {
        fullWidth: true,
        type: 'Boolean',
        value: false,
        placeholder: _t('elements.hideElement'),
        label: _t('elements.hideElement'),
        tab: DEFAULT_TAB
    }
})

/**
 * @param defaultValue  initial $observe value of the element
 * @param key           option key prefix, allows attaching observe options to a
 *                      nested child (e.g. 'c_0_$observe_') instead of the root.
 *                      NOTE: changing this on an existing element changes where
 *                      the value is persisted -> needs a content migration.
 */
export const observeOptions = (defaultValue = {}, key = '$observe_') => {
    const visibleWhenEnabled = {visible: `${key}if==true`}
    const base = {
        fullWidth: true,
        tab: VISIBILITY_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    }
    return {
        [`${key}if`]: {
            ...base,
            divider: true,
            type: 'Boolean',
            defaultValue: !!defaultValue.if,
            label: _t('elements.observe.enable')
        },
        [`${key}waitVisible`]: {
            ...base,
            type: 'Boolean',
            value: false,
            label: _t('elements.observe.waitVisible'),
            uistate: visibleWhenEnabled
        },
        [`${key}initialClass`]: {
            ...base,
            label: _t('elements.observe.initialClass'),
            uistate: visibleWhenEnabled
        },
        [`${key}visibleClass`]: {
            ...base,
            label: _t('elements.observe.visibleClass'),
            uistate: visibleWhenEnabled
        },
        [`${key}threshold`]: {
            ...base,
            label: 'Threshold',
            type: 'Float',
            uistate: visibleWhenEnabled
        },
        [`${key}delay`]: {
            ...base,
            label: _t('elements.observe.delay'),
            type: 'Float',
            uistate: visibleWhenEnabled
        },
        [`${key}backgroundImage`]: {
            ...base,
            type: 'Boolean',
            value: false,
            label: _t('elements.observe.backgroundImage'),
            uistate: visibleWhenEnabled
        },
        [`${key}passProps`]: {
            ...base,
            type: 'Boolean',
            value: false,
            label: _t('elements.observe.passProps'),
            uistate: visibleWhenEnabled
        },
        [`${key}flipMode`]: {
            ...base,
            type: 'Boolean',
            value: false,
            label: _t('elements.observe.filpFlop')
        }
    }
}

export const classLinkStylingOptions = key => ({
    [`${key}className@linkstyling`]: {
        label: _t('elements.linkStyling'),
        tab: DEFAULT_TAB,
        enum: [
            {value: '', name: _t('elements.none')},
            {value: ' underlined-link ', name: _t('elements.linkAnimation')}
        ]
    }
})

const colClasses = [
    {short: 'xs', long: 'Mobile'},
    {short: 'sm', long: 'Tablet'},
    {short: 'md', long: 'Desktop'},
    {short: 'lg', long: 'Large Desktop'}
]

// the 1..12 enum is constant per breakpoint - build it once instead of
// re-allocating 12 objects per column per breakpoint on every call
const COL_ENUMS = colClasses.reduce((acc, col) => {
    acc[col.short] = Object.freeze(
        Array.from({length: 12}, (_, i) => Object.freeze({
            value: ` col-${col.short}-${i + 1} `,
            name: i + 1
        }))
    )
    return acc
}, {})

export const classLayoutColumnOptions = (count, options = {}) => {
    const obj = {}
    for (let i = 0; i < count; i++) {
        for (const col of colClasses) {
            obj[`c_${i}_p_className@${col.short}`] = {
                fourthWidth: true,
                forceOverride: true,
                label: `${_t('elements.column')} ${i + 1}: ${col.long}`,
                value: options[col.short] ? ` col-${col.short}-${options[col.short]} ` : ' ',
                tab: RESPONSIVE_TAB,
                tabPosition: 0,
                enum: COL_ENUMS[col.short]
            }
        }
        obj[`c_${i}_p_className`] = {
            fullWidth: true,
            label: `${_t('elements.classOfColumn')} ${i + 1}`,
            value: ''
        }
    }
    return obj
}

export const classIconListOptions = key => ({
    [`${key}className@icons`]: {
        label: 'Icon',
        tab: DEFAULT_TAB,
        enum: [
            {value: '', name: _t('elements.none')},
            {value: ' icon-phone ', name: _t('elements.icon.phone')},
            {value: ' icon-email ', name: 'Email'},
            {value: ' icon-pdf ', name: 'PDF'},
            {value: ' icon-click ', name: 'Click'},
            {value: ' icon-home ', name: 'Home'},
            {value: ' icon-pdf black-icon black ', name: _t('elements.icon.pdfBlack')},
            {value: ' icon-pdf push-icon-left black-icon black ', name: _t('elements.icon.pdfRightBlack')},
            {value: ' icon-right black-icon black ', name: _t('elements.icon.arrowBlack')},
            {value: ' icon-right push-icon-left black-icon black ', name: _t('elements.icon.arrowRightBlack')}
        ]
    }
})

export const classTextOptions = key => ({
    [`${key}className@text`]: {
        label: _t('elements.styling'),
        tab: DEFAULT_TAB,
        enum: [
            {value: '', name: _t('elements.none')},
            ...Array.from({length: 6}, (_, i) => ({
                value: ` h${i + 1} `,
                name: `${_t('elements.headline')} ${i + 1}`
            })),
            {value: ' strong ', name: _t('elements.bold')},
            {value: ' small ', name: _t('elements.small')},
            {value: ' blockquote ', name: 'Blockquote'}
        ]
    }
})

export const classLayoutOptions = (key, {tabPosition = 0} = {}) => ({
    [`${key}className@space`]: {
        label: _t('elements.columnSpacing'),
        tab: DEFAULT_TAB,
        tabPosition,
        enum: [
            {value: ' row-space-2 ', name: _t('elements.small')},
            {value: ' row-space-4 ', name: _t('elements.medium')},
            {value: ' row-space-6 ', name: _t('elements.large')}
        ]
    },
    [`${key}className@align`]: {
        label: _t('elements.alignment'),
        tab: DEFAULT_TAB,
        enum: [
            {value: '', name: _t('elements.without')},
            {value: ' vcenter ', name: _t('elements.vcenter')},
            {value: ' vend ', name: _t('elements.vend')}
        ]
    },
    [`${key}className@order`]: {
        label: _t('elements.order'),
        tab: DEFAULT_TAB,
        enum: [
            {value: '', name: _t('elements.without')},
            {value: ' row-sm-reverse ', name: _t('elements.reverseOnMobile')}
        ]
    }
})

export const marginOptions = key => ({
    [`${key}style_marginTop`]: {label: _t('elements.marginTop'), tab: MARGIN_TAB},
    [`${key}style_marginBottom`]: {label: _t('elements.marginBottom'), tab: MARGIN_TAB},
    [`${key}style_marginLeft`]: {label: _t('elements.marginLeft'), tab: MARGIN_TAB},
    [`${key}style_marginRight`]: {label: _t('elements.marginRight'), tab: MARGIN_TAB},
    [`${key}style_padding`]: {label: _t('elements.padding'), tab: MARGIN_TAB}
})

export const alignmentOptions = key => ({
    [`${key}style_textAlign`]: {
        label: _t('elements.alignment'),
        enum: [
            {name: _t('elements.left'), value: 'left'},
            {name: _t('elements.right'), value: 'right'},
            {name: _t('elements.center'), value: 'center'}
        ],
        tab: DEFAULT_TAB
    }
})

export const eventOptions = key => ({
    [`${key}onClick`]: {
        fullWidth: true,
        uitype: 'json',
        height: '10rem',
        type: 'Object',
        label: 'onClick',
        tab: EVENT_TAB
    },
    [`${key}onChange`]: {
        fullWidth: true,
        uitype: 'json',
        height: '10rem',
        type: 'Object',
        label: 'onChange',
        tab: EVENT_TAB
    }
})

export const condition = () => ({
    $is: {
        label: _t('elements.condition'),
        tab: VISIBILITY_TAB,
        fullWidth: true
    }
})

export const styleIndented = () => ({
    'p_className@style': {
        label: 'Style',
        tab: DEFAULT_TAB,
        enum: [
            {value: '', name: _t('elements.none')},
            {value: ' indented ', name: _t('elements.indentedMedium')},
            {value: ' indented-small ', name: _t('elements.indentedSmall')},
            {value: ' indented-large ', name: _t('elements.indentedLarge')}
        ]
    }
})

/**
 * Builds the aspect ratio helper text for a width/height field.
 * FIX: the key is now respected - the old version hardcoded `c_0_p_*`, so the
 * hint never resolved for elements using another prefix (e.g. SmartImage `p_`).
 * Optional chaining prevents an exception when no image is selected.
 */
const aspectRatioHint = (key, srcKey, field) => {
    const other = field === 'width' ? 'height' : 'width'
    const info = `${srcKey}?.[_app_.lang]?.[0]?.info`
    return '${this.' + key + other + ' && ' + info + '?.' + field +
        '?_t("elements.aspectRatio",{' + other + ':' + key + other + ',' +
        field + ':(' + info + '.' + field + '/' + info + '.' + other + '*' +
        key + other + ').toFixed(2)}):""}'
}

/**
 * @param key     option key prefix (e.g. 'p_', 'c_0_p_', 'p_style_')
 * @param srcKey  optional key of the corresponding image field. Only when given
 *                the aspect ratio helper text is rendered (a <hr> has no src).
 */
export const sizeOptions = (key, {srcKey} = {}) => ({
    [`${key}width`]: {
        label: _t('elements.width'),
        tab: MARGIN_TAB,
        ...(srcKey ? {helperText: aspectRatioHint(key, srcKey, 'width')} : {})
    },
    [`${key}height`]: {
        label: _t('elements.height'),
        tab: MARGIN_TAB,
        ...(srcKey ? {helperText: aspectRatioHint(key, srcKey, 'height')} : {})
    }
})

export const imgFigureOptions = key => ({
    [`${key}wrapper`]: {
        label: _t('elements.imageWithCaption'),
        type: 'Boolean',
        defaultValue: false,
        tab: MISC_TAB
    },
    [`${key}caption`]: {
        label: _t('elements.description'),
        uitype: 'html',
        fullWidth: true,
        localized: true,
        tab: MISC_TAB
    },
    [`${key}figureClassName`]: {
        label: _t('elements.figureClassName'),
        tab: MISC_TAB
    }
})
