import * as THREE from "three";
import { roundedOutline, circleOutline, BEACH_WIDTH } from "./city-plan.js";

const MAX_ISLANDS = 8;

/** World-scale UVs so tiled textures keep their size across every island. */
function worldUV(geometry, scale) {
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / scale;
    uv[i * 2 + 1] = position.getZ(i) / scale;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** A flat top plus beach rings sloping under the water, already in world space. */
function islandGeometry(outline, place, rings) {
  const toWorld = ({ x, z }) => place(x, z);
  const top = outline(0).map(toWorld);
  const positions = [], colors = [], index = [];
  const centre = top.reduce((sum, p) => ({ x: sum.x + p.x / top.length, z: sum.z + p.z / top.length }), { x: 0, z: 0 });
  // Grass fan.
  const grass = new THREE.BufferGeometry();
  const grassPositions = [centre.x, rings[0].y, centre.z];
  for (const p of top) grassPositions.push(p.x, rings[0].y, p.z);
  const grassIndex = [];
  for (let i = 0; i < top.length; i++) grassIndex.push(0, ((i + 1) % top.length) + 1, i + 1);
  grass.setAttribute("position", new THREE.Float32BufferAttribute(grassPositions, 3));
  grass.setIndex(grassIndex);
  grass.computeVertexNormals();
  worldUV(grass, 5);
  // Beach rings: dry sand at the grass edge, wet sand at the waterline, then the shelf.
  const color = new THREE.Color();
  rings.forEach((ring) => {
    color.set(ring.color);
    for (const p of outline(ring.grow).map(toWorld)) {
      positions.push(p.x, ring.y, p.z);
      colors.push(color.r, color.g, color.b);
    }
  });
  const count = top.length;
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < count; i++) {
      const a = r * count + i, b = r * count + ((i + 1) % count);
      const c = a + count, d = b + count;
      index.push(a, b, c, b, d, c);
    }
  const beach = new THREE.BufferGeometry();
  beach.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  beach.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  beach.setIndex(index);
  beach.computeVertexNormals();
  worldUV(beach, 4);
  return { grass, beach };
}

const BEACH_RINGS = (water) => [
  { grow: 0, y: -0.04, color: "#cdbd93" },
  { grow: 2.6, y: water + 0.18, color: "#c2ab80" },
  { grow: 3.6, y: water - 0.2, color: "#9a8762" },
  { grow: BEACH_WIDTH + 2, y: water - 2.6, color: "#6f7f6a" },
  { grow: BEACH_WIDTH + 8, y: water - 7, color: "#4c625c" },
];

/**
 * Nothatcher Bay: the sea, every island's beach and lawn, bridges, entrance
 * gates, boats and the distant islands on the horizon. Built once from the
 * city plan; `update(time)` animates water and boats.
 */
