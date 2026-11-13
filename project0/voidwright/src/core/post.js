// The finishing pass. The scene is drawn into a floating-point picture instead of straight to the screen, so
// that lights brighter than white keep their brightness; a chain of ever smaller blurred copies of the bright
// parts is added back as bloom; then a soft shoulder, a little contrast and colour, a vignette and a trace of
// dither. The interface is drawn afterwards, untouched. Without float render targets it turns itself off.
import * as THREE from 'three'

const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
// the bright parts, at half size: a soft knee round the threshold, and a cap so one hot pixel cannot flood
const FS_BRIGHT = `
uniform sampler2D tMap; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tMap, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tMap, vUv + uTexel * vec2(0.5, -0.5)).rgb + texture2D(tMap, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tMap, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  c = min(c * 0.25, vec3(12.0));
  // by brightness, not by the strongest channel: a deep blue sky is not a light
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.8 + max(c.r, max(c.g, c.b)) * 0.2, knee = 0.15;
  float k = clamp(l - uThreshold + knee, 0.0, 2.0 * knee); k = k * k / (4.0 * knee + 1e-4);
  gl_FragColor = vec4(c * max(k, l - uThreshold) / max(l, 1e-4), 1.0);
}`
// half the size again: four taps between texels, each the mean of four
const FS_DOWN = `
uniform sampler2D tMap; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`
// back up, a tent of nine taps, added onto the level above
const FS_UP = `
uniform sampler2D tMap; uniform vec2 uTexel; uniform float uGain; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tMap, vUv).rgb * 4.0;
  c += (texture2D(tMap, vUv + uTexel * vec2(1.0, 0.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(-1.0, 0.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(0.0, 1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(0.0, -1.0)).rgb) * 2.0;
  c += texture2D(tMap, vUv + uTexel * vec2(1.0, 1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(1.0, -1.0)).rgb + texture2D(tMap, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  gl_FragColor = vec4(c / 16.0 * uGain, 1.0);
}`
const FS_FINAL = `
uniform sampler2D tScene; uniform sampler2D tBloom; uniform vec2 uTexel; uniform float uBloom; uniform float uGrade; uniform float uVignette; uniform float uSeed; varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
vec3 T(vec2 uv) { return min(texture2D(tScene, uv).rgb, vec3(6.0)); }
float luma(vec3 c) { return dot(sqrt(min(c, vec3(1.0))), vec3(0.299, 0.587, 0.114)); }
// edges are smoothed here (the floating-point picture has no multisampling): the short, common form of FXAA
vec3 smoothEdges(vec2 uv) {
  vec3 m = T(uv);
  float nw = luma(T(uv + uTexel * vec2(-1.0, -1.0))), ne = luma(T(uv + uTexel * vec2(1.0, -1.0))), sw = luma(T(uv + uTexel * vec2(-1.0, 1.0))), se = luma(T(uv + uTexel * vec2(1.0, 1.0))), lm = luma(m);
  float lo = min(lm, min(min(nw, ne), min(sw, se))), hi = max(lm, max(max(nw, ne), max(sw, se)));
  if (hi - lo < max(0.03, hi * 0.1)) return m;
  vec2 dir = vec2(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
  float reduce = max((nw + ne + sw + se) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 a = 0.5 * (T(uv + dir * (1.0 / 3.0 - 0.5)) + T(uv + dir * (2.0 / 3.0 - 0.5)));
  vec3 b = a * 0.5 + 0.25 * (T(uv - dir * 0.5) + T(uv + dir * 0.5));
  float lb = luma(b);
  return (lb < lo || lb > hi) ? a : b;
}
void main() {
  vec3 c = smoothEdges(vUv) + texture2D(tBloom, vUv).rgb * uBloom;
  // a shoulder for what is brighter than the screen: below 0.85 the picture is exactly as drawn
  vec3 over = max(c - 0.85, 0.0);
  c = min(c, 0.85) + 0.15 * (1.0 - exp(-over / 0.15));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 g = gl_FragColor.rgb;
  float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
  // contrast, cool shadows and warm lights, a little more colour where there is little
  vec3 s = g * g * (3.0 - 2.0 * g);
  g = mix(g, s, 0.22 * uGrade);
  g += (vec3(-0.012, 0.004, 0.022) * (1.0 - l) * (1.0 - l) + vec3(0.02, 0.008, -0.016) * l * l) * uGrade;
  float mx = max(g.r, max(g.g, g.b)), mn = min(g.r, min(g.g, g.b));
  float sat = (mx - mn) / (mx + 1e-3);
  g = mix(vec3(dot(g, vec3(0.2126, 0.7152, 0.0722))), g, 1.0 + 0.14 * uGrade * (1.3 - sat));
  vec2 q = vUv * 2.0 - 1.0;
  g *= 1.0 - uVignette * smoothstep(0.5, 1.5, length(q));
  g += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(g, 0.0, 1.0), 1.0);
}`

