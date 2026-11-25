import {useEffect, useReducer} from 'react'

/*
 Values of the cms editor that change often while editing (save status, undo / redo counts,
 other editors on the page). They live in this small store instead of the state of
 CmsViewEditorContainer: a change only renders the parts that show them (EditorStatus),
 not the whole editor with the sidebar and its code editors.
*/

export const createEditorStatusStore = (initial) => {
    let state = {...initial}
    const listeners = new Set()
    let scheduled = false

    // listeners are notified in a microtask: set() is also called while the editor renders
    // (e.g. resetHistory from shouldComponentUpdate), updating another component there is not allowed.
    // Several changes in a row lead to one notification.
    const notify = () => {
        if (scheduled) return
        scheduled = true
        Promise.resolve().then(() => {
            scheduled = false
            listeners.forEach(listener => listener())
        })
    }

    return {
        get: () => state,
        set: (changes) => {
            let changed = false
            for (const key in changes) {
                if (state[key] !== changes[key]) {
                    changed = true
                    break
                }
            }
            if (changed) {
                state = {...state, ...changes}
                notify()
            }
        },
        subscribe: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        }
    }
}

/**
 * renders render(status) and renders again on its own when the store changes
 */
export const EditorStatus = ({store, render}) => {
    const [, rerender] = useReducer(x => x + 1, 0)
    const status = store.get()

    useEffect(() => {
        const unsubscribe = store.subscribe(rerender)
        // changed between this render and the subscription
        if (store.get() !== status) {
            rerender()
        }
        return unsubscribe
    }, [store])

    return render(status)
}
