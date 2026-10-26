import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { configureModelLoader } from "./model-loading.js";
import { formatBytes } from "./showcase.js";

/** Counts from the loaded scene, so the panel reports what is really displayed. */
export function describeScene(root, animations = []) {
  let triangles = 0, meshes = 0;
  const materials = new Set(), textures = new Set();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes++;
    const geometry = object.geometry;
    const count = geometry.index ? geometry.index.count : geometry.getAttribute("position")?.count || 0;
    triangles += Math.floor(count / 3) * (object.isInstancedMesh ? object.count : 1);
    for (const material of [object.material].flat().filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  return { triangles, meshes, materials: materials.size, textures: textures.size, animations: animations.map((clip) => clip.name || "Animation"), size };
}

/**
 * The showcase's 3D viewer. One WebGL renderer exists only while a model is
 * open; closing the dialog releases it and the model.
 */
export function createModelViewer({ dialog, onVisitProject, onFlyToModel, onClose }) {
  const $ = (id) => dialog.querySelector(`#${id}`);
  const canvas = $("viewer-canvas");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let renderer = null, scene = null, camera = null, controls = null, loader = null, environment = null;
  let model = null, root = null, mixer = null, frame = 0, clock = null, request = 0, current = null;
  let wireframe = false;

  function setStatus(message) {
    $("viewer-status").textContent = message || "";
    $("viewer-status").hidden = !message;
  }
  function setup() {
    if (renderer) return true;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    } catch {
      renderer = null;
      return false;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.7;
    scene.add(new THREE.HemisphereLight(0xdcefff, 0x6a6150, 0.8));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.normalBias = 0.02;
    scene.add(key, key.target);
    scene.userData.key = key;
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.3 }));
    catcher.receiveShadow = true;
    scene.add(catcher);
    scene.userData.catcher = catcher;
    camera = new THREE.PerspectiveCamera(35, 1, 0.01, 2000);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotateSpeed = 1.2;
    loader = configureModelLoader(new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), renderer);
    clock = new THREE.Timer();
    return true;
  }
  function resize() {
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
    camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  function loop() {
    frame = requestAnimationFrame(loop);
    if (document.hidden) return;
    clock.update();
    const dt = Math.min(clock.getDelta(), 0.1);
    mixer?.update(dt);
    controls.update(dt);
    renderer.render(scene, camera);
  }
  function frameModel() {
    const box = new THREE.Box3().setFromObject(root);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(sphere.radius, 0.001);
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.08;
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).add(new THREE.Vector3(0.62, 0.38, 0.9).normalize().multiplyScalar(distance));
    camera.near = radius / 100;
    camera.far = radius * 60;
    camera.updateProjectionMatrix();
    controls.minDistance = radius * 0.35;
    controls.maxDistance = radius * 8;
    controls.update();
    const key = scene.userData.key;
    key.target.position.copy(sphere.center);
    key.position.copy(sphere.center).add(new THREE.Vector3(-1.2, 2, 1.4).multiplyScalar(radius * 2));
    Object.assign(key.shadow.camera, { left: -radius * 1.6, right: radius * 1.6, top: radius * 1.6, bottom: -radius * 1.6, near: radius * 0.1, far: radius * 8 });
    key.shadow.camera.updateProjectionMatrix();
    const catcher = scene.userData.catcher;
    catcher.position.set(sphere.center.x, box.min.y, sphere.center.z);
    catcher.scale.setScalar(radius * 8);
  }
  function setWireframe(on) {
    wireframe = on;
    $("viewer-wireframe").setAttribute("aria-pressed", String(on));
    root?.traverse((object) => {
      for (const material of [object.material].flat().filter(Boolean)) material.wireframe = on;
    });
  }
  function playClip(index) {
    if (!mixer) return;
    mixer.stopAllAction();
    const clips = root.userData.clips;
    if (clips[index]) mixer.clipAction(clips[index]).play();
    for (const [i, button] of [...$("viewer-clips").children].entries()) button.setAttribute("aria-pressed", String(i === index));
  }
  function stat(label, value) {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    $("viewer-stats").append(term, detail);
  }
  function showStats(details) {
    $("viewer-stats").replaceChildren();
    const number = (value) => Number(value).toLocaleString();
    stat("Triangles", number(details.triangles));
    stat("Meshes", number(details.meshes));
    stat("Materials", number(details.materials));
    stat("Textures", number(details.textures));
    if (details.size) {
      const { x, y, z } = details.size;
      const fixed = (value) => (value >= 10 ? value.toFixed(0) : value.toFixed(2));
      stat("Size (units)", `${fixed(x)} × ${fixed(y)} × ${fixed(z)}`);
    }
    if (model.bytes) stat("File", formatBytes(model.bytes));
  }
  function release() {
    cancelAnimationFrame(frame);
    frame = 0;
    mixer?.stopAllAction();
    mixer = null;
    if (root) {
      scene.remove(root);
      root.traverse((object) => {
        object.geometry?.dispose();
        for (const material of [object.material].flat().filter(Boolean)) {
          for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
          material.dispose();
        }
      });
      root = null;
    }
  }
  function disposeRenderer() {
    release();
    controls?.dispose();
    loader?.dispose?.();
    environment?.dispose();
    scene?.userData.catcher?.geometry.dispose();
    scene?.userData.catcher?.material.dispose();
    renderer?.dispose();
    renderer = scene = camera = controls = loader = environment = null;
  }

  $("viewer-close").addEventListener("click", () => dialog.close());
  $("viewer-rotate").addEventListener("click", () => {
    if (!controls) return;
    controls.autoRotate = !controls.autoRotate;
    $("viewer-rotate").setAttribute("aria-pressed", String(controls.autoRotate));
  });
  $("viewer-wireframe").addEventListener("click", () => setWireframe(!wireframe));
  $("viewer-reset").addEventListener("click", () => root && frameModel());
  $("viewer-visit").addEventListener("click", () => {
    const project = current?.project;
    dialog.close();
    if (project) onVisitProject?.(project);
  });
  $("viewer-fly").addEventListener("click", () => {
    const target = current;
    dialog.close();
    if (target) onFlyToModel?.(target);
  });
  dialog.addEventListener("close", () => {
    ++request;
    disposeRenderer();
    current = null;
    onClose?.();
  });

  return {
    /** Open a showcase record (or any `{ id, title, file }`) in the viewer. */
    async open(record, { number = "", canFly = false } = {}) {
      const token = ++request;
      current = record;
      model = record;
      $("viewer-number").textContent = number ? `MODEL SHOWCASE · ${number}` : "MODEL VIEWER";
      $("viewer-title").textContent = record.title;
      $("viewer-credit").textContent = record.credit ? `By ${record.credit}` : "";
      $("viewer-credit").hidden = !record.credit;
      $("viewer-description").textContent = record.description || "";
      $("viewer-description").hidden = !record.description;
      $("viewer-license").textContent = record.license ? `License: ${record.license}` : "";
      $("viewer-license").hidden = !record.license;
      $("viewer-stats").replaceChildren();
      $("viewer-animations").hidden = true;
      $("viewer-clips").replaceChildren();
      $("viewer-visit").hidden = !record.project;
      $("viewer-fly").hidden = !canFly;
      const local = record.file.startsWith("./");
      $("viewer-download").hidden = !(record.download && local);
      if (record.download && local) {
        $("viewer-download").href = new URL(record.file, document.baseURI).href;
        $("viewer-download").textContent = `Download .glb${record.bytes ? ` (${formatBytes(record.bytes)})` : ""}`;
      }
      $("viewer-source").hidden = !record.source;
      if (record.source) $("viewer-source").href = record.source;
      if (!dialog.open) dialog.showModal();
      $("viewer-close").focus();
      if (!setup()) {
        setStatus("3D graphics aren't available on this device, so the model can't be shown here.");
        return;
      }
      release();
      resize();
      controls.autoRotate = !reducedMotion.matches;
      $("viewer-rotate").setAttribute("aria-pressed", String(controls.autoRotate));
      setWireframe(false);
      setStatus("Loading model…");
      canvas.dataset.state = "loading";
      try {
        const gltf = await loader.loadAsync(new URL(record.file, document.baseURI).href, (event) => {
          if (token === request && event.total) setStatus(`Loading model… ${Math.round((event.loaded / event.total) * 100)}%`);
        });
        if (token !== request || !renderer) {
          gltf.scene.traverse((object) => object.geometry?.dispose());
          return;
        }
        root = gltf.scene;
        root.userData.clips = gltf.animations;
        root.traverse((object) => {
          if (object.isMesh) object.castShadow = object.receiveShadow = true;
        });
        scene.add(root);
        frameModel();
        const details = describeScene(root, gltf.animations);
        showStats(details);
        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(root);
          $("viewer-animations").hidden = false;
          gltf.animations.forEach((clip, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = clip.name || `Animation ${index + 1}`;
            button.addEventListener("click", () => playClip(index));
            $("viewer-clips").append(button);
          });
          playClip(0);
        }
        setStatus("");
        canvas.dataset.state = "ready";
        clock.update();
        loop();
      } catch (error) {
        if (token !== request) return;
        canvas.dataset.state = "error";
        setStatus(`This model couldn't be loaded. ${error?.message || ""}`.trim());
      }
    },
    close() {
      if (dialog.open) dialog.close();
    },
  };
}
