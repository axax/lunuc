/* sync part of _app_.push - in the main bundle (see ../client.js), used by util/pushClient.js too */

export const FLAG_KEY = 'lunuc.push.subscribed'

export const isSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'

// last known state of this device (set by getStatus / subscribe / unsubscribe)
export const isSubscribed = () => {
    try {
        const flag = localStorage.getItem(FLAG_KEY)
        return !!flag && (!_app_.user || !_app_.user._id || flag === '1' || flag === String(_app_.user._id))
    } catch (e) {
        return false
    }
}
