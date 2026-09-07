<script setup lang="ts">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useGameAudio } from '@/composables/useGameAudio';
import { createBallTextureCanvas } from '@/utils/ballTexture';

const props = defineProps<{
  pocketedBallNumbers: number[];
  pendingBallNumbers: number[];
  animationId?: string | null;
  resetKey?: number;
  disabled?: boolean;
  colors?: Record<string, [string, string, string]>;
}>();
const emit = defineEmits<(e: 'ball-click', number: number) => void>();
const { playBallHitSound, playPocketDropSound } = useGameAudio();
const host = ref<HTMLDivElement>();
const ready = ref(false);
const failed = ref(false);
const labels = ref<{ number: number; x: number; y: number; diameter: number; visible: boolean }[]>([]);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const fallbackColors = ['#dbad33', '#2b65a5', '#b64738', '#795592', '#bd6e36', '#367860', '#77392f', '#171c1c'];
let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let observer: ResizeObserver;
let frame = 0;
let environment: THREE.WebGLRenderTarget | undefined;
let disposed = false;
const pockets = [-1, 1].flatMap((x) =>
  [-4.95, 0, 4.95].map((z) => new THREE.Vector3(x * (z === 0 ? 3.05 : 2.9), 0.655, z))
);
interface Ball {
  number: number;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  pendingRing: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  origin: THREE.Vector3;
  restRotation: THREE.Quaternion;
  target: THREE.Vector3;
  start: number | null;
  dropped: boolean;
}
const balls: Ball[] = [];

