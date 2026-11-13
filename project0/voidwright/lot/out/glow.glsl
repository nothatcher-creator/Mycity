// The yard's lights. Each piece's uv says what it is: uv.x = type + phase, uv.y = its kind.
// 0 fire (kind 0: the fighter's engines, lit from ignition until it has gone; 1: its lift jets, until it runs;
// 2: the engineer's jetpack, always), 1 running lights up the frame (kind 1: amber), 2 a blinking beacon,
// 3 the flash where the fighter jumps, 4 the welding torch (kind 0 sparks, 1 the beam, 2 the white point), lit
// only while a piece is being welded, 5 a steady lamp (kind 1: a teal strip). Time is the world clock, in step
// with the 60 s animation.
void p0Surface(inout P0Surface s) {
  float type = floor(s.uv.x + 0.001);
  float ph = fract(s.uv.x);
  float kind = s.uv.y;
  float T = p0Time;
  float L = mod(T, 60.00);
  vec3 col = vec3(0.2, 0.9, 0.85);
  float on = 1.0;
  if (type < 0.5) {
    float fl = 0.72 + 0.28 * sin(T * 31.0 + ph * 40.0);
    if (kind < 0.5) { on = step(29.50, L) * step(L, 42.50); col = mix(vec3(1.0, 0.5, 0.25), vec3(1.0, 0.85, 0.75), smoothstep(37.00, 42.20, L)) * (1.6 + 2.2 * smoothstep(29.50, 38.50, L)); }
    else if (kind < 1.5) { on = step(29.80, L) * step(L, 38.20); col = vec3(1.0, 0.75, 0.45) * 2.0; }
    else col = vec3(0.45, 0.8, 1.0) * 2.2;
    col *= fl;
  } else if (type < 1.5) {
    float band = pow(0.5 + 0.5 * sin(s.position.y * 1.1 - T * 2.6 + ph * 6.283), 8.0);
    col = mix(vec3(0.1, 0.9, 0.85), vec3(1.0, 0.45, 0.1), kind) * (0.3 + band * 2.6);
  } else if (type < 2.5) {
    on = step(0.6, fract(T * 0.8 + ph));
    col = vec3(1.0, 0.4, 0.15) * 2.6;
  } else if (type < 3.5) {
    float f = exp(-abs(L - 42.20) * 5.0);
    on = step(0.05, f);
    col = vec3(0.7, 0.95, 1.0) * f * 5.0;
  } else if (type < 4.5) {
    float st = mod(L, 3.60);
    on = step(L, 25.20) * step(1.10, st) * step(st, 3.00);
    if (kind < 0.5) on *= step(0.45, fract(sin(floor(T * 16.0) + ph * 91.0) * 437.5));
    col = kind < 0.5 ? vec3(1.0, 0.75, 0.35) * 3.2 : kind < 1.5 ? vec3(0.5, 0.85, 1.0) * (1.6 + 0.8 * sin(T * 40.0)) : vec3(1.0, 0.97, 0.9) * (3.0 + 1.5 * sin(T * 53.0));
  } else {
    col = kind > 0.5 ? vec3(0.2, 0.9, 0.85) * (1.2 + 0.5 * sin(T * 2.0 + s.position.x + s.position.z)) : vec3(1.0, 0.95, 0.85) * 1.8;
  }
  if (on < 0.5) discard;
  s.color = vec3(0.02);
  s.emissive = col * (1.0 + p0Near * 0.2);
}
