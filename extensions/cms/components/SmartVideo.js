import React from 'react'

/*
 Video of SmartImage (background / slider videos: muted, looped, no controls).

 - loads and plays only while visible, hidden videos (e.g. other slides of a css slider, the
   IntersectionObserver respects the clipping of overflow:hidden) only load the poster
 - pauses when out of view again
 - on unmount (navigation to another page) the download is aborted: removing the element
   alone does not stop it, the source has to be removed and load() called
 - without IntersectionObserver (very old browsers): plays immediately

 One IntersectionObserver for all videos. The ref is a callback with cleanup (React 19 / Preact 11),
 defined on module level so it stays the same function and runs once per video element.
*/

const handlers = new WeakMap()
let observer

const getObserver = () => {
    if (!observer && typeof window.IntersectionObserver === 'function') {
        observer = new IntersectionObserver(entries => {
            for (let i = 0; i < entries.length; i++) {
                const handler = handlers.get(entries[i].target)
                if (handler) handler(entries[i].isIntersecting)
            }
        }, {threshold: 0.01})
    }
    return observer
}

const videoRef = (video) => {
    if (!video) return
    // the muted attribute is not reliably set by react, without it autoplay is blocked
    video.muted = true
    let active = false
    const play = () => {
        if (!active) {
            active = true
            video.src = video.dataset.src
            video.preload = 'auto'
        }
        const promise = video.play()
        // e.g. autoplay not allowed (power saving mode) -> the poster stays
        if (promise && promise.catch) promise.catch(() => {})
    }
    const obs = getObserver()
    if (obs) {
        handlers.set(video, visible => {
            if (visible) {
                play()
            } else if (active) {
                video.pause()
            }
        })
        obs.observe(video)
    } else {
        play()
    }
    return () => {
        if (obs) {
            obs.unobserve(video)
            handlers.delete(video)
        }
        if (active) {
            try {
                video.pause()
                video.removeAttribute('src')
                video.load()
            } catch (e) {
            }
        }
    }
}

const SmartVideo = ({src, poster, width, height}) =>
    <video ref={videoRef}
           data-src={src}
           width={width} height={height}
           poster={poster}
           preload="none"
           loop muted playsInline/>

export default SmartVideo
