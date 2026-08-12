/**
 * Template strings used by the CMS element definitions.
 *
 * These are evaluated by the lunuc template engine at runtime, NOT by JS.
 * They were inlined in the element tree before, where the quote escaping made
 * them practically unreadable and unreviewable. Keep them verbatim.
 */

/** <video> markup built from the $set options of the video element */
export const VIDEO_TAG_TEMPLATE = [
    '${this.context._id?',
    "'<video '",
    "+(_comp.$set.muted?'muted ':'')",
    "+(_comp.$set.controls?'controls ':'')",
    "+(_comp.$set.autoplay?'autoplay ':'')",
    "+(_comp.$set.loop?'loop ':'')",
    '+\'style="\'+_comp.$set.style',
    '+\'" preload="\'+_comp.$set.preload',
    '+\'" poster="\'+(_comp.$set.poster || \'\')+(_comp.$set.posterSrc || \'\')',
    '+\'"><source src="\'+_app_.config.UPLOAD_URL+\'/\'+_id+\'/-/\'+name',
    "+(_comp.$set.transcode?'?transcode='+encodeURIComponent(_comp.$set.transcode):'')",
    '+\'" type="\'+mimeType+\'"/></video>\'',
    ":''}"
].join('')

/** youtube-nocookie iframe, id extracted from any common youtube url form */
export const YOUTUBE_TAG_TEMPLATE = '${this.context.data?\'<iframe src="https://www.youtube-nocookie.com/embed/\'+data.match(/^(https?:\\/\\/)?((www\\.)?(youtube(-nocookie)?|youtube.googleapis)\\.com.*(v\\/|v=|vi=|vi\\/|e\\/|embed\\/|user\\/.*\\/u\\/\\d+\\/)|youtu\\.be\\/)([_0-9a-z-]+)/i)[7]+\'" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreencontrols></iframe>\':\'\'}'

/** url of the generated screenshot (url encoded json options in the path) */
export const SCREENSHOT_SRC_TEMPLATE = `/-/-/%7B%22screenshot%22%3A%7B%22url%22%3A%22$\{encodeURIComponent(_comp.$set.pdf?'/core/pdfviewer?preview=true&pdf='+_app_.config.UPLOAD_URL+'/'+_comp.$set.pdf[0]._id :_comp.$set.url)}%22%2C%22options%22%3A%7B%22height%22%3A$\{(_comp.$set.height || 1600)}%2C%22delay%22%3A15000%2C%22width%22%3A$\{(_comp.$set.width || 1200)}%2C%22padding%22%3A%22$\{(_comp.$set.padding?encodeURIComponent(_comp.$set.padding):0)}%22%2C%22timestamp%22%3A%22$\{(_comp.$set.timestamp || 0)}%22%7D%7D%7D/$\{_comp.$set.pdf[0].name || 'screenshot'}.png`

/**
 * background-image incl. optional gradient, mobile variant and image pipeline
 * params (format/quality/resize/flip/flop/noenlarge/position)
 */
export const BACKGROUND_IMAGE_TEMPLATE =
    '${_comp?.$set?.image?.options?.background?_comp.$set.image.options.background:""}' +
    '${this.context._id?' +
    '(_comp?.$set?.image?.options?.background?\', \':\'\')' +
    '+\'url(\\\'\'+_app_.config.UPLOAD_URL+\'/${window.innerWidth>\'+(_comp?.$set?.image?.mobileBreak || 767)+\'?\\\'\'+_id+\'\\\':\\\'\'+(_comp?.$set?.image?.mobileImage?_comp.$set.image.mobileImage[0]._id:_id)+\'\\\'}/-/\'+encodeURIComponent(name)+\'?format=\'+(_comp.$set?.image?.options?.webp?\'webp\':\'\')' +
    '+\'&quality=\'+(_comp?.$set?.image?.options?.quality || \'\')' +
    '+\'&width=\'+(_comp?.$set?.image?.options?.resize?.width || \'\')' +
    '+\'&height=\'+(_comp?.$set?.image?.options?.resize?.height || \'\')' +
    '+(_comp?.$set?.image?.options?.flip?\'&flip=\'+_comp?.$set?.image?.options?.flip: \'\')' +
    '+(_comp?.$set?.image?.options?.flop?\'&flop=\'+_comp?.$set?.image?.options?.flop: \'\')' +
    '+(_comp?.$set?.image?.options?.noenlarge?\'&noenlarge=true\': \'\')' +
    '+(_comp?.$set?.image?.options?.position?\'&position=\'+_comp?.$set?.image?.options?.position: \'\')+\'\\\')\':\'\'}'

/** poster image url of the video element */
export const VIDEO_POSTER_TEMPLATE = '${this.context._id?_app_.config.UPLOAD_URL+\'/\'+_id+\'/-/\'+name:\'\'}'

/** file url of the document link element */
export const DOCUMENT_HREF_TEMPLATE = '${_app_.config.UPLOAD_URL}/${_id}/-/${name}'

/** label of the document link, falls back to the file name */
export const DOCUMENT_LABEL_TEMPLATE = '${this.context.data?this.context.data:(_comp.$original.p && _comp.$original.p.href && _comp.$original.p.href.length>0?_comp.$original.p.href[0].name:"Dokument")}'

/** css class carrying the file extension, e.g. file-ext-pdf */
export const DOCUMENT_EXTENSION_TEMPLATE = 'file-ext-${_comp.$original.p && _comp.$original.p.href && _comp.$original.p.href.length>0?_comp.$original.p.href[0].name.split(".").pop():""}'
