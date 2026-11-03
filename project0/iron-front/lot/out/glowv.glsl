// Shell bursts swell out of the crater and collapse: their spheres move along their (round) normals.
// uv.x = type + phase, uv.y = the sphere's radius.
vec3 p0Vertex(vec3 position, vec3 normal, vec2 uv) {
  float type = floor(uv.x + 0.001);
  if (type > 2.5 && type < 3.5) {
    float k = fract(p0Time / 6.0 + fract(uv.x));
    float g = k < 0.3 ? 0.25 + 0.75 * sqrt(k / 0.3) : 0.05;
    return position - normal * uv.y * (1.0 - g) + vec3(0.0, uv.y * g * 0.4, 0.0);
  }
  return position;
}
