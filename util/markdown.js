/**
 * Simple Markdown → HTML parser with support for:
 *   – protected URLs
 *   – images, links (with optional attributes)
 *   – code blocks & inline code
 *   – blockquotes, headings, bold/italic, horizontal rules
 *   – ordered & unordered lists (including nested continuation lines)
 *   – **GitHub‑flavour tables** (| … |)
 *   – final cleanup & paragraph wrapping
 *
 * Untrusted input (LLM output, user text) is HTML-escaped by default, so a
 * literal tag such as `<style>` can never become real, unclosed markup that
 * swallows everything after it. Caller-produced HTML (KaTeX output) is passed
 * through a <safe_html> marker – see step 0 below.
 *
 * @param md        Markdown source (untrusted)
 * @param options   { escapeHtml: true } – escapeHtml:false restores the old
 *                  behaviour (raw HTML passes through). Needed for callers that
 *                  intentionally put HTML into markdown fields.
 */

// 0️⃣ Pre-processing Regex
const RX_SAFE_HTML = /<safe_html>([\s\S]*?)<\/safe_html>/g;
const RX_SAFE_HTML_ORPHAN = /<\/?safe_html>/g;
const RX_AMP = /&(?!#?\w+;)/g;
const RX_LT = /</g;
const RX_GT = />/g;

// 1️⃣ URL Protection Regex
const RX_URL_PROTECT = /\]\(([^)]+)\)/g;

// 3️⃣ Markdown Rules Regex
const RX_IMG_LINK = /\[!\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]\(%%URL(\d+)%%\)\]\(%%URL(\d+)%%\)/gm;
const RX_IMG_ALONE = /!\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]\(%%URL(\d+)%%\)/gm;
const RX_LINK_ATTR = /\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]\(%%URL(\d+)%%\)\{:([^}]*)\}/gm;
const RX_LINK_PLAIN = /\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]\(%%URL(\d+)%%\)/gm;
const RX_FENCED_CODE = /```[a-z]*\n([\s\S]*?)\n\s*```/g;
const RX_BLOCKQUOTE = /^(?:>|&gt;) ([^\n]*)$/gm;
const RX_HEADING = /^(#{1,6})(.*)$/gm;

const RX_BOLD = /(\*\*|__)(.*?)\1/gm;

const RX_ITALIC_AST = /\*([^\s*][^*\n]*?)\*/gm;
const RX_ITALIC_UND = /(^|[^="'a-zA-Z0-9\/])_([^_\n]+?)_(?![a-zA-Z0-9\/])/gm;
const RX_HR = /^---\s*$/gm;
const RX_TABLE = /((?:\|?.*\|.*\n)+?)\|? *-+:?-+(?:\| *-+:?-+)*\|?\n((?:\|?.*\|.*\n?)*)/gm;
const RX_LIST_OL = /\n\d+\.\s.*(?:\n[ \t]+\S.*)*(?:\n+\d+\.\s.*(?:\n[ \t]+\S.*)*)*/gm;
const RX_LIST_UL = /\n[-*+]\s.*(?:\n[ \t]+\S.*)*(?:\n+[-*+]\s.*(?:\n[ \t]+\S.*)*)*/gm;
const RX_P_BREAK = /\n\n/gm;
const RX_BR = /\n(?!\s*<|$)/gm;

// 5️⃣ Cleanup Regex
const RX_CLEAN_H_OPEN = /<p><h([0-6])/g;
const RX_CLEAN_H_CLOSE = /<\/h([0-6])><\/p>/g;
const RX_CLEAN_EMPTY_P = /<p><\/p>/g;
const RX_CLEAN_BR_P = /<br\s*\/?>\s*<\/p>/g;
const RX_CLEAN_GT_BR = />\s*<br\s*\/>/g;
const RX_CLEAN_NEWLINES = /\n+/g;
const RX_RESTORE_URL = /%%URL(\d+)%%/g;
const RX_RESTORE_HTML = /\u0000H(\d+)\u0000/g;


const parser = (md, options = {}) => {
    const escapeHtml = options.escapeHtml !== false;
    md = String(md == null ? '' : md);

    // -----------------------------------------------------------------
    // 0️⃣ Pull out <safe_html> blocks (now using the global Regex variables)
    // -----------------------------------------------------------------
    const trusted = [];
    md = md.replace(RX_SAFE_HTML, (m, inner) => {
        trusted.push(inner);
        return `\u0000H${trusted.length - 1}\u0000`;
    });
    md = md.replace(RX_SAFE_HTML_ORPHAN, '');

    if (escapeHtml) {
        md = md.replace(RX_AMP, '&amp;').replace(RX_LT, '&lt;').replace(RX_GT, '&gt;');
    }

    // -----------------------------------------------------------------
    // 1️⃣ Protect URLs
    // -----------------------------------------------------------------
    const urlPlaceholders = [];
    const protectedMd = md.replace(RX_URL_PROTECT, (m, url) => {
        urlPlaceholders.push(url.trim());
        return `](%%URL${urlPlaceholders.length - 1}%%)`;
    });

    // -----------------------------------------------------------------
    // 2️⃣ Helper: turn a Markdown table string into an HTML <table>
    // -----------------------------------------------------------------
    const markdownTableToHtml = tableMd => {
        // split into lines, drop empty ones
        const lines = tableMd.trim().split('\n').filter(l => l.trim() !== '');

        // ----- header -------------------------------------------------
        const headerCells = lines[0]
            .replace(/^\|/, '')   // remove leading pipe
            .replace(/\|$/, '')   // remove trailing pipe
            .split('|')
            .map(c => c.trim());

        // Plain-text version of the headers for data-label: strip any inline HTML
        // that may already be present (<b>, <code>, …) and escape attribute
        // special characters, so content:attr(data-label) in the mobile card
        // layout shows clean text instead of raw markup.
        const headerLabels = headerCells.map(c =>
            c.replace(/<[^>]*>/g, '')
                .replace(/\u0000H\d+\u0000/g, '')   // never let a placeholder into an attribute
                .replace(/&(?!#?\w+;)/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
        );

        // ----- alignment row (---, :---, :---:, ---:) -------------------
        const alignLine = lines[1];
        const alignments = alignLine
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map(c => {
                const t = c.trim();
                if (/^:-+$/.test(t)) return 'left';
                if (/^:-+:$/.test(t)) return 'center';
                if (/^-+:$/.test(t)) return 'right';
                return null; // default alignment
            });

        // ----- body rows -----------------------------------------------
        const bodyRows = lines.slice(2).map(row => {
            const cells = row
                .replace(/^\|/, '')
                .replace(/\|$/, '')
                .split('|')
                .map(c => c.trim());
            return cells;
        });

        // build <thead>
        const thead = `<thead><tr>${headerCells
            .map((c, i) => `<th${alignments[i] ? ` style="text-align:${alignments[i]}"` : ''}>${c}</th>`)
            .join('')}</tr></thead>`;

        // build <tbody> — each <td> gets its data-label attached right away
        const tbody = `<tbody>${bodyRows
            .map(cells => `<tr>${cells
                .map((c, i) => {
                    const label = headerLabels[i];
                    return `<td${alignments[i] ? ` style="text-align:${alignments[i]}"` : ''}${label ? ` data-label="${label}"` : ''}>${c}</td>`;
                })
                .join('')}</tr>`)
            .join('')}</tbody>`;

        return `<table>${thead}${tbody}</table>`;
    };

    // -----------------------------------------------------------------
    // 2️⃣b Helper: inline code spans (Highly optimized, zero side-effects)
    // -----------------------------------------------------------------
    const parseInlineCode = (str) => {
        let result = '';
        let cursor = 0;

        while (cursor < str.length) {
            // 1. Find the start of the next backtick sequence
            const openIdx = str.indexOf('`', cursor);
            if (openIdx === -1) {
                // No more backticks found. Append the rest of the string and finish.
                result += str.slice(cursor);
                break;
            }

            // 2. Count consecutive backticks to determine the length of the opening delimiter
            let runLen = 1;
            while (openIdx + runLen < str.length && str[openIdx + runLen] === '`') {
                runLen++;
            }

            // 3. Search for a matching closing delimiter of the EXACT same length
            const delimiter = '`'.repeat(runLen);
            let searchIdx = openIdx + runLen;
            let closeIdx = -1;

            while (searchIdx < str.length) {
                const matchIdx = str.indexOf(delimiter, searchIdx);
                if (matchIdx === -1) break; // No closing delimiter exists

                // Ensure the matched delimiter isn't just the beginning of an even longer sequence.
                // We check if the character immediately following our match is also a backtick.
                if (str[matchIdx + runLen] !== '`') {
                    // Valid closing delimiter found
                    closeIdx = matchIdx;
                    break;
                } else {
                    // The matched sequence is too long. Skip past this entire block of backticks.
                    let skipIdx = matchIdx + runLen;
                    while (skipIdx < str.length && str[skipIdx] === '`') {
                        skipIdx++;
                    }
                    searchIdx = skipIdx;
                }
            }

            // 4. Append the parsed HTML or treat the unpaired backticks as literal text
            if (closeIdx !== -1) {
                // Valid code block found: Append text before the code block
                result += str.slice(cursor, openIdx);

                // Extract inner content and preserve explicit escaped newlines
                const content = str.slice(openIdx + runLen, closeIdx).replace(/\\\n/g, '\\n');
                result += `<code>${content}</code>`;

                // Move the cursor past the closing delimiter
                cursor = closeIdx + runLen;
            } else {
                // Unpaired opening run: Treat the backticks as literal text
                result += str.slice(cursor, openIdx + runLen);

                // Move the cursor past the current unmatched run to evaluate the next ones
                cursor = openIdx + runLen;
            }
        }

        return result;
    };

    // -----------------------------------------------------------------
    // 3️⃣ Array of markdown rules (now using the global Regex variables)
    // -----------------------------------------------------------------
    const mdRules = [
        [RX_IMG_LINK, (m, alt, img, lnk) => `<a target='_blank' href='${urlPlaceholders[+lnk]}'><img src='${urlPlaceholders[+img]}' alt='${alt}' /></a>`],
        [RX_IMG_ALONE, (m, alt, i) => `<img src='${urlPlaceholders[+i]}' alt='${alt}' />`],
        [RX_LINK_ATTR, (m, t, i, a) => `<a href='${urlPlaceholders[+i]}' ${a}>${t}</a>`],
        [RX_LINK_PLAIN, (m, t, i) => `<a href='${urlPlaceholders[+i]}'>${t}</a>`],
        [RX_FENCED_CODE, "<pre>$1</pre>"],

        parseInlineCode,

        [RX_BLOCKQUOTE, "<blockquote>$1</blockquote>"],
        [RX_HEADING, (m, h, p) => `<h${h.length}>${p.trim()}</h${h.length}>`],

        // Both bold rules were combined into one:
        [RX_BOLD, "<b>$2</b>"],

        [RX_ITALIC_AST, "<i>$1</i>"],
        [RX_ITALIC_UND, "$1<i>$2</i>"],
        [RX_HR, "<hr/>"],
        [RX_TABLE, (m, headerBlock, bodyBlock) => markdownTableToHtml(`${headerBlock.trim()}\n${bodyBlock.trim()}`)],

        /* ---------- Ordered list (including continuation lines) ---------- */
        [RX_LIST_OL, m => {
            const items = m.replace(/^\n+/, "").split(/\n+(?=\d+\.\s)/);
            const lis = items.map(it =>
                "<li>" + it.replace(/^\d+\.\s*/, "")
                    .split("\n").map(l => l.trim()).filter(Boolean).join("<br/>") + "</li>"
            ).join("");
            return "<ol>" + lis + "</ol>";
        }],

        /* ---------- Unordered list (including continuation lines) ---------- */
        [RX_LIST_UL, m => {
            const items = m.replace(/^\n+/, "").split(/\n+(?=[-*+]\s)/);
            const lis = items.map(it =>
                "<li>" + it.replace(/^[-*+]\s*/, "")
                    .split("\n").map(l => l.trim()).filter(Boolean).join("<br/>") + "</li>"
            ).join("");
            return "<ul>" + lis + "</ul>";
        }],


        [RX_P_BREAK, "</p><p>"],
        [RX_BR, "<br/>"]
    ];

    // 4️⃣ Apply every rule
    let parsed = mdRules.reduce((s, r) => (typeof r === 'function' ? r(s) : s.replace(r[0], r[1])), protectedMd);

    // 5️⃣ Clean‑up (now using the global Regex variables)
    parsed = parsed
        .replace(RX_CLEAN_H_OPEN, '<h$1')
        .replace(RX_CLEAN_H_CLOSE, '</h$1>')
        .replace(RX_CLEAN_EMPTY_P, '')
        .replace(RX_CLEAN_BR_P, '</p>')
        .replace(RX_CLEAN_GT_BR, '>')
        .replace(RX_CLEAN_NEWLINES, ' ')
        .replace(RX_RESTORE_URL, (m, i) => urlPlaceholders[+i])
        .replace(RX_RESTORE_HTML, (m, i) => trusted[+i]);

    return '<p>' + parsed + '</p>';
};

export default parser;