import * as THREE from 'three'

const { Planet } = await import('/home/user/Mycity/project0/voidwright/src/world/planet.js')
const eng = { track: () => ({}), rel: (v, o) => o.copy(v), detailTex: null }
for (const kind of ['terra', 'moon', 'mars', 'ice']) {
  const P = new Planet({ id: kind, name: kind, R: 30000, g: 9.81, seed: 7, kind, center: [0, 0, 0], atmo: null }, eng)
  // a leaf at max level and a mid-level node
  for (const lvl of [P.maxLevel, 6, 2]) {
    const s = 2 / 2 ** lvl, nd = P.node(4, lvl, 0.1, 0.2, s); P.nodeCenter(nd)
    const t = performance.now(); for (let i = 0; i < 5; i++) { nd.mesh = null; P.build(nd) } 
    console.log(kind, 'level', lvl, ((performance.now() - t) / 5).toFixed(2), 'ms/chunk')
  }
  let t = performance.now(), hs = 0
  for (let i = 0; i < 2000; i++) hs += P.height(Math.sin(i), 1, Math.cos(i * 0.3))
  console.log(kind, 'height full', ((performance.now() - t) / 2000 * 1000).toFixed(1), 'us', 'range sample', hs / 2000)
  let mn = 1e9, mx = -1e9
  for (let i = 0; i < 4000; i++) { const h = P.height(Math.sin(i * 1.3), Math.cos(i * 0.7), Math.sin(i * 2.1 + 1), 40); mn = Math.min(mn, h); mx = Math.max(mx, h) }
  console.log(kind, 'min', mn.toFixed(0), 'max', mx.toFixed(0))
}
const { Asteroid } = await import('../src/world/asteroid.js')
const a = new Asteroid({}, { id: 'x', pos: new THREE.Vector3(), r: 120, seed: 5, stretch: [1, 0.8, 1.1], rot: [0, 0, 0], ores: ['iron', 'nickel'], tint: [1, 1, 1] }, {}, null)
let t = performance.now(); a.buildCoarse(); console.log('coarse', (performance.now() - t).toFixed(1), 'ms', a.coarse?.geometry.index.count / 3, 'tris')
const out = []; a.wanted(new THREE.Vector3(0, 0, 150), 400, out); console.log('wanted chunks', out.length, 'cs', a.cs)
t = performance.now(); let tris = 0; for (const q of out.slice(0, 20)) { a.buildChunk(q.key, q.i, q.j, q.k); const c = a.chunks.get(q.key); if (c.mesh) tris += c.mesh.geometry.index.count / 3 }
console.log('20 chunks', ((performance.now() - t) / 20).toFixed(1), 'ms each', tris, 'tris')
