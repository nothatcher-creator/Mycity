const LOT_SIZE = 15.4;
const PLAZA_RADIUS = 35.4;

/** World-space extent of every lot, the plaza and their streets. */
export function cityExtent(lots) {
  let minX = -PLAZA_RADIUS, maxX = PLAZA_RADIUS, minZ = -PLAZA_RADIUS, maxZ = PLAZA_RADIUS;
  for (const { position } of lots) {
    minX = Math.min(minX, position.x - LOT_SIZE);
    maxX = Math.max(maxX, position.x + LOT_SIZE);
    minZ = Math.min(minZ, position.z - LOT_SIZE);
    maxZ = Math.max(maxZ, position.z + LOT_SIZE);
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * Fit the city into a width x height box, north (-z) up, keeping proportions.
 * Converters are shared by the canvas, hit testing and HTML pins.
 */
export function mapProjection(extent, width, height, padding = 4) {
  const spanX = extent.maxX - extent.minX, spanZ = extent.maxZ - extent.minZ;
  const scale = Math.max(1e-6, Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ));
  const offsetX = (width - spanX * scale) / 2, offsetY = (height - spanZ * scale) / 2;
  const toPixel = (x, z) => ({
    x: offsetX + (x - extent.minX) * scale,
    y: offsetY + (z - extent.minZ) * scale,
  });
  return {
    scale,
    toPixel,
    toPercent(x, z) {
      const point = toPixel(x, z);
      return { left: (point.x / width) * 100, top: (point.y / height) * 100 };
    },
    toWorld(px, py) {
      return { x: (px - offsetX) / scale + extent.minX, z: (py - offsetY) / scale + extent.minZ };
    },
  };
}

/** The lot under a world position, if any. */
export function lotAtPosition(lots, x, z) {
  return lots.find((lot) =>
    Math.abs(lot.position.x - x) <= LOT_SIZE / 2 && Math.abs(lot.position.z - z) <= LOT_SIZE / 2,
  ) || null;
}

/** The district roads as world-space polylines, matching the streets built in world.js. */
export function cityRoads(city) {
  const roads = [];
  for (const district of city.districts) {
    const [cx, cz] = district.center;
    const rows = Math.ceil(district.slotCount / district.columns);
    const width = district.columns * district.spacing + 6, depth = rows * district.spacing + 6;
    const left = cx - width / 2 - 4, right = cx + width / 2 + 4;
    const top = cz - depth / 2 - 4, bottom = cz + depth / 2 + 4;
    roads.push({ width: 7, points: [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]] });
    for (let row = 1; row < rows; row++) {
      const z = cz + (row - rows / 2) * district.spacing;
      roads.push({ width: 2.8, points: [[cx - width / 2, z], [cx + width / 2, z]] });
    }
    for (let col = 1; col < district.columns; col++) {
      const x = cx + (col - district.columns / 2) * district.spacing;
      roads.push({ width: 2.8, points: [[x, cz - depth / 2], [x, cz + depth / 2]] });
    }
    const ring = Math.sign(bottom) * 43;
    roads.push({
      width: 7,
      points: Math.abs(cx) > 30 ? [[cx, bottom], [cx, ring], [0, ring]] : [[cx, bottom], [cx, 43]],
    });
  }
  return roads;
}

/**
 * A live top-down drawing of the real city: streets, every lot (built or open),
 * the beacon, the cube and where the camera is looking. It is plain 2D canvas,
 * so the map keeps working on devices without WebGL.
 */
