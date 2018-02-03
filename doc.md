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

**Available hooks**
 
| Hook        | Description           |
| ------------- |:-------------:|
| ApiResponse      |  Exposes the response after an api request. Here you can modify or populate values  |
| Routes      |  Where custom routes can be added  |


## Content Management
### Data Resolver
### Template
### Script
