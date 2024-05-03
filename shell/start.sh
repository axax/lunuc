#!/bin/sh

while getopts r: flag
do
    case "${flag}" in
        r) restart=${OPTARG};;
    esac
done

cd "$(dirname "$0")"
cd ..

git pull
npm install --legacy-peer-deps
npm run build

echo "restart "$restart

if [ $restart -eq "all" ]
then
  sudo systemctl restart lunuc-client
  sudo systemctl restart lunuc-api
fi

if [ $restart -eq "client" ]
then
  sudo systemctl restart lunuc-client
fi

if [ $restart -eq "api" ]
then
  sudo systemctl restart lunuc-api
fi