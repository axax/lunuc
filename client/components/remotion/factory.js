import React from 'react'
import * as Remotion from 'remotion'
import htm from 'htm'

// Shared by the browser player (RemotionPlayerImpl) and the server render
// (server/CmsComposition), so a composition behaves the same in both.

// JSX-like tagged templates without a build step: html`<${AbsoluteFill}>...<//>`
export const html = htm.bind(React.createElement)

const codeCache = new Map()
const CODE_CACHE_MAX = 50

// factory source "(lib) => (props) => element" → factory function
export const compileCode = (code) => {
    let factory = codeCache.get(code)
    if (!factory) {
        factory = new Function(`'use strict';return (${code}\n)`)()
        if (typeof factory !== 'function') {
            throw new Error('code must evaluate to a factory function: (lib) => (props) => element')
        }
        if (codeCache.size >= CODE_CACHE_MAX) {
            codeCache.delete(codeCache.keys().next().value)
        }
        codeCache.set(code, factory)
    }
    return factory
}

// calls the factory with the remotion API + helpers and checks the result
export const createComponent = (factory, {fps, width, height, durationInFrames}) => {
    const comp = factory({...Remotion, React, html, h: React.createElement, fps, width, height, durationInFrames})
    if (typeof comp !== 'function' && !(comp && comp.$$typeof)) {
        throw new Error('the composition factory must return a React component')
    }
    return comp
}
