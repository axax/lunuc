// Sprache von Untertiteln erraten – gemeinsam genutzt von background.js, offscreen.js und popup.js
// Erkennt Parameter (?lang=fr), Codes ("film_en.srt", "subs.de-CH.vtt") und Sprachnamen irgendwo im Dateinamen
// ("60625-S01-E02-french-5d252b3469e80723.vtt", "Deutsch", "Français" im HLS-NAME)
const LANG_NAMES = {
    de: ['german', 'deutsch', 'ger', 'deu', 'allemand', 'tedesco', 'aleman'],
    gsw: ['swissgerman', 'schweizerdeutsch', 'mundart', 'dialekt'],
    en: ['english', 'englisch', 'eng', 'anglais', 'inglese', 'ingles'],
    fr: ['french', 'francais', 'franzosisch', 'fre', 'fra', 'francese', 'frances'],
    it: ['italian', 'italienisch', 'italiano', 'italien', 'ita'],
    es: ['spanish', 'spanisch', 'espanol', 'castellano', 'espagnol', 'spagnolo', 'spa'],
    pt: ['portuguese', 'portugiesisch', 'portugues', 'por'],
    nl: ['dutch', 'niederlandisch', 'nederlands', 'nld', 'dut'],
    rm: ['romansh', 'romanisch', 'rumantsch', 'roh'],
    pl: ['polish', 'polnisch', 'polski', 'pol'],
    ru: ['russian', 'russisch', 'rus'],
    tr: ['turkish', 'turkisch', 'turkce', 'tur'],
    ja: ['japanese', 'japanisch', 'jpn'],
    zh: ['chinese', 'chinesisch', 'mandarin', 'zho', 'chi'],
    ko: ['korean', 'koreanisch', 'kor'],
    ar: ['arabic', 'arabisch', 'ara'],
    sv: ['swedish', 'schwedisch', 'svenska', 'swe'],
    da: ['danish', 'danisch', 'dansk', 'dan'],
    no: ['norwegian', 'norwegisch', 'norsk', 'nor', 'nob'],
    fi: ['finnish', 'finnisch', 'suomi', 'fin'],
    cs: ['czech', 'tschechisch', 'cesky', 'ces', 'cze'],
    hu: ['hungarian', 'ungarisch', 'magyar', 'hun'],
    el: ['greek', 'griechisch', 'ell', 'gre'],
    he: ['hebrew', 'hebraisch', 'heb'],
    uk: ['ukrainian', 'ukrainisch', 'ukr'],
    hr: ['croatian', 'kroatisch', 'hrv'],
    sr: ['serbian', 'serbisch', 'srp'],
    ro: ['romanian', 'rumanisch', 'ron', 'rum'],
    hi: ['hindi', 'hin'],
    th: ['thai', 'tha'],
    vi: ['vietnamese', 'vietnamesisch', 'vie'],
    id: ['indonesian', 'indonesisch', 'ind']
}
const LANG_LOOKUP = {}
for (const [code, names] of Object.entries(LANG_NAMES)) {
    LANG_LOOKUP[code] = code
    names.forEach(n => { LANG_LOOKUP[n] = code })
}
// zweistellige Codes, die in Dateinamen oft etwas anderes bedeuten, nur am Ende vor der Endung akzeptieren
const LANG_AMBIGUOUS = new Set(['no', 'id', 'it', 'he', 'hi', 'th'])

