import { islandShore, circleOutline, BEACH_WIDTH } from "./city-plan.js";
import { LOT_SIZE } from "./city-layout.js";

/** World-space extent of every island and its beach. */
export function cityExtent(plan) {
  const points = [
    ...plan.islands.flatMap((island) => islandShore(island, BEACH_WIDTH + 4)),
    ...circleOutline(plan.center.radius, BEACH_WIDTH + 4, 16),
  ];
  if (plan.showcase) {
    const { x, z } = plan.showcase.frame.center;
    points.push(...circleOutline(plan.showcase.radius, BEACH_WIDTH + 4, 16).map((p) => ({ x: p.x + x, z: p.z + z })));
  }
  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minZ: Math.min(...points.map((p) => p.z)),
    maxZ: Math.max(...points.map((p) => p.z)),
  };
}

/**
 * Fit the city into a width x height box, north (-z) up, keeping proportions.
 * Converters are shared by the canvas, hit testing and HTML pins.
 */
export function mapProjection(extent, width, height, padding = 4) {
  const spanX = extent.maxX - extent.minX, spanZ = extent.maxZ - extent.minZ;
  const scale = Math.max(1e-6, Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanZ));
  const offsetX = (width - spanX * scale) / 2, offsetY = (height - spanZ * scale) / 2;
  const toPixel = (x, z) => ({ x: offsetX + (x - extent.minX) * scale, y: offsetY + (z - extent.minZ) * scale });
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

/** The lot under a world position, if any (lots are rotated with their island). */
export function lotAtPosition(lots, x, z) {
  return (
    lots.find((lot) => {
      const dx = x - lot.position.x, dz = z - lot.position.z;
      return Math.abs(dx * lot.forward.z - dz * lot.forward.x) <= LOT_SIZE / 2 && Math.abs(dx * lot.forward.x + dz * lot.forward.z) <= LOT_SIZE / 2;
    }) || null
  );
}
export function pedestalAtPosition(plan, x, z) {
  return plan.showcase?.pedestals.find((pedestal) => Math.hypot(pedestal.position.x - x, pedestal.position.z - z) <= pedestal.size / 2 + 2.5) || null;
}
/** Where each neighbourhood's name sits: just beyond its island, away from the Beacon. */
export function islandLabelPoint(island, distance = 10) {
  return island.frame.toWorld(0, -island.back - BEACH_WIDTH - distance);
}

/**
 * A live top-down drawing of the real city: the bay, every island, bridge,
 * street and lot, the Beacon, the showcase, the cube and where the camera
 * looks. Plain 2D canvas, so it keeps working without WebGL.
 */
