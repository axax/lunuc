#!/bin/sh
cd "$(dirname "$0")"
cd ..

git pull
npm install
npm run build
sudo systemctl restart lunuc-client
sudo systemctl restart lunuc-api
