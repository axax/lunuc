// util/userAgent.mjs
//
// User agent parsing with result caching.
//
// UA strings are massively repetitive (a handful of browser/bot strings
// cover almost all traffic), yet parsing ran fully on every request -
// and multiple times per request (https redirect check + index handling).
// Results are now cached per (botRegex, noJsRenderingBotRegex, agent):
// a cache hit is a Map lookup + shallow copy, the expensive tokenizer
// only runs for genuinely new agent strings.
//
// Also fixed: the tokenizer regex was module-level with the /g flag -
// exec() keeps lastIndex state on the regex object, so an exception
// mid-loop would make the NEXT call start parsing mid-string. The regex
// is now instantiated per call (cold path only, cost is negligible).

// /WhatsApp|TelegramBot|AhrefsBot|Applebot|x28-job-bot|bingbot|msnbot|YandexBot|PetalBot|Googlebot|facebookexternalhit|LinkedInBot|Twitterbot|Xing|AdsBot/

// exception if it starts with spiderweb/ because that is a browser
// NOTE: the lookahead only protects agents STARTING with spiderweb/ -
// "Mozilla/5.0 spiderweb/2.0" would still match via "spider"
export const DEFAULT_BOT_REGEX = /(?!(^spiderweb\/))(leakix.net|bot|ChatGPT|GoogleOther|Google-Apps-Script|crawl|slurp|spider|mediapartners|facebookexternalhit|Xing|WhatsApp|Optimizer|NetcraftSurveyAgent|\(compatible; ITools;)/i

// POLICY REMINDER: every entry here triggers the expensive Puppeteer ssr
// path. Bytespider / GPTBot / ClaudeBot / PerplexityBot / Meta-ExternalAgent
// are ai training/bulk crawlers - decide consciously whether they deserve
// a render (see hostrule.noJsRenderingBotRegex to override per host).
export const DEFAULT_BOT_WITH_NO_JS_SUPPORT_REGEX = /Yandex|SonarBot|googlebot|GoogleOther|Google-InspectionTool|Google-Agent|bingbot|BingPreview|Applebot|Baiduspider|Yeti|SeznamBot|PetalBot|SEBot-WA|Bytespider|OAI-SearchBot|GPTBot|ChatGPT-User|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User|Amazonbot|CCBot|MistralAI-User|Meta-ExternalAgent|meta-webindexer|Screaming Frog SEO Spider|Iframely|AhrefsBot|AhrefsSiteAudit|SemrushBot|MJ12bot|DotBot|SeekportBot|SeobilityBot|DuckDuckBot|localsearch|facebookexternalhit|Twitterbot|LinkedInBot|Xing|WhatsApp|TelegramBot|Slackbot|Discordbot|Pinterestbot|redditbot|SkypeUriPreview|Bluesky|Mastodon|archive\.org_bot|\(compatible; ITools;|YisouSpider|coccocbot|Sogou|360Spider|BLEXBot|serpstatbot/i

/* ------------------------------------------------------------------ */
/* Result cache                                                         */
/* ------------------------------------------------------------------ */

// Two-level WeakMap keyed by the actual regex objects, so custom hostrule
// regexes get their own cache and never mix with the defaults. The regex
// objects are stable (module constants / getRegexCached), so WeakMap keys
// work and vanished hostrule regexes get garbage collected automatically.
const CACHE_MAX_ENTRIES = 5000
const cacheByBotRegex = new WeakMap()

const getCacheFor = (botRegex, noJsRegex) => {
    let byNoJs = cacheByBotRegex.get(botRegex)
    if (!byNoJs) {
        byNoJs = new WeakMap()
        cacheByBotRegex.set(botRegex, byNoJs)
    }
    let cache = byNoJs.get(noJsRegex)
    if (!cache) {
        cache = new Map()
        byNoJs.set(noJsRegex, cache)
    }
    return cache
}


/* ------------------------------------------------------------------ */
/* Parsing                                                              */
/* ------------------------------------------------------------------ */

export const parseUserAgent = (agent, setting = {}) => {

    let {botRegex, noJsRenderingBotRegex, via} = setting

    if (!botRegex || !botRegex.test) {
        botRegex = DEFAULT_BOT_REGEX
    }
    if (!noJsRenderingBotRegex || !noJsRenderingBotRegex.test) {
        noJsRenderingBotRegex = DEFAULT_BOT_WITH_NO_JS_SUPPORT_REGEX
    }

    // via header check stays outside the cache (rare, and independent of agent)
    if (via && via.indexOf('archive.org_bot') >= 0) {
        // https://web.archive.org/
        return {isBot: true, noJsRendering: true}
    }

    const cache = getCacheFor(botRegex, noJsRenderingBotRegex)
    const cacheKey = agent || ''

    const cached = cache.get(cacheKey)
    if (cached) {
        // shallow copy so callers can safely mutate their result
        // (e.g. overriding noJsRendering) without poisoning the cache
        return {...cached}
    }

    const result = computeUserAgentResult(agent, botRegex, noJsRenderingBotRegex)

    if (cache.size >= CACHE_MAX_ENTRIES) {
        // primitive eviction - drop the oldest entry (same pattern as the
        // path cache in server/index.mjs). A ua flood cannot grow memory
        // beyond the cap, it only degrades the hit rate.
        cache.delete(cache.keys().next().value)
    }
    cache.set(cacheKey, result)

    return {...result}
}

const computeUserAgentResult = (agent, botRegex, noJsRenderingBotRegex) => {

    let result = {}
    if (agent) {
        const agentLower = agent.toLowerCase().trim()
        // noJsRenderingBotRegex is checked independently of botRegex: several
        // listed agents (Claude-User, Perplexity-User, Google-InspectionTool,
        // Iframely, Bluesky, Mastodon, ...) contain none of the generic
        // bot/crawl/spider tokens, so gating the noJs check behind botRegex
        // served them the empty js shell instead of the ssr render.
        // Anything explicitly listed for ssr is by definition a bot.
        const noJsBot = noJsRenderingBotRegex.test(agentLower)
        result.isBot = noJsBot || botRegex.test(agentLower)

        if (result.isBot) {
            result.noJsRendering = noJsBot
        } else {

            const raw = parseUserAgentRaw(agentLower)

            if (raw.mobile) {
                result.mobile = true
            }

            if (raw.opr) {

                result.browser = 'opera'
                result.version = parseFloat(raw.opr.version)

            } else if (raw.opera) {

                result.browser = 'opera'

                if (raw.version) {
                    result.version = parseFloat(raw.version.version)
                } else {
                    result.version = parseFloat(raw.opera.version)
                }
            } else if (raw.opt) {

                result.browser = 'opt'
                result.version = parseFloat(raw.opt.version)

            } else if (raw.edge) {

                result.browser = 'edge'
                result.version = parseFloat(raw.edge.version)

            } else if (raw.fxios) {

                result.browser = 'fxios'
                result.version = parseFloat(raw.fxios.version)

            } else if (raw.firefox) {

                result.browser = 'firefox'
                result.version = parseFloat(raw.firefox.version)

            } else if (raw.chrome) {

                result.browser = 'chrome'
                result.version = parseFloat(raw.chrome.version)

            } else if (raw.headlesschrome) {

                result.browser = 'chrome'
                result.version = parseFloat(raw.headlesschrome.version)
                result.headless = true

            } else if (raw.crios) {

                result.browser = 'chrome'
                result.version = parseFloat(raw.crios.version)

            } else if (raw.netscape) {

                result.browser = 'netscape'
                result.version = parseFloat(raw.netscape.version)

            } else if (raw.netscape6) {

                result.browser = 'netscape'
                result.version = parseFloat(raw.netscape6.version)

            } else if (raw.applewebkit) {

                result.browser = 'safari'

                if (raw.version) {
                    result.version = parseFloat(raw.version.version)
                }
            } else if (raw.spiderweb) {

                result.browser = 'spiderweb'
                result.version = parseFloat(raw.spiderweb.version)
            } else if (raw.mozilla) {

                const allKeys = Object.keys(raw)

                if (allKeys.length === 3 && raw.gecko && raw.like && raw.mozilla.rv) {
                    result.browser = 'msie'
                    result.version = parseFloat(raw.mozilla.rv)
                } else if (allKeys.length === 1) {

                    if (raw.mozilla.msie) {
                        result.browser = 'msie'
                        result.version = parseFloat(raw.mozilla.msie)
                    } else if (raw.mozilla.win95) {
                        result.browser = 'netscape'
                        result.version = parseFloat(raw.mozilla.version)
                    } else {
                        for (const key of Object.keys(raw.mozilla)) {
                            if (key.startsWith('msie')) {
                                const version = key.substring(4)
                                if (!isNaN(version)) {
                                    result.browser = 'msie'
                                    result.version = parseFloat(version)
                                    break
                                }
                            }
                        }
                    }
                }

            }
            result.raw = raw

            result.noJsRendering = (result.browser === 'netscape') ||
                (result.browser === 'safari' && result.version < 5) ||
                (result.browser === 'firefox' && result.version <= 12) ||
                (result.browser === 'opera' && result.version <= 10) ||
                (result.browser === 'chrome' && result.version <= 16) ||
                (result.browser === 'msie' && result.version <= 10)

        }
    }

    if (!result.version || result.version < 0 || isNaN(result.version)) {
        result.version = 999
    }

    if (!result.browser) {
        result.browser = 'unknown'
    }

    return result
}


export const parseUserAgentRaw = (input) => {

    //useragent strings are just a set of phrases each optionally followed by a set of properties encapsulated in parentheses
    //
    //IMPORTANT: instantiated per call. A module-level regex with /g keeps
    //lastIndex state between calls - an exception mid-loop would corrupt
    //every subsequent parse. Per-call instantiation is safe and cheap
    //(V8 caches the compiled pattern; only runs on cache misses anyway).
    const part = /\s*([^\s/]+)(\/(\S+)|)(\s+\(([^)]+)\)|)/g
    //these properties are delimited by semicolons
    const delim = /;\s*/
    //the properties may be simple key-value pairs if;
    const single = [
        //it is a single comma separation,
        /^([^,]+),\s*([^,]+)$/,
        //it is a single space separation,
        /^(\S+)\s+(\S+)$/,
        //it is a single colon separation,
        /^([^:]+):([^:]+)$/,
        //it is a single slash separation
        /^([^/]+)\/([^/]+)$/,
        //or is a special string
        /^(.NET CLR|Windows)\s+(.+)$/
    ]
    //otherwise it is unparsable because everyone does it differently, looking at you iPhone
    const many = / +/
    //oh yeah, bots like to use links
    const link = /^\+(.+)$/

    const inner = (properties, property) => {
        let tmp
        if (tmp = property.match(link)) {
            properties.link = tmp[1]
        } else if (tmp = single.reduce((match, regex) => (match || property.match(regex)), null)) {
            properties[tmp[1]] = tmp[2]
        } else if (many.test(property)) {
            if (!properties.properties)
                properties.properties = []
            properties.properties.push(property)
        } else {
            properties[property] = true
        }

        return properties
    }

    const output = {}
    for (let match; match = part.exec(input); '') {
        output[match[1]] = {
            ...(match[5] && match[5].split(delim).reduce(inner, {})),
            ...(match[3] && {version: match[3]})
        }
    }
    return output
}

export const isLetsEncryptAgent = (agent) => {
    return agent && agent.indexOf('www.letsencrypt.org') >= 0
}
