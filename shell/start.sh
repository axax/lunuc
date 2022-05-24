#!/bin/sh
cd "$(dirname "$0")"
cd ..

git pull
npm install --legacy-peer-deps
npm run build
sudo systemctl restart lunuc-client
sudo systemctl restart lunuc-api
