/// <reference types="vite/client" />
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { useChimeAnimationSession } from './chimeAnimationSession';
import type { ChimeAnimation, ThreeClockMode } from './clockMode';

type ThreeClockProps = {
  mode: ThreeClockMode;
  time: Date;
  chimeAnimation: ChimeAnimation | null;
};

type HandRotations = {
  hour: number;
  minute: number;
  second: number;
};

type CuckooAnimation = {
  active: boolean;
  birdOffset: number;
  doorRotation: number;
};

/** One bird cycle lasts exactly one second. */
export const CUCKOO_CYCLE_MILLISECONDS = 1000;

/** The door stands fully open at a quarter turn. */
export const CUCKOO_DOOR_OPEN_RADIANS = Math.PI / 2;

/**
 * The door and the procedural bird grow to this many times their modeled
 * size. The door widens and heightens only, so its depth and hinge stay as
 * modeled, and the bird's size, resting position, and travel scale with it.
 */
export const CUCKOO_ENLARGEMENT_SCALE = 1.5;

const CUCKOO_EXIT_MILLISECONDS = 250;
const CUCKOO_HOLD_MILLISECONDS = 500;
const CUCKOO_RETURN_MILLISECONDS = 750;

const IDLE_CUCKOO_ANIMATION: CuckooAnimation = {
  active: false,
  birdOffset: 0,
  doorRotation: 0,
};

/**
 * Returns the clockwise hand rotations, in radians, for the local time. A
 * rotation of zero points a hand at twelve o'clock, and each hand carries the
 * fraction of the smaller units so the three hands stay synchronized.
 */
export function getHandRotations(date: Date): HandRotations {
  const seconds = date.getSeconds();
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;

  return {
    hour: -(hours / 12) * Math.PI * 2,
    minute: -(minutes / 60) * Math.PI * 2,
    second: -(seconds / 60) * Math.PI * 2,
  };
}

/**
 * Returns the cuckoo door and bird placement for the elapsed time of a chime
 * sequence. Each strike runs one cycle: the door opens and the bird leaves
 * during the first quarter second, the bird waits outside until the half
 * second, the bird returns and the door closes by three quarters of a second,
 * and the door stays closed until the second ends.
 */
export function getCuckooAnimation(
  elapsedMilliseconds: number,
  strikes: number,
): CuckooAnimation {
  if (!Number.isFinite(elapsedMilliseconds) || strikes <= 0) {
    return IDLE_CUCKOO_ANIMATION;
  }

  if (
    elapsedMilliseconds < 0 ||
    elapsedMilliseconds >= strikes * CUCKOO_CYCLE_MILLISECONDS
  ) {
    return IDLE_CUCKOO_ANIMATION;
  }

  const phase = elapsedMilliseconds % CUCKOO_CYCLE_MILLISECONDS;
  let birdOffset = 0;

  if (phase < CUCKOO_EXIT_MILLISECONDS) {
    birdOffset = phase / CUCKOO_EXIT_MILLISECONDS;
  } else if (phase < CUCKOO_HOLD_MILLISECONDS) {
    birdOffset = 1;
  } else if (phase < CUCKOO_RETURN_MILLISECONDS) {
    birdOffset =
      1 -
      (phase - CUCKOO_HOLD_MILLISECONDS) /
        (CUCKOO_RETURN_MILLISECONDS - CUCKOO_HOLD_MILLISECONDS);
  }

  return {
    active: true,
    birdOffset,
    doorRotation: birdOffset * CUCKOO_DOOR_OPEN_RADIANS,
  };
}

type ModelDescription = {
  label: string;
  file: string;
  baseColor: string;
  normal: string;
  roughness?: string;
  metallic?: string;
  occlusionRoughnessMetallic?: string;
  /** The mesh whose front face carries the procedural dial. */
  dialMesh?: string;
  /** The dial radius as a fraction of the face width. */
  dialRadiusRatio: number;
};

const modelDescriptions: Record<ThreeClockMode, ModelDescription> = {
  analog: {
    label: 'analog wall clock',
    file: 'analog/wall-clock.fbx',
    baseColor: 'analog/clock-base-color.png',
    normal: 'analog/clock-normal.png',
    roughness: 'analog/clock-roughness.png',
    metallic: 'analog/clock-metallic.png',
    // The wall clock carries its own printed numerals, so the procedural dial
    // covers them and stops just inside the bezel.
    dialRadiusRatio: 0.46,
  },
  cuckoo: {
    label: 'cuckoo clock',
    file: 'cuckoo/cuckoo-clock.fbx',
    baseColor: 'cuckoo/cuckoo-base-color.png',
    normal: 'cuckoo/cuckoo-normal.png',
    occlusionRoughnessMetallic: 'cuckoo/cuckoo-orm.png',
    dialMesh: 'face',
    // The cuckoo face plate includes its bezel ring, so the dial stays inside
    // it.
    dialRadiusRatio: 0.38,
  },
};

