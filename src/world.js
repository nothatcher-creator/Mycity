import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { getDistrictAtPosition } from "./city-layout.js";
import { buildCityPlan } from "./city-plan.js";
import { createFlightState, stepFlight } from "./flight.js";
import { createHeightField } from "./collision.js";
import { createCityVisuals } from "./city-visuals.js";
import { createCityResources, cityBuildingSource } from "./city-resources.js";
import { createBayScenery } from "./bay-scenery.js";
import { showcaseNumber } from "./showcase.js";
import { configureModelLoader } from "./model-loading.js";
import { CITY_LOOK } from "./city-look.js";

const COLORS = {
  stone: 0xc4bda9,
  cream: 0xdfd3ba,
  mint: 0x9ee7d2,
  gold: 0xe2bd79,
  ink: 0x233746,
  glass: 0x7bb7c8,
  hedge: 0x4f6c45,
};
const SPAWN = { x: 0, y: 2.2, z: 36 };
const SPAWN_VIEW = { yaw: 0.62, elevation: 0.35, distance: 31 };
// Showcase models are fetched when the cube comes within this distance of the island.
const SHOWCASE_RANGE = 170;
const SHOWCASE_AUTOLOAD_BYTES = 40 * 1024 * 1024;

/**
 * Nothatcher Bay: a flyable archipelago. Every navigation and launch action
 * also remains available as HTML outside the canvas.
 */
