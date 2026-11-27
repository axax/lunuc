#!/usr/bin/env bash
#
# Switch the Node.js version of the lunuc services (managed with nvm).
#
#   update-node.sh -v v26.14.0
#
# 1. nvm install <version>
# 2. major version changed: npm rebuild (native modules are compiled for the ABI of a node major)
# 3. replaces .../versions/node/<old>/bin in the PATH of every /etc/systemd/system/lunuc-*.service
#    (the original is kept as <file>.bak)
# 4. systemctl daemon-reload, restart the changed services, check that they run stable
# 5. nvm alias default <version>
#
# On an error after step 2 everything is rolled back (service files, npm rebuild with the old version,
# restart). The old node version stays installed (nvm ls / nvm uninstall <version>).
# Started from /admin/system -> Update (api/util/systemUpdate.mjs), status in local_tmp/update/status.json.

set -e

VERSION=""
while getopts v: flag
do
    case "${flag}" in
        v) VERSION=${OPTARG};;
        *) echo "usage: $0 -v <node version, e.g. v26.14.0>"; exit 2;;
    esac
done

case "$VERSION" in
    v*) ;;
    *) VERSION="v$VERSION";;
esac
if ! printf '%s' "$VERSION" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "invalid node version: $VERSION (e.g. v26.14.0)"
    exit 2
fi

cd "$(dirname "$0")"
cd ..
ROOT_DIR=$(pwd)

TASK=node
RESTART=all
FAIL_MESSAGE="node version of the services was not changed"
. "$ROOT_DIR/shell/lib/update-common.sh"

OLD_NODE=$(command -v node || true)
FROM=$(node -v 2>/dev/null || echo "")
TO=$VERSION
write_status running

echo "=== $(date) switch node $FROM -> $VERSION as $(id -un)"

# nvm dir from the running node (.../versions/node/vX/bin/node), otherwise the default
case "$OLD_NODE" in
    */versions/node/*) NVM_DIR=${OLD_NODE%%/versions/node/*};;
    *) NVM_DIR=${NVM_DIR:-$HOME/.nvm};;
esac
export NVM_DIR
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    echo "nvm not found ($NVM_DIR/nvm.sh)"
    exit 1
fi
OLD_BIN=""
case "$OLD_NODE" in
    "$NVM_DIR"/versions/node/*) OLD_BIN=$(dirname "$OLD_NODE");;
esac
NEW_BIN="$NVM_DIR/versions/node/$VERSION/bin"

# services that get node from nvm via PATH
SERVICE_FILES=$(grep -l "$NVM_DIR/versions/node/v[0-9][0-9.]*/bin" /etc/systemd/system/lunuc-*.service 2>/dev/null || true)
if [ -z "$SERVICE_FILES" ]; then
    echo "no /etc/systemd/system/lunuc-*.service with $NVM_DIR/versions/node/... in its PATH found"
    exit 1
fi
UNITS=""
for f in $SERVICE_FILES; do
    UNITS="$UNITS $(basename "$f" .service)"
done
echo "services:$UNITS"

echo "=== nvm install $VERSION"
# nvm is not "set -e" safe
set +e
. "$NVM_DIR/nvm.sh" --no-use
nvm install "$VERSION"
set -e
if [ ! -x "$NEW_BIN/node" ]; then
    echo "$NEW_BIN/node not found after nvm install"
    exit 1
fi
echo "node $("$NEW_BIN/node" -v), npm $(PATH="$NEW_BIN:$PATH" npm -v)"

REBUILT=false
SERVICES_CHANGED=false

# api last: the admin ui polls the api
restart_units() {
    for unit in $UNITS; do
        [ "$unit" = "lunuc-api" ] || $SUDO systemctl restart "$unit"
    done
    case " $UNITS " in
        *" lunuc-api "*) $SUDO systemctl restart lunuc-api;;
    esac
}

on_failure() {
    if [ "$SERVICES_CHANGED" = true ]; then
        echo "=== rollback: restore service files"
        for f in $SERVICE_FILES; do
            $SUDO mv -f "$f.bak" "$f"
        done
        $SUDO systemctl daemon-reload
    fi
    if [ "$REBUILT" = true ] && [ -n "$OLD_BIN" ]; then
        echo "=== rollback: npm rebuild with $FROM"
        PATH="$OLD_BIN:$PATH" npm rebuild
    fi
    if [ "$SERVICES_CHANGED" = true ]; then
        echo "=== rollback: restart services with $FROM"
        restart_units
    fi
}

OLD_MAJOR=${FROM#v}
OLD_MAJOR=${OLD_MAJOR%%.*}
NEW_MAJOR=${VERSION#v}
NEW_MAJOR=${NEW_MAJOR%%.*}
if [ "$OLD_MAJOR" != "$NEW_MAJOR" ]; then
    echo "=== npm rebuild (major version $OLD_MAJOR -> $NEW_MAJOR)"
    REBUILT=true
    PATH="$NEW_BIN:$PATH" npm rebuild
fi

echo "=== update service files"
SERVICES_CHANGED=true
for f in $SERVICE_FILES; do
    $SUDO sed -i.bak "s#$NVM_DIR/versions/node/v[0-9][0-9.]*/bin#$NEW_BIN#g" "$f"
    echo "$f: $(grep -o "$NVM_DIR/versions/node/v[0-9.]*/bin" "$f" | head -n1)"
done
$SUDO systemctl daemon-reload

# status before the restart: this script survives the restart of lunuc-api (own systemd unit),
# but the api is not reachable for a moment
write_status restarting 0 "$(now_utc)"

echo "=== restart$UNITS"
restart_units
for unit in $UNITS; do
    wait_for_unit "$unit"
done

set +e
nvm alias default "$VERSION" >/dev/null 2>&1 || echo "could not set the nvm default alias"
set -e

write_status success 0 "$(now_utc)"
echo "=== node $VERSION is active (previous version $FROM stays installed: nvm uninstall $FROM)"
