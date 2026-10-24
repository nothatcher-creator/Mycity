import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const PALETTE = {
  ink: 0x172332,
  stone: 0xd9dfd9,
  cream: 0xf8f0da,
  white: 0xf8fbf2,
  teal: 0x77efce,
  violet: 0xb1a0ff,
  grass: 0x668d77,
  dark: 0x293549,
  glass: 0x6ebdc6,
  gold: 0xf4c57e,
  pink: 0xecadc4,
};
const POSITIONS = [
  [0, 13],
  [-13, 13],
  [13, 13],
  [-13, 0],
  [13, 0],
  [-13, -13],
  [0, -13],
  [13, -13],
];

function plotPositions(count) {
  const positions = POSITIONS.map((position) => [...position]);
  for (let radius = 2; positions.length < count; radius++) {
    for (let z = -radius; z <= radius; z++) {
      for (let x = -radius; x <= radius; x++) {
        if (Math.max(Math.abs(x), Math.abs(z)) === radius)
          positions.push([x * 13, z * 13]);
      }
    }
  }
  return positions.slice(0, count);
}

/** Browser-only scene. All launch/navigation UI remains real, accessible HTML. */
export function createWorld({
  canvas,
  labelsContainer,
  projects,
  onSelect,
  onReady,
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Buildings and the sun are static. Rebuild their shadow atlas only when
  // filtering changes the scene, rather than submitting every mesh twice/RAF.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121826);
  scene.fog = new THREE.FogExp2(0x121826, 0.0055);
  const camera = new THREE.OrthographicCamera(-35, 35, 26, -26, 0.1, 220);
  const cameraOffset = new THREE.Vector3(35, 33, 43);
  camera.position.copy(cameraOffset);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minPolarAngle = 0.28;
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.minZoom = 0.65;
  controls.maxZoom = 3.1;
  controls.zoomSpeed = 0.7;
  controls.rotateSpeed = 0.6;
  controls.panSpeed = 0.8;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  canvas.tabIndex = 0;
  canvas.setAttribute(
    "aria-label",
    "3D project district. Drag to orbit, pinch or scroll to zoom. Select the labeled plots to explore projects.",
  );
  controls.listenToKeyEvents(canvas);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  scene.environment = environment;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xc7e5ff, 0x647d82, 2.1));
  const sun = new THREE.DirectionalLight(0xffe2bb, 3.8);
  sun.position.set(-20, 40, 22);
  sun.castShadow = true;
  const shadowSize = window.innerWidth < 760 ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, {
    left: -36,
    right: 36,
    top: 36,
    bottom: -36,
    near: 1,
    far: 110,
  });
  sun.shadow.normalBias = 0.05;
  sun.shadow.bias = -0.0001;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xa99cff, 2.8);
  rim.position.set(15, 15, -30);
  scene.add(rim);

  const materials = new Set();
  const geometries = new Set();
  const textures = new Set();
  const animated = [];
  const entries = new Map();
  const selectable = [];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false;
  let visible = true;
  let paused = false;
  let frame = 0;
  let rendering = false;
  let ready = false;
  let tween = null;
  let width = 1;
  let height = 1;
  let lastTime = performance.now();
  let time = 0;

  function material(color, options = {}) {
    const value = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.57,
      metalness: 0.05,
      ...options,
    });
    materials.add(value);
    return value;
  }
  const mats = {
    stone: material(PALETTE.stone),
    cream: material(PALETTE.cream),
    white: material(PALETTE.white),
    ink: material(PALETTE.ink),
    dark: material(PALETTE.dark),
    grass: material(PALETTE.grass),
    teal: material(PALETTE.teal, {
      emissive: PALETTE.teal,
      emissiveIntensity: 0.3,
    }),
    violet: material(PALETTE.violet, {
      emissive: PALETTE.violet,
      emissiveIntensity: 0.25,
    }),
    gold: material(PALETTE.gold, { metalness: 0.65, roughness: 0.23 }),
    glass: material(PALETTE.glass, {
      metalness: 0.6,
      roughness: 0.15,
      transparent: true,
      opacity: 0.7,
    }),
    bark: material(0x777c6c),
    leaf: material(0x89b59c),
    leafDark: material(0x5e9b87),
    pink: material(PALETTE.pink),
    path: material(0xb7c6bd),
    black: material(0x101b2c),
  };
  function mesh(geometry, mat, parent, x = 0, y = 0, z = 0, cast = true) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z);
    object.castShadow = cast;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent, sx, sy, sz, x, y, z, mat = mats.cream) {
    return mesh(new THREE.BoxGeometry(sx, sy, sz), mat, parent, x, y, z);
  }
  function cylinder(
    parent,
    radius,
    height,
    x,
    y,
    z,
    mat = mats.cream,
    sides = 32,
    top = radius,
  ) {
    return mesh(
      new THREE.CylinderGeometry(top, radius, height, sides),
      mat,
      parent,
      x,
      y,
      z,
    );
  }
  function sphere(parent, radius, x, y, z, mat = mats.teal) {
    return mesh(new THREE.IcosahedronGeometry(radius, 1), mat, parent, x, y, z);
  }
  function torus(parent, radius, tube, x, y, z, mat = mats.teal) {
    return mesh(
      new THREE.TorusGeometry(radius, tube, 8, 64),
      mat,
      parent,
      x,
      y,
      z,
    );
  }
  function roundedSlab(parent, sx, sz, depth, x, y, z, mat, radius = 0.55) {
    const shape = new THREE.Shape();
    const a = -sx / 2,
      b = -sz / 2;
    shape.moveTo(a + radius, b);
    shape.lineTo(a + sx - radius, b);
    shape.quadraticCurveTo(a + sx, b, a + sx, b + radius);
    shape.lineTo(a + sx, b + sz - radius);
    shape.quadraticCurveTo(a + sx, b + sz, a + sx - radius, b + sz);
    shape.lineTo(a + radius, b + sz);
    shape.quadraticCurveTo(a, b + sz, a, b + sz - radius);
    shape.lineTo(a, b + radius);
    shape.quadraticCurveTo(a, b, a + radius, b);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.06,
      bevelSegments: 2,
      curveSegments: 5,
    });
    geometry.rotateX(-Math.PI / 2);
    return mesh(geometry, mat, parent, x, y, z);
  }
  function tree(parent, x, z, scale = 1) {
    const group = new THREE.Group();
    group.position.set(x, 0.22, z);
    group.scale.setScalar(scale);
    parent.add(group);
    cylinder(group, 0.12, 1.1, 0, 0.7, 0, mats.bark, 6);
    sphere(group, 0.7, 0, 1.5, 0, mats.leaf);
    sphere(group, 0.51, 0.2, 1.87, 0.05, mats.leafDark);
    sphere(group, 0.36, -0.37, 1.49, 0.1, mats.leafDark);
  }
  function planter(parent, x, z, scale = 1) {
    cylinder(
      parent,
      0.4 * scale,
      0.35,
      x,
      0.45,
      z,
      mats.white,
      12,
      0.48 * scale,
    );
    sphere(parent, 0.43 * scale, x, 0.77, z, mats.leaf);
  }
  function lamp(parent, x, z) {
    cylinder(parent, 0.055, 1.45, x, 0.92, z, mats.ink, 8);
    cylinder(parent, 0.18, 0.2, x, 1.67, z, mats.teal, 12);
    cylinder(parent, 0.21, 0.08, x, 1.82, z, mats.ink, 12);
  }
  function stairs(parent, x, z, facing = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = facing;
    parent.add(group);
    for (let i = 0; i < 3; i++)
      box(group, 2.1, 0.16, 0.45, 0, 0.26 + i * 0.16, i * -0.4, mats.white);
  }
  function fins(parent, x, y, z, count, direction = "x") {
    for (let i = 0; i < count; i++)
      box(
        parent,
        direction === "x" ? 0.075 : 1.2,
        1.3,
        direction === "x" ? 1.2 : 0.075,
        x + (direction === "x" ? i * 0.32 : 0),
        y,
        z + (direction === "z" ? i * 0.32 : 0),
        mats.white,
      );
  }
  function windowStrip(parent, sx, sy, x, y, z) {
    box(parent, sx, sy, 0.065, x, y, z, mats.glass);
    for (let i = -sx / 2 + 0.3; i < sx / 2; i += 0.65)
      box(parent, 0.045, sy + 0.08, 0.1, x + i, y, z + 0.02, mats.white);
  }

  function island(project, position, index) {
    const group = new THREE.Group();
    group.position.set(position[0], 0, position[1]);
    scene.add(group);
    roundedSlab(group, 9.7, 9.7, 1.25, 0, -1.3, 0, mats.ink, 0.75);
    roundedSlab(
      group,
      9.9,
      9.9,
      0.1,
      0,
      -0.1,
      0,
      project.category === "benchmarks" ? mats.violet : mats.teal,
      0.75,
    );
    const ground = roundedSlab(
      group,
      9.7,
      9.7,
      0.27,
      0,
      0.03,
      0,
      mats.stone,
      0.7,
    );
    ground.userData.projectId = project.id;
    selectable.push(ground);
    roundedSlab(group, 8.3, 8.3, 0.06, 0, 0.32, 0, mats.path, 0.4);
    for (const side of [-1, 1]) {
      roundedSlab(group, 1.1, 6.3, 0.04, side * 3.68, 0.39, 0, mats.grass, 0.3);
      tree(group, side * 3.6, -2.7, 0.8 + (index % 3) * 0.08);
      tree(group, side * 3.6, 2.5, 0.67);
      lamp(group, side * 3.5, 0.9);
    }
    for (let i = -2; i <= 2; i++)
      box(group, 0.9, 0.025, 0.42, i * 1.02, 0.405, 4.0, mats.white);
    planter(group, -2.7, 3.45, 0.65);
    planter(group, 2.7, 3.45, 0.65);
    return group;
  }

  function forge(parent) {
    roundedSlab(parent, 5.4, 5.4, 0.36, 0, 0.42, 0, mats.white, 0.5);
    cylinder(parent, 2.3, 0.25, 0, 0.93, 0, mats.ink, 48);
    cylinder(parent, 2.06, 0.18, 0, 1.14, 0, mats.glass, 48);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const support = box(
        parent,
        0.44,
        3.0,
        0.44,
        Math.cos(a) * 1.95,
        2.32,
        Math.sin(a) * 1.95,
        mats.white,
      );
      support.rotation.z = -Math.cos(a) * 0.14;
      support.rotation.x = Math.sin(a) * 0.14;
    }
    const ring = torus(parent, 2.18, 0.2, 0, 3.45, 0, mats.white);
    ring.rotation.x = -0.24;
    const inner = torus(parent, 1.9, 0.055, 0, 3.45, 0.04, mats.teal);
    inner.rotation.copy(ring.rotation);
    const orbit = new THREE.Group();
    orbit.position.y = 3.45;
    parent.add(orbit);
    const orbitRing = torus(orbit, 1.57, 0.065, 0, 0, 0, mats.gold);
    orbitRing.rotation.set(0.7, 0.6, 0);
    sphere(orbit, 0.25, 1.5, 0, 0, mats.violet);
    const core = mesh(
      new THREE.OctahedronGeometry(0.72),
      mats.teal,
      parent,
      0,
      3.45,
      0,
    );
    animated.push((t) => {
      orbit.rotation.y = t * 0.27;
      core.rotation.y = -t * 0.32;
      core.position.y = 3.45 + Math.sin(t * 1.3) * 0.12;
    });
    stairs(parent, 0, 3);
    for (const side of [-1, 1])
      box(parent, 0.16, 2.8, 1.9, side * 2.45, 2.15, 0.25, mats.glass);
  }
  function benchmark(parent) {
    roundedSlab(parent, 5.6, 4.8, 0.35, 0, 0.42, 0, mats.white);
    box(parent, 5.2, 0.35, 4.4, 0, 0.94, 0, mats.ink);
    box(parent, 4.9, 2.6, 3.9, 0, 2.43, -0.15, mats.glass);
    box(parent, 5.6, 0.32, 4.8, 0, 3.9, 0, mats.white);
    for (const x of [-2.45, 2.45])
      box(parent, 0.22, 2.7, 4.0, x, 2.46, 0, mats.white);
    const bars = [];
    for (let i = 0; i < 5; i++) {
      const h = 0.65 + i * 0.32;
      bars.push(
        box(
          parent,
          0.42,
          h,
          0.5,
          -1.3 + i * 0.65,
          1.25 + h / 2,
          1.35,
          i % 2 ? mats.teal : mats.violet,
        ),
      );
    }
    const halo = torus(parent, 1.1, 0.065, 0, 4.6, 0, mats.violet);
    halo.rotation.x = Math.PI / 2;
    sphere(parent, 0.25, 0, 4.6, 0, mats.teal);
    animated.push((t) => {
      halo.rotation.z = t * 0.18;
      halo.position.y = 4.6 + Math.sin(t) * 0.08;
    });
    stairs(parent, 0, 3);
  }
  function lighthouse(parent) {
    const water = material(0x509ca5, { roughness: 0.18, metalness: 0.48 });
    roundedSlab(parent, 6.2, 6.0, 0.07, 0, 0.41, 0, water, 1.1);
    cylinder(parent, 2.2, 0.2, -0.1, 0.56, 0, mats.stone, 10);
    cylinder(parent, 0.93, 4.3, -0.15, 2.8, -0.2, mats.white, 20, 0.65);
    cylinder(parent, 0.79, 0.55, -0.15, 3.7, -0.2, mats.pink, 20, 0.76);
    cylinder(parent, 1.07, 0.16, -0.15, 5.02, -0.2, mats.ink, 24);
    cylinder(parent, 0.65, 0.9, -0.15, 5.55, -0.2, mats.glass, 12);
    cylinder(parent, 0.9, 0.55, -0.15, 6.2, -0.2, mats.ink, 16, 0);
    sphere(parent, 0.22, -0.15, 5.6, -0.2, mats.gold);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cylinder(
        parent,
        0.035,
        0.48,
        Math.cos(a) * 0.98 - 0.15,
        5.3,
        Math.sin(a) * 0.98 - 0.2,
        mats.white,
        6,
      );
    }
    const rail = torus(parent, 0.98, 0.035, -0.15, 5.52, -0.2, mats.white);
    rail.rotation.x = Math.PI / 2;
    box(parent, 1.65, 1.25, 1.55, 1.65, 1.23, 1.75, mats.cream);
    const roof = mesh(
      new THREE.ConeGeometry(1.4, 0.9, 4),
      mats.ink,
      parent,
      1.65,
      2.3,
      1.75,
    );
    roof.rotation.y = Math.PI / 4;
    for (let i = 0; i < 5; i++) {
      const rock = sphere(
        parent,
        0.37 + (i % 2) * 0.15,
        -2.2 + i * 0.9,
        0.7,
        2.45,
        mats.stone,
      );
      rock.scale.y = 0.65;
    }
    const beamMat = material(0xffd78e, {
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      emissive: 0xffd78e,
      emissiveIntensity: 0.65,
      side: THREE.DoubleSide,
    });
    const beamGroup = new THREE.Group();
    beamGroup.position.set(-0.15, 5.6, -0.2);
    parent.add(beamGroup);
    const beam = mesh(
      new THREE.ConeGeometry(1.5, 5, 24, 1, true),
      beamMat,
      beamGroup,
      0,
      0,
      2.5,
      false,
    );
    beam.rotation.x = -Math.PI / 2;
    animated.push((t) => {
      beamGroup.rotation.y = t * 0.24;
    });
  }
  function castle(parent) {
    roundedSlab(parent, 6.4, 5.7, 0.2, 0, 0.42, 0, mats.grass);
    box(parent, 5.3, 1.7, 0.62, 0, 1.45, 1.5, mats.cream);
    box(parent, 5.3, 1.7, 0.62, 0, 1.45, -1.9, mats.cream);
    for (const x of [-2.35, 2.35]) {
      box(parent, 0.65, 1.7, 4.0, x, 1.45, -0.2, mats.cream);
      for (const z of [-1.9, 1.5]) {
        cylinder(parent, 0.67, 2.8, x, 1.92, z, mats.white, 8);
        cylinder(parent, 0.82, 0.7, x, 3.65, z, mats.ink, 8, 0);
        box(parent, 0.2, 0.5, 0.05, x, 2.6, z + 0.67, mats.ink);
      }
    }
    for (let i = -3; i <= 3; i++) {
      box(parent, 0.38, 0.35, 0.65, i * 0.6, 2.46, 1.5, mats.cream);
      box(parent, 0.38, 0.35, 0.65, i * 0.6, 2.46, -1.9, mats.cream);
    }
    box(parent, 1.0, 1.25, 0.07, 0, 1.23, 1.84, mats.ink);
    box(parent, 1.5, 3.15, 1.6, 0, 2.3, -0.65, mats.white);
    const roof = mesh(
      new THREE.ConeGeometry(1.3, 1.5, 4),
      mats.ink,
      parent,
      0,
      4.6,
      -0.65,
    );
    roof.rotation.y = Math.PI / 4;
    cylinder(parent, 0.035, 1.45, 0, 5.85, -0.65, mats.gold, 6);
    const flag = box(parent, 0.7, 0.43, 0.03, 0.35, 6.23, -0.65, mats.violet);
    animated.push((t) => {
      flag.rotation.y = Math.sin(t * 1.4) * 0.15;
    });
  }
  function blackbox(parent) {
    roundedSlab(parent, 5.8, 5.2, 0.4, 0, 0.42, 0, mats.ink);
    box(parent, 4.9, 2.3, 3.9, 0, 1.97, -0.1, mats.dark);
    box(parent, 5.35, 0.25, 4.3, 0, 3.26, -0.1, mats.white);
    windowStrip(parent, 4.35, 1.3, 0, 2.0, 1.89);
    for (const x of [-2.55, 2.55])
      box(parent, 0.14, 2.4, 4.0, x, 2.0, -0.1, mats.white);
    box(parent, 2.5, 0.3, 2.8, 0.8, 3.57, -0.4, mats.ink);
    cylinder(parent, 0.62, 0.1, 0.8, 3.79, -0.4, mats.teal, 6);
    const rotor = torus(parent, 0.45, 0.07, 0.8, 4.4, -0.4, mats.teal);
    rotor.rotation.x = Math.PI / 2;
    sphere(parent, 0.2, 0.8, 4.4, -0.4, mats.gold);
    for (let i = 0; i < 3; i++)
      box(
        parent,
        0.72,
        0.5,
        0.7,
        -1.4 + i * 0.85,
        0.8,
        2.65,
        i === 1 ? mats.gold : mats.white,
      );
    animated.push((t) => {
      rotor.rotation.z = t * 0.7;
      rotor.position.y = 4.4 + Math.sin(t * 1.5) * 0.12;
    });
  }
  function cards(parent) {
    roundedSlab(parent, 5.8, 5.2, 0.4, 0, 0.42, 0, mats.white);
    box(parent, 5.25, 2.5, 4.5, 0, 2.0, 0, mats.cream);
    box(parent, 5.7, 0.3, 4.9, 0, 3.4, 0, mats.ink);
    windowStrip(parent, 4.5, 1.6, 0, 1.95, 2.28);
    const colors = [mats.violet, mats.white, mats.teal];
    for (let i = 0; i < 3; i++) {
      const card = new THREE.Group();
      card.position.set((i - 1) * 1.2, 4.75, 0);
      card.rotation.z = (1 - i) * 0.22;
      parent.add(card);
      roundedSlab(card, 1.25, 1.85, 0.09, 0, 0, 0, colors[i], 0.14).rotation.x =
        Math.PI / 2;
      const symbol = mesh(
        new THREE.OctahedronGeometry(0.25),
        mats.gold,
        card,
        0,
        0.05,
        0.14,
      );
      symbol.rotation.z = Math.PI / 4;
      animated.push((t) => {
        card.position.y = 4.75 + Math.sin(t * 0.85 + i) * 0.1;
      });
    }
  }
  function workshop(parent) {
    roundedSlab(parent, 5.8, 5.0, 0.35, 0, 0.42, 0, mats.white);
    box(parent, 4.7, 2.5, 3.8, 0, 2.0, 0, mats.cream);
    windowStrip(parent, 4.25, 1.7, 0, 2.0, 1.93);
    box(parent, 5.1, 0.28, 4.3, 0, 3.4, 0, mats.white);
    fins(parent, -2.0, 2.1, -1.3, 3);
    const ring = torus(parent, 0.88, 0.2, 0.2, 4.65, 0, mats.gold);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const tooth = box(
        parent,
        0.3,
        0.5,
        0.32,
        0.2 + Math.cos(a) * 1.05,
        4.65 + Math.sin(a) * 1.05,
        0,
        mats.gold,
      );
      tooth.rotation.z = a - Math.PI / 2;
    }
    box(parent, 1.0, 0.55, 0.8, -1.7, 0.9, 2.75, mats.violet);
    box(parent, 0.75, 0.75, 0.75, 1.65, 1.0, 2.75, mats.teal);
    stairs(parent, 0, 3.0);
    animated.push((t) => {
      ring.rotation.z = t * 0.12;
    });
  }
  function terminal(parent) {
    roundedSlab(parent, 5.8, 5.1, 0.35, 0, 0.42, 0, mats.white);
    box(parent, 5.0, 2.45, 4.0, 0, 1.98, -0.1, mats.ink);
    box(parent, 5.5, 0.25, 4.5, 0, 3.36, -0.1, mats.white);
    box(parent, 3.8, 1.7, 0.12, 0, 2.0, 1.96, mats.black);
    for (let i = 0; i < 5; i++)
      box(
        parent,
        1.6 + (i % 3) * 0.55,
        0.07,
        0.1,
        -0.3 + (i % 2) * 0.15,
        2.55 - i * 0.24,
        2.04,
        i % 2 ? mats.violet : mats.teal,
      );
    const cursor = box(parent, 0.16, 0.17, 0.1, 0.9, 1.54, 2.04, mats.teal);
    box(parent, 2.1, 0.12, 1.25, 0, 3.59, -0.25, mats.glass);
    const glyph = torus(parent, 0.68, 0.11, 0, 4.65, -0.25, mats.violet);
    glyph.rotation.y = -0.35;
    box(parent, 0.12, 1.75, 0.13, 0, 4.65, -0.25, mats.teal).rotation.z = -0.4;
    animated.push((t) => {
      cursor.visible = Math.sin(t * 2) > -0.2;
    });
    stairs(parent, 0, 3.0);
  }
  const builders = {
    forge,
    observatory: forge,
    benchmark,
    lighthouse,
    castle,
    blackbox,
    cards,
    workshop,
    terminal,
  };

  const plaza = new THREE.Group();
  scene.add(plaza);
  roundedSlab(plaza, 10.3, 10.3, 1.1, 0, -1.2, 0, mats.ink, 1);
  roundedSlab(plaza, 10.4, 10.4, 0.1, 0, -0.05, 0, mats.violet, 1);
  roundedSlab(plaza, 10.2, 10.2, 0.3, 0, 0.05, 0, mats.path, 1);
  cylinder(plaza, 2.7, 0.09, 0, 0.4, 0, mats.white, 48);
  cylinder(plaza, 1.7, 0.5, 0, 0.72, 0, mats.ink, 48);
  cylinder(plaza, 1.46, 0.06, 0, 1.0, 0, mats.glass, 48);
  const portal = torus(plaza, 1.65, 0.12, 0, 3.0, 0, mats.violet);
  portal.rotation.y = Math.PI / 4;
  const centerCrystal = mesh(
    new THREE.OctahedronGeometry(0.6),
    mats.white,
    plaza,
    0,
    3.0,
    0,
  );
  animated.push((t) => {
    centerCrystal.rotation.y = t * 0.2;
    centerCrystal.position.y = 3 + Math.sin(t) * 0.12;
  });
  for (const x of [-3.6, 3.6])
    for (const z of [-3.6, 3.6]) tree(plaza, x, z, 0.85);
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const bridge = box(
      scene,
      3.0,
      0.27,
      2.8,
      Math.sin(a) * 6.5,
      0.22,
      Math.cos(a) * 6.5,
      mats.white,
    );
    bridge.rotation.y = a;
    for (const side of [-1, 1]) {
      const rail = box(
        scene,
        0.08,
        0.4,
        2.8,
        Math.sin(a) * 6.5 + Math.cos(a) * side * 1.4,
        0.6,
        Math.cos(a) * 6.5 - Math.sin(a) * side * 1.4,
        mats.glass,
      );
      rail.rotation.y = a;
    }
  }

  // Expand outward on the same grid; never put a future plot over the plaza.
  const positions = plotPositions(projects.length);
  for (const z of [-13, 13])
    for (const x of [-6.5, 6.5]) {
      box(scene, 3.0, 0.27, 2.8, x, 0.22, z, mats.white).rotation.y =
        Math.PI / 2;
    }
  for (const x of [-13, 13])
    for (const z of [-6.5, 6.5]) {
      box(scene, 3.0, 0.27, 2.8, x, 0.22, z, mats.white);
    }
  projects.forEach((project, index) => {
    const position = positions[index];
    const group = island(project, position, index);
    const builder =
      builders[project.theme] ||
      (project.category === "benchmarks" ? benchmark : terminal);
    builder(group);
    const button = document.createElement("button");
    button.className = "plot-label";
    button.type = "button";
    button.dataset.project = project.id;
    button.setAttribute(
      "aria-label",
      `Plot ${String(project.plot).padStart(3, "0")}: ${project.title}`,
    );
    button.title = project.subtitle || project.title;
    const number = document.createElement("span");
    number.className = "plot-label-number";
    number.textContent = String(project.plot).padStart(2, "0");
    const title = document.createElement("strong");
    title.textContent = project.title;
    button.append(number, title);
    button.addEventListener("click", () => onSelect?.(project.id));
    labelsContainer.append(button);
    entries.set(project.id, {
      project,
      group,
      button,
      anchor: new THREE.Vector3(position[0], 0.85, position[1] + 4.65),
      visible: true,
    });
  });

  const starPositions = new Float32Array(250 * 3);
  let random = 3741;
  const rand = () => {
    random = (random * 16807) % 2147483647;
    return (random - 1) / 2147483646;
  };
  for (let i = 0; i < 250; i++) {
    starPositions[i * 3] = (rand() - 0.5) * 150;
    starPositions[i * 3 + 1] = rand() * 48 + 8;
    starPositions[i * 3 + 2] = (rand() - 0.5) * 150;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3),
  );
  geometries.add(starGeometry);
  const starMaterial = new THREE.PointsMaterial({
    color: 0xa4bed8,
    size: 0.075,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  materials.add(starMaterial);
  scene.add(new THREE.Points(starGeometry, starMaterial));
  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x46646a,
    transparent: true,
    opacity: 0.1,
  });
  materials.add(gridMaterial);
  const gridGeometry = new THREE.BufferGeometry();
  const gridPoints = [];
  for (let i = -60; i <= 60; i += 5)
    gridPoints.push(-60, -5.7, i, 60, -5.7, i, i, -5.7, -60, i, -5.7, 60);
  gridGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(gridPoints, 3),
  );
  geometries.add(gridGeometry);
  scene.add(new THREE.LineSegments(gridGeometry, gridMaterial));

  const projectPoint = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const activePointers = new Set();
  let down = null;
  function pointerDown(event) {
    tween = null;
    activePointers.add(event.pointerId);
    down =
      activePointers.size === 1
        ? { x: event.clientX, y: event.clientY, id: event.pointerId }
        : null;
  }
  function pointerUp(event) {
    activePointers.delete(event.pointerId);
    if (
      !down ||
      down.id !== event.pointerId ||
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
    const hit = raycaster
      .intersectObjects(selectable)
      .find((item) => entries.get(item.object.userData.projectId)?.visible);
    if (hit) onSelect?.(hit.object.userData.projectId);
  }
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointerup", pointerUp);
  const pointerCancel = (event) => {
    activePointers.delete(event.pointerId);
    down = null;
  };
  canvas.addEventListener("pointercancel", pointerCancel);

  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const radius = Math.max(13, ...positions.flat().map(Math.abs));
    const extent = projects.length <= 8 ? 48 : (radius + 7) * 2.65;
    const vertical = Math.max(extent * 0.87, (extent / aspect) * 1.15);
    camera.left = (-vertical * aspect) / 2;
    camera.right = (vertical * aspect) / 2;
    camera.top = vertical / 2;
    camera.bottom = -vertical / 2;
    camera.updateProjectionMatrix();
    start();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement || canvas);
  resize();

  function render(now) {
    frame = 0;
    if (disposed || document.hidden || !visible || paused) return;
    rendering = true;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (!reducedMotion.matches) {
      time += dt;
      for (const animate of animated) animate(time);
    }
    if (tween) {
      const progress = reducedMotion.matches
        ? 1
        : Math.min(1, (now - tween.start) / 650);
      const eased = 1 - (1 - progress) ** 3;
      controls.target.lerpVectors(tween.fromTarget, tween.target, eased);
      camera.position.lerpVectors(tween.fromCamera, tween.camera, eased);
      camera.zoom = THREE.MathUtils.lerp(tween.fromZoom, tween.zoom, eased);
      camera.updateProjectionMatrix();
      if (progress === 1) tween = null;
    }
    const controlsMoved = controls.update();
    renderer.render(scene, camera);
    for (const entry of entries.values()) {
      projectPoint.copy(entry.anchor).project(camera);
      const onScreen =
        entry.visible &&
        projectPoint.z > -1 &&
        projectPoint.z < 1 &&
        Math.abs(projectPoint.x) < 1.15 &&
        Math.abs(projectPoint.y) < 1.15;
      entry.button.hidden = !onScreen;
      if (onScreen) {
        entry.button.style.transform = `translate(-50%, -50%) translate(${(projectPoint.x * 0.5 + 0.5) * width}px, ${(-projectPoint.y * 0.5 + 0.5) * height}px)`;
        entry.button.style.zIndex = String(
          10 + Math.round((1 - projectPoint.z) * 10),
        );
      }
    }
    if (!ready) {
      ready = true;
      canvas.dataset.ready = "true";
      onReady?.();
    }
    rendering = false;
    // Reduced motion also means no unnecessary GPU work after the view settles.
    // OrbitControls keeps requesting frames until its damping has completed.
    if (!reducedMotion.matches || tween || controlsMoved)
      frame = requestAnimationFrame(render);
  }
  function start() {
    if (
      !disposed &&
      !document.hidden &&
      visible &&
      !paused &&
      !frame &&
      !rendering
    ) {
      lastTime = performance.now();
      frame = requestAnimationFrame(render);
    }
  }
  const controlsChange = () => start();
  controls.addEventListener("change", controlsChange);
  const motionChange = () => start();
  reducedMotion.addEventListener("change", motionChange);
  function visibilityChange() {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else start();
  }
  document.addEventListener("visibilitychange", visibilityChange);
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
  start();

  function moveTo(target, zoom) {
    const offset = camera.position.clone().sub(controls.target);
    tween = {
      start: performance.now(),
      fromTarget: controls.target.clone(),
      target,
      fromCamera: camera.position.clone(),
      camera: target.clone().add(offset),
      fromZoom: camera.zoom,
      zoom,
    };
    start();
  }
  return {
    focusProject(id) {
      const entry = entries.get(id);
      if (entry)
        moveTo(
          entry.group.position.clone().add(new THREE.Vector3(0, 2, 0)),
          1.65,
        );
    },
    setVisible(ids) {
      const allowed = new Set(ids);
      for (const entry of entries.values()) {
        entry.visible = allowed.has(entry.project.id);
        entry.group.visible = entry.visible;
        entry.button.hidden = !entry.visible;
      }
      renderer.shadowMap.needsUpdate = true;
      start();
    },
    reset() {
      tween = {
        start: performance.now(),
        fromTarget: controls.target.clone(),
        target: new THREE.Vector3(0, 1.6, 0),
        fromCamera: camera.position.clone(),
        camera: cameraOffset.clone(),
        fromZoom: camera.zoom,
        zoom: 1,
      };
      start();
    },
    // The host can pause the district while an embedded editor/game is open.
    setPaused(value) {
      paused = Boolean(value);
      if (paused) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else start();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibilityChange);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerCancel);
      controls.removeEventListener("change", controlsChange);
      reducedMotion.removeEventListener("change", motionChange);
      controls.dispose();
      entries.forEach((entry) => entry.button.remove());
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((mat) => mat.dispose());
      textures.forEach((texture) => texture.dispose());
      environment.dispose();
      renderer.dispose();
    },
  };
}
