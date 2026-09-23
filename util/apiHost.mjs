// util/apiHost.mjs
//
// Address the web server uses to reach the API server on this machine.
// An IP instead of 'localhost': 'localhost' needs a dns.lookup per new
// connection (runs on the libuv threadpool and queues behind file I/O under
// load) and resolves to ::1 first, which the API (bound to 127.0.0.1 by
// default) refuses before the IPv4 fallback kicks in.
//
//   LUNUC_API_HOST       explicit override
//   LUNUC_API_BIND_HOST  the API's bind address (see api/server.mjs) - used
//                        when it is a concrete address
const bindHost = process.env.LUNUC_API_BIND_HOST
const WILDCARD = new Set(['0.0.0.0', '::', ''])

export const API_CONNECT_HOST = process.env.LUNUC_API_HOST ||
    (bindHost && !WILDCARD.has(bindHost) ? bindHost : '127.0.0.1')
