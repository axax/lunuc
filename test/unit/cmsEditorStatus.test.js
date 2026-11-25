import React, {act} from 'react'
import renderer from 'react-test-renderer'
import {createEditorStatusStore, EditorStatus} from '../../extensions/cms/components/CmsEditorStatus'

const flush = () => Promise.resolve()

describe('cms editor status store', () => {

    it('returns the initial values and changes them', () => {
        const store = createEditorStatusStore({saveStatus: null, undoCount: 0})
        expect(store.get()).toEqual({saveStatus: null, undoCount: 0})
        store.set({saveStatus: 'saving'})
        expect(store.get()).toEqual({saveStatus: 'saving', undoCount: 0})
    })

    it('keeps the same object and notifies nobody without a change', async () => {
        const store = createEditorStatusStore({saveStatus: 'saved'})
        const listener = jest.fn()
        store.subscribe(listener)
        const before = store.get()
        store.set({saveStatus: 'saved'})
        await flush()
        expect(store.get()).toBe(before)
        expect(listener).not.toHaveBeenCalled()
    })

    it('notifies once, asynchronously, for several changes in a row', async () => {
        const store = createEditorStatusStore({saveStatus: null, undoCount: 0})
        const listener = jest.fn()
        store.subscribe(listener)
        store.set({saveStatus: 'pending'})
        store.set({saveStatus: 'saving'})
        store.set({undoCount: 1})
        // not during the call (set can happen while the editor renders)
        expect(listener).not.toHaveBeenCalled()
        await flush()
        expect(listener).toHaveBeenCalledTimes(1)
        expect(store.get()).toEqual({saveStatus: 'saving', undoCount: 1})
    })

    it('stops notifying after unsubscribe', async () => {
        const store = createEditorStatusStore({saveStatus: null})
        const listener = jest.fn()
        const unsubscribe = store.subscribe(listener)
        unsubscribe()
        store.set({saveStatus: 'saved'})
        await flush()
        expect(listener).not.toHaveBeenCalled()
    })
})

describe('EditorStatus', () => {

    beforeAll(() => {
        globalThis.IS_REACT_ACT_ENVIRONMENT = true
    })

    const text = (tree) => tree.root.findByType('span').children.join('')

    it('renders on its own when the store changes, the parent does not render', async () => {
        const store = createEditorStatusStore({saveStatus: null})
        let parentRenders = 0
        const Parent = () => {
            parentRenders++
            return <EditorStatus store={store} render={({saveStatus}) => <span>{saveStatus || 'none'}</span>}/>
        }
        let tree
        await act(async () => {
            tree = renderer.create(<Parent/>)
        })
        expect(text(tree)).toBe('none')

        await act(async () => {
            store.set({saveStatus: 'saved'})
            await flush()
        })
        expect(text(tree)).toBe('saved')
        expect(parentRenders).toBe(1)
        await act(async () => tree.unmount())
    })

    it('shows a change made between its render and the subscription', async () => {
        const store = createEditorStatusStore({saveStatus: null})
        const Changer = () => {
            // a sibling that changes the store while rendering (like resetHistory during an update)
            store.set({saveStatus: 'pending'})
            return null
        }
        let tree
        await act(async () => {
            tree = renderer.create(<>
                <EditorStatus store={store} render={({saveStatus}) => <span>{saveStatus || 'none'}</span>}/>
                <Changer/>
            </>)
            await flush()
        })
        expect(text(tree)).toBe('pending')
        await act(async () => tree.unmount())
    })
})
