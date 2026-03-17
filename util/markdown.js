const parser = md => {
    const mdRules = [

        /* Nested Image in Link: [![alt](img.jpg)](link.html) */
        [/\[!\[([^\]]*)\]\(([^)]*)\)\]\(([^)]*)\)/gm, "<a href='$3'><img src='$2' alt='$1' /></a>"],

        /* Image */
        [/!\[(.*)\]\((.*)\)/gm, "<img src='$2' alt='$1' />"],

        /* Link with attributes */
        [/\[([^\]]*)\]\(([^\)]*)\)\{:([^\}]*)\}/gm, "<a href='$2' $3>$1</a>"],

        /* Link without attributes */
        [/\[(.*)\]\((.*)\)/gm, "<a href='$2'>$1</a>"],

        /* Multiline Code */
        [/```[a-z]*\n([\s\S]*?)\n```/g, "<pre>$1</pre>"],

        /* Inline Code */
        [/`(.*?)`/gm, "<code>$1</code>"],

        /* Blockquote */
        [/^> ([^\n]*)$/gm, "<blockquote>$1</blockquote>"],

        /* Headings */
        [/^(#{1,6})(.*)$/gm, (m,h,p) => {
            const l = h.length;
            return "<h" + l + ">" + p.trim() + "</h" + l + ">";
        }],

        /* Bold */
        [/\*\*(.*?)\*\*/gm, "<b>$1</b>"],
        [/__(.*?)__/gm, "<b>$1</b>"],

        /* Italic */
        [/(?<!\\)_(.*?)_/gm, "<i>$1</i>"],

        /* Divider */
        [/^---\s*$/gm, "<hr/>"],

        /* Unordered List */
        [/(\n[-*+]\s.*)+/gm, m => {
            let s = "";
            m.substr(1).split("\n").forEach(z => s += "<li>" + z.substr(2).trim() + "</li>");
            return "<ul>" + s + "</ul>";
        }],

        /* Ordered List */
        [/(\n\d+\.\s.*)+/gm, m => {
            let s = "";
            m.substr(1).split("\n").forEach(z => s += "<li>" + z.substr(3).trim() + "</li>");
            return "<ol>" + s + "</ol>";
        }],

        [/\n\n/gm, "</p><p>"],

        [/\n(?!\s*<|$)/gm, "<br/>"]  // Single linebreaks to <br>, but not before tags or end
    ];

    let parsed = mdRules.reduce((md, rule) => {
        if (typeof rule[1] === 'function') {
            return md.replace(rule[0], rule[1]);
        }
        return md.replace(rule[0], rule[1]);
    }, md);

    // Post-processing: Clean up p tags around headings and blocks
    parsed = parsed
        .replace(/<p><h([0-6])/g, '<h$1')
        .replace(/<\/h([0-6])><\/p>/g, '</h$1>')
        .replace(/<p><\/p>/g, '')  // Remove empty p tags
        .replace(/<br\s*\/?>\s*<\/p>/g, '</p>')  // Clean trailing br in p
        .replace(/>\s*<br\s*\/>/g, '>');

    return '<p>' + parsed + '</p>';
};

export default parser;
