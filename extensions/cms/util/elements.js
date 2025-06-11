import {
    CAPABILITY_MANAGE_CMS_PAGES,
    CAPABILITY_MANAGE_CMS_TEMPLATE
} from '../constants/index.mjs'
import {_t} from '../../../util/i18n.mjs'

const DEFAULT_TAB = 'elements.generalTab',
    IMAGE_OPTIMIZATION_TAB = 'elements.imageTab',
    MARGIN_TAB = 'elements.marginTab',
    TRANSLATION_TAB = 'elements.translationTab',
    MISC_TAB = 'elements.miscTab',
    VISIBILITY_TAB = 'elements.visibilityTab',
    EVENT_TAB = 'elements.eventTab',
    EXTENDED_TAB = 'elements.extendedTab',
    MEDIA_PROJECTION = ['_id', 'size', 'name', 'group', 'src', 'mimeType', {'info': ['width', 'height']}]


const imageOptions = key => ({
    [`${key}options_hint`]: {
        uitype: 'htmlParser',
        html: `<i style="display:block;margin-bottom:1rem;font-size: 0.8rem;padding: 0.5rem;background-color: #fbfce1;">
Nicht empfolen für SVG Bilder, da diese dabei in PNG umgewandelt werden. Im Tab ${MARGIN_TAB} kann die Anzeigegrösse gesetzt werden.</i>`,
        tab: IMAGE_OPTIMIZATION_TAB
    },
    [`${key}options_quality`]: {
        type: 'number',
        newLine: true,
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
    [`${key}options_position`]: {
        label: 'Position (wenn Bild geschnitten wird)',
        tab: IMAGE_OPTIMIZATION_TAB,
        enum: [
            {
                value: '',
                name: 'Keine'
            },
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
        enum: [{value: '', name: 'keine Umwandlung'}, 'png', 'gif', 'jpeg'],
        newLine: false,
        label: 'In Format umwandeln',
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
        label: 'Keine Bildvergrösserung',
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
    [`${key}trGlobal`]: {
        label: 'Globale Übersetzung',
        type: 'Boolean',
        tab: TRANSLATION_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    [`${key}trKey`]: {
        label: 'Übersetzungsschlüssel',
        value: '__uid__',
        tab: TRANSLATION_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    [`${key}trContext`]: {
        label: 'Übersetzungskontext (für Plazhalter)',
        value: '',
        tab: TRANSLATION_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    }
})

const classOptions = (key, tab) => ({
    [`${key}id`]: {
        newLine: true,
        label: 'ID',
        tab: tab || DEFAULT_TAB
    },
    [`${key}className`]: {
        label: 'CSS Klassname',
        tab: tab || DEFAULT_TAB
    },
    [`${key}style@custom`]: {
        label: 'CSS Style',
        fullWidth: true,
        tab: tab || DEFAULT_TAB
    }
})

const invisibleOptions = key => ({
    [`${key}data-is-invisible`]: {
        fullWidth: true,
        type: 'Boolean',
        value: false,
        placeholder: 'Ausblenden',
        label: 'Ausblenden',
        tab: DEFAULT_TAB
    },
})

const observeOptions = () => ({
    '$observe_if': {
        fullWidth: true,
        type: 'Boolean',
        value: false,
        label: 'Überwachung aktivieren',
        tab: VISIBILITY_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    '$observe_waitVisible': {
        fullWidth: true,
        type: 'Boolean',
        value: false,
        label: 'Sichtbarkeit überwachen (Rendering wenn in Viewport)',
        tab: VISIBILITY_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    '$observe_backgroundImage': {
        fullWidth: true,
        type: 'Boolean',
        value: false,
        label: 'Nur Hintergrundbild (Bild erst laden wenn sichtbar)',
        tab: VISIBILITY_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    '$observe_passProps': {
        fullWidth: true,
        type: 'Boolean',
        value: false,
        label: 'Attribute beibehalten',
        tab: VISIBILITY_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    '$observe_initialClass': {
        fullWidth: true,
        label: 'Initial Klasse',
        tab: VISIBILITY_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    '$observe_visibleClass': {
        fullWidth: true,
        label: 'Sichtbar Klasse',
        tab: VISIBILITY_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    '$observe_threshold': {
        fullWidth: true,
        label: 'Threshold',
        type: 'Float',
        tab: VISIBILITY_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
    '$observe_flipMode': {
        fullWidth: true,
        type: 'Boolean',
        value: false,
        label: 'Ein-/Ausblenden',
        tab: VISIBILITY_TAB,
        role: CAPABILITY_MANAGE_CMS_PAGES
    },
})

const classLinkStylingOptions = key => ({
    [`${key}className@linkstyling`]: {
        label: 'Link Styling',
        tab: DEFAULT_TAB,
        enum: [
            {
                value: '',
                name: 'Keine'
            },
            {
                value: ' underlined-link ',
                name: 'Link Animation'
            }
        ]
    }
})

const colClasses = [
    {
        short: 'xs',
        long: 'Mobile'
    },
    {
        short: 'sm',
        long: 'Tablet'
    },
    {
        short: 'md',
        long: 'Desktop'
    },
    {
        short: 'lg',
        long: 'Large Desktop'
    }
]
const classLayoutColumnOptions = (count, options) => {

    const obj = {}
    for (let i = 1; i <= count; i++) {

        for (let j = 0; j < colClasses.length; j++) {
            const col = colClasses[j]

            const enumA = []

            for (let k = 1; k < 13; k++) {
                enumA.push({
                    value: ` col-${col.short}-${k} `,
                    name: k
                })
            }

            obj[`c_${i - 1}_p_className@${col.short}`] = {
                fourthWidth: true,
                forceOverride:true,
                label: `Spalte ${i}: ${col.long}`,
                value: options[col.short] ? ` col-${col.short}-${options[col.short]} ` : ' ',
                tab: 'Responsive',
                enum: enumA
            }
        }


        obj[`c_${i - 1}_p_className`] = {
            fullWidth: true,
            label: 'Klasse Spalte ' + i,
            value: ''
        }
    }
    return obj
}

const classIconListOptions = key => ({
    [`${key}className@icons`]: {
        label: 'Icon',
        tab: DEFAULT_TAB,
        enum: [
            {
                value: '',
                name: 'Keine'
            },
            {
                value: ' icon-phone ',
                name: 'Telefon'
            },
            {
                value: ' icon-email ',
                name: 'Email'
            },
            {
                value: ' icon-pdf ',
                name: 'PDF'
            },
            {
                value: ' icon-click ',
                name: 'Click'
            },
            {
                value: ' icon-home ',
                name: 'Home'
            },
            {
                value: ' icon-pdf black-icon black ',
                name: 'PDF (schwarz)'
            },
            {
                value: ' icon-pdf push-icon-left black-icon black ',
                name: 'PDF rechts (schwarz)'
            },
            {
                value: ' icon-right black-icon black ',
                name: 'Pfeil (schwarz)'
            },
            {
                value: ' icon-right push-icon-left black-icon black ',
                name: 'Pfeil rechts (schwarz)'
            }
        ]
    }
})

const classTextOptions = key => ({
    [`${key}className@text`]: {
        label: 'Styling',
        tab: DEFAULT_TAB,
        enum: [
            {
                value: '',
                name: 'Keine'
            },
            {
                value: ' h1 ',
                name: 'Überschrift 1'
            },
            {
                value: ' h2 ',
                name: 'Überschrift 2'
            },
            {
                value: ' h3 ',
                name: 'Überschrift 3'
            },
            {
                value: ' h4 ',
                name: 'Überschrift 4'
            },
            {
                value: ' h5 ',
                name: 'Überschrift 5'
            },
            {
                value: ' h6 ',
                name: 'Überschrift 6'
            },
            {
                value: ' strong ',
                name: 'Fett'
            },
            {
                value: ' small ',
                name: 'Klein'
            }
        ]
    }
})

const classLayoutOptions = key => ({
    [`${key}className@space`]: {
        label: 'Abstand zwischen Spalten',
        tab: DEFAULT_TAB,
        tabPosition: 0,
        enum: [
            {
                value: ' row-space-2 ',
                name: 'Klein'
            },
            {
                value: ' row-space-4 ',
                name: 'Mittel'
            },
            {
                value: ' row-space-6 ',
                name: 'Gross'
            }
        ]
    },
    [`${key}className@align`]: {
        label: 'Ausrichtung',
        tab: DEFAULT_TAB,
        enum: [
            {
                value: '',
                name: 'Ohne'
            },
            {
                value: ' vcenter ',
                name: 'Vertikal zentriert'
            },
            {
                value: ' vend ',
                name: 'Vertikal end'
            }
        ]
    },
    [`${key}className@order`]: {
        label: 'Anordnung',
        tab: DEFAULT_TAB,
        enum: [
            {
                value: '',
                name: 'Ohne'
            },
            {
                value: ' row-sm-reverse ',
                name: 'Auf Mobile umkehren'
            }
        ]
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
    },
    [`${key}style_padding`]: {
        label: 'Innen abstand',
        tab: MARGIN_TAB
    }
})

const alignmentOptions = key => ({
    [`${key}style_textAlign`]: {
        label: _t('elements.alignment'),
        enum: [
            {
                name: _t('elements.left'),
                value: 'left'
            },
            {
                name: _t('elements.right'),
                value: 'right'
            },
            {
                name: _t('elements.center'),
                value: 'center'
            },
        ],
        tab: DEFAULT_TAB
    }
})

const eventOptions = key => ({
    [`${key}onClick`]: {
        fullWidth: true,
        uitype: 'json',
        type: 'Object',
        label: 'onClick',
        tab: EVENT_TAB
    },
    [`${key}onChange`]: {
        fullWidth: true,
        uitype: 'json',
        type: 'Object',
        label: 'onChange',
        tab: EVENT_TAB
    }
})

const condition = () => ({
    $is: {
        label: 'Bedingung',
        tab: VISIBILITY_TAB,
        fullWidth:true
    }
})

const styleIndented = () => ({
    [`p_className@style`]: {
        label: 'Style',
        tab: DEFAULT_TAB,
        enum: [
            {
                value: '',
                name: 'Keine'
            },
            {
                value: ' indented ',
                name: 'Eingerückt (mittel)'
            },
            {
                value: ' indented-small ',
                name: 'Eingerückt (klein)'
            },
            {
                value: ' indented-large ',
                name: 'Eingerückt (gross)'
            }
        ]
    },
})




const sizeOptions = key => ({
    [`${key}width`]: {
        label: _t('elements.width'),
        tab: MARGIN_TAB,
        helperText: '${this.c_0_p_height && c_0_p_src[_app_.lang][0].info.width?_t("elements.aspectRatio",{height:c_0_p_height,width:(c_0_p_src[_app_.lang][0].info.width/c_0_p_src[_app_.lang][0].info.height*c_0_p_height).toFixed(2)}):""}'
    },
    [`${key}height`]: {
        label: _t('elements.height'),
        tab: MARGIN_TAB,
        helperText: '${this.c_0_p_width && c_0_p_src[_app_.lang][0].info.height?_t("elements.aspectRatio",{width:c_0_p_width,height:(c_0_p_src[_app_.lang][0].info.height/c_0_p_src[_app_.lang][0].info.width*c_0_p_width).toFixed(2)}):""}'
    }
})

const imgFigureOptions = key => ({
    [`${key}wrapper`]: {
        label: 'Bild mit Beschreibung (Figure / Zoom)',
        type: 'Boolean',
        defaultValue:false,
        tab: MISC_TAB
    },
    [`${key}figureClassName`]: {
        label: 'Figure Klassenname',
        tab: MISC_TAB
    },
    [`${key}caption`]: {
        label: _t('elements.description'),
        uitype: 'html',
        fullWidth: true,
        localized: true,
        localizedFallback: true,
        tab: MISC_TAB
    }
})

const baseElements = [
    {
        subHeader: _t('elements.general'),
        tagName: 'SmartImage',
        icon: 'image',
        name: _t('elements.key.image'),
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
                label: 'Bild auswählen',
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
                label: 'Bild Url eingeben',
                tab: DEFAULT_TAB
            },
            p_alt: {
                fullWidth: true,
                label: 'Alt text',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            'p_style@align': {
                label: 'Ausrichtung',
                enum: [
                    {
                        name: 'Keine',
                        value: {float: ''}
                    },
                    {
                        name: 'Rechts',
                        value: {float: 'right'}
                    },
                    {
                        name: 'Links',
                        value: {float: 'left'}
                    },
                    {
                        name: 'Zentriert',
                        value: {marginLeft: 'auto', marginRight: 'auto', display: 'block'}
                    },
                ],
                tab: DEFAULT_TAB
            },
            ...imgFigureOptions('p_'),
            ...classOptions('p_'),
            ...imageOptions('p_'),
            ...sizeOptions('p_'),
            ...lazyImageOptions('$observe_')
        }
    },
    {
        tagName: 'div',
        name: 'Video',
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
                label: 'Standbild',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                projection: MEDIA_PROJECTION,
                tabPosition: 1,
                tab: 'Videooptionen',
                template: '${this.context._id?_app_.config.UPLOAD_URL+\'/\'+_id+\'/-/\'+name:\'\'}',
            },
            $set_posterSrc: {
                fullWidth: true,
                value: '',
                label: 'Standbild Url',
                tab: 'Videooptionen',
            },
            $set_controls: {
                type: 'Boolean',
                newLine: true,
                label: 'Videosteuerung',
                value: true,
                tab: 'Videooptionen'
            },
            $set_autoplay: {
                type: 'Boolean',
                newLine: true,
                label: 'Automatisch Wiedergabe',
                value: true,
                tab: 'Videooptionen'
            },
            $set_loop: {
                type: 'Boolean',
                newLine: true,
                label: 'Endlose Schleife',
                value: true,
                tab: 'Videooptionen'
            },
            $set_muted: {
                type: 'Boolean',
                newLine: true,
                label: 'Stummgeschaltet',
                value: true,
                tab: 'Videooptionen'
            },
            $set_preload: {
                fullWidth: true,
                value: '',
                label: 'Vorladen',
                enum: [
                    {
                        name: 'Keine',
                        value: 'none'
                    },
                    {
                        name: 'Automatisch',
                        value: 'auto'
                    },
                    {
                        name: 'Metadata',
                        value: 'metadata'
                    }
                ],
                projection: MEDIA_PROJECTION,
                tab: 'Videooptionen'
            },
            $set_url: {
                fullWidth: true,
                value: '',
                label: 'Video',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=video',
                projection: MEDIA_PROJECTION,
                tabPosition: 0,
                tab: DEFAULT_TAB,
                template: '${this.context._id?\'<video \'+(_comp.$set.muted?\'muted \':\'\')+(_comp.$set.controls?\'controls \':\'\')+(_comp.$set.autoplay?\'autoplay \':\'\')+(_comp.$set.loop?\'loop \':\'\')+\'style="\'+_comp.$set.style+\'" preload="\'+_comp.$set.preload+\'" poster="\'+(_comp.$set.poster || \'\')+(_comp.$set.posterSrc || \'\')+\'"><source src="\'+_app_.config.UPLOAD_URL+\'/\'+_id+\'/-/\'+name+(_comp.$set.transcode?\'?transcode=\'+encodeURIComponent(_comp.$set.transcode):\'\')+\'" type="\'+mimeType+\'"/></video>\':\'\'}',
            },
            $set_yt: {
                fullWidth: true,
                value: '',
                label: 'Youtube',
                tab: DEFAULT_TAB,
                template: '${this.context.data?\'<iframe src="https://www.youtube-nocookie.com/embed/\'+data.match(/^(https?:\\/\\/)?((www\\.)?(youtube(-nocookie)?|youtube.googleapis)\\.com.*(v\\/|v=|vi=|vi\\/|e\\/|embed\\/|user\\/.*\\/u\\/\\d+\\/)|youtu\\.be\\/)([_0-9a-z-]+)/i)[7]+\'" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreencontrols></iframe>\':\'\'}'
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
        name: 'Screenshot',
        icon: 'screenshot',
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
                projection: MEDIA_PROJECTION,
                tab: 'Screenshot'
            },
            $set_url: {
                fullWidth: true,
                value: '',
                label: 'Screenshot von Url',
                tab: 'Screenshot'
            },
            $set_width: {
                fullWidth: true,
                value: '',
                label: 'Breite',
                tab: 'Screenshot'
            },
            $set_height: {
                fullWidth: true,
                value: '',
                label: 'Höhe',
                tab: 'Screenshot'
            },
            $set_padding: {
                fullWidth: true,
                value: '',
                label: 'Bildrand reduzieren',
                tab: 'Screenshot'
            },
            c_1_c: {
                label: 'Beschriftung',
                fullWidth: true,
                tab: 'Screenshot'
            },
            $set_islink: {
                type: 'Boolean',
                newLine: true,
                label: 'Verlinken',
                value: true,
                tab: 'Screenshot'
            },
            $set_timestamp: {
                uitype: 'timestamp',
                newLine: true,
                label: 'Neue Variante erzeugen',
                value: true,
                tab: 'Screenshot'
            },
            c_0_p_src: {
                readOnly: true,
                fullWidth: true,
                value: '',
                label: 'Final url',
                template: '/-/-/%7B%22screenshot%22%3A%7B%22url%22%3A%22${encodeURIComponent(_comp.$set.pdf?\'/core/pdfviewer?pdf=\'+_app_.config.UPLOAD_URL+\'/\'+_comp.$set.pdf[0]._id :_comp.$set.url)}%22%2C%22options%22%3A%7B%22height%22%3A${(_comp.$set.height || 1600)}%2C%22delay%22%3A15000%2C%22width%22%3A${(_comp.$set.width || 1200)}%2C%22padding%22%3A%22${(_comp.$set.padding?encodeURIComponent(_comp.$set.padding):0)}%22%2C%22timestamp%22%3A%22${(_comp.$set.timestamp || 0)}%22%7D%7D%7D',
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
        icon: 'collections',
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
                label: 'HTML Tag (SEO relevant)',
                enum: [
                    {
                        name: 'H1 (Überschrift 1)',
                        value: 'h1'
                    },
                    {
                        name: 'H2 (Überschrift 2)',
                        value: 'h2'
                    },
                    {
                        name: 'H3 (Überschrift 3)',
                        value: 'h3'
                    },
                    {
                        name: 'H4 (Überschrift 4)',
                        value: 'h4'
                    },
                    {
                        name: 'H5 (Überschrift 5)',
                        value: 'h5'
                    },
                    {
                        name: 'H6 (Überschrift 6)',
                        value: 'h6'
                    },
                    {
                        name: 'p (Paragraph)',
                        value: 'p'
                    },
                    {
                        name: 'div (Block)',
                        value: 'div'
                    },
                    {
                        name: 'span (Inline-Element)',
                        value: 'span'
                    },
                    {
                        name: 'strong',
                        value: 'strong'
                    },
                    {
                        name: 'small',
                        value: 'small'
                    },
                    {
                        name: 'time',
                        value: 'time'
                    },
                    {
                        name: 'label',
                        value: 'label'
                    }
                ]
            },
            p_for: {
                label: 'For',
                fullWidth: false,
                tab: DEFAULT_TAB,
                uistate: {
                    visible: 't==label'
                }
            },
            c: {
                label: 'Text',
                fullWidth: true,
                uitype: 'textarea',
                tab: DEFAULT_TAB
            },
            $toHtml: {
                label: 'Zeilenumbrüche behalten',
                fullWidth: true,
                type: 'Boolean',
                tab: DEFAULT_TAB
            },
            $c: {
                label: 'Text (HTML)',
                fullWidth: true,
                uitype: 'textarea',
                tab: EXTENDED_TAB,
                role: CAPABILITY_MANAGE_CMS_TEMPLATE
            },
            ...alignmentOptions('p_'),
            ...marginOptions('p_'),
            ...classTextOptions('p_'),
            ...classOptions('p_'),
            ...observeOptions(),
            ...condition(),
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
                richText:true,
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
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...marginOptions('p_')
        }
    },
    {
        tagName: 'Link',
        name: _t('elements.key.link'),
        icon: 'link',
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
            p_title: {
                fullWidth: true,
                value: '',
                placeholder: 'Linkbezeichnung',
                label: 'Linkbezeichnung (Optional für SEO)',
                tab: DEFAULT_TAB
            },
            ...classIconListOptions('p_'),
            p_target: {
                fullWidth: false,
                value: '',
                label: 'Target',
                enum: [
                    {
                        name: 'Im gleichen Fenster öffnen',
                        value: '_self'
                    },
                    {
                        name: 'Im neuen Fenster öffnen',
                        value: '_blank'
                    },
                    {
                        name: '_parent',
                        value: '_parent'
                    },
                    {
                        name: '_top',
                        value: '_top'
                    }
                ],
                tab: DEFAULT_TAB
            },
            ...classOptions('p_'),
            p_gotop: {
                fullWidth: true,
                defaultValue: true,
                type: 'Boolean',
                label: 'Scroll top',
                tab: DEFAULT_TAB
            },
            ...marginOptions('p_'),
            ...eventOptions('p_')
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
        name: _t('elements.key.imageLink'),
        icon: 'datasetLink',
        options: {
            c_0_p_src: {
                fullWidth: true,
                value: '',
                label: 'Bild',
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
                placeholder: 'Url eingeben',
                label: 'Url',
                localized: true,
                localizedFallback: true,
                tab: DEFAULT_TAB
            },
            p_title: {
                fullWidth: true,
                value: '',
                placeholder: 'Url Titel eingeben',
                label: 'Url Titel',
                localized: true,
                localizedFallback: true,
                tab: DEFAULT_TAB
            },
            c_1_c: {
                fullWidth: true,
                value: '',
                placeholder: 'Text eingeben',
                label: 'Text',
                tab: MISC_TAB
            },
            ['p_data-hover-text']: {
                fullWidth: true,
                value: '',
                placeholder: 'Mouseover text',
                label: 'Text hover',
                tab: MISC_TAB
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
                label: 'Scroll top',
                tab: DEFAULT_TAB
            },
            ...imgFigureOptions('c_0_p_'),
            ...invisibleOptions('p_'),
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...imageOptions('c_0_p_'),
            ...sizeOptions('c_0_p_'),
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
            $inlineEditor: {
                elementKey: 'documentLink'
            }
        },
        options: {
            ...trOptions('$inlineEditor_options_c_'),
            p_href: {
                fullWidth: true,
                value: '',
                label: 'Datei',
                uitype: 'type_picker',
                type: 'Media',
                projection: MEDIA_PROJECTION,
                template: '${_app_.config.UPLOAD_URL}/${_id}/-/${name}',
                tab: DEFAULT_TAB,
                tabPosition: 0
            },
            c: {
                fullWidth: true,
                value: '',
                label: 'Bezeichnung',
                tab: DEFAULT_TAB,
                template: '${this.context.data?this.context.data:(_comp.$original.p && _comp.$original.p.href && _comp.$original.p.href.length>0?_comp.$original.p.href[0].name:"Dokument")}'
            },
            ...marginOptions('p_'),
            ...classIconListOptions('p_'),
            ...classOptions('p_'),
            [`p_className@extension`]: {
                value: '',
                invisible: true,
                label: 'Datei Extension',
                tab: DEFAULT_TAB,
                template: 'file-ext-${_comp.$original.p && _comp.$original.p.href && _comp.$original.p.href.length>0?_comp.$original.p.href[0].name.split(".").pop():""}'
            }
        }
    },
    {
        tagName: 'hr', name: 'Trennlinie',
        icon: 'horizontalRule',
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
            ...classOptions('p_'),
            ...sizeOptions('p_style_')
        }
    },
    {
        tagName: 'section',
        name: 'Slideshow',
        icon: 'slideshow',
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
                    value: [],
                    chunkOptions: {
                        fill: {
                            data: {}
                        }
                    }
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
                                                        $c: '$.item{_e(_t(item.title))}'

                                                    },
                                                    {
                                                        $inlineEditor: false,
                                                        t: 'SmartImage',
                                                        p: {
                                                            caption: "$.item{_e(_t(item.text))}",
                                                            src: "$.item{_e(item.image)}"
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
                                            htmlFor: '__uid__$.slide{slide._index==0?this.scope.__sliderData.length-1:slide._index-1}'
                                        }
                                    },
                                    {
                                        $inlineEditor: false,
                                        t: 'label',
                                        p: {
                                            htmlFor: '__uid__$.slide{slide._index+1>=this.scope.__sliderData.length?0:slide._index+1}'
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
                    tab: 'Slides',
                    expandable: 'Slide',
                    fullWidth: true,
                    value: '',
                    label: 'Bild',
                    uitype: 'type_picker',
                    type: 'Media',
                    filter: 'mimeType=image',
                    projection: MEDIA_PROJECTION
                },
                link: {
                    tab: 'Slides',
                    label: 'Link',
                    fullWidth: true
                },
                title: {
                    tab: 'Slides',
                    label: 'Title',
                    fullWidth: true,
                    replaceBreaks: true,
                    uitype: 'textarea',
                    localized:true
                },
                text: {
                    tab: 'Slides',
                    expandable: false,
                    label: 'Text',
                    uitype: 'html',
                    localized:true
                }
            }
        },
        options: {
            ['p_data-slide-timeout']: {value: '7000', label: 'Anzeigezeit in ms pro Slide'},
            $set_0_chunk: {value: '1', label: 'Anzahl pro Seite'},
            $set_0_chunkOptions_randomize: {type: 'Boolean', value: '1', label: 'Slides zufällig sortieren'},
            ...classOptions('p_'),
            ...marginOptions('p_'),
            ...imageOptions('c_1_c_$for_c_c_1_$for_c_c_1_p_'),
            ...lazyImageOptions('c_1_c_$for_c_c_1_$for_c_c_1_$observe_'),
            ...invisibleOptions('p_')
        }
    },
    {
        tagName: 'p',
        icon: 'subject',
        name: _t('elements.key.p'),
        defaults: {
            $c: 'Paragraph',
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
            ...alignmentOptions('p_'),
            ...marginOptions('p_'),
            ...classTextOptions('p_'),
            ...classOptions('p_'),
            ...condition()
        }
    },
    {
        tagName: 'iframe',
        name: 'iFrame',
        icon: 'webAsset',
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
            ...marginOptions('p_'),
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
        icon: 'code',
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
        tagName: 'Redirect',
        name: _t('elements.key.redirect'),
        icon: 'replay',
        options: {
            p_to: {
                fullWidth: true,
                value: '',
                label: 'Link (relativ oder absolut)'
            }
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'redirect'
            },
            p: {
                ['data-element-key']: 'redirect'
            }
        }
    },
    {
        tagName: 'input',
        name: _t('elements.key.formElement'),
        icon: 'input',
        options: {
            t: {
                tabPosition: 0,
                tab: DEFAULT_TAB,
                label: 'Tag',
                defaultValue:'input',
                enum: ['input','textarea','button']
            },
            p_type: {
                tab: DEFAULT_TAB,
                label: 'type',
                enum: ['text','number','email'],
                uistate: {
                    visible: 't==input'
                }
            },
            p_name:{
                label: 'Name',
                tab: DEFAULT_TAB
            },
            p_placeholder:{
                label: 'Placeholder',
                tab: DEFAULT_TAB
            },
            ...classOptions('p_'),
            c:{
                label: 'Button label',
                tab: DEFAULT_TAB,
                uistate: {
                    visible: 't==button'
                }
            },
            p_binding:{
                defaultValue:true,
                type:'Boolean',
                label: 'Binding',
                tab: DEFAULT_TAB
            },
            ...eventOptions('p_')
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'formElement'
            },
            p: {
                ['data-element-key']: 'formElement'
            }
        }
    },
    {
        subHeader: 'Layout Elemente',
        tagName: 'div',
        icon: 'grid',
        name: _t('elements.key.grid'),
        defaults: {
            allowDrop: true,
            $inlineEditor: {
                elementKey: 'grid'
            },
            p: {
                ['data-element-key']: 'grid'
            },
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
    {
        tagName: 'Row',
        icon: 'pause',
        name: _t('elements.key.layout-1-2'),
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
            ...marginOptions('p_'),
            ...classLayoutColumnOptions(2, {lg: 6, md: 6, sm: 6, xs: 12}),
            ...classLayoutOptions('p_'),
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    },
    {
        tagName: 'Row',
        name: _t('elements.key.layout-1-3'),
        icon: 'viewColum',
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
            ...marginOptions('p_'),
            ...classLayoutColumnOptions(3, {lg: 4, md: 4, sm: 4, xs: 12}),
            ...classLayoutOptions('p_'),
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    },
    {
        tagName: 'Row',
        name: _t('elements.key.layout-1-4'),
        icon: 'viewColum',
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
            ...marginOptions('p_'),
            ...classLayoutColumnOptions(4, {lg: 3, md: 3, sm: 3, xs: 6}),
            ...classLayoutOptions('p_'),
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    },
    /*{
        tagName: 'Row',
        name: 'Layout 1/5',
        icon: 'viewColum',
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
            ...marginOptions('p_'),
            ...classLayoutColumnOptions(5, {md:'1-5', sm:4, xs:6}),
            ...classLayoutOptions('p_'),
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    },*/
    {
        tagName: 'Row',
        name: _t('elements.key.layout-1-6'),
        icon: 'viewColum',
        defaults: {
            $inlineEditor: {
                elementKey: 'layout-1-6'
            },
            p: {
                ['data-element-key']: 'layout-1-6'
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
                },
                {
                    $inlineEditor: {elementKey: 'column', menu: {addBelow: false}},
                    t: 'Col',
                    c: []
                }
            ]
        },
        options: {
            ...marginOptions('p_'),
            ...classLayoutColumnOptions(6, {md: 2, sm: 3, xs: 6}),
            ...classLayoutOptions('p_'),
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    },
    {
        tagName: 'Col',
        name: 'Spalte',
        icon: 'viewColum',
        conditions: {
            parent: ['layout-1-5']
        },
        defaults: {
            $inlineEditor: {
                elementKey: 'column'
            }
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
        options: {
            t: {
                value: '',
                label: 'Tag Name'
            },
            p_href: {
                value: '',
                label: 'Href'
            },
            $set_image_mobileImage: {
                fullWidth: true,
                value: '',
                label: 'Hintergrundbild Mobile (optional)',
                uitype: 'type_picker',
                type: 'Media',
                filter: 'mimeType=image',
                projection: MEDIA_PROJECTION
            },
            $set_image_mobileBreak: {
                value: '',
                label: 'Mobile Breakpoint in Pixel'
            },
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
                projection: MEDIA_PROJECTION,
                template: '${_comp?.$set?.image?.options?.background?_comp.$set.image.options.background:""}' +
                    '${this.context._id?' +
                    '(_comp?.$set?.image?.options?.background?\', \':\'\')' +
                    '+\'url(\\\'\'+_app_.config.UPLOAD_URL+\'/${window.innerWidth>\'+(_comp?.$set?.image?.mobileBreak || 767)+\'?\\\'\'+_id+\'\\\':\\\'\'+(_comp?.$set?.image?.mobileImage?_comp.$set.image.mobileImage[0]._id:_id)+\'\\\'}/-/\'+encodeURIComponent(name)+\'?format=\'+(_comp.$set?.image?.options?.webp?\'webp\':\'\')' +
                    '+\'&quality=\'+(_comp?.$set?.image?.options?.quality || \'\')' +
                    '+\'&width=\'+(_comp?.$set?.image?.options?.resize?.width || \'\')' +
                    '+\'&height=\'+(_comp?.$set?.image?.options?.resize?.height || \'\')' +
                    '+(_comp?.$set?.image?.options?.flip?\'&flip=\'+_comp?.$set?.image?.options?.flip: \'\')' +
                    '+(_comp?.$set?.image?.options?.flop?\'&flop=\'+_comp?.$set?.image?.options?.flop: \'\')' +
                    '+(_comp?.$set?.image?.options?.noenlarge?\'&noenlarge=true\': \'\')' +
                    '+(_comp?.$set?.image?.options?.position?\'&position=\'+_comp?.$set?.image?.options?.position: \'\')+\'\\\')\':\'\'}',
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
            p_style_backgroundRepeat: {
                value: '',
                label: 'Wiederholung',
                enum: [
                    {
                        name: 'Keine',
                        value: 'no-repeat'
                    },
                    {
                        name: 'Beidseitig',
                        value: 'repeat'
                    }
                ],
                tab: DEFAULT_TAB
            },
            ...invisibleOptions('p_'),
            ...classLinkStylingOptions('p_'),
            ...classOptions('p_'),
            ...marginOptions('p_'),
            ...observeOptions()
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
        tagName: 'section',
        name: 'Timeline',
        icon: "timeline",
        defaults: {
            $inlineEditor: {
                elementKey: 'timeline',
                allowDrop: false
            },
            p: {
                ['data-element-key']: 'timeline'
            },
            $set: {
                value: []
            },
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
                    tab: 'Einträge',
                    label: 'Element hinzufügen'
                },
                title: {
                    expandable: "Element",
                    tab: 'Einträge',
                    label: 'Title',
                    fullWidth: true
                },
                text: {
                    tab: 'Einträge',
                    expandable: false,
                    label: 'Text',
                    uitype: 'html',
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
        name: 'Accordion',
        icon: 'horizontalSplit',
        defaults: {
            $inlineEditor: {
                elementKey: 'accordion',
                allowDrop: false
            },
            p: {
                ['data-element-key']: 'accordion'
            },
            $set: {
                value: []
            },
            c: {
                t: 'Cms',
                $inlineEditor: false,
                p: {
                    slug: 'core/accordion',
                    props: {
                        title: '',
                        items: []
                    }
                }
            }
        },
        groupOptions: {
            c_p_props_items: {
                _addButton: {
                    tab: 'Einträge',
                    label: 'Element hinzufügen'
                },
                title: {
                    expandable: 'Element',
                    tab: 'Einträge',
                    label: 'Überschrift',
                    fullWidth: true,
                    localized: true,
                    localizedFallback: true
                },
                img: {
                    fullWidth: true,
                    label: 'Bild',
                    uitype: 'type_picker',
                    type: 'Media',
                    filter: 'mimeType=image',
                    projection: MEDIA_PROJECTION
                },
                html: {
                    tab: 'Einträge',
                    expandable: false,
                    localized: true,
                    localizedFallback: true,
                    label: 'Text',
                    uitype: 'html',
                }
            }
        },
        options: {
            /*...trOptions('$set_'),*/
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'div',
        name: 'Data Container',
        icon: 'storage',
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
                label: 'Type',
                uitype: 'select',
                enum: '$TYPES'
            },
            $inlineEditor_picker_baseFilter: {
                label: 'Filter'
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
            $inlineEditor: {
                elementKey: 'Cms'
            },
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
            p_slug: {
                tab: DEFAULT_TAB,
                label: 'Slug (deprecated)'
            },
            ...condition(),
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...observeOptions()
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
        },
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
            p: {
                ['data-element-key']: 'custom'
            }
        },
        options: {
            t: {
                label: 'Tag'
            },
            ...styleIndented(),
            ...condition(),
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    },
    {
        tagName: 'div',
        name: 'Query',
        icon: 'search',
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
                role: CAPABILITY_MANAGE_CMS_TEMPLATE,
                tab: 'Data',
                label: 'Data Resolver',
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
                        },
                    ],
                    l: 1000,
                    f: '_id>${ObjectId.createFromTime(Date.now()/1000-60*60*24*50)}',
                    returnMeta: false,
                    removeDefinition: false
                }
            },
            c_$for_d: {
                role: CAPABILITY_MANAGE_CMS_TEMPLATE,
                tab: 'Data',
                label: 'Data source',
                value: 'data.__uid__.results'
            },
            c_$for_c_c: {
                role: CAPABILITY_MANAGE_CMS_TEMPLATE,
                tab: 'Template',
                label: 'Template',
                uitype: 'editor',
                type: 'Object',
                value: {
                    t: 'Row.row-space-4.entry',
                    '$inlineEditor': {
                        mode: 'source',
                        menuTitle: {
                            source: '$.loop{loop.definition.name} bearbeiten',
                            sourceClone: '$.loop{loop.definition.name} kopieren',
                            sourceRemove: '$.loop{loop.definition.name} löschen'
                        },
                        menu: {
                            remove: false,
                            clone: false,
                            clipboard: false,
                            addBelow: false
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
                            p: {
                                className: 'col-xs-12 col-sm-6 col-md-8 col-lg-8'
                            },
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
                            p: {
                                className: 'col-xs-12 col-sm-6 col-md-4 col-lg-4'
                            },
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
                                                    quality: "90",
                                                    resize: {
                                                        width: 600,
                                                        height: 500
                                                    },
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
                tab: 'Template',
                label: 'Template (can be used alternatively)',
                value: ''
            },
            ...condition(),
            ...marginOptions('p_'),
            ...classOptions('p_')
        }
    },
    {
        tagName: 'div',
        name: 'Web',
        icon: 'html',
        defaults: {
            $inlineEditor: {
                allowDrop: true,
                elementKey: 'web'
            },
            p: {
                ['data-element-key']: 'web'
            }
        },
        options: {
            t: {
                label: 'Tag'
            },
            $c: {
                tab: DEFAULT_TAB,
                label: 'Plain HTML',
                fullWidth:true,
                uitype:'editor'
            },
            ...styleIndented(),
            ...condition(),
            ...marginOptions('p_'),
            ...classOptions('p_'),
            ...invisibleOptions('p_'),
            ...observeOptions()
        }
    },

    /*{
        tagName: 'QuillEditor',
        icon: 'textFormat',
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
    }*/
]

let elementsMap, elementsMapAdvanced

const getJsonDomElements = (value, options) => {
    if (value === 'customElement') {
        return {}
    }
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

export const replaceUidPlaceholder = (comp) => {
    const uid = 'genid_' + Math.random().toString(36).substr(2, 9)
    return JSON.parse(JSON.stringify(comp).replace(/__uid__/g, uid))
}

const createElementByKeyFromList = (key, elementList) => {
    let item
    for (let i = 0; i < elementList.length; i++) {
        const comp = elementList[i]
        if (key === comp.defaults.$inlineEditor.elementKey) {
            // replace __uid__ placeholder
            item = replaceUidPlaceholder(comp)
            break
        }
    }
    if (item && item.groupOptions) {
        Object.keys(item.groupOptions).forEach(key => {
            item.options['!' + key + '!add'] = {
                uitype: 'button',
                group: item.groupOptions[key],
                key,
                newLine: true,
                label: 'Hinzufügen',
                tab: 'Slides',
                tabPosition: 0,
                action: 'add',
                style: {marginBottom: '2rem'},
                ...item.groupOptions[key]._addButton
            }
            Object.keys(item.groupOptions[key]).forEach(fieldKey => {
                if (fieldKey !== '_addButton') {
                    item.options['!' + key + '!' + fieldKey + '!0'] = item.groupOptions[key][fieldKey]
                }
            })
        })
    }
    return item
}

export {getJsonDomElements, createElementByKeyFromList, MEDIA_PROJECTION}
