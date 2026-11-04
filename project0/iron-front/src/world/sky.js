// Sky, sun and moon, fog, time of day and weather. The sky dome sits on the camera; the sun is a shadow-
// casting light that follows the player. Weather sets cloud cover, fog distance, rain and wind, and with
// the hour decides how far soldiers can see (visibility()).
import * as THREE from 'three'

export const WEATHER = {
  clear: { name: 'Clear', cloud: 0.15, fog: 3200, rain: 0, wind: 2, light: 1 },
  overcast: { name: 'Overcast', cloud: 0.8, fog: 2200, rain: 0, wind: 5, light: 0.75 },
  fog: { name: 'Fog', cloud: 0.6, fog: 380, rain: 0, wind: 1, light: 0.7 },
  rain: { name: 'Rain', cloud: 0.9, fog: 1100, rain: 0.7, wind: 7, light: 0.6 },
  storm: { name: 'Storm', cloud: 1, fog: 700, rain: 1, wind: 13, light: 0.45 },
}

const skyVert = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`
const skyFrag = `
uniform vec3 sunDir; uniform vec3 moonDir; uniform vec3 top; uniform vec3 horizon; uniform vec3 ground;
uniform float cloud; uniform float time; uniform float night; uniform vec3 sunCol;
varying vec3 vDir;
float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(horizon, top, pow(max(y, 0.0), 0.55));
  col = mix(col, ground, smoothstep(0.0, -0.12, y));
  float sd = max(dot(d, sunDir), 0.0);
  float day = 1.0 - night;
  // haze brightens the horizon, more towards the sun; a warm band round the sun at dawn and dusk
  col += horizon * pow(1.0 - abs(y), 6.0) * 0.18 * day;
  col += sunCol * pow(sd, 6.0) * 0.18 * day * (1.0 - cloud * 0.6);
  float warm = clamp(1.0 - abs(sunDir.y) * 4.0, 0.0, 1.0) * day;
  col = mix(col, vec3(1.0, 0.55, 0.3), warm * pow(sd, 3.0) * pow(1.0 - max(y, 0.0), 4.0) * 0.55 * (1.0 - cloud * 0.6));
  // the sun: a disc and a glow
  col += sunCol * (smoothstep(0.9994, 0.99975, sd) * 5.0 + pow(sd, 260.0) * 0.8) * (1.0 - cloud * 0.85);
  // the moon, and stars only in full night: small, round, twinkling
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99955, 0.9998, md) * 1.6 + pow(md, 400.0) * 0.12) * night;
  if (y > 0.0) {
    float nightOnly = smoothstep(0.6, 0.95, night);
    vec2 sp = d.xz / (y + 0.4) * 90.0, cell = floor(sp), f = fract(sp) - 0.5;
    float r = h(cell);
    float st = step(0.985, r) * smoothstep(0.16, 0.0, length(f)) * (0.6 + 0.4 * sin(time * 2.0 + r * 80.0));
    col += vec3(0.9, 0.93, 1.0) * st * nightOnly * (1.0 - cloud) * smoothstep(0.0, 0.25, y);
    // clouds: layered noise on a flat deck, drifting with the wind; scattered on a clear day, a lid in a
    // storm; lit on the side towards the sun, grey underneath, tinted at dusk
    vec2 cp = d.xz / (y + 0.1) * 1.4 + vec2(time * 0.004, time * 0.0015);
    float c = n2(cp * 1.6) * 0.5 + n2(cp * 3.7) * 0.25 + n2(cp * 8.3) * 0.15 + n2(cp * 19.0) * 0.1;
    float cover = 0.22 + cloud * 0.78;
    float cov = smoothstep(1.0 - cover * 0.9, 1.0 - cover * 0.9 + 0.22, c) * smoothstep(0.0, 0.18, y);
    float thick = smoothstep(1.0 - cover * 0.9, 1.0, c);
    vec3 lit = mix(vec3(1.0, 0.98, 0.95), sunCol * vec3(1.0, 0.8, 0.65), warm * 0.8);
    vec3 shade = mix(horizon * 0.75, vec3(0.42, 0.45, 0.5), cloud);
    vec3 cc = mix(lit, shade, thick * 0.75 + cloud * 0.3) * (0.06 + 0.94 * day) * (1.0 + pow(sd, 8.0) * 0.4 * (1.0 - thick));
    col = mix(col, cc, cov * mix(0.88, 0.97, cloud));
  }
  gl_FragColor = vec4(col, 1.0);
}`

export class Sky {
  constructor(scene, world, quality) {
    this.scene = scene
    this.hour = 9.5        // 0..24
    this.daySpeed = 1 / 60 // game hours per real second (an hour a minute) when the cycle runs
    this.cycle = true
    this.weatherKey = 'clear'
    this.w = { ...WEATHER.clear }
    this.uniforms = {
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, -1, 0) },
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
      cloud: { value: 0.2 }, time: { value: 0 }, night: { value: 0 }, sunCol: { value: new THREE.Color(1, 0.95, 0.85) },
    }
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 12), new THREE.ShaderMaterial({
      vertexShader: skyVert, fragmentShader: skyFrag, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true,
    }))
    this.dome.frustumCulled = false
    this.dome.renderOrder = -10
    scene.add(this.dome)
    scene.fog = new THREE.Fog(0xbfd3e6, 200, 3000)
    // lights: remove the default hemisphere light, use our own
    for (const c of [...scene.children]) if (c.isHemisphereLight || c.isAmbientLight) scene.remove(c)
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a3a, 1.1)
    scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xfff1dd, 2.2)
    this.sun.target = new THREE.Object3D()
    scene.add(this.sun, this.sun.target)
    this.setQuality(quality)
  }
  setQuality(q) {
    const s = this.sun
    s.castShadow = q === 'high'
    if (s.castShadow) {
      s.shadow.mapSize.set(2048, 2048)
      const c = s.shadow.camera
      c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 400
      s.shadow.bias = -0.0006; s.shadow.normalBias = 0.04
      c.updateProjectionMatrix()
    }
  }
  setWeather(key) { this.weatherKey = key; this.target = { ...WEATHER[key] } }
  // How far a soldier can make out another, in metres (fog, night, rain).
  visibility() {
    const night = this.uniforms.night.value
    return Math.min(this.w.fog * 0.9, 1100) * (1 - night * 0.72)
  }
  update(dt, anchor) {
    if (this.cycle) this.hour = (this.hour + dt * this.daySpeed) % 24
    // ease weather changes in
    if (this.target) for (const k of ['cloud', 'fog', 'rain', 'wind', 'light']) {
      this.w[k] += (this.target[k] - this.w[k]) * Math.min(1, dt * 0.25)
    }
    const a = (this.hour - 6) / 12 * Math.PI       // 0 at 6:00, PI at 18:00
    const sun = new THREE.Vector3(Math.cos(a) * 0.8, Math.sin(a), 0.35).normalize()
    const moon = sun.clone().negate()
    const day = THREE.MathUtils.smoothstep(sun.y, -0.12, 0.18)
    const dusk = Math.exp(-Math.pow(sun.y / 0.18, 2)) * day
    const night = 1 - day
    const U = this.uniforms, wl = this.w.light, cl = this.w.cloud
    U.sunDir.value.copy(sun); U.moonDir.value.copy(moon)
    U.night.value = night; U.cloud.value = cl; U.time.value += dt * (1 + this.w.wind * 0.2)
    const dayTop = new THREE.Color(0.24, 0.48, 0.85).lerp(new THREE.Color(0.55, 0.6, 0.66), cl)
    const dayHor = new THREE.Color(0.72, 0.84, 0.95).lerp(new THREE.Color(0.72, 0.75, 0.78), cl)
    const nightTop = new THREE.Color(0.01, 0.015, 0.04), nightHor = new THREE.Color(0.04, 0.05, 0.09)
    const duskHor = new THREE.Color(0.98, 0.55, 0.3)
    U.top.value.copy(nightTop).lerp(dayTop, day)
    U.horizon.value.copy(nightHor).lerp(dayHor, day).lerp(duskHor, dusk * (1 - cl * 0.7) * 0.75)
    U.ground.value.copy(U.horizon.value).multiplyScalar(0.55)
    U.sunCol.value.setRGB(1, 0.9 - dusk * 0.35, 0.8 - dusk * 0.5)
    // fog matches the horizon
    const f = this.scene.fog
    f.color.setRGB(Math.pow(U.horizon.value.r, 2.2), Math.pow(U.horizon.value.g, 2.2), Math.pow(U.horizon.value.b, 2.2))
    f.far = this.w.fog * (1 - night * 0.45)
    f.near = Math.min(f.far * 0.15, 150)
    // lights
    const sunUp = Math.max(sun.y, 0)
    this.sun.intensity = 2.4 * THREE.MathUtils.smoothstep(sunUp, 0, 0.25) * wl * (1 - cl * 0.45)
    this.sun.color.setRGB(1, 0.93 - dusk * 0.3, 0.85 - dusk * 0.45)
    const lightDir = sun.y > -0.05 ? sun : moon
    this.sun.position.copy(anchor).addScaledVector(lightDir, 150)
    this.sun.target.position.copy(anchor)
    if (sun.y <= -0.05) { this.sun.intensity = 0.3 * (1 - cl * 0.6); this.sun.color.setRGB(0.55, 0.66, 1) }
    this.hemi.intensity = (0.13 + 1.07 * day) * (0.7 + 0.3 * wl)
    this.hemi.color.copy(U.horizon.value).lerp(new THREE.Color(1, 1, 1), 0.4)
    this.hemi.groundColor.setRGB(0.35 * (0.2 + day), 0.3 * (0.2 + day), 0.22 * (0.2 + day))
    this.dome.position.copy(anchor)
    this.day = day; this.night = night
    // lightning in a storm: a double flicker that lights everything for a moment; the thunder follows
    // (this.thunder: seconds until it is heard, read by the sound)
    if (this.weatherKey === 'storm' && dt > 0) {
      this.boltT = (this.boltT ?? 6) - dt
      if (this.boltT <= 0) { this.boltT = 8 + Math.random() * 18; this.flashT = 0.35; this.thunder = 0.6 + Math.random() * 3.5; this.thunderVol = 0.35 + Math.random() * 0.45 }
    }
    if (this.flashT > 0) {
      this.flashT -= dt
      const f = this.flashT > 0.22 || (this.flashT > 0.04 && this.flashT < 0.12) ? 1 : 0
      this.hemi.intensity += f * 2.6; this.sun.intensity += f * 1.2
    }
  }
}
