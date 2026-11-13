#!/bin/bash
# Installiert den ffmpeg-Helfer für die Lunuc-Chrome-Erweiterung (Chrome, Brave, Chromium, Edge, Arc).
# Aufruf: ./install.sh <extension-id>   (ID steht unter chrome://extensions bzw. brave://extensions)
set -e
EXT_ID="$1"
if [ -z "$EXT_ID" ]; then
  echo "Aufruf: $0 <extension-id>"; exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$(command -v node || true)"
FFMPEG="$(command -v ffmpeg || true)"
[ -z "$NODE" ] && { echo "node nicht gefunden"; exit 1; }
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
