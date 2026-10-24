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
# Writes local_tmp/update/status.json, shown in /admin/system -> Update.

set -e

restart=none
force=false
while getopts r:f flag
do
    case "${flag}" in
        r) restart=${OPTARG};;
        f) force=true;;
        *) echo "usage: $0 [-r all|api|client|none] [-f]"; exit 2;;
    esac
done

case "$restart" in
    all|api|client|none) ;;
    *) echo "invalid restart option: $restart (all|api|client|none)"; exit 2;;
esac

cd "$(dirname "$0")"
cd ..
ROOT_DIR=$(pwd)

# --- sudo detection: root needs no sudo, interactive users may be asked for a password,
#     non-interactive runs (admin ui, cron) must not hang on a password prompt
if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
elif [ -t 0 ]; then
    SUDO="sudo"
else
    SUDO="sudo -n"
fi

# git refuses repos owned by another user ("dubious ownership"), e.g. when run as root
GIT="git -c safe.directory=$ROOT_DIR"

STATUS_DIR="$ROOT_DIR/local_tmp/update"
STATUS_FILE="$STATUS_DIR/status.json"
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FROM=$($GIT rev-parse --short HEAD 2>/dev/null || echo "")
TO=""

# never let the status file break the update (e.g. no write permission)
write_status() {
    {
        mkdir -p "$STATUS_DIR" &&
        printf '{"state":"%s","exitCode":%s,"restart":"%s","force":%s,"from":"%s","to":"%s","startedAt":"%s","finishedAt":"%s","pid":%s}\n' \
            "$1" "${2:-null}" "$restart" "$force" "$FROM" "$TO" "$STARTED_AT" "${3:-}" "$$" > "$STATUS_FILE.tmp" &&
        mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
    } 2>/dev/null || true
}

on_exit() {
    code=$?
    if [ $code -ne 0 ]; then
        echo ""
        echo "UPDATE FAILED (exit code $code) - services were not restarted"
        write_status failed $code "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    fi
}
trap on_exit EXIT

write_status running

echo "=== $(date) update lunuc in $ROOT_DIR as $(id -un), restart: $restart, force: $force"

if [ "$force" = true ]; then
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
write_status restarting 0 "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "=== restart $restart"

if [ "$restart" = "all" ] || [ "$restart" = "client" ]
then
    $SUDO systemctl restart lunuc-client
fi

if [ "$restart" = "all" ] || [ "$restart" = "api" ]
then
    $SUDO systemctl restart lunuc-api
fi

write_status success 0 "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=== update finished"
