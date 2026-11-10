// Tunnels: dig sideways into a slope and check the field is open inside, solid above, and chunks mesh.
import * as THREE from 'three'
const { Planet } = await import('../src/world/planet.js')
const eng = { track: () => ({}), rel: (v, o) => o.copy(v), detailTex: null }
const P = new Planet({ id: 'h', name: 'H', R: 30000, g: 9.81, seed: 11, kind: 'terra', center: [0, 0, 0], ores: ['iron'] }, eng)
const d = new THREE.Vector3(0.3, 0.8, 0.5).normalize(), gp = d.clone().multiplyScalar(P.R + P.height(d.x, d.y, d.z))
// a tunnel going straight down 12 m, then sideways 10 m
const side = new THREE.Vector3(1, 0, 0).cross(d).normalize()
for (let i = 0; i < 12; i++) P.dig(gp.clone().addScaledVector(d, -i), 1.5)
for (let i = 0; i < 10; i++) P.dig(gp.clone().addScaledVector(d, -11).addScaledVector(side, i), 1.5)
const inTunnel = gp.clone().addScaledVector(d, -11).addScaledVector(side, 8), above = inTunnel.clone().addScaledVector(d, 5)
console.log('in the side tunnel sdf', P.sdf(inTunnel).toFixed(2), '(open > 0)   rock 5 m above it', P.sdf(above).toFixed(2), '(solid < 0)   ground over the tunnel end', P.sdf(inTunnel.clone().addScaledVector(d, 11.5)).toFixed(2))
const s = P.surface(inTunnel.clone().addScaledVector(d, -1.2)); console.log('floor normal . up', (s.nx * d.x + s.ny * d.y + s.nz * d.z).toFixed(2), 'alt', s.alt.toFixed(2))
let t = performance.now(); P.vox.lc = gp; let n = 0; while (P.vox.pending) n += P.vox.work(1000)
let tris = 0; for (const c of P.vox.chunks.values()) if (c.mesh) tris += c.mesh.geometry.index.count / 3
console.log('chunks', P.vox.chunks.size, 'built', n, 'in', (performance.now() - t).toFixed(0), 'ms;', tris, 'tris; cut at dig?', P.vox.cut(gp.x, gp.y, gp.z))
t = performance.now(); P.dig(inTunnel, 1.5); while (P.vox.pending) P.vox.work(1000); console.log('re-mesh after one more bite', (performance.now() - t).toFixed(1), 'ms')
