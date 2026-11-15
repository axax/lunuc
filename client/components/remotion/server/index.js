// Entry of the server side Remotion bundle (api/util/remotionRender.mjs).
// Bundled once per server process by @remotion/bundler, not part of the lunuc build.
import React from 'react'
import {registerRoot, Composition} from 'remotion'
import {CmsComposition} from './CmsComposition'

const num = (v, def, min, max) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : def
}

const Root = () => React.createElement(Composition, {
    id: 'CmsComposition',
    component: CmsComposition,
    // overwritten per render by calculateMetadata
    durationInFrames: 150, fps: 30, width: 1280, height: 720,
    defaultProps: {code: '', inputProps: {}},
    calculateMetadata: ({props}) => ({
        durationInFrames: num(props.durationInFrames, 150, 1, 60 * 60 * 5),
        fps: num(props.fps, 30, 1, 60),
        width: num(props.width, 1280, 16, 3840),
        height: num(props.height, 720, 16, 3840)
    })
})

registerRoot(Root)
