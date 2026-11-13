// Two things made of light. uv.y above 0.75: the air round Halvor in the sky, clear face-on and blue at the
// rim. Otherwise the blueprint on the pad: a piece of the fighter drawn in teal lines of light, shown from
// the moment the engineer comes out (53.00 s into the 60 s loop) until the real piece is welded in its
// place (uv.x holds that moment as a fraction of the loop).
void p0Surface(inout P0Surface s) {
  if (s.uv.y > 0.75) {
    float rim = pow(1.0 - max(dot(s.normal, s.view), 0.0), 2.2);
    float day = 0.4 + 0.6 * smoothstep(-0.3, 0.5, dot(s.normal, normalize(vec3(0.5, 0.55, 0.65))));
    s.color = vec3(0.25, 0.5, 1.0);
    s.emissive = vec3(0.3, 0.62, 1.0) * rim * day * 1.7;
    s.alpha = clamp(rim * 1.3, 0.0, 0.85) * day;
    return;
  }
  float L = mod(p0Time, 60.00);
  float until = s.uv.x * 60.00;
  float show = max(step(L, until), smoothstep(53.00, 54.50, L));
  if (show < 0.02) discard;
  float rim = pow(1.0 - max(dot(s.normal, s.view), 0.0), 1.6);
  float lines = 0.55 + 0.45 * step(0.5, fract(s.position.y * 5.0 - p0Time * 0.6));
  float next = (1.0 - smoothstep(0.0, 3.60, until - L)) * step(L, until);   // the piece being worked on glows brighter
  s.color = vec3(0.05, 0.3, 0.3);
  s.emissive = vec3(0.15, 0.95, 0.88) * (0.35 + rim * 1.3) * lines * (1.0 + next * 1.6) * show;
  s.alpha = clamp((0.16 + rim * 0.5) * lines * (1.0 + next) * show, 0.0, 0.8);
}