/** The largest dimension of every model fills this many world units. */
const FRAME_SIZE = 2.4;

const CAMERA_DISTANCE = 4.4;

type DialHands = {
  hour: THREE.Object3D;
  minute: THREE.Object3D;
  second: THREE.Object3D;
};

type CuckooParts = {
  doorPivot: THREE.Object3D;
  bird: THREE.Object3D;
  birdRestZ: number;
  birdTravel: number;
  frameBox: THREE.Box3;
};

type ClockScene = {
  root: THREE.Object3D;
  hands: DialHands;
  cuckoo: CuckooParts | null;
};

function modelUrl(file: string): string {
  return `${import.meta.env.BASE_URL}models/${file}`;
}

async function loadTexture(
  loader: THREE.TextureLoader,
  file: string,
  colorSpace: string,
): Promise<THREE.Texture> {
  const texture = await loader.loadAsync(modelUrl(file));
  texture.colorSpace = colorSpace;
  // Every texture uses the first set of model coordinates.
  texture.channel = 0;

  return texture;
}

/**
 * Builds one physically based material from the self hosted textures. Base
 * color uses sRGB, and the data textures stay linear.
 */
async function loadModelMaterial(
  description: ModelDescription,
): Promise<THREE.MeshStandardMaterial> {
  const loader = new THREE.TextureLoader();
  const [map, normalMap, roughnessMap, metalnessMap, ormMap] =
    await Promise.all([
      loadTexture(loader, description.baseColor, THREE.SRGBColorSpace),
      loadTexture(loader, description.normal, THREE.NoColorSpace),
      description.roughness
        ? loadTexture(loader, description.roughness, THREE.NoColorSpace)
        : null,
      description.metallic
        ? loadTexture(loader, description.metallic, THREE.NoColorSpace)
        : null,
      description.occlusionRoughnessMetallic
        ? loadTexture(
            loader,
            description.occlusionRoughnessMetallic,
            THREE.NoColorSpace,
          )
        : null,
    ]);

  return new THREE.MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap: roughnessMap ?? ormMap,
    metalnessMap: metalnessMap ?? ormMap,
    aoMap: ormMap,
    roughness: 1,
    // Metallic surfaces need an environment map to stay readable, so the
    // metallic maps only tint the material instead of driving it fully.
    metalness: 0.35,
  });
}

function toMaterials(
  material: THREE.Material | THREE.Material[],
): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

function disposeMaterial(material: THREE.Material): void {
  const values = Object.values(
    material as unknown as Record<string, unknown>,
  );

  for (const value of values) {
    if (value && (value as THREE.Texture).isTexture) {
      (value as THREE.Texture).dispose();
    }
  }

  material.dispose();
}

/** Disposes every geometry, material, and texture below an object. */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.geometry.dispose();
    for (const material of toMaterials(mesh.material)) {
      disposeMaterial(material);
    }
  });
}

/** Replaces the source materials so the self hosted textures are used. */
function applyMaterial(
  model: THREE.Object3D,
  material: THREE.MeshStandardMaterial,
): void {
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    for (const previous of toMaterials(mesh.material)) {
      disposeMaterial(previous);
    }

    mesh.material = material;
  });
}

function createHand(
  length: number,
  width: number,
  depth: number,
  color: number,
  z: number,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, length, depth);
  // Shift the bar so the hand turns around the dial center and keeps a short
  // counterweight behind it.
  geometry.translate(0, length / 2 - length * 0.12, 0);

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.2,
    }),
  );
  mesh.position.z = z;

  return mesh;
}

/**
 * Builds a circular dial with twelve hour marks and three hands. The dial sits
 * just in front of the supplied face box, which is expressed in model
 * coordinates.
 */
