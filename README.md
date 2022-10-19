# Lunuc Framework

[![Build Status](https://travis-ci.org/axax/lunuc.svg?branch=master)](https://travis-ci.org/axax/lunuc)

__A full-stack setup to build progressive web apps.__

For more information and examples, go to https://www.lunuc.com/

*Here is a list with the main features:*
* React for UI
* Declarative routing
* Babel for ECMAScript 2016 / 2017
* Webpack bundler
* Jest for testing
* Eslint for code quality
* Mongodb
* Database-as-a-Service by mlap.com
* GraphQL API
* Express Server
* GraphQL Client
* Optimistic UI
* Persist and Rehydrate / Cache Data
* Authentication 
* Use of sockets (subscriptions-transport-ws)
* Travis yml
* Depolymet to heroku
* Use of Service worker
* Template / Page builder
* Docker integration
* Push notification
* Use of AWS lambda

## Installation & Usage

### Environment
Setup your environment. 

Url to access the mongo database:

* `export MONGO_URL mongodb://user:password@ds145780.mlab.com:45780/app`

### Install
* `npm install`

#### Troubleshooting
`sudo npm install puppeteer --unsafe-perm=true`

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

### Install on ubuntu

#### Install requirements
`sudo apt install git-all`

`sudo apt -y update && sudo apt -y upgrade`

`curl -sL https://deb.nodesource.com/setup_14.x | sudo bash -`

`sudo apt-get install -y nodejs`

`sudo apt install npm`

##### Update nodejs
`sudo n stable`
`sudo node -v`

##### Install nvm
`apt install curl`
`curl https://raw.githubusercontent.com/creationix/nvm/master/install.sh | bash`
`source ~/.profile`

#### Clone repo into /opt
`cd /opt`

`sudo git clone https://github.com/axax/lunuc.git`

#### Run install script
`sudo chmod +x /opt/lunuc/shell/install.sh`

`sudo /opt/lunuc/shell/install.sh`

#### Edit config
`sudo vi /etc/lunuc/buildconfig.json`

#### Edit services and enviroment
`sudo vi /etc/systemd/system/lunuc-api.service`

`sudo vi /etc/systemd/system/lunuc-client.service`

#### Start
`sudo chmod +x /opt/lunuc/shell/start.sh`

`sudo chmod +x /opt/lunuc/shell/start-client.sh`

`sudo chmod +x /opt/lunuc/shell/start-api.sh`

`sudo chmod 777 /opt/lunuc`

`sudo /opt/lunuc/shell/start.sh`

### Mongodb on ubuntu
https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/

#### Mongodb external access
`# network interfaces
 net:
   port: 27017
   bindIp: 127.0.0.1,mongodb_server_ip`
`sudo ufw allow from 194.230.16.16 to any port 27017`
`sudo ufw status numbered`
`sudo ufw delete 8`

#### When mongodb doesn't start
`rm /tmp/mongodb-27017.sock`

#### Update mongodb to latest version
`sudo service mongod stop`
`sudo apt-get purge mongodb-org*`
`sudo apt-get install -y mongodb-org`

#### auto-restart Mongodb

1. Edit your mongod service: `sudo vi /lib/systemd/system/mongod.service`
2. Add `Restart=always` under service
3. Reload systemctl daemon: `sudo systemctl daemon-reload`

Now whenever mongod gets killed. It'll get respawned by systemctl.
 
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

### Debugging

#### Webstorm
> Run – Edit configurations… – Add – JavaScript Debug
 Paste URL of your app (http://localhost:3000/) into the URL field.
[read more](https://blog.jetbrains.com/webstorm/2017/01/debugging-react-apps/)

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

#### Enable service to run at boot
`sudo systemctl enable lunuc-api`
`sudo systemctl enable lunuc-client`

### Port forwarding


`sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 8080`
`sudo iptables -t nat -A PREROUTING -p tcp --dport 443 -j REDIRECT --to-ports 8080`

#### On local machine
`iptables -t nat -A OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port 8080`
`iptables -t nat -A OUTPUT -o lo -p tcp --dport 443 -j REDIRECT --to-port 8080`

#### Persist ruels after reboot
`apt-get install iptables-persistent`
`iptables-save`

### if interface is not eth0 check for other interfaces
`netstat -i`

#### List port forwarding
`sudo iptables -t nat -vnL`

#### Forward port 443 and 80 to 8080
`sudo iptables -t nat -A OUTPUT -o lo -p tcp --dport 80 -j REDIRECT --to-port 8080`
`sudo iptables -t nat -A OUTPUT -o lo -p tcp --dport 443 -j REDIRECT --to-port 8080`

##### Remove iptables entry
`sudo iptables -t nat -D PREROUTING 1`
### Create cert with letsencrypt

`sudo certbot certonly --manual`


### Add new domain to certificate (Ubuntu)

`sudo certbot certonly --webroot -w /srv/lunuc --cert-name example.com -d m.example.com,www.m.example.com`

#### Auto renewal 
`sudo crontab -e`

Add this to the file:

`* 3 * * 6 certbot renew && sudo systemctl restart lunuc-client`

#### List all certificates
`certbot certificates`

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


`sudo iptables -A PREROUTING -t nat -i eth0 -p tcp --dport 53 -j REDIRECT --to-port 53`

allow only from certain ip
`sudo ufw allow from 188.154.137.74 to any port 53`


### Disable Apache 2
`sudo systemctl disable apache2 && sudo systemctl stop apache2`
`/etc/init.d/apache2 stop`
`sudo systemctl disable apache2`

### Security

#### ssh brute force protection

`iptables -A INPUT -p tcp --dport 22 -m state --state NEW -m recent --set --name SSH -j ACCEPT
 iptables -A INPUT -p tcp --dport 22 -m recent --update --seconds 60 --hitcount 4 --rttl --name SSH -j LOG --log-prefix "SSH_brute_force "
 iptables -A INPUT -p tcp --dport 22 -m recent --update --seconds 60 --hitcount 4 --rttl --name SSH -j DROP`

### Locations on server
/opt/lunuc
/srv/uploads

### Backup uploads
`rsync -rav -e ssh --exclude='*@*' --delete user@lunuc.com:/path/to/uploads/ /local/distination/lunucbackup/uploads`
