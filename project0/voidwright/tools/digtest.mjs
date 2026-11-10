import * as THREE from 'three'
const { Planet } = await import('../src/world/planet.js')
const eng = { track: () => ({}), rel: (v, o) => o.copy(v), detailTex: null }
const P = new Planet({ id: 'x', name: 'x', R: 30000, g: 9.81, seed: 11, kind: 'terra', center: [0, 0, 0], ores: ['iron', 'ice'] }, eng)
const d = new THREE.Vector3(0.3, 0.8, 0.5).normalize()
const h0 = P.height(d.x, d.y, d.z), g = d.clone().multiplyScalar(P.R + h0)
P.dig(g, 1.5)
const h1 = P.height(d.x, d.y, d.z)
console.log('height before', h0.toFixed(2), 'after', h1.toFixed(2), 'drop', (h0 - h1).toFixed(2), 'sdf at old ground', P.sdf(g).toFixed(2))
P.dig(g.clone().addScaledVector(d, -1.2), 1.5)
console.log('second dig drop', (h0 - P.height(d.x, d.y, d.z)).toFixed(2))
let ores = {}; for (let i = 0; i < 4000; i++) { const o = P.oreAt(Math.sin(i) * 30000, Math.cos(i * 1.3) * 30000, i * 7.1 % 30000); ores[o] = (ores[o] || 0) + 1 } console.log(ores)
