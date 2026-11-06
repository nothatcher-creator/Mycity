// The block textures: one 1024 x 512 sheet of 32 squares painted at start-up (armour plates with bevelled
// edges and seams, heavy plate, vents, panels, hazard stripes, lamps, solar cells, nozzles, grating...).
// Most squares are grey so a block's paint colour tints them.
import * as THREE from 'three'

export const T = {
  ARMOR: 0, HEAVY: 1, METAL: 2, VENT: 3, PANEL: 4, HAZARD: 5, LIGHT: 6, SOLAR: 7,
  BATTERY: 8, NOZZLE: 9, DARK: 10, PIPE: 11, GRATE: 12, DASH: 13, SCREEN: 14, FLOOR: 15,
  CARGO: 16, FRAME: 17, RUBBER: 18, GLOW: 19, DOOR: 20, MED: 21, STRIPE: 22, FAN: 23,
  CORE: 24, RING: 25, PLAIN: 26, BEACON: 27, GLASS: 28, COIL: 29, GEAR: 30, TRUSS: 31,
}
export const COLS = 8, ROWS = 4, TILE = 128
// UV rectangle of a tile (inset so neighbours do not bleed in)
export function tileUV(t) {
  const c = t % COLS, r = Math.floor(t / COLS), e = 3 / (TILE * COLS), f = 3 / (TILE * ROWS)
  return [c / COLS + e, 1 - (r + 1) / ROWS + f, (c + 1) / COLS - e, 1 - r / ROWS - f]
}

