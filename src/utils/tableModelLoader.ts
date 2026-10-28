import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const TABLE_MODEL_URL = '/models/billiards_table.glb';

// 启用 Three.js 内置缓存，加速 FileLoader 内部请求
THREE.Cache.enabled = true;

let bufferPromise: Promise<ArrayBuffer | null> | null = null;
let cachedBuffer: ArrayBuffer | null = null;
let sharedDracoLoader: DRACOLoader | null = null;

export function resetTableModelLoader(): void {
  if (sharedDracoLoader) {
    try {
      sharedDracoLoader.dispose();
    } catch (e) {
      console.warn('[tableModelLoader] Failed to dispose sharedDracoLoader:', e);
    }
    sharedDracoLoader = null;
  }
  bufferPromise = null;
  cachedBuffer = null;
  THREE.Cache.clear();
}

function getDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    const basePath = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';
    const decoderPath = `${basePath.endsWith('/') ? basePath : `${basePath}/`}draco/gltf/`;
    sharedDracoLoader.setDecoderPath(decoderPath);
  }
  return sharedDracoLoader;
}

function configureLoader(loader: GLTFLoader): void {
  loader.setDRACOLoader(getDracoLoader());
  loader.setMeshoptDecoder(MeshoptDecoder);
}

/**
 * 在后台前置预加载球台 GLB 二进制数据，保存在内存中
 */
export function preloadTableModel(): Promise<ArrayBuffer | null> {
  if (cachedBuffer) return Promise.resolve(cachedBuffer);
  if (!bufferPromise) {
    bufferPromise = fetch(TABLE_MODEL_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${TABLE_MODEL_URL}`);
        return res.arrayBuffer();
      })
      .then((buffer) => {
        cachedBuffer = buffer;
        return buffer;
      })
      .catch((err) => {
        console.warn('Failed to preload table model:', err);
        bufferPromise = null;
        return null;
      });
  }
  return bufferPromise;
}

/**
 * 加载并解析球台 GLTF 模型。
 * 若内存中已有预加载的 ArrayBuffer，则直接免网络请求异步解析（通常只需 ~30ms）；
 * 否则优雅降级至基于浏览器的 loadAsync。
 */
export async function loadTableGLTF(): Promise<GLTF> {
  const loader = new GLTFLoader();
  configureLoader(loader);
  try {
    if (cachedBuffer) {
      return await loader.parseAsync(cachedBuffer.slice(0), '');
    }
    if (bufferPromise) {
      const buffer = await bufferPromise;
      if (buffer) {
        return await loader.parseAsync(buffer.slice(0), '');
      }
    }
    return await loader.loadAsync(TABLE_MODEL_URL);
  } catch (error) {
    // 解码或网络加载失败时，重置共享解码器与缓存，避免重试时复用内部已处于 rejected 态的 Promise
    resetTableModelLoader();
    throw error;
  }
}