export function createWorld({
  canvas,
  labelsContainer,
  projects,
  city,
  models = [],
  flightInput,
  onSelect,
  onSelectModel,
  onReady,
  onNearby,
  onLocation,
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  // Resolution adapts to measured frame time (see adaptQuality) between these limits.
  const maxPixelRatio = Math.min(devicePixelRatio || 1, 2);
  const minPixelRatio = Math.min(maxPixelRatio, 0.75);
  let pixelRatio = maxPixelRatio;
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CITY_LOOK.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x243b52);
  scene.fog = new THREE.FogExp2(CITY_LOOK.fog.color, CITY_LOOK.fog.density);
  const camera = new THREE.PerspectiveCamera(54, 1, 0.2, 1500);
  const playerState = createFlightState(SPAWN);
  const playerPosition = new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z);
  camera.position.set(17, 14, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(playerPosition).add(new THREE.Vector3(0, 1, 0));
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 70;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.7;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Fly your cube around Nothatcher Bay. WASD or arrows move, Space rises, C descends, Shift boosts. Drag to look; E enters the nearest lot or inspects a model.",
  );

  const resources = {
    geometries: new Set(),
    materials: new Set(),
    textures: new Set(),
  };
  const geometryCache = new Map(),
    materialCache = new Map();
  function geometry(name) {
    if (!geometryCache.has(name)) {
      const value =
        name === "box"
          ? new THREE.BoxGeometry(1, 1, 1)
          : name === "sphere"
            ? new THREE.SphereGeometry(1, 12, 8)
            : name === "cylinder"
              ? new THREE.CylinderGeometry(1, 1, 1, 20)
              : name === "cone"
                ? new THREE.ConeGeometry(1, 1, 12)
                : name === "ring"
                  ? new THREE.TorusGeometry(1, 0.045, 6, 48)
                  : name === "hologram"
                    ? new THREE.IcosahedronGeometry(1, 1)
                    : new THREE.PlaneGeometry(1, 1);
      geometryCache.set(name, value);
      resources.geometries.add(value);
    }
    return geometryCache.get(name);
  }
  function mat(color, kind = "standard") {
    const key = String(color) + kind;
    if (!materialCache.has(key)) {
      const value =
        kind === "glow"
          ? new THREE.MeshStandardMaterial({
              color,
              emissive: color,
              emissiveIntensity: 1.15,
              roughness: 0.3,
              metalness: 0.15,
            })
          : kind === "glass"
            ? new THREE.MeshStandardMaterial({
                color,
                metalness: 0.35,
                roughness: 0.17,
                transparent: true,
                opacity: 0.8,
              })
            : new THREE.MeshStandardMaterial({
                color,
                roughness: 0.7,
                metalness: 0.06,
              });
      materialCache.set(key, value);
      resources.materials.add(value);
    }
    return materialCache.get(key);
  }
  function mesh(parent, shape, color, position, scale, kind) {
    const item = new THREE.Mesh(geometry(shape), mat(color, kind));
    if (position) item.position.set(...position);
    if (scale) item.scale.set(...scale);
    item.castShadow = kind !== "glow" && kind !== "glass";
    item.receiveShadow = true;
    if (kind === "glow") item.userData.decorative = true;
    parent.add(item);
    return item;
  }
  const instanceObject = new THREE.Object3D();
  function instances(shape, color, transforms, kind = "standard", material) {
    const item = new THREE.InstancedMesh(
      typeof shape === "string" ? geometry(shape) : shape,
      material || mat(color, kind),
      transforms.length,
    );
    transforms.forEach((transform, index) => {
      instanceObject.position.set(...transform.p);
      instanceObject.scale.set(...transform.s);
      instanceObject.rotation.set(0, transform.r || 0, 0);
      instanceObject.updateMatrix();
      item.setMatrixAt(index, instanceObject.matrix);
      if (transform.c) item.setColorAt(index, new THREE.Color(transform.c));
    });
    item.castShadow = kind !== "glow";
    item.receiveShadow = true;
    item.instanceMatrix.needsUpdate = true;
    item.computeBoundingSphere();
    scene.add(item);
    return item;
  }
  function canvasTexture(width, height, draw) {
    const image = document.createElement("canvas");
    image.width = width;
    image.height = height;
    draw(image.getContext("2d"), width, height);
    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    resources.textures.add(texture);
    return texture;
  }
  function textPlane(
    text,
    {
      color = "#e6f3ee",
      background = "rgba(15,33,44,.85)",
      width = 8,
      height = 1.7,
      font = 46,
    } = {},
  ) {
    const texture = canvasTexture(768, 160, (ctx) => {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, 768, 160);
      ctx.strokeStyle = "rgba(190,235,222,.3)";
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, 764, 156);
      ctx.fillStyle = color;
      ctx.font = `600 ${font}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 384, 82, 730);
    });
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    resources.materials.add(material);
    const plane = new THREE.Mesh(geometry("plane"), material);
    plane.scale.set(width, height, 1);
    return plane;
  }
  // Positions within a lot, in the lot's own frame (x across, z towards its street).
  function lotPoint(lot, lx, lz) {
    return {
      x: lot.position.x + lot.forward.z * lx + lot.forward.x * lz,
      z: lot.position.z - lot.forward.x * lx + lot.forward.z * lz,
    };
  }

  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environmentTarget = environmentGenerator.fromScene(room, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = CITY_LOOK.environment.intensity;
  room.dispose();
  environmentGenerator.dispose();
  scene.add(new THREE.HemisphereLight(CITY_LOOK.ambient.sky, CITY_LOOK.ambient.ground, CITY_LOOK.ambient.intensity));
  const sun = new THREE.DirectionalLight(CITY_LOOK.sun.color, CITY_LOOK.sun.intensity);
  const sunDirection = new THREE.Vector3(...CITY_LOOK.sun.direction);
  sun.target.position.set(SPAWN.x, 0, SPAWN.z);
  sun.position.copy(sun.target.position).add(sunDirection);
  sun.castShadow = true;
  sun.shadow.mapSize.set(innerWidth < 760 ? 1024 : 2048, innerWidth < 760 ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -64, right: 64, top: 64, bottom: -64, near: 1, far: 350 });
  sun.shadow.normalBias = 0.028;
  sun.shadow.bias = -0.00008;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(CITY_LOOK.fill.color, CITY_LOOK.fill.intensity);
  rim.position.set(-80, 28, -100);
  scene.add(rim);

  // ---------------- The plan: one layout shared with the maps and tests ----------------
  const plan = buildCityPlan(projects, city, { models });
  const lots = plan.lots,
    entries = new Map();
  const districtLookup = new Map((city.districts || []).map((district) => [district.id, district]));
  let dirty = true;
  const cityResources = createCityResources({
    renderer,
    scene,
    visuals: { setPhotographicSky: (value) => visuals.setPhotographicSky(value) },
    onChange: () => {
      dirty = true;
      renderer.shadowMap.needsUpdate = true;
      start();
    },
  });
  const pavers = cityResources.material("pavers"),
    grass = cityResources.material("grass");

  // The Beacon island: promenade, water garden and the owner's landmark.
  const promenadeGeometry = new THREE.CylinderGeometry(40, 40, 0.3, 72);
  promenadeGeometry.translate(0, -0.15, 0);
  {
    const positions = promenadeGeometry.getAttribute("position"), uv = promenadeGeometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / 3, positions.getZ(i) / 3);
  }
  resources.geometries.add(promenadeGeometry);
  const promenade = new THREE.Mesh(promenadeGeometry, pavers);
  promenade.receiveShadow = true;
  scene.add(promenade);
  const bridgeAngles = plan.bridges.map((bridge) => Math.atan2(bridge.from.x, bridge.from.z));
  const visuals = createCityVisuals({ scene, city, bridgeAngles });
  visuals.setSurfaceMaterials({ pavers, grass });
  const scenery = createBayScenery({ scene, plan, textPlane, materials: { grass, pavers } });

  // Streets, entrance plazas and the spokes from the plaza to each bridge.
  cityResources.surface("pavers", [...plan.pavements, ...plan.plazas, ...plan.spokes, ...(plan.showcase ? [plan.showcase.avenue] : [])], { uvScale: 3 });
  cityResources.roads(plan.roads);
  instances("box", 0xc7dcb8, plan.lanes, "glow");

  // ---------------- Height field: what the cube and camera can bump into ----------------
  // Lots are rebuilt from the triangles of whichever building currently stands
  // on them; nothing under 0.9 m can stop the cube (its floor is 1.6 m).
  const solids = createHeightField({ cellSize: 0.5, ignoreBelow: 0.9 });
  solids.addDisc(0, 0, 9.7, 1.38);
  solids.addDisc(0, 0, 7.8, 2.13);
  solids.addDisc(0, 0, 3.5, 8);
  solids.addBox(-3.1, -3.1, 3.1, 3.1, 14.2);
  solids.addDisc(0, 0, 3.3, 16.8);
  solids.addDisc(0, 0, 1.2, 18.9);
  for (const side of [-1, 1]) {
    solids.addBox(-5.9, side * 8.05 - 0.1, 5.9, side * 8.05 + 0.1, 4.33);
    solids.addBox(side * 8.05 - 0.1, -5.9, side * 8.05 + 0.1, 5.9, 4.33);
  }
  for (const [x, z, radius] of [[0, -16, 4.5], [-16, 0, 4.5], [16, 0, 4.5], [0, 19, 3.9]])
    solids.addDisc(x, z, radius, 1.13);
  solids.addBox(-2.65, -18.65, 2.65, -13.35, 5.3);
  solids.addBox(-17.6, -0.5, -14.4, 0.5, 5.1);
  solids.addBox(13.1, -0.9, 18.8, 0.9, 3.9);
  solids.addBox(16, -0.5, 18.5, 0.5, 7.1);
  solids.addBox(-2.65, 18.85, 2.65, 19.15, 6.25);
  const solidVertex = new THREE.Vector3(),
    instanceMatrix = new THREE.Matrix4(),
    solidMatrix = new THREE.Matrix4();
  function addSolidObject(root) {
    root.updateWorldMatrix(true, true);
    root.traverse((object) => {
      if (!object.isMesh || object.isSkinnedMesh || object.userData.decorative) return;
      const position = object.geometry?.getAttribute("position");
      if (!position) return;
      const index = object.geometry.index?.array || null;
      const copies = object.isInstancedMesh ? object.count : 1;
      const points = new Float32Array(position.count * 3);
      for (let copy = 0; copy < copies; copy++) {
        solidMatrix.copy(object.matrixWorld);
        if (object.isInstancedMesh) {
          object.getMatrixAt(copy, instanceMatrix);
          solidMatrix.multiply(instanceMatrix);
        }
        for (let i = 0; i < position.count; i++) {
          solidVertex.fromBufferAttribute(position, i).applyMatrix4(solidMatrix);
          points[i * 3] = solidVertex.x;
          points[i * 3 + 1] = solidVertex.y;
          points[i * 3 + 2] = solidVertex.z;
        }
        solids.addTriangles(points, index);
      }
    });
  }
  for (const object of scenery.solidMeshes) addSolidObject(object);
  function rebuildSolids(entry) {
    const { x, z } = entry.lot.position;
    solids.clearRotatedRect(x, z, 8, 8, entry.lot.angle);
    const shown = entry.model || entry.fallback;
    if (shown) addSolidObject(shown);
  }

  // ---------------- Lots ----------------
  function fallbackBuilding(project, parent) {
    const group = new THREE.Group();
    parent.add(group);
    const color = districtLookup.get(project.district)?.color || "#9cd9ca";
    if (project.theme === "forge") {
      mesh(group, "cylinder", COLORS.cream, [0, 0.5, 0], [4.4, 1, 4.4]);
      mesh(group, "cylinder", COLORS.glass, [0, 3.2, 0], [3.8, 4.6, 3.8], "glass");
      mesh(group, "cylinder", COLORS.cream, [0, 5.65, 0], [4.1, 0.45, 4.1]);
      const ring = mesh(group, "ring", color, [0, 8.1, 0], [2.7, 2.7, 2.7], "glow");
      ring.rotation.set(0.5, 0.35, 0);
      mesh(group, "sphere", 0xd4efd4, [0, 8.1, 0], [1.2, 1.2, 1.2], "glow");
    } else if (project.theme === "gallery" || project.district === "art") {
      mesh(group, "box", COLORS.cream, [0, 0.45, 0], [11, 0.9, 9]);
      mesh(group, "box", COLORS.glass, [0, 2.8, 0], [9.5, 4, 7.5], "glass");
      mesh(group, "box", COLORS.cream, [0, 5, 0], [11.5, 0.5, 9.5]);
    } else if (project.originalLot) {
      // A translucent stand-in while the original exterior downloads.
      mesh(group, "box", COLORS.ink, [0, 0.35, 0], [9.5, 0.7, 9.5]);
      mesh(group, "box", color, [0, 4.6, 0], [7.5, 8, 7.5], "glass");
    } else {
      mesh(group, "box", COLORS.cream, [0, 2.25, 0], [10, 4.5, 8]);
      mesh(group, "box", COLORS.ink, [0, 4.65, 0], [11, 0.45, 9]);
      mesh(group, "box", COLORS.glass, [0, 2.4, 4.06], [8.7, 3.2, 0.1], "glass");
    }
    return group;
  }
  const plinths = [], insets = [], hedges = [], signPosts = [], signBoards = [], markers = [];
  const lotTrees = [];
  for (const lot of lots) {
    const { x, z } = lot.position,
      project = lot.project,
      district = districtLookup.get(lot.district),
      color = district?.color || "#a0d7c7",
      angle = lot.angle;
    if (project) {
      plinths.push({ p: [x, 0.05, z], s: [15.4, 0.5, 15.4], r: angle });
      insets.push({ p: [x, 0.35, z], s: [14.7, 0.18, 14.7], r: angle });
    } else {
      // An open plot: a low hedge with a gap at the front, and a sign.
      for (const [lx, lz, w, d] of [[0, -7.2, 15, 0.6], [-7.2, 0, 0.6, 15], [7.2, 0, 0.6, 15], [-4.9, 7.2, 5.2, 0.6], [4.9, 7.2, 5.2, 0.6]]) {
        const point = lotPoint(lot, lx, lz);
        hedges.push({ p: [point.x, 0.32, point.z], s: [w, 0.72, d], r: angle });
      }
      const post = lotPoint(lot, 3.4, 7.9);
      signPosts.push({ p: [post.x, 0.75, post.z], s: [0.12, 1.5, 0.12], r: angle });
      signBoards.push({ p: [post.x, 1.55, post.z], s: [2.2, 0.85, 0.06], r: angle, c: color });
    }
    for (const side of [-1, 1]) {
      const tree = lotPoint(lot, side * 5.9, -5.7);
      lotTrees.push({ p: [tree.x, project ? 0.45 : 0.03, tree.z], scale: project ? 0.9 : 0.75 });
    }
    const marker = lotPoint(lot, 0, 7.3);
    markers.push({ p: [marker.x, project ? 0.53 : 0.08, marker.z], s: [0.6, 0.12, 0.6], c: color });
    const group = new THREE.Group();
    group.position.set(x, 0.45, z);
    group.rotation.y = angle;
    scene.add(group);
    const fallback = project ? fallbackBuilding(project, group) : null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `plot-label${project ? "" : " open-lot"}`;
    button.dataset.project = project?.id || lot.slotId;
    button.dataset.slot = lot.slotId;
    button.setAttribute(
      "aria-label",
      project ? `Lot ${lot.displayNumber}: ${project.title}` : `Open lot ${lot.displayNumber} in ${district?.name || lot.district}`,
    );
    const number = document.createElement("span");
    number.className = "plot-label-number";
    number.textContent = lot.displayNumber;
    const title = document.createElement("strong");
    title.textContent = project?.title || "Open lot";
    button.append(number, title);
    button.hidden = true;
    button.addEventListener("click", () => onSelect?.(project?.id || lot.slotId));
    labelsContainer.append(button);
    entries.set(lot.slotId, {
      kind: "lot",
      lot,
      group,
      fallback,
      button,
      labelAt: { x: marker.x, y: project ? 2.4 : 1.4, z: marker.z },
      model: null,
      high: null,
      loading: false,
      highLoading: false,
      mixer: null,
      distance: Infinity,
    });
  }
  instances("box", COLORS.stone, plinths);
  cityResources.surface("grass", insets, { uvScale: 5 });
  instances("box", COLORS.hedge, hedges);
  instances("box", COLORS.ink, signPosts);
  const signTexture = canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = "#f4f0e4";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1f3644";
    ctx.font = "700 34px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("OPEN LOT", w / 2, 44);
    ctx.font = "500 20px sans-serif";
    ctx.fillText("make it yours", w / 2, 74);
  });
  const signMaterial = new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.8 });
  resources.materials.add(signMaterial);
  instances("box", 0xffffff, signBoards.map((board) => ({ ...board, c: undefined })), "standard", signMaterial);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  resources.materials.add(markerMaterial);
  instances("cylinder", 0xffffff, markers, "glow", markerMaterial).castShadow = false;
  for (const entry of entries.values()) rebuildSolids(entry);

  // ---------------- The Model Showcase island ----------------
  const pedestals = new Map();
  const showcaseColor = new THREE.Color(plan.showcase?.color || "#c8b6ff");
  if (plan.showcase) {
    const area = plan.showcase;
    const centre = area.frame.center;
    const discGeometry = new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2).translate(centre.x, 0.03, centre.z);
    const pathMeshes = [discGeometry];
    for (const radius of area.paths)
      pathMeshes.push(new THREE.RingGeometry(radius - 1.5, radius + 1.5, 96).rotateX(-Math.PI / 2).translate(centre.x, 0.02, centre.z));
    for (const shape of pathMeshes) {
      const positions = shape.getAttribute("position"), uv = shape.getAttribute("uv");
      for (let i = 0; i < positions.count; i++) uv.setXY(i, positions.getX(i) / 3, positions.getZ(i) / 3);
      resources.geometries.add(shape);
      const path = new THREE.Mesh(shape, pavers);
      path.receiveShadow = true;
      scene.add(path);
    }
    const bases = [], caps = [], rings = [];
    const hologramMaterial = new THREE.MeshBasicMaterial({ color: showcaseColor, wireframe: true, transparent: true, opacity: 0.55, toneMapped: false });
    resources.materials.add(hologramMaterial);
    for (const pedestal of area.pedestals) {
      const radius = pedestal.size * 0.5,
        height = pedestal.featured ? 1.5 : 1.1;
      const { x, z } = pedestal.position;
      bases.push({ p: [x, height / 2, z], s: [radius, height, radius] });
      caps.push({ p: [x, height + 0.05, z], s: [radius * 1.06, 0.1, radius * 1.06] });
      rings.push({ p: [x, height + 0.12, z], s: [radius * 0.92, radius * 0.92, radius * 0.92] });
      solids.addDisc(x, z, radius, height);
      const group = new THREE.Group();
      group.position.set(x, height + 0.1, z);
      group.rotation.y = pedestal.angle;
      scene.add(group);
      const placeholder = new THREE.Mesh(geometry("hologram"), hologramMaterial);
      placeholder.position.y = pedestal.size * 0.45;
      placeholder.scale.setScalar(pedestal.size * 0.3);
      group.add(placeholder);
      const number = showcaseNumber(pedestal.index);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "plot-label model-label";
      button.dataset.model = pedestal.model.id;
      button.setAttribute("aria-label", `Model ${number}: ${pedestal.model.title}. Open the 3D viewer.`);
      const tag = document.createElement("span");
      tag.className = "plot-label-number";
      tag.textContent = number;
      const title = document.createElement("strong");
      title.textContent = pedestal.model.title;
      button.append(tag, title);
      button.hidden = true;
      button.addEventListener("click", () => onSelectModel?.(pedestal.model));
      labelsContainer.append(button);
      const front = { x: x + Math.sin(pedestal.angle) * (radius + 0.9), z: z + Math.cos(pedestal.angle) * (radius + 0.9) };
      pedestals.set(pedestal.model.id, {
        kind: "model",
        pedestal,
        model: pedestal.model,
        number,
        group,
        placeholder,
        button,
        labelAt: { x: front.x, y: height + 1.1, z: front.z },
        loaded: null,
        loading: false,
        mixer: null,
        distance: Infinity,
      });
    }
    const pedestalStone = new THREE.MeshStandardMaterial({ color: 0x2b3d4a, roughness: 0.55, metalness: 0.35 });
    const capStone = new THREE.MeshStandardMaterial({ color: 0xe6dfcc, roughness: 0.6, metalness: 0.05 });
    const ringGlow = new THREE.MeshStandardMaterial({ color: showcaseColor, emissive: showcaseColor, emissiveIntensity: 1.2, roughness: 0.3 });
    resources.materials.add(pedestalStone).add(capStone).add(ringGlow);
    if (bases.length) {
      instances("cylinder", 0, bases, "standard", pedestalStone);
      instances("cylinder", 0, caps, "standard", capStone);
      const ringMesh = new THREE.InstancedMesh(geometry("ring"), ringGlow, rings.length);
      rings.forEach((ring, i) => {
        instanceObject.position.set(...ring.p);
        instanceObject.rotation.set(Math.PI / 2, 0, 0);
        instanceObject.scale.set(...ring.s);
        instanceObject.updateMatrix();
        ringMesh.setMatrixAt(i, instanceObject.matrix);
      });
      ringMesh.computeBoundingSphere();
      scene.add(ringMesh);
    }
  }

  // ---------------- Props: trees, lamps, benches, cars ----------------
  const centreBenches = [], centreBushes = [];
  for (let i = 0; i < 12; i++) {
    const angle = ((i + 0.5) / 12) * Math.PI * 2;
    // Keep the spokes towards each bridge clear.
    if (bridgeAngles.some((bridge) => Math.abs(Math.atan2(Math.sin(angle - bridge), Math.cos(angle - bridge))) < 0.22)) continue;
    centreBenches.push({ p: [Math.sin(angle) * 37.6, 0.0, Math.cos(angle) * 37.6], r: angle + Math.PI });
    centreBushes.push({ p: [Math.sin(angle) * 44, -0.04, Math.cos(angle) * 44], r: angle });
  }
  const trees = [
    ...plan.props.trees.map((tree) => ({ p: [tree.p.x, -0.04, tree.p.z], scale: tree.scale })),
    ...lotTrees,
    ...centreBushes.map((bush, i) => ({ p: [Math.sin(i * 1.7 + 0.4) * 47.5, -0.04, Math.cos(i * 1.7 + 0.4) * 47.5], scale: 0.9 })),
  ];
  const lamps = plan.props.lamps.map((lamp) => ({ p: [lamp.p.x, 0.0, lamp.p.z], r: lamp.r }));
  const fallbackTrees = instances("box", 0x605b4a, trees.map((tree) => ({ p: [tree.p[0], tree.p[1] + 1.1 * tree.scale, tree.p[2]], s: [0.22, 2.2 * tree.scale, 0.22] })));
  const fallbackCrowns = instances("sphere", 0x7caa94, trees.map((tree) => ({ p: [tree.p[0], tree.p[1] + 2.9 * tree.scale, tree.p[2]], s: [1.3 * tree.scale, 1.6 * tree.scale, 1.3 * tree.scale] })));
  const fallbackLamps = instances("box", COLORS.ink, lamps.map((lamp) => ({ p: [lamp.p[0], 1.6, lamp.p[2]], s: [0.12, 3.2, 0.12] })));
  const fallbackLampHeads = instances("box", 0xf2d6a8, lamps.map((lamp) => ({ p: [lamp.p[0], 3.3, lamp.p[2]], s: [0.43, 0.3, 0.43] })), "glow");
  cityResources.decorate({
    trees,
    lamps,
    benches: [...plan.props.benches.map((bench) => ({ p: [bench.p.x, 0.02, bench.p.z], r: bench.r })), ...centreBenches],
    bushes: centreBushes,
    bins: plan.props.benches.map((bench) => ({ p: [bench.p.x + Math.cos(bench.r) * 2.4, 0.02, bench.p.z - Math.sin(bench.r) * 2.4], r: bench.r })),
    cars: plan.props.cars.map((car) => ({ p: [car.p.x, 0.14, car.p.z], r: car.r })),
    fallbackTrees,
    fallbackCrowns,
    fallbackLamps,
    fallbackLampHeads,
  });

  // A shared soft contact shade anchors buildings and trees outside the sun's shadow.
  const shadowTexture = canvasTexture(96, 96, (ctx) => {
    const gradient = ctx.createRadialGradient(48, 48, 4, 48, 48, 48);
    gradient.addColorStop(0, "rgba(255,255,255,.82)");
    gradient.addColorStop(0.4, "rgba(255,255,255,.5)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 96, 96);
  });
  const contactMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture, color: 0x172619, opacity: 0.27,
    transparent: true, depthWrite: false, alphaTest: 0.002,
    polygonOffset: true, polygonOffsetFactor: -1,
  });
  resources.materials.add(contactMaterial);
  const contactGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  resources.geometries.add(contactGeometry);
  const contactTransforms = [
    ...lots.filter((lot) => lot.project).map((lot) => ({ p: [lot.position.x, 0.453, lot.position.z], s: [13.5, 1, 11.5], r: lot.angle })),
    ...trees.map((tree) => ({ p: [tree.p[0], tree.p[1] + 0.035, tree.p[2]], s: [2.5 * tree.scale, 1, 2.5 * tree.scale] })),
  ];
  const contactShadows = instances(contactGeometry, 0, contactTransforms, "glow", contactMaterial);
  contactShadows.castShadow = contactShadows.receiveShadow = false;
  contactShadows.renderOrder = 1;

  // ---------------- The player's cube ----------------
  const player = new THREE.Group();
  scene.add(player);
  const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0xb9f4e0, roughness: 0.24, metalness: 0.22, emissive: 0x245a57, emissiveIntensity: 0.35 });
  resources.materials.add(cubeMaterial);
  const cube = new THREE.Mesh(geometry("box"), cubeMaterial);
  cube.scale.set(1.35, 1.35, 1.35);
  cube.castShadow = true;
  player.add(cube);
  const edgeGeometry = new THREE.EdgesGeometry(geometry("box"));
  resources.geometries.add(edgeGeometry);
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xe3fff2, transparent: true, opacity: 0.95 });
  resources.materials.add(edgeMaterial);
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.scale.set(1.38, 1.38, 1.38);
  player.add(edges);
  for (const x of [-0.25, 0.25]) {
    const eye = new THREE.Mesh(geometry("box"), mat(0x17374a));
    eye.position.set(x, 0.1, -0.69);
    eye.scale.set(0.13, 0.16, 0.04);
    player.add(eye);
  }
  const halo = mesh(player, "ring", COLORS.mint, [0, -0.82, 0], [1.25, 1.25, 1.25], "glow");
  halo.rotation.x = Math.PI / 2;
  const playerShadowGeometry = new THREE.PlaneGeometry(3.1, 3.1).rotateX(-Math.PI / 2);
  resources.geometries.add(playerShadowGeometry);
  const playerShadow = new THREE.Mesh(playerShadowGeometry, contactMaterial.clone());
  playerShadow.position.set(SPAWN.x, 0.15, SPAWN.z);
  playerShadow.renderOrder = 1;
  scene.add(playerShadow);
  resources.materials.add(playerShadow.material);
  // The soft shadow lands on whatever is underneath: lawn, street, bridge, roof or sea.
  const groundMeshes = [];
  scene.traverse((object) => {
    if ((object.isMesh || object.isInstancedMesh) && !object.isSkinnedMesh && object !== playerShadow && object.material !== contactMaterial && !object.parent?.isGroup)
      groundMeshes.push(object);
  });
  for (const object of scenery.group.children) if (object.isMesh) groundMeshes.push(object);
  const groundRay = new THREE.Raycaster();
  groundRay.far = 120;
  const down = new THREE.Vector3(0, -1, 0), rayOrigin = new THREE.Vector3();
  let lastGround = { x: NaN, z: NaN, y: plan.waterLevel };
  function groundBelow(x, z, y) {
    if (Math.abs(x - lastGround.x) < 0.15 && Math.abs(z - lastGround.z) < 0.15) return lastGround.y;
    rayOrigin.set(x, y + 0.2, z);
    groundRay.set(rayOrigin, down);
    const hit = groundRay.intersectObjects(groundMeshes, false).find((item) => item.object.visible);
    lastGround = { x, z, y: hit ? hit.point.y : plan.waterLevel };
    return lastGround.y;
  }

  // ---------------- Model loading ----------------
  const loader = configureModelLoader(new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), renderer);
  // Exteriors are light (LOD1 is ~10k triangles), so the whole skyline streams
  // in nearest-first instead of only the few lots beside the cube.
  const MAX_LOADS = 3;
  let exteriorCount = 0,
    showcaseLoads = 0;
  const mixers = new Set();
  let loadingCount = 0,
    disposed = false,
    paused = false,
    visible = true,
    ready = false,
    rendering = false,
    frame = 0,
    lastTime = performance.now(),
    time = 0,
    lastStatus = 0,
    lastNearby = "",
    currentDistrict = null,
    selectedId = null;
  let lastShadow = new THREE.Vector3(SPAWN.x, 0, SPAWN.z);
  let allowedIds = null;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const projected = new THREE.Vector3(),
    tempVector = new THREE.Vector3();
  const zeroInput = { forward: 0, strafe: 0, rise: 0, boost: false };

  function trackModel(root) {
    root.traverse((object) => {
      if (object.geometry) resources.geometries.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials.filter(Boolean)) {
        resources.materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.textures.add(value);
      }
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }
  function fitModel(root, width = 13.8, height = 19) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root),
      size = box.getSize(new THREE.Vector3());
    const scale = Math.min(width / Math.max(size.x, 0.01), width / Math.max(size.z, 0.01), height / Math.max(size.y, 0.01));
    const wrapper = new THREE.Group();
    root.scale.multiplyScalar(scale);
    root.position.sub(new THREE.Vector3(((box.min.x + box.max.x) * scale) / 2, box.min.y * scale, ((box.min.z + box.max.z) * scale) / 2));
    wrapper.add(root);
    return wrapper;
  }
  /** Compile shaders and upload textures before the model appears, one at a time. */
  async function prepare(object) {
    object.traverse((part) => {
      for (const material of [part.material].flat().filter(Boolean))
        for (const value of Object.values(material)) if (value?.isTexture) renderer.initTexture(value);
    });
    try {
      await renderer.compileAsync(object, camera, scene);
    } catch {
      /* Rendering compiles anything left over. */
    }
  }
  async function loadModel(entry, high = false) {
    const source = high ? entry.lot.project?.exterior?.highModel : cityBuildingSource(entry.lot.project);
    if (!source || disposed || (high ? entry.highLoading || entry.high : entry.loading || entry.model) || loadingCount >= MAX_LOADS) return;
    if (high) entry.highLoading = true;
    else entry.loading = true;
    loadingCount++;
    try {
      const gltf = await loader.loadAsync(new URL(source, document.baseURI).href);
      trackModel(gltf.scene);
      if (disposed) return;
      const fitted = fitModel(gltf.scene);
      await prepare(fitted);
      if (disposed) return;
      entry.group.add(fitted);
      if (high) {
        entry.high = fitted;
        if (entry.model) entry.model.visible = false;
      } else {
        entry.model = fitted;
        if (entry.high) fitted.visible = false;
      }
      if (entry.fallback) entry.fallback.visible = false;
      if (!high) {
        rebuildSolids(entry);
        canvas.dataset.exteriors = String(++exteriorCount);
      }
      if (high && gltf.animations.length) {
        entry.mixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach((clip) => entry.mixer.clipAction(clip).play());
        mixers.add(entry.mixer);
      }
      renderer.shadowMap.needsUpdate = true;
      dirty = true;
    } catch (error) {
      console.info(`Lot ${entry.lot.project?.originalLot || entry.lot.id} model unavailable; keeping its stand-in.`, error.message);
    } finally {
      loadingCount--;
      if (!high) queueExteriors();
    }
  }
  async function loadShowcaseModel(entry) {
    if (disposed || entry.loading || entry.loaded) return;
    entry.loading = true;
    showcaseLoads++;
    try {
      const gltf = await loader.loadAsync(new URL(entry.model.file, document.baseURI).href);
      trackModel(gltf.scene);
      if (disposed) return;
      const { size, featured } = entry.pedestal;
      const fitted = fitModel(gltf.scene, size * 0.88, size * (featured ? 1.15 : 1.25));
      await prepare(fitted);
      if (disposed) return;
      entry.group.add(fitted);
      entry.placeholder.visible = false;
      entry.loaded = fitted;
      if (gltf.animations.length) {
        entry.mixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach((clip) => entry.mixer.clipAction(clip).play());
        mixers.add(entry.mixer);
      }
      canvas.dataset.showcaseLoaded = String(Number(canvas.dataset.showcaseLoaded || 0) + 1);
      renderer.shadowMap.needsUpdate = true;
      dirty = true;
    } catch (error) {
      console.info(`Showcase model ${entry.model.id} could not load; its pedestal keeps a placeholder.`, error.message);
    } finally {
      showcaseLoads--;
      queueShowcase();
    }
  }
  /** Nearby exteriors first; the rest of the skyline follows once the city has rendered. */
  function queueExteriors() {
    // Paused means a game or dialog is in front: leave the network and GPU to it.
    if (disposed || paused || loadingCount >= MAX_LOADS) return;
    [...entries.values()]
      .filter((entry) => (ready || entry.distance < 115) && cityBuildingSource(entry.lot.project) && !entry.model && !entry.loading)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_LOADS - loadingCount)
      .forEach((entry) => loadModel(entry));
  }
  /** Showcase models are heavier, so they load only as the cube approaches the island. */
  function queueShowcase() {
    if (disposed || paused || !ready || !plan.showcase || showcaseLoads >= 2) return;
    const centre = plan.showcase.frame.center;
    if (Math.hypot(playerState.position.x - centre.x, playerState.position.z - centre.z) > SHOWCASE_RANGE) return;
    [...pedestals.values()]
      .filter((entry) => !entry.loaded && !entry.loading && !(entry.model.bytes > SHOWCASE_AUTOLOAD_BYTES))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2 - showcaseLoads)
      .forEach((entry) => loadShowcaseModel(entry));
  }
  function districtAt(position) {
    return getDistrictAtPosition(position, city);
  }
  function updateStatus(now) {
    let nearest = null,
      best = Infinity;
    const { x: px, y: py, z: pz } = playerState.position;
    for (const entry of entries.values()) {
      entry.distance = Math.hypot(px - entry.lot.position.x, pz - entry.lot.position.z);
      const distance = Math.hypot(entry.distance, (py - 2) * 0.3);
      if (distance < best) {
        best = distance;
        nearest = entry;
      }
    }
    for (const entry of pedestals.values()) {
      entry.distance = Math.hypot(px - entry.pedestal.position.x, pz - entry.pedestal.position.z);
      // A pedestal is "near" from closer in than a whole lot, in proportion to its size.
      const distance = Math.hypot(entry.distance * (13 / (entry.pedestal.size + 5)), (py - 3) * 0.3);
      if (distance < best) {
        best = distance;
        nearest = entry;
      }
    }
    const nearby = best < 13 ? nearest : null;
    for (const entry of entries.values())
      if (entry.high) {
        const close = entry === nearest && entry.distance < 30;
        if (entry.high.visible !== close) dirty = true;
        entry.high.visible = close;
        if (entry.model) entry.model.visible = !close;
      }
    const nearbyKey = nearby ? (nearby.kind === "model" ? `model:${nearby.model.id}` : nearby.lot.slotId) : "";
    if (nearbyKey !== lastNearby) {
      lastNearby = nearbyKey;
      onNearby?.(
        !nearby
          ? null
          : nearby.kind === "model"
            ? { kind: "model", id: nearby.model.id, model: nearby.model, displayNumber: nearby.number, title: nearby.model.title, district: "showcase", distance: best }
            : { ...nearby.lot, kind: "lot", distance: best },
      );
      dirty = true;
    }
    const newDistrict = districtAt(playerState.position);
    if (now - lastStatus > 100 || newDistrict !== currentDistrict) {
      currentDistrict = newDistrict;
      lastStatus = now;
      onLocation?.({
        position: { ...playerState.position },
        district: currentDistrict,
        slotId: nearby?.kind === "lot" ? nearbyKey : null,
        heading: playerState.heading,
        view: Math.atan2(controls.target.x - camera.position.x, controls.target.z - camera.position.z),
      });
    }
    queueExteriors();
    queueShowcase();
    if (nearest?.kind === "lot" && nearest.distance < 27 && nearest.lot.project?.exterior?.highModel && !nearest.high && !nearest.highLoading && nearest.model)
      loadModel(nearest, true);
  }
  function placeLabel(button, point, show, width, height, selected = false) {
    if (show) {
      projected.set(point.x, point.y, point.z).project(camera);
      show = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1.08 && Math.abs(projected.y) < 1.08;
    }
    button.hidden = !show;
    if (!show) return;
    button.style.transform = `translate(-50%,-50%) translate(${(projected.x * 0.5 + 0.5) * width}px,${(-projected.y * 0.5 + 0.5) * height}px)`;
    button.style.zIndex = String(10 + Math.round((1 - projected.z) * 100));
    button.classList.toggle("selected", selected);
  }
  function updateLabels() {
    // Read layout once: interleaving reads with the style writes below forces a reflow per label.
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    for (const entry of entries.values()) {
      const matches = !allowedIds || !entry.lot.project || allowedIds.has(entry.lot.project.id);
      const selected = selectedId === entry.lot.id || selectedId === entry.lot.slotId;
      // Open lots only announce themselves up close, so built places stay readable.
      const range = entry.lot.project ? 65 : 24;
      placeLabel(entry.button, entry.labelAt, matches && (entry.distance < range || selected), width, height, selected);
    }
    for (const entry of pedestals.values())
      placeLabel(entry.button, entry.labelAt, entry.distance < (entry.pedestal.featured ? 60 : 22) || selectedId === `model:${entry.model.id}`, width, height, selectedId === `model:${entry.model.id}`);
  }
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1), false);
    camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    camera.updateProjectionMatrix();
    dirty = true;
    start();
  }
  const DEFAULT_BOUNDS = { radius: 340, floor: 1.6, ceiling: 70 };
  const smoothing = (rate, dt) => 1 - Math.exp(-rate * dt);
  const shortestTurn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  // The orbit keeps its chosen distance; only the rendered camera is pulled in
  // when a wall would come between it and the cube.
  const orbitPosition = new THREE.Vector3(),
    cameraOffset = new THREE.Vector3(),
    cameraLift = new THREE.Vector3(0, 1, 0),
    sideTarget = new THREE.Vector3();
  let cameraReach = 1,
    squash = 0;
  function clearCamera(dt) {
    cameraOffset.copy(camera.position).sub(controls.target);
    const distance = cameraOffset.length();
    if (distance < 0.01) return false;
    const clear = solids.clearFraction(controls.target, camera.position, 0.45);
    const allowed = clear >= 1 ? 1 : Math.min(1, Math.max(2.4 / distance, clear - 0.6 / distance));
    if (allowed < cameraReach || reducedMotion.matches) cameraReach = allowed;
    else cameraReach += (allowed - cameraReach) * smoothing(4, dt);
    camera.position.copy(controls.target).addScaledVector(cameraOffset, cameraReach);
    return Math.abs(allowed - cameraReach) > 0.002;
  }
  /** Pick the least-obstructed view of the cube, preferring the given angle. */
  function frameCamera({ yaw = 0.42, elevation = 0.45, distance = 23 } = {}) {
    let best = null;
    for (const d of [distance, distance * 0.7])
      for (const turn of [0, -0.84, 0.5, -1.3, 1.1, -Math.PI / 2, Math.PI / 2])
        for (const lift of [0, 0.15, 0.3, 0.45, 0.6, 0.75]) {
          const y = yaw + turn, e = Math.min(1.3, elevation + lift);
          cameraOffset.set(Math.sin(y) * Math.cos(e), Math.sin(e), Math.cos(y) * Math.cos(e)).multiplyScalar(d);
          orbitPosition.copy(controls.target).add(cameraOffset);
          const clear = solids.clearFraction(controls.target, orbitPosition, 0.45);
          // Also look towards the corners of the frame, so a neighbour does not fill it.
          let corners = 0;
          for (const side of [-1, 1])
            for (const height of [-1, 1]) {
              sideTarget.set(Math.cos(y) * side, 0, -Math.sin(y) * side).multiplyScalar(d * 0.28).add(controls.target);
              sideTarget.y = Math.max(1, sideTarget.y + height * d * 0.16);
              corners += solids.clearFraction(sideTarget, orbitPosition, 0.45);
            }
          const cost = (1 - clear) * 10 + (4 - corners) * 1.2 + Math.abs(turn) * 0.8 + lift + (d < distance ? 0.9 : 0);
          if (!best || cost < best.cost) best = { cost, position: orbitPosition.clone() };
        }
    camera.position.copy(best.position);
    cameraReach = 1;
  }
  let warmedUp = false;
  let readyAt = 0,
    frameCost = 1 / 60,
    qualityChanged = 0,
    qualityCeiling = maxPixelRatio;
  /** Trade resolution for a steady frame rate, recovering slowly when there is headroom. */
  function adaptQuality(now, dt) {
    if (reducedMotion.matches || !ready || dt <= 0 || now - readyAt < 3000) return;
    // Clamp single hitches (shader compiles, downloads) so only sustained cost counts.
    frameCost += (Math.min(dt, 0.1) - frameCost) * 0.06;
    if (now - qualityChanged < 2000) return;
    let next = pixelRatio;
    if (frameCost > 1 / 40 && pixelRatio > minPixelRatio) {
      qualityCeiling = Math.max(minPixelRatio, pixelRatio - 0.125);
      next = Math.max(minPixelRatio, pixelRatio - 0.25);
    } else if (frameCost < 1 / 57 && now - qualityChanged > 6000) {
      if (pixelRatio >= qualityCeiling && now - qualityChanged > 20000)
        qualityCeiling = Math.min(maxPixelRatio, qualityCeiling + 0.125);
      next = Math.min(qualityCeiling, pixelRatio + 0.125);
    }
    if (next === pixelRatio) return;
    pixelRatio = next;
    qualityChanged = now;
    frameCost = 1 / 50;
    renderer.setPixelRatio(pixelRatio);
    canvas.dataset.pixelRatio = pixelRatio.toFixed(3);
    dirty = true;
  }
  function tick(now) {
    frame = 0;
    if (disposed || paused || document.hidden || !visible) return;
    rendering = true;
    const dt = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    const input = flightInput?.getState?.() || zeroInput;
    const before = { ...playerState.position };
    const wasGrounded = playerState.grounded,
      fallSpeed = playerState.velocity.y;
    const yaw = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    // Retain real movement speed on slower devices using bounded physics steps.
    for (let remaining = dt; remaining > 0; remaining -= 0.05)
      stepFlight(playerState, input, Math.min(0.05, remaining), yaw, city.bounds || DEFAULT_BOUNDS, solids);
    tempVector.set(playerState.position.x - before.x, playerState.position.y - before.y, playerState.position.z - before.z);
    const moved = tempVector.lengthSq() > 0.000001;
    if (moved) {
      camera.position.add(tempVector);
      controls.target.add(tempVector);
      dirty = true;
    }
    player.position.set(playerState.position.x, playerState.position.y, playerState.position.z);
    const speed = Math.hypot(playerState.velocity.x, playerState.velocity.z);
    if (moved) {
      // Turn the short way round, lean into travel and bank into turns.
      const turn = shortestTurn(player.rotation.y, playerState.heading || 0) * smoothing(9, dt);
      player.rotation.y += turn;
      const bank = THREE.MathUtils.clamp(-(turn / Math.max(dt, 1e-3)) * 0.09, -0.32, 0.32);
      cube.rotation.x += (Math.min(speed / 42, 1) * 0.16 - cube.rotation.x) * smoothing(7, dt);
      cube.rotation.z += (bank - cube.rotation.z) * smoothing(6, dt);
    } else {
      cube.rotation.x *= 1 - smoothing(6, dt);
      cube.rotation.z *= 1 - smoothing(6, dt);
    }
    if (!wasGrounded && playerState.grounded && fallSpeed < -6 && !reducedMotion.matches)
      squash = Math.min(0.2, -fallSpeed / 130);
    if (squash > 0.001) {
      squash *= 1 - smoothing(8, dt);
      player.scale.set(1 + squash * 0.5, 1 - squash, 1 + squash * 0.5);
      dirty = true;
    } else if (squash) {
      squash = 0;
      player.scale.setScalar(1);
    }
    if (!reducedMotion.matches) {
      const fov = 54 + THREE.MathUtils.clamp((speed - 22) / 18, 0, 1) * 7;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov += (fov - camera.fov) * smoothing(5, dt);
        camera.updateProjectionMatrix();
        dirty = true;
      }
    }
    // On a roof the soft shadow sits on the roof; over the bay it sits on the water.
    const surface = Math.max(groundBelow(player.position.x, player.position.z, player.position.y), solids.heightAt(player.position.x, player.position.z)) + 0.02;
    const hover = player.position.y - surface;
    playerShadow.position.set(player.position.x, surface, player.position.z);
    playerShadow.material.opacity = Math.max(0.025, 0.33 - hover * 0.007);
    playerShadow.scale.setScalar(Math.max(0.4, 1 - (hover - 1.5) * 0.01));
    const controlsMoved = controls.update();
    dirty ||= controlsMoved;
    if (moved || now - lastStatus > 100) updateStatus(now);
    if (!reducedMotion.matches) {
      time += dt;
      visuals.update(time, false);
      scenery.update(time);
      for (const entry of entries.values()) if (entry.mixer && entry.high?.visible) entry.mixer.update(dt);
      for (const entry of pedestals.values()) {
        if (entry.loaded) entry.loaded.rotation.y += dt * (entry.pedestal.featured ? 0.16 : 0.3);
        else entry.placeholder.rotation.y += dt * 0.6;
        if (entry.mixer && entry.distance < 60) entry.mixer.update(dt);
      }
      dirty = true;
    }
    if (player.position.distanceToSquared(lastShadow) > 144) {
      lastShadow.copy(player.position);
      sun.target.position.set(player.position.x, 0, player.position.z);
      sun.position.copy(sun.target.position).add(sunDirection);
      renderer.shadowMap.needsUpdate = true;
    }
    if (dirty) {
      orbitPosition.copy(camera.position);
      const easing = clearCamera(dt);
      renderer.render(scene, camera);
      updateLabels();
      camera.position.copy(orbitPosition);
      dirty = easing;
      if (!ready) {
        ready = true;
        readyAt = now;
        canvas.dataset.ready = "true";
        onReady?.();
        updateStatus(now);
      }
    }
    adaptQuality(now, dt);
    rendering = false;
    frame = requestAnimationFrame(tick);
  }
  function start() {
    if (!disposed && !paused && !document.hidden && visible && !frame && !rendering) {
      lastTime = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  const controlChange = () => {
    dirty = true;
    start();
  };
  controls.addEventListener("change", controlChange);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement || canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) {
      resize();
      start();
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  });
  intersection.observe(canvas);
  const visibilityChange = () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else start();
  };
  document.addEventListener("visibilitychange", visibilityChange);
  const motionChange = () => {
    dirty = true;
    start();
  };
  reducedMotion.addEventListener("change", motionChange);

  // Selection resolves the ground tile (or pedestal) even when a complex model stands on it.
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    groundHit = new THREE.Vector3();
  const activePointers = new Set();
  let downPoint = null;
  const pointerDown = (event) => {
    activePointers.add(event.pointerId);
    downPoint = activePointers.size === 1 ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
  };
  const pointerUp = (event) => {
    activePointers.delete(event.pointerId);
    if (!downPoint || event.pointerId !== downPoint.id || Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y) > 6) {
      downPoint = null;
      return;
    }
    downPoint = null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, (-(event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(groundPlane, groundHit)) return;
    for (const entry of pedestals.values())
      if (Math.hypot(entry.pedestal.position.x - groundHit.x, entry.pedestal.position.z - groundHit.z) < entry.pedestal.size * 0.6 + 0.6)
        return onSelectModel?.(entry.model);
    for (const entry of entries.values()) {
      const local = { x: groundHit.x - entry.lot.position.x, z: groundHit.z - entry.lot.position.z };
      const across = local.x * entry.lot.forward.z - local.z * entry.lot.forward.x,
        along = local.x * entry.lot.forward.x + local.z * entry.lot.forward.z;
      if (Math.abs(across) < 7.7 && Math.abs(along) < 7.7) return onSelect?.(entry.lot.project?.id || entry.lot.slotId);
    }
  };
  const pointerCancel = (event) => {
    activePointers.delete(event.pointerId);
    downPoint = null;
  };
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerCancel);

  function teleport(position, selected = null, view) {
    Object.assign(playerState.position, position);
    Object.assign(playerState.velocity, { x: 0, y: 0, z: 0 });
    // Settle onto whatever is underneath (a roof, a ledge) before framing the shot.
    stepFlight(playerState, zeroInput, 1e-4, 0, city.bounds || DEFAULT_BOUNDS, solids);
    playerPosition.set(playerState.position.x, playerState.position.y, playerState.position.z);
    player.position.copy(playerPosition);
    controls.target.copy(playerPosition).add(cameraLift);
    frameCamera(view);
    selectedId = selected;
    dirty = true;
    renderer.shadowMap.needsUpdate = true;
    updateStatus(performance.now());
    start();
  }
  /** Stand at a lot's entrance with the camera out over its street. */
  function visitLot(entry) {
    const { lot } = entry;
    teleport({ x: lot.entrance.x, y: 2.2, z: lot.entrance.z }, lot.id, { yaw: Math.atan2(lot.forward.x, lot.forward.z) + 0.42 });
  }
  function visitShowcase(entry) {
    const area = plan.showcase;
    if (entry) {
      const { pedestal } = entry;
      const reach = pedestal.size * 0.5 + 4.5;
      const facing = { x: Math.sin(pedestal.angle), z: Math.cos(pedestal.angle) };
      teleport(
        { x: pedestal.position.x + facing.x * reach, y: 2.4, z: pedestal.position.z + facing.z * reach },
        `model:${entry.model.id}`,
        { yaw: pedestal.angle + 0.35, elevation: 0.32, distance: 15 + pedestal.size },
      );
    } else {
      const gate = area.frame.toWorld(0, area.radius - 4);
      teleport({ x: gate.x, y: 2.4, z: gate.z }, null, { yaw: area.frame.angle, elevation: 0.42, distance: 24 });
    }
  }
  resize();
  updateStatus(performance.now());
  start();
  return {
    focusProject(id) {
      const entry = [...entries.values()].find((item) => item.lot.project?.id === id || item.lot.slotId === id);
      if (entry) visitLot(entry);
    },
    teleportLot(slotId) {
      const entry = entries.get(slotId);
      if (entry) visitLot(entry);
    },
    focusModel(id) {
      const entry = pedestals.get(id);
      if (entry) visitShowcase(entry);
      else if (plan.showcase) visitShowcase(null);
    },
    teleportDistrict(id) {
      if (id === "showcase") {
        if (plan.showcase) visitShowcase(null);
        return;
      }
      const island = plan.islands.find((item) => item.district.id === id);
      if (!island) return;
      const first = [...entries.values()].find((entry) => entry.lot.district === id && entry.lot.project);
      if (first) visitLot(first);
      else {
        const gate = island.frame.toWorld(0, island.front - 4);
        teleport({ x: gate.x, y: 3, z: gate.z }, null, { yaw: island.frame.angle, elevation: 0.5, distance: 26 });
      }
    },
    getPlayerPosition() {
      return { ...playerState.position };
    },
    setVisible(ids) {
      allowedIds = ids ? new Set(ids) : null;
      dirty = true;
      start();
    },
    reset() {
      teleport({ ...SPAWN }, null, SPAWN_VIEW);
    },
    /** A picture of the current view, without the HTML interface. */
    capture() {
      return new Promise((resolve) => {
        orbitPosition.copy(camera.position);
        clearCamera(0);
        renderer.render(scene, camera);
        camera.position.copy(orbitPosition);
        canvas.toBlob((blob) => resolve(blob), "image/png");
      });
    },
    setPaused(value) {
      paused = Boolean(value);
      if (paused) {
        cancelAnimationFrame(frame);
        frame = 0;
        // Created behind a dialog: compile shaders now, so the first frame after it closes does not stall.
        if (!ready && !warmedUp) {
          warmedUp = true;
          renderer.compileAsync(scene, camera).catch(() => {});
        }
      } else {
        dirty = true;
        start();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibilityChange);
      reducedMotion.removeEventListener("change", motionChange);
      controls.removeEventListener("change", controlChange);
      controls.dispose();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerCancel);
      entries.forEach((entry) => entry.button.remove());
      pedestals.forEach((entry) => entry.button.remove());
      mixers.forEach((mixer) => mixer.stopAllAction());
      cityResources.dispose();
      visuals.dispose();
      scenery.dispose();
      resources.geometries.forEach((value) => value.dispose());
      resources.materials.forEach((value) => value.dispose());
      resources.textures.forEach((value) => value.dispose());
      environmentTarget.dispose();
      loader.dispose?.();
      renderer.dispose();
    },
  };
}
