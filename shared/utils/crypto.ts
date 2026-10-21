/**
 * Cross-platform crypto utilities (Node.js, Browser, QuickJS, WebWorker).
 * Provides CSPRNG randomInt and randomUUID without hard node:crypto dependency.
 */

export function getRandomInt(min: number, max: number): number {
  if (min >= max) return min;
  const range = max - min;

  // 1. Try globalThis.crypto (Web Crypto API / Node 19+ / modern browsers)
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const bytesNeeded = 4;
    const array = new Uint32Array(1);
    globalThis.crypto.getRandomValues(array);
    // Unbiased rejection sampling
    const maxUint32 = 0xffffffff;
    const limit = maxUint32 - (maxUint32 % range);
    let sample = array[0];
    while (sample >= limit) {
      globalThis.crypto.getRandomValues(array);
      sample = array[0];
    }
    return min + (sample % range);
  }

  // 2. Fallback for environments without crypto (fallback PRNG)
  return min + Math.floor(Math.random() * range);
}

export function getRandomUUID(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = getRandomInt(0, 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getRandomHex(bytesLength: number): string {
  let hex = '';
  for (let i = 0; i < bytesLength; i++) {
    const byte = getRandomInt(0, 256);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}
