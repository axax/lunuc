#!/bin/bash
# Installiert den ffmpeg-Helfer für die Lunuc-Chrome-Erweiterung (Chrome, Brave, Chromium, Edge, Arc).
# Aufruf: ./install.sh [extension-id]
# Ohne ID wird sie aus dem "key" in ../extension/manifest.json berechnet (feste ID, unabhängig vom Ordner).
set -e
# beim Doppelklick (Installieren.command) ist der PATH minimal
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node || true)"
FFMPEG="$(command -v ffmpeg || true)"
[ -z "$NODE" ] && { echo "node nicht gefunden (https://nodejs.org oder brew install node)"; exit 1; }

EXT_ID="$1"
if [ -z "$EXT_ID" ]; then
  EXT_ID=$("$NODE" -e '
    const key = require(process.argv[1]).key
    if (!key) process.exit(1)
    const h = require("crypto").createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32)
    console.log([...h].map(c => String.fromCharCode(97 + parseInt(c, 16))).join(""))
  ' "$DIR/../extension/manifest.json") || { echo "Kein key in extension/manifest.json – Aufruf: $0 <extension-id>"; exit 1; }
fi
echo "Erweiterungs-ID: $EXT_ID"
[ -z "$FFMPEG" ] && echo "Warnung: ffmpeg nicht gefunden (brew install ffmpeg)"

# Wrapper mit absoluten Pfaden, weil der Browser den Host mit minimalem PATH startet
cat > "$DIR/ffmpeg-host.sh" <<WRAP
#!/bin/bash
export FFMPEG="$FFMPEG"
exec "$NODE" "$DIR/ffmpeg-host.js"
WRAP
chmod +x "$DIR/ffmpeg-host.sh" "$DIR/ffmpeg-host.js"

MANIFEST=$(cat <<JSON
{
  "name": "com.lunuc.ffmpeg",
  "description": "Lunuc ffmpeg helper",
  "path": "$DIR/ffmpeg-host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
JSON
)

if [ "$(uname)" = "Darwin" ]; then
  BASES=("$HOME/Library/Application Support/Google/Chrome"
         "$HOME/Library/Application Support/BraveSoftware/Brave-Browser"
         "$HOME/Library/Application Support/Chromium"
         "$HOME/Library/Application Support/Microsoft Edge"
         "$HOME/Library/Application Support/Arc/User Data")
else
  BASES=("$HOME/.config/google-chrome" "$HOME/.config/BraveSoftware/Brave-Browser"
         "$HOME/.config/chromium" "$HOME/.config/microsoft-edge")
fi

for B in "${BASES[@]}"; do
  if [ -d "$B" ]; then
    mkdir -p "$B/NativeMessagingHosts"
    echo "$MANIFEST" > "$B/NativeMessagingHosts/com.lunuc.ffmpeg.json"
    echo "Installiert: $B/NativeMessagingHosts/com.lunuc.ffmpeg.json"
  fi
done
echo "Fertig. Erweiterung neu laden."