function normalizeLangToken(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Einen einzelnen Wert (Code oder Name, z. B. "fr", "de-CH", "Français", "fre") in einen Code umwandeln
function langFromValue(value) {
    const v = normalizeLangToken(value).trim()
    if (!v) return ''
    const [base, region] = v.split(/[-_\s]/)
    if (LANG_LOOKUP[v.replace(/[^a-z]/g, '')]) return LANG_LOOKUP[v.replace(/[^a-z]/g, '')]
    if (LANG_LOOKUP[base]) return LANG_LOOKUP[base] + (region && /^[a-z]{2}$/.test(region) && base.length === 2 ? '-' + region : '')
    return ''
}

// Sprache aus einer URL bzw. einem Dateinamen
function langFromUrl(url) {
    let path = String(url || ''), params = null
    try {
        const u = new URL(url)
        path = u.pathname
        params = u.searchParams
    } catch (e) {}
    if (params) {
        const p = params.get('lang') || params.get('language') || params.get('lng') || params.get('hl')
        if (p) return langFromValue(p) || p.toLowerCase().slice(0, 5)
    }
    let file = path.split('/').pop() || ''
    try { file = decodeURIComponent(file) } catch (e) {}
    file = normalizeLangToken(file).replace(/\.(vtt|webvtt|srt|m3u8|ttml|dfxp|xml)$/, '')
    const tokens = file.split(/[^a-z0-9]+/).filter(Boolean)
    // von hinten suchen: die Sprache steht meist nach Titel/Staffel/Folge
    for (let i = tokens.length - 1; i >= 0; i--) {
        const t = tokens[i]
        if (/\d/.test(t)) continue
        const code = LANG_LOOKUP[t]
        if (!code) continue
        if (t.length === 2 && LANG_AMBIGUOUS.has(t) && i !== tokens.length - 1) continue
        // "de-CH" / "pt_BR"
        const next = tokens[i + 1]
        return t.length === 2 && next && /^[a-z]{2}$/.test(next) && i + 1 === tokens.length - 1 && !LANG_LOOKUP[next] ? code + '-' + next : code
    }
    // auch Ordnernamen prüfen (".../french/sub.vtt", ".../fr/index.m3u8")
    const dirs = path.split('/').slice(0, -1).reverse()
    for (const d of dirs) {
        const t = normalizeLangToken(d)
        if (t.length > 2 && LANG_LOOKUP[t]) return LANG_LOOKUP[t]
        if (/^[a-z]{2}(-[a-z]{2})?$/.test(t) && LANG_LOOKUP[t.slice(0, 2)] && !LANG_AMBIGUOUS.has(t.slice(0, 2))) return t
    }
    return ''
}

// Erster Treffer aus mehreren Hinweisen: Attributwert, Name, URL …
function guessLang(...hints) {
    for (const h of hints) {
        if (!h) continue
        const code = /[/.]/.test(h) ? langFromUrl(h) : langFromValue(h)
        if (code) return code
    }
    return ''
}

// ---------- Sprache aus dem Inhalt der Untertitel ----------
// häufige, möglichst eindeutige Wörter pro Sprache
const LANG_STOPWORDS = {
    de: 'der die das und ist nicht ich du sie wir ein eine zu mit auf für den dem was wie auch noch hier jetzt mir dich mich doch schon nur aber ja nein habe hast bin bist sind wenn kann gut',
    en: 'the and you is to of it that what this are have be not your we he she was for with on just know do can will my me all there right get here',
    fr: 'le la les et est je tu vous pas que qui un une des du ce il elle on dans pour avec mais moi oui non suis sais rien bien fait toi',
    it: 'il lo la che non è e di un una per sono ho ma cosa questo sei io tu lui lei mi ti ci perché come bene sì hai gli anche',
    es: 'el la los las que de y no es en un una por qué lo me te se pero yo tú está para con eso esto muy bien sí hay estoy',
    pt: 'o a os as que de e não é um uma em para com você eu se mas está isso muito bem sim tem estou foi ele ela',
    nl: 'de het een en is niet ik je wat dat van zijn we hij ze met op maar dit er heb ben jij kan wel nee',
    sv: 'och att det är jag du inte en som på har med för vad han hon vi kan så här',
    da: 'og at det er jeg du ikke en som på har med for hvad han hun vi kan så her',
    pl: 'nie to się jest że na co jak ale tak mi czy już jestem go ty ja',
    tr: 've bir bu ne için ben sen değil çok var mı da de o',
}
const LANG_WORDSETS = Object.fromEntries(Object.entries(LANG_STOPWORDS).map(([k, v]) => [k, new Set(v.split(' '))]))

function langFromText(text) {
    if (!text) return ''
    const body = String(text).slice(0, 40000)
        .replace(/^﻿?WEBVTT[^\n]*\n/, '')
        .replace(/^.*-->.*$/gm, '')       // Zeitangaben
        .replace(/^\s*\d+\s*$/gm, '')     // SRT-Nummern
        .replace(/<[^>]*>|\{[^}]*\}/g, ' ') // Tags
        .replace(/^(NOTE|STYLE|REGION)\b[\s\S]*?(\n\n|$)/gm, '')

    // Schriftsysteme
    const count = re => (body.match(re) || []).length
    const letters = count(/\p{L}/gu) || 1
    const scripts = [
        ['ko', /\p{Script=Hangul}/gu], ['ja', /[\p{Script=Hiragana}\p{Script=Katakana}]/gu], ['zh', /\p{Script=Han}/gu],
        ['ar', /\p{Script=Arabic}/gu], ['he', /\p{Script=Hebrew}/gu], ['el', /\p{Script=Greek}/gu],
        ['th', /\p{Script=Thai}/gu], ['ru', /\p{Script=Cyrillic}/gu]
    ]
    for (const [code, re] of scripts) {
        if (count(re) / letters > 0.3) {
            if (code === 'ru' && count(/[іїєґІЇЄҐ]/g) > 3) return 'uk'
            return code
        }
    }

    // Wortstatistik
    const words = body.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean)
    if (words.length < 20) return ''
    const scores = Object.entries(LANG_WORDSETS)
        .map(([code, set]) => [code, words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0)])
        .sort((a, b) => b[1] - a[1])
    const [best, second] = scores
    // eindeutig genug: genügend Treffer und klarer Abstand zur zweitbesten Sprache
    if (best[1] >= 8 && best[1] / words.length >= 0.08 && best[1] >= second[1] * 1.5) return best[0]
    return ''
}

// ---------- keine echten Untertitel ----------
// Vorschaubilder für die Zeitleiste (Thumbnail-Sprites) und Kapitel/Metadaten sind ebenfalls WebVTT-Dateien
const NON_SUBTITLE_URL = /thumb|sprite|storyboard|preview|trickplay|scrub|chapter|kapitel|metadata/i

function isNonSubtitleUrl(url) {
    try { return NON_SUBTITLE_URL.test(new URL(url).pathname.split('/').pop()) } catch (e) { return NON_SUBTITLE_URL.test(String(url || '')) }
}

// true, wenn die Einträge überwiegend Bildverweise sind ("thumb0000.jpg#xywh=0,0,160,90")
function isThumbnailVtt(text) {
    const cues = String(text || '').replace(/\r/g, '').split(/\n{2,}/)
        .map(b => b.split('\n')).filter(l => l.some(x => x.includes('-->')))
        .map(l => l.slice(l.findIndex(x => x.includes('-->')) + 1).join(' ').trim()).filter(Boolean)
    if (!cues.length) return false
    const images = cues.filter(c => /^\S+\.(jpe?g|png|webp|gif|avif)(\?\S*)?(#\S*)?$/i.test(c) || /#xywh=/i.test(c)).length
    return images / cues.length > 0.5
}
