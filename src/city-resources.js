import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY_LOOK } from './city-look.js';

const BASE = './assets/city-upgrade/';
const assetUrl = (path) => new URL(BASE + path, document.baseURI).href;

// Only local, reviewed prefab paths are accepted. Original exteriors always win.
export { cityBuildingSource } from './lot-sources.js';

/** Optional downloaded scenery. Procedural fallbacks survive network/graphics failures. */
export function createCityResources({ renderer, scene, visuals, onChange }) {
  let disposed = false;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const groups = new Set();
  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const surfaceMaterials = new Map();
  const SURFACES = {
    road: { prefix: 'asphalt_02', fallback: 0x38464b, tint: 0xc6c6c6, normal: 0.28, scale: 5 },
    pavers: { prefix: 'concrete_pavers', fallback: 0xc1b9a8, tint: 0xf3eadb, normal: 0.42, scale: 4 },
    grass: { prefix: 'grass_ground', fallback: 0x627850, tint: 0xc0e0bb, normal: 0.24, scale: 5 },
  };
  let environmentTarget = null;
  const changed = () => { if (!disposed) onChange?.(); };
  const remember = (root) => root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });

  /** Shared, lazily loaded PBR materials. All maps use UV coordinates supplied by geometry. */
  function material(kind) {
    const profile = SURFACES[kind];
    if (!profile) throw new Error(`Unknown city surface: ${kind}`);
    if (surfaceMaterials.has(kind)) return surfaceMaterials.get(kind);
    const value = new THREE.MeshStandardMaterial({ color: profile.fallback, roughness: 1, metalness: 0 });
    value.name = `City-PBR-${kind}`;
    value.normalScale.setScalar(profile.normal);
    materials.add(value);
    surfaceMaterials.set(kind, value);
    const channels = [['map', 'diff'], ['normalMap', 'nor_gl'], ['roughnessMap', 'rough']];
    const pending = channels.map(async ([channel, suffix]) => {
      const texture = await textureLoader.loadAsync(assetUrl(`surfaces/${profile.prefix}_${suffix}_1k.jpg`));
      if (disposed) { texture.dispose(); return null; }
      textures.add(texture);
      return { channel, texture };
    });
    // Wait for all channels, including failures, before changing the shader's map defines.
    Promise.allSettled(pending).then((results) => {
      if (disposed) return; // disposeTracked or the individual request already released every loaded texture.
      let loaded = false;
      for (const result of results) {
        if (result.status !== 'fulfilled' || !result.value) continue;
        const { channel, texture } = result.value;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        if (channel === 'map') {
          texture.colorSpace = THREE.SRGBColorSpace;
          value.color.setHex(profile.tint);
        }
        value[channel] = texture;
        loaded = true;
      }
      if (loaded) {
        value.needsUpdate = true;
        changed();
      }
    });
    return value;
  }

  /** Merge the boxes once; world-space UVs prevent stretched detail on long avenues. */
  function surface(kind, transforms, { uvScale = SURFACES[kind]?.scale } = {}) {
    if (!transforms.length) return null;
    const pieces = transforms.map(({ p, s, r = 0 }) => {
      const geometry = new THREE.BoxGeometry(...s);
      if (r) geometry.rotateY(r);
      geometry.translate(...p);
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(normals.getY(i)) > 0.5) uv.setXY(i, positions.getX(i) / uvScale, positions.getZ(i) / uvScale);
        else if (Math.abs(normals.getX(i)) > 0.5) uv.setXY(i, positions.getZ(i) / uvScale, positions.getY(i) / uvScale);
        else uv.setXY(i, positions.getX(i) / uvScale, positions.getY(i) / uvScale);
      }
      return geometry;
    });
    const geometry = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material(kind));
    mesh.name = `Downloaded-PBR-${kind}`;
    mesh.receiveShadow = true;
    scene.add(mesh); groups.add(mesh);
    return mesh;
  }

  // Flatten each primitive once and instance it across the city (not a mesh per tree).
  async function props(file, transforms, { height, width = Infinity, fallback } = {}) {
    if (!transforms.length) return;
    try {
      const gltf = await loader.loadAsync(assetUrl('props/' + file + '.glb'));
      remember(gltf.scene);
      if (disposed) { disposeTracked(); return; }
      if (file.startsWith('tree_')) {
        // A gentle material tint grounds the pastel palette without changing the downloaded textures.
        const treeMaterials = new Set();
        gltf.scene.traverse((part) => {
          for (const value of (Array.isArray(part.material) ? part.material : [part.material]).filter(Boolean)) treeMaterials.add(value);
        });
        treeMaterials.forEach((value) => value.color?.multiply(new THREE.Color(0xd6dcae)));
      }
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3());
      const scale = Math.min(height / Math.max(size.y, 0.01), width / Math.max(size.x, size.z, 0.01));
      const normalize = new THREE.Matrix4().makeScale(scale, scale, scale)
        .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
      const group = new THREE.Group(); group.name = 'Downloaded-' + file;
      const object = new THREE.Object3D();
      gltf.scene.traverse((part) => {
        if (!part.isMesh) return;
        const geometry = part.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, part.matrixWorld));
        geometries.add(geometry);
        const batch = new THREE.InstancedMesh(geometry, part.material, transforms.length);
        transforms.forEach((transform, index) => {
          object.position.set(...transform.p);
          object.rotation.set(0, transform.r || 0, 0);
          object.scale.setScalar(transform.scale || 1);
          object.updateMatrix(); batch.setMatrixAt(index, object.matrix);
        });
        batch.castShadow = true; batch.receiveShadow = true;
        batch.instanceMatrix.needsUpdate = true;
        batch.computeBoundingSphere(); group.add(batch);
      });
      scene.add(group); groups.add(group);
      if (fallback) fallback.visible = false;
      changed();
    } catch (error) {
      console.info(`City scenery ${file} unavailable; keeping its fallback.`, error.message);
    }
  }

  async function sky() {
    try {
      const hdr = await new HDRLoader().loadAsync(assetUrl('surfaces/qwantani_sunset_puresky_1k.hdr'));
      if (disposed) { hdr.dispose(); return; }
      textures.add(hdr);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      try { environmentTarget = pmrem.fromEquirectangular(hdr); } finally { pmrem.dispose(); }
      scene.environment = environmentTarget.texture;
      scene.environmentIntensity = CITY_LOOK.environment.intensity;
      scene.environmentRotation.y = CITY_LOOK.environment.rotation;
      scene.background = hdr;
      scene.backgroundIntensity = CITY_LOOK.environment.backgroundIntensity;
      scene.backgroundRotation.y = CITY_LOOK.environment.rotation;
      scene.backgroundBlurriness = 0.015;
      visuals.setPhotographicSky(true);
      changed();
    } catch (error) {
      console.info('City HDR sky unavailable; keeping its procedural sky.', error.message);
    }
  }
  function disposeTracked() {
    geometries.forEach((value) => value.dispose()); geometries.clear();
    materials.forEach((value) => value.dispose()); materials.clear();
    textures.forEach((value) => value.dispose()); textures.clear();
  }
  sky();
  return {
    material,
    surface,
    roads: (transforms) => surface('road', transforms),
    /** Replace procedural stand-ins with downloaded props at the plan's positions. */
    decorate({ trees, lamps, benches, bushes, bins, cars, fallbackTrees, fallbackCrowns, fallbackLamps, fallbackLampHeads }) {
      const fraction = (value) => value - Math.floor(value);
      const placed = trees.map((tree, i) => {
        const seed = fraction(Math.sin(tree.p[0] * 12.9898 + tree.p[2] * 78.233) * 43758.5453);
        return { p: tree.p, r: i * 2.399 + seed * 0.6, scale: tree.scale || 1, species: seed > 0.46 ? 'oak' : 'pine' };
      });
      // Both downloaded species replace the shared fallback only after both are ready.
      Promise.all([props('tree_oak', placed.filter((tree) => tree.species === 'oak'), { height: 4.4, width: 3.2 }), props('tree_pineRoundA', placed.filter((tree) => tree.species === 'pine'), { height: 4.4, width: 3.2 })]).then(() => {
        // Failure keeps the procedural canopy, so every lot still has vegetation.
        if (!disposed && [...groups].filter((group) => group.name.startsWith('Downloaded-tree_')).length === 2) {
          fallbackTrees.visible = fallbackCrowns.visible = false; changed();
        }
      });
      props('streetlight', lamps, { height: 4.6, width: 2.1 }).then(() => {
        if (!disposed && [...groups].some((group) => group.name === 'Downloaded-streetlight')) {
          fallbackLamps.visible = fallbackLampHeads.visible = false; changed();
        }
      });
      props('bench', benches, { height: 1.25, width: 3.5 });
      props('bush', bushes, { height: 1.4, width: 2.7 });
      props('trash_A', bins, { height: 1.15, width: 1 });
      props('car_sedan', cars.filter((_, i) => i % 2 === 0), { height: 1.5, width: 4.4 });
      props('car_taxi', cars.filter((_, i) => i % 2 === 1), { height: 1.5, width: 4.4 });
    },
    dispose() {
      disposed = true;
      groups.forEach((group) => scene.remove(group)); groups.clear();
      environmentTarget?.dispose();
      disposeTracked();
    },
  };
}
