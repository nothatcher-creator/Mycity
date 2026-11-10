import * as THREE from 'three'
import { Grid } from '../src/grid/grid.js'
import { weld, grind } from '../src/game/build.js'
import { Inventory } from '../src/game/items.js'
const world = { addGrid() {} }
const g = new Grid(world, 'large', {})
const b = g.add('gyro', 0, 0, 0, 0, 0, { build: 0 })
console.log('recipe', JSON.stringify(b.recipe), 'build', b.build.toFixed(3), 'hp', b.hp.toFixed(0), '/', b.maxHp)
const inv = new Inventory(1e6); inv.add('plate', 1000); inv.add('construct', 100); inv.add('tube_l', 10); inv.add('grid', 60); inv.add('motor', 3)
let r; for (let i = 0; i < 400; i++) { r = weld(b, 50, inv); if (r.missing) break }
console.log('after welding: build', b.build.toFixed(3), 'missing', r.missing, 'comps', b.comps.join(), 'hp', b.hp.toFixed(0))
inv.add('motor', 5); inv.add('computer', 10)
for (let i = 0; i < 400; i++) { r = weld(b, 50, inv); if (r.missing || b.hp >= b.maxHp) break }
console.log('finished: build', b.build, 'hp', b.hp.toFixed(0), 'plates left', inv.count('plate'))
const back = new Map(); for (let i = 0; i < 1000 && b.hp > 0; i++) for (const [k, n] of grind(b, 30)) back.set(k, (back.get(k) || 0) + n)
console.log('ground down: back', JSON.stringify([...back]), 'build', b.build)
