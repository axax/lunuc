# Documentation


__How to use this framework__

## Core
### Types
| Name        | Description           |
| ------------- |:-------------:|
| Keyvalue      | Key/Value store  |
| User |       |
| UserRole |    There are different user roles like administrator or subscriber with different privileges    |

## Extensions

| Name        | Description           |
| ------------- |:-------------:|
| Media      | Media Handling / Image conversion and uploading | 
| Cms      |  Content management system     | 

## Types
A type is basically a collection in mongodb or a table in relational databases.

A Type can be define in the build.json of an extension. Types can also have references to other types. 

**Type properties**
* name = Name of the type
* fields = An array of the fields
* collectionClonable = If true the whole collection of the type is cloneable
* entryClonable = If true a single data record is cloneable
* genResolver = If set to false the resolver is not generated automatically
* mutationResult = The type that is returned after a mutation (default is {TypeName}Status)
* access = Control who has access -> Object {create: 'anonymous'}
* noUserRelation = if true the createdBy field won't be created

**Field properties**

* name = Name of the field
* label = The label that is show in the frontend editor
* required = If set to true the filed must have a value
* default = Default value if no value is provided (TODO)
* multi = If true multiple values can be selected
* type = The type of the field. It can be String (default), Boolean, Float or the name of another type
* index = Creates a database index. For FTS the value can be text
* hidden = If true the field is not visible in the type editor nor it is included in the search. It is as if it is non-existent
* searchable = If true the field is included in the search also if it is hidden
* uitype = It can be datetime, number, editor, jseditor. If the value is set you can force the type editor to use a certain ui element
* readOnly = The value is read only. It is not defined whether the field exist in the database or is only dynamic
* pickerField = When the type is a reference you can define which field you want to show in the frontend for type picking
* alwaysUpdate = always sends the data even if there was no change

**An example of a type definition**
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

// use with key (after .) so if it executed multiple times the function is only called once
Hook.on('Routes.myroute', ({routes}) => {
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
| TypeCreateEdit      |  type, props  | Here you can change the behavior of the dialog which is shown when you create or edit data of type  |   
| TypeCreateEditBeforeSave      |  type, props  | Is called before data are saved  |   
| ExtensionSystemInfo      |  extension  | Here you can add extension info which are shown in the system menu |   



**Server hooks**
 
| Hook        | Params           |  Description           | 
| ------------- |-------------| -------------|
| appready      |  db, app  | Is called as soon as connection and db is ready  |   
| appexit      |    |Is called on precess exit  |  
| typeUpdated      | type,data, db   |Is called when any type gets updated  |  
| typeUpdated_{typeName}      | result, db   |Is called when a type gets updated  |  
| typeDeleted_{typeName}      | _id, db   |Is called when a type gets deleted  |  
| typeBeforeCreate      | type, _version, data, db, context   |Is called before data gets inserted into type collection  |  

## Content Management
### Data Resolver
It is a simple json structure to select data on the server. The json is never exposed to the client. Only the resolved data are sent to the client.

+ f = filter for the query
+ t = type
+ d = the data / fields you want to access
+ l = limit of results
+ o = offset
+ p = page (if no offset is defined, offset is limit * (page -1) )
+ g = group

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


#### The scope

Within a template all scope properties (See the section scope below) are accessible. For example if you want to access the parent scope just write ${parent.scope} or if you want to use data that has been resolved by the Data Resolver just type ${data.ProductCategory.total}


#### loop
Let's assume there is a property array **breadcrumbs** on the scope like this:

```json
scope.breadcrumbs = [{name:'Home',url:'/'},{name:'Page 1', url: '/page1'}]
```  

In the template we can iterate through it with the $loop expression:

```json
{
  "$loop": {
    "d": "breadcrumbs",
    "c": {
      "t": "Link",
      "c": "$.loop{name}",
      "p": {
        "to": "$.loop{url}"
      }
    }
  }
}
```  

##### Properties
+ d = data source (access on the scope)
+ $d = data source as string that gets parsed to an array
+ c = children in loop
+ s = name of scope in loop to access data (default is loop). If s is equal to x for example data can be accessed with $.x{name}

##### Other
+ Use this.scope to access the main scope within a loop.
+ Use this.loop to access the whole data object
+ If the data is not an object use $.loop{data} to access it
+ Use _index to get the current position in the loop



### Script
**Reserved keywords**

* this => is the current JsonDom
* parent => reference to the parent JsonDom
* root => reference to the root parent JsonDom
* getComponent(id) => get any JsonDom by its id
* clientQuery => for communication with the graphql api
* setStyle => set a css style for this page. Will automatically be removed when page is released
* scope => Object with properties related to the current template
* on => Add an event listener function
* setLocal => put data to the localstorage
* getLocal => get data from the localstorage
* forceUpdate(id,refreshScript) => refresh a component
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
* childmount => A child JsonDom is mounted
* unmount => JsonDom is unmounted
* update => Is called after JsonDom is updated
* resourcesReady => Is called after JsonDom is updated and all resources are loaded
* urlchanged => is called when the url has changed (it only makes sens if the page is not urlSensitive) 
* subscription => on subscription event
* beforerunscript => gets called right before the script is executed

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

LUNUC_FORCE_HTTPS=true 

### Security

This framework uses the local and the session storage to cache data. Be aware of the vulnerability and make sure that sensitiv data never end up in the local storage.
