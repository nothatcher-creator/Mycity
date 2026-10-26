/** Lot footprint (the paved plinth); lots sit on a `spacing` grid. */
export const LOT_SIZE = 15.4;
// Island margins around a district's lot grid: perimeter road and verge at the
// sides and back, plus an entrance plaza at the front where the bridge lands.
const ISLAND_SIDE = 12,
  ISLAND_BACK = 12,
  ISLAND_FRONT = 22;
const DEFAULT_CENTER_RADIUS = 52;

const finitePair = (value) =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);

/**
 * Every neighborhood island faces the Beacon. The frame maps local
 * coordinates (x across the island, z towards the Beacon) to the world.
 */
export function districtFrame(center) {
  const [cx, cz] = center;
  const distance = Math.hypot(cx, cz);
  const forward = distance > 1e-6 ? { x: -cx / distance, z: -cz / distance } : { x: 0, z: 1 };
  const right = { x: forward.z, z: -forward.x };
  return {
    center: { x: cx, z: cz },
    forward,
    right,
    // three.js rotation.y that turns local +z to face the Beacon.
    angle: Math.atan2(forward.x, forward.z),
    toWorld(lx, lz) {
      return { x: cx + right.x * lx + forward.x * lz, z: cz + right.z * lx + forward.z * lz };
    },
    toLocal(x, z) {
      const dx = x - cx, dz = z - cz;
      return { x: dx * right.x + dz * right.z, z: dx * forward.x + dz * forward.z };
    },
  };
}

/** The island a district stands on, in its local frame and as a world polygon. */
export function districtIsland(district) {
  const rows = Math.ceil(district.slotCount / district.columns);
  const width = district.columns * district.spacing,
    depth = rows * district.spacing;
  const frame = districtFrame(district.center);
  const halfWidth = width / 2 + ISLAND_SIDE,
    back = depth / 2 + ISLAND_BACK,
    front = depth / 2 + ISLAND_FRONT;
  return {
    frame,
    rows,
    width,
    depth,
    halfWidth,
    back,
    front,
    // Rounded-rectangle centre and half depth in the local frame.
    offset: (front - back) / 2,
    halfDepth: (front + back) / 2,
    corner: 9,
    gate: frame.toWorld(0, front),
    polygon: [
      frame.toWorld(-halfWidth, -back),
      frame.toWorld(halfWidth, -back),
      frame.toWorld(halfWidth, front),
      frame.toWorld(-halfWidth, front),
    ],
  };
}

/** The central Beacon island and the circular showcase island, if configured. */
export function centerRadius(city) {
  return Number.isFinite(city?.centerIsland?.radius) ? city.centerIsland.radius : DEFAULT_CENTER_RADIUS;
}
export function showcaseArea(city) {
  const showcase = city?.showcase;
  if (!showcase) return null;
  const frame = districtFrame(showcase.center);
  return {
    ...showcase,
    frame,
    radius: showcase.radius,
    gate: frame.toWorld(0, showcase.radius),
  };
}

function polygonsSeparated(a, b, margin) {
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const nx = q.z - p.z, nz = p.x - q.x;
      const length = Math.hypot(nx, nz) || 1;
      const project = (point) => (point.x * nx + point.z * nz) / length;
      const aValues = a.map(project), bValues = b.map(project);
      if (Math.max(...aValues) + margin < Math.min(...bValues) || Math.max(...bValues) + margin < Math.min(...aValues))
        return true;
    }
  return false;
}
function circleClearOfPolygon(center, radius, polygon, margin) {
  const inside = polygon.every((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    return (q.x - p.x) * (center.z - p.z) - (q.z - p.z) * (center.x - p.x) >= 0;
  });
  if (inside) return false;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length];
    const dx = q.x - p.x, dz = q.z - p.z;
    const t = Math.max(0, Math.min(1, ((center.x - p.x) * dx + (center.z - p.z) * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(p.x + dx * t - center.x, p.z + dz * t - center.z) < radius + margin) return false;
  }
  return true;
}

