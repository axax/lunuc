import {server} from 'api/server'


export const clientIps = () => {

    const handles = process._getActiveHandles(),
        ips = []

    for (let i = 0, handle, len = handles.length; i < len; ++i) {
        handle = handles[i];
        if (handle.readable
            && handle.writable
            && handle.server === server
            && handle.remoteAddress) {

            //console.log(!!handle.parser)
            ips.push(handle.remoteAddress)
        }
    }

    return ips
}
