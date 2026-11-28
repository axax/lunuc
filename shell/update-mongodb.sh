#!/usr/bin/env bash
#
# Update MongoDB (packages mongodb-org* from the official apt repository, service "mongod").
#
#   update-mongodb.sh -s <series> [-b <backup dir>]
#
#   -s  release series, e.g. 8.0
#       same series as installed: latest patch release of this series
#       next series:              major upgrade (switches the apt source to mongodb-org/<series>).
#                                 Only one series at a time, featureCompatibilityVersion must be set
#                                 to the installed series first (checked by the api).
#   -b  mongodump backup into this directory before the update. The connection url is read from
#       local_tmp/update/mongodb.url (written by the api, deleted right away).
#
# Started from /admin/system -> Update (api/util/systemRuntime.mjs), status in local_tmp/update/status.json.

set -e

SERIES=""
BACKUP_DIR=""
while getopts s:b: flag
do
    case "${flag}" in
        s) SERIES=${OPTARG};;
        b) BACKUP_DIR=${OPTARG};;
        *) echo "usage: $0 -s <series, e.g. 8.0> [-b <backup dir>]"; exit 2;;
    esac
done
if ! printf '%s' "$SERIES" | grep -Eq '^[0-9]+\.[0-9]+$'; then
    echo "invalid series: $SERIES (e.g. 8.0)"
    exit 2
fi

cd "$(dirname "$0")"
cd ..
ROOT_DIR=$(pwd)

TASK=mongodb
FAIL_MESSAGE="see log above"
. "$ROOT_DIR/shell/lib/update-common.sh"

URL_FILE="$STATUS_DIR/mongodb.url"
MONGO_URL=""
if [ -f "$URL_FILE" ]; then
    MONGO_URL=$(cat "$URL_FILE")
    rm -f "$URL_FILE"
fi

FROM=$(dpkg-query -W -f='${Version}' mongodb-org-server 2>/dev/null || true)
TO=""
write_status running

echo "=== $(date) mongodb update $FROM -> $SERIES as $(id -un)"

if ! command -v apt-get >/dev/null 2>&1; then
    echo "only supported with apt (Debian / Ubuntu)"
    exit 1
fi
if [ -z "$FROM" ]; then
    echo "package mongodb-org-server is not installed"
    exit 1
fi
if ! systemctl is-active --quiet mongod; then
    echo "service mongod is not running - update MongoDB manually"
    exit 1
fi
CURRENT_SERIES=$(printf '%s' "$FROM" | cut -d. -f1,2)
APT="$SUDO env DEBIAN_FRONTEND=noninteractive apt-get"

SOURCES_CHANGED=false
INSTALLED=false
OLD_LIST=""
NEW_LIST=""

on_failure() {
    if [ "$SOURCES_CHANGED" = true ] && [ "$INSTALLED" = false ]; then
        echo "=== rollback: apt source mongodb-org/$CURRENT_SERIES"
        $SUDO rm -f "$NEW_LIST"
        $SUDO mv -f "$OLD_LIST.disabled" "$OLD_LIST"
        $APT update -qq
    fi
    if [ "$INSTALLED" = true ] && ! systemctl is-active --quiet mongod; then
        echo "mongod is not running! Check: journalctl -u mongod / /var/log/mongodb/mongod.log"
    fi
}

if [ -n "$BACKUP_DIR" ]; then
    if [ -z "$MONGO_URL" ]; then
        echo "no connection url for the backup"
        exit 1
    fi
    BACKUP_DIR=${BACKUP_DIR%/}
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/backup.db.$(date +%s)000.gz"
    echo "=== mongodump -> $BACKUP_FILE"
    # .part until finished, like the backups in /admin/system -> Backup
    mongodump --uri "$MONGO_URL" --archive="$BACKUP_FILE.part" --gzip --quiet
    mv -f "$BACKUP_FILE.part" "$BACKUP_FILE"
    echo "backup: $(du -h "$BACKUP_FILE" | cut -f1)"
fi
MONGO_URL=""

