#!/usr/bin/env bash
# Smoke test against a running lunuc DNS server.
#
#   ./dig-smoketest.sh [port] [blocked-host] [txt-domain]
#
# Start the server on a spare port first (5353), so production traffic is not
# affected while testing. Requires dig (bind9-dnsutils).

set -u

PORT="${1:-5353}"
BLOCKED="${2:-doubleclick.net}"
TXT_DOMAIN="${3:-google.com}"
SRV="@127.0.0.1 -p $PORT"

pass=0
fail=0

# Old dig (macOS ships BIND 9.10 from 2017) does not know the HTTPS/SVCB type
# names. Fall back to the numeric form, which every version understands - the
# answer then prints in RFC 3597 unknown-record format, which is fine here.
if dig -t HTTPS . 2>&1 | grep -q "invalid type"; then
    T_HTTPS="TYPE65"
    T_SVCB="TYPE64"
    echo "note: old dig detected, using numeric record types (brew install bind for a newer one)"
else
    T_HTTPS="HTTPS"
    T_SVCB="SVCB"
fi

# Preflight: without a listener every single check below fails identically,
# which tells you nothing about the server.
if ! dig $SRV example.com +time=3 +tries=1 2>&1 | grep -q "status:"; then
    echo
    echo "No answer from 127.0.0.1:$PORT - is the server listening on that port?"
    echo "  lsof -nP -iUDP:$PORT"
    echo "The listen() calls default to port 53; set settings.port to test elsewhere."
    exit 2
fi

# check <name> <expected-regex> <dig args...>
check() {
    local name="$1" expect="$2"; shift 2
    local out
    out=$(dig $SRV "$@" 2>&1)
    if grep -qE "$expect" <<< "$out"; then
        echo "  PASS  $name"
        pass=$((pass + 1))
    else
        echo "  FAIL  $name"
        echo "        expected /$expect/ in:"
        sed 's/^/        | /' <<< "$out" | head -20
        fail=$((fail + 1))
    fi
}

echo
echo "=== basic resolution ==============================================="
check "A record resolves"            'IN[[:space:]]+A[[:space:]]+[0-9]'   example.com +noall +answer
check "AAAA record resolves"         'IN[[:space:]]+AAAA'                 example.com -t AAAA +noall +answer
# Use a reserved, undelegated TLD (RFC 2606): the root servers answer NXDOMAIN
# for it. Do NOT use example.com here - it sits on Cloudflare, which returns
# NOERROR + SOA for nonexistent names ("black lies"), so the test would fail
# against a perfectly correct server.
# Two paths: A from localhost goes through the dns2 codec, TXT goes through the
# raw passthrough. Comparing them tells you where an rcode gets lost.
check "NXDOMAIN via parsed path"     'status: NXDOMAIN'                   nichtvorhanden.invalid
check "NXDOMAIN via raw path"        'status: NXDOMAIN'                   nichtvorhanden.invalid -t TXT

echo
echo "=== raw passthrough (the original bug) ============================="
# Before the fix these died in a 3s upstream timeout and came back SERVFAIL.
check "HTTPS/type 65 answered"       "IN[[:space:]]+(HTTPS|TYPE65)"       cloudflare.com -t "$T_HTTPS" +noall +answer
check "HTTPS not SERVFAIL"           'status: NOERROR'                    cloudflare.com -t "$T_HTTPS"
check "SVCB/type 64 does not fail"   'status: (NOERROR|NXDOMAIN)'         cloudflare.com -t "$T_SVCB"
check "MX still works"               'status: NOERROR'                    google.com -t MX
check "TXT still works"              'IN[[:space:]]+TXT'                  "$TXT_DOMAIN" -t TXT +noall +answer

echo
echo "=== EDNS and truncation ============================================"
# +noedns => no OPT record => we must stay inside 512 bytes and set TC.
check "no-EDNS large answer sets TC" 'flags:.* tc'                        "$TXT_DOMAIN" -t TXT +noedns +notcp +ignore
check "large buffer avoids TC"       'flags: qr[^;]*ra'                   "$TXT_DOMAIN" -t TXT +bufsize=4096 +notcp
# The client that saw TC must be able to retry - this is the listener that was
# commented out before.
check "TCP listener answers"         'status: NOERROR'                    example.com +tcp
check "TCP works on the raw path"    'status: NOERROR'                    cloudflare.com -t "$T_HTTPS" +tcp

echo
echo "=== case insensitivity ============================================="
# These only mean anything if $BLOCKED really has block:true in DnsHost.
# Otherwise they fail against a correct server. Check with:
#   db.DnsHost.find({block: true}, {name: 1}).limit(5)
check "mixed case resolves"          'status: NOERROR'                    ExAmPlE.CoM
check "question echoes client case"  'ExAmPlE\.CoM'                       ExAmPlE.CoM
check "block hits lower case"        '0\.0\.0\.0'                         "$BLOCKED" +noall +answer
check "block hits mixed case"        '0\.0\.0\.0'                         "$(tr 'a-z' 'A-Z' <<< "$BLOCKED")" +noall +answer
# Blocked host, non-address type: must be NODATA, not a malformed record.
# NOERROR alone would also match a perfectly normal answer - assert that the
# answer section is actually empty.
check "blocked MX is NODATA"         'ANSWER: 0'                          "$BLOCKED" -t MX
check "blocked HTTPS is NODATA"      'ANSWER: 0'                          "$BLOCKED" -t "$T_HTTPS"

echo
echo "=== cache and TTL =================================================="
# Second query must come out of the cache with a smaller TTL, never a fresh one.
first=$(dig $SRV example.com +noall +answer | awk '{print $2; exit}')
sleep 2
second=$(dig $SRV example.com +noall +answer | awk '{print $2; exit}')
echo "  ttl first=$first second=$second"
if [ -n "$first" ] && [ -n "$second" ] && [ "$second" -lt "$first" ]; then
    echo "  PASS  TTL decreases while cached"
    pass=$((pass + 1))
else
    echo "  FAIL  TTL did not decrease (cache or ageing broken)"
    fail=$((fail + 1))
fi

echo
echo "=== malformed input ================================================"
# A query with no question section must not throw inside the handler.
check "empty question handled"       'status: (NOERROR|FORMERR|SERVFAIL)' +qr . -t ANY

echo
echo "===================================================================="
echo "  $pass passed, $fail failed"
[ "$fail" -eq 0 ]
