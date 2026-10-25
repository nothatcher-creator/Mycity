import * as THREE from "three";

/** The owner's central landmark and procedural fallback atmosphere. */
export function createCityVisuals({ scene, city }) {
  const group = new THREE.Group();
  group.name = "Nothatchers-Beacon";
  scene.add(group);
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  const matrix = new THREE.Object3D();
  const geometry = (value) => {
    geometries.add(value);
    return value;
  };
  const material = (color, options = {}) => {
    const value = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.12,
      ...options,
    });
    materials.add(value);
    return value;
  };
  const basic = (color, options = {}) => {
    const value = new THREE.MeshBasicMaterial({ color, ...options });
    materials.add(value);
    return value;
  };
  const stone = material(0xc1cfc9, { roughness: 0.78 });
  const dark = material(0x233847, { roughness: 0.47, metalness: 0.4 });
  const pale = material(0xe8e3ce, { roughness: 0.35, metalness: 0.28 });
  const bronze = material(0xbc9870, { metalness: 0.73, roughness: 0.3 });
  const mint = material(0x9becd6, {
    emissive: 0x54ab91,
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.55,
  });
  const violet = material(0xb5a3ef, {
    emissive: 0x7163ac,
    emissiveIntensity: 0.28,
    metalness: 0.5,
    roughness: 0.3,
  });
  const gold = material(0xf0c785, {
    emissive: 0xf0ae55,
    emissiveIntensity: 0.65,
    metalness: 0.45,
    roughness: 0.3,
  });
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 32));
  const cone = geometry(new THREE.ConeGeometry(1, 1, 20));
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 8));

  function mesh(
    shape,
    surface,
    position,
    scale = [1, 1, 1],
    rotation = [0, 0, 0],
    parent = group,
  ) {
    const value = new THREE.Mesh(shape, surface);
    value.position.set(...position);
    value.scale.set(...scale);
    value.rotation.set(...rotation);
    value.castShadow = true;
    value.receiveShadow = true;
    parent.add(value);
    return value;
  }
  function instances(shape, surface, transforms, parent = group) {
    const value = new THREE.InstancedMesh(shape, surface, transforms.length);
    transforms.forEach((transform, index) => {
      matrix.position.set(...transform.position);
      matrix.scale.set(...(transform.scale || [1, 1, 1]));
      matrix.rotation.set(...(transform.rotation || [0, 0, 0]));
      matrix.updateMatrix();
      value.setMatrixAt(index, matrix.matrix);
    });
    value.castShadow = true;
    value.receiveShadow = true;
    parent.add(value);
    return value;
  }
  function ring(inner, outer, y, surface, segments = 96) {
    const value = mesh(
      geometry(new THREE.RingGeometry(inner, outer, segments)),
      surface,
      [0, y, 0],
      [1, 1, 1],
      [-Math.PI / 2, 0, 0],
    );
    value.castShadow = false;
    return value;
  }

  // A circular water garden unites the five avenues around the city center.
  mesh(cylinder, dark, [0, -0.28, 0], [35.5, 0.5, 35.5]);
  mesh(cylinder, stone, [0, 0.02, 0], [23.7, 0.35, 23.7]);
  ring(30.8, 35.4, 0.04, stone);
  ring(22.5, 23.6, 0.22, dark);
  const water = material(0x285666, {
    roughness: 0.12,
    metalness: 0.78,
    emissive: 0x0a263a,
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.94,
  });
  ring(23.7, 30.8, -0.01, water);
  ring(24.2, 24.3, 0.035, mint);
  ring(30.2, 30.3, 0.035, violet);
  const bridges = [];
  const bridgeStripes = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const x = Math.sin(angle) * 27.1,
      z = Math.cos(angle) * 27.1;
    bridges.push({
      position: [x, 0.3, z],
      scale: [6.4, 0.56, 9],
      rotation: [0, angle, 0],
    });
    bridgeStripes.push({
      position: [x, 0.6, z],
      scale: [0.17, 0.02, 8.5],
      rotation: [0, angle, 0],
    });
  }
  instances(box, dark, bridges);
  instances(box, mint, bridgeStripes);

  // The beacon is a lighthouse, a creator's cube, and a personal N monogram.
  mesh(cylinder, dark, [0, 0.78, 0], [9.7, 1.2, 9.7]);
  mesh(cylinder, bronze, [0, 1.47, 0], [8.3, 0.24, 8.3]);
  mesh(cylinder, stone, [0, 1.85, 0], [7.8, 0.55, 7.8]);
  ring(8.65, 8.8, 1.41, mint);
  mesh(
    geometry(new THREE.CylinderGeometry(1.6, 2.35, 5.9, 8)),
    dark,
    [0, 4.9, 0],
  );
  const mastBands = [2.6, 4.3, 6].map((y) => ({
    position: [0, y, 0],
    scale: [2.1, 0.15, 2.1],
  }));
  instances(cylinder, bronze, mastBands);
  mesh(cylinder, bronze, [0, 7.8, 0], [3.5, 0.36, 3.5]);
  const cubeMaterial = material(0x2d6572, {
    transparent: true,
    opacity: 0.28,
    roughness: 0.08,
    metalness: 0.5,
    depthWrite: false,
  });
  mesh(box, cubeMaterial, [0, 11.1, 0], [6.2, 6.2, 6.2]);
  const edges = new THREE.LineSegments(
    geometry(new THREE.EdgesGeometry(new THREE.BoxGeometry(6.24, 6.24, 6.24))),
    (() => {
      const value = new THREE.LineBasicMaterial({
        color: 0xa0f0db,
        transparent: true,
        opacity: 0.8,
      });
      materials.add(value);
      return value;
    })(),
  );
  edges.position.y = 11.1;
  group.add(edges);
  const nGroup = new THREE.Group();
  nGroup.position.set(0, 11.1, 0);
  group.add(nGroup);
  // The same solid mark can be read from either principal approach.
  for (const z of [-1.35, 1.35]) {
    mesh(box, pale, [-1.48, 0, z], [0.74, 4.35, 0.7], [0, 0, 0], nGroup);
    mesh(box, pale, [1.48, 0, z], [0.74, 4.35, 0.7], [0, 0, 0], nGroup);
    mesh(box, mint, [0, 0, z], [0.8, 5.1, 0.7], [0, 0, 0.61], nGroup);
  }
  const orbit = mesh(
    geometry(new THREE.TorusGeometry(5.2, 0.075, 6, 80)),
    bronze,
    [0, 11.1, 0],
    [1, 1, 1],
    [Math.PI / 2 - 0.28, 0, 0],
  );
  const orbit2 = mesh(
    geometry(new THREE.TorusGeometry(4.8, 0.035, 5, 72)),
    violet,
    [0, 11.1, 0],
    [1, 1, 1],
    [0.42, 0.6, 0],
  );
  mesh(cylinder, dark, [0, 14.5, 0], [3.2, 0.35, 3.2]);
  const lens = material(0xb9f1ed, {
    emissive: 0x87e5d4,
    emissiveIntensity: 1.25,
    roughness: 0.2,
    metalness: 0.25,
  });
  mesh(cylinder, lens, [0, 15.65, 0], [2.25, 1.95, 2.25]);
  mesh(cylinder, bronze, [0, 16.7, 0], [2.8, 0.22, 2.8]);
  mesh(cone, dark, [0, 17.6, 0], [3.3, 1.6, 3.3]);
  mesh(sphere, gold, [0, 18.7, 0], [0.3, 0.3, 0.3]);
  const beams = new THREE.Group();
  beams.position.y = 15.65;
  group.add(beams);
  const beamMaterial = basic(0x9df1db, {
    transparent: true,
    opacity: 0.035,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beamGeometry = geometry(new THREE.ConeGeometry(7, 45, 20, 1, true));
  const beamA = mesh(
    beamGeometry,
    beamMaterial,
    [22.5, 0, 0],
    [1, 1, 1],
    [0, 0, Math.PI / 2],
    beams,
  );
  const beamB = mesh(
    beamGeometry,
    beamMaterial,
    [-22.5, 0, 0],
    [1, 1, 1],
    [0, 0, -Math.PI / 2],
    beams,
  );
  beamA.castShadow = false;
  beamB.castShadow = false;

  const identity = city?.identity || {};
  const signCanvas = document.createElement("canvas");
  signCanvas.width = 1536;
  signCanvas.height = 384;
  const context = signCanvas.getContext("2d");
  context.fillStyle = "#1b2d3b";
  context.fillRect(0, 0, 1536, 384);
  context.strokeStyle = "#7bb9ac";
  context.lineWidth = 4;
  context.strokeRect(18, 18, 1500, 348);
  context.textAlign = "center";
  context.fillStyle = "#e4efe2";
  context.font = "600 105px sans-serif";
  context.fillText(
    (identity.name || "Nothatcher").toUpperCase(),
    768,
    168,
    1370,
  );
  context.fillStyle = "#9fd8c5";
  context.font = "400 44px sans-serif";
  context.fillText(
    (identity.emblem || identity.landmark || "BUILDER'S BEACON").toUpperCase(),
    768,
    261,
    1380,
  );
  const signTexture = new THREE.CanvasTexture(signCanvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  textures.add(signTexture);
  const signMaterial = basic(0xffffff, {
    map: signTexture,
    side: THREE.FrontSide,
  });
  const signGeometry = geometry(new THREE.PlaneGeometry(11.8, 2.95));
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    mesh(
      signGeometry,
      signMaterial,
      [Math.sin(angle) * 8.05, 2.85, Math.cos(angle) * 8.05],
      [1, 1, 1],
      [0, angle, 0],
    );
  }

  // Four small sculptures tell the story behind the owner's district.
  const motifs = [
    [0, -16],
    [-16, 0],
    [16, 0],
    [0, 16],
  ];
  instances(
    cylinder,
    dark,
    motifs.map(([x, z]) => ({
      position: [x, 0.7, z],
      scale: [4.5, 0.85, 4.5],
    })),
  );
  // Castle: keep, four watchtowers, twelve crenellations.
  mesh(box, stone, [0, 2.5, -16], [3.6, 3.2, 3.6]);
  const towers = [],
    roofs = [],
    teeth = [];
  for (const x of [-2.25, 2.25])
    for (const z of [-18.25, -13.75]) {
      towers.push({ position: [x, 2.5, z], scale: [0.8, 3.3, 0.8] });
      roofs.push({ position: [x, 4.6, z], scale: [1.05, 1.35, 1.05] });
    }
  for (let i = 0; i < 3; i++) {
    teeth.push({
      position: [-1.35 + i * 1.35, 4.35, -17.65],
      scale: [0.48, 0.7, 0.5],
    });
    teeth.push({
      position: [-1.35 + i * 1.35, 4.35, -14.35],
      scale: [0.48, 0.7, 0.5],
    });
  }
  instances(cylinder, stone, towers);
  instances(cone, violet, roofs);
  instances(box, stone, teeth);
  mesh(box, dark, [0, 2, -13.98], [1, 1.6, 0.12]);

  // A fan of cards connects the city to the modding/card-game projects.
  const cardTransforms = [-1, 0, 1].map((index) => ({
    position: [-16 + index * 1.1, 3.2, 0],
    scale: [2.55, 3.7, 0.22],
    rotation: [0, index * 0.12, -index * 0.22],
  }));
  instances(box, pale, cardTransforms);
  const cardFace = document.createElement("canvas");
  cardFace.width = 256;
  cardFace.height = 384;
  const cardContext = cardFace.getContext("2d");
  cardContext.fillStyle = "#e8e4d2";
  cardContext.fillRect(0, 0, 256, 384);
  cardContext.strokeStyle = "#b39165";
  cardContext.lineWidth = 8;
  cardContext.strokeRect(13, 13, 230, 358);
  cardContext.fillStyle = "#3e6869";
  cardContext.font = "600 120px sans-serif";
  cardContext.textAlign = "center";
  cardContext.fillText("N", 128, 230);
  cardContext.font = "400 38px sans-serif";
  cardContext.fillText("01", 50, 68);
  cardContext.fillText("01", 206, 350);
  const cardTexture = new THREE.CanvasTexture(cardFace);
  cardTexture.colorSpace = THREE.SRGBColorSpace;
  textures.add(cardTexture);
  const cardMaterial = basic(0xffffff, { map: cardTexture });
  const cardGeometry = geometry(new THREE.PlaneGeometry(1, 1));
  instances(
    cardGeometry,
    cardMaterial,
    cardTransforms.map((t) => ({
      ...t,
      position: [t.position[0], t.position[1], 0.13],
      scale: [2.55, 3.7, 1],
    })),
  );

  // A bronze hammer and anvil stand for the tools and creations.
  const anvilShape = new THREE.Shape();
  anvilShape.moveTo(-2.9, 1.4);
  anvilShape.lineTo(2.8, 1.4);
  anvilShape.lineTo(2.25, 0.55);
  anvilShape.lineTo(0.85, 0.45);
  anvilShape.lineTo(0.85, -0.55);
  anvilShape.lineTo(1.7, -1.1);
  anvilShape.lineTo(-1.7, -1.1);
  anvilShape.lineTo(-0.85, -0.55);
  anvilShape.lineTo(-0.85, 0.45);
  anvilShape.lineTo(-2, 0.6);
  anvilShape.closePath();
  mesh(
    geometry(
      new THREE.ExtrudeGeometry(anvilShape, {
        depth: 1.8,
        bevelEnabled: false,
      }),
    ),
    bronze,
    [16, 2.5, -0.9],
  );
  mesh(box, dark, [16.6, 5.2, 0], [0.33, 3.5, 0.34], [0, 0, -0.52]);
  mesh(box, mint, [17.4, 6.6, 0], [2.15, 0.95, 1.05], [0, 0, -0.52]);

  // A luminous waveform is Astraforge's music/video counterpart.
  mesh(
    geometry(new THREE.TorusGeometry(3.2, 0.11, 6, 48)),
    bronze,
    [0, 4.4, 16],
  );
  const waveform = [];
  for (let i = 0; i < 17; i++) {
    const x = (i - 8) * 0.29;
    const height = 0.5 + Math.pow(Math.sin(i * 0.77), 2) * 3.4;
    waveform.push({ position: [x, 4.4, 16], scale: [0.14, height, 0.18] });
  }
  instances(box, mint, waveform);

  const bollards = [],
    lamps = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    if (Math.abs(Math.sin(angle)) < 0.18 || Math.abs(Math.cos(angle)) < 0.18)
      continue;
    const x = Math.sin(angle) * 33,
      z = Math.cos(angle) * 33;
    bollards.push({ position: [x, 0.65, z], scale: [0.22, 1.15, 0.22] });
    lamps.push({ position: [x, 1.3, z], scale: [0.28, 0.13, 0.28] });
  }
  instances(cylinder, dark, bollards);
  instances(sphere, gold, lamps);

  // A shader sky and a single batched hill ring give the city a distant horizon.
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      top: { value: new THREE.Color(0x111d37) },
      horizon: { value: new THREE.Color(0x5d8c9b) },
      bottom: { value: new THREE.Color(0x9db09d) },
    },
    vertexShader:
      "varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:
      "varying vec3 vDirection; uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; void main(){float y=normalize(vDirection).y; vec3 color=mix(horizon,top,pow(max(y,0.0),0.45));color=mix(color,bottom,clamp(-y*2.5,0.0,1.0));gl_FragColor=vec4(color,1.0);#include <colorspace_fragment>}",
  });
  // Shader chunks need their own source lines, including after the final semicolon.
  skyMaterial.fragmentShader = skyMaterial.fragmentShader
    .replace("#include", "\n#include")
    .replace(">}", ">\n}");
  materials.add(skyMaterial);
  const sky = mesh(
    geometry(new THREE.SphereGeometry(880, 24, 16)),
    skyMaterial,
    [0, 0, 0],
  );
  sky.castShadow = false;
  sky.receiveShadow = false;
  sky.renderOrder = -100;
  const hills = [];
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const radius = 420 + Math.sin(i * 1.9) * 40;
    hills.push({
      position: [Math.cos(angle) * radius, 8, Math.sin(angle) * radius],
      scale: [45 + Math.sin(i * 2.3) * 13, 45 + Math.cos(i * 1.4) * 24, 42],
      rotation: [0, i * 0.41, 0],
    });
  }
  const hillMaterial = material(0x233e4c, { roughness: 1 });
  const hillMesh = instances(
    geometry(new THREE.ConeGeometry(1, 1, 5)),
    hillMaterial,
    hills,
  );
  hillMesh.castShadow = false;
  const positions = new Float32Array(360 * 3);
  let seed = 5831;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 360; i++) {
    const theta = random() * Math.PI * 2,
      elevation = 0.15 + random() * 1.2;
    positions[i * 3] = Math.cos(theta) * Math.cos(elevation) * 690;
    positions[i * 3 + 1] = Math.sin(elevation) * 690;
    positions[i * 3 + 2] = Math.sin(theta) * Math.cos(elevation) * 690;
  }
  const starGeometry = geometry(new THREE.BufferGeometry());
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const starMaterial = new THREE.PointsMaterial({
    color: 0xc2e4ef,
    size: 0.85,
    transparent: true,
    opacity: 0.65,
    fog: false,
    depthWrite: false,
  });
  materials.add(starMaterial);
  const stars = new THREE.Points(starGeometry, starMaterial);
  group.add(stars);

  let disposed = false;
  return {
    group,
    setPhotographicSky(enabled) {
      sky.visible = stars.visible = !enabled;
      hillMaterial.color.set(enabled ? 0x607a7a : 0x233e4c);
    },
    update(time, reducedMotion = false) {
      if (disposed || reducedMotion) return;
      orbit.rotation.z = time * 0.035;
      orbit2.rotation.y = 0.6 + time * 0.055;
      beams.rotation.y = time * 0.13;
      lens.emissiveIntensity = 1.15 + Math.sin(time * 0.7) * 0.12;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.remove(group);
      geometries.forEach((value) => value.dispose());
      materials.forEach((value) => value.dispose());
      textures.forEach((value) => value.dispose());
    },
  };
}
