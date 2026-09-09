import { ed25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export const RECOVERY_VERSION = 'poolpoker-recovery-v1';
export const normalizePhrase = (phrase: string) => phrase.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
export const createRecoveryPhrase = () => generateMnemonic(wordlist, 128);
function key(phrase: string): Uint8Array {
  const normalized = normalizePhrase(phrase);
  if (normalized.split(' ').length !== 12 || !validateMnemonic(normalized, wordlist))
    throw new Error('请输入有效的 12 个恢复单词');
  const seed = mnemonicToSeedSync(normalized);
  try {
    return hkdf(sha256, seed, utf8ToBytes(RECOVERY_VERSION), utf8ToBytes('account-recovery-signing'), 32);
  } finally {
    seed.fill(0);
  }
}
export function recoveryPublicKey(phrase: string): string {
  const secret = key(phrase);
  try {
    return bytesToHex(ed25519.getPublicKey(secret));
  } finally {
    secret.fill(0);
  }
}
export function signRecovery(phrase: string, message: string): string {
  const secret = key(phrase);
  try {
    return bytesToHex(ed25519.sign(utf8ToBytes(message), secret));
  } finally {
    secret.fill(0);
  }
}
export function verifyRecovery(publicKey: string, signature: string, message: string): boolean {
  try {
    return ed25519.verify(hexToBytes(signature), utf8ToBytes(message), hexToBytes(publicKey));
  } catch {
    return false;
  }
}
