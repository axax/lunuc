#!/bin/sh
cd "$(dirname "$0")"


cp ../buildconfig.json /etc/lunuc/buildconfig.json
cp ./services/lunuc-api.service /etc/systemd/system/lunuc-api.service
cp ./services/lunuc-client.service /etc/systemd/system/lunuc-client.service

chmod +x ./start-api.sh