const LEVELS = 5

export class Post {
  constructor(renderer) {
    this.r = renderer
    const ext = renderer.extensions
    this.ok = !!(renderer.capabilities?.isWebGL2 !== false && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')))
    this.on = true
    this.bloom = 1; this.grade = 1; this.vignette = 0.26; this.threshold = 1.25
    this.size = new THREE.Vector2()
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null)
    this.quad.frustumCulled = false
    const mk = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra })
    this.mBright = mk(FS_BRIGHT, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } })
    this.mDown = mk(FS_DOWN, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } })
    this.mUp = mk(FS_UP, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uGain: { value: 1 } }, { blending: THREE.AdditiveBlending, transparent: true })
    this.mFinal = mk(FS_FINAL, { tScene: { value: null }, tBloom: { value: null }, uTexel: { value: new THREE.Vector2() }, uBloom: { value: 1 }, uGrade: { value: 1 }, uVignette: { value: 0.3 }, uSeed: { value: 0 } }, { toneMapped: true })
    this.rt = null; this.levels = []
  }
  // makes or resizes the pictures; false when the pass cannot run
  ready() {
    if (!this.ok || !this.on) return false
    const r = this.r, s = r.getDrawingBufferSize(this.size)
    const w = Math.max(8, Math.floor(s.x)), h = Math.max(8, Math.floor(s.y))
    if (this.rt && this.rt.width === w && this.rt.height === h) return true
    try {
      this.dispose()
      // no multisampling here: the scene is drawn in three depth slices, and a multisampled target would be
      // resolved after each of them; the last pass smooths the edges instead
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false })
      let lw = w, lh = h
      for (let i = 0; i < LEVELS; i++) {
        lw = Math.max(2, Math.floor(lw / 2)); lh = Math.max(2, Math.floor(lh / 2))
        this.levels.push(new THREE.WebGLRenderTarget(lw, lh, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false }))
      }
    } catch (e) { this.ok = false; this.dispose(); return false }
    return true
  }
  dispose() { this.rt?.dispose(); for (const l of this.levels) l.dispose(); this.rt = null; this.levels = [] }
  pass(mat, target) {
    const r = this.r
    this.quad.material = mat
    r.setRenderTarget(target)
    r.render(this.quad, this.cam)
  }
  // the scene has been drawn into this.rt: bloom it and put it on the screen
  finish() {
    const r = this.r, L = this.levels
    const auto = r.autoClear
    r.autoClear = false
    let u = this.mBright.uniforms
    u.tMap.value = this.rt.texture; u.uTexel.value.set(1 / this.rt.width, 1 / this.rt.height); u.uThreshold.value = this.threshold
    this.pass(this.mBright, L[0])
    for (let i = 1; i < LEVELS; i++) {
      u = this.mDown.uniforms
      u.tMap.value = L[i - 1].texture; u.uTexel.value.set(1 / L[i - 1].width, 1 / L[i - 1].height)
      this.pass(this.mDown, L[i])
    }
    for (let i = LEVELS - 1; i > 0; i--) {
      u = this.mUp.uniforms
      u.tMap.value = L[i].texture; u.uTexel.value.set(1 / L[i].width, 1 / L[i].height); u.uGain.value = 1
      this.pass(this.mUp, L[i - 1])
    }
    u = this.mFinal.uniforms
    u.tScene.value = this.rt.texture; u.tBloom.value = L[0].texture; u.uTexel.value.set(1 / this.rt.width, 1 / this.rt.height)
    u.uBloom.value = this.bloom * 0.11; u.uGrade.value = this.grade; u.uVignette.value = this.vignette; u.uSeed.value = (u.uSeed.value + 0.618) % 7
    this.pass(this.mFinal, null)
    r.autoClear = auto
  }
}
