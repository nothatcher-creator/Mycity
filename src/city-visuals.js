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
  const stone = material(0xb9b4a5, { roughness: 0.88, metalness: 0 });
  const paving = material(0xc4bdac, { roughness: 0.88, metalness: 0 });
  const lawn = material(0x596c3b, { roughness: 0.98, metalness: 0 });
  const foliage = material(0x556342, { roughness: 0.96, metalness: 0 });
  const sage = material(0x788064, { roughness: 0.94, metalness: 0 });
  const gravel = material(0x9b9786, { roughness: 0.96, metalness: 0 });
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
  const pavedMeshes = [], grassMeshes = [];

  function surfaceUV(shape, scale = 4, transform = null) {
    const points = shape.getAttribute("position");
    const uv = shape.getAttribute("uv");
    const point = new THREE.Vector3();
    for (let i = 0; i < points.count; i++) {
      point.fromBufferAttribute(points, i);
      if (transform) point.applyMatrix4(transform);
      uv.setXY(i, point.x / scale, point.z / scale);
    }
    return shape;
  }

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
    surfaceUV(value.geometry, surface === lawn ? 5 : 4, value.matrix.makeRotationX(-Math.PI / 2));
    if (surface === paving) pavedMeshes.push(value);
    if (surface === lawn) grassMeshes.push(value);
    return value;
  }

  // A circular water garden unites the five avenues around the city center.
  mesh(cylinder, dark, [0, -0.28, 0], [35.5, 0.5, 35.5]);
  const islandGeometry = geometry(new THREE.CylinderGeometry(23.7, 23.7, 0.35, 96));
  surfaceUV(islandGeometry);
  const island = mesh(islandGeometry, paving, [0, 0.02, 0]);
  pavedMeshes.push(island);
  ring(31.1, 35.4, 0.04, paving);
  ring(34.95, 35.4, 0.07, gravel);
  ring(22.9, 23.8, 0.23, stone);
  ring(30.35, 31.1, 0.19, stone);
  ring(23.7, 30.8, -0.17, material(0x304b46, { roughness: 1, metalness: 0 }));
  const water = material(0x254c4d, { roughness: 0.18, metalness: 0.08, envMapIntensity: 1.5 });
  const waterTime = { value: 0 };
  water.onBeforeCompile = (shader) => {
    shader.uniforms.uPondTime = waterTime;
    shader.vertexShader = "varying vec3 vPondPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvPondPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = "varying vec3 vPondPosition; uniform float uPondTime;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
      float rippleX = cos(vPondPosition.x * 3.2 + vPondPosition.z * 2.4 + uPondTime * .42) * .014 + cos(vPondPosition.x * 1.8 - vPondPosition.z * 2.5 - uPondTime * .31) * .01;
      float rippleZ = sin(vPondPosition.x * 2.3 - vPondPosition.z * 3.8 + uPondTime * .36) * .016;
      normal = normalize(mat3(viewMatrix) * vec3(rippleX, 1.0, rippleZ));`);
  };
  water.customProgramCacheKey = () => "beacon-pond-ripples-v1";
  ring(23.8, 30.35, -0.015, water);
  ring(24.05, 24.11, 0.035, bronze);
  ring(30.12, 30.18, 0.035, bronze);

  // Four garden rooms break up the plaza, keeping all sculpture approaches open.
  const gardenShrubs = [], gardenSage = [], gardenFlowers = [], gravelStones = [];
  const innerCurb = stone.clone();
  innerCurb.side = THREE.BackSide;
  materials.add(innerCurb);
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const start = quadrant * Math.PI / 2 + 0.36;
    const length = Math.PI / 2 - 0.72;
    const rimGeometry = geometry(new THREE.RingGeometry(11.6, 22.15, 28, 1, start, length));
    const rim = mesh(rimGeometry, stone, [0, 0.37, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    rim.castShadow = false;
    mesh(geometry(new THREE.CylinderGeometry(22.15, 22.15, .28, 28, 1, true, start + Math.PI / 2, length)), stone, [0, .23, 0]);
    mesh(geometry(new THREE.CylinderGeometry(11.6, 11.6, .175, 28, 1, true, start + Math.PI / 2, length)), innerCurb, [0, .2825, 0]);
    for (const angle of [start, start + length]) {
      mesh(box, stone, [Math.cos(angle) * 16.875, .23, -Math.sin(angle) * 16.875], [10.55, .28, .16], [0, angle, 0]);
    }
    const bedGeometry = geometry(new THREE.RingGeometry(12, 21.75, 28, 1, start + 0.018, length - 0.036));
    const bed = mesh(bedGeometry, lawn, [0, 0.40, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    surfaceUV(bed.geometry, 5, bed.matrix.makeRotationX(-Math.PI / 2));
    grassMeshes.push(bed);
    bed.castShadow = false;
    for (let i = 0; i < 8; i++) {
      const angle = start + 0.12 + i * (length - 0.24) / 7;
      const radius = 19.8 + Math.sin(i * 1.7 + quadrant) * 0.6;
      const x = Math.cos(angle) * radius, z = -Math.sin(angle) * radius;
      gardenShrubs.push({ position: [x, 0.78, z], scale: [0.73, 0.65, 0.66], rotation: [0, i, 0] });
      gardenSage.push({ position: [x * .91, 0.67, z * .91], scale: [.43, .44, .43], rotation: [0, i, .13] });
      if (i % 2 === 0) gardenFlowers.push({ position: [x * .96, 1.04, z * .96], scale: [.13, .18, .13] });
    }
    for (let i = 0; i < 4; i++) {
      const angle = start + 0.16 + i * (length - 0.32) / 3;
      gravelStones.push({ position: [Math.cos(angle) * 13, .49, -Math.sin(angle) * 13], scale: [.4 + i * .08, .2, .3], rotation: [.1, i * .8, .2] });
    }
  }
  const shrubGeometry = geometry(new THREE.IcosahedronGeometry(1, 1));
  instances(shrubGeometry, foliage, gardenShrubs);
  instances(shrubGeometry, sage, gardenSage);
  instances(sphere, material(0xb5a274, { roughness: .9, metalness: 0 }), gardenFlowers);
  instances(shrubGeometry, gravel, gravelStones);

  // Low broad steps and narrow inlays give the beacon a deliberate foreground.
  ring(9.4, 10.05, 0.34, stone);
  ring(10.05, 10.55, 0.20, gravel);
  ring(10.55, 10.64, 0.21, bronze);
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
  instances(box, stone, bridges);
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
    opacity: 0.15,
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
    opacity: 0.012,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beamGeometry = geometry(new THREE.ConeGeometry(3.5, 28, 16, 1, true));
  const beamA = mesh(
    beamGeometry,
    beamMaterial,
    [14, 0, 0],
    [1, 1, 1],
    [0, 0, Math.PI / 2],
    beams,
  );
  const beamB = mesh(
    beamGeometry,
    beamMaterial,
    [-14, 0, 0],
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
    [0, 19],
  ];
  instances(
    cylinder,
    dark,
    motifs.map(([x, z]) => ({
      position: [x, 0.7, z],
      scale: [z === 19 ? 3.9 : 4.5, 0.85, z === 19 ? 3.9 : 4.5],
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
    geometry(new THREE.TorusGeometry(2.55, 0.095, 6, 48)),
    bronze,
    [0, 3.6, 19],
  );
  const waveform = [];
  for (let i = 0; i < 17; i++) {
    const x = (i - 8) * 0.235;
    const height = 0.4 + Math.pow(Math.sin(i * 0.77), 2) * 2.65;
    waveform.push({ position: [x, 3.6, 19], scale: [0.12, height, 0.16] });
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

  // A fallback sky and low rolling ridges frame the neighborhoods without dominating them.
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      top: { value: new THREE.Color(0x7299b6) },
      horizon: { value: new THREE.Color(0xe2c7a0) },
      bottom: { value: new THREE.Color(0x8f9a83) },
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
  const distantHills = [];
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2;
    const radius = 510 + Math.sin(i * 1.9) * 22;
    hills.push({
      position: [Math.cos(angle) * radius, -8, Math.sin(angle) * radius],
      scale: [128 + Math.sin(i * 2.3) * 28, 18 + Math.cos(i * 1.4) * 7, 105],
      rotation: [0, i * 0.41, 0],
    });
    distantHills.push({
      position: [Math.cos(angle + .1) * (radius + 160), -11, Math.sin(angle + .1) * (radius + 160)],
      scale: [175 + Math.sin(i) * 30, 26 + Math.sin(i * .8) * 9, 145],
      rotation: [0, i * .61, 0],
    });
  }
  const hillMaterial = material(0x6f7d68, { roughness: 1, metalness: 0 });
  const distantHillMaterial = material(0x97a18c, { roughness: 1, metalness: 0 });
  const hillGeometry = geometry(new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2));
  const hillMesh = instances(
    hillGeometry,
    hillMaterial,
    hills,
  );
  const distantHillMesh = instances(hillGeometry, distantHillMaterial, distantHills);
  hillMesh.castShadow = distantHillMesh.castShadow = false;
  hillMesh.receiveShadow = distantHillMesh.receiveShadow = false;
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
    setSurfaceMaterials({ pavers, grass } = {}) {
      if (pavers) for (const value of pavedMeshes) value.material = pavers;
      if (grass) for (const value of grassMeshes) value.material = grass;
    },
    setPhotographicSky(enabled) {
      sky.visible = stars.visible = !enabled;
      hillMaterial.color.set(enabled ? 0x71816b : 0x647665);
      distantHillMaterial.color.set(enabled ? 0x9ba58e : 0x8c9c88);
    },
    update(time, reducedMotion = false) {
      if (disposed || reducedMotion) return;
      orbit.rotation.z = time * 0.035;
      orbit2.rotation.y = 0.6 + time * 0.055;
      beams.rotation.y = time * 0.13;
      lens.emissiveIntensity = 1.15 + Math.sin(time * 0.7) * 0.12;
      waterTime.value = time;
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
