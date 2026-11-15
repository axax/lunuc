/*
 * Web push in the browser (generic) - available as _app_.push on every page for logged in users.
 *
 *   const status = await _app_.push.getStatus()
 *      -> {state, subscribed, devices, settings, topics}
 *         state: 'unsupported' | 'no-serviceworker' | 'denied' | 'default' | 'granted'
 *   await _app_.push.subscribe({topics: ['news'], settings: {chatPreview: false}})   asks for the permission
 *   await _app_.push.setSettings({chatPreview: true})    per device, readable on the server (subscription.settings)
 *   await _app_.push.unsubscribe()
 *   await _app_.push.test()                              test notification to all own devices
 *   _app_.push.isSubscribed()                            sync, last known state of this device
 *
 * The service worker is only registered on a deployed (https) instance, not in dev mode / on localhost.
 * Sending: see util/push.mjs
 */
import {client} from '../../../client/middleware/graphql'

const FLAG_KEY = 'lunuc.push.subscribed'

const Q_INFO = 'query pushInfo($endpoint:String){pushInfo(endpoint:$endpoint){publicKey subscribed devices settings topics}}'
const M_SUBSCRIBE = 'mutation pushSubscribe($subscription:String!,$topics:[String],$settings:String){pushSubscribe(subscription:$subscription,topics:$topics,settings:$settings)}'
const M_SETTINGS = 'mutation pushSettings($endpoint:String!,$settings:String,$topics:[String]){pushSettings(endpoint:$endpoint,settings:$settings,topics:$topics)}'
const M_UNSUBSCRIBE = 'mutation pushUnsubscribe($endpoint:String!){pushUnsubscribe(endpoint:$endpoint)}'
const M_TEST = 'mutation pushTest{pushTest}'

const setFlag = (on) => {
    try {
        if (on) {
            localStorage.setItem(FLAG_KEY, _app_.user && _app_.user._id ? String(_app_.user._id) : '1')
        } else {
            localStorage.removeItem(FLAG_KEY)
        }
    } catch (e) {
    }
}

const isSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'

const getRegistration = async () => (isSupported() ? (await navigator.serviceWorker.getRegistration()) || null : null)

const keyToUint8Array = (base64) => {
    const padded = (base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(padded)
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
    return out
}

const info = (endpoint) => client.query({query: Q_INFO, variables: {endpoint}, fetchPolicy: 'no-cache', silent: true}).then(r => r.data.pushInfo)
const mutate = (mutation, variables) => client.mutate({mutation, variables, silent: true}).then(r => r.data)

const push = {
    isSupported,
    isSubscribed: () => {
        try {
            const flag = localStorage.getItem(FLAG_KEY)
            return !!flag && (!_app_.user || !_app_.user._id || flag === '1' || flag === String(_app_.user._id))
        } catch (e) {
            return false
        }
    },
    getStatus: async () => {
        const status = {state: 'unsupported', subscribed: false, devices: 0, settings: {}, topics: []}
        if (!isSupported()) return status
        const registration = await getRegistration()
        if (!registration) {
            status.state = 'no-serviceworker'
            return status
        }
        status.state = Notification.permission
        const subscription = await registration.pushManager.getSubscription()
        try {
            const data = await info(subscription ? subscription.endpoint : null)
            status.devices = data.devices
            status.topics = data.topics || []
            status.settings = data.settings ? JSON.parse(data.settings) : {}
            // only subscribed when the browser AND the server know the subscription
            status.subscribed = !!subscription && data.subscribed && status.state === 'granted'
        } catch (e) {
            status.error = (e && e.error && e.error.message) || String(e)
        }
        setFlag(status.subscribed)
        return status
    },
    subscribe: async ({topics, settings} = {}) => {
        const registration = await getRegistration()
        if (!registration) {
            throw new Error(isSupported() ? 'no-serviceworker' : 'unsupported')
        }
        const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
        if (permission !== 'granted') {
            throw new Error(permission)
        }
        const {publicKey} = await info(null)
        let subscription = await registration.pushManager.getSubscription()
        if (subscription && subscription.options && subscription.options.applicationServerKey) {
            // subscription of another server key (e.g. keys were replaced): start over
            const current = btoa(String.fromCharCode(...new Uint8Array(subscription.options.applicationServerKey)))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
            if (current !== publicKey) {
                await subscription.unsubscribe()
                subscription = null
            }
        }
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: keyToUint8Array(publicKey)})
        }
        await mutate(M_SUBSCRIBE, {
            subscription: JSON.stringify(subscription.toJSON()),
            topics,
            settings: settings ? JSON.stringify(settings) : undefined
        })
        setFlag(true)
        return true
    },
    setSettings: async (settings, topics) => {
        const registration = await getRegistration()
        const subscription = registration && await registration.pushManager.getSubscription()
        if (!subscription) return false
        const data = await info(subscription.endpoint)
        const merged = {...(data.settings ? JSON.parse(data.settings) : {}), ...settings}
        return (await mutate(M_SETTINGS, {endpoint: subscription.endpoint, settings: JSON.stringify(merged), topics})).pushSettings
    },
    unsubscribe: async () => {
        setFlag(false)
        const registration = await getRegistration()
        const subscription = registration && await registration.pushManager.getSubscription()
        if (!subscription) return false
        await mutate(M_UNSUBSCRIBE, {endpoint: subscription.endpoint}).catch(() => {})
        return subscription.unsubscribe()
    },
    test: () => mutate(M_TEST).then(d => d.pushTest)
}

/* a click on a notification: the service worker asks the open window to navigate (no page reload) */
export const initPushClient = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.serviceWorker) return
    navigator.serviceWorker.addEventListener('message', (event) => {
        const data = event.data
        if (data && data.type === 'lunuc-push-navigate' && typeof data.url === 'string' && data.url[0] === '/' && data.url[1] !== '/') {
            if (_app_.history && _app_.history.push) {
                _app_.history.push(data.url)
            } else {
                location.href = data.url
            }
        }
    })
}

export default push
