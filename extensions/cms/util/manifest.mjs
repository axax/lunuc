
export const createManifest = ()=>{

    const loc = window.location,
        ori = loc.origin+'/favicon-',
        host = loc.host.replace(/^www./,''),
        type = 'image/png',
        size512x512 = '512x512',
        color = '#f9f9fb'

    return {
        short_name: `${host.replace(/.[a-z]{2,3}$/,'')}`,
        name: document.title,
        description: `This is the app version of ${host}`,
        display: 'standalone',
        theme_color: color,
        background_color: color,
        orientation: 'any',
        scope: ori + loc.pathname,
        icons: [
            { src: `${ori}192x192.png`, sizes: '192x192', type },
            { src: `${ori}${size512x512}.png`, sizes: size512x512, type },
            { src: `${ori}maskable.png`, sizes: size512x512, type, purpose: 'maskable' }
        ],
        start_url: loc.href
    }
}