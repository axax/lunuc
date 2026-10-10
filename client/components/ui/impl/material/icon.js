import React from 'react'

/*
 * The icon map (iconMap.js) contains ~100 svg icons. It is only loaded when an icon is rendered for the
 * first time. getIconByKey stays synchronous: it returns a stable wrapper component per key which
 * renders an empty placeholder of icon size until the map is available.
 * Keep ICON_KEYS in sync with iconMap.js (a warning is logged in dev mode if not).
 */
const ICON_KEYS = new Set(["source", "delete", "refresh", "magic", "translate", "displaySetting", "add", "sync", "preview", "logout", "home", "build", "settings", "account", "edit", "drive", "folder", "subject", "chat", "launch", "web", "cart", "image", "done", "view", "module", "label", "business", "event", "school", "schedule", "shop", "beach", "group", "thumbup", "component", "train", "traffic", "mail", "member", "money", "store", "barchart", "house", "work", "cafe", "sport", "accessible", "politics", "boat", "filter", "casino", "book", "save", "search", "backup", "video", "screenshot", "collections", "format", "html", "link", "datasetLink", "attachment", "horizontalRule", "slideshow", "webAsset", "viewColum", "wallpaper", "wysiwyg", "code", "timeline", "horizontalSplit", "storage", "widgets", "functions", "textFormat", "pause", "css", "js", "history", "notification", "support", "devices", "upload", "grid", "replay", "language", "google", "shield", "fingerprint", "highlight", "tree", "qrcode", "input", "addQueue", "folderZip", "addList", "editList", "visibility", "visibilityOff", "assignment", "download", "doc", "contentCut", "layers", "autoAwesome", "approval"])

let iconMap = null, iconMapPromise = null
const listeners = new Set()

const loadIconMap = () => {
    if (!iconMapPromise) {
        iconMapPromise = import(/* webpackChunkName: "icons" */ './iconMap').then(module => {
            iconMap = module.default
            if (process.env.NODE_ENV !== 'production') {
                const missing = Object.keys(iconMap).filter(key => !ICON_KEYS.has(key))
                if (missing.length > 0) {
                    console.warn('icon.js: add keys to ICON_KEYS', missing)
                }
            }
            listeners.forEach(fn => fn())
            listeners.clear()
        })
    }
    return iconMapPromise
}

const placeholderStyle = {display: 'inline-block', width: '1em', height: '1em', fontSize: '1.5rem', flexShrink: 0}

const wrappers = {}
const createLazyIcon = (key) => {
    const LazyIcon = React.forwardRef((props, ref) => {
        const [, forceUpdate] = React.useReducer(x => x + 1, 0)
        React.useEffect(() => {
            if (!iconMap) {
                listeners.add(forceUpdate)
                loadIconMap()
                return () => listeners.delete(forceUpdate)
            }
        }, [])
        if (iconMap && iconMap[key]) {
            const Icon = iconMap[key]
            return <Icon ref={ref} {...props}/>
        }
        const style = props.fontSize === 'small' ? {...placeholderStyle, fontSize: '1.25rem'} :
            props.fontSize === 'large' ? {...placeholderStyle, fontSize: '2.1875rem'} : placeholderStyle
        return <span ref={ref} className={props.className} style={style}/>
    })
    LazyIcon.displayName = 'LazyIcon(' + key + ')'
    LazyIcon.muiName = 'SvgIcon'
    return LazyIcon
}

export const getIconByKey = (key, defaultIcon) => {
    if (key && key.constructor !== String) {
        return defaultIcon || key
    }
    if (iconMap) {
        return iconMap[key] || defaultIcon
    }
    if (ICON_KEYS.has(key)) {
        return wrappers[key] || (wrappers[key] = createLazyIcon(key))
    }
    return defaultIcon
}

export const preloadIcons = loadIconMap
