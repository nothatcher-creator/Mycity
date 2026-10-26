import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

/**
 * Teach a GLTFLoader the common compressed formats. The decoders are copied
 * into /vendor/ at build time and only fetched when a model actually needs them.
 */
export function configureModelLoader(loader, renderer) {
  const vendor = new URL("./vendor/", document.baseURI).href;
  const draco = new DRACOLoader().setDecoderPath(`${vendor}draco/`);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${vendor}basis/`);
  try {
    ktx2.detectSupport(renderer);
  } catch {
    /* Without texture compression support KTX2 models report an error instead. */
  }
  loader.setDRACOLoader(draco).setKTX2Loader(ktx2);
  loader.dispose = () => {
    draco.dispose();
    ktx2.dispose();
  };
  return loader;
}
