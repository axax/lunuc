import push, {initPushClient} from './util/pushClient'

/* web push, generic: see util/pushClient.js (browser) and util/push.mjs (sending) */
export default () => {
    if (typeof _app_ !== 'undefined' && !_app_.ssr) {
        _app_.push = push
        initPushClient()
    }
}
