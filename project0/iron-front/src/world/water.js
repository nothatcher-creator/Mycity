// The sea round Varden, its lakes and rivers. One shader for all: deep blue-green with moving waves,
// a sun glint and a white rim where it is shallow (the sea knows the depth from the heightfield grid).
import * as THREE from 'three'
import { LAKES } from './blueprint.js'
import { riverLines, lakeLevels, base, GRID, CELL } from './heightfield.js'
import { HALF } from './blueprint.js'

const vert = `
uniform float time; uniform vec3 worldOff;
varying vec3 vW; varying vec3 vR; varying float vDepth;
attribute float depth;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 p = position;
  vDepth = depth;
  vW = p + worldOff;       // where on the island (virtual metres): waves and depth
  vR = wp.xyz;             // where in the rendered scene: the view direction
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`
const frag = `
uniform float time; uniform vec3 sunDir; uniform vec3 deepCol; uniform vec3 shallowCol; uniform vec3 skyCol;
uniform float night; uniform vec3 worldOff; uniform sampler2D depthTex; uniform float useDepth; uniform float flow;
varying vec3 vW; varying vec3 vR; varying float vDepth;
#include <fog_pars_fragment>
void main() {
  vec3 w = vW;
  vec2 p = w.xz;
  float t = time;
  vec2 g = vec2(sin(p.x * 0.11 + t * 1.1) + sin(p.x * 0.031 + p.y * 0.05 + t * 0.6) * 1.4,
                cos(p.y * 0.13 - t * 0.9) + sin(p.y * 0.037 - p.x * 0.02 + t * 0.7) * 1.4);
  g += vec2(sin(p.x * 0.7 + p.y * 0.3 + t * 2.3), cos(p.y * 0.8 - p.x * 0.25 + t * 2.0)) * 0.35;
  vec3 n = normalize(vec3(g.x * 0.06, 1.0, g.y * 0.06));
  vec3 v = normalize(cameraPosition - vR);
  float depth = vDepth;
  if (useDepth > 0.5) {
    vec2 uv = (w.xz + ${HALF.toFixed(1)}) / ${(GRID * CELL).toFixed(1)};
    depth = -texture2D(depthTex, uv).r * 60.0;
  }
  float d = clamp(depth / 14.0, 0.0, 1.0);
  vec3 col = mix(shallowCol, deepCol, d);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  col = mix(col, skyCol, fres * 0.6);
  vec3 r = reflect(-sunDir, n);
  float spec = pow(max(dot(r, v), 0.0), 160.0) * (1.0 - night);
  col += vec3(1.0, 0.95, 0.85) * spec * 1.6;
  // a white edge where it laps the shore
  float shore = smoothstep(1.2, 0.0, depth) * (0.6 + 0.4 * sin(t * 1.7 + p.x * 0.05 + p.y * 0.04));
  col = mix(col, vec3(0.92, 0.96, 1.0), shore * 0.55);
  col *= 1.0 - night * 0.75;
  float a = mix(0.72, 0.94, d) + fres * 0.1;
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`

export class Water {
  constructor(world, scene) {
    this.world = world
    // the sea's depth under every point of the grid, as a texture (deeper water darker)
    const S = GRID + 1, data = new Float32Array(S * S)
    for (let i = 0; i < S * S; i++) data[i] = Math.max(0, -base[i]) / 60
    const depthTex = new THREE.DataTexture(data, S, S, THREE.RedFormat, THREE.FloatType)
    depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter
    depthTex.needsUpdate = true
    const common = {
      time: { value: 0 }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, night: { value: 0 },
      deepCol: { value: new THREE.Color(0.03, 0.2, 0.32) }, shallowCol: { value: new THREE.Color(0.1, 0.5, 0.55) },
      skyCol: { value: new THREE.Color(0.7, 0.82, 0.92) }, worldOff: { value: new THREE.Vector3() },
      depthTex: { value: depthTex }, useDepth: { value: 1 }, flow: { value: 0 },
    }
    this.uniforms = common
    const mk = (useDepth, extra = {}) => new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { ...common, useDepth: { value: useDepth }, ...extra }]),
    })
    this.seaMat = mk(1)
    // the uniform objects must be shared, not copied, so one update reaches every water mesh
    for (const m of [this.seaMat]) for (const k of Object.keys(common)) if (k !== 'useDepth' && k !== 'worldOff') m.uniforms[k] = common[k]
    // the sea: a big disc that follows the camera (finer near the middle)
    const sea = new THREE.CircleGeometry(9000, 64, 0, Math.PI * 2)
    sea.rotateX(-Math.PI / 2)
    sea.setAttribute('depth', new THREE.BufferAttribute(new Float32Array(sea.attributes.position.count).fill(20), 1))
    this.sea = new THREE.Mesh(sea, this.seaMat)
    this.sea.renderOrder = 2
    this.sea.frustumCulled = false
    world.add(this.sea)
    // lakes and rivers: flat meshes at their water level (depth from distance to the bank)
    this.inlandMat = mk(0)
    for (const k of Object.keys(common)) if (k !== 'useDepth' && k !== 'worldOff') this.inlandMat.uniforms[k] = common[k]
    const geos = []
    LAKES.forEach((l, i) => {
      const g = new THREE.CircleGeometry(l.r * 1.12, 48)
      g.rotateX(-Math.PI / 2)
      g.translate(l.x, lakeLevels[i], l.z)
      const n = g.attributes.position.count, dep = new Float32Array(n)
      for (let k = 0; k < n; k++) dep[k] = k === 0 ? l.depth : 0
      g.setAttribute('depth', new THREE.BufferAttribute(dep, 1))
      geos.push(g)
    })
    for (const r of riverLines) {
      const pts = r.pts, n = pts.length
      const pos = [], dep = [], idx = []
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
        let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l
        const hw = r.width / 2 + 4
        pos.push(pts[i][0] - dz * hw, pts[i][2], pts[i][1] + dx * hw, pts[i][0], pts[i][2], pts[i][1], pts[i][0] + dz * hw, pts[i][2], pts[i][1] - dx * hw)
        dep.push(0, 3, 0)
        if (i < n - 1) { const o = i * 3; idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5) }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('depth', new THREE.Float32BufferAttribute(dep, 1))
      g.setIndex(idx)
      geos.push(g)
    }
    for (const g of geos) {
      const m = new THREE.Mesh(g, this.inlandMat)
      m.renderOrder = 2
      world.add(m)
    }
  }
  update(dt, cam, sky) {
    const U = this.uniforms
    U.time.value += dt
    U.sunDir.value.copy(sky.uniforms.sunDir.value)
    U.night.value = sky.night
    U.skyCol.value.copy(sky.uniforms.horizon.value)
    // the sea disc is centred under the camera; the shader works in world (virtual) coordinates
    this.sea.position.set(Math.round(cam.x / 50) * 50, 0, Math.round(cam.z / 50) * 50)
    this.seaMat.uniforms.worldOff.value.copy(this.sea.position)
  }
}
