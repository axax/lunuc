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
| ExtensionSystemInfo      |  extension  | Here you can add extension info which are shown in the system menu |   



**Server hooks**
 
| Hook        | Params           |  Description           | 
| ------------- |-------------| -------------|
| appready      |  db, app  | Is called as soon as connection and db is ready  |   
| appexit      |    |Is called on precess exit  |  
| typeUpdated_{typeName}      | result, db   |Is called when a type gets updated  |  
| typeDeleted_{typeName}      | _id, db   |Is called when a type gets deleted  |  

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


**Util.tryCatch** to eval a string and return result. errors are ignored and in case of an error an empty string is returned

```json
"c": "Category ${Util.tryCatch('this.filter.parts.categories[0]')}"   
```

or use the short form
```json
"c": "Category ${_i('this.filter.parts.categories[0]')}"   
```
    
**define a click event in template**
```json
{
    "t": "button",
    "c": "send",
    "p": {
      "onClick":{"action":"send"}
    }
}
```
      
**Extending a type**

In this example the type FileDrop is extended under the name ImageDrop. Now the type ImageDrop can be referenced anywhere within the template.
```json
{
  "x": {
    "t": "FileDrop",
    "n": "ImageDrop",
    "p": {
      "label": "Add image",
      "multi": false
    }
  }
}
```    


**the scope** 

Within a template all scope properties (See the section scope below) are accessible. For example if you want to access the parent scope just write ${parent.scope} or if you want to use data that has been resolved by the Data Resolver just type ${data.ProductCategory.total}

### Script
**Reserved keywords**

* this => is the current JsonDom
* parent => reference to the parent JsonDom
* root => reference to the root parent JsonDom
* clientQuery => for direct communication with the backend
* setStyle => set a css style for this page. Will automatically be removed when page is released
* scope => Object with properties related to the current template
* on => Add an event listener function
* setLocal => put data to the localstorage
* getLocal => get data from the localstorage
* refresh => refresh a component
* history => history obj  
* _t => i18n
* Util => Utilities
* setKeyValue => set key value for the user if there is a session otherwise the values are kept in the local storage
* getKeyValueFromLS => read key value from local storage


#### Scope
The scope is an object with all relevant properties which is accessible in the script as well as in the template

Here is an example of a scope object:
```json
{
  "page": {
    "slug": "mailer"
  },
  "user": {
    "userToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImFkbWluIiwiaWQiOiI1OTBlZmZkYWI3NWIxMDA5NGY4NTQzYjgiLCJpYXQiOjE1MjkyNjExMTgsImV4cCI6MzMwNTUzMDM1MTh9.qJ5KmHO3S_DAgcRVG_HPJKS40xSECIKwXNQeUjdR_CE",
    "userData": {
      "username": "admin",
      "email": "axax@gmx.net",
      "_id": "590effdab75b10094f8543b8",
      "role": {
        "_id": "59358a39d56f6b06cc266433",
        "capabilities": [
          "manage_keyvalues",
          "manage_cms_pages",
          "access_admin_panel",
          "view_app",
          "access_admin_page",
          "manage_types",
          "manage_other_users"
        ],
        "__typename": "UserRole"
      },
      "__typename": "User"
    },
    "isAuthenticated": true
  },
  "pathname": "/en/mailer",
  "params": {},
  "hashParams": {},
  "data": {
    "globals": {
      "MailSettings": {
        "smtp": {
          "host": "localhost"
        }
      }
    }
  },
  "_app_": {
    "tr": {
    },
    "trLoaded": true,
    "lang": "en",
    "config": {
      "APOLLO_CACHE": true,
      "DEBUG": true,
      "ADMIN_BASE_URL": "/admin",
      "BACKUP_DIR": "/backups",
      "BACKUP_URL": "/backups",
      "UPLOAD_DIR": "/uploads",
      "UPLOAD_URL": "/uploads",
      "LANGUAGES": [
        "de",
        "en"
      ],
      "DEFAULT_LANGUAGE": "de",
      "DEFAULT_RESULT_LIMIT": 10,
      "DEV_MODE": true
    }
  },
  "bindings": {
    "xx": "1234"
  },
  "parent": [object Object]
  "root": [object Object]
}
```

### Events

* beforeRender => is called before template is rendered
* change => input change
* click => simple click event
* mount => JsonDom is mounted
* unmount => JsonDom is unmounted
* update => Is called after JsonDom is updated
* resourcesReady => Is called after JsonDom is updated and all resources are loaded
* refreshScope => is called when only the scope might have changed 
* urlchanged => is called when the url has changed (it only makes sens if the page is not urlSensitive) 
* subscription => on subscription event
* reset => gets called when the current template is either removed or reset
  
```javascript

on('unmount',()=>{
    console.log('unmount');
})

on('change',(payload, e)=>{
	if( payload.action === 'sortby' ){
  	...
	}
})

on('click',(payload, e)=>{
	if( payload.action === 'speak' ){               
	}
})
``` 

### Internalization

[local].tr.json

_tr()


### Config environment vars

APP_FORCE_HTTPS=true 
