import {HOSTRULE_HEADER, TRACK_IP_HEADER, TRACK_REFERER_HEADER, TRACK_URL_HEADER} from '../../api/constants/index.mjs'
import {clientAddress} from '../../util/host.mjs'


const API_PORT = (process.env.API_PORT || process.env.LUNUC_API_PORT || 3000)

export const doTrackingEvent = async (req, {event, host}) => {
    const query = `mutation doTracking($event: String!) {doTracking(event: $event) {status}}`

    const newHeaders = Object.fromEntries(
        Object.entries(req.headers).filter(([key]) => !/^:/.test(key))
    )
    const res = await fetch(`http://localhost:${API_PORT}/graphql`, {
        method: 'POST',
        headers: {
            ...newHeaders,
            [HOSTRULE_HEADER]: req.headers[HOSTRULE_HEADER] || host,
            [TRACK_REFERER_HEADER]:req.headers.referer || '',
            [TRACK_URL_HEADER]:req.url,
            [TRACK_IP_HEADER]:clientAddress(req),
            'x-from-client-server':true,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            query,
            variables: { event },
        }),
    })

}
