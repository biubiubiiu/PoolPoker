import * as THREE from 'three';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const TABLE_MODEL_URL = '/models/billiards_table.glb';

// 启用 Three.js 内置缓存，加速 FileLoader 内部请求
THREE.Cache.enabled = true;

let bufferPromise: Promise<ArrayBuffer | null> | null = null;
let cachedBuffer: ArrayBuffer | null = null;

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
  if (cachedBuffer) {
    return loader.parseAsync(cachedBuffer.slice(0), '');
  }
  if (bufferPromise) {
    const buffer = await bufferPromise;
    if (buffer) {
      return loader.parseAsync(buffer.slice(0), '');
    }
  }
  return loader.loadAsync(TABLE_MODEL_URL);
}
