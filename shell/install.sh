#!/bin/sh
cd "$(dirname "$0")"

read -p "Are you sure you want to intall lunuc? Enter y or n: " -n 1 -r
echo    # (optional) move to a new line
if [[ $REPLY =~ ^[Yy]$ ]]
then
  echo "installing lunuc"
  mkdir /etc/lunuc
  cp -i ../buildconfig.json /etc/lunuc/buildconfig.json
  cp -i ./services/lunuc-api.service /etc/systemd/system/lunuc-api.service
  cp -i ./services/lunuc-client.service /etc/systemd/system/lunuc-client.service
  chmod +x ./start-api.sh
fi
