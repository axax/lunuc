import React, {useEffect, useMemo, useRef, useState} from 'react'
import {Player} from '@remotion/player'
import {compileCode, createComponent} from './factory'

// Compositions are written in the page script (no build). A composition is a factory
// that receives React, htm and the remotion API and returns the React component:
//
//   _app_.remotionCompositions = _app_.remotionCompositions || {}
//   _app_.remotionCompositions.Intro = ({html, useCurrentFrame, interpolate, AbsoluteFill}) =>
//       ({title}) => html`<${AbsoluteFill}>...<//>`
//
// The same factory source can be passed as string ("code" prop) - the server render
// (renderRemotionVideo) uses exactly this form.

const resolveFactory = ({composition, code}) => {
    if (typeof composition === 'function') {
        return composition
    }
    if (code) {
        return compileCode(code)
    }
    const factory = _app_.remotionCompositions && _app_.remotionCompositions[composition]
    if (!factory) {
        throw new Error(composition
            ? `composition "${composition}" not found in _app_.remotionCompositions - define it in the client "Script" of the page (not in "Server Script"), e.g. _app_.remotionCompositions = _app_.remotionCompositions || {}; _app_.remotionCompositions.${composition} = ({html, useCurrentFrame}) => (props) => html\`...\``
            : 'RemotionPlayer needs a "composition" name or "code"')
    }
    return factory
}

const ErrorBox = ({error}) => <div style={{
    position: 'absolute', inset: 0, overflow: 'auto', padding: '1rem', boxSizing: 'border-box',
    background: '#fff4f4', color: '#a00', font: '13px/1.4 monospace', whiteSpace: 'pre-wrap'
}}>RemotionPlayer: {String(error && (error.message || error))}</div>

class ErrorBoundary extends React.Component {
    state = {error: null}

    static getDerivedStateFromError(error) {
        return {error}
    }

    componentDidCatch(error) {
        console.error('RemotionPlayer', error)
    }

    render() {
        return this.state.error ? <ErrorBox error={this.state.error}/> : this.props.children
    }
}

let componentCounter = 0

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v

// nearest scrolling ancestor (e.g. the preview pane of the cms editor), null = window
const getScrollParent = (el) => {
    for (let node = el && el.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
        const {overflowY} = getComputedStyle(node)
        if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
            return node
        }
    }
    return null
}

const RemotionPlayerImpl = ({
                                composition, code, inputProps, width, height, durationInFrames = 150, fps = 30,
                                controls, loop, autoPlay, clickToPlay, muted, name, scrollSync, scrollTarget,
                                acknowledgeRemotionLicense, playerStyle
                            }) => {
    const wrapperRef = useRef(null)
    const playerRef = useRef(null)
    const duration = Math.max(1, Math.round(Number(durationInFrames) || 150))
    const frameRate = Math.max(1, Number(fps) || 30)

    // factory → component; a new factory (page script changed) yields a new component
    let factoryError = null, factory = null
    try {
        factory = resolveFactory({composition, code})
    } catch (e) {
        factoryError = e
    }

    // the page script may register the composition after the player rendered (other
    // render order, script of a nested Cms component): look again for a few seconds
    const [, setRetry] = useState(0)
    const missing = !!factoryError && !code && !!composition
    useEffect(() => {
        if (!missing) {
            return
        }
        let tries = 0
        const timer = setInterval(() => {
            tries++
            if ((_app_.remotionCompositions && _app_.remotionCompositions[composition]) || tries > 25) {
                clearInterval(timer)
                setRetry(tries)
            }
        }, 200)
        return () => clearInterval(timer)
    }, [missing, composition])
    const Component = useMemo(() => {
        if (!factory) {
            return null
        }
        try {
            return createComponent(factory, {fps: frameRate, width, height, durationInFrames: duration})
        } catch (e) {
            return () => <ErrorBox error={e}/>
        }
    }, [factory, frameRate, width, height, duration])

    // remounts the error boundary when the composition changes, so a fixed script clears the error
    const componentKey = useMemo(() => ++componentCounter, [Component])

    // JsonDom creates new prop objects on every render: keep the identity while the content is equal
    const propsKey = JSON.stringify(inputProps || {})
    const stableInputProps = useMemo(() => inputProps || {}, [propsKey])

    // _app_.remotionPlayers[name] → PlayerRef for the page script
    useEffect(() => {
        if (!name || !playerRef.current) {
            return
        }
        const players = _app_.remotionPlayers = _app_.remotionPlayers || {}
        players[name] = playerRef.current
        return () => {
            if (players[name] === playerRef.current) {
                delete players[name]
            }
        }
    }, [name, Component])

    // scrollytelling: frame = scroll progress of the target through the viewport
    useEffect(() => {
        if (!scrollSync || scrollSync === 'false' || !Component) {
            return
        }
        let raf = 0
        const update = () => {
            raf = 0
            const player = playerRef.current, wrapper = wrapperRef.current
            if (!player || !wrapper) {
                return
            }
            const target = (scrollTarget && document.querySelector(scrollTarget)) || wrapper.closest('.remotion-player') || wrapper
            const rect = target.getBoundingClientRect()
            // viewport = the scrolling ancestor if there is one, otherwise the window
            const scroller = getScrollParent(target)
            const viewTop = scroller ? scroller.getBoundingClientRect().top : 0
            const vh = scroller ? scroller.clientHeight : window.innerHeight
            const top = rect.top - viewTop
            // a target taller than the viewport (sticky player inside): 0 when its top reaches the top, 1 when its bottom reaches the bottom
            const progress = rect.height > vh
                ? clamp01(-top / (rect.height - vh))
                : clamp01((vh - top) / (vh + rect.height))
            player.seekTo(Math.round(progress * (duration - 1)))
        }
        const onScroll = () => {
            if (!raf) raf = requestAnimationFrame(update)
        }
        update()
        // capture: scroll events of any scrolling element (they don't bubble), not only the window
        document.addEventListener('scroll', onScroll, {passive: true, capture: true})
        window.addEventListener('resize', onScroll)
        return () => {
            document.removeEventListener('scroll', onScroll, {capture: true})
            window.removeEventListener('resize', onScroll)
            if (raf) cancelAnimationFrame(raf)
        }
    }, [scrollSync, scrollTarget, Component, duration])

    if (factoryError) {
        return <ErrorBox error={factoryError}/>
    }

    const synced = scrollSync && scrollSync !== 'false'
    return <div ref={wrapperRef} style={{position: 'absolute', inset: 0}}>
        <ErrorBoundary key={componentKey}>
            <Player
                ref={playerRef}
                component={Component}
                inputProps={stableInputProps}
                durationInFrames={duration}
                fps={frameRate}
                compositionWidth={width}
                compositionHeight={height}
                controls={synced ? false : controls !== false && controls !== 'false'}
                loop={!synced && loop !== false && loop !== 'false'}
                autoPlay={!synced && !!autoPlay && autoPlay !== 'false'}
                clickToPlay={!synced && clickToPlay !== false && clickToPlay !== 'false'}
                initiallyMuted={muted !== false && muted !== 'false'}
                acknowledgeRemotionLicense={!!acknowledgeRemotionLicense}
                errorFallback={({error}) => <ErrorBox error={error}/>}
                style={{width: '100%', height: '100%', ...playerStyle}}
            />
        </ErrorBoundary>
    </div>
}

export default RemotionPlayerImpl
