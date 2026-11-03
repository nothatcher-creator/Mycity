#!/bin/bash
# pack.sh: zips the experience package (main.js, experience.json, src/, sfx/) into build/experience.zip.
cd "$(dirname "$0")/.." && mkdir -p build && rm -f build/experience.zip && zip -qr build/experience.zip main.js experience.json src sfx && ls -la build/experience.zip
