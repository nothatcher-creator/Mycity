import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOT_STYLES, defaultLotStyle } from './lot-styles.js';

const BASE = './assets/city-upgrade/';
const assetUrl = (path) => new URL(BASE + path, document.baseURI).href;

/** Only local, reviewed prefab paths are accepted. Original exteriors always win. */
export function cityBuildingSource(project) {
  if (!project) return null;
  if (project.exterior?.model) return project.exterior.model;
  const style = LOT_STYLES.find((entry) => entry.id === project.lotStyle)
    || LOT_STYLES.find((entry) => entry.id === defaultLotStyle(project.district));
  return style?.model || null;
}

/** Optional downloaded scenery. Procedural fallbacks survive network/graphics failures. */
export function createCityResources({ renderer, scene, visuals, onChange }) {
  let disposed = false;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const groups = new Set();
  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x647076, roughness: 0.95, metalness: 0 });
  materials.add(roadMaterial);
  let environmentTarget = null;
  const changed = () => { if (!disposed) onChange?.(); };
  const remember = (root) => root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });

  // Shared world-space UVs keep asphalt's photographed detail consistent across avenues.
  function roads(transforms) {
    const pieces = transforms.map(({ p, s }) => {
      const geometry = new THREE.BoxGeometry(...s);
      geometry.translate(...p);
      const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < positions.count; i++) {
        if (Math.abs(normals.getY(i)) > 0.5) uv.setXY(i, positions.getX(i) / 5, positions.getZ(i) / 5);
        else if (Math.abs(normals.getX(i)) > 0.5) uv.setXY(i, positions.getZ(i) / 5, positions.getY(i) / 5);
        else uv.setXY(i, positions.getX(i) / 5, positions.getY(i) / 5);
      }
      return geometry;
    });
    const geometry = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, roadMaterial);
    mesh.name = 'Downloaded-PBR-asphalt';
    mesh.receiveShadow = true;
    scene.add(mesh); groups.add(mesh);
    for (const [channel, file] of [['map', 'asphalt_02_diff_1k.jpg'], ['normalMap', 'asphalt_02_nor_gl_1k.jpg'], ['roughnessMap', 'asphalt_02_rough_1k.jpg']]) {
      textureLoader.load(assetUrl('surfaces/' + file), (texture) => {
        if (disposed) { texture.dispose(); return; }
        textures.add(texture);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        if (channel === 'map') texture.colorSpace = THREE.SRGBColorSpace;
        roadMaterial[channel] = texture;
        roadMaterial.normalScale.set(0.45, 0.45);
        roadMaterial.needsUpdate = true;
        changed();
      }, undefined, () => {});
    }
    return mesh;
  }

  // Flatten each primitive once and instance it across the city (not a mesh per tree).
  async function props(file, transforms, { height, width = Infinity, fallback } = {}) {
    if (!transforms.length) return;
    try {
      const gltf = await loader.loadAsync(assetUrl('props/' + file + '.glb'));
      remember(gltf.scene);
      if (disposed) { disposeTracked(); return; }
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
      const hdr = await new HDRLoader().loadAsync(assetUrl('surfaces/kloppenheim_06_puresky_1k.hdr'));
      if (disposed) { hdr.dispose(); return; }
      textures.add(hdr);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      try { environmentTarget = pmrem.fromEquirectangular(hdr); } finally { pmrem.dispose(); }
      scene.environment = environmentTarget.texture;
      scene.environmentIntensity = 0.75;
      scene.background = hdr;
      scene.backgroundIntensity = 0.72;
      scene.backgroundBlurriness = 0.02;
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
    roads,
    decorate({ city, lots, trunks, crowns, fallbackTrees, fallbackCrowns, fallbackLamps, fallbackLampHeads }) {
      const trees = trunks.map((tree, i) => ({ p: [tree.p[0], 0.42, tree.p[2]], r: i * 2.399, scale: crowns[i]?.s[1] / 1.6 || 1 }));
      // Both downloaded species replace the shared fallback only after both are ready.
      Promise.all([props('tree_oak', trees.filter((_, i) => i % 2 === 0), { height: 4.4, width: 3.2 }), props('tree_pineRoundA', trees.filter((_, i) => i % 2 === 1), { height: 4.4, width: 3.2 })]).then(() => {
        // Failure keeps the procedural canopy, so every lot still has vegetation.
        if (!disposed && [...groups].filter((group) => group.name.startsWith('Downloaded-tree_')).length === 2) {
          fallbackTrees.visible = fallbackCrowns.visible = false; changed();
        }
      });
      props('streetlight', lots.map((lot) => ({ p: [lot.position.x - 6.5, 0.43, lot.position.z + 6.5], r: Math.PI / 2 })), { height: 4.6, width: 2.1 }).then(() => {
        if (!disposed && [...groups].some((group) => group.name === 'Downloaded-streetlight')) {
          fallbackLamps.visible = fallbackLampHeads.visible = false; changed();
        }
      });
      const benches = [], bushes = [], bins = [], hydrants = [], cars = [];
      for (const district of city.districts) {
        const [cx, cz] = district.center, width = district.columns * district.spacing + 6;
        const depth = Math.ceil(district.slotCount / district.columns) * district.spacing + 6;
        for (let i = 0; i < 4; i++) {
          const x = cx + (i - 1.5) * Math.min(width / 5, 18), z = cz + depth / 2 + 8.8;
          benches.push({ p: [x, 0.12, z], r: Math.PI });
          bushes.push({ p: [x - 2.8, 0.12, z], r: i });
          bins.push({ p: [x + 2.7, 0.12, z], r: 0 });
        }
        hydrants.push({ p: [cx - width / 2 - 0.5, 0.12, cz + depth / 2 + 1], r: 0 });
        for (let i = 0; i < 3; i++) cars.push({ p: [cx - width / 2 - 5.8, 0.18, cz + (i - 1) * 12], r: 0 });
      }
      for (let i = 0; i < 8; i++) {
        const angle = (i + 0.5) / 8 * Math.PI * 2;
        benches.push({ p: [Math.sin(angle) * 32.8, 0.34, Math.cos(angle) * 32.8], r: angle + Math.PI });
        bushes.push({ p: [Math.sin(angle) * 37.6, 0.18, Math.cos(angle) * 37.6], r: angle });
      }
      props('bench', benches, { height: 1.25, width: 3.5 });
      props('bush', bushes, { height: 1.4, width: 2.7 });
      props('trash_A', bins, { height: 1.15, width: 1 });
      props('firehydrant', hydrants, { height: 0.95, width: 0.65 });
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
