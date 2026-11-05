// Glow: the battle's light. The mesh's uv says what each piece is: uv.x = type + phase, uv.y = its kind or
// size. 0 muzzle flash, 1 tracer, 2 fire, 3 shell burst, 4 jet afterburner, 5 warning lamp. Timing runs on
// the world clock in step with the 24 s animation loop (tanks fire every 6 s when their turrets come to rest,
// the jet's gun fires at the bottom of its dives). Pieces that are not lit are discarded.
float hash1(float x) { return fract(sin(x * 91.7) * 43758.5453); }
void p0Surface(inout P0Surface s) {
  float type = floor(s.uv.x + 0.001);
  float ph = fract(s.uv.x);
  float kind = s.uv.y;
  float T = p0Time;
  vec3 hot = vec3(1.0, 0.85, 0.55), orange = vec3(1.0, 0.45, 0.1);
  float on = 0.0;
  vec3 col = hot;
  if (type < 1.5) {
    // flashes and tracers share the timing; a tracer comes on a moment after its flash
    float lag = type > 0.5 ? 0.012 : 0.0;
    if (kind > 1.5) {
      // the jet: bursts while low in its dive
      float a = T / 24.0 * 12.566;
      float dive = sin(a * 2.0 + 0.6);
      on = step(dive, -0.55) * step(0.5, fract(T * 9.0 + ph));
    } else if (kind > 0.5) {
      // a tank gun: one round every 6 s
      float c = fract(T / 6.0 + ph);
      on = step(lag, c) * step(c, 0.05 + lag * 3.0);
    } else {
      // riflemen: short bursts
      float w = fract(T / 4.0 + ph);
      on = step(w, 0.45) * step(0.55, fract(T * 6.0 + ph * 13.0));
    }
    col = type > 0.5 ? vec3(1.0, 0.6, 0.25) : hot;
  } else if (type < 2.5) {
    // fire: flickering tongues, brighter low down
    float f = 0.6 + 0.25 * sin(T * 11.0 + s.position.y * 9.0 + ph * 20.0) + 0.15 * sin(T * 23.0 + s.position.x * 13.0);
    on = 1.0;
    col = mix(orange, hot, f * 0.6) * (0.9 + f);
  } else if (type < 3.5) {
    // a shell burst: white, then orange, then gone (the vertex shader swells it)
    float k = fract(T / 6.0 + ph);
    on = step(k, 0.3);
    float t = k / 0.3;
    col = mix(vec3(1.2, 1.1, 0.9), vec3(0.9, 0.3, 0.05), t) * (2.2 - t * 1.6);
  } else if (type < 4.5) {
    on = 1.0;
    col = mix(vec3(1.0, 0.55, 0.2), vec3(0.5, 0.7, 1.0), 0.5 + 0.5 * sin(T * 30.0)) * 1.4;
  } else {
    // red lamps, one beat a second
    on = 1.0;
    col = vec3(1.0, 0.08, 0.05) * (0.2 + 1.6 * step(0.5, fract(T + ph)));
  }
  if (on < 0.5) discard;
  s.color = vec3(0.02);
  s.emissive = col * (1.6 + p0Near * 0.3);
}
