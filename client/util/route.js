import React from "react";

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

        let newPath
        if (url.indexOf('#') !== 0 && url.split('?')[0].split('#')[0] !== _app_.contextPath && url.indexOf(_app_.contextPath + '/') !== 0) {
            newPath = _app_.contextPath + url
        } else {
            newPath = url
        }

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

//        this._last = window.location.pathname
// encodeURI again as it gets decoded in react routing
//this.history._push(encodeURI(newPath), state)
        if(this._callBlockers(newPath)) {
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
