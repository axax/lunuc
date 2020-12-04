
export const jsonPropertyTemplates = []

export const jsonTemplates = [
    {
        title: 'Data Query', template: `
  {
    "key": "GenericDataDefinition",
    "cache": {
      "policy": "\$\{this.context.id?'cache-only':''}",
      "expires":600000,
      "key":"GenericDataDefinition"
    },    
    "t": "GenericDataDefinition",
    "d": [
        "_id",
        "name",
        "structure"
    ],
    "restriction":{"type":"role","role":"anonymous"},
    "l": 500,
    "s": "_id desc",
    "f": ""
  }`
    },
    {
        title: 'Global KeyValue', template: `{
    "key": "global",
    "keyValueGlobals": [
      "GlobalStyles"
    ]
  }`
    }
]
