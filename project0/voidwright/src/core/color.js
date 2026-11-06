// The palettes in this game are written as display (sRGB) values, the way a colour picker shows them. The
// renderer lights in linear space, so a raw 0.42 green lit by the sun came out past white and washed
// out. Every vertex and instance colour goes through lin() once, where its geometry is built.
export const lin = v => Math.pow(Math.max(0, v), 2.2)
export function linArray(a, n = a.length) { for (let i = 0; i < n; i++) a[i] = Math.pow(Math.max(0, a[i]), 2.2); return a }
