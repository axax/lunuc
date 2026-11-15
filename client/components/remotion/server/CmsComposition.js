import React, {useMemo} from 'react'
import {useVideoConfig} from 'remotion'
import {compileCode, createComponent} from '../factory'

// One generic composition for every CMS composition: the factory source comes in
// as inputProps.code and is evaluated in the render browser, so no new bundle is
// needed per video. Errors are thrown, so renderMedia fails with the message.
export const CmsComposition = ({code, inputProps}) => {
    const {fps, width, height, durationInFrames} = useVideoConfig()
    const Component = useMemo(
        () => createComponent(compileCode(code), {fps, width, height, durationInFrames}),
        [code, fps, width, height, durationInFrames]
    )
    return React.createElement(Component, inputProps || {})
}
