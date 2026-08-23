import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const srcTauriDir = path.join(rootDir, 'src-tauri');
const androidDir = path.join(rootDir, 'android');

// 1. Resolve ANDROID_HOME
let androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!androidHome) {
  const defaultMacPath = path.join(os.homedir(), 'Library/Android/sdk');
  if (fs.existsSync(defaultMacPath)) {
    androidHome = defaultMacPath;
  }
}

if (!androidHome || !fs.existsSync(androidHome)) {
  console.error('[build-so] Error: ANDROID_HOME environment variable not set or path does not exist.');
  process.exit(1);
}

// 2. Resolve NDK directory
let ndkHome = process.env.NDK_HOME;
if (!ndkHome) {
  const ndkParentDir = path.join(androidHome, 'ndk');
  if (fs.existsSync(ndkParentDir)) {
    const ndkVersions = fs.readdirSync(ndkParentDir).sort().reverse();
    if (ndkVersions.length > 0) {
      ndkHome = path.join(ndkParentDir, ndkVersions[0]);
    }
  }
}

if (!ndkHome || !fs.existsSync(ndkHome)) {
  console.error('[build-so] Error: NDK directory not found under ANDROID_HOME/ndk.');
  process.exit(1);
}

console.log(`[build-so] Using Android SDK: ${androidHome}`);
console.log(`[build-so] Using Android NDK: ${ndkHome}`);

// 3. Resolve toolchain prebuilt bin directory
const llvmBinDir = path.join(ndkHome, 'toolchains/llvm/prebuilt/darwin-x86_64/bin');
if (!fs.existsSync(llvmBinDir)) {
  console.error(`[build-so] Error: LLVM toolchain bin directory not found at ${llvmBinDir}`);
  process.exit(1);
}

const targets = [
  {
    targetTriple: 'aarch64-linux-android',
    envVar: 'CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER',
    linkerName: 'aarch64-linux-android34-clang',
    abiName: 'arm64-v8a',
  },
  {
    targetTriple: 'x86_64-linux-android',
    envVar: 'CARGO_TARGET_X86_64_LINUX_ANDROID_LINKER',
    linkerName: 'x86_64-linux-android34-clang',
    abiName: 'x86_64',
  },
];

for (const target of targets) {
  const linkerPath = path.join(llvmBinDir, target.linkerName);
  if (!fs.existsSync(linkerPath)) {
    console.warn(`[build-so] Warning: Linker ${target.linkerName} not found, skipping ${target.targetTriple}`);
    continue;
  }

  console.log(`[build-so] Compiling Rust shared library for ${target.targetTriple} (${target.abiName})...`);

  const env = {
    ...process.env,
    ANDROID_HOME: androidHome,
    NDK_HOME: ndkHome,
    [target.envVar]: linkerPath,
  };

  try {
    execSync('cargo rustc --lib --target ' + target.targetTriple + ' -- --crate-type cdylib', {
      cwd: srcTauriDir,
      env,
      stdio: 'inherit',
    });

    const compiledSoPath = path.join(
      srcTauriDir,
      'target',
      target.targetTriple,
      'debug',
      'deps',
      'libpoolpoker_lib.so'
    );

    if (!fs.existsSync(compiledSoPath)) {
      console.error(`[build-so] Error: Compiled .so file not found at ${compiledSoPath}`);
      process.exit(1);
    }

    const destDir = path.join(androidDir, 'app/src/main/jniLibs', target.abiName);
    fs.mkdirSync(destDir, { recursive: true });

    const destSoPath = path.join(destDir, 'libpoolpoker_lib.so');
    fs.copyFileSync(compiledSoPath, destSoPath);
    console.log(`[build-so] Successfully copied ${target.abiName}/libpoolpoker_lib.so -> ${destSoPath}`);
  } catch (err) {
    console.error(`[build-so] Failed to compile ${target.targetTriple}:`, err);
    process.exit(1);
  }
}

console.log('[build-so] Rust .so compilation & injection completed successfully!');
