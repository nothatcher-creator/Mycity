// node tools/mapgen.mjs [out.png] [size]: renders the island's heightfield, rivers and roads to a PNG.
import { createRequire } from 'node:module'
import { initHeightfield, heightAt, waterLevel, forestAt, fieldAt, roadLines, riverLines, normalAt } from '../src/world/heightfield.js'
import { HALF, WORLD, PLACES, LAND_COLORS as C } from '../src/world/blueprint.js'
const require = createRequire(import.meta.url)
const sharp = require(process.env.SHARP || '/tmp/claude-0/-home-user-Mycity/a03568d1-65e7-5a57-a64e-401a1a6548d3/scratchpad/lotgen/node_modules/sharp')
const out = process.argv[2] || 'map.png', S = +(process.argv[3] || 1024)
let t = Date.now(); initHeightfield(); console.log('init', Date.now() - t, 'ms', 'roads', roadLines.length)
t = Date.now()
const px = Buffer.alloc(S * S * 3), n = [0, 1, 0]
for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
  const x = (i + 0.5) / S * WORLD - HALF, z = (j + 0.5) / S * WORLD - HALF
  const h = heightAt(x, z), w = waterLevel(x, z)
  let c
  if (w > h) { const d = Math.min(1, (w - h) / 30); c = [0.16 - 0.1 * d, 0.45 - 0.2 * d, 0.65 - 0.15 * d] }
  else {
    normalAt(x, z, n, 10)
    c = h < 2.5 ? C.sand : C.grass
    const f = forestAt(x, z, h); if (f > 0.5) c = C.forest
    const fl = fieldAt(x, z); if (fl && f < 0.5) c = [C.field1, C.field2, C.field3][fl - 1]
    if (n[1] < 0.62 || h > 640) c = C.rock
    const shade = 0.55 + 0.45 * Math.max(0, n[0] * -0.5 + n[1] * 0.7 + n[2] * -0.5) + Math.min(0.25, h / 3000)
    c = c.map(v => v * shade)
  }
  const k = (j * S + i) * 3
  px[k] = Math.min(255, c[0] * 255); px[k + 1] = Math.min(255, c[1] * 255); px[k + 2] = Math.min(255, c[2] * 255)
}
const put = (x, z, col) => { const i = Math.round((x + HALF) / WORLD * S), j = Math.round((z + HALF) / WORLD * S); if (i < 0 || j < 0 || i >= S || j >= S) return; const k = (j * S + i) * 3; px[k] = col[0]; px[k + 1] = col[1]; px[k + 2] = col[2] }
for (const r of roadLines) for (const p of r.pts) put(p[0], p[1], p[3] === 1 ? [255, 40, 40] : r.kind === 'dirt' ? [150, 100, 60] : r.kind === 'highway' ? [30, 30, 30] : [80, 80, 80])
for (const p of PLACES) for (let a = 0; a < 40; a++) put(p.x + Math.cos(a / 40 * 6.28) * p.r, p.z + Math.sin(a / 40 * 6.28) * p.r, [255, 255, 255])
await sharp(px, { raw: { width: S, height: S, channels: 3 } }).png().toFile(out)
console.log('render', Date.now() - t, 'ms')
let hi = -1e9, at; for (let z = -HALF; z < HALF; z += 40) for (let x = -HALF; x < HALF; x += 40) { const h = heightAt(x, z); if (h > hi) { hi = h; at = [x, z] } }
console.log('highest', hi.toFixed(0), at)
for (const p of PLACES) console.log(p.id, heightAt(p.x, p.z).toFixed(1), 'water', waterLevel(p.x, p.z).toFixed(1))
