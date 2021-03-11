
export const jsonPropertyTemplates = [
    {title: 'Click Event', template: '"onClick":{"action":"click"}'},
    {title: 'Change Event', template: '"onChange":{"action":"change"}'},
    {title: 'Inline Editor false', template: '"$inlineEditor":false'},
    {title: 'Observer', template: '"$observe": {"threshold": 0, "waitVisible": true,"initialClass": "animation","visibleClass": "fade-in-up"}'},
]

export const jsonTemplates = [
    {title: 'For loop', template: '{"$for": {"d": "data","s":"loop","c": [{"c":"$.loop{loop.value}"}]}}'},
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
        title: 'Form Select', template: `{"t":"label","c":
        [
        {"t":"span","$inlineEditor":false,"c":"Select"},
        {
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
      }]}`
    },
    {
        title: 'Modal Component', template: `
  {
    "$is": "\$\{modal.open}",
    "comment":"use customevent modalClose or modalButtonClicked to handle events",
    "t": "Cms",
    "$inlineEditor": {
        "elementKey": "Cms"
    },
    "p": {
      "data-element-key": "cms",
      "id": "modal",
      "slug": "core/modal",
      "props": {
        "id": "modal",
        "buttonLabel": "Close",
        "title": "New Modal",
        "text": "This is a modal",
        "open": "\$\{modal.open}",
        "width": "400px",
        "height": "200px",
        "buttons": [{
            "label": "Cancel",
            "className": "button1 large",
            "key": "cancel"
          },
          {
            "label": "Yes",
            "className": "button2",
            "key": "yes"
          }
        ]
      }
    }
  }`
    },
    {
        title: 'Form Button', template: `
          {
            "t": "button",
            "c": "Button",
            "p": {
              "disabled": "",
              "id": "button",
              "onClick": {
                "action": "button"
              }
            }
          }`
    }
]
