// Shader pieces shared by everything drawn inside an atmosphere: the haze between the camera and a point,
// worked out from the length of the line of sight that lies inside the planet's air (so a mountain 30 km
// away fades blue, a ship seen from orbit through the air is hazed, and a moon seen from the ground is not).
export const ATMO_UNIFORMS = `
uniform vec3 uPC; uniform float uPR; uniform float uAR; uniform float uDen; uniform vec3 uSunD; uniform vec3 uDay; uniform vec3 uDusk; uniform float uHaze;
vec2 vwSphere(vec3 ro, vec3 rd, float r) { float b = dot(ro, rd); float c = dot(ro, ro) - r * r; float h = b * b - c; if (h < 0.0) return vec2(1e9, -1e9); h = sqrt(h); return vec2(-b - h, -b + h); }
vec4 vwHaze(vec3 pos) {
  if (uHaze <= 0.0) return vec4(0.0);
  vec3 ro = cameraPosition - uPC; vec3 d = pos - cameraPosition; float L = length(d); vec3 rd = d / max(L, 1e-3);
  vec2 t = vwSphere(ro, rd, uAR); float t0 = max(t.x, 0.0), t1 = min(t.y, L);
  if (t1 <= t0) return vec4(0.0);
  vec3 mid = ro + rd * (t0 + t1) * 0.5; float alt = max(0.0, length(mid) - uPR);
  float dens = exp(-alt / ((uAR - uPR) * 0.22));
  float k = 1.0 - exp(-(t1 - t0) * dens * uDen);
  float sh = dot(normalize(mid), uSunD);
  vec3 col = mix(uDusk, uDay, smoothstep(-0.05, 0.35, sh)) * smoothstep(-0.28, 0.06, sh);
  return vec4(col, k * uHaze);
}
`
// Adds the haze, a stable detail texture (from planet-local coordinates, so it does not slide as the camera
// moves) and an emissive channel to a three.js material.
export function patchMaterial(mat, uniforms, o = {}) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vwWorld;${o.detail ? '\nattribute vec3 aLocal; varying vec3 vLocal; varying vec3 vNrmL;' : ''}${o.emit ? '\nattribute float aEmit; varying float vEmit;' : ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;${o.detail ? '\nvLocal = aLocal; vNrmL = normal;' : ''}${o.emit ? '\nvEmit = aEmit;' : ''}`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vwWorld;${ATMO_UNIFORMS}${o.detail ? '\nuniform sampler2D uDetail; varying vec3 vLocal; varying vec3 vNrmL;' : ''}${o.emit ? '\nvarying float vEmit;' : ''}`)
      .replace('#include <fog_fragment>', `{ vec4 hz = vwHaze(vwWorld); gl_FragColor.rgb = mix(gl_FragColor.rgb, hz.rgb, hz.a); }`)
    if (o.detail) sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      { vec3 w = abs(normalize(vNrmL)); w = pow(w, vec3(4.0)); w /= (w.x + w.y + w.z);
        float dd = length(vwWorld - cameraPosition);
        vec3 p1 = vLocal / 8.0, p2 = vLocal / 64.0;
        float a = texture2D(uDetail, p1.yz).r * w.x + texture2D(uDetail, p1.xz).r * w.y + texture2D(uDetail, p1.xy).r * w.z;
        float b = texture2D(uDetail, p2.yz).g * w.x + texture2D(uDetail, p2.xz).g * w.y + texture2D(uDetail, p2.xy).g * w.z;
        float fa = 1.0 - smoothstep(60.0, 260.0, dd), fb = 1.0 - smoothstep(600.0, 2600.0, dd);
        diffuseColor.rgb *= mix(1.0, 0.72 + a * 0.56, fa) * mix(1.0, 0.8 + b * 0.4, fb); }`)
    if (o.emit) sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vEmit * 2.2;`)
  }
  mat.customProgramCacheKey = () => 'vw' + (o.detail ? 'd' : '') + (o.emit ? 'e' : '')
  mat.fog = false
  return mat
}
