# ffmpeg-Helfer (Native Messaging)

Damit die Erweiterung heruntergeladene Streams automatisch mit
`ffmpeg -c copy -movflags +faststart` in eine MP4 umwandeln kann, muss dieser
Helfer einmalig installiert werden. Voraussetzung: `node` und `ffmpeg` (`brew install ffmpeg`).

1. Erweiterung unter `chrome://extensions` (bzw. `brave://extensions`) neu laden und die **ID** kopieren.
2. `./install.sh <ID>`
3. Erweiterung nochmals neu laden.

Danach zeigt die Download-Seite „ffmpeg-Helfer gefunden“. Die Teildateien werden dann
ohne Speichern-Dialog in den Download-Ordner geladen, zu `Titel.mp4` zusammengeführt
und anschliessend gelöscht.

Hinweis: Die ID einer entpackten Erweiterung hängt vom Ordnerpfad ab. Wird der Ordner
verschoben, `install.sh` mit der neuen ID erneut ausführen.

## Automatischer Upload (FTP / FTPS / SFTP)

`config.example.json` nach `config.json` kopieren und anpassen (`chmod 600 config.json`).
Ist `ftp.url` gesetzt, wird die fertige MP4 nach der Umwandlung mit `curl` dorthin hochgeladen,
fehlende Verzeichnisse werden angelegt.

- `url`: Zielverzeichnis, z.B. `ftp://host/filme/` oder `sftp://host/home/user/filme/`
  (SFTP nur, wenn das lokale curl SFTP unterstützt: `curl -V | grep sftp`)
- `user` / `password`: Zugangsdaten. Alternativ `"netrc": true` und die Daten in `~/.netrc` ablegen.
- `ssl`: `true` erzwingt FTPS (explizites TLS)
- `deleteAfterUpload`: lokale MP4 nach erfolgreichem Upload löschen

`config.json` steht in `.gitignore` und wird nicht eingecheckt. Die Konfiguration wird bei
jedem Download neu gelesen, die Erweiterung muss dafür nicht neu geladen werden.
