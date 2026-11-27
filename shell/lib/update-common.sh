# Shared by shell/start.sh, shell/update-node.sh and shell/update-mongodb.sh (sourced, POSIX sh).
#
# Expects:  ROOT_DIR, TASK (update|node|mongodb)
# Uses:     RESTART, FORCE, FROM, TO (written to the status file)
#           FAIL_MESSAGE (printed on failure), on_failure() (optional rollback hook)
# Provides: SUDO, now_utc, write_status, wait_for_unit
#
# local_tmp/update/status.json is shown in /admin/system -> Update (api/util/systemUpdate.mjs).

STATUS_DIR="$ROOT_DIR/local_tmp/update"
STATUS_FILE="$STATUS_DIR/status.json"

now_utc() {
    date -u +%Y-%m-%dT%H:%M:%SZ
}

STARTED_AT=$(now_utc)

# --- sudo detection: root needs no sudo, interactive users may be asked for a password,
#     non-interactive runs (admin ui, cron) must not hang on a password prompt
if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
elif [ -t 0 ]; then
    SUDO="sudo"
else
    SUDO="sudo -n"
fi

# never let the status file break the update (e.g. no write permission)
write_status() {
    {
        mkdir -p "$STATUS_DIR" &&
        printf '{"task":"%s","state":"%s","exitCode":%s,"restart":"%s","force":%s,"from":"%s","to":"%s","startedAt":"%s","finishedAt":"%s","pid":%s}\n' \
            "$TASK" "$1" "${2:-null}" "${RESTART:-none}" "${FORCE:-false}" "${FROM:-}" "${TO:-}" "$STARTED_AT" "${3:-}" "$$" > "$STATUS_FILE.tmp" &&
        mv -f "$STATUS_FILE.tmp" "$STATUS_FILE"
    } 2>/dev/null || true
}

on_exit() {
    code=$?
    if [ $code -ne 0 ]; then
        set +e
        if command -v on_failure >/dev/null 2>&1; then
            on_failure
        fi
        echo ""
        echo "FAILED (exit code $code)${FAIL_MESSAGE:+ - $FAIL_MESSAGE}"
        write_status failed $code "$(now_utc)"
    fi
}
trap on_exit EXIT

# wait_for_unit <unit>: after a restart the unit must be active and must not have been restarted
# by systemd in the meantime (Restart=always hides a crash loop from "is-active")
wait_for_unit() {
    unit=$1
    sleep 3
    first=$(systemctl show -p ExecMainStartTimestampMonotonic --value "$unit" 2>/dev/null)
    sleep 10
    second=$(systemctl show -p ExecMainStartTimestampMonotonic --value "$unit" 2>/dev/null)
    if ! systemctl is-active --quiet "$unit" || [ "$first" != "$second" ]; then
        echo "$unit does not run stable:"
        systemctl status --no-pager -n 20 "$unit" 2>&1 || true
        return 1
    fi
    echo "$unit is running"
}
