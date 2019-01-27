export const CAPABILITY_MANAGE_CMS_PAGES = 'manage_cms_pages'

export const DEFAULT_DATA_RESOLVER = `[
  {
    "t": "$Word",
    "d": [
      "en",
      "de",
      "it",
      {
        "categories": [
          "name",
          "_id"
        ]
      }
    ],
    "l": 20,
    "o": 0
  }
]`


export const DEFAULT_TEMPLATE = `[
    {
        "t": "div",
        "p": {},
        "c": [
            {
                "t": "h1$",
                "c": "Words"
            },
            {
                "t": "Row",
                "c": [
                    {
                        "$loop": {
                            "s": "x",
                            "$d": "data.Word.results",
                            "c": [
                                {
                                    "t": "Col",
                                    "p": {
                                        "md": 3
                                    },
                                    "c": [
                                        {
                                            "t": "p",
                                            "c": "$.x{de} = $.x{en}"
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }
]`

export const DEFAULT_SCRIPT = `// 1. access scope data
// scope.page.slug
// scope.data
// 2. handle events
// on('click',(payload)=>{console.log})

`
