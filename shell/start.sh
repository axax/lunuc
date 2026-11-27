#!/bin/sh
#
# Update lunuc: git pull, npm install, build and restart the services.
#
#   start.sh -r all|api|client|none [-f]
#
#   -f  force: local changes and local commits are overwritten with the tracking branch
#       (git reset --hard). Changes are saved with "git stash" first, "git stash list" shows them.
#       Untracked and ignored files (dbscripts, uploads, local_tmp, ...) are not touched.
#
# Works with and without sudo:
#   sudo /opt/lunuc/shell/start.sh -r all
#   /opt/lunuc/shell/start.sh -r all       (sudo is only used for systemctl, if not root)
#   sh /opt/lunuc/shell/start.sh -r all    (works even without the executable bit)
#
# Aborts on the first error, the services are then NOT restarted (the old build keeps running).
# Writes local_tmp/update/status.json, shown in /admin/system -> Update (see shell/lib/update-common.sh).

set -e

RESTART=none
FORCE=false
while getopts r:f flag
do
    case "${flag}" in
        r) RESTART=${OPTARG};;
        f) FORCE=true;;
        *) echo "usage: $0 [-r all|api|client|none] [-f]"; exit 2;;
    esac
done

case "$RESTART" in
    all|api|client|none) ;;
    *) echo "invalid restart option: $RESTART (all|api|client|none)"; exit 2;;
esac

cd "$(dirname "$0")"
cd ..
ROOT_DIR=$(pwd)

TASK=update
FAIL_MESSAGE="services were not restarted"
. "$ROOT_DIR/shell/lib/update-common.sh"

# git refuses repos owned by another user ("dubious ownership"), e.g. when run as root
GIT="git -c safe.directory=$ROOT_DIR"

FROM=$($GIT rev-parse --short HEAD 2>/dev/null || echo "")
TO=""

write_status running

echo "=== $(date) update lunuc in $ROOT_DIR as $(id -un), restart: $RESTART, force: $FORCE"

if [ "$FORCE" = true ]; then
    echo "=== git fetch + reset --hard (force)"
    $GIT fetch
    if [ -n "$($GIT status --porcelain --untracked-files=no)" ]; then
        # keep the local changes recoverable: git stash list / git stash show -p
        $GIT stash push -m "lunuc update $STARTED_AT (force)"
    fi
    $GIT reset --hard '@{u}'
else
    echo "=== git pull"
    $GIT pull --ff-only
fi
TO=$($GIT rev-parse --short HEAD)
write_status running
echo "version: $FROM -> $TO"

echo "=== npm install"
npm install --legacy-peer-deps

echo "=== npm run postinstall"
npm run postinstall

echo "=== npm run build"
npm run build

# status before the restart: if this script runs inside lunuc-api it gets killed by the restart
write_status restarting 0 "$(now_utc)"

echo "=== restart $RESTART"

if [ "$RESTART" = "all" ] || [ "$RESTART" = "client" ]
then
    $SUDO systemctl restart lunuc-client
fi

if [ "$RESTART" = "all" ] || [ "$RESTART" = "api" ]
then
    $SUDO systemctl restart lunuc-api
fi

write_status success 0 "$(now_utc)"
echo "=== update finished"
