const KEY_OFFSET = 4096;
const finite = (value, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/**
 * A coarse top-down height field: every cell stores the tallest solid surface
 * above it. Buildings become walls you slide along and roofs you hover over,
 * and the follow camera uses the same data to stay out of walls. Coordinates
 * are plain numbers so the field can be built and tested without WebGL.
 * Triangles entirely lower than `ignoreBelow` (ground plates, water) are skipped.
 */
export function createHeightField({ cellSize = 0.5, ignoreBelow = -Infinity } = {}) {
  const size = Math.max(0.05, finite(cellSize, 0.5));
  const cells = new Map();
  const cell = (value) => Math.floor(value / size);
  const key = (ix, iz) => (ix + KEY_OFFSET) * KEY_OFFSET * 2 + (iz + KEY_OFFSET);
  const heightAt = (x, z) => cells.get(key(cell(x), cell(z))) ?? 0;
  function raise(ix, iz, height) {
    const id = key(ix, iz);
    if (!(cells.get(id) >= height)) cells.set(id, height);
  }

  // One separating-axis test: does the line through edge 1-2 keep the cell
  // rectangle entirely away from the triangle's third vertex (ox, oz)?
  function separates(x1, z1, x2, z2, ox, oz, minX, minZ, maxX, maxZ) {
    const nx = z2 - z1,
      nz = x1 - x2;
    const edge = nx * x1 + nz * z1,
      inner = nx * ox + nz * oz;
    const lo = Math.min(nx * minX, nx * maxX) + Math.min(nz * minZ, nz * maxZ);
    const hi = Math.max(nx * minX, nx * maxX) + Math.max(nz * minZ, nz * maxZ);
    return hi < Math.min(edge, inner) || lo > Math.max(edge, inner);
  }
  // The cell loop already covers the rectangle's own axes; these are the triangle's.
  function overlaps(ax, az, bx, bz, cx, cz, minX, minZ, maxX, maxZ) {
    return !(
      separates(ax, az, bx, bz, cx, cz, minX, minZ, maxX, maxZ) ||
      separates(bx, bz, cx, cz, ax, az, minX, minZ, maxX, maxZ) ||
      separates(cx, cz, ax, az, bx, bz, minX, minZ, maxX, maxZ)
    );
  }

  function addTriangle(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const top = Math.max(ay, by, cy),
      bottom = Math.min(ay, by, cy);
    // NaN fails every comparison, so this also rejects non-finite geometry.
    if (!(top >= ignoreBelow && top < Infinity && bottom > -Infinity)) return;
    if (!Number.isFinite(ax + az + bx + bz + cx + cz)) return;
    // Plane y = px * x + pz * z + c, unless the triangle is a steep wall.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz);
    const steep = !length || Math.abs(ny) / length < 0.2;
    const at = (x, z) => ay - (nx * (x - ax) + nz * (z - az)) / ny;
    const minX = cell(Math.min(ax, bx, cx)),
      maxX = cell(Math.max(ax, bx, cx));
    const minZ = cell(Math.min(az, bz, cz)),
      maxZ = cell(Math.max(az, bz, cz));
    for (let ix = minX; ix <= maxX; ix++)
      for (let iz = minZ; iz <= maxZ; iz++) {
        const x0 = ix * size, z0 = iz * size, x1 = x0 + size, z1 = z0 + size;
        if (!overlaps(ax, az, bx, bz, cx, cz, x0, z0, x1, z1)) continue;
        let height = top;
        if (!steep) {
          height = Math.max(at(x0, z0), at(x1, z0), at(x0, z1), at(x1, z1));
          height = Math.min(top, Math.max(bottom, height));
        }
        raise(ix, iz, height);
      }
  }

  return {
    cellSize: size,
    get size() {
      return cells.size;
    },
    /** World-space triangles: `positions` is [x, y, z, ...], `index` is optional. */
    addTriangles(positions, index = null) {
      const count = index ? index.length : Math.floor(positions.length / 3);
      for (let i = 0; i + 2 < count; i += 3) {
        const a = (index ? index[i] : i) * 3,
          b = (index ? index[i + 1] : i + 1) * 3,
          c = (index ? index[i + 2] : i + 2) * 3;
        addTriangle(
          positions[a], positions[a + 1], positions[a + 2],
          positions[b], positions[b + 1], positions[b + 2],
          positions[c], positions[c + 1], positions[c + 2],
        );
      }
    },
    addBox(minX, minZ, maxX, maxZ, top) {
      if (![minX, minZ, maxX, maxZ, top].every(Number.isFinite)) return;
      for (let ix = cell(minX); ix <= cell(maxX - 1e-9); ix++)
        for (let iz = cell(minZ); iz <= cell(maxZ - 1e-9); iz++) raise(ix, iz, top);
    },
    addDisc(x, z, radius, top) {
      if (![x, z, radius, top].every(Number.isFinite) || radius <= 0) return;
      for (let ix = cell(x - radius); ix <= cell(x + radius); ix++)
        for (let iz = cell(z - radius); iz <= cell(z + radius); iz++) {
          const nearX = Math.max(ix * size, Math.min(x, (ix + 1) * size));
          const nearZ = Math.max(iz * size, Math.min(z, (iz + 1) * size));
          if (Math.hypot(nearX - x, nearZ - z) < radius) raise(ix, iz, top);
        }
    },
    /** Clear the cells whose centres fall inside a rotated rectangle (angle as three.js rotation.y). */
    clearRotatedRect(x, z, halfX, halfZ, angle) {
      const reach = Math.abs(halfX * Math.cos(angle)) + Math.abs(halfZ * Math.sin(angle)),
        reachZ = Math.abs(halfX * Math.sin(angle)) + Math.abs(halfZ * Math.cos(angle));
      const fx = Math.sin(angle), fz = Math.cos(angle);
      for (let ix = cell(x - reach); ix <= cell(x + reach); ix++)
        for (let iz = cell(z - reachZ); iz <= cell(z + reachZ); iz++) {
          const dx = (ix + 0.5) * size - x, dz = (iz + 0.5) * size - z;
          const across = dx * fz - dz * fx, along = dx * fx + dz * fz;
          if (Math.abs(across) <= halfX && Math.abs(along) <= halfZ) cells.delete(key(ix, iz));
        }
    },
    clearRect(minX, minZ, maxX, maxZ) {
      for (let ix = cell(minX); ix <= cell(maxX); ix++)
        for (let iz = cell(minZ); iz <= cell(maxZ); iz++) cells.delete(key(ix, iz));
    },
    heightAt,
    /** Tallest surface under an axis-aligned footprint. */
    maxHeightIn(minX, minZ, maxX, maxZ) {
      let height = 0;
      for (let ix = cell(minX); ix <= cell(maxX); ix++)
        for (let iz = cell(minZ); iz <= cell(maxZ); iz++) {
          const value = cells.get(key(ix, iz));
          if (value > height) height = value;
        }
      return height;
    },
    /**
     * Fraction of the segment from `from` to `to` that stays above the field,
     * keeping `clearance` metres of air above surfaces. 1 means unobstructed.
     */
    clearFraction(from, to, clearance = 0.4) {
      const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
      const length = Math.hypot(dx, dy, dz);
      if (!Number.isFinite(length) || length < 1e-6) return 1;
      const steps = Math.ceil(length / (size * 0.7));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const y = from.y + dy * t;
        if (y < heightAt(from.x + dx * t, from.z + dz * t) + clearance)
          return (i - 1) / steps;
      }
      return 1;
    },
  };
}
