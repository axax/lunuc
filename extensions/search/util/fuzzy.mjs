/**
 * Fuzzy search: a vocabulary (collection SearchWord) of all words in the SearchIndex. Search terms that are
 * not in it are corrected to similar words: candidates by trigrams and Kölner Phonetik (sounds alike),
 * checked with the edit distance (a swapped pair of letters counts as one edit).
 */

import Cache from '../../../util/cache.mjs'

export const WORD_COLLECTION = 'SearchWord'
// shorter words and words with digits (article numbers, years) are not corrected
export const MIN_FUZZY_LENGTH = 4
const MAX_CANDIDATES = 300
const MAX_CORRECTIONS = 5
// the trigram query cannot sort by index: with frequent trigrams and a large vocabulary it is stopped
// after this time, then only the words that sound alike are used
const TRIGRAM_QUERY_MAX_MS = 300
// the vocabulary changes slowly: the corrections of a term are kept this long (also "no corrections")
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_KEY_PREFIX = 'SearchFuzzy-'

export const isVocabularyWord = (word) => word.length >= MIN_FUZZY_LENGTH && !/\p{N}/u.test(word)

// allowed edits for a term of this length
export const maxDistance = (length) => length < MIN_FUZZY_LENGTH ? 0 : (length <= 5 ? 1 : 2)

export const trigrams = (word) => {
    const padded = ' ' + word + ' '
    const grams = new Set()
    for (let i = 0; i < padded.length - 2; i++) grams.add(padded.substring(i, i + 3))
    return [...grams]
}

/**
 * Kölner Phonetik: code of how a (German) word sounds, e.g. "meier", "mayer" and "meyer" -> "67".
 * Variation: vowels are dropped completely (see below).
 */
const PHONETIC_NORMALIZE = {'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 's', 'é': 'e', 'è': 'e', 'ê': 'e', 'à': 'a', 'â': 'a', 'ô': 'o', 'î': 'i', 'ï': 'i', 'ç': 'c'}
export const colognePhonetic = (input) => {
    const w = [...String(input).toLowerCase()].map(c => PHONETIC_NORMALIZE[c] || c).filter(c => c >= 'a' && c <= 'z').join('')
    let code = ''
    for (let i = 0; i < w.length; i++) {
        // '#' at the edges: ''.includes would always be true
        const c = w[i], prev = i > 0 ? w[i - 1] : '#', next = w[i + 1] || '#'
        let d = ''
        if ('aeijouy'.includes(c)) d = '0'
        else if (c === 'h') d = ''
        else if (c === 'b') d = '1'
        else if (c === 'p') d = next === 'h' ? '3' : '1'
        else if (c === 'd' || c === 't') d = 'csz'.includes(next) ? '8' : '2'
        else if ('fvw'.includes(c)) d = '3'
        else if ('gkq'.includes(c)) d = '4'
        else if (c === 'c') {
            if (i === 0) d = 'ahkloqrux'.includes(next) ? '4' : '8'
            else d = ('sz'.includes(prev) || !'ahkoqux'.includes(next)) ? '8' : '4'
        } else if (c === 'x') d = 'ckq'.includes(prev) ? '8' : '48'
        else if (c === 'l') d = '5'
        else if (c === 'm' || c === 'n') d = '6'
        else if (c === 'r') d = '7'
        else if (c === 's' || c === 'z') d = '8'
        code += d
    }
    // collapse repeated digits, then remove the vowels ("0") - also the leading one (unlike the original
    // algorithm), so that a swapped first vowel still sounds alike ("hund" / "hnud")
    let collapsed = ''
    for (const d of code) if (d !== collapsed[collapsed.length - 1]) collapsed += d
    return collapsed.replace(/0/g, '')
}

/**
 * Edit distance (optimal string alignment): insert, delete, replace and swapping two neighbours = 1 edit.
 * Stops early with max + 1 once the distance is certainly above max.
 */
export const editDistance = (a, b, max = Infinity) => {
    if (a === b) return 0
    if (Math.abs(a.length - b.length) > max) return max + 1
    const rows = [new Array(b.length + 1).fill(0).map((_, j) => j)]
    for (let i = 1; i <= a.length; i++) {
        const row = [i]
        let rowMin = i
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            let v = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost)
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                v = Math.min(v, rows[i - 2][j - 2] + 1)
            }
            row.push(v)
            if (v < rowMin) rowMin = v
        }
        if (rowMin > max) return max + 1
        rows.push(row)
    }
    return rows[a.length][b.length]
}

const vocabularyEntry = (word) => ({word, grams: trigrams(word), phon: colognePhonetic(word), len: word.length})

