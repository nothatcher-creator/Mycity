// The island drawn once as a map picture (relief shading, forest, fields, water, roads, buildings), used by
// the minimap, the map screen and the menus. Grid: 1 km squares, columns A-L west to east, rows 1-12 north
// to south; a reference like "F7 45 23" adds 10 m digits.
import { base, GRID, CELL, flatMask, bilinear, roadLines, riverLines, forestAt, fieldAt, waterLevel, landShape } from '../world/heightfield.js'
import { HALF, WORLD, PLACES, LAND_COLORS as LC } from '../world/blueprint.js'
import { BUILDINGS } from '../world/places.js'

let img = null
export const mapImage = () => img
export function worldToMap(x, z, size) { return [(x + HALF) / WORLD * size, (z + HALF) / WORLD * size] }
export function mapToWorld(px, py, size) { return [px / size * WORLD - HALF, py / size * WORLD - HALF] }
export function gridRef(x, z) {
  const cx = Math.floor((x + HALF) / 1000), cz = Math.floor((z + HALF) / 1000)
  const col = 'ABCDEFGHIJKL'[Math.max(0, Math.min(11, cx))], row = Math.max(1, Math.min(12, cz + 1))
  const ex = Math.floor(((x + HALF) % 1000) / 10), ez = Math.floor(((z + HALF) % 1000) / 10)
  return `${col}${row} ${String(ex).padStart(2, '0')} ${String(ez).padStart(2, '0')}`
}

export async function buildMapImage(size = 1024, pause = null) {
  const cv = new OffscreenCanvas(size, size), c = cv.getContext('2d')
  const im = c.createImageData(size, size), d = im.data
  for (let j = 0; j < size; j++) {
    const z = (j + 0.5) / size * WORLD - HALF
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) / size * WORLD - HALF
      const h = bilinear(base, x, z)
      const k = (j * size + i) * 4
      const wl = h < 0.5 ? 0 : -100
      let col
      if (h < 0.3) { const dd = Math.min(1, -h / 35); col = [0.42 - 0.25 * dd, 0.62 - 0.25 * dd, 0.72 - 0.15 * dd] }
      else {
        // relief: light from the north-west
        const hx = bilinear(base, x + 20, z) - bilinear(base, x - 20, z), hz = bilinear(base, x, z + 20) - bilinear(base, x, z - 20)
        const shade = Math.max(0.55, Math.min(1.25, 1 - (hx + hz) * 0.012))
        col = h < 3 ? LC.sand : forestAt(x, z, h) > 0.5 ? [0.32, 0.48, 0.28] : fieldAt(x, z) ? [0.78, 0.74, 0.5] : [0.62, 0.72, 0.48]
        if (h > 600) col = [0.68, 0.66, 0.62]
        // contour lines every 50 m
        // (every 250 m a darker index contour)
        const hn = bilinear(base, x + WORLD / size, z), hs = bilinear(base, x, z + WORLD / size)
        if (Math.floor(h / 250) !== Math.floor(hn / 250) || Math.floor(h / 250) !== Math.floor(hs / 250)) col = [col[0] * 0.6, col[1] * 0.58, col[2] * 0.52]
        else if (Math.floor(h / 50) !== Math.floor(hn / 50) || Math.floor(h / 50) !== Math.floor(hs / 50)) col = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.75]
        col = [col[0] * shade, col[1] * shade, col[2] * shade]
      }
      d[k] = Math.min(255, col[0] * 255); d[k + 1] = Math.min(255, col[1] * 255); d[k + 2] = Math.min(255, col[2] * 255); d[k + 3] = 255
    }
    if (pause && j % 128 === 0) await pause()
  }
  c.putImageData(im, 0, 0)
  const S = size / WORLD
  // rivers and lakes
  c.strokeStyle = '#4f8fb5'; c.lineCap = 'round'
  for (const r of riverLines) { c.lineWidth = Math.max(1.5, r.width * S); c.beginPath(); r.pts.forEach((p, i) => { const x = (p[0] + HALF) * S, y = (p[1] + HALF) * S; i ? c.lineTo(x, y) : c.moveTo(x, y) }); c.stroke() }
  // roads by kind
  const style = { highway: ['#c9862a', 2.4], road: ['#e8d36a', 1.6], dirt: ['#9c7a52', 1.0], street: ['#d8d4c8', 1.0], runway: ['#55575c', 5], taxiway: ['#6a6c70', 2.5], apron: ['#7a7c80', 3.5] }
  for (const pass of ['dirt', 'street', 'road', 'highway', 'apron', 'taxiway', 'runway']) for (const r of roadLines) {
    if (r.kind !== pass) continue
    const [col, w] = style[r.kind] || style.road
    c.strokeStyle = col; c.lineWidth = w * size / 1024
    c.beginPath(); r.pts.forEach((p, i) => { const x = (p[0] + HALF) * S, y = (p[1] + HALF) * S; i ? c.lineTo(x, y) : c.moveTo(x, y) }); c.stroke()
  }
  // buildings as dark blocks
  c.fillStyle = 'rgba(70,62,56,0.9)'
  for (const b of BUILDINGS) {
    c.save(); c.translate((b.x + HALF) * S, (b.z + HALF) * S); c.rotate(-b.yaw)
    c.fillRect(-b.w / 2 * S, -b.d / 2 * S, Math.max(1, b.w * S), Math.max(1, b.d * S)); c.restore()
  }
  img = cv
  return cv
}
