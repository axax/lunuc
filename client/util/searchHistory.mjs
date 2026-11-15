export const MAX_SEARCH_HISTORY = 50

/*
 * Returns a new history array with text as the most recent entry.
 * - duplicates are removed
 * - if the previous top entry is a prefix of the new text (the user just kept typing),
 *   it is replaced instead of kept, so the history does not fill up with partial terms
 */
export const addToSearchHistory = (history, text, max = MAX_SEARCH_HISTORY) => {
    const value = text && text.trim()
    if (!value) {
        return history || []
    }
    const before = history || []
    if (before[0] === value) {
        return before
    }
    const result = [value]
    for (let i = 0; i < before.length && result.length < max; i++) {
        const entry = before[i]
        if (entry === value || (i === 0 && value.startsWith(entry))) {
            continue
        }
        result.push(entry)
    }
    return result
}
