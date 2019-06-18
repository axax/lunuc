
const TAGS = {
    '' : ['<em>','</em>'],
    _ : ['<strong>','</strong>'],
    '~' : ['<s>','</s>'],
    '\n' : ['<br />'],
    ' ' : ['<br />'],
    '-': ['<hr />']
};

/** Outdent a string based on the first indented line's leading whitespace
 *	@private
 */
function outdent(str) {
    return str.replace(RegExp('^'+(str.match(/^(\t| )+/) || '')[0], 'gm'), '');
}

/** Encode special attribute characters to HTML entities in a String.
 *	@private
 */
function encodeAttr(str) {
    return (str+'').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Parse Markdown into an HTML String. */
function parse1(md, prevLinks) {
    let tokenizer = /((?:^|\n+)(?:\n---+|\* \*(?: \*)+)\n)|(?:^``` *(\w*)\n([\s\S]*?)\n```$)|((?:(?:^|\n+)(?:\t|  {2,}).+)+\n*)|((?:(?:^|\n)([>*+-]|\d+\.)\s+.*)+)|(?:\!\[([^\]]*?)\]\(([^\)]+?)\))|(\[)|(\](?:\(([^\)]+?)\))?)|(?:(?:^|\n+)([^\s].*)\n(\-{3,}|={3,})(?:\n+|$))|(?:(?:^|\n+)(#{1,6})\s*(.+)(?:\n+|$))|(?:`([^`].*?)`)|(  \n\n*|\n{2,}|__|\*\*|[_*]|~~)/gm,
        context = [],
        out = '',
        links = prevLinks || {},
        last = 0,
        chunk, prev, token, inner, t;

    function tag(token) {
        var desc = TAGS[token.replace(/\*/g,'_')[1] || ''],
            end = context[context.length-1]==token;
        if (!desc) return token;
        if (!desc[1]) return desc[0];
        context[end?'pop':'push'](token);
        return desc[end|0];
    }

    function flush() {
        let str = '';
        while (context.length) str += tag(context[context.length-1]);
        return str;
    }

    md = md.replace(/^\[(.+?)\]:\s*(.+)$/gm, (s, name, url) => {
        links[name.toLowerCase()] = url;
        return '';
    }).replace(/^\n+|\n+$/g, '');

    while ( (token=tokenizer.exec(md)) ) {
        prev = md.substring(last, token.index);
        last = tokenizer.lastIndex;
        chunk = token[0];
        if (prev.match(/[^\\](\\\\)*\\$/)) {
            // escaped
        }
        // Code/Indent blocks:
        else if (token[3] || token[4]) {
            chunk = '<pre class="code '+(token[4]?'poetry':token[2].toLowerCase())+'">'+outdent(encodeAttr(token[3] || token[4]).replace(/^\n+|\n+$/g, ''))+'</pre>';
        }
        // > Quotes, -* lists:
        else if (token[6]) {
            t = token[6];
            if (t.match(/\./)) {
                token[5] = token[5].replace(/^\d+/gm, '');
            }
            inner = parse(outdent(token[5].replace(/^\s*[>*+.-]/gm, '')));
            if (t==='>') t = 'blockquote';
            else {
                t = t.match(/\./) ? 'ol' : 'ul';
                inner = inner.replace(/^(.*)(\n|$)/gm, '<li>$1</li>');
            }
            chunk = '<'+t+'>' + inner + '</'+t+'>';
        }
        // Images:
        else if (token[8]) {
            chunk = `<img src="${encodeAttr(token[8])}" alt="${encodeAttr(token[7])}">`;
        }
        // Links:
        else if (token[10]) {
            out = out.replace('<a>', `<a href="${encodeAttr(token[11] || links[prev.toLowerCase()])}">`);
            chunk = flush() + '</a>';
        }
        else if (token[9]) {
            chunk = '<a>';
        }
        // Headings:
        else if (token[12] || token[14]) {
            t = 'h' + (token[14] ? token[14].length : (token[13][0]==='='?1:2));
            chunk = '<'+t+'>' + parse(token[12] || token[15], links) + '</'+t+'>';
        }
        // `code`:
        else if (token[16]) {
            chunk = '<code>'+encodeAttr(token[16])+'</code>';
        }
        // Inline formatting: *em*, **strong** & friends
        else if (token[17] || token[1]) {
            chunk = tag(token[17] || '--');
        }
        out += prev;
        out += chunk;
    }

    return (out + md.substring(last) + flush()).trim();
}



var md2html = {
    escapeMd(src) {
        return src //
            .replace(/\n/gmu, '\n')
            .replace(/</gmu, '&lt;')
            .replace(/>/gmu, '&gt;')
            .replace(/#/gmu, '&num;')
            .replace(/\*/gmu, '&ast;')
            .replace(/_/gmu, '&#95;')
            .replace(/-/gmu, '&#45;')
            .replace(/~/gmu, '&#126;')
            .replace(/!/gmu, '&#33;')
            .replace(/\[/gmu, '&#91;')
            .replace(/\(/gmu, '&#40;');
    },
    parse(src) {

        // Output string
        let out;

        // Regular expressions
        // Headings
        let h6 = /^######([^\n]+)$/gmu;
        let h5 = /^#####([^\n]+)$/gmu;
        let h4 = /^####([^\n]+)$/gmu;
        let h3 = /^###([^\n]+)$/gmu;
        let h2 = /^##([^\n]+)$/gmu;
        let h1 = /^#([^\n]+)$/gmu;
        // Image
        let img = /!\[([^\]]*)]\(([^(]+)\)/gm;
        // Link
        let a = /\[([^\]]*)]\(([^(]+)\)/gm;
        // Unordered list
        let ul_start = /^\n[\*\-] ([^\n]+)$/gmu;
        let ul_end = /^[\*\-] ([^\n]+)\n$/gmu;
        let uli = /^[\*\-] ([^\n]+)$/gmu;
        // Ordered list
        let ol_start = /^\n\d. ([^\n]+)$/gmu;
        let ol_end = /^\d. ([^\n]+)\n$/gmu;
        let oli = /^\d. ([^\n]+)$/gmu;
        // Blockquote
        let blockquote = /^> ([^\n]+)$/gmu;
        // Codeblock
        let precode_lang = /^```([^`\n]+)\n([^`]+)```$/gmu;
        let precode = /^```([^`]+)```$/gmu;
        // Inline code
        let code_lang = /``([^`\n ]+) ([^`\n]+)``/gmu;
        let code = /`([^`\n]+)`/gmu;
        // Formatting
        let b_star = /\*\*([^\*]+)\*\*/gmu;
        let b_underscore = /__([^_]+)__/gmu;
        let i_star = /\*([^\*]+)\*/gmu;
        let i_underscore = /_([^_]+)_/gmu;
        let s = /~([^~]+)~/gmu;
        // Paragraph
        let p = /([^\n]+)\n*/gmu;

        // Replacements
        out = src
        // Codeblock
            .replace(precode_lang, function(m, c1, c2) {
                return '<pre><code class="' + c1 + '">' + md2html.escapeMd(c2) + '</code></pre>\n';
            })
            .replace(precode, function(m, c) {
                return '<pre><code>' + c.replace(/\n/gmu, '\n').replace(/</gmu, '&lt;').replace(/#/gmu, '&num;') + '</code></pre>\n';
            })
            // Inline code
            .replace(code_lang, function(m, c1, c2) {
                return '<code class="' + c1 + '">' + c2.replace(/</gmu, '&lt;').replace(/#/gmu, '&num;') + '</code>';
            })
            .replace(code, function(m, c) {
                return '<code>' + c.replace(/</gmu, '&lt;').replace(/#/gmu, '&num;') + '</code>';
            })
            // Headings
            .replace(h6, '<h6>$1</h6>\n')
            .replace(h5, '<h5>$1</h5>\n')
            .replace(h4, '<h4>$1</h4>\n')
            .replace(h3, '<h3>$1</h3>\n')
            .replace(h2, '<h2>$1</h2>\n')
            .replace(h1, '<h1>$1</h1>\n')
            // Images
            .replace(img, '<img src="$2" alt="$1" title="$1">\n')
            // Links
            .replace(a, '<a href="$2">$1</a>')
            // Ordered list
            .replace(ul_start, '\n<ul>\n<li>$1</li>')
            .replace(ul_end, '<li>$1</li>\n</ul>\n')
            .replace(uli, '<li>$1</li>')
            // Unordered list
            .replace(ol_start, '\n<ol>\n<li>$1</li>')
            .replace(ol_end, '<li>$1</li>\n</ol>\n')
            .replace(oli, '<li>$1</li>')
            // Blockquote
            .replace(blockquote, '<blockquote>$1</blockquote>\n')
            // Formatting
            .replace(b_star, '<b>$1</b>')
            .replace(b_underscore, '<b>$1</b>')
            .replace(i_star, '<i>$1</i>')
            .replace(i_underscore, '<i>$1</i>')
            .replace(s, '<s>$1</s>')
            // Paragraph
            .replace(p, '<p>$1</p>');

        return out;
    }
}


const parser = md => {
    const mdRules = [

        /* Image */
        [/!\[(.*)\]\((.*)\)/gm, "<img src='$2' alt='$1' />"],

        /* Link */
        [/\[(.*)\]\((.*)\)/gm, "<a href='$2'>$1</a>"],

        /* Multiline Code */
        [/```[a-z]*\n([\s\S]*?)\n```/g, "<pre>$1</pre>"],

        /* Code */
        [/`(.*)`/gm, "<code>$1</code>"],

        /* Blockquote */
        [/^> ([^\n]*)$/gm, "<blockquote>$1</blockquote>"],

        /* Headings */
        [/^(#{1,6})(.*)$/gm, (m,h,p) => {
            const l = h.length;
            return "<h" + l + ">" + p + "</h" + l + ">"
        }],

        /* Bold */
        [/\*\*(.*)\*\*/gm, "<b>$1</b>"],
        [/__(.*)__/gm, "<b>$1</b>"],

        /* Italic */
        [/(?![^<]*>)_(.*)_/gm, "<i>$1</i>"],

        /* Divider */
        [/^---\s$/gm, "<hr/>"],

        [/(\n\*.*)+/gm, m => {
            let s = "";
            m.substr(1).split("\n").forEach(z => s += "<li>" + z.substr(2) + "</li>")
            return "<ul>" + s + "</ul>"
        }],
        [/(\n\d\..*)+/gm, m => {
            let s="";
            m.substr(1).split("\n").forEach(z => s += "<li>" + z.substr(2) + "</li>")
            return "<ol>" + s + "</ol>"
        }],
        [/\n\n/gm, "</p><p>"]
    ];
    return [mdRules.forEach(mdRule => md = md.replace(mdRule[0], mdRule[1])), md][1]
}


export default parser
