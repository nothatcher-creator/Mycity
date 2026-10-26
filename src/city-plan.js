import {
  buildCityLots,
  districtIsland,
  centerRadius,
  showcaseArea,
} from "./city-layout.js";

export const WATER_LEVEL = -1.1;
export const PLAZA_RADIUS = 35.4;
// Showcase pedestal rings (metres from the island centre) and their spacing.
const SHOWCASE_RINGS = [15, 26, 37];
const PEDESTAL_SPACING = 10;
// A stable 0..1 value per position, so scenery varies but never reshuffles.
const vary = (x, z) => {
  const value = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

/** Points around an island's rounded rectangle (local x/z), grown outwards by `grow` metres. */
export function roundedOutline({ halfWidth, halfDepth, offset = 0, corner }, grow = 0, segments = 6) {
  const radius = corner + grow, w = halfWidth + grow - radius, d = halfDepth + grow - radius;
  const centres = [[w, d], [-w, d], [-w, -d], [w, -d]];
  const points = [];
  centres.forEach(([cx, cz], quadrant) => {
    for (let i = 0; i <= segments; i++) {
      const turn = (quadrant + i / segments) * (Math.PI / 2);
      points.push({ x: cx + Math.cos(turn) * radius, z: offset + cz + Math.sin(turn) * radius });
    }
  });
  return points;
}
export function circleOutline(radius, grow = 0, count = 64) {
  return Array.from({ length: count }, (_, i) => {
    const turn = (i / count) * Math.PI * 2;
    return { x: Math.cos(turn) * (radius + grow), z: Math.sin(turn) * (radius + grow) };
  });
}
/** An island's shoreline in world space; `grow` reaches out across the beach. */
export function islandShore(island, grow = 0) {
  return roundedOutline(island, grow).map(({ x, z }) => island.frame.toWorld(x, z));
}
export const BEACH_WIDTH = 6;

/** World-space box for a rectangle given in a district's local frame. */
function localBox(frame, lx, lz, width, depth, y = 0.04, height = 0.18) {
  const point = frame.toWorld(lx, lz);
  return { p: [point.x, y, point.z], s: [width, height, depth], r: frame.angle };
}
/** World-space box spanning two points, with depth along the segment. */
function segmentBox(from, to, width, y, height) {
  const dx = to.x - from.x, dz = to.z - from.z;
  return {
    p: [(from.x + to.x) / 2, y, (from.z + to.z) / 2],
    s: [width, height, Math.hypot(dx, dz)],
    r: Math.atan2(dx, dz),
  };
}

/** Pedestal places on the showcase island: a featured centre, then rings. */
export function showcasePlaces(area) {
  if (!area) return [];
  const places = [{ local: { x: 0, z: 0 }, featured: true }];
  for (const radius of SHOWCASE_RINGS) {
    const count = Math.floor((2 * Math.PI * radius) / PEDESTAL_SPACING);
    for (let i = 0; i < count; i++) {
      const turn = ((i + 0.5) / count) * Math.PI * 2;
      const local = { x: Math.sin(turn) * radius, z: Math.cos(turn) * radius };
      // Keep the avenue from the bridge to the featured centre open.
      if (local.z > 0 && Math.abs(local.x) < 6.5) continue;
      places.push({ local, featured: false });
    }
  }
  return places.map((place, index) => {
    const position = area.frame.toWorld(place.local.x, place.local.z);
    const outward = place.featured
      ? { x: 0, z: 1 }
      : { x: place.local.x / Math.hypot(place.local.x, place.local.z), z: place.local.z / Math.hypot(place.local.x, place.local.z) };
    // Each plaque faces the path a visitor walks past it on.
    const facing = area.frame.toWorld(outward.x, outward.z);
    return {
      index,
      featured: place.featured,
      position,
      angle: Math.atan2(facing.x - area.frame.center.x, facing.z - area.frame.center.z),
      size: place.featured ? 7 : 3.8,
    };
  });
}

/**
 * Everything drawable about the city, derived from city.json and the catalog,
 * so the 3D world, both maps and the tests agree on one layout.
 */
export function buildCityPlan(projects, city, { models = [] } = {}) {
  const lots = buildCityLots(projects, city);
  const middle = centerRadius(city);
  const islands = city.districts.map((district) => ({ district, ...districtIsland(district) }));
  const roads = [], pavements = [], plazas = [], lanes = [], bridges = [], spokes = [];
  const trees = [], lamps = [], benches = [], cars = [], gates = [];

  for (const island of islands) {
    const { district, frame, width, depth, rows, halfWidth, back, front } = island;
    const spacing = district.spacing;
    const ring = { x: width / 2 + 4, z: depth / 2 + 4 };
    // Perimeter avenue (7 m) with pavements, then the narrow lanes between lots.
    const avenue = (lx, lz, w, d) => {
      roads.push(localBox(frame, lx, lz, w, d));
      pavements.push(localBox(frame, lx, lz, w + 3, d + 3, -0.13, 0.3));
      lanes.push(localBox(frame, lx, lz, w > d ? w : 0.12, w > d ? 0.12 : d, 0.145, 0.025));
    };
    avenue(0, ring.z, width + 15, 7);
    avenue(0, -ring.z, width + 15, 7);
    avenue(-ring.x, 0, 7, depth + 15);
    avenue(ring.x, 0, 7, depth + 15);
    for (let row = 1; row < rows; row++)
      roads.push(localBox(frame, 0, (row - rows / 2) * spacing, width, 2.8));
    for (let col = 1; col < district.columns; col++)
      roads.push(localBox(frame, (col - district.columns / 2) * spacing, 0, 2.8, depth));
    // The entrance plaza runs from the front avenue to the shore, where the bridge lands.
    const plazaStart = ring.z + 3.5, plazaDepth = front - plazaStart + 1;
    plazas.push(localBox(frame, 0, plazaStart + plazaDepth / 2, 30, plazaDepth, -0.1, 0.3));
    gates.push({ district: district.id, position: frame.toWorld(0, front - 7), angle: frame.angle, name: district.name, color: district.color });
    for (const side of [-1, 1]) {
      benches.push({ p: frame.toWorld(side * 11, front - 11), r: frame.angle + (side < 0 ? Math.PI / 2 : -Math.PI / 2) });
      trees.push({ p: frame.toWorld(side * 13.5, front - 3.5), scale: 1.1 });
    }
    // A tree line on the verge between the avenue and the shore.
    const verge = halfWidth - 2.6;
    for (let lz = -back + 3; lz <= ring.z; lz += 8.5)
      for (const side of [-1, 1]) {
        const p = frame.toWorld(side * verge, lz);
        trees.push({ p, scale: 0.85 + vary(p.x, p.z) * 0.35 });
      }
    for (let lx = -verge + 8.5; lx < verge - 4; lx += 8.5) {
      const p = frame.toWorld(lx, -back + 2.6);
      trees.push({ p, scale: 0.85 + vary(p.x, p.z) * 0.35 });
    }
    for (let i = 0; i < 3; i++)
      cars.push({ p: frame.toWorld(-ring.x - 5.6, (i - 1) * 13), r: frame.angle });
    // Bridge from the Beacon island to this island's entrance plaza.
    const toward = { x: -frame.forward.x, z: -frame.forward.z };
    const landing = { x: toward.x * (middle - 3), z: toward.z * (middle - 3) };
    const shore = frame.toWorld(0, front + 2);
    bridges.push({ district: district.id, from: landing, to: shore, width: 9, color: district.color });
    spokes.push(segmentBox({ x: toward.x * (PLAZA_RADIUS - 1), z: toward.z * (PLAZA_RADIUS - 1) }, landing, 10, -0.08, 0.3));
  }

  for (const lot of lots) {
    // One lamp per lot, at its front-left corner.
    const right = { x: lot.forward.z, z: -lot.forward.x };
    lamps.push({
      p: { x: lot.position.x - right.x * 6.5 + lot.forward.x * 6.5, z: lot.position.z - right.z * 6.5 + lot.forward.z * 6.5 },
      r: lot.angle + Math.PI / 2,
    });
  }

  const area = showcaseArea(city);
  let showcase = null;
  if (area) {
    const places = showcasePlaces(area);
    const shown = models.slice(0, places.length);
    const toward = { x: -area.frame.forward.x, z: -area.frame.forward.z };
    const landing = { x: toward.x * (middle - 3), z: toward.z * (middle - 3) };
    const shore = area.frame.toWorld(0, area.radius + 2);
    bridges.push({ district: "showcase", from: landing, to: shore, width: 9, color: area.color });
    spokes.push(segmentBox({ x: toward.x * (PLAZA_RADIUS - 1), z: toward.z * (PLAZA_RADIUS - 1) }, landing, 10, -0.08, 0.3));
    const avenue = segmentBox(area.frame.toWorld(0, area.radius + 1), area.frame.toWorld(0, 0), 10, -0.08, 0.3);
    gates.push({ district: "showcase", position: area.frame.toWorld(0, area.radius - 7), angle: area.frame.angle, name: area.name, color: area.color });
    for (let i = 0; i < 18; i++) {
      const turn = (i / 18) * Math.PI * 2;
      if (Math.abs(Math.sin(turn / 2)) < 0.12) continue;
      const point = area.frame.toWorld(Math.sin(turn) * (area.radius - 4.5), Math.cos(turn) * (area.radius - 4.5));
      trees.push({ p: point, scale: 1 });
    }
    showcase = {
      ...area,
      avenue,
      paths: [20.5, 31.5, 42.5],
      places,
      pedestals: shown.map((model, index) => ({ ...places[index], model })),
      overflow: models.slice(places.length),
    };
  }

  return {
    lots,
    islands,
    center: { radius: middle, plaza: PLAZA_RADIUS },
    roads,
    pavements,
    plazas,
    lanes,
    bridges,
    spokes,
    gates,
    props: { trees, lamps, benches, cars },
    showcase,
    waterLevel: WATER_LEVEL,
  };
}
