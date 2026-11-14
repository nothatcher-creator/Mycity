// startest.mjs: every generated planet group has its own star. Over a whole day of each star's circle:
// is everything in a group counted as that group's (so lit by its star), and does any star
// ever come close enough to burn a world, a field, a gas giant or a comet of any group?
import * as THREE from 'three'
import { sectorDef, clusterStarPos, groupFor, SECTOR } from '../src/world/universe.js'
import { starsNear } from '../src/world/cosmos.js'

const N = +(process.env.N || 8), defs = []
for (let i = -N; i <= N; i++) for (let k = -N; k <= N; k++) { const d = sectorDef(i, k); if (!d.empty) defs.push(d) }
const withStar = defs.filter(d => d.star)
console.log(`groups ${defs.length} (home included), with their own star ${withStar.length}`)
let wrongSun = 0, checks = 0, closest = Infinity, closestWhat = ''
const p = new THREE.Vector3(), q = new THREE.Vector3()
const things = d => [...d.bodies.map(b => ({ c: b.center, r: b.R, n: b.name })), ...d.fields.map(f => ({ c: f.center, r: f.comet ? f.anchor : f.radius, n: f.name })), ...(d.giants || []).map(g => ({ c: g.center, r: g.R * 1.4, n: g.name }))]
for (let s = 0; s < 24; s++) {
  for (const d of withStar) {
    const t = s / 24 * 3600 * d.star.day
    // the star that lights each of its worlds, fields and giants is its own
    // (worlds and giants carry their group; this checks where you are: anywhere within 3 radii of a world
    // or inside a field, the light you see is that group's)
    for (const x of things(d)) { checks++; if (groupFor(p.set(...x.c))?.key !== d.key) { wrongSun++; if (s === 0) console.log(`  near ${x.n} (${d.name}) you would see the light of another group`) } }
    // how close does this star come (in its own radii) to anything of any group around it?
    const sp = clusterStarPos(d.star, t, q)
    for (const e of defs.filter(e => Math.abs(e.i - d.i) <= 3 && Math.abs(e.k - d.k) <= 3)) for (const x of things(e)) {
      const rr = (p.set(...x.c).distanceTo(sp) - x.r) / d.star.R
      if (rr < closest) { closest = rr; closestWhat = `${x.n} (${e.name}) to ${d.star.name}` }
    }
  }
}
console.log(`counted as their own group by position alone: ${checks - wrongSun} of ${checks} checks (worlds and giants also carry their group, which decides first)`)
console.log(`closest any star comes to anything: ${closest.toFixed(1)} of its radii (${closestWhat}); heat is felt inside 5, harmful inside about 3.5`)
const R = withStar.map(d => d.star.R / 1000), D = withStar.map(d => d.star.dist / 1000)
console.log(`star radii ${Math.min(...R).toFixed(0)}-${Math.max(...R).toFixed(0)} km, ${Math.min(...D).toFixed(0)}-${Math.max(...D).toFixed(0)} km out (groups are ${SECTOR / 1000} km apart)`)
process.exit(closest < 5 ? 1 : 0)
