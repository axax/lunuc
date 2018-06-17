# Documentation


__How to use this framework__

## Core
### Types
| Name        | Description           |
| ------------- |:-------------:|
| Keyvalue      |  |
| Notification      |       | 
| Media |       |
| User |       |

## Extensions
## Types
A type is basically a collection in mongodb or a table in relational databases.

There are some core types such as Media, User...

Types can have references to other types. 

**How to create a new Type?**
```json
 {"types": [
    {
      "name": "Product",
      "fields": [
        {
          "name": "name",
          "required": true
        },
        {
          "name": "description"
        },
        {
          "name": "price",
          "uitype": "numeric"
        },
        {
          "name": "image",
          "type": "Media"
        },
        {
          "name": "categories",
          "type": "ProductCategory",
          "multi": true
        }
      ]
    },
    {
      "name": "ProductCategory",
      "fields": [
        {
          "name": "name",
          "required": true
        }
      ]
    }
  ]
}
```
 
## Hooks 

**Who to use a hook?**
```javascript
Hook.on('Routes', ({routes}) => {
    routes.push({exact: true, path: ADMIN_BASE_URL+'/post/:id*', component: PostContainer})
})
```

**Client hooks**
 
| Hook        | Params           |  Description           | 
| ------------- |-------------| -------------|
| ApiResponse      |  data  | Exposes the response after an api request. Here you can modify or populate values  |   
| Routes      |  routes  |Where custom routes can be added  |   
| TypeTable      |  type, dataSource, data, fields  | Before the types table is rendered  |   
| TypeTableColumns      |  type, columns  | After the creation of the columns for the type table  |   
| Types      |  types  | Add or remove a type from the type list  |   
| TypeCreateEditDialog      |  type, props  | Here you can change the behavior of the dialog which is shown when you create or edit data of type  |   


## Content Management
### Data Resolver
It is a simple json structure to select data on the server. The json is never exposed to the client. Only the resolved data are sent to the client.

+ f = filter for the query
+ t = type
+ d = the data / fields you want to access
+ l = limit of results
+ o = offset
+ p = page (if no offset is defined, offset is limit * (page -1) )

you can subcribe to data changes with $ character placed in front of the type.
                    
```json
[
  {
    "t": "$ProductCategory",
    "f": [
      "name"
    ],
    "l": 100
  }
]                    
```                    
                    
### Template

Here are some useful helper methods that can be used with in the template 

**this.escape** can be use to make sure the json doesn't break after inserting the value.

```json
"data": "$.x{this.escape(body)}"       
```    


**this.tryCatch** to eval a string and return result. errors are ignored and in case of an error an empty string is returned

```json
"c": "Category ${this.tryCatch('this.filter.parts.categories[0]')}"   
```    

### Script
**Reserved keywords**

* this => is the current JsonDom
* parent => reference to the parent JsonDom
* scope => Object with properties related to the scope
* on => Add an event listener function
* setLocal => put data to the localstorage
* getLocal => get data from the localstorage
* refresh => refresh a component
* history => history obj  
* _t => i18n
* Util => Utilities

### Events

* beforeRender => is called before template is rendered
                  
                  
### Internalization

[local].tr.json

_tr()
