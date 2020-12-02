
export const jsonPropertyTemplates = [
    {title: 'Click Event', template: '"onClick":{"action":"click"}'},
    {title: 'Change Event', template: '"onChange":{"action":"change"}'},
    {title: 'Inline Editor false', template: '"$inlineEditor":false'}
]

export const jsonTemplates = [
    {title: 'For loop', template: '"{$for": {"d": "data","s":"loop","c": [{"c":"$.loop{loop.value}"}]}}'},
    {
        title: 'Form Checkbox',
        template: '{"t":"label","c":[{"t":"input","$inlineEditor":false,"p":{"name":"check","type":"checkbox","checked":"","onClick":{"_forceUpdate":true}}},{"t":"span","$inlineEditor":false,"c":"Checkbox (${bindings.check})"}]}'
    },
    {
        title: 'Smart Image', template: `{
                          "$inlineEditor": false,
                          "$observe": {
                            "lazyImage": {
                              "width": "",
                              "height": ""
                            },
                            "rootMargin": "0px 0px 0px 0px"
                          },
                          "t": "SmartImage",
                          "p": {
                            "inlineSvg": false,
                            "caption": "",
                            "src": "/icons/download.svg",
                            "options": {
                              "webp": true,
                              "quality": "85",
                              "resize": {
                                "height": "",
                                "width": "",
                                "responsive": false
                              }
                            }
                          }
                        }`
    },
    {
        title: 'Form Select', template: `{"t":"label","c":[{
        "t": "select",
        "$inlineEditor":false,
        "p": {
          "name":"select",
          "placeholder": "",
          "value": "",
          "onChange": {
            "action": "change"
          }
        },
        "c": [
          {
            "$for": {
              "$d": "data.selectors",
              "c": [
                {
                "$inlineEditor":false,
                  "t": "option",
                  "c": "$.loop{loop.data}",
                  "p": {
                    "value": "$.loop{loop._index}"
                  }
                }
              ]
            }
          }
        ]
      },{"t":"span","$inlineEditor":false,"c":"Select"}]}`
    }
]
