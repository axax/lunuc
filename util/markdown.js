const parser = md => {
    // URLs vor Regex-Kollisionen schützen (Underscore-in-URL, ?query etc.)
    const urlPlaceholders = [];
    const protectedMd = md.replace(/https?:\/\/[^\s\)\"\']+/g, (url) => {
        urlPlaceholders.push(url);
        return `%%URL${urlPlaceholders.length - 1}%%`;
    });

    const mdRules = [
        /* Nested Image in Link */
        [/\[!\[([^\]]*)\]\(%%URL(\d+)%%\)\]\(%%URL(\d+)%%\)/gm,
            (m, alt, img, lnk) => `<a target='_blank' href='${urlPlaceholders[+lnk]}'><img src='${urlPlaceholders[+img]}' alt='${alt}' /></a>`],
        /* Image */
        [/!\[([^\]]*)\]\(%%URL(\d+)%%\)/gm,
            (m, alt, i) => `<img src='${urlPlaceholders[+i]}' alt='${alt}' />`],
        /* Link with attributes */
        [/\[([^\]]*)\]\(%%URL(\d+)%%\)\{:([^\}]*)\}/gm,
            (m, t, i, a) => `<a href='${urlPlaceholders[+i]}' ${a}>${t}</a>`],
        /* Link without attributes */
        [/\[([^\]]*)\]\(%%URL(\d+)%%\)/gm,
            (m, t, i) => `<a href='${urlPlaceholders[+i]}'>${t}</a>`],

        [/```[a-z]*\n([\s\S]*?)\n```/g, "<pre>$1</pre>"],
        [/`(.*?)`/gm, "<code>$1</code>"],
        [/^> ([^\n]*)$/gm, "<blockquote>$1</blockquote>"],
        [/^(#{1,6})(.*)$/gm, (m, h, p) => `<h${h.length}>${p.trim()}</h${h.length}>`],
        [/\*\*(.*?)\*\*/gm, "<b>$1</b>"],
        [/__(.*?)__/gm, "<b>$1</b>"],
        /* Italic: *text* (non-space erzwingt, dass Listen-Bullet "* " nicht matcht) */
        [/\*([^\s*][^*\n]*?)\*/gm, "<i>$1</i>"],
        /* Italic: _text_ (geschützt gegen URL-/Attribut-Underscores) */
        [/(?<![="'a-zA-Z0-9\/])_([^_\n]+?)_(?![a-zA-Z0-9\/])/gm, "<i>$1</i>"],
        [/^---\s*$/gm, "<hr/>"],

        /* Ordered List inkl. eingerückter Continuation- und Leerzeilen zwischen Items */
        [/\n\d+\.\s.*(?:\n[ \t]+\S.*)*(?:\n+\d+\.\s.*(?:\n[ \t]+\S.*)*)*/gm, m => {
            const items = m.replace(/^\n+/, "").split(/\n+(?=\d+\.\s)/);
            const lis = items.map(it =>
                "<li>" + it.replace(/^\d+\.\s*/, "")
                    .split("\n").map(l => l.trim()).filter(Boolean).join("<br/>") + "</li>"
            ).join("");
            return "<ol>" + lis + "</ol>";
        }],
        /* Unordered List analog */
        [/\n[-*+]\s.*(?:\n[ \t]+\S.*)*(?:\n+[-*+]\s.*(?:\n[ \t]+\S.*)*)*/gm, m => {
            const items = m.replace(/^\n+/, "").split(/\n+(?=[-*+]\s)/);
            const lis = items.map(it =>
                "<li>" + it.replace(/^[-*+]\s*/, "")
                    .split("\n").map(l => l.trim()).filter(Boolean).join("<br/>") + "</li>"
            ).join("");
            return "<ul>" + lis + "</ul>";
        }],

        [/\n\n/gm, "</p><p>"],
        [/\n(?!\s*<|$)/gm, "<br/>"]
    ];

    let parsed = mdRules.reduce((s, r) => s.replace(r[0], r[1]), protectedMd);

    parsed = parsed
        .replace(/<p><h([0-6])/g, '<h$1')
        .replace(/<\/h([0-6])><\/p>/g, '</h$1>')
        .replace(/<p><\/p>/g, '')
        .replace(/<br\s*\/?>\s*<\/p>/g, '</p>')
        .replace(/>\s*<br\s*\/>/g, '>')
        .replace(/\n+/g, '');   // restliche rohe Newlines entfernen

    return '<p>' + parsed + '</p>';
};

export default parser;
//console.log(parser('Hier sind die letzten beiden Bilder aus der Gruppe **Simbot**:\\n\\n1. [![Bild 1](https://www.lunuc.com/uploads/AgACAgQAAxkBAAJX-Wo-tgABbrcvWP7eumzM-km5zMSfUAAChg5rGybh-VGvpmwOfA882AEAAwIAA3kAAzwE?format=webp&quality=50&width=96)](https://www.lunuc.com/uploads/AgACAgQAAxkBAAJX-Wo-tgABbrcvWP7eumzM-km5zMSfUAAChg5rGybh-VGvpmwOfA882AEAAwIAA3kAAzwE)\\n   *Szene: Ein kleiner Junge sitzt auf einem hölzernen Steg an einem See.*\\n\\n2. [![Bild 2](https://www.lunuc.com/uploads/AgACAgQAAxkBAAJX92o-rqOEYeVAUai7hH1-htmfcH39AAJ2DmsbJuH5UdFCIP3r05SKAQADAgADeQADPAQ?format=webp&quality=50&width=96)](https://www.lunuc.com/uploads/AgACAgQAAxkBAAJX92o-rqOEYeVAUai7hH1-htmfcH39AAJ2DmsbJuH5UdFCIP3r05SKAQADAgADeQADPAQ)\\n   *Szene: Eine Frau und drei Kinder im Swimmingpool (\\"herrliches Wetter zum Geburtstag ☀️👌\\").*'))