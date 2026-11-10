// The four banners: the letters light up from the texture, a gleam sweeps across them.
void p0Surface(inout P0Surface s) {
  vec3 t = s.color;
  float lum = max(t.r, max(t.g, t.b));
  float letters = smoothstep(0.2, 0.55, lum);
  float scan = pow(0.5 + 0.5 * sin(s.uv.x * 9.42 - p0Time * 1.4), 14.0);
  s.color = t * 0.45;
  s.emissive = t * letters * (1.1 + scan * 1.6 + p0Near * 0.4) + vec3(0.0, 0.03, 0.03) * scan;
}