function ballTexture(n: number) {
  const color = props.colors?.[String(n)]?.[1] || fallbackColors[(n - 1) % 8];
  const texture = new THREE.CanvasTexture(createBallTextureCanvas(n, color));
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function build() {
  if (!host.value) return;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  host.value.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  const envScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  environment = pmrem.fromScene(envScene, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.45;
  envScene.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff2d8, 0x18392b, 0.9));
  const lamp = new THREE.DirectionalLight(0xffefd4, 1.8);
  lamp.position.set(-3, 10, 4);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  Object.assign(lamp.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
  lamp.shadow.normalBias = 0.025;
  scene.add(lamp);
  const wood = new THREE.MeshStandardMaterial({ color: '#493025', roughness: 0.36 });
  const cushion = new THREE.MeshStandardMaterial({ color: '#1e5b48', roughness: 0.9 });
  const clothCanvas = document.createElement('canvas');
  clothCanvas.width = clothCanvas.height = 128;
  const ctx = clothCanvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#235e46';
  ctx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 2) {
    ctx.fillStyle = x % 4 ? '#225b44' : '#27654b';
    ctx.fillRect(x, 0, 1, 128);
    ctx.fillRect(0, x, 128, 0.4);
  }
  const cloth = new THREE.CanvasTexture(clothCanvas);
  cloth.wrapS = cloth.wrapT = THREE.RepeatWrapping;
  cloth.repeat.set(7, 12);
  cloth.colorSpace = THREE.SRGBColorSpace;
  const felt = new THREE.MeshStandardMaterial({ map: cloth, roughness: 1 });
  // Cut the same six openings through the cloth and wooden bed. The dark
  // pocket floor sits below them, rather than covering the cloth with a cylinder.
  const pocketRadius = 0.48 * 0.7;
  const bedShape = (halfWidth: number, halfLength: number, corner: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth + corner, -halfLength);
    shape.lineTo(halfWidth - corner, -halfLength);
    shape.quadraticCurveTo(halfWidth, -halfLength, halfWidth, -halfLength + corner);
    shape.lineTo(halfWidth, halfLength - corner);
    shape.quadraticCurveTo(halfWidth, halfLength, halfWidth - corner, halfLength);
    shape.lineTo(-halfWidth + corner, halfLength);
    shape.quadraticCurveTo(-halfWidth, halfLength, -halfWidth, halfLength - corner);
    shape.lineTo(-halfWidth, -halfLength + corner);
    shape.quadraticCurveTo(-halfWidth, -halfLength, -halfWidth + corner, -halfLength);
    for (const p of pockets) {
      const opening = new THREE.Path();
      opening.absarc(p.x, -p.z, pocketRadius, 0, Math.PI * 2, true);
      shape.holes.push(opening);
    }
    return shape;
  };
  const bed = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bedShape(3.8, 6, 0.38), {
      depth: 0.55,
      bevelEnabled: false,
      curveSegments: 32,
    }),
    wood
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = -0.4;
  bed.castShadow = true;
  bed.receiveShadow = true;
  scene.add(bed);
  const clothGeometry = new THREE.ShapeGeometry(bedShape(3.42, 5.5, 0.12), 48);
  // ShapeGeometry UVs are world-sized; normalize to preserve the cloth weave.
  const uv = clothGeometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 6.84, uv.getY(i) / 11);
  const playingSurface = new THREE.Mesh(clothGeometry, felt);
  playingSurface.rotation.x = -Math.PI / 2;
  playingSurface.position.y = 0.155;
  playingSurface.receiveShadow = true;
  scene.add(playingSurface);

  // Each cushion ends in a sloped jaw that opens toward the pocket mouth.
  const addCushion = (points: [number, number][]) => {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    shape.closePath();
    const mesh = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shape, {
        depth: 0.16,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.045,
        bevelSegments: 3,
      }),
      cushion
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.17;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  // Meet the smaller middle-pocket circle at both ends of each jaw.
  const middleJawRadius = pocketRadius + 0.045; // Allow for the cushion bevel.
  const middleOuterAngle = Math.acos((3.35 - 3.05) / middleJawRadius);
  const middleInnerAngle = Math.acos((2.99 - 3.05) / middleJawRadius);
  const middleOuterJaw = middleJawRadius * Math.sin(middleOuterAngle);
  const middleInnerJaw = middleJawRadius * Math.sin(middleInnerAngle);
  const cornerSideJaw = 4.95 - Math.sqrt(pocketRadius ** 2 - (2.99 - 2.9) ** 2);
  const cornerEndJaw = 2.9 - Math.sqrt(pocketRadius ** 2 - (5.08 - 4.95) ** 2);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      addCushion([
        [side * 3.35, end * middleOuterJaw],
        [side * 3.35, end * 4.77],
        [side * 2.99, end * cornerSideJaw],
        [side * 2.99, end * middleInnerJaw],
        ...Array.from({ length: 8 }, (_, i): [number, number] => {
          const angle = middleInnerAngle + ((middleOuterAngle - middleInnerAngle) * (i + 1)) / 8;
          return [side * (3.05 + middleJawRadius * Math.cos(angle)), end * middleJawRadius * Math.sin(angle)];
        }),
      ]);
    }
    addCushion([
      [-2.9, side * 5.43],
      [2.9, side * 5.43],
      [cornerEndJaw, side * 5.08],
      [-cornerEndJaw, side * 5.08],
    ]);
  }
  const brass = new THREE.MeshStandardMaterial({ color: '#bea979', metalness: 0.65, roughness: 0.35 });
  const pocketTrim = new THREE.MeshStandardMaterial({ color: '#87908e', metalness: 0.45, roughness: 0.5 });
  const pocketLining = new THREE.MeshStandardMaterial({ color: '#101512', roughness: 1, side: THREE.DoubleSide });
  for (const p of pockets) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(pocketRadius, 0.014, 8, 64), pocketTrim);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(p.x, 0.16, p.z);
    scene.add(rim);
    const lining = new THREE.Mesh(
      new THREE.CylinderGeometry(pocketRadius, pocketRadius * 0.84, 0.5, 64, 1, true),
      pocketLining
    );
    lining.position.set(p.x, -0.1, p.z);
    scene.add(lining);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(pocketRadius * 0.86, 64),
      new THREE.MeshBasicMaterial({ color: '#030605' })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(p.x, -0.35, p.z);
    scene.add(floor);
  }
  for (const x of [-3.5, 3.5])
    for (const z of [-3.8, -1.3, 1.3, 3.8]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), brass);
      dot.position.set(x, 0.19, z);
      scene.add(dot);
    }
  for (let n = 1; n <= 15; n++) {
    const origin = new THREE.Vector3((((n - 1) % 3) - 1) * 1.78, 0.655, (Math.floor((n - 1) / 3) - 2) * 2.05);
    const material = new THREE.MeshPhysicalMaterial({
      map: ballTexture(n),
      // Keep a soft resin sheen without washing out the printed numbers.
      roughness: 0.38,
      specularIntensity: 0.25,
      envMapIntensity: 0.15,
      clearcoat: 0.15,
      clearcoatRoughness: 0.35,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), material);
    mesh.position.copy(origin);

    mesh.castShadow = true;
    scene.add(mesh);
    const pendingRing = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.62, 64),
      new THREE.MeshBasicMaterial({ color: '#329cff', toneMapped: false, side: THREE.DoubleSide })
    );
    pendingRing.rotation.x = -Math.PI / 2;
    pendingRing.position.set(origin.x, 0.17, origin.z);
    pendingRing.visible = false;
    scene.add(pendingRing);
    balls.push({
      pendingRing,
      number: n,
      mesh,
      origin,
      restRotation: mesh.quaternion.clone(),
      target: origin.clone(),
      start: null,
      dropped: false,
    });
  }
  sync(false);
  ready.value = true;
  observer = new ResizeObserver(resize);
  observer.observe(host.value);
  resize();
}

