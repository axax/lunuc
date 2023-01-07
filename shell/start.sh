#!/bin/sh

while getopts r: flag
do
    case "${flag}" in
        r) restart=${OPTARG};;
    esac
done

cd "$(dirname "$0")"
cd ..

echo "restart "$restart

if [ $restart = "all" ]
then
  sudo systemctl restart lunuc-client
  sudo systemctl restart lunuc-api
fi

if [ $restart = "client" ]
then
  sudo systemctl restart lunuc-client
fi

if [ $restart = "api" ]
then
  sudo systemctl restart lunuc-api
fi