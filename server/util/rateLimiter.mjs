// In-memory store for request timestamps
const requestStore = new Map();

/**
 * Checks if a request should be rate limited.
 * @returns {boolean} - true if limited, false if allowed.
 */
export const isRateLimited = (req, hostrule) => {

    if(!hostrule.rateLimit){
        return false
    }

    const userAgent = req.headers['user-agent'] || '';

    // Find a matching config for the User-Agent
    const config = hostrule.rateLimit.find(c => userAgent.includes(c.userAgent));
    if (!config) return false;

    const now = Date.now();
    const windowStart = now - config.time;

    // Get and clean up old timestamps
    let timestamps = requestStore.get(userAgent) || [];
    timestamps = timestamps.filter(ts => ts > windowStart);

    if (timestamps.length >= config.maxRequestsPerTime) {
        return true;
    }

    // Update the store and allow the request
    timestamps.push(now);
    requestStore.set(userAgent, timestamps);
    return false;
};