/**
 * Adds the words that are not in the vocabulary yet (only new words are written).
 */
export const addWords = async (db, words) => {
    const list = [...new Set(words)].filter(isVocabularyWord)
    if (list.length === 0) return 0
    const collection = db.collection(WORD_COLLECTION)
    let added = 0
    for (let i = 0; i < list.length; i += 1000) {
        const chunk = list.slice(i, i + 1000)
        const existing = new Set((await collection.find({word: {$in: chunk}}, {projection: {word: 1}}).toArray()).map(w => w.word))
        const missing = chunk.filter(w => !existing.has(w))
        if (missing.length > 0) {
            try {
                await collection.insertMany(missing.map(vocabularyEntry), {ordered: false})
                added += missing.length
            } catch (e) {
                // added in the meantime by another process (unique index): fine
                if (e.code !== 11000 && !(e.writeErrors || []).every(w => w.code === 11000)) throw e
            }
        }
    }
    return added
}

/**
 * Full run: the vocabulary becomes exactly the given words (missing ones added, the others removed).
 */
export const syncVocabulary = async (db, words) => {
    const wanted = new Set([...words].filter(isVocabularyWord))
    const added = await addWords(db, [...wanted])
    const collection = db.collection(WORD_COLLECTION)
    let stale = [], removed = 0
    for await (const entry of collection.find({}, {projection: {_id: 1, word: 1}})) {
        if (!wanted.has(entry.word)) {
            stale.push(entry._id)
            if (stale.length >= 1000) {
                removed += (await collection.deleteMany({_id: {$in: stale}})).deletedCount
                stale = []
            }
        }
    }
    if (stale.length > 0) removed += (await collection.deleteMany({_id: {$in: stale}})).deletedCount
    return {added, removed, total: wanted.size}
}

/**
 * Similar words of the vocabulary for one term: [{word, distance}], best first.
 * Terms that are words of the vocabulary themselves get no corrections.
 */
export const findSimilarWords = async (db, term) => {
    const max = maxDistance(term.length)
    if (max === 0 || !isVocabularyWord(term)) return []
    const cacheKey = CACHE_KEY_PREFIX + term
    const cached = Cache.get(cacheKey)
    if (cached) return cached
    const result = await computeSimilarWords(db, term, max)
    Cache.set(cacheKey, result, CACHE_TTL_MS)
    return result
}

const computeSimilarWords = async (db, term, max) => {
    const collection = db.collection(WORD_COLLECTION)
    if (await collection.findOne({word: term}, {projection: {_id: 1}})) return []

    const grams = trigrams(term)
    const len = {$gte: term.length - max, $lte: term.length + max}
    const [byGrams, bySound] = await Promise.all([
        collection.aggregate([
            {$match: {grams: {$in: grams}, len}},
            {$project: {word: 1, common: {$size: {$setIntersection: ['$grams', grams]}}}},
            {$sort: {common: -1}},
            {$limit: MAX_CANDIDATES}
        ], {maxTimeMS: TRIGRAM_QUERY_MAX_MS}).toArray().catch(e => {
            if (e && (e.code === 50 || e.codeName === 'MaxTimeMSExpired')) {
                console.warn(`search: trigram query for "${term}" stopped after ${TRIGRAM_QUERY_MAX_MS}ms`)
                return []
            }
            throw e
        }),
        collection.find({phon: colognePhonetic(term), len}, {projection: {word: 1}}).limit(MAX_CANDIDATES).toArray()
    ])
    const soundsAlike = new Set(bySound.map(w => w.word))
    const result = new Map()
    for (const {word} of [...byGrams, ...bySound]) {
        if (result.has(word)) continue
        // words that sound alike may differ a bit more ("maier" - "meyer")
        const allowed = soundsAlike.has(word) ? max + 1 : max
        const distance = editDistance(term, word, allowed)
        // with the same distance, words that sound alike come first
        if (distance <= allowed) result.set(word, {word, distance, rank: distance + (soundsAlike.has(word) ? 0 : 0.5)})
    }
    return [...result.values()]
        .sort((a, b) => a.rank - b.rank || a.word.length - b.word.length)
        .slice(0, MAX_CORRECTIONS)
        .map(({word, distance}) => ({word, distance}))
}

/**
 * Corrections for all terms of a query: {term: [word, ...]} (only terms that have corrections).
 */
export const findCorrections = async (db, terms) => {
    const corrections = {}
    await Promise.all([...new Set(terms)].map(async term => {
        const similar = await findSimilarWords(db, term)
        if (similar.length > 0) corrections[term] = similar.map(s => s.word)
    }))
    return corrections
}
