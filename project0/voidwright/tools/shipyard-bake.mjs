// shipyard-bake.mjs: draws and fits out every shipyard design (src/game/shipyard.js) and writes the
// results to src/game/shipyard-data.js, which the game reads instead of building them while you play.
// Run it after changing a design or a block the designs use.
import { writeFileSync } from 'fs'
import { SHIPYARD_BUILD } from '../src/game/shipyard.js'
const out = ['// Built by tools/shipyard-bake.mjs from the designs in shipyard.js: do not edit by hand.', '// Each block: id index, i, j, k, rotation, colour.', 'export const SHIPYARD_DATA = {']
for (const [id, make] of Object.entries(SHIPYARD_BUILD)) {
  const t = performance.now(), bp = make(), ids = [...new Set(bp.blocks.map(b => b[0]))]
  const flat = bp.blocks.map(b => [ids.indexOf(b[0]), b[1], b[2], b[3], b[4], b[5]].join(',')).join(',')
  const lines = []; for (let i = 0; i < flat.length; i += 900) lines.push(flat.slice(i, i + 900))
  out.push(`  ${id}: { name: ${JSON.stringify(bp.name)}, size: '${bp.size}', desc: ${JSON.stringify(bp.desc)},`)
  out.push(`    ids: ${JSON.stringify(ids)},`)
  out.push('    b: [')
  for (const l of lines) out.push(`      '${l}',`)
  out.push('    ] },')
  console.log(id.padEnd(10), String(bp.blocks.length).padStart(6), 'blocks', (performance.now() - t).toFixed(0) + ' ms')
}
out.push('}', '')
writeFileSync(new URL('../src/game/shipyard-data.js', import.meta.url), out.join('\n'))
