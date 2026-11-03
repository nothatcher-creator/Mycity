// node tools/placestest.mjs [map.png]: lays out the island's buildings and props, prints counts and timings,
// and (with a file name) draws them over the map.
import { createRequire } from 'node:module'
import { initHeightfield, heightAt, waterLevel, roadLines } from '../src/world/heightfield.js'
import { buildPlaces, BUILDINGS, PROPS, POINTS } from '../src/world/places.js'
import { Kit } from '../src/world/kit.js'
import { TYPES, shell } from '../src/world/buildings.js'
import { PROP_TYPES } from '../src/world/props.js'
import { HALF, WORLD } from '../src/world/blueprint.js'
let t = Date.now(); initHeightfield(); console.log('heightfield', Date.now() - t, 'ms')
t = Date.now(); buildPlaces(); console.log('places', Date.now() - t, 'ms', 'buildings', BUILDINGS.length, 'props', PROPS.length, 'points', POINTS.length, 'roads', roadLines.length)
const by = {}; for (const b of BUILDINGS) { const k = (b.place || 'wild') + ':' + b.type; by[k] = (by[k] || 0) + 1 }
const perPlace = {}; for (const b of BUILDINGS) perPlace[b.place || 'wild'] = (perPlace[b.place || 'wild'] || 0) + 1
console.log(perPlace)
let dt = 0, st = 0, cols = 0; t = Date.now()
for (const b of BUILDINGS) { const k = new Kit(); k.setFrame(b.x, b.y, b.z, b.yaw); (TYPES[b.type] || PROP_TYPES[b.type])(k, b); dt += k.tris; cols += k.colliders.length; const s = new Kit(); shell(s, b); st += s.tris }
console.log('detail tris', dt, 'colliders', cols, 'shell tris', st, 'kit time', Date.now() - t, 'ms')
if (process.argv[2]) {
  const require = createRequire(import.meta.url)
  const sharp = require('/tmp/claude-0/-home-user-Mycity/a03568d1-65e7-5a57-a64e-401a1a6548d3/scratchpad/lotgen/node_modules/sharp')
  const S = 1400, px = Buffer.alloc(S * S * 3)
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const x = (i + 0.5) / S * WORLD - HALF, z = (j + 0.5) / S * WORLD - HALF; const h = heightAt(x, z), w = waterLevel(x, z); const k = (j * S + i) * 3; if (w > h) { px[k] = 40; px[k + 1] = 90; px[k + 2] = 140 } else { const v = Math.min(255, 90 + h * 0.2); px[k] = v * 0.6; px[k + 1] = v * 0.8; px[k + 2] = v * 0.5 } }
  const put = (x, z, c) => { const i = Math.round((x + HALF) / WORLD * S), j = Math.round((z + HALF) / WORLD * S); if (i < 0 || j < 0 || i >= S || j >= S) return; const k = (j * S + i) * 3; px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2] }
  for (const r of roadLines) for (const p of r.pts) put(p[0], p[1], p[3] === 1 ? [255, 60, 60] : [40, 40, 40])
  for (const b of BUILDINGS) { const c = Math.cos(b.yaw), s = Math.sin(b.yaw); for (let u = -b.w / 2; u <= b.w / 2; u += 4) for (let v = -b.d / 2; v <= b.d / 2; v += 4) put(b.x + u * c + v * s, b.z - u * s + v * c, b.type === 'tower' ? [255, 255, 255] : [230, 200, 120]) }
  for (const p of POINTS) put(p.x, p.z, [255, 0, 255])
  await sharp(px, { raw: { width: S, height: S, channels: 3 } }).png().toFile(process.argv[2])
}
