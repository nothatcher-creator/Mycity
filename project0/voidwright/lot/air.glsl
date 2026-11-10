// Halvor's air: a shell round the globe, clear face-on and blue at the rim, brighter on the day side.
void p0Surface(inout P0Surface s) {
  float rim = pow(1.0 - max(dot(s.normal, s.view), 0.0), 2.2);
  float day = 0.4 + 0.6 * smoothstep(-0.3, 0.5, dot(s.normal, normalize(vec3(0.5, 0.55, 0.65))));
  s.color = vec3(0.25, 0.5, 1.0);
  s.emissive = vec3(0.3, 0.62, 1.0) * rim * day * 1.7;
  s.alpha = clamp(rim * 1.3, 0.0, 0.85) * day;
}
