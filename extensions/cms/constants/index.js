export const CAPABILITY_MANAGE_CMS_PAGES = 'manage_cms_pages'

export const DEFAULT_DATA_RESOLVER = `[
  {
    "data":{
      "type":"Word",
      "fields": [{"name":"it", "label": "Italian"}, {"name":"de", "label": "German"}]
    }
  },
  {
    "t": "$Word",
    "d": [
      "de",
      "it",
      {
        "categories": [
          "name",
          "_id"
        ]
      }
    ],
    "f":"categories.name=\\\\\\"italienisch basis\\\\\\"",
    "l": 20,
    "o": 0
  }
]`


export const DEFAULT_TEMPLATE = `[
  {
    "t": "h1$",
    "c": "Inital Demo Page"
  },
  {
    "t": "p$",
    "c": "Resolve date from the database and show it here."
  },
  {
    "t": "table.mytable",
    "p": {},
    "c": [
      {
        "t": "tbody",
        "c": {
          "t": "tr",
          "c": {
            "$loop": {
              "s": "cols",
              "$d": "data.fields",
              "c": {
                "t": "th",
                "c": "$.cols{label}"
              }
            }
          }
        }
      },
      {
        "t": "tbody",
        "c": [
          {
            "$loop": {
              "s": "result",
              "$d": "data.Word.results",
              "c": [
                {
                  "t": "tr",
                  "c": [
                    {
                      "$loop": {
                        "s": "cols",
                        "d": "data.fields",
                        "c": [
                          {
                            "t": "td",
                            "c": "$.cols{this.scope.result[name]?this.scope.result[name]:''}"
                          }
                        ]
                      }
                    }
                  ]
                }
              ]
            }
          }
        ]
      },
      {
        "t": "tfoot",
        "c": {
          "t": "tr",
          "c": {
            "t": "td",
            "c": "Page \${data.Word.page} of \${Math.ceil(data.Word.total / data.Word.limit)}",
            "p": {
                "colspan":"\${data.fields.length}"
            }
          }
        }
      }
    ]
  }
]`

export const DEFAULT_SCRIPT = `// 1. access scope data
// scope.page.slug
// scope.data
// 2. handle events
// on('click',(payload)=>{console.log})

on('beforerender',()=>{
\t// is called before the page renders\t
})

on('mount',()=>{
\t// this is called after rendering is completed and the page is ready
})

on('update',()=>{
\t// this is called when the page changed
})

on('unmount',()=>{
\t// this is called before the page gets destroyed
})

on('urlchange',()=>{
\t// this is called after the url changed
})

setStyle(\`
.mytable {
\twidth: 100%;
\tborder: 2px solid #eee;
\tbackground: #fff;
\tborder-spacing: 0px;
\tbox-shadow: 0px 10px 50px 0px rgba(0,0,0,0.12);
\tborder-radius: 5px;
}

.mytable th {
\tcolor:#fff;
\tbackground:#444;
\tpadding: 15px;
\ttext-align:left;
}
.mytable td {
\tborder-top: 1px solid #eee;
\tpadding: 15px;
}

.mytable tr:hover td {
\tbackground: rgba(0,0,0,0.05);
}\`)
`
