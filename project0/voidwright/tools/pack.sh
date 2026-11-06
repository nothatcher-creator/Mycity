#!/bin/bash
# pack.sh: zips the experience package (main.js, experience.json, src/, sfx/) into build/experience.zip.
# Refuses source lines over 1,000 characters first (the platform rejects them).
cd "$(dirname "$0")/.." || exit 1
long=$(find main.js src -name '*.js' -exec awk 'length($0) > 1000 { print FILENAME ":" FNR " (" length($0) " chars)" }' {} +)
if [ -n "$long" ]; then echo "lines too long for Project 0:"; echo "$long"; exit 1; fi
mkdir -p build && rm -f build/experience.zip && zip -qr build/experience.zip main.js experience.json src sfx && ls -la build/experience.zip