export function createBayScenery({ scene, plan, textPlane, materials: sharedMaterials }) {
  const group = new THREE.Group();
  group.name = "Nothatcher-Bay";
  scene.add(group);
  const geometries = new Set(), materials = new Set();
  const track = (value, set) => (set.add(value), value);
  const water = plan.waterLevel;
  const solidMeshes = [];

  // ---------- Islands ----------
  const shapes = [];
  const sand = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }), materials);
  const lawn = sharedMaterials.grass;
  function addIsland(outline, place) {
    const { grass, beach } = islandGeometry(outline, place, BEACH_RINGS(water));
    track(grass, geometries);
    track(beach, geometries);
    const top = new THREE.Mesh(grass, lawn);
    const shore = new THREE.Mesh(beach, sand);
    top.receiveShadow = shore.receiveShadow = true;
    top.name = "Island-lawn";
    group.add(top, shore);
  }
  for (const island of plan.islands) {
    const { frame } = island;
    addIsland((grow) => roundedOutline(island, grow), (x, z) => frame.toWorld(x, z));
    shapes.push({ kind: 0, centre: frame.center, cos: Math.cos(frame.angle), sin: Math.sin(frame.angle), half: [island.halfWidth, island.halfDepth], offset: island.offset, corner: island.corner });
  }
  const circles = [{ centre: { x: 0, z: 0 }, radius: plan.center.radius }];
  if (plan.showcase) circles.push({ centre: plan.showcase.frame.center, radius: plan.showcase.radius });
  for (const circle of circles) {
    addIsland((grow) => circleOutline(circle.radius, grow), (x, z) => ({ x: x + circle.centre.x, z: z + circle.centre.z }));
    shapes.push({ kind: 1, centre: circle.centre, cos: 1, sin: 0, half: [circle.radius, circle.radius], offset: 0, corner: circle.radius });
  }

  // ---------- Sea ----------
  // Shores come from the same island shapes, so shallows and foam hug every beach.
  const shoreData = new Float32Array(MAX_ISLANDS * 4), sizeData = new Float32Array(MAX_ISLANDS * 4);
  shapes.slice(0, MAX_ISLANDS).forEach((shape, i) => {
    shoreData.set([shape.centre.x, shape.centre.z, shape.cos, shape.sin], i * 4);
    sizeData.set([shape.half[0] + BEACH_WIDTH, shape.half[1] + BEACH_WIDTH, shape.offset, shape.corner + BEACH_WIDTH], i * 4);
  });
  const waterTime = { value: 0 };
  // Deep teal with a softened sky reflection, so the bay reads as water rather than glass.
  const seaMaterial = track(new THREE.MeshStandardMaterial({ color: 0x0f4656, roughness: 0.16, metalness: 0, envMapIntensity: 0.45 }), materials);
  seaMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uSeaTime = waterTime;
    shader.uniforms.uShores = { value: Array.from({ length: MAX_ISLANDS }, (_, i) => new THREE.Vector4().fromArray(shoreData, i * 4)) };
    shader.uniforms.uSizes = { value: Array.from({ length: MAX_ISLANDS }, (_, i) => new THREE.Vector4().fromArray(sizeData, i * 4)) };
    shader.uniforms.uShoreCount = { value: Math.min(shapes.length, MAX_ISLANDS) };
    shader.vertexShader = "varying vec3 vSeaWorld;\n" + shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvSeaWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
    );
    shader.fragmentShader = `varying vec3 vSeaWorld;
uniform float uSeaTime;
uniform vec4 uShores[${MAX_ISLANDS}];
uniform vec4 uSizes[${MAX_ISLANDS}];
uniform int uShoreCount;
float seaShore(vec2 p) {
  float best = 1e5;
  for (int i = 0; i < ${MAX_ISLANDS}; i++) {
    if (i >= uShoreCount) break;
    vec2 d = p - uShores[i].xy;
    // Into the island's frame: x across, z towards the Beacon.
    vec2 local = vec2(d.x * uShores[i].z - d.y * uShores[i].w, d.x * uShores[i].w + d.y * uShores[i].z);
    local.y -= uSizes[i].z;
    vec2 q = abs(local) - (uSizes[i].xy - uSizes[i].w);
    best = min(best, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uSizes[i].w);
  }
  return best;
}
` + shader.fragmentShader
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  float shoreDistance = seaShore(vSeaWorld.xz);
  float shallow = 1.0 - smoothstep(-2.0, 18.0, shoreDistance);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.52, 0.52), shallow * 0.8);
  // Surf at the waterline, plus one soft wave line rolling in every few seconds.
  float ripple = sin(shoreDistance * 1.3 - uSeaTime * 1.4) * 0.5 + 0.5;
  float foam = (1.0 - smoothstep(-3.2, 1.6, shoreDistance)) * (0.6 + 0.4 * ripple);
  float waveFront = 10.0 - mod(uSeaTime * 1.6, 12.0);
  foam += exp(-pow((shoreDistance - waveFront) / 0.9, 2.0)) * 0.3 * smoothstep(-1.0, 3.0, waveFront) * (1.0 - smoothstep(6.0, 10.0, shoreDistance));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.95), clamp(foam, 0.0, 1.0) * 0.8);`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
  vec2 sp = vSeaWorld.xz;
  float st = uSeaTime;
  vec2 slope = vec2(0.0);
  slope += vec2(0.80, 0.60) * cos(dot(sp, vec2(0.80, 0.60)) * 0.21 + st * 0.9) * 0.042;
  slope += vec2(-0.45, 0.89) * cos(dot(sp, vec2(-0.45, 0.89)) * 0.34 + st * 1.25) * 0.032;
  slope += vec2(0.97, -0.24) * cos(dot(sp, vec2(0.97, -0.24)) * 0.83 + st * 1.9) * 0.018;
  slope += vec2(-0.71, -0.71) * cos(dot(sp, vec2(-0.71, -0.71)) * 1.7 + st * 2.6) * 0.010;
  // Fade fine ripples with distance so the horizon does not shimmer.
  slope *= 1.0 / (1.0 + length(vViewPosition) * 0.006);
  normal = normalize(mat3(viewMatrix) * normalize(vec3(-slope.x, 1.0, -slope.y)));`,
      );
  };
  seaMaterial.customProgramCacheKey = () => `nothatcher-bay-sea-v1-${shapes.length}`;
  const seaGeometry = track(new THREE.CircleGeometry(1600, 96).rotateX(-Math.PI / 2), geometries);
  const sea = new THREE.Mesh(seaGeometry, seaMaterial);
  sea.position.y = water;
  sea.receiveShadow = true;
  sea.name = "Sea";
  group.add(sea);

  // ---------- Bridges ----------
  const stone = track(new THREE.MeshStandardMaterial({ color: 0xd8cfbb, roughness: 0.82, metalness: 0 }), materials);
  const ironwork = track(new THREE.MeshStandardMaterial({ color: 0x2a3e4b, roughness: 0.45, metalness: 0.5 }), materials);
  const deckMaterial = sharedMaterials.pavers || stone;
  const postTransforms = [], railTransforms = [], pierTransforms = [], lampHeads = [];
  const arch = (t) => 0.12 + Math.sin(Math.PI * t) * 2.2;
  for (const bridge of plan.bridges) {
    const dx = bridge.to.x - bridge.from.x, dz = bridge.to.z - bridge.from.z;
    const length = Math.hypot(dx, dz), along = { x: dx / length, z: dz / length };
    const side = { x: along.z, z: -along.x };
    const steps = Math.max(12, Math.round(length / 3));
    const positions = [], index = [];
    const half = bridge.width / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, y = arch(t);
      const cx = bridge.from.x + dx * t, cz = bridge.from.z + dz * t;
      positions.push(cx - side.x * half, y, cz - side.z * half, cx + side.x * half, y, cz + side.z * half);
      positions.push(cx - side.x * half, y - 0.9, cz - side.z * half, cx + side.x * half, y - 0.9, cz + side.z * half);
      if (i < steps) {
        // Vertices per step: left top, right top, left bottom, right bottom.
        const a = i * 4, b = a + 4;
        index.push(a, b, a + 1, a + 1, b, b + 1); // deck, facing up
        index.push(a, a + 2, b, b, a + 2, b + 2); // left side, facing out
        index.push(a + 1, b + 1, a + 3, b + 1, b + 3, a + 3); // right side, facing out
        index.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2); // underside, facing down
      }
    }
    const indexed = new THREE.BufferGeometry();
    indexed.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    indexed.setIndex(index);
    // Unshared vertices give each face its own normal: crisp deck edges, no smearing.
    const geometry = track(indexed.toNonIndexed(), geometries);
    indexed.dispose();
    geometry.computeVertexNormals();
    worldUV(geometry, 3);
    const deck = new THREE.Mesh(geometry, deckMaterial);
    deck.castShadow = deck.receiveShadow = true;
    deck.name = `Bridge-${bridge.district}`;
    group.add(deck);
    solidMeshes.push(deck);
    // Railings follow the arch: posts, a top rail per segment, piers in the water.
    for (const s of [-1, 1]) {
      for (let i = 0; i <= steps; i += 2) {
        const t = i / steps;
        postTransforms.push({ p: [bridge.from.x + dx * t + side.x * s * (half - 0.25), arch(t) + 0.5, bridge.from.z + dz * t + side.z * s * (half - 0.25)], s: [0.14, 1, 0.14], r: 0 });
      }
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps, t1 = (i + 1) / steps;
        const y0 = arch(t0) + 1.02, y1 = arch(t1) + 1.02;
        const run = length / steps;
        const mid = (t0 + t1) / 2;
        railTransforms.push({
          p: [bridge.from.x + dx * mid + side.x * s * (half - 0.25), (y0 + y1) / 2, bridge.from.z + dz * mid + side.z * s * (half - 0.25)],
          s: [0.12, 0.1, Math.hypot(run, y1 - y0) + 0.02],
          r: Math.atan2(along.x, along.z),
          pitch: -Math.atan2(y1 - y0, run),
        });
      }
      for (const t of [0.25, 0.75]) lampHeads.push({ p: [bridge.from.x + dx * t + side.x * s * (half - 0.25), arch(t) + 2.75, bridge.from.z + dz * t + side.z * s * (half - 0.25)], s: [0.32, 0.32, 0.32], r: 0 });
    }
    for (const t of [1 / 3, 2 / 3])
      pierTransforms.push({ p: [bridge.from.x + dx * t, water - 1.5 + (arch(t) - 0.9 - water + 1.5) / 2, bridge.from.z + dz * t], s: [half * 0.55, arch(t) - 0.9 - water + 1.5, 1.6], r: Math.atan2(along.x, along.z) });
  }
  const unitBox = track(new THREE.BoxGeometry(1, 1, 1), geometries);
  const object = new THREE.Object3D();
  function instanced(geometry, material, transforms, { shadow = true } = {}) {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    transforms.forEach((transform, i) => {
      object.position.set(...transform.p);
      object.rotation.set(0, transform.r || 0, 0);
      if (transform.pitch) object.rotateX(transform.pitch);
      object.scale.set(...transform.s);
      object.updateMatrix();
      mesh.setMatrixAt(i, object.matrix);
    });
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  }
  instanced(unitBox, ironwork, postTransforms);
  instanced(unitBox, ironwork, railTransforms);
  instanced(unitBox, stone, pierTransforms);
  const lampPosts = lampHeads.map((head) => ({ p: [head.p[0], head.p[1] - 1.3, head.p[2]], s: [0.1, 2.5, 0.1], r: 0 }));
  instanced(unitBox, ironwork, lampPosts);
  const lampGlow = track(new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc77a, emissiveIntensity: 1.4, roughness: 0.4 }), materials);
  const sphere = track(new THREE.SphereGeometry(1, 12, 8), geometries);
  instanced(sphere, lampGlow, lampHeads, { shadow: false });

  // ---------- Entrance gates ----------
  for (const gate of plan.gates) {
    const arch = new THREE.Group();
    arch.position.set(gate.position.x, 0, gate.position.z);
    arch.rotation.y = gate.angle;
    group.add(arch);
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(unitBox, ironwork);
      pillar.position.set(s * 8.2, 3.2, 0);
      pillar.scale.set(0.7, 6.4, 0.7);
      pillar.castShadow = true;
      arch.add(pillar);
    }
    // Only the pillars are solid: a height field cannot leave room under the beam.
    const beam = new THREE.Mesh(unitBox, ironwork);
    beam.position.set(0, 6.55, 0);
    beam.scale.set(17.6, 0.5, 0.8);
    beam.castShadow = true;
    beam.userData.decorative = true;
    arch.add(beam);
    const stripe = new THREE.Mesh(unitBox, track(new THREE.MeshStandardMaterial({ color: gate.color, emissive: gate.color, emissiveIntensity: 1.1, roughness: 0.35 }), materials));
    stripe.position.set(0, 6.2, 0.43);
    stripe.scale.set(16.4, 0.09, 0.06);
    stripe.userData.decorative = true;
    arch.add(stripe);
    for (const facing of [0, Math.PI]) {
      const sign = textPlane(gate.name.toUpperCase(), { width: 14, height: 2.2, font: 40, color: gate.color });
      sign.material.side = THREE.FrontSide;
      sign.position.set(0, 7.95, facing ? -0.42 : 0.42);
      sign.rotation.y = facing;
      sign.userData.decorative = true;
      arch.add(sign);
    }
    solidMeshes.push(arch);
  }

  // ---------- Boats ----------
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 2.6);
  hullShape.quadraticCurveTo(1.15, 1.2, 1.05, -2.1);
  hullShape.lineTo(-1.05, -2.1);
  hullShape.quadraticCurveTo(-1.15, 1.2, 0, 2.6);
  const hullGeometry = track(new THREE.ExtrudeGeometry(hullShape, { depth: 0.9, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2 }).rotateX(Math.PI / 2).translate(0, 0.55, 0), geometries);
  const sailGeometry = track(new THREE.BufferGeometry(), geometries);
  sailGeometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 1.1, 0.25, 0, 6.2, 0.25, 0, 1.1, -1.9], 3));
  sailGeometry.computeVertexNormals();
  const hullColors = [0xf2ede3, 0x2f5a73, 0xb5523b, 0xf2ede3, 0x31464f];
  const sailMaterial = track(new THREE.MeshStandardMaterial({ color: 0xfbf7ef, roughness: 0.8, side: THREE.DoubleSide }), materials);
  const boats = [];
  const anchored = [36, 100, 154, 206, 260, 324];
  const roaming = 7;
  for (let i = 0; i < anchored.length + roaming; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(hullGeometry, track(new THREE.MeshStandardMaterial({ color: hullColors[i % hullColors.length], roughness: 0.55 }), materials));
    const mast = new THREE.Mesh(unitBox, ironwork);
    mast.position.set(0, 3.6, 0.3);
    mast.scale.set(0.12, 6, 0.12);
    const sail = new THREE.Mesh(sailGeometry, sailMaterial);
    hull.castShadow = sail.castShadow = mast.castShadow = true;
    boat.add(hull, mast, sail);
    const isAnchored = i < anchored.length;
    const bearing = ((isAnchored ? anchored[i] : (i - anchored.length) * (360 / roaming) + 17) * Math.PI) / 180;
    const radius = isAnchored ? 82 + (i % 2) * 10 : 268 + (i % 3) * 22;
    boat.userData = { bearing, radius, anchored: isAnchored, speed: isAnchored ? 0 : 0.012 + (i % 3) * 0.004, phase: i * 1.7 };
    group.add(boat);
    boats.push(boat);
  }
  function placeBoats(time) {
    for (const boat of boats) {
      const { bearing, radius, anchored: still, speed, phase } = boat.userData;
      const turn = bearing + time * speed;
      boat.position.set(Math.sin(turn) * radius, water - 0.35 + Math.sin(time * 1.1 + phase) * 0.12, -Math.cos(turn) * radius);
      // Roaming boats point along their circle (local +z is the bow).
      boat.rotation.set(Math.sin(time * 0.9 + phase) * 0.04, still ? turn + Math.sin(time * 0.2 + phase) * 0.3 : Math.PI / 2 - turn, Math.sin(time * 1.3 + phase) * 0.05);
    }
  }
  placeBoats(0);

  // ---------- Distant islands and rocks ----------
  const rockGeometry = (() => {
    const geometry = new THREE.IcosahedronGeometry(1, 3);
    const position = geometry.getAttribute("position");
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      const bump = Math.sin(point.x * 3.1 + point.z * 1.7) * 0.12 + Math.sin(point.y * 4.3 + point.x * 2.2) * 0.08;
      point.multiplyScalar(1 + bump);
      point.y = Math.max(point.y, -0.2);
      position.setXYZ(i, point.x, point.y, point.z);
    }
    geometry.computeVertexNormals();
    return track(geometry, geometries);
  })();
  const far = [], near = [];
  for (let i = 0; i < 16; i++) {
    const turn = (i / 16) * Math.PI * 2 + Math.sin(i * 2.3) * 0.12;
    const radius = 720 + Math.sin(i * 1.9) * 120;
    const width = 70 + Math.abs(Math.sin(i * 1.3)) * 90;
    far.push({ p: [Math.sin(turn) * radius, water - 6, -Math.cos(turn) * radius], s: [width, 22 + Math.abs(Math.sin(i * 0.7)) * 48, width * 0.7], r: i });
  }
  for (const island of plan.islands) {
    for (let i = 0; i < 6; i++) {
      const lx = (i % 2 ? 1 : -1) * (island.halfWidth + 3.5), lz = -island.back + 6 + i * ((island.back + island.front - 20) / 6);
      const p = island.frame.toWorld(lx, lz);
      near.push({ p: [p.x, water - 0.6, p.z], s: [1.6 + (i % 3) * 0.6, 1 + (i % 2) * 0.7, 1.4 + (i % 3) * 0.4], r: i * 1.3 });
    }
  }
  const farMaterial = track(new THREE.MeshStandardMaterial({ color: 0x5f7464, roughness: 1, flatShading: true }), materials);
  const rockMaterial = track(new THREE.MeshStandardMaterial({ color: 0x8a8c84, roughness: 0.95, flatShading: true }), materials);
  instanced(rockGeometry, farMaterial, far, { shadow: false });
  instanced(rockGeometry, rockMaterial, near);

  let disposed = false;
  return {
    group,
    /** Bridges and gates are solid; the world adds them to its height field. */
    solidMeshes,
    update(time) {
      if (disposed) return;
      waterTime.value = time;
      placeBoats(time);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
    },
  };
}
