const parser = md => {
    const mdRules = [

        /* Image */
        [/!\[(.*)\]\((.*)\)/gm, "<img src='$2' alt='$1' />"],

        /* Link with attributes */
        [/\[([^\]]*)\]\(([^\)]*)\)\{:([^\}]*)\}/gm, "<a href='$2' $3>$1</a>"],

        /* Link without attributes*/
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
    ]
    return '<p>'+[mdRules.forEach(mdRule => md = md.replace(mdRule[0], mdRule[1])), md][1]+'</p>'
}


export default parser