export function createCityMap({ canvas, plan, labels = false, padding = 4 }) {
  const extent = cityExtent(plan);
  const colors = new Map(plan.islands.map((island) => [island.district.id, island.district.color]));
  const base = document.createElement("canvas");
  let width = 0, height = 0, ratio = 1, projection = null;
  let player = null, highlighted = null, selected = null, hovered = null;
  const listeners = new Set();

  function polygon(ctx, points) {
    ctx.beginPath();
    points.forEach(({ x, z }, i) => {
      const p = projection.toPixel(x, z);
      if (i) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
  }
  function box(ctx, { p, s, r }) {
    const centre = projection.toPixel(p[0], p[2]);
    ctx.save();
    ctx.translate(centre.x, centre.y);
    ctx.rotate(-r);
    ctx.fillRect((-s[0] / 2) * projection.scale, (-s[2] / 2) * projection.scale, s[0] * projection.scale, s[2] * projection.scale);
    ctx.restore();
  }
  function lotSquare(ctx, lot, size, mode) {
    const centre = projection.toPixel(lot.position.x, lot.position.z);
    ctx.save();
    ctx.translate(centre.x, centre.y);
    ctx.rotate(-lot.angle);
    if (mode === "fill") ctx.fillRect(-size / 2, -size / 2, size, size);
    else ctx.strokeRect(-size / 2 + 0.5, -size / 2 + 0.5, size - 1, size - 1);
    ctx.restore();
  }
  const isHighlighted = (id) => !highlighted || highlighted.has(id);

  function drawBase() {
    base.width = canvas.width;
    base.height = canvas.height;
    const ctx = base.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const { scale, toPixel } = projection;
    const circles = [{ centre: { x: 0, z: 0 }, radius: plan.center.radius }];
    if (plan.showcase) circles.push({ centre: plan.showcase.frame.center, radius: plan.showcase.radius });
    const circleShore = ({ centre, radius }, grow) => circleOutline(radius, grow, 64).map((p) => ({ x: p.x + centre.x, z: p.z + centre.z }));
    // Shallows, beaches, then lawns.
    ctx.fillStyle = "rgba(87, 170, 170, .35)";
    for (const island of plan.islands) (polygon(ctx, islandShore(island, BEACH_WIDTH + 6)), ctx.fill());
    for (const circle of circles) (polygon(ctx, circleShore(circle, BEACH_WIDTH + 6)), ctx.fill());
    ctx.fillStyle = "#cbbd96";
    for (const island of plan.islands) (polygon(ctx, islandShore(island, 3)), ctx.fill());
    for (const circle of circles) (polygon(ctx, circleShore(circle, 3)), ctx.fill());
    ctx.fillStyle = "#6f8a62";
    for (const island of plan.islands) (polygon(ctx, islandShore(island, 0)), ctx.fill());
    for (const circle of circles) (polygon(ctx, circleShore(circle, 0)), ctx.fill());
    // Bridges, paving and streets.
    ctx.strokeStyle = "#ddd4bf";
    ctx.lineCap = "butt";
    for (const bridge of plan.bridges) {
      ctx.lineWidth = Math.max(1.5, bridge.width * scale);
      const a = toPixel(bridge.from.x, bridge.from.z), b = toPixel(bridge.to.x, bridge.to.z);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.fillStyle = "#b9b1a0";
    for (const item of [...plan.plazas, ...plan.spokes, ...plan.pavements, ...(plan.showcase ? [plan.showcase.avenue] : [])]) box(ctx, item);
    ctx.fillStyle = "#47575e";
    for (const road of plan.roads) box(ctx, road);
    // The Beacon's plaza and water garden.
    const centre = toPixel(0, 0);
    const disc = (radius, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, radius * scale, 0, Math.PI * 2);
      ctx.fill();
    };
    disc(plan.center.plaza, "#b9b1a0");
    disc(30.35, "#4f8fa0");
    disc(23.8, "#b9b1a0");
    disc(9.7, "#24404c");
    ctx.fillStyle = "#b5f1d6";
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, Math.max(1.5, 3.4 * scale), 0, Math.PI * 2);
    ctx.fill();
    // Lots: built ones filled, open ones outlined.
    const size = Math.max(2, 13.6 * scale);
    for (const lot of plan.lots) {
      const color = colors.get(lot.district) || "#b5f1d6";
      const on = isHighlighted(lot.id);
      ctx.globalAlpha = on ? 1 : 0.22;
      if (lot.project) {
        ctx.fillStyle = color;
        lotSquare(ctx, lot, size, "fill");
      } else {
        if (on && highlighted) {
          ctx.fillStyle = `${color}33`;
          lotSquare(ctx, lot, size, "fill");
        }
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha *= 0.75;
        lotSquare(ctx, lot, size, "stroke");
      }
    }
    // Showcase paths and pedestals.
    if (plan.showcase) {
      const showcaseCentre = toPixel(plan.showcase.frame.center.x, plan.showcase.frame.center.z);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#b9b1a0";
      ctx.lineWidth = Math.max(1, 3 * scale);
      for (const radius of plan.showcase.paths) {
        ctx.beginPath();
        ctx.arc(showcaseCentre.x, showcaseCentre.y, radius * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const pedestal of plan.showcase.pedestals) {
        const p = toPixel(pedestal.position.x, pedestal.position.z);
        ctx.globalAlpha = isHighlighted(`model:${pedestal.model.id}`) ? 1 : 0.25;
        ctx.fillStyle = plan.showcase.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.6, (pedestal.size / 2) * scale + 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (labels) {
      ctx.font = `700 ${Math.round(Math.max(9, Math.min(12, scale * 22)))}px "DM Sans", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor = "rgba(5, 20, 30, .8)";
      ctx.shadowBlur = 4;
      // Labels sit beyond each island but are kept inside the drawing.
      const label = (text, point, color) => {
        const p = toPixel(point.x, point.z);
        const half = ctx.measureText(text).width / 2 + 4;
        ctx.fillStyle = color;
        ctx.fillText(text, Math.min(Math.max(p.x, half), width - half), Math.min(Math.max(p.y, 10), height - 10));
      };
      for (const island of plan.islands) label(island.district.name.toUpperCase(), islandLabelPoint(island, 2), island.district.color);
      if (plan.showcase) label(plan.showcase.name.toUpperCase(), plan.showcase.frame.toWorld(0, -plan.showcase.radius - BEACH_WIDTH - 2), plan.showcase.color);
      ctx.shadowBlur = 0;
    }
  }

  function outline(target, color, lineWidth) {
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (target.kind === "model") {
      const p = projection.toPixel(target.pedestal.position.x, target.pedestal.position.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(4, (target.pedestal.size / 2) * projection.scale + 3), 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    lotSquare(ctx, target.lot, Math.max(4, 13.6 * projection.scale) + lineWidth * 2 + 2, "stroke");
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
    /** What is under a viewport point: `{ kind: "lot", lot }`, `{ kind: "model", pedestal }` or null. */
    targetAt(clientX, clientY) {
      if (!projection) return null;
      const rect = canvas.getBoundingClientRect();
      const world = projection.toWorld(clientX - rect.left, clientY - rect.top);
      const pedestal = pedestalAtPosition(plan, world.x, world.z);
      if (pedestal) return { kind: "model", pedestal, model: pedestal.model };
      const lot = lotAtPosition(plan.lots, world.x, world.z);
      return lot ? { kind: "lot", lot } : null;
    },
    /** Emphasize these ids (lot ids, or `model:<id>`) and fade the rest; null shows everything. */
    highlight(ids) {
      highlighted = ids ? new Set(ids) : null;
      if (projection) {
        drawBase();
        draw();
      }
    },
    setHovered(target) {
      const key = target ? (target.kind === "model" ? target.model.id : target.lot.id) : null;
      const current = hovered ? (hovered.kind === "model" ? hovered.model.id : hovered.lot.id) : null;
      if (key === current) return;
      hovered = target;
      draw();
    },
    setSelected(target) {
      selected = target || null;
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
