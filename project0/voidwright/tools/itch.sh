#!/bin/bash
# itch.sh: a standalone web build (for itch.io and other hosts) in build/itch/, zipped as
# build/voidwright-itch.zip: the game, its sounds, three.js, and a stand-in for the Project 0 runtime
# (itch/runtime.js). Upload the zip as an HTML game; index.html is at its root.
cd "$(dirname "$0")/.." || exit 1
THREE=$(node -e "console.log(require('path').dirname(require.resolve('three/package.json')))" 2>/dev/null || echo ../../node_modules/three)
out=build/itch
rm -rf "$out" build/voidwright-itch.zip && mkdir -p "$out/lib/addons/utils"
cp -r main.js src sfx "$out"/
cp itch/index.html itch/runtime.js "$out"/
cp "$THREE/build/three.module.js" "$THREE/build/three.core.js" "$out/lib/"
cp "$THREE/examples/jsm/utils/BufferGeometryUtils.js" "$out/lib/addons/utils/"
cp "$THREE/LICENSE" "$out/lib/THREE-LICENSE.txt"
[ -f assets/font/OFL.txt ] && cp assets/font/OFL.txt "$out/FONT-LICENSE.txt"
(cd "$out" && zip -qr ../voidwright-itch.zip .)
ls -la build/voidwright-itch.zip && find "$out" -type f | wc -l
