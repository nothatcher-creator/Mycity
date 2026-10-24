import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { buildCityLots, getDistrictAtPosition } from "./city-layout.js";
import { createFlightState, stepFlight } from "./flight.js";
import { createCityVisuals } from "./city-visuals.js";

const COLORS = {
  ground: 0x536a64,
  stone: 0xc9d3ce,
  cream: 0xe5e2d2,
  road: 0x293b44,
  mint: 0x9ee7d2,
  gold: 0xe2bd79,
  ink: 0x233746,
  glass: 0x7bb7c8,
};

/** A flyable city. Every navigation/launch action also remains available as HTML. */
export function createWorld({
  canvas,
  labelsContainer,
  projects,
  city,
  flightInput,
  onSelect,
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
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x243b52);
  scene.fog = new THREE.FogExp2(0x6e98a3, 0.0035);
  const camera = new THREE.PerspectiveCamera(54, 1, 0.2, 900);
  const playerState = createFlightState({ x: 0, y: 2.2, z: 36 });
  const playerPosition = new THREE.Vector3(0, 2.2, 36);
  camera.position.set(17, 14, 60);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(playerPosition).add(new THREE.Vector3(0, 1, 0));
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 62;
  controls.minPolarAngle = 0.18;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.7;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "Fly your cube through Mycity. WASD or arrows move, Space rises, C descends, Shift boosts. Drag to look; E enters the nearest lot.",
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
              ? new THREE.CylinderGeometry(1, 1, 1, 12)
              : name === "cone"
                ? new THREE.ConeGeometry(1, 1, 12)
                : name === "ring"
                  ? new THREE.TorusGeometry(1, 0.045, 6, 48)
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
    parent.add(item);
    return item;
  }
  function instances(shape, color, transforms, kind = "standard") {
    const item = new THREE.InstancedMesh(
      geometry(shape),
      mat(color, kind),
      transforms.length,
    );
    const object = new THREE.Object3D();
    transforms.forEach((transform, index) => {
      object.position.set(...transform.p);
      object.scale.set(...transform.s);
      object.rotation.set(0, transform.r || 0, 0);
      object.updateMatrix();
      item.setMatrixAt(index, object.matrix);
      if (transform.c) item.setColorAt(index, new THREE.Color(transform.c));
    });
    item.castShadow = kind !== "glow";
    item.receiveShadow = true;
    item.instanceMatrix.needsUpdate = true;
    scene.add(item);
    return item;
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
    const image = document.createElement("canvas");
    image.width = 768;
    image.height = 160;
    const ctx = image.getContext("2d");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, image.width, image.height);
    ctx.strokeStyle = "rgba(190,235,222,.3)";
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, image.width - 4, image.height - 4);
    ctx.fillStyle = color;
    ctx.font = `600 ${font}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 384, 82, 730);
    const texture = new THREE.CanvasTexture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    resources.textures.add(texture);
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

  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environmentTarget = environmentGenerator.fromScene(room, 0.04);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 0.72;
  room.dispose();
  environmentGenerator.dispose();
  scene.add(new THREE.HemisphereLight(0xbfe4ef, 0x3d5353, 1.45));
  const sun = new THREE.DirectionalLight(0xffe1bd, 2.4);
  sun.position.set(35, 72, 61);
  sun.target.position.set(0, 0, 36);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    innerWidth < 760 ? 1024 : 2048,
    innerWidth < 760 ? 1024 : 2048,
  );
  Object.assign(sun.shadow.camera, {
    left: -56,
    right: 56,
    top: 56,
    bottom: -56,
    near: 10,
    far: 150,
  });
  sun.shadow.normalBias = 0.045;
  sun.shadow.bias = -0.00012;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x8fa7ff, 1.25);
  rim.position.set(-80, 28, -100);
  scene.add(rim);

  mesh(scene, "box", COLORS.ground, [0, -1.3, 0], [650, 2.2, 650]);
  const plazaSurface = mesh(
    scene,
    "cylinder",
    0xc8d5d0,
    [0, -0.06, 0],
    [43, 0.32, 43],
  );
  plazaSurface.castShadow = false;
  const visuals = createCityVisuals({ scene, city });
  const lots = buildCityLots(projects, city),
    entries = new Map();
  const tileTransforms = [],
    grassTransforms = [],
    stakeTransforms = [],
    lampBases = [],
    lampHeads = [],
    trunks = [],
    crowns = [],
    roads = [],
    pavements = [],
    lanes = [];
  const districtLookup = new Map(
    (city.districts || []).map((district) => [district.id, district]),
  );

  // Road segments use shared instanced geometry: large contiguous city, few draw calls.
  function road(x, z, width, depth) {
    pavements.push({ p: [x, -0.13, z], s: [width + 3, 0.3, depth + 3] });
    roads.push({ p: [x, 0.04, z], s: [width, 0.18, depth] });
    if (width > depth)
      lanes.push({ p: [x, 0.145, z], s: [width, 0.025, 0.12] });
    else lanes.push({ p: [x, 0.145, z], s: [0.12, 0.025, depth] });
  }
  for (const district of city.districts || []) {
    const [cx, cz] = district.center,
      columns = district.columns,
      rows = Math.ceil(district.slotCount / columns),
      spacing = district.spacing || 17;
    const width = columns * spacing + 6,
      depth = rows * spacing + 6;
    mesh(scene, "box", 0x84978a, [cx, -0.6, cz], [width, 0.85, depth]);
    road(cx, cz + depth / 2 + 4, width + 18, 7);
    road(cx, cz - depth / 2 - 4, width + 18, 7);
    road(cx - width / 2 - 4, cz, 7, depth + 15);
    road(cx + width / 2 + 4, cz, 7, depth + 15);
    for (let row = 1; row < rows; row++)
      road(cx, cz + (row - rows / 2) * spacing, width, 2.8);
    for (let col = 1; col < columns; col++)
      road(cx + (col - columns / 2) * spacing, cz, 2.8, depth);
    // The neighborhood's front avenue joins the central ring through an L route.
    const entranceZ = cz + depth / 2 + 4;
    if (Math.abs(cx) > 30) {
      road(cx / 2, Math.sign(entranceZ) * 43, Math.abs(cx) + 9, 7);
      road(
        cx,
        (entranceZ + Math.sign(entranceZ) * 43) / 2,
        7,
        Math.abs(entranceZ - Math.sign(entranceZ) * 43) + 5,
      );
    } else road(cx, (entranceZ + 43) / 2, 8, Math.abs(entranceZ - 43) + 4);
    const signGroup = new THREE.Group();
    signGroup.position.set(cx, 0, entranceZ + 6);
    scene.add(signGroup);
    mesh(signGroup, "box", COLORS.ink, [-7.1, 2.6, 0], [0.25, 5.3, 0.3]);
    mesh(signGroup, "box", COLORS.ink, [7.1, 2.6, 0], [0.25, 5.3, 0.3]);
    const sign = textPlane(district.name.toUpperCase(), {
      width: 14,
      height: 2.2,
      font: 40,
      color: district.color || "#b3e6d5",
    });
    sign.position.set(0, 5.6, 0);
    signGroup.add(sign);
    mesh(
      signGroup,
      "box",
      district.color || COLORS.mint,
      [0, 4.35, 0],
      [14.6, 0.08, 0.18],
      "glow",
    );
    for (let i = 0; i < columns + 1; i++) {
      const tx = cx + (i - columns / 2) * spacing;
      trunks.push({ p: [tx, 1.05, cz + depth / 2 + 9], s: [0.24, 2.1, 0.24] });
      crowns.push({ p: [tx, 3.1, cz + depth / 2 + 9], s: [1.5, 1.8, 1.5] });
    }
  }
  // Keep the centerpiece's pedestrian avenues wide and readable at cube height.
  road(0, 0, 95, 8);
  road(0, 0, 8, 95);

  function fallbackBuilding(project, parent) {
    const group = new THREE.Group();
    parent.add(group);
    const color = districtLookup.get(project.district)?.color || "#9cd9ca";
    if (project.theme === "forge") {
      mesh(group, "cylinder", COLORS.cream, [0, 0.5, 0], [4.4, 1, 4.4]);
      mesh(
        group,
        "cylinder",
        COLORS.glass,
        [0, 3.2, 0],
        [3.8, 4.6, 3.8],
        "glass",
      );
      mesh(group, "cylinder", COLORS.cream, [0, 5.65, 0], [4.1, 0.45, 4.1]);
      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        mesh(
          group,
          "box",
          COLORS.cream,
          [Math.sin(angle) * 3.8, 3.2, Math.cos(angle) * 3.8],
          [0.35, 5, 0.35],
        );
      }
      const ring = mesh(
        group,
        "ring",
        color,
        [0, 8.1, 0],
        [2.7, 2.7, 2.7],
        "glow",
      );
      ring.rotation.y = 0.35;
      ring.rotation.x = 0.5;
      mesh(group, "sphere", 0xd4efd4, [0, 8.1, 0], [1.2, 1.2, 1.2], "glow");
    } else if (project.theme === "cards") {
      mesh(group, "box", COLORS.cream, [0, 2.3, 0], [9, 4.6, 7]);
      mesh(group, "box", COLORS.ink, [0, 4.75, 0], [10, 0.45, 8]);
      for (let i = 0; i < 3; i++) {
        const card = mesh(
          group,
          "box",
          i === 1 ? COLORS.gold : COLORS.cream,
          [(i - 1) * 2.1, 6.5, 0],
          [1.9, 2.8, 0.22],
        );
        card.rotation.z = (i - 1) * -0.16;
      }
    } else if (project.theme === "gallery" || project.district === "art") {
      mesh(group, "box", COLORS.cream, [0, 0.45, 0], [11, 0.9, 9]);
      mesh(group, "box", COLORS.glass, [0, 2.8, 0], [9.5, 4, 7.5], "glass");
      mesh(group, "box", COLORS.cream, [0, 5, 0], [11.5, 0.5, 9.5]);
      for (let i = 0; i < 3; i++) {
        const panel = mesh(
          group,
          "box",
          i === 0 ? 0xd8a0bc : i === 1 ? 0x91b6db : 0xe2c77d,
          [(i - 1) * 2.9, 3.1, 3.85],
          [2.2, 3, 0.16],
        );
        panel.rotation.z = (i - 1) * -0.07;
      }
    } else if (project.theme === "nexus" || project.district === "mods") {
      mesh(group, "box", COLORS.cream, [0, 1.9, 0], [10, 3.8, 8]);
      mesh(group, "box", COLORS.ink, [0, 4, 0], [11, 0.6, 9]);
      const gear = mesh(
        group,
        "ring",
        COLORS.gold,
        [0, 6.4, 0],
        [2.1, 2.1, 2.1],
        "glow",
      );
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const tooth = mesh(
          group,
          "box",
          COLORS.gold,
          [Math.sin(angle) * 2.5, 6.4 + Math.cos(angle) * 2.5, 0],
          [0.65, 0.7, 0.5],
        );
        tooth.rotation.z = -angle;
      }
      gear.rotation.y = 0.2;
    } else if (project.originalLot) {
      mesh(group, "box", COLORS.ink, [0, 0.35, 0], [9.5, 0.7, 9.5]);
      const beacon = mesh(
        group,
        "box",
        color,
        [0, 2.5, 0],
        [2.2, 4.2, 2.2],
        "glow",
      );
      beacon.rotation.y = Math.PI / 4;
    } else {
      mesh(group, "box", COLORS.cream, [0, 2.25, 0], [10, 4.5, 8]);
      mesh(group, "box", COLORS.ink, [0, 4.65, 0], [11, 0.45, 9]);
      mesh(
        group,
        "box",
        COLORS.glass,
        [0, 2.4, 4.06],
        [8.7, 3.2, 0.1],
        "glass",
      );
      const ring = mesh(
        group,
        "ring",
        color,
        [0, 7, 0],
        [1.7, 1.7, 1.7],
        "glow",
      );
      ring.rotation.y = 0.2;
      mesh(group, "sphere", color, [0, 7, 0], [0.4, 0.4, 0.4], "glow");
    }
    return group;
  }

  for (const lot of lots) {
    const { x, z } = lot.position,
      project = lot.project,
      district = districtLookup.get(lot.district),
      color = district?.color || "#a0d7c7";
    tileTransforms.push({
      p: [x, 0.05, z],
      s: [15.4, 0.5, 15.4],
      c: project ? "#a5b5af" : "#728e7b",
    });
    grassTransforms.push({
      p: [x, 0.35, z],
      s: [14.7, 0.18, 14.7],
      c: project ? "#91aa97" : "#789f80",
    });
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        stakeTransforms.push({
          p: [x + sx * 7.2, 0.9, z + sz * 7.2],
          s: [0.16, 1.15, 0.16],
          c: color,
        });
    // Two garden trees per lot are batched for the entire city.
    for (const side of [-1, 1]) {
      trunks.push({ p: [x + side * 5.9, 1.1, z - 5.7], s: [0.2, 1.5, 0.2] });
      crowns.push({
        p: [x + side * 5.9, 2.55, z - 5.7],
        s: [1.12, 1.45, 1.12],
        c: lot.district === "art" ? "#a89eb3" : "#749f91",
      });
    }
    lampBases.push({ p: [x - 6.5, 1.8, z + 6.5], s: [0.12, 3.1, 0.12] });
    lampHeads.push({ p: [x - 6.5, 3.4, z + 6.5], s: [0.43, 0.3, 0.43] });
    const group = new THREE.Group();
    group.position.set(x, 0.45, z);
    scene.add(group);
    const fallback = project ? fallbackBuilding(project, group) : null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `plot-label${project ? "" : " open-lot"}`;
    button.dataset.project = project?.id || lot.slotId;
    button.dataset.slot = lot.slotId;
    button.setAttribute(
      "aria-label",
      project
        ? `Lot ${lot.displayNumber}: ${project.title}`
        : `Open lot ${lot.displayNumber} in ${district?.name || lot.district}`,
    );
    const number = document.createElement("span");
    number.className = "plot-label-number";
    number.textContent = lot.displayNumber;
    const title = document.createElement("strong");
    title.textContent = project?.title || "Open lot";
    button.append(number, title);
    button.hidden = true;
    button.addEventListener("click", () =>
      onSelect?.(project?.id || lot.slotId),
    );
    labelsContainer.append(button);
    const marker = mesh(
      group,
      "cylinder",
      color,
      [0, 0.08, 7.3],
      [0.6, 0.12, 0.6],
      "glow",
    );
    marker.castShadow = false;
    entries.set(lot.slotId, {
      lot,
      group,
      fallback,
      button,
      model: null,
      high: null,
      loading: false,
      highLoading: false,
      mixer: null,
      distance: Infinity,
    });
  }
  instances("box", COLORS.stone, tileTransforms);
  instances("box", 0x789f80, grassTransforms);
  instances("box", COLORS.mint, stakeTransforms, "glow");
  instances("box", COLORS.ink, lampBases);
  instances("box", 0xf2d6a8, lampHeads, "glow");
  instances("box", 0x605b4a, trunks);
  instances("sphere", 0x7caa94, crowns);
  instances("box", 0xadb8ad, pavements);
  instances("box", COLORS.road, roads);
  instances("box", 0xc7dcb8, lanes, "glow");

  const player = new THREE.Group();
  scene.add(player);
  const cubeMaterial = new THREE.MeshStandardMaterial({
    color: 0xb9f4e0,
    roughness: 0.24,
    metalness: 0.22,
    emissive: 0x245a57,
    emissiveIntensity: 0.35,
  });
  resources.materials.add(cubeMaterial);
  const cube = new THREE.Mesh(geometry("box"), cubeMaterial);
  cube.scale.set(1.35, 1.35, 1.35);
  cube.castShadow = true;
  player.add(cube);
  const edgeGeometry = new THREE.EdgesGeometry(geometry("box"));
  resources.geometries.add(edgeGeometry);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xe3fff2,
    transparent: true,
    opacity: 0.95,
  });
  resources.materials.add(edgeMaterial);
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.scale.set(1.38, 1.38, 1.38);
  player.add(edges);
  const eyeMaterial = mat(0x17374a),
    eyeGeometry = geometry("box");
  for (const x of [-0.25, 0.25]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(x, 0.1, -0.69);
    eye.scale.set(0.13, 0.16, 0.04);
    player.add(eye);
  }
  const halo = mesh(
    player,
    "ring",
    COLORS.mint,
    [0, -0.82, 0],
    [1.25, 1.25, 1.25],
    "glow",
  );
  halo.rotation.x = Math.PI / 2;
  const playerShadow = mesh(
    scene,
    "cylinder",
    0x304c4b,
    [0, 0.32, 36],
    [1.3, 0.015, 1.3],
  );
  playerShadow.material = new THREE.MeshBasicMaterial({
    color: 0x183537,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  resources.materials.add(playerShadow.material);

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const mixers = new Set(),
    loadedObjects = new Set();
  let loadingCount = 0,
    disposed = false,
    paused = false,
    visible = true,
    ready = false,
    dirty = true,
    rendering = false,
    frame = 0,
    lastTime = performance.now(),
    lastRendered = 0,
    time = 0,
    lastStatus = 0,
    lastNearby = "",
    currentDistrict = null,
    selectedId = null;
  let lastShadow = new THREE.Vector3(0, 0, 36);
  let allowedIds = null;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const projected = new THREE.Vector3(),
    tempVector = new THREE.Vector3();
  const zeroInput = { forward: 0, strafe: 0, rise: 0, boost: false };

  function trackModel(root) {
    root.traverse((object) => {
      if (object.geometry) resources.geometries.add(object.geometry);
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials.filter(Boolean)) {
        resources.materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) resources.textures.add(value);
      }
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }
  function fitModel(root) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root),
      size = box.getSize(new THREE.Vector3());
    const scale = Math.min(
      13.8 / Math.max(size.x, 0.01),
      13.8 / Math.max(size.z, 0.01),
      19 / Math.max(size.y, 0.01),
    );
    const wrapper = new THREE.Group();
    root.scale.multiplyScalar(scale);
    root.position.sub(
      new THREE.Vector3(
        ((box.min.x + box.max.x) * scale) / 2,
        box.min.y * scale,
        ((box.min.z + box.max.z) * scale) / 2,
      ),
    );
    wrapper.add(root);
    return wrapper;
  }
  async function loadModel(entry, high = false) {
    const source = high
      ? entry.lot.project?.exterior?.highModel
      : entry.lot.project?.exterior?.model;
    if (
      !source ||
      disposed ||
      (high ? entry.highLoading || entry.high : entry.loading || entry.model) ||
      loadingCount >= 2
    )
      return;
    if (high) entry.highLoading = true;
    else entry.loading = true;
    loadingCount++;
    try {
      const gltf = await loader.loadAsync(
        new URL(source, document.baseURI).href,
      );
      trackModel(gltf.scene);
      if (disposed) {
        return;
      }
      const fitted = fitModel(gltf.scene);
      entry.group.add(fitted);
      loadedObjects.add(fitted);
      if (high) {
        entry.high = fitted;
        if (entry.model) entry.model.visible = false;
      } else {
        entry.model = fitted;
        if (entry.high) fitted.visible = false;
      }
      if (entry.fallback) entry.fallback.visible = false;
      if (high && gltf.animations.length) {
        entry.mixer = new THREE.AnimationMixer(gltf.scene);
        gltf.animations.forEach((clip) => entry.mixer.clipAction(clip).play());
        mixers.add(entry.mixer);
      }
      renderer.shadowMap.needsUpdate = true;
      dirty = true;
    } catch (error) {
      console.info(
        `Original lot ${entry.lot.project?.originalLot || entry.lot.id} model unavailable; keeping its city marker.`,
        error.message,
      );
    } finally {
      loadingCount--;
    }
  }
  function districtAt(position) {
    return getDistrictAtPosition(position, city);
  }
  function updateStatus(now) {
    let nearest = null,
      best = Infinity;
    for (const entry of entries.values()) {
      entry.distance = Math.hypot(
        playerState.position.x - entry.lot.position.x,
        playerState.position.z - entry.lot.position.z,
      );
      entry.group.visible = entry.distance < 135;
      const distance = Math.hypot(
        entry.distance,
        (playerState.position.y - 2) * 0.3,
      );
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
    const nearbyKey = nearby?.lot.slotId || "";
    if (nearbyKey !== lastNearby) {
      lastNearby = nearbyKey;
      onNearby?.(nearby ? { ...nearby.lot, distance: best } : null);
      dirty = true;
    }
    const newDistrict = districtAt(playerState.position);
    if (now - lastStatus > 220 || newDistrict !== currentDistrict) {
      currentDistrict = newDistrict;
      lastStatus = now;
      onLocation?.({
        position: { ...playerState.position },
        district: currentDistrict,
        slotId: nearbyKey || null,
      });
    }
    // Prioritize the closest original lots, not the entire city's downloads.
    [...entries.values()]
      .filter(
        (entry) =>
          entry.distance < 115 &&
          entry.lot.project?.exterior?.model &&
          !entry.model &&
          !entry.loading,
      )
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
      .forEach((entry) => loadModel(entry));
    if (
      nearest?.distance < 27 &&
      nearest.lot.project?.exterior?.highModel &&
      !nearest.high &&
      !nearest.highLoading &&
      nearest.model
    )
      loadModel(nearest, true);
  }
  function updateLabels() {
    for (const entry of entries.values()) {
      const matches =
        !allowedIds ||
        !entry.lot.project ||
        allowedIds.has(entry.lot.project.id);
      projected
        .set(
          entry.lot.position.x,
          entry.lot.project ? 2.4 : 1.2,
          entry.lot.position.z + 7.3,
        )
        .project(camera);
      const selected =
        selectedId === entry.lot.id || selectedId === entry.lot.slotId;
      const show =
        matches &&
        (entry.distance < 65 || selected) &&
        projected.z > -1 &&
        projected.z < 1 &&
        Math.abs(projected.x) < 1.08 &&
        Math.abs(projected.y) < 1.08;
      entry.button.hidden = !show;
      if (show) {
        entry.button.style.transform = `translate(-50%,-50%) translate(${(projected.x * 0.5 + 0.5) * canvas.clientWidth}px,${(-projected.y * 0.5 + 0.5) * canvas.clientHeight}px)`;
        entry.button.style.zIndex = String(
          10 + Math.round((1 - projected.z) * 100),
        );
        entry.button.classList.toggle("selected", selected);
      }
    }
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
  function tick(now) {
    frame = 0;
    if (disposed || paused || document.hidden || !visible) return;
    rendering = true;
    const dt = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    const input = flightInput?.getState?.() || zeroInput;
    const before = { ...playerState.position };
    const yaw = Math.atan2(
      camera.position.x - controls.target.x,
      camera.position.z - controls.target.z,
    );
    // Retain real movement speed on slower devices using bounded physics steps.
    for (let remaining = dt; remaining > 0; remaining -= 0.05)
      stepFlight(
        playerState,
        input,
        Math.min(0.05, remaining),
        yaw,
        city.bounds || { radius: 310, floor: 1.6, ceiling: 55 },
      );
    tempVector.set(
      playerState.position.x - before.x,
      playerState.position.y - before.y,
      playerState.position.z - before.z,
    );
    const moved = tempVector.lengthSq() > 0.000001;
    if (moved) {
      camera.position.add(tempVector);
      controls.target.add(tempVector);
      dirty = true;
    }
    player.position.set(
      playerState.position.x,
      playerState.position.y,
      playerState.position.z,
    );
    if (moved) {
      player.rotation.y = THREE.MathUtils.lerp(
        player.rotation.y,
        playerState.heading || 0,
        0.15,
      );
      cube.rotation.z = THREE.MathUtils.lerp(
        cube.rotation.z,
        -(input.strafe || 0) * 0.1,
        0.12,
      );
      cube.rotation.x = THREE.MathUtils.lerp(
        cube.rotation.x,
        (input.forward || 0) * 0.08,
        0.12,
      );
    } else {
      cube.rotation.z *= 0.9;
      cube.rotation.x *= 0.9;
    }
    playerShadow.position.set(player.position.x, 0.32, player.position.z);
    playerShadow.scale.setScalar(
      Math.max(0.4, 1 - (player.position.y - 2) * 0.01),
    );
    const controlsMoved = controls.update();
    dirty ||= controlsMoved;
    if (moved || now - lastStatus > 220) updateStatus(now);
    if (!reducedMotion.matches) {
      time += dt;
      visuals.update(time, false);
      for (const entry of entries.values())
        if (entry.mixer && entry.high?.visible) entry.mixer.update(dt);
      dirty = true;
    }
    if (player.position.distanceToSquared(lastShadow) > 324) {
      lastShadow.copy(player.position);
      sun.position.set(player.position.x + 35, 72, player.position.z + 25);
      sun.target.position.set(player.position.x, 0, player.position.z);
      renderer.shadowMap.needsUpdate = true;
    }
    if (dirty && now - lastRendered >= (reducedMotion.matches ? 0 : 33)) {
      renderer.render(scene, camera);
      updateLabels();
      dirty = false;
      lastRendered = now;
      if (!ready) {
        ready = true;
        canvas.dataset.ready = "true";
        onReady?.();
        updateStatus(now);
      }
    }
    rendering = false;
    frame = requestAnimationFrame(tick);
  }
  function start() {
    if (
      !disposed &&
      !paused &&
      !document.hidden &&
      visible &&
      !frame &&
      !rendering
    ) {
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

  // Selection resolves the ground tile even when the lot contains a complex imported model.
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    groundHit = new THREE.Vector3();
  const activePointers = new Set();
  let down = null;
  const pointerDown = (event) => {
    activePointers.add(event.pointerId);
    down =
      activePointers.size === 1
        ? { x: event.clientX, y: event.clientY, id: event.pointerId }
        : null;
  };
  const pointerUp = (event) => {
    activePointers.delete(event.pointerId);
    if (
      !down ||
      event.pointerId !== down.id ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6
    ) {
      down = null;
      return;
    }
    down = null;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(groundPlane, groundHit)) {
      const entry = [...entries.values()].find(
        (item) =>
          Math.abs(item.lot.position.x - groundHit.x) < 7.5 &&
          Math.abs(item.lot.position.z - groundHit.z) < 7.5,
      );
      if (entry) onSelect?.(entry.lot.project?.id || entry.lot.slotId);
    }
  };
  const pointerCancel = (event) => {
    activePointers.delete(event.pointerId);
    down = null;
  };
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerCancel);

  function teleport(position, selected = null) {
    Object.assign(playerState.position, position);
    Object.assign(playerState.velocity, { x: 0, y: 0, z: 0 });
    playerPosition.set(position.x, position.y, position.z);
    player.position.copy(playerPosition);
    controls.target.copy(playerPosition).add(new THREE.Vector3(0, 1, 0));
    camera.position.copy(playerPosition).add(new THREE.Vector3(14, 12, 21));
    selectedId = selected;
    dirty = true;
    renderer.shadowMap.needsUpdate = true;
    updateStatus(performance.now());
    start();
  }
  resize();
  updateStatus(performance.now());
  start();
  return {
    focusProject(id) {
      const entry = [...entries.values()].find(
        (item) => item.lot.project?.id === id || item.lot.slotId === id,
      );
      if (entry)
        teleport(
          { x: entry.lot.position.x, y: 2.2, z: entry.lot.position.z + 7.8 },
          entry.lot.id,
        );
    },
    teleportLot(slotId) {
      const entry = entries.get(slotId);
      if (entry)
        teleport(
          { x: entry.lot.position.x, y: 2.2, z: entry.lot.position.z + 7.8 },
          entry.lot.id,
        );
    },
    teleportDistrict(id) {
      const district = districtLookup.get(id);
      if (district) {
        const first = [...entries.values()].find(
          (e) => e.lot.district === id && e.lot.project,
        );
        if (first)
          teleport(
            { x: first.lot.position.x, y: 2.2, z: first.lot.position.z + 7.8 },
            first.lot.id,
          );
        else {
          const rows = Math.ceil(district.slotCount / district.columns);
          teleport({
            x: district.center[0],
            y: 3,
            z: district.center[1] + (rows * (district.spacing || 17)) / 2 + 5,
          });
        }
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
      teleport({ x: 0, y: 2.2, z: 36 });
    },
    setPaused(value) {
      paused = Boolean(value);
      if (paused) {
        cancelAnimationFrame(frame);
        frame = 0;
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
      mixers.forEach((mixer) => mixer.stopAllAction());
      visuals.dispose();
      resources.geometries.forEach((value) => value.dispose());
      resources.materials.forEach((value) => value.dispose());
      resources.textures.forEach((value) => value.dispose());
      environmentTarget.dispose();
      renderer.dispose();
    },
  };
}