if [ "$SERIES" != "$CURRENT_SERIES" ]; then
    OLD_LIST=$(grep -l "mongodb-org/$CURRENT_SERIES" /etc/apt/sources.list.d/*.list 2>/dev/null | head -n1 || true)
    if [ -z "$OLD_LIST" ]; then
        echo "no apt source with mongodb-org/$CURRENT_SERIES in /etc/apt/sources.list.d/*.list found"
        exit 1
    fi
    NEW_LIST="/etc/apt/sources.list.d/mongodb-org-$SERIES.list"

    # the repository has to exist for this distribution (e.g. 9.0 is only built for debian trixie)
    REPO_URL=$(grep -o 'https://repo.mongodb.org/apt/[a-z]*' "$OLD_LIST" | head -n1)
    SUITE=$(grep -o "[a-z]*/mongodb-org/$CURRENT_SERIES" "$OLD_LIST" | head -n1 | cut -d/ -f1)
    if [ -n "$REPO_URL" ] && [ -n "$SUITE" ]; then
        if ! curl -fsSI "$REPO_URL/dists/$SUITE/mongodb-org/$SERIES/Release" >/dev/null; then
            echo "MongoDB $SERIES is not available for '$SUITE' ($REPO_URL/dists/$SUITE/mongodb-org/$SERIES)."
            echo "An upgrade of the distribution is needed first - see https://www.mongodb.com/docs/manual/administration/install-community-linux/"
            exit 1
        fi
    fi

    echo "=== apt source mongodb-org/$CURRENT_SERIES -> mongodb-org/$SERIES"
    # signing key: per series up to 8.x (server-8.0.asc), per major version since 9 (server-9.asc)
    KEY_FILE=$(mktemp)
    KEYRING=""
    for name in "$SERIES" "${SERIES%%.*}"; do
        if curl -fsSL "https://pgp.mongodb.com/server-$name.asc" -o "$KEY_FILE"; then
            KEYRING="/usr/share/keyrings/mongodb-server-$name.gpg"
            echo "key: https://pgp.mongodb.com/server-$name.asc"
            break
        fi
    done
    if [ -z "$KEYRING" ]; then
        rm -f "$KEY_FILE"
        echo "no signing key found for MongoDB $SERIES on pgp.mongodb.com"
        exit 1
    fi
    $SUDO gpg --dearmor --yes -o "$KEYRING" "$KEY_FILE"
    rm -f "$KEY_FILE"
    sed -e "s#mongodb-org/$CURRENT_SERIES#mongodb-org/$SERIES#g" -e "s#signed-by=[^] ]*#signed-by=$KEYRING#" "$OLD_LIST" \
        | $SUDO tee "$NEW_LIST.tmp" >/dev/null
    SOURCES_CHANGED=true
    $SUDO mv -f "$OLD_LIST" "$OLD_LIST.disabled"
    $SUDO mv -f "$NEW_LIST.tmp" "$NEW_LIST"
    cat "$NEW_LIST"
fi

echo "=== apt-get update"
$APT update -qq

CANDIDATE=$(apt-cache policy mongodb-org-server | awk '/Candidate:/{print $2}')
echo "installed: $FROM, available: ${CANDIDATE:-none}"
case "$CANDIDATE" in
    "$SERIES".*) ;;
    *) echo "no mongodb-org-server $SERIES.x in the apt repository for this distribution"; exit 1;;
esac
if [ "$CANDIDATE" = "$FROM" ]; then
    TO=$FROM
    write_status success 0 "$(now_utc)"
    echo "=== MongoDB $FROM is up to date"
    exit 0
fi

# all installed packages of the mongodb repository (meta package, server, tools, shell)
PACKAGES=$(dpkg-query -W -f='${Package} ${db:Status-Status}\n' 'mongodb-org*' 'mongodb-mongosh*' 'mongodb-database-tools' 2>/dev/null \
    | awk '$2 == "installed" {print $1}' || true)
echo "=== apt-get install $(echo $PACKAGES)"
INSTALLED=true
$APT install -y --allow-change-held-packages -o Dpkg::Options::=--force-confold $PACKAGES
TO=$(dpkg-query -W -f='${Version}' mongodb-org-server)

write_status restarting 0 "$(now_utc)"
echo "=== restart mongod"
$SUDO systemctl restart mongod
wait_for_unit mongod

write_status success 0 "$(now_utc)"
echo "=== MongoDB $FROM -> $TO"
if [ "$SERIES" != "$CURRENT_SERIES" ]; then
    echo "featureCompatibilityVersion is still $CURRENT_SERIES: set it to $SERIES in /admin/system -> Update once everything runs fine"
    echo "(as long as it is $CURRENT_SERIES a downgrade back to $CURRENT_SERIES is possible)"
fi
