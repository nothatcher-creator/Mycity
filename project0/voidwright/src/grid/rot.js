// The 24 ways a block can face: every rotation by quarter turns. Each is a 3x3 matrix of -1, 0, 1
// (row-major, v' = M v), with lookups for turning faces and for composing turns.
import * as THREE from 'three'
import { SIDES } from './geo.js'

export const ROTS = []
{
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]
  for (const p of perms) for (let s = 0; s < 8; s++) {
    const M = new Array(9).fill(0)
    for (let r = 0; r < 3; r++) M[r * 3 + p[r]] = (s >> r) & 1 ? -1 : 1
    const det = M[0] * (M[4] * M[8] - M[5] * M[7]) - M[1] * (M[3] * M[8] - M[5] * M[6]) + M[2] * (M[3] * M[7] - M[4] * M[6])
    if (det === 1) ROTS.push(M)
  }
  // identity first
  ROTS.sort((a, b) => (b[0] + b[4] + b[8]) - (a[0] + a[4] + a[8]))
}
const key = M => M.join(',')
const INDEX = new Map(ROTS.map((M, i) => [key(M), i]))
export const rotIndex = M => INDEX.get(key(M))
const mul = (A, B) => { const C = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return C }
const transpose = A => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]]
export const INV = ROTS.map(M => rotIndex(transpose(M)))
export function apply(r, x, y, z, out) { const M = ROTS[r]; out[0] = M[0] * x + M[1] * y + M[2] * z; out[1] = M[3] * x + M[4] * y + M[5] * z; out[2] = M[6] * x + M[7] * y + M[8] * z; return out }
// a quarter turn about grid axis a (0 x, 1 y, 2 z), `dir` +1 or -1, applied after rotation r
export function turn(r, a, dir) {
  const c = 0, s = dir
  const Q = a === 0 ? [1, 0, 0, 0, c, -s, 0, s, c] : a === 1 ? [c, 0, s, 0, 1, 0, -s, 0, c] : [c, -s, 0, s, c, 0, 0, 0, 1]
  return rotIndex(mul(Q, ROTS[r]))
}
// the rotation whose block-local -Z points along `fwd` and +Y along `up` (grid axes as [x, y, z] of -1/0/1)
export function rotFrom(fwd, up) {
  const z = fwd.map(v => -v), y = up, x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]]
  return rotIndex([x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]) ?? 0
}
// which side a block-local side ends up on
const sideOf = (v) => SIDES.findIndex(s => s[0] === v[0] && s[1] === v[1] && s[2] === v[2])
export const SIDE_ROT = ROTS.map((M, r) => SIDES.map(s => sideOf(apply(r, s[0], s[1], s[2], [0, 0, 0]))))
export const OPP = [1, 0, 3, 2, 5, 4]
export const QUATS = ROTS.map(M => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(M[0], M[1], M[2], 0, M[3], M[4], M[5], 0, M[6], M[7], M[8], 0, 0, 0, 0, 1)))