export function createCityMap({ canvas, lots, city, labels = false, padding = 4 }) {
  const extent = cityExtent(lots);
  const roads = cityRoads(city);
  const colors = new Map(city.districts.map((district) => [district.id, district.color]));
  const base = document.createElement("canvas");
  let width = 0, height = 0, ratio = 1, projection = null;
  let player = null, highlighted = null, selected = null, hovered = null;
  const listeners = new Set();

  function drawBase() {
    base.width = canvas.width;
    base.height = canvas.height;
    const ctx = base.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const { toPixel, scale } = projection;
    ctx.lineCap = "square";
    ctx.strokeStyle = "#5d7b85";
    for (const road of roads) {
      ctx.lineWidth = Math.max(0.6, road.width * scale);
      ctx.globalAlpha = road.width > 3 ? 0.75 : 0.35;
      ctx.beginPath();
      road.points.forEach(([x, z], index) => {
        const point = toPixel(x, z);
        if (index) ctx.lineTo(point.x, point.y);
        else ctx.moveTo(point.x, point.y);
      });
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const center = toPixel(0, 0);
    const disc = (radius, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.fill();
    };
    disc(PLAZA_RADIUS * scale, "#8f9b93");
    disc(30.35 * scale, "#4f8fa0");
    disc(23.8 * scale, "#8f9b93");
    disc(9.7 * scale, "#24404c");
    disc(Math.max(1.5, 3.4 * scale), "#b5f1d6");
    const size = Math.max(2, 13.6 * scale);
    for (const lot of lots) {
      const point = toPixel(lot.position.x, lot.position.z);
      const color = colors.get(lot.district) || "#b5f1d6";
      ctx.globalAlpha = highlighted && !highlighted.has(lot.id) ? 0.2 : 1;
      if (lot.project) {
        ctx.fillStyle = color;
        ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      } else {
        ctx.strokeStyle = color;
        if (!highlighted || !highlighted.has(lot.id)) ctx.globalAlpha *= 0.5;
        else {
          ctx.fillStyle = color + "26";
          ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
        }
        ctx.lineWidth = 1;
        ctx.strokeRect(point.x - size / 2 + 0.5, point.y - size / 2 + 0.5, size - 1, size - 1);
      }
    }
    ctx.globalAlpha = 1;
    if (labels) {
      ctx.font = `600 ${Math.round(Math.max(9, Math.min(12, scale * 11)))}px "DM Sans", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (const district of city.districts) {
        const rows = Math.ceil(district.slotCount / district.columns);
        const point = toPixel(district.center[0], district.center[1] + (rows * district.spacing) / 2 + 8);
        ctx.fillStyle = district.color;
        ctx.fillText(district.name.toUpperCase(), point.x, point.y);
      }
    }
  }

  function outline(lot, color, lineWidth) {
    const point = projection.toPixel(lot.position.x, lot.position.z);
    const size = Math.max(4, 13.6 * projection.scale) + lineWidth * 2 + 2;
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
  }

  function draw() {
    if (!projection) return;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (hovered) outline(hovered, "#e8fff6aa", 1.5);
    if (selected) outline(selected, "#ffffff", 2);
    if (!player) return;
    const point = projection.toPixel(player.x, player.z);
    // Where the camera is looking: a soft wedge ahead of the cube.
    if (Number.isFinite(player.view)) {
      const reach = Math.max(18, 34 * projection.scale);
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, reach);
      gradient.addColorStop(0, "rgba(181,241,214,.42)");
      gradient.addColorStop(1, "rgba(181,241,214,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      const angle = Math.PI / 2 - player.view;
      ctx.arc(point.x, point.y, reach, angle - 0.55, angle + 0.55);
      ctx.closePath();
      ctx.fill();
    }
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(Math.PI - (player.heading || 0));
    ctx.fillStyle = "#e8fff6";
    ctx.strokeStyle = "#123038";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 4.5);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-4.4, 4.5);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    width = rect.width;
    height = rect.height;
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    projection = mapProjection(extent, width, height, padding);
    drawBase();
    draw();
    listeners.forEach((listener) => listener(projection));
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  return {
    /** Calls `listener(projection)` whenever the drawing is re-fitted. */
    onLayout(listener) {
      listeners.add(listener);
      if (projection) listener(projection);
    },
    /** The lot under a viewport point, for hover and click handling. */
    lotAt(clientX, clientY) {
      if (!projection) return null;
      const rect = canvas.getBoundingClientRect();
      const world = projection.toWorld(clientX - rect.left, clientY - rect.top);
      return lotAtPosition(lots, world.x, world.z);
    },
    /** Emphasize these lot ids and fade the rest; null shows everything. */
    highlight(ids) {
      highlighted = ids ? new Set(ids) : null;
      if (projection) {
        drawBase();
        draw();
      }
    },
    setHovered(lot) {
      if (lot === hovered) return;
      hovered = lot;
      draw();
    },
    setSelected(lot) {
      selected = lot || null;
      draw();
    },
    update({ position, heading, view }) {
      if (!position) return;
      player = { x: position.x, z: position.z, heading, view };
      draw();
    },
    dispose() {
      observer.disconnect();
      listeners.clear();
    },
  };
}
