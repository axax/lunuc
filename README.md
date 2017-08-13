# Starter App

[![Build Status](https://travis-ci.org/axax/lunuc.svg?branch=master)](https://travis-ci.org/axax/lunuc)

**This is a boilerplate / app template. A full-stack setup to build progressive web apps and to play around with the latest web technologies. Everything is up and running.  **

** This demo a app is deployed on heroku
https://lunuc.herokuapp.com/

*Here are some features:*
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
* Persist and Rehydrate
* Authentication 
* Use of sockets (subscriptions-transport-ws)
* Travis yml
* Depolymet to heroku

*Todos*
* Use of Service worker
* Docker integration
* Use of AWS lambda

## Installation & Usage

### Environment
Setup your environment. 

Url to access the mongo database:

* `export LUNUC_MONGO_URL mongodb://user:password@ds145780.mlab.com:45780/app`

### Install
* `npm install`

### Development
* `npm run dev`
* visit `http://localhost:8080`

### Production
* `npm start`
* visit `http://localhost:8080`

 
## Implementation

### Dependencies

| Name  | Description |
| ------------- | ------------- |
| [react](https://github.com/facebook/react)  | React is a JavaScript library for building user interfaces.  | 
| [prop-types](https://github.com/reactjs/prop-types)  | Runtime type checking for React props and similar objects  | 
| [redux-persist](https://github.com/rt2zz/redux-persist)  | Persist and rehydrate a redux store.  | 
| [react-dom](https://github.com/facebook/react/tree/master/packages/react-dom)  | The entry point of the DOM-related rendering paths  | 
| [redux](https://github.com/reactjs/redux)  | The entry point of the DOM-related rendering paths  | 
| [react-redux](https://github.com/reactjs/react-redux)  | Predictable state container for JavaScript apps.  | 
| [react-router-dom](https://github.com/ReactTraining/react-router/tree/master/packages/react-router-dom)  | Declarative routing for React  | 
| [webpack](https://github.com/webpack/webpack)  | A bundler for javascript and friends. Packs many modules into a few bundled assets. Similar to Browserify and Gulp or Grunt.  | 
| [webpack-dev-server](https://github.com/webpack/webpack-dev-server/)  | Use webpack with a development server that provides live reloading  | 
| [bable-core](https://github.com/babel/babel)  | The compiler for writing next generation JavaScript. | 
| [babel-polyfill](https://github.com/babel/babel/tree/master/packages/babel-polyfill)  | Babel includes a polyfill that includes a custom regenerator runtime  | 
| [babel-loader](https://github.com/babel/babel-loader)  | Allows transpiling JavaScript files using Babel and webpack  | 
| [babel-preset-es2015](https://github.com/babel/babel/tree/master/packages/babel-preset-es2015)  | Babel preset for all es2015 plugins.  | 
| [babel-preset-react](https://github.com/babel/babel/tree/master/packages/babel-preset-react)  | Babel preset for all React plugins.  | 
| [babel-preset-stage-0](https://github.com/babel/babel/tree/master/packages/babel-preset-stage-0)  | Babel preset for stage 0 plugins.  | 
| [babel-jest](https://github.com/facebook/jest/tree/master/packages/babel-jest)  | Babel jest plugin | 
| [babel-eslint](https://github.com/babel/babel-eslint)  | Allows you to lint ALL valid Babel code with the fantastic ESLint. | 
| [immutability-helper](https://github.com/kolodny/immutability-helper)  | mutate a copy of data without changing the original source  | 
| [jest](https://github.com/facebook/jest)  | A complete and easy to set up JavaScript testing solution. In fact, Jest works out of the box for any React project.  | 
| [react-test-renderer](https://github.com/facebook/react/tree/master/packages/react-test-renderer)  | This package provides an experimental React renderer that can be used to render React components to pure JavaScript objects, without depending on the DOM or a native mobile environment.  | 
| [eslint](https://github.com/eslint/eslint)  | A fully pluggable tool for identifying and reporting on patterns in JavaScript | 
| [eslint-plugin-react](https://github.com/yannickcr/eslint-plugin-react)  | React specific linting rules for ESLint | 
| [nodemon](https://github.com/remy/nodemon)  | Monitor for any changes in your node.js application and automatically restart the server - perfect for development | 
| [graphql](https://github.com/graphql/graphql-js)  | The JavaScript reference implementation for GraphQL, a query language for APIs created by Facebook. | 
| [gql-merge](https://github.com/liamcurry/gql/tree/master/packages/gql-merge)  | Tools for merging GraphQL documents | 
| [express](https://github.com/expressjs/express)  | Fast, unopinionated, minimalist web framework for node | 
| [http-proxy](https://github.com/nodejitsu/node-http-proxy)  | A full-featured http proxy for node.js  | 
| [express-graphql](https://github.com/graphql/express-graphql)  | Create a GraphQL HTTP server with Express. | 
| [react-apollo](https://github.com/apollographql/react-apollo)  | React data container for the Apollo graphql Client. | 
| [mongodb](https://github.com/mongodb/node-mongodb-native)  | Mongo DB Native NodeJS Driver  | 
| [body-parser](https://github.com/expressjs/body-parser)  | Node.js body parsing middleware | 
| [bcrypt](https://github.com/pyca/bcrypt) | Modern password hashing for your software and your servers | 
| [subscriptions-transport-ws](https://github.com/apollographql/subscriptions-transport-ws) |  A WebSocket client + server for GraphQL subscriptions | 
| [aws-sdk](https://github.com/aws/aws-sdk-js) |  AWS SDK for JavaScript in the browser and Node.js | 


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