function sync(animate: boolean) {
  for (const b of balls) {
    const pocketed = props.pocketedBallNumbers.includes(b.number);
    if (pocketed && animate && b.mesh.visible && b.start === null && !reducedMotion.matches) {
      b.start = performance.now();
      b.dropped = false;
      b.target.copy(pockets.reduce((a, p) => (b.origin.distanceTo(p) < b.origin.distanceTo(a) ? p : a)));
      playBallHitSound();
    } else if (!pocketed || !animate || reducedMotion.matches) {
      b.start = null;
      b.dropped = false;
      b.mesh.visible = !pocketed;
      b.mesh.position.copy(b.origin);
      b.mesh.scale.setScalar(1);
      b.mesh.quaternion.copy(b.restRotation);
    }
  }
  draw();
}
function resize() {
  if (!renderer || !host.value) return;
  const { clientWidth: w, clientHeight: h } = host.value;
  if (!w || !h) return;
  const landscape = w >= 580;
  scene.rotation.y = landscape ? Math.PI / 2 : 0;
  scene.updateMatrixWorld(true);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Fit all four rails to the actual viewport, including short landscape screens.
  for (let distance = 6; distance <= 40; distance += 0.3) {
    camera.position.set(0, distance * 0.92, distance * 0.4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const fits = [-3.9, 3.9].every((x) =>
      [-6.1, 6.1].every((z) => {
        const p = new THREE.Vector3(x, 0, z).applyMatrix4(scene.matrixWorld).project(camera);
        return Math.abs(p.x) < 0.97 && Math.abs(p.y) < 0.96;
      })
    );
    if (fits) break;
  }
  // Face the numbered cap directly toward the viewer in both screen orientations.
  const localCamera = scene.worldToLocal(camera.position.clone());
  for (const b of balls) {
    const orientation = new THREE.Object3D();
    orientation.up.setFromMatrixColumn(camera.matrixWorld, 1).transformDirection(scene.matrixWorld.clone().invert());
    orientation.position.copy(b.origin);
    orientation.lookAt(localCamera);
    b.restRotation.copy(orientation.quaternion);
    if (b.start === null) b.mesh.quaternion.copy(b.restRotation);
  }
  renderer.setSize(w, h);
  draw();
}
function draw() {
  cancelAnimationFrame(frame);
  if (!renderer || !host.value || disposed || failed.value || document.hidden) return;
  const now = performance.now();
  let moving = false;
  for (const b of balls)
    if (b.start !== null) {
      const t = Math.min(1, (now - b.start) / 650);
      const roll = Math.min(1, t / 0.74);
      b.mesh.position.lerpVectors(b.origin, b.target, Math.sin((roll * Math.PI) / 2));
      b.mesh.quaternion
        .setFromEuler(
          new THREE.Euler((roll * (b.target.z - b.origin.z)) / 0.5, 0, (-roll * (b.target.x - b.origin.x)) / 0.5)
        )
        .multiply(b.restRotation);
      if (t > 0.74) {
        const drop = (t - 0.74) / 0.26;
        b.mesh.scale.setScalar(1 - drop);
        b.mesh.position.y = b.origin.y - drop * 0.5;
        if (!b.dropped) {
          b.dropped = true;
          playPocketDropSound();
        }
      }
      if (t === 1) {
        b.start = null;
        b.mesh.visible = false;
      } else moving = true;
    }
  for (const b of balls) {
    b.pendingRing.visible =
      b.mesh.visible &&
      b.start === null &&
      props.pendingBallNumbers.includes(b.number) &&
      !props.pocketedBallNumbers.includes(b.number);
  }
  renderer.render(scene, camera);
  const w = host.value.clientWidth,
    h = host.value.clientHeight;
  labels.value = balls.map((b) => {
    const world = b.mesh.getWorldPosition(new THREE.Vector3());
    const p = world.clone().project(camera);
    const edge = world
      .clone()
      .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), 0.5 * b.mesh.scale.x)
      .project(camera);
    return {
      diameter: Math.abs(edge.x - p.x) * w,
      number: b.number,
      x: ((p.x + 1) * w) / 2,
      y: ((1 - p.y) * h) / 2,
      visible: b.mesh.visible && !b.dropped,
    };
  });
  if (moving) frame = requestAnimationFrame(draw);
}
function onContextLost(e: Event) {
  e.preventDefault();
  failed.value = true;
  ready.value = false;
  cancelAnimationFrame(frame);
}
function visibility() {
  if (document.hidden) cancelAnimationFrame(frame);
  else sync(false);
}
watch(
  () => [props.pocketedBallNumbers, props.animationId, props.resetKey] as const,
  (next, old) => {
    if (next[1] === old[1] && next[2] === old[2] && next[0].join(',') === old[0].join(',')) return;
    sync(next[1] !== old[1] && next[2] === old[2] && !document.hidden);
  }
);
watch(() => props.pendingBallNumbers, draw);
watch(
  () => props.colors,
  () => {
    balls.forEach((b) => {
      b.mesh.material.map?.dispose();
      b.mesh.material.map = ballTexture(b.number);
      b.mesh.material.needsUpdate = true;
    });
    draw();
  }
);
onMounted(() => {
  try {
    build();
  } catch {
    failed.value = true;
  }
  document.addEventListener('visibilitychange', visibility);
});
onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(frame);
  observer?.disconnect();
  document.removeEventListener('visibilitychange', visibility);
  renderer?.domElement.removeEventListener('webglcontextlost', onContextLost);
  scene?.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((m) => {
        if ('map' in m) m.map?.dispose();
        m.dispose();
      });
    }
  });
  environment?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
});
</script>

