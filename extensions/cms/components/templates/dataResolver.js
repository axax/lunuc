
export const jsonPropertyTemplates = []

export const jsonTemplates = [
    {
        title: 'Data Query', template: `
  {
    "key": "GenericDataDefinition",
    "cache": {
      "policy": "\$\{this.editmode?'cache-only':''}",
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
    },    {
        title: 'GenericData Query', template: `
  {
    "key": "GenericData",
    "cache": {
      "policy": "\$\{this.editmode?'cache-only':''}",
      "expires":600000,
      "key":"GenericData"
    },    
    "t": "GenericData",
    "d": [
        "data",
        "_id",
        {"definition":["name"]}
    ],
    "restriction":{"type":"role","role":"anonymous"},
    "l": 500,
    "s": "_id desc",
    "f": "definition.name==TypeName"
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
