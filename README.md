# Starter App

[![Build Status](https://travis-ci.org/axax/lunuc.svg?branch=master)](https://travis-ci.org/axax/lunuc)

__This is a boilerplate / app template. A full-stack setup to build progressive web apps and to play around with the latest web technologies. Everything is up and running.__

This demo app is also deployed on heroku 
https://lunuc.herokuapp.com/

*Here is a list with the main features:*
* React for UI
* Declarative routing
* Redux architecture
* Babel for ECMAScript 2016 / 2017
* Webpack bundler
* Jest for testing
* Eslint for code quality
* mongodb
* Database-as-a-Service by mlap.com
* GraphQL API
* Express Server
* Apollo GraphQL Client
* Optimistic UI
* Persist and Rehydrate / Cache Data
* Authentication 
* Use of sockets (subscriptions-transport-ws)
* Travis yml
* Depolymet to heroku
* Use of Service worker

*Todos*
* Styling
* Push notification
* Docker integration
* Use of AWS lambda

## Installation & Usage

### Environment
Setup your environment. 

Url to access the mongo database:

* `export MONGO_URL mongodb://user:password@ds145780.mlab.com:45780/app`

### Install
* `npm install`

### Development
* `npm run dev`
* visit `http://localhost:8080`

### Production
* `npm start`
* visit `http://localhost:8080`

 
## Implementation

### Folder structure

```text
├── api
├── src
│   ├── actions
│   ├── components
│   ├── constants
│   ├── containers
│   ├── middleware
│   ├── reducers
│   └── store
└── test
```

- actions contains all actions

### Redux architecure

- A single store
- State being read-only (immutability)
- Mutations written as pure functions

```text
+------------+        +------------+        +-------------+
|            |        |            |        |             |
|   Action   +------->+  Reducers  +------->+    Store    |
|            |        |            |        |             |
+-----+------+        +------------+        +------+------+
      ^                                            |
      |                                            |
      |                                            |
      |               +------------+               |
      |   dispatch    |            |    subscribe  |
      +---------------+    View    +<--------------+
                      |            |
                      +------------+

```

### Debugging

#### Webstorm
> Run – Edit configurations… – Add – JavaScript Debug
 Paste URL of your app (http://localhost:3000/) into the URL field.
[read more](https://blog.jetbrains.com/webstorm/2017/01/debugging-react-apps/)


> Redux DevTools
[read more](https://github.com/zalmoxisus/redux-devtools-extension)

### Testing

### Code quality

#### Eslint`

Configuration eslint:

```
./node_modules/.bin/eslint --init
```

##FAQ

Feedback, issues, etc. are more than welcome!


## Misc

### Updating local packages
`npm outdated`

`npm update --save-dev`

#### force all packages to update to latest version
`npm i -g npm-check-updates`

check with `ncu -u` 

update with `ncu -a`

### Rebuild bcrypt
`npm rebuild bcrypt --update-binary`

## Contributors

### Contribution Guidelines

Please ensure your pull request adheres to the following guidelines:

- Search previous suggestions before making a new one, as yours may be a duplicate.
- Suggested READMEs should be beautiful or stand out in some way.
- Make an individual pull request for each suggestion.
- New categories, or improvements to the existing categorization are welcome.
- Keep descriptions short and simple, but descriptive.
- Start the description with a capital and end with a full stop/period.
- Check your spelling and grammar.
- Make sure your text editor is set to remove trailing whitespace.

Thank you for your suggestions!

## License

[MIT](./LICENSE)

