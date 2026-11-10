// Glow: the yard's lights. The mesh's uv says what each piece is: uv.x = type + phase, uv.y = its kind.
// 0 engine flame (kind 0 ion blue, 1 fuel orange, 2 the Mule's fans: lit only while it flies),
// 1 running lights up the frame (kind 1: amber), 2 a blinking beacon, 3 the jump gate (kind 1: the flash
// across its mouth as a ship goes through, twice a loop), 4 sparks at the rock, 5 a steady lamp
// (kind 1: teal strip). Timing runs on the world clock, in step with the 60 s animation loop.
void p0Surface(inout P0Surface s) {
  float type = floor(s.uv.x + 0.001);
  float ph = fract(s.uv.x);
  float kind = s.uv.y;
  float T = p0Time;
  vec3 col = vec3(0.2, 0.9, 0.85);
  float on = 1.0;
  if (type < 0.5) {
    float fl = 0.75 + 0.25 * sin(T * 31.0 + ph * 40.0);
    col = kind < 0.5 ? vec3(0.35, 0.7, 1.0) : vec3(1.0, 0.55, 0.2);
    if (kind > 1.5) { float c = fract(T / 60.0); on = step(8.0 / 60.0, c) * step(c, 46.0 / 60.0); col = vec3(1.0, 0.8, 0.5); }
    col *= fl * 2.4;
  } else if (type < 1.5) {
    float band = pow(0.5 + 0.5 * sin(s.position.y * 1.1 - T * 2.6 + ph * 6.283), 8.0);
    col = mix(vec3(0.1, 0.9, 0.85), vec3(1.0, 0.45, 0.1), kind) * (0.3 + band * 2.6);
  } else if (type < 2.5) {
    on = step(0.6, fract(T * 0.8 + ph));
    col = vec3(1.0, 0.4, 0.15) * 2.6;
  } else if (type < 3.5) {
    float c = fract(T / 30.0);
    float flash = exp(-min(c, 1.0 - c) * 36.0);
    if (kind > 0.5) { on = step(0.06, flash); col = vec3(0.6, 1.0, 0.95) * flash * 3.0; }
    else { float chase = pow(0.5 + 0.5 * sin(ph * 18.85 - T * 5.0), 4.0); col = vec3(0.2, 0.95, 0.9) * (0.5 + chase * 1.7 + flash * 4.0); }
  } else if (type < 4.5) {
    on = step(0.5, fract(sin(floor(T * 14.0) + ph * 91.0) * 437.5));
    col = vec3(1.0, 0.75, 0.35) * 3.0;
  } else {
    col = kind > 0.5 ? vec3(0.2, 0.9, 0.85) * (1.2 + 0.5 * sin(T * 2.0 + s.position.x + s.position.z)) : vec3(1.0, 0.95, 0.85) * 1.6;
  }
  if (on < 0.5) discard;
  s.color = vec3(0.02);
  s.emissive = col * (1.0 + p0Near * 0.2);
}
