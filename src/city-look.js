/** Shared lighting direction keeps the photographed sky, reflections and shadows consistent. */
export const CITY_LOOK = Object.freeze({
  exposure: 1.03,
  fog: { color: 0xbac7cf, density: 0.0015 },
  environment: { intensity: 0.5, backgroundIntensity: 0.9, rotation: -1.595 },
  sun: { color: 0xffd6a3, intensity: 3.1, direction: [-72, 13, 94] },
  ambient: { sky: 0xb8d3f0, ground: 0x665c45, intensity: 0.55 },
  fill: { color: 0x9ebce6, intensity: 0.35 },
});
