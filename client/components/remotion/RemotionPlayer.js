import React, {useEffect, useRef, useState} from 'react'
import {lazy} from '../Async'

// Remotion itself (player, remotion, htm) lives in its own "remotion" chunk and is
// only loaded when a player gets close to the viewport. This wrapper stays in the
// main bundle: it reserves the space (no layout jump) and does the lazy loading.
const RemotionPlayerImpl = lazy(() => import(/* webpackChunkName: "remotion" */ './RemotionPlayerImpl'), {asyncKey: 'RemotionPlayerImpl'})

const PLAYER_PROPS = ['composition', 'code', 'inputProps', 'durationInFrames', 'fps', 'controls', 'loop', 'autoPlay',
    'clickToPlay', 'muted', 'name', 'scrollSync', 'scrollTarget', 'acknowledgeRemotionLicense', 'playerStyle']

/*
 * CMS usage:
 * { "t": "RemotionPlayer", "p": { "composition": "Intro", "durationInFrames": 120, "inputProps": {"title": "Hallo"} } }
 *
 * composition  name of a factory in _app_.remotionCompositions (defined in the page script)
 * code         alternative: the factory as a source string, e.g. "({html, useCurrentFrame}) => (props) => html`...`"
 * width/height composition size in px (default 1280x720), the player scales to the container width
 * scrollSync   true: the frame follows the scroll position instead of playing (scrollytelling)
 * scrollTarget css selector of the element whose scroll progress drives the frame (default: the player itself)
 * name         registers the PlayerRef as _app_.remotionPlayers[name] (seekTo, play, pause, ... from the page script)
 * lazyLoad     false: load immediately instead of when visible
 */
const RemotionPlayer = (props) => {
    const {width = 1280, height = 720, lazyLoad = true, className, style, id} = props
    const ref = useRef(null)
    const [visible, setVisible] = useState(() => !lazyLoad || typeof window === 'undefined' || !window.IntersectionObserver)

    useEffect(() => {
        if (visible || !ref.current) {
            return
        }
        const io = new IntersectionObserver(entries => {
            if (entries.some(e => e.isIntersecting)) {
                setVisible(true)
                io.disconnect()
            }
        }, {rootMargin: '300px'})
        io.observe(ref.current)
        return () => io.disconnect()
    }, [visible])

    const domProps = {}, playerProps = {}
    Object.keys(props).forEach(key => {
        if (key.startsWith('data-')) {
            domProps[key] = props[key]
        } else if (PLAYER_PROPS.includes(key)) {
            playerProps[key] = props[key]
        }
    })

    return <div ref={ref} id={id} {...domProps}
                className={'remotion-player' + (className ? ' ' + className : '')}
                style={{position: 'relative', width: '100%', aspectRatio: `${width} / ${height}`, ...style}}>
        {visible && !_app_.ssr && <RemotionPlayerImpl width={Number(width)} height={Number(height)} {...playerProps}/>}
    </div>
}

export default RemotionPlayer
