const regexCache = new Map();

export const getRegexCached = (pattern) => {
    if (!regexCache.has(pattern)) {
        const regexMatch = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
        if(regexMatch) {
            regexCache.set(pattern, new RegExp(regexMatch[1], regexMatch[2]));
        }else{
            regexCache.set(pattern, new RegExp(pattern));
        }
    }
    return regexCache.get(pattern);
}