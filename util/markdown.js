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
const parser = (md, options = {}) => {
    const escapeHtml = options.escapeHtml !== false;
    md = String(md == null ? '' : md);

    // -----------------------------------------------------------------
    // 0️⃣ Pull out <safe_html> blocks BEFORE escaping. The marker does NOT
    // mean "sanitized", it means "produced by the caller, may go into the DOM
    // as-is" (e.g. KaTeX output). Only the caller sets it – any occurrence
    // coming from the model is stripped there first.
    // The placeholder uses \u0000 because that character never appears in real
    // input and is not matched by any markdown rule.
    // -----------------------------------------------------------------
    const trusted = [];
    md = md.replace(/<safe_html>([\s\S]*?)<\/safe_html>/g, (m, inner) => {
        trusted.push(inner);
        return `\u0000H${trusted.length - 1}\u0000`;
    });
    // an unpaired, still-open <safe_html> (aborted stream) must not survive as markup
    md = md.replace(/<\/?safe_html>/g, '');

    if (escapeHtml) {
        md = md
            .replace(/&(?!#?\w+;)/g, '&amp;')   // don't double-escape existing entities
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // -----------------------------------------------------------------
    // 1️⃣ Protect URLs from being mangled by later regexes
    // -----------------------------------------------------------------
    const urlPlaceholders = [];
    const protectedMd = md.replace(/\]\(([^)]+)\)/g, (m, url) => {
        urlPlaceholders.push(url.trim());
        // placeholder will be replaced later with the real URL
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
    // 3️⃣ Array of markdown rules (regex + replacement)
    // -----------------------------------------------------------------
    const mdRules = [
        /* ---------- Images inside links ---------- */
        [/\[!\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]\(%%URL(\d+)%%\)\]\(%%URL(\d+)%%\)/gm,
            (m, alt, img, lnk) =>
                `<a target='_blank' href='${urlPlaceholders[+lnk]}'><img src='${urlPlaceholders[+img]}' alt='${alt}' /></a>`],

        /* ---------- Stand-alone images ---------- */
        [/!\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]\(%%URL(\d+)%%\)/gm,
            (m, alt, i) => `<img src='${urlPlaceholders[+i]}' alt='${alt}' />`],

        /* ---------- Links with attributes ---------- */
        [/\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]\(%%URL(\d+)%%\)\{:([^}]*)\}/gm,
            (m, t, i, a) => `<a href='${urlPlaceholders[+i]}' ${a}>${t}</a>`],

        /* ---------- Plain links ---------- */
        [/\[((?:[^\[\]\n]|\[[^\]\n]*\])*)\]\(%%URL(\d+)%%\)/gm,
            (m, t, i) => `<a href='${urlPlaceholders[+i]}'>${t}</a>`],

        /* ---------- Code block (fenced) ---------- */
        [/```[a-z]*\n([\s\S]*?)\n\s*```/g, "<pre>$1</pre>"],

        /* ---------- Inline code ---------- */
        [/`(.*?)`/gm, "<code>$1</code>"],

        /* ---------- Blockquote ---------- */
        // "&gt;" is accepted as well: with escapeHtml on, a typed ">" has already
        // been escaped by the time this rule runs.
        [/^(?:>|&gt;) ([^\n]*)$/gm, "<blockquote>$1</blockquote>"],

        /* ---------- Headings (h1‑h6) ---------- */
        [/^(#{1,6})(.*)$/gm, (m, h, p) => `<h${h.length}>${p.trim()}</h${h.length}>`],

        /* ---------- Bold (**, __) ---------- */
        [/\*\*(.*?)\*\*/gm, "<b>$1</b>"],
        [/__(.*?)__/gm, "<b>$1</b>"],

        /* ---------- Italic – *text* ---------- */
        [/\*([^\s*][^*\n]*?)\*/gm, "<i>$1</i>"],

        /* ---------- Italic – _text_ (protected against URL underscores) ---------- */
        [/(^|[^="'a-zA-Z0-9\/])_([^_\n]+?)_(?![a-zA-Z0-9\/])/gm, "$1<i>$2</i>"],

        /* ---------- Horizontal rule ---------- */
        [/^---\s*$/gm, "<hr/>"],

        /* ---------- **Tables** (GitHub‑flavour) ---------- */
        [
            // Captures:
            //   1️⃣ header block (one or more lines that contain at least one '|')
            //   2️⃣ alignment separator line (---, :---, etc.)
            //   3️⃣ optional body rows
            /((?:\|?.*\|.*\n)+?)\|? *-+:?-+(?:\| *-+:?-+)*\|?\n((?:\|?.*\|.*\n?)*)/gm,
            (m, headerBlock, bodyBlock) => {
                // Re‑assemble a minimal markdown table string for the helper
                const tableMd = `${headerBlock.trim()}\n${bodyBlock.trim()}`;
                return markdownTableToHtml(tableMd);
            }
        ],

        /* ---------- Ordered list (including continuation lines) ---------- */
        [/\n\d+\.\s.*(?:\n[ \t]+\S.*)*(?:\n+\d+\.\s.*(?:\n[ \t]+\S.*)*)*/gm, m => {
            const items = m.replace(/^\n+/, "").split(/\n+(?=\d+\.\s)/);
            const lis = items.map(it =>
                "<li>" + it.replace(/^\d+\.\s*/, "")
                    .split("\n").map(l => l.trim()).filter(Boolean).join("<br/>") + "</li>"
            ).join("");
            return "<ol>" + lis + "</ol>";
        }],

        /* ---------- Unordered list (including continuation lines) ---------- */
        [/\n[-*+]\s.*(?:\n[ \t]+\S.*)*(?:\n+[-*+]\s.*(?:\n[ \t]+\S.*)*)*/gm, m => {
            const items = m.replace(/^\n+/, "").split(/\n+(?=[-*+]\s)/);
            const lis = items.map(it =>
                "<li>" + it.replace(/^[-*+]\s*/, "")
                    .split("\n").map(l => l.trim()).filter(Boolean).join("<br/>") + "</li>"
            ).join("");
            return "<ul>" + lis + "</ul>";
        }],

        /* ---------- Paragraph breaks (double newline) ---------- */
        [/\n\n/gm, "</p><p>"],

        /* ---------- Single newline → <br/> (unless already inside a tag) ---------- */
        [/\n(?!\s*<|$)/gm, "<br/>"]
    ];

    // -----------------------------------------------------------------
    // 4️⃣ Apply every rule sequentially
    // -----------------------------------------------------------------
    let parsed = mdRules.reduce((s, r) => s.replace(r[0], r[1]), protectedMd);

    // -----------------------------------------------------------------
    // 5️⃣ Clean‑up: fix stray paragraph tags around headings, remove empty tags, etc.
    //     The trusted <safe_html> fragments are put back last, so no markdown rule
    //     and no cleanup step ever touches them.
    // -----------------------------------------------------------------
    parsed = parsed
        .replace(/<p><h([0-6])/g, '<h$1')
        .replace(/<\/h([0-6])><\/p>/g, '</h$1>')
        .replace(/<p><\/p>/g, '')
        .replace(/<br\s*\/?>\s*<\/p>/g, '</p>')
        .replace(/>\s*<br\s*\/>/g, '>')
        .replace(/\n+/g, '')
        .replace(/%%URL(\d+)%%/g, (m, i) => urlPlaceholders[+i])
        .replace(/\u0000H(\d+)\u0000/g, (m, i) => trusted[+i]);

    // -----------------------------------------------------------------
    // 6️⃣ Wrap the whole thing in a single <p> (mirrors original behaviour)
    // -----------------------------------------------------------------
    return '<p>' + parsed + '</p>';
};

export default parser;