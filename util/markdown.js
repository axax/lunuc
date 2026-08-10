/**
 * Simple Markdown → HTML parser with support for:
 *   – protected URLs
 *   – images, links (with optional attributes)
 *   – code blocks & inline code
 *   – blockquotes, headings, bold/italic, horizontal rules
 *   – ordered & unordered lists (including nested continuation lines)
 *   – **GitHub‑flavour tables** (| … |)
 *   – final cleanup & paragraph wrapping
 */
const parser = md => {
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

        // build <tbody>
        const tbody = `<tbody>${bodyRows
            .map(cells => `<tr>${cells
                .map((c, i) => `<td${alignments[i] ? ` style="text-align:${alignments[i]}"` : ''}>${c}</td>`)
                .join('')}</tr>`)
            .join('')}</tbody>`;

        return `<table>${thead}${tbody}</table>`;
    };

    // -----------------------------------------------------------------
    // 3️⃣ Array of markdown rules (regex + replacement)
    // -----------------------------------------------------------------
    const mdRules = [
        /* ---------- Images inside links ---------- */
        [/\[!\[([^\]]*)\]\(%%URL(\d+)%%\)\]\(%%URL(\d+)%%\)/gm,
            (m, alt, img, lnk) =>
                `<a target='_blank' href='${urlPlaceholders[+lnk]}'><img src='${urlPlaceholders[+img]}' alt='${alt}' /></a>`],

        /* ---------- Stand‑alone images ---------- */
        [/!\[([^\]]*)\]\(%%URL(\d+)%%\)/gm,
            (m, alt, i) => `<img src='${urlPlaceholders[+i]}' alt='${alt}' />`],

        /* ---------- Links with attributes ---------- */
        [/\[([^\]]*)\]\(%%URL(\d+)%%\)\{:([^\}]*)\}/gm,
            (m, t, i, a) => `<a href='${urlPlaceholders[+i]}' ${a}>${t}</a>`],

        /* ---------- Plain links ---------- */
        [/\[([^\]]*)\]\(%%URL(\d+)%%\)/gm,
            (m, t, i) => `<a href='${urlPlaceholders[+i]}'>${t}</a>`],

        /* ---------- Code block (fenced) ---------- */
        [/```[a-z]*\n([\s\S]*?)\n```/g, "<pre>$1</pre>"],

        /* ---------- Inline code ---------- */
        [/`(.*?)`/gm, "<code>$1</code>"],

        /* ---------- Blockquote ---------- */
        [/^> ([^\n]*)$/gm, "<blockquote>$1</blockquote>"],

        /* ---------- Headings (h1‑h6) ---------- */
        [/^(#{1,6})(.*)$/gm, (m, h, p) => `<h${h.length}>${p.trim()}</h${h.length}>`],

        /* ---------- Bold (**, __) ---------- */
        [/\*\*(.*?)\*\*/gm, "<b>$1</b>"],
        [/__(.*?)__/gm, "<b>$1</b>"],

        /* ---------- Italic – *text* ---------- */
        [/\*([^\s*][^*\n]*?)\*/gm, "<i>$1</i>"],

        /* ---------- Italic – _text_ (protected against URL underscores) ---------- */
        [/(?<![="'a-zA-Z0-9\/])_([^_\n]+?)_(?![a-zA-Z0-9\/])/gm, "<i>$1</i>"],

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
    // -----------------------------------------------------------------
    parsed = parsed
        .replace(/<p><h([0-6])/g, '<h$1')
        .replace(/<\/h([0-6])><\/p>/g, '</h$1>')
        .replace(/<p><\/p>/g, '')
        .replace(/<br\s*\/?>\s*<\/p>/g, '</p>')
        .replace(/>\s*<br\s*\/>/g, '>')
        .replace(/\n+/g, '');   // drop any remaining raw newlines

    // -----------------------------------------------------------------
    // 6️⃣ Wrap the whole thing in a single <p> (mirrors original behaviour)
    // -----------------------------------------------------------------
    return '<p>' + parsed + '</p>';
};

export default parser;