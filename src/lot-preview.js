import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const STYLE_IDS = new Set([
  "studio", "arcade", "gallery", "workshop", "tower", "garden",
]);

/** A disposable, event-rendered preview. Create it only while the add dialog is open. */
export function createLotPreview({ canvas, onUnavailable = () => {} }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    canvas.dataset.previewState = "unavailable";
    onUnavailable("Your building style will appear on the lot after approval.");
    return {
      setStyle() {},
      dispose() { delete canvas.dataset.previewState; },
    };
  }
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-7, 7, 6, -6, 0.1, 100);
  camera.position.set(12, 10, 14);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2.8, 0);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.rotateSpeed = 0.6;
  controls.update();
  canvas.style.touchAction = "none";
  canvas.setAttribute("aria-label", "Building preview. Drag to rotate.");

  scene.add(new THREE.HemisphereLight(0xdcefff, 0xa0a8a2, 2.7));
  const key = new THREE.DirectionalLight(0xffe6bd, 3);
  key.position.set(8, 14, 8);
  key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 10, bottom: -8 });
  key.shadow.mapSize.set(512, 512);
  key.shadow.bias = -0.001;
  key.shadow.normalBias = 0.04;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc3e6ff, 1.2);
  fill.position.set(-8, 8, -5);
  scene.add(fill);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 0.45, 64),
    new THREE.MeshStandardMaterial({ color: 0xd9e1dc, roughness: 0.85 }),
  );
  base.position.y = -0.23;
  base.receiveShadow = true;
  scene.add(base);
  const edge = new THREE.Mesh(
    new THREE.TorusGeometry(5.8, 0.05, 6, 64),
    new THREE.MeshBasicMaterial({ color: 0x87cdb5 }),
  );
  edge.rotation.x = -Math.PI / 2;
  edge.position.y = 0.015;
  scene.add(edge);

  let disposed = false;
  let selectedStyle = null;
  let request = 0;
  let model = null;
  const loader = new GLTFLoader();
  const cache = new Map();

  function disposeObject(object) {
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    object.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!material) continue;
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value?.isTexture) textures.add(value);
        }
      }
    });
    for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
  }

  function render() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    renderer.setSize(rect.width, rect.height, false);
    const aspect = rect.width / rect.height;
    const height = Math.max(6.3, 6.3 / aspect);
    camera.left = -height * aspect;
    camera.right = height * aspect;
    camera.top = height + 0.2;
    camera.bottom = -height + 0.2;
    camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
  }
  controls.addEventListener("change", render);
  const resizeObserver = new ResizeObserver(render);
  resizeObserver.observe(canvas);

  function display(object) {
    if (model) scene.remove(model);
    model = object;
    scene.add(model);
    render();
  }

  function setStyle(id) {
    if (disposed || !STYLE_IDS.has(id) || id === selectedStyle) return;
    selectedStyle = id;
    const revision = ++request;
    canvas.dataset.previewStyle = id;
    canvas.dataset.previewState = "loading";
    if (cache.has(id)) {
      display(cache.get(id));
      canvas.dataset.previewState = "ready";
      return;
    }
    const url = new URL(`./assets/city-upgrade/styles/${id}.glb`, document.baseURI).href;
    loader.loadAsync(url).then((gltf) => {
      const object = gltf.scene;
      if (disposed) {
        disposeObject(object);
        return;
      }
      const bounds = new THREE.Box3().setFromObject(object);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = Math.min(7 / Math.max(size.x, size.z, 0.001), 7.7 / Math.max(size.y, 0.001));
      object.scale.multiplyScalar(scale);
      object.position.add(new THREE.Vector3(-center.x * scale, -bounds.min.y * scale + 0.02, -center.z * scale));
      object.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      });
      cache.set(id, object);
      if (revision === request) {
        display(object);
        canvas.dataset.previewState = "ready";
      }
    }).catch(() => {
      if (!disposed && revision === request) {
        if (model) scene.remove(model);
        model = null;
        canvas.dataset.previewState = "unavailable";
        onUnavailable("Preview unavailable. Your chosen building can still be submitted.");
        render();
      }
    });
  }

  render();
  return {
    setStyle,
    dispose() {
      if (disposed) return;
      disposed = true;
      request++;
      controls.removeEventListener("change", render);
      controls.dispose();
      resizeObserver.disconnect();
      for (const object of cache.values()) disposeObject(object);
      cache.clear();
      disposeObject(base);
      disposeObject(edge);
      key.shadow.dispose();
      renderer.dispose();
      // The dialog reuses this canvas. Losing its context would break reopening.
      scene.clear();
      delete canvas.dataset.previewStyle;
      delete canvas.dataset.previewState;
    },
  };
}