export function makeAtlas() {
  const W = COLS * TILE, H = ROWS * TILE
  const cv = new OffscreenCanvas(W, H), c = cv.getContext('2d')
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const grain = (x, y, s, amt) => { for (let i = 0; i < s * s / 6; i++) { const v = rnd() * amt; c.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${v})`; c.fillRect(x + rnd() * s, y + rnd() * s, 1 + rnd() * 2, 1) } }
  const bevel = (x, y, s, w, hi = 0.35, lo = 0.4) => {
    c.fillStyle = `rgba(255,255,255,${hi})`; c.fillRect(x, y, s, w); c.fillRect(x, y, w, s)
    c.fillStyle = `rgba(0,0,0,${lo})`; c.fillRect(x, y + s - w, s, w); c.fillRect(x + s - w, y, w, s)
  }
  const at = (t) => [(t % COLS) * TILE, Math.floor(t / COLS) * TILE]
  const fill = (t, col) => { const [x, y] = at(t); c.fillStyle = col; c.fillRect(x, y, TILE, TILE); return [x, y] }
  const S = TILE
  // light armour: a plate with a bevelled rim and two seams, rivets in the corners
  { const [x, y] = fill(T.ARMOR, '#c8ccd0'); grain(x, y, S, 0.05); bevel(x, y, S, 7, 0.45, 0.45)
    c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x + 10, y + S * 0.62, S - 20, 2); c.fillRect(x + S * 0.38, y + 10, 2, S * 0.52)
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x + 10, y + S * 0.62 + 2, S - 20, 1)
    for (const [u, v] of [[16, 16], [S - 18, 16], [16, S - 18], [S - 18, S - 18]]) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(x + u, y + v, 2.2, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(x + u - 1, y + v - 2, 1, 1) } }
  // heavy armour: thick rim, inset plate, diagonal tread lines
  { const [x, y] = fill(T.HEAVY, '#9aa0a6'); grain(x, y, S, 0.07); bevel(x, y, S, 12, 0.4, 0.55)
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 20, y + 20, S - 40, S - 40); c.fillStyle = '#a4aab0'; c.fillRect(x + 23, y + 23, S - 46, S - 46)
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 3; for (let i = -S; i < S; i += 14) { c.beginPath(); c.moveTo(x + 23 + i, y + 23); c.lineTo(x + 23 + i + S - 46, y + S - 23); c.stroke() }
    bevel(x + 20, y + 20, S - 40, 3, 0.3, 0.35) }
  { const [x, y] = fill(T.METAL, '#b4b8bc'); grain(x, y, S, 0.06); bevel(x, y, S, 4, 0.3, 0.35) }
  { const [x, y] = fill(T.VENT, '#5a5f64'); bevel(x, y, S, 6); for (let i = 18; i < S - 14; i += 10) { c.fillStyle = '#1a1c1e'; c.fillRect(x + 14, y + i, S - 28, 5); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x + 14, y + i + 5, S - 28, 1) } }
  { const [x, y] = fill(T.PANEL, '#8a9096'); bevel(x, y, S, 5); c.fillStyle = '#2a2e33'; c.fillRect(x + 14, y + 14, S * 0.45, S * 0.3); c.fillStyle = '#39d1c4'; c.fillRect(x + 18, y + 18, S * 0.45 - 8, 4)
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 3 === 0 ? '#e0a03a' : '#3a3f45'; c.fillRect(x + 14 + i * 17, y + S * 0.62, 12, 12) } c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x + S * 0.65, y + 14, 2, S - 28) }
  { const [x, y] = fill(T.HAZARD, '#e0a020'); c.save(); c.beginPath(); c.rect(x, y, S, S); c.clip(); c.fillStyle = '#1c1c1c'; for (let i = -S; i < S * 2; i += 32) { c.beginPath(); c.moveTo(x + i, y); c.lineTo(x + i + 16, y); c.lineTo(x + i + 16 - S, y + S); c.lineTo(x + i - S, y + S); c.fill() } c.restore(); grain(x, y, S, 0.08) }
  { const [x, y] = fill(T.LIGHT, '#fffaf0'); const g = c.createRadialGradient(x + S / 2, y + S / 2, 4, x + S / 2, y + S / 2, S * 0.7); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e8e2d0'); c.fillStyle = g; c.fillRect(x, y, S, S) }
  { const [x, y] = fill(T.SOLAR, '#15224a'); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#1d3270' : '#1a2c62'; c.fillRect(x + 4 + i * 30, y + 4 + j * 30, 28, 28); c.fillStyle = 'rgba(160,190,255,0.25)'; c.fillRect(x + 4 + i * 30, y + 4 + j * 30 + 13, 28, 1) } }
  { const [x, y] = fill(T.BATTERY, '#7c8288'); bevel(x, y, S, 5); for (let i = 0; i < 3; i++) { c.fillStyle = '#2b3036'; c.fillRect(x + 14 + i * 36, y + 16, 28, S - 46); c.fillStyle = '#3fd58a'; c.fillRect(x + 18 + i * 36, y + 20 + 30, 20, S - 84) } c.fillStyle = '#e0a03a'; c.fillRect(x + 14, y + S - 22, S - 28, 6) }
  { const [x, y] = fill(T.NOZZLE, '#222428'); for (let r = 60; r > 6; r -= 9) { c.strokeStyle = `rgba(255,255,255,${0.05 + (60 - r) / 600})`; c.lineWidth = 3; c.beginPath(); c.arc(x + S / 2, y + S / 2, r, 0, 7); c.stroke() } }
  { const [x, y] = fill(T.DARK, '#2e3236'); grain(x, y, S, 0.06); bevel(x, y, S, 3, 0.15, 0.3) }
  { const [x, y] = fill(T.PIPE, '#8c9298'); for (let i = 0; i < S; i += 16) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, y + i, S, 3); c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(x, y + i + 3, S, 2) } }
  { const [x, y] = fill(T.GRATE, '#3a3e42'); for (let i = 6; i < S; i += 12) for (let j = 6; j < S; j += 12) { c.fillStyle = '#0c0d0e'; c.fillRect(x + i, y + j, 8, 8) } bevel(x, y, S, 4) }
  { const [x, y] = fill(T.DASH, '#30343a'); c.fillStyle = '#0f1418'; c.fillRect(x + 10, y + 10, S - 20, S * 0.45); c.fillStyle = '#2ee6d2'; for (let i = 0; i < 5; i++) c.fillRect(x + 16, y + 18 + i * 9, 20 + (i * 37) % 60, 3)
    for (let i = 0; i < 8; i++) { c.fillStyle = ['#e0a03a', '#3fd58a', '#e04a3a', '#7aa8ff'][i % 4]; c.fillRect(x + 12 + i * 13, y + S * 0.68, 9, 9) } }
  { const [x, y] = fill(T.SCREEN, '#071a1c'); c.fillStyle = '#2ee6d2'; for (let i = 0; i < 9; i++) c.fillRect(x + 12, y + 14 + i * 12, 18 + (i * 53) % 80, 3); c.strokeStyle = '#2ee6d2'; c.strokeRect(x + 4, y + 4, S - 8, S - 8) }
  { const [x, y] = fill(T.FLOOR, '#8a8f94'); for (let i = 0; i < S; i += 16) for (let j = 0; j < S; j += 16) { c.fillStyle = 'rgba(255,255,255,0.18)'; c.save(); c.translate(x + i + 8, y + j + 8); c.rotate((i + j) % 32 ? 0.6 : -0.6); c.fillRect(-5, -1.5, 10, 3); c.restore() } bevel(x, y, S, 4) }
  { const [x, y] = fill(T.CARGO, '#9aa0a6'); for (let i = 8; i < S; i += 24) { c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x + i, y + 6, 6, S - 12); c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x + i + 6, y + 6, 2, S - 12) } bevel(x, y, S, 6) }
  { const [x, y] = fill(T.FRAME, '#6a7076'); bevel(x, y, S, 10); c.fillStyle = '#2b2f33'; c.fillRect(x + 14, y + 14, S - 28, S - 28) }
  { const [x, y] = fill(T.RUBBER, '#202224'); grain(x, y, S, 0.1) }
  { fill(T.GLOW, '#ffffff') }
  { const [x, y] = fill(T.DOOR, '#a8aeb4'); bevel(x, y, S, 6); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x + S / 2 - 2, y + 6, 4, S - 12); c.fillStyle = '#e0a020'; c.fillRect(x + 6, y + S - 18, S - 12, 6); c.fillStyle = '#39d1c4'; c.fillRect(x + S * 0.75, y + S * 0.45, 8, 14) }
  { const [x, y] = fill(T.MED, '#e8ecef'); bevel(x, y, S, 6); c.fillStyle = '#e04a3a'; c.fillRect(x + S / 2 - 12, y + 26, 24, S - 52); c.fillRect(x + 26, y + S / 2 - 12, S - 52, 24) }
  { const [x, y] = fill(T.STRIPE, '#c8ccd0'); bevel(x, y, S, 6); c.fillStyle = '#e0a020'; c.fillRect(x, y + S * 0.4, S, S * 0.2) }
  { const [x, y] = fill(T.FAN, '#1e2023'); c.translate(x + S / 2, y + S / 2); for (let i = 0; i < 9; i++) { c.rotate(Math.PI * 2 / 9); c.fillStyle = '#5c6268'; c.beginPath(); c.moveTo(6, -4); c.lineTo(58, -14); c.lineTo(58, 6); c.lineTo(6, 4); c.fill() } c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#8a9096'; c.beginPath(); c.arc(x + S / 2, y + S / 2, 14, 0, 7); c.fill() }
  { const [x, y] = fill(T.CORE, '#0b1416'); const g = c.createRadialGradient(x + S / 2, y + S / 2, 2, x + S / 2, y + S / 2, S / 2); g.addColorStop(0, '#d8fff8'); g.addColorStop(0.3, '#39e6d6'); g.addColorStop(1, '#06302c'); c.fillStyle = g; c.fillRect(x, y, S, S) }
  { const [x, y] = fill(T.RING, '#70767c'); for (let i = 0; i < S; i += 8) { c.fillStyle = i % 16 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.18)'; c.fillRect(x, y + i, S, 4) } }
  { const [x, y] = fill(T.PLAIN, '#d0d4d8'); grain(x, y, S, 0.04) }
  { const [x, y] = fill(T.BEACON, '#2a2d30'); c.fillStyle = '#ff6a3a'; c.fillRect(x + 20, y + 20, S - 40, S - 40) }
  { const [x, y] = fill(T.GLASS, '#cfe8ff'); c.fillStyle = 'rgba(255,255,255,0.5)'; c.save(); c.translate(x, y); c.rotate(-0.6); c.fillRect(-10, 50, 200, 8); c.fillRect(-10, 70, 200, 3); c.restore() }
  { const [x, y] = fill(T.COIL, '#5a3a20'); for (let i = 0; i < S; i += 5) { c.fillStyle = i % 10 ? '#b87333' : '#8a5426'; c.fillRect(x, y + i, S, 4) } }
  { const [x, y] = fill(T.GEAR, '#e0a020'); c.fillStyle = '#1c1c1c'; c.fillRect(x + 8, y + 8, S - 16, S - 16); c.fillStyle = '#e0a020'; c.fillRect(x + 20, y + 20, S - 40, S - 40); c.fillStyle = '#3a3e42'; c.fillRect(x + 30, y + 30, S - 60, S - 60) }
  { const [x, y] = fill(T.TRUSS, 'rgba(0,0,0,0)'); c.clearRect(x, y, S, S); c.fillStyle = '#9aa0a6'; c.fillRect(x, y, S, 14); c.fillRect(x, y + S - 14, S, 14); c.fillRect(x, y, 14, S); c.fillRect(x + S - 14, y, 14, S); c.save(); c.translate(x + S / 2, y + S / 2); c.rotate(Math.PI / 4); c.fillRect(-S * 0.7, -6, S * 1.4, 12); c.restore() }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  return { tex, canvas: cv }
}
