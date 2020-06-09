# Starter App

[![Build Status](https://travis-ci.org/axax/lunuc.svg?branch=master)](https://travis-ci.org/axax/lunuc)

__This is a boilerplate / app template / framework. A full-stack setup to build progressive web apps and to play around with the latest web technologies.__

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
* Mongodb
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
* Template / Page builder
* Docker integration

*Todos*
* Push notification
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

### Run as docker container
#### Building docker image
`docker build -t axax06/lunuc .`

#### Running docker image
You need to pass the environment variable MONGO_URL with the path to the mongodb
`docker run -e MONGO_URL=mongodb://user:password@mongodb/ -p 49160:8080 -d axax06/lunuc`
 
Now the app should be accessable through the port 49160
http://localhost:49160/

## Implementation

### Folder structure

```text
├── api
│   ├── resolver
│   └── schema
├── server
├── extensions
├── client
│   ├── actions
│   ├── components
│   ├── constants
│   ├── containers
│   ├── middleware
│   ├── reducers
│   └── store
└── test
```

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

check with `ncu` 

update with `ncu -u `


### Start as service

create lunuc-api.service file under /etc/systemd/system

`chmod +x /opt/lunuc/shell/start-api.sh`
`systemctl daemon-reload`
`sudo systemctl restart lunuc-api`
`journalctl -lf -u lunuc-api`

#### Restart service
`sudo systemctl restart lunuc-api`


### Port forwarding

`sudo iptables -A PREROUTING -t nat -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 8080`
`sudo iptables -A PREROUTING -t nat -i eth0 -p tcp --dport 443 -j REDIRECT --to-port 8080`

#### List port forwarding
`sudo iptables -t nat -vnL`

#### Forward port 443 and 80 to 8080
`iptables -t nat -A OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port 8080`
`iptables -t nat -A OUTPUT -o lo -p tcp --dport 443 -j REDIRECT --to-port 8080`

### Create cert with letsencrypt

`sudo certbot certonly --manual`

### Add new domain to certificate (Ubuntu)

`sudo certbot certonly --cert-name example.com -d m.example.com,www.m.example.com`

#### Auto renewal 
`sudo crontab -e`

Add this to the file:

`* 3 * * 6 certbot renew && sudo systemctl restart lunuc-client`

### enable DNS extension

1. check if port 53 is used
`sudo lsof -i -P -n | grep LISTEN`

2. if systemd-resolved is running stop it
`sudo systemctl stop systemd-resolved`

3. edit /etc/systemd/resolved.conf
`DNS=8.8.8.8`
`DNSStubListener=no`

4. run
`sudo ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf`

#Locations on server
/opt/lunuc
/srv/uploads

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