export function validateCity(city) {
  if (!city || !Array.isArray(city.districts) || !city.districts.length)
    throw new Error("Invalid city configuration");
  const seen = new Set();
  for (const d of city.districts) {
    if (
      !d ||
      typeof d.id !== "string" ||
      !/^[a-z]+$/.test(d.id) ||
      seen.has(d.id) ||
      typeof d.name !== "string" ||
      !d.name.trim() ||
      !finitePair(d.center) ||
      !Number.isInteger(d.columns) ||
      d.columns < 1 ||
      d.columns > 16 ||
      !Number.isInteger(d.slotCount) ||
      d.slotCount < 1 ||
      d.slotCount > 128 ||
      !Number.isFinite(d.spacing) ||
      d.spacing < 15 ||
      d.spacing > 50 ||
      !/^#[0-9a-f]{6}$/i.test(d.color || "") ||
      !/^[A-Z]$/.test(d.prefix || "")
    ) {
      throw new Error("Invalid or duplicate city district");
    }
    seen.add(d.id);
  }
  const showcase = city.showcase;
  if (
    showcase !== undefined &&
    (!showcase ||
      typeof showcase.name !== "string" ||
      !showcase.name.trim() ||
      !finitePair(showcase.center) ||
      !Number.isFinite(showcase.radius) ||
      showcase.radius < 30 ||
      showcase.radius > 120 ||
      !/^#[0-9a-f]{6}$/i.test(showcase.color || ""))
  )
    throw new Error("Invalid city showcase");
  // Islands need water between them, and none may cover the Beacon island.
  const islands = city.districts.map((district) => districtIsland(district).polygon);
  const middle = centerRadius(city);
  for (let i = 0; i < islands.length; i++) {
    if (!circleClearOfPolygon({ x: 0, z: 0 }, middle, islands[i], 8))
      throw new Error("City district overlaps the Beacon island");
    for (let j = i + 1; j < islands.length; j++)
      if (!polygonsSeparated(islands[i], islands[j], 8)) throw new Error("City districts overlap");
    if (showcase && !circleClearOfPolygon({ x: showcase.center[0], z: showcase.center[1] }, showcase.radius, islands[i], 8))
      throw new Error("City showcase overlaps a district");
  }
  if (showcase && Math.hypot(...showcase.center) < middle + showcase.radius + 8)
    throw new Error("City showcase overlaps the Beacon island");
  return city;
}

export function buildCityLots(projects, city) {
  validateCity(city);
  const slots = new Map();
  for (const district of city.districts) {
    const { frame, rows } = districtIsland(district);
    for (let index = 0; index < district.slotCount; index++) {
      const number = String(index + 1).padStart(2, "0");
      const slotId = `${district.id}-${number}`;
      // Row 0 is the front row, nearest the bridge and the Beacon.
      const local = {
        x: ((index % district.columns) - (district.columns - 1) / 2) * district.spacing,
        z: ((rows - 1) / 2 - Math.floor(index / district.columns)) * district.spacing,
      };
      const { x, z } = frame.toWorld(local.x, local.z);
      const entrance = frame.toWorld(local.x, local.z + 7.8);
      slots.set(slotId, {
        id: slotId,
        slotId,
        district: district.id,
        position: { x, y: 0, z },
        angle: frame.angle,
        forward: { ...frame.forward },
        entrance,
        project: null,
        title: "Open lot",
        displayNumber: `${district.prefix}${number}`,
        color: district.color,
      });
    }
  }
  const ids = new Set();
  for (const project of projects) {
    const lot = slots.get(project.slot);
    if (!lot || lot.district !== project.district)
      throw new Error(`Unknown or mismatched city slot: ${project.slot}`);
    if (lot.project || ids.has(project.id))
      throw new Error(`Duplicate or occupied city slot: ${project.slot}`);
    ids.add(project.id);
    Object.assign(lot, {
      id: project.id,
      project,
      title: project.title,
      displayNumber: project.originalLot
        ? String(project.originalLot)
        : String(project.plot).padStart(3, "0"),
    });
  }
  const positions = new Set();
  for (const lot of slots.values()) {
    const key = `${lot.position.x.toFixed(3)},${lot.position.z.toFixed(3)}`;
    if (positions.has(key)) throw new Error("Overlapping city district slots");
    positions.add(key);
  }
  return [...slots.values()];
}

/** Which island (or the bay between them) a world position is over. */
export function getDistrictAtPosition(position, city) {
  for (const d of city.districts) {
    const island = districtIsland(d);
    const local = island.frame.toLocal(position.x, position.z);
    if (Math.abs(local.x) <= island.halfWidth && local.z >= -island.back && local.z <= island.front)
      return d.id;
  }
  const showcase = city.showcase;
  if (showcase && Math.hypot(position.x - showcase.center[0], position.z - showcase.center[1]) <= showcase.radius)
    return "showcase";
  return Math.hypot(position.x, position.z) <= centerRadius(city) ? "center" : "bay";
}