function createDial(
  faceBox: THREE.Box3,
  radiusRatio: number,
): {
  dial: THREE.Object3D;
  hands: DialHands;
} {
  const size = faceBox.getSize(new THREE.Vector3());
  const center = faceBox.getCenter(new THREE.Vector3());
  const radius = Math.min(size.x, size.y) * radiusRatio;
  const layer = radius * 0.01;

  const dial = new THREE.Group();
  dial.position.set(center.x, center.y, faceBox.max.z + radius * 0.02);

  const plate = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 64),
    new THREE.MeshStandardMaterial({
      color: 0xf7f3e8,
      roughness: 0.55,
      metalness: 0.05,
    }),
  );
  dial.add(plate);

  const markMaterial = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    roughness: 0.4,
    metalness: 0.1,
  });

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.94, radius, 64),
    markMaterial,
  );
  ring.position.z = layer;
  dial.add(ring);

  const markGeometry = new THREE.BoxGeometry(
    radius * 0.05,
    radius * 0.15,
    radius * 0.02,
  );
  markGeometry.translate(0, radius * 0.8, 0);

  for (let hour = 0; hour < 12; hour += 1) {
    const mark = new THREE.Mesh(markGeometry, markMaterial);
    mark.rotation.z = -(hour / 12) * Math.PI * 2;
    mark.position.z = layer * 2;
    dial.add(mark);
  }

  const hour = createHand(
    radius * 0.55,
    radius * 0.07,
    radius * 0.03,
    0x27272a,
    layer * 3,
  );
  const minute = createHand(
    radius * 0.82,
    radius * 0.05,
    radius * 0.03,
    0x3f3f46,
    layer * 5,
  );
  const second = createHand(
    radius * 0.88,
    radius * 0.02,
    radius * 0.02,
    0xdc2626,
    layer * 7,
  );

  const cap = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 0.06, 24),
    markMaterial,
  );
  cap.position.z = layer * 9;

  dial.add(hour, minute, second, cap);

  return { dial, hands: { hour, minute, second } };
}

/**
 * Builds a small wooden bird from sphere, cone, and box geometries because the
 * source model has no bird mesh. Exported so tests can compare a bird built at
 * a given scale against one built at that scale times
 * `CUCKOO_ENLARGEMENT_SCALE`, without duplicating its geometry math.
 */
export function createBird(scale: number): THREE.Object3D {
  const bird = new THREE.Group();
  bird.name = 'procedural-bird';
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.85,
    metalness: 0,
  });
  const headMaterial = new THREE.MeshStandardMaterial({
    color: 0xa9713a,
    roughness: 0.85,
    metalness: 0,
  });
  const beakMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0a526,
    roughness: 0.6,
    metalness: 0.1,
  });

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 0.62, 16, 12),
    bodyMaterial,
  );
  body.scale.set(1, 0.9, 1.25);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(scale * 0.38, 16, 12),
    headMaterial,
  );
  head.position.set(0, scale * 0.55, scale * 0.42);

  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(scale * 0.16, scale * 0.4, 10),
    beakMaterial,
  );
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, scale * 0.52, scale * 0.92);

  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(scale * 0.24, scale * 0.12, scale * 0.72),
    bodyMaterial,
  );
  tail.rotation.x = -0.35;
  tail.position.set(0, scale * 0.08, -scale * 0.95);

  bird.add(body, head, beak, tail);

  return bird;
}

/**
 * Moves the door into a hinged pivot at its right edge so a positive rotation
 * swings the door out toward the viewer.
 */
function createDoorPivot(door: THREE.Object3D): THREE.Object3D {
  const parent = door.parent;
  if (!parent) throw new Error('The cuckoo door has no parent.');

  const box = new THREE.Box3().setFromObject(door);
  const center = box.getCenter(new THREE.Vector3());
  const hinge = parent.worldToLocal(
    new THREE.Vector3(box.max.x, center.y, box.max.z),
  );

  const pivot = new THREE.Group();
  pivot.name = 'door-pivot';
  pivot.position.copy(hinge);
  parent.add(pivot);
  pivot.add(door);
  door.position.sub(hinge);

  return pivot;
}

function createCuckooParts(model: THREE.Object3D): CuckooParts | null {
  const door = model.getObjectByName('door');
  if (!door) return null;

  // The source hands are replaced by the procedural hands.
  for (const name of ['arm', 'arm001']) {
    const arm = model.getObjectByName(name);
    if (arm) arm.visible = false;
  }

  const modeledDoorSize = new THREE.Box3()
    .setFromObject(door)
    .getSize(new THREE.Vector3());

  // The door widens and heightens by the enlargement scale. Its depth is
  // untouched, so createDoorPivot still finds the hinge at the door's own
  // right edge and swings the enlarged door exactly as before.
  door.scale.x *= CUCKOO_ENLARGEMENT_SCALE;
  door.scale.y *= CUCKOO_ENLARGEMENT_SCALE;

  const doorBox = new THREE.Box3().setFromObject(door);
  const doorSize = doorBox.getSize(new THREE.Vector3());
  const doorCenter = doorBox.getCenter(new THREE.Vector3());
  const scale =
    Math.min(modeledDoorSize.x, modeledDoorSize.y) *
    0.34 *
    CUCKOO_ENLARGEMENT_SCALE;

  const doorPivot = createDoorPivot(door);
  const frameBox = new THREE.Box3().setFromObject(model);

  const bird = createBird(scale);
  const birdRestZ = doorBox.min.z - scale * 1.6;
  const birdTravel = doorBox.max.z - birdRestZ + scale * 1.3;
  bird.position.set(doorCenter.x, doorCenter.y - doorSize.y * 0.05, birdRestZ);
  bird.visible = false;
  model.add(bird);

  return { doorPivot, bird, birdRestZ, birdTravel, frameBox };
}

