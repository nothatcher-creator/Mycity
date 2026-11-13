// A layer of cloud over a world with air: one thin shell above the highest ground, its cover read from a
// tiling noise picture on three axes (so there is no seam or pinch at the poles), lit by the star and tinted
// at dusk. It thins out near the camera, so a ship flies up through mist and not through a painted sheet.
import * as THREE from 'three'
import { SLICES } from '../core/engine.js'

let NOISE = null
// 256 x 256 of tiling value noise, four octaves, stretched to the full range
function noiseTex() {
  if (NOISE) return NOISE
  const N = 256, d = new Uint8Array(N * N * 4), f = new Float32Array(N * N)
  const h = (x, y, p, s) => { let n = ((x % p + p) % p) * 374761393 + ((y % p + p) % p) * 668265263 + s * 2147483647; n = (n ^ (n >>> 13)) * 1274126177; n ^= n >>> 16; return (n >>> 0) / 4294967295 }
  const val = (x, y, p, s) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v); return (h(xi, yi, p, s) * (1 - a) + h(xi + 1, yi, p, s) * a) * (1 - b) + (h(xi, yi + 1, p, s) * (1 - a) + h(xi + 1, yi + 1, p, s) * a) * b }
  let lo = 9, hi = -9
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0, amp = 0.5
    for (let o = 0, p = 4; o < 5; o++, p *= 2) { v += val(x / N * p, y / N * p, p, o + 1) * amp; amp *= 0.5 }
    f[y * N + x] = v; lo = Math.min(lo, v); hi = Math.max(hi, v)
  }
  for (let i = 0; i < N * N; i++) { const v = Math.round((f[i] - lo) / (hi - lo) * 255); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255 }
  NOISE = new THREE.DataTexture(d, N, N, THREE.RGBAFormat)
  NOISE.wrapS = NOISE.wrapT = THREE.RepeatWrapping
  NOISE.minFilter = THREE.LinearMipmapLinearFilter; NOISE.magFilter = THREE.LinearFilter; NOISE.generateMipmaps = true
  NOISE.needsUpdate = true
  return NOISE
}
// how much of the sky, by kind of world, when its description does not say
const COVER = { terra: 0.5, mars: 0.2, desert: 0.16, lava: 0.34, ice: 0.3, moon: 0 }

export function makeClouds(planet, def) {
  const cover = def.clouds ?? COVER[def.kind] ?? 0
  if (!planet.atmo || cover <= 0) return null
  const CR = planet.R + Math.min(planet.atmo.height * 0.42, (def.relief || 1000) * 1.5 + 900)
  const dark = def.kind === 'lava'
  const u = {
    tNoise: { value: noiseTex() }, uSunD: { value: new THREE.Vector3(0, 1, 0) }, uCover: { value: cover }, uTime: { value: 0 },
    uDusk: { value: new THREE.Color(...planet.atmo.dusk) }, uTint: { value: dark ? new THREE.Color(0.32, 0.25, 0.23) : new THREE.Color(1, 1, 1).lerp(new THREE.Color(...planet.atmo.day), 0.12) },
    uLo: { value: 0 }, uHi: { value: 1e12 }, uSeed: { value: new THREE.Vector2((def.seed || 1) * 0.137 % 1, (def.seed || 1) * 0.291 % 1) },
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.DoubleSide, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; varying vec3 vL; varying float vZ;
      void main() { vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vZ = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vW; varying vec3 vL; varying float vZ;
      uniform sampler2D tNoise; uniform vec3 uSunD; uniform vec3 uDusk; uniform vec3 uTint; uniform float uCover; uniform float uTime; uniform float uLo; uniform float uHi; uniform vec2 uSeed;
      float tri(vec3 d, vec3 w, float s, vec2 o) { return texture2D(tNoise, d.yz * s + o).r * w.x + texture2D(tNoise, d.zx * s + o).r * w.y + texture2D(tNoise, d.xy * s + o).r * w.z; }
      void main() {
        if (vZ < uLo || vZ >= uHi) discard; // each depth slice draws only its own part of the shell
        vec3 d = normalize(vL);
        vec3 w = pow(abs(d), vec3(4.0)); w /= w.x + w.y + w.z;
        float big = tri(d, w, 1.9, uSeed + vec2(uTime, 0.0));
        float mid = tri(d, w, 7.0, uSeed.yx + vec2(-uTime * 1.6, uTime));
        float fine = tri(d, w, 27.0, uSeed + vec2(uTime * 2.3, -uTime * 1.1));
        float n = big * 0.55 + mid * 0.3 + fine * 0.15;
        float th = 0.66 - uCover * 0.34;
        float a = smoothstep(th, th + 0.16, n);
        if (a < 0.004) discard;
        float sh = dot(d, uSunD);
        float lit = smoothstep(-0.16, 0.22, sh);
        // thick cloud is a little darker underneath; thin edges are bright
        float body = smoothstep(th + 0.05, th + 0.4, n);
        vec3 col = mix(uDusk, uTint, smoothstep(-0.02, 0.36, sh)) * (0.1 + 1.02 * lit) * (1.0 - 0.3 * body);
        vec3 rd = normalize(vW - cameraPosition);
        a *= smoothstep(150.0, 2200.0, length(vW - cameraPosition));
        a *= smoothstep(0.015, 0.16, abs(dot(rd, d)));
        gl_FragColor = vec4(col, a * 0.94);
      }`,
  })
  const m = new THREE.Mesh(new THREE.SphereGeometry(CR, 96, 48), mat)
  m.frustumCulled = false
  m.renderOrder = 1
  m.onBeforeRender = (r, s, cam) => {
    // the far edge of this slice is where the next one begins, so nothing is drawn twice where they overlap
    let hi = 1e12
    for (let i = 1; i < SLICES.length; i++) if (Math.abs(cam.near - SLICES[i].near) < SLICES[i].near * 0.01) hi = SLICES[i - 1].near
    u.uLo.value = cam.near; u.uHi.value = hi
    mat.uniformsNeedUpdate = true
  }
  return { mesh: m, u, radius: CR }
}
