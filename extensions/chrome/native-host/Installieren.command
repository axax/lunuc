#!/bin/bash
# Doppelklick im Finder: installiert den ffmpeg-Helfer für die Lunuc-Erweiterung
cd "$(dirname "$0")"
./install.sh
echo
read -n 1 -s -r -p "Taste drücken zum Schliessen…"