/**
 * Centers the model on the origin and scales it so its largest dimension fills
 * the camera frame. Both models then sit in the same stable frame.
 */
function normalizeModel(
  model: THREE.Object3D,
  box: THREE.Box3,
): THREE.Object3D {
  const size = box.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;

  model.position.sub(box.getCenter(new THREE.Vector3()));

  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.scale.setScalar(FRAME_SIZE / maxDimension);

  return pivot;
}

async function buildClockScene(mode: ThreeClockMode): Promise<ClockScene> {
  const description = modelDescriptions[mode];
  const [model, material] = await Promise.all([
    new FBXLoader().loadAsync(modelUrl(description.file)),
    loadModelMaterial(description),
  ]);

  applyMaterial(model, material);
  model.updateMatrixWorld(true);

  const modelBox = new THREE.Box3().setFromObject(model);
  const dialMesh = description.dialMesh
    ? model.getObjectByName(description.dialMesh)
    : null;
  const faceBox = dialMesh
    ? new THREE.Box3().setFromObject(dialMesh)
    : modelBox;

  const cuckoo = mode === 'cuckoo' ? createCuckooParts(model) : null;
  const rootBox = cuckoo?.frameBox ?? modelBox;
  const { dial, hands } = createDial(faceBox, description.dialRadiusRatio);
  model.add(dial);

  return { root: normalizeModel(model, rootBox), hands, cuckoo };
}

export default function ThreeClock({
  mode,
  time,
  chimeAnimation,
}: ThreeClockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(time);
  // The session record, not this component, decides when a sequence began, so
  // a remount resumes the sequence instead of restarting it and a sequence
  // that already ran out cannot play again.
  const chimeSequenceRef = useChimeAnimationSession(chimeAnimation);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(
    'loading',
  );

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setStatus('loading');

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch (error) {
      console.error('The 3D clock could not start.', error);
      setStatus('failed');
      return;
    }

    let disposed = false;
    let frame = 0;
    let hands: DialHands | null = null;
    let cuckoo: CuckooParts | null = null;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 16 / 10, 0.1, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);

    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.4);
    directionalLight.position.set(2, 3, 4);
    scene.add(directionalLight);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const renderFrame = () => {
      frame = requestAnimationFrame(renderFrame);

      if (hands) {
        const rotations = getHandRotations(timeRef.current);
        hands.hour.rotation.z = rotations.hour;
        hands.minute.rotation.z = rotations.minute;
        hands.second.rotation.z = rotations.second;
      }

      if (cuckoo) {
        const sequence = chimeSequenceRef.current;
        const elapsed = sequence
          ? performance.now() - sequence.startedAtMilliseconds
          : 0;
        // The hook owns the sequence ref. The loop only reads it, and an
        // exhausted sequence already resolves to the idle placement.
        const state = getCuckooAnimation(elapsed, sequence?.strikes ?? 0);

        cuckoo.doorPivot.rotation.y = state.doorRotation;
        cuckoo.bird.position.z =
          cuckoo.birdRestZ + state.birdOffset * cuckoo.birdTravel;
        cuckoo.bird.visible = state.birdOffset > 0;
      }

      renderer.render(scene, camera);
    };

    frame = requestAnimationFrame(renderFrame);

    buildClockScene(mode)
      .then((clock) => {
        if (disposed) {
          disposeObject(clock.root);
          return;
        }

        scene.add(clock.root);
        hands = clock.hands;
        cuckoo = clock.cuckoo;
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (disposed) return;

        console.error('The 3D clock model could not be loaded.', error);
        setStatus('failed');
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();

      // The door and the bird return to their closed positions before the
      // scene is released.
      if (cuckoo) {
        cuckoo.doorPivot.rotation.y = 0;
        cuckoo.bird.position.z = cuckoo.birdRestZ;
        cuckoo.bird.visible = false;
      }

      disposeObject(scene);
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [mode]);

  const { label } = modelDescriptions[mode];

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {status !== 'ready' && (
        <p
          role="status"
          className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
        >
          {status === 'failed'
            ? `The ${label} could not be displayed.`
            : `Loading the ${label} model.`}
        </p>
      )}
    </div>
  );
}