<template>
  <div ref="host" class="arena" :class="{ 'arena-fallback': failed }" aria-label="球桌，点击球号记录进球">
    <template v-if="ready && !failed">
      <button v-for="ball in labels" :key="ball.number" v-show="ball.visible"
        class="ball-target" :style="{ transform: `translate(${ball.x}px, ${ball.y}px) translate(-50%, -50%)`, '--ball-diameter': `${ball.diameter}px` }"
        :aria-label="`记录 ${ball.number} 号球入袋${pendingBallNumbers.includes(ball.number) ? '，我的待打球' : ''}`" :disabled="disabled || pocketedBallNumbers.includes(ball.number)"
        @click="emit('ball-click', ball.number)"></button>
    </template>
    <div v-else class="fallback-balls">
      <button v-for="n in 15" :key="n" :class="`fallback-ball ball-${n}`"
        :aria-label="`记录 ${n} 号球入袋`" :disabled="disabled || pocketedBallNumbers.includes(n)"
        :style="{ visibility: pocketedBallNumbers.includes(n) ? 'hidden' : 'visible' }"
        @click="emit('ball-click', n)"><span>{{ n }}</span></button>
    </div>
    <span class="table-signature" aria-hidden="true">POOLPOKER · CLUB TABLE</span>
  </div>
</template>

<style scoped>
.arena { position: absolute; inset: 0; width: 100%; height: 100%; isolation: isolate; }
.arena :deep(canvas) { position: absolute; inset: 0; }
.ball-target { position: absolute; top: 0; left: 0; width: 44px; height: 44px; display: grid; place-items: center; cursor: pointer; background: transparent; border: 0; border-radius: 50%; color: #172720; }
.fallback-ball span { display: grid; place-items: center; width: 20px; height: 20px; background: #fff9e8; border-radius: 50%; font: 700 12px Georgia, serif; box-shadow: inset 0 -1px 2px #6b654250; }

.ball-target::after { content: ''; position: absolute; width: var(--ball-diameter); height: var(--ball-diameter); left: 50%; top: 50%; transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none; }
@media (hover: hover) {
  .ball-target:hover:not(:disabled)::after { box-shadow: 0 0 0 2px #e4cca077; }
}
.ball-target:active:not(:disabled)::after { box-shadow: 0 0 0 2px #e4cca099; }
.ball-target:focus-visible { outline: 2px solid #ead8b5; outline-offset: 1px; }
.ball-target:disabled { cursor: default; }
.table-signature { position: absolute; bottom: 5%; left: 0; right: 0; text-align: center; font-size: 8px; letter-spacing: 0.24em; color: #cdb88780; pointer-events: none; }
.fallback-balls { position: absolute; inset: 8% 12%; display: grid; grid-template-columns: repeat(3,1fr); place-items: center; background: #275c48; border: 10px solid #4b3427; border-radius: 18px; }
.fallback-ball { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; box-shadow: inset -4px -5px 6px #0006, 0 4px 5px #0005; }
.arena-fallback :deep(canvas) { display: none; }
</style>
