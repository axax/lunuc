import React from 'react'
import Util from './index.mjs'
import config from '../../gensrc/config-client'

export const Link = ({to, href, target, onClick, ...rest}) => {
    const newHref = to || href
    return <a href={newHref} onClick={(e)=>{
        if(onClick){
            onClick(e)
        }
        if(newHref && target!=='_blank' && !e.isDefaultPrevented()) {
            _app_.history.push(newHref)
            e.preventDefault()
        }
    }} target={target} {...rest} />
}

export const Redirect = ({to, push}) => {
    if(_app_.ssr){
        return
    }
    if (/^(?:[a-z]+:)?\/\//i.test(to)){
        location.href = to
    }else {
        _app_.history.push(to, !push)
    }
    return
}

export class RouteHistory {
    _listeners = []
    _blocker = []
    _urlStack = [location.href.substring(location.origin.length)]
    location = window.location
    constructor() {
        window.addEventListener('popstate', event => {
            this._pushReplace(this.location.href.substring(this.location.origin.length),{ignoreState:true})
        })
    }

    _pushReplace = (url, {replace, ignoreState}) => {

        // for compatibility reason
        if (url.constructor === Object) {
            url = url.pathname
        }

        const contextLanguage = Util.setUrlContext(url)

        if(contextLanguage && _app_.lang !== contextLanguage) {
            console.log(`switch language from ${_app_.lang} to ${contextLanguage}`)
            _app_.lang = contextLanguage
            if(contextLanguage === config.DEFAULT_LANGUAGE){
                url = url.substring(contextLanguage.length+1)
                _app_.contextPath = ''
            }
        }

        const newPath = Util.addUrlContext(url)

        if(this._callBlockers(newPath)) {
            const index = this._urlStack.indexOf(newPath)

            if(index===0){
                //ignore
                return
            }else if (index > 0) {
                this._urlStack.splice(index, 1);
            }

            this._urlStack.unshift(url)
            if (this._urlStack.length > 10) {
                this._urlStack = this._urlStack.slice(0, 9)
            }

            if (!ignoreState) {
                if (replace) {
                    window.history.replaceState({}, '', newPath)
                } else {
                    window.history.pushState({}, '', newPath)
                }
            }
            this._callListener()
        }
    }

    _callListener = () =>{
        this._listeners.forEach((fn)=>{
            fn()
        })
    }

    _callBlockers = (newPath) =>{
        for(let i=0;i<this._blocker.length;i++){
            if(!this._blocker[i](newPath)){
                return false
            }
        }
        return true
    }

    push = (path) => {
        this._pushReplace(path,{replace:false})

    }
    replace = (path) => {
        this._pushReplace(path, {replace:true})
    }

    listen = (fn) => {
        this._listeners.push(fn)
        return () => {
            const idx = this._listeners.indexOf(fn)
            if (idx !== -1) {
                this._listeners.splice(idx, 1)
            }
        }
    }

    block = (fn) => {
        this._blocker.push(fn)
        return () => {
            const idx = this._blocker.indexOf(fn)
            if (idx !== -1) {
                this._blocker.splice(idx, 1)
            }
        }
    }
}
