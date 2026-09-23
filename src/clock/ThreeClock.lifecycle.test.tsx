import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import ThreeClock, {
  CUCKOO_DOOR_OPEN_RADIANS,
  CUCKOO_ENLARGEMENT_SCALE,
  createBird,
  getCuckooAnimation,
} from './ThreeClock';
import { ClockDisplay } from './ClockDisplay';
import { resetChimeAnimationSession } from './chimeAnimationSession';

type FakeRenderer = {
  domElement: HTMLCanvasElement;
  lastScene: THREE.Scene | null;
  setPixelRatio: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  forceContextLoss: ReturnType<typeof vi.fn>;
};

type FakeObserver = {
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const harness = vi.hoisted(() => ({
  renderers: [] as FakeRenderer[],
  textureLoads: [] as string[],
  disposedTextures: [] as string[],
  modelLoads: [] as string[],
}));

// Only the parts that need a graphics processor are replaced. Every geometry,
// material, and bounding box stays real, so the scene the component builds in
// a test is the scene it builds in a browser.
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');

  class WebGLRenderer {
    domElement = document.createElement('canvas');
    lastScene: unknown = null;
    outputColorSpace = '';
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn((scene: unknown) => {
      this.lastScene = scene;
    });
    dispose = vi.fn();
    forceContextLoss = vi.fn();

    constructor() {
      harness.renderers.push(this as unknown as FakeRenderer);
    }
  }

  class TextureLoader {
    async loadAsync(url: string) {
      harness.textureLoads.push(url);

      const texture = new actual.Texture();
      const dispose = texture.dispose.bind(texture);
      texture.dispose = () => {
        harness.disposedTextures.push(url);
        dispose();
      };

      return texture;
    }
  }

  return { ...actual, WebGLRenderer, TextureLoader };
});

vi.mock('three/examples/jsm/loaders/FBXLoader.js', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');

  class FBXLoader {
    async loadAsync(url: string) {
      harness.modelLoads.push(url);

      const model = new actual.Group();
      const addMesh = (
        name: string,
        size: [number, number, number],
        position: [number, number, number],
      ) => {
        const mesh = new actual.Mesh(
          new actual.BoxGeometry(...size),
          new actual.MeshStandardMaterial(),
        );
        mesh.name = name;
        mesh.position.set(...position);
        model.add(mesh);
      };

      // The shape mirrors the published models closely enough for the
      // normalization, the dial anchor, and the door hinge to be exercised.
      addMesh('case', [20, 30, 10], [0, 0, 0]);
      addMesh('face', [12, 12, 1], [0, 6, 5]);
      addMesh('door', [5, 6, 1], [0, 12, 5]);
      addMesh('arm', [1, 6, 1], [0, 6, 6]);
      addMesh('arm001', [1, 4, 1], [0, 6, 6]);

      return model;
    }
  }

  return { FBXLoader };
});

const observers: FakeObserver[] = [];
const cancelledFrames: number[] = [];

let frameCallbacks = new Map<number, FrameRequestCallback>();
let nextFrameHandle = 1;
let now = 0;

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
const originalResizeObserver = globalThis.ResizeObserver;

/** Runs every animation frame callback that the loop has queued. */
function stepFrame() {
  const pending = [...frameCallbacks.values()];
  frameCallbacks.clear();

  act(() => {
    for (const callback of pending) callback(now);
  });
}

function currentScene(): THREE.Scene {
  const scene = harness.renderers.at(-1)?.lastScene;
  if (!scene) throw new Error('The renderer never received a scene.');

  return scene;
}

function cuckooParts() {
  const scene = currentScene();
  const doorPivot = scene.getObjectByName('door-pivot');
  const bird = scene.getObjectByName('procedural-bird');

  if (!doorPivot || !bird) {
    throw new Error('The cuckoo door and bird were never built.');
  }

  return { doorPivot, bird };
}

/** Waits for the model to arrive and the loading label to disappear. */
async function waitForReadyClock() {
  await waitFor(() =>
    expect(screen.queryByRole('status')).not.toBeInTheDocument(),
  );
}

const time = new Date(2026, 8, 22, 15, 4, 9);

describe('ThreeClock lifecycle', () => {
  beforeEach(() => {
    harness.renderers.length = 0;
    harness.textureLoads.length = 0;
    harness.disposedTextures.length = 0;
    harness.modelLoads.length = 0;
    observers.length = 0;
    cancelledFrames.length = 0;
    frameCallbacks = new Map();
    nextFrameHandle = 1;
    now = 0;
    resetChimeAnimationSession();

    vi.spyOn(performance, 'now').mockImplementation(() => now);
    // A stale identifier or a mismatched strike count warns in development,
    // and several cases below exercise that refusal on purpose.
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const handle = nextFrameHandle;
      nextFrameHandle += 1;
      frameCallbacks.set(handle, callback);

      return handle;
    };

    globalThis.cancelAnimationFrame = (handle: number) => {
      cancelledFrames.push(handle);
      frameCallbacks.delete(handle);
    };

    globalThis.ResizeObserver = class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();

      constructor() {
        observers.push(this as unknown as FakeObserver);
      }
    } as unknown as typeof ResizeObserver;

    // jsdom reports no layout, and the renderer skips a zero sized frame.
    for (const property of ['clientWidth', 'clientHeight'] as const) {
      Object.defineProperty(HTMLDivElement.prototype, property, {
        configurable: true,
        value: property === 'clientWidth' ? 800 : 500,
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetChimeAnimationSession();

    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    globalThis.ResizeObserver = originalResizeObserver;

    for (const property of ['clientWidth', 'clientHeight'] as const) {
      Reflect.deleteProperty(HTMLDivElement.prototype, property);
    }
  });

  describe('teardown', () => {
    it('disposes the renderer and removes its canvas', async () => {
      const view = render(
        <ThreeClock mode="analog" time={time} chimeAnimation={null} />,
      );
      await waitForReadyClock();

      const renderer = harness.renderers[0];
      expect(renderer.dispose).not.toHaveBeenCalled();
      expect(renderer.domElement.parentNode).not.toBeNull();

      view.unmount();

      expect(renderer.dispose).toHaveBeenCalledTimes(1);
      expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
      expect(renderer.domElement.parentNode).toBeNull();
    });

    it('cancels the pending animation frame and stops rendering', async () => {
      const view = render(
        <ThreeClock mode="analog" time={time} chimeAnimation={null} />,
      );
      await waitForReadyClock();

      stepFrame();
      const renderer = harness.renderers[0];
      const rendersBeforeUnmount = renderer.render.mock.calls.length;
      const pendingHandle = [...frameCallbacks.keys()].at(-1);

      expect(rendersBeforeUnmount).toBeGreaterThan(0);
      expect(pendingHandle).toBeDefined();

      view.unmount();

      expect(cancelledFrames).toContain(pendingHandle);
      expect(frameCallbacks.size).toBe(0);

      stepFrame();

      expect(renderer.render.mock.calls.length).toBe(rendersBeforeUnmount);
    });

    it('disconnects the resize observer', async () => {
      const view = render(
        <ThreeClock mode="analog" time={time} chimeAnimation={null} />,
      );
      await waitForReadyClock();

      const observer = observers[0];
      expect(observer.observe).toHaveBeenCalledTimes(1);
      expect(observer.disconnect).not.toHaveBeenCalled();

      view.unmount();

      expect(observer.disconnect).toHaveBeenCalledTimes(1);
    });

    it('disposes the model geometries and textures', async () => {
      const disposeGeometry = vi.spyOn(
        THREE.BufferGeometry.prototype,
        'dispose',
      );

      const view = render(
        <ThreeClock mode="analog" time={time} chimeAnimation={null} />,
      );
      await waitForReadyClock();

      const geometryDisposalsBeforeUnmount = disposeGeometry.mock.calls.length;
      expect(harness.disposedTextures).toHaveLength(0);

      view.unmount();

      expect(disposeGeometry.mock.calls.length).toBeGreaterThan(
        geometryDisposalsBeforeUnmount,
      );
      expect(harness.disposedTextures).toContain(
        '/models/analog/clock-base-color.png',
      );
    });

    it('builds one renderer for each mount', async () => {
      const first = render(
        <ThreeClock mode="analog" time={time} chimeAnimation={null} />,
      );
      await waitForReadyClock();
      first.unmount();

      const second = render(
        <ThreeClock mode="analog" time={time} chimeAnimation={null} />,
      );
      await waitForReadyClock();

      expect(harness.renderers).toHaveLength(2);
      expect(harness.renderers[0].dispose).toHaveBeenCalledTimes(1);
      expect(harness.renderers[1].dispose).not.toHaveBeenCalled();

      second.unmount();
    });
  });

  describe('cuckoo sizing', () => {
    // The fake FBX model measures its door at 5 by 6 by 1 model units, so
    // every expectation below is expressed against that known size.
    const modeledDoorSize = { x: 5, y: 6, z: 1 };

    it('enlarges the modeled door width and height while its depth stays modeled', async () => {
      render(<ThreeClock mode="cuckoo" time={time} chimeAnimation={null} />);
      await waitForReadyClock();
      stepFrame();

      const { doorPivot } = cuckooParts();
      const size = new THREE.Box3()
        .setFromObject(doorPivot)
        .getSize(new THREE.Vector3());

      expect(size.x).toBeCloseTo(modeledDoorSize.x * CUCKOO_ENLARGEMENT_SCALE);
      expect(size.y).toBeCloseTo(modeledDoorSize.y * CUCKOO_ENLARGEMENT_SCALE);
      expect(size.z).toBeCloseTo(modeledDoorSize.z);
    });

    it('enlarges the procedural bird by the same factor and keeps it centered while hidden', async () => {
      render(<ThreeClock mode="cuckoo" time={time} chimeAnimation={null} />);
      await waitForReadyClock();
      stepFrame();

      const { bird } = cuckooParts();

      const birdScale =
        Math.min(modeledDoorSize.x, modeledDoorSize.y) *
        0.34 *
        CUCKOO_ENLARGEMENT_SCALE;
      const expectedSize = new THREE.Box3()
        .setFromObject(createBird(birdScale))
        .getSize(new THREE.Vector3());
      const actualSize = new THREE.Box3()
        .setFromObject(bird)
        .getSize(new THREE.Vector3());

      expect(actualSize.x).toBeCloseTo(expectedSize.x);
      expect(actualSize.y).toBeCloseTo(expectedSize.y);
      expect(actualSize.z).toBeCloseTo(expectedSize.z);

      // Centered on the door, and still behind the door's near face
      // (modeledDoorSize.z / 2 + the door's position, or 4.5 in world units)
      // while closed.
      expect(bird.position.x).toBeCloseTo(0);
      expect(bird.position.z).toBeLessThan(4.5);
      expect(bird.visible).toBe(false);
    });

    it('uses the enlarged door geometry for bird travel', async () => {
      render(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 1, strikes: 1 }}
        />,
      );
      await waitForReadyClock();

      const birdScale =
        Math.min(modeledDoorSize.x, modeledDoorSize.y) *
        0.34 *
        CUCKOO_ENLARGEMENT_SCALE;
      const expectedRestZ = 4.5 - birdScale * 1.6;
      const expectedTravel = 5.5 - expectedRestZ + birdScale * 1.3;

      now = 250;
      stepFrame();
      const { bird: birdOut } = cuckooParts();

      expect(birdOut.position.z).toBeCloseTo(expectedRestZ + expectedTravel);
      expect(birdOut.position.x).toBeCloseTo(0);
      expect(birdOut.visible).toBe(true);

      now = 1_000;
      stepFrame();
      const { bird: birdIn } = cuckooParts();

      expect(birdIn.position.z).toBeCloseTo(expectedRestZ);
      expect(birdIn.visible).toBe(false);
    });
  });

  describe('chime sequences', () => {
    it('opens the door while a sequence runs', async () => {
      render(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 1, strikes: 2 }}
        />,
      );
      await waitForReadyClock();

      now = 125;
      stepFrame();

      const { doorPivot, bird } = cuckooParts();

      expect(doorPivot.rotation.y).toBeCloseTo(CUCKOO_DOOR_OPEN_RADIANS / 2);
      expect(bird.visible).toBe(true);
    });

    it('closes the door when the sequence is stopped', async () => {
      const view = render(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 1, strikes: 2 }}
        />,
      );
      await waitForReadyClock();

      now = 250;
      stepFrame();
      expect(cuckooParts().doorPivot.rotation.y).toBeCloseTo(
        CUCKOO_DOOR_OPEN_RADIANS,
      );

      view.rerender(
        <ThreeClock mode="cuckoo" time={time} chimeAnimation={null} />,
      );
      stepFrame();

      const { doorPivot, bird } = cuckooParts();

      expect(doorPivot.rotation.y).toBe(0);
      expect(bird.visible).toBe(false);
    });

    it('closes the door when the sequence runs out', async () => {
      render(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 1, strikes: 1 }}
        />,
      );
      await waitForReadyClock();

      now = 125;
      stepFrame();
      expect(cuckooParts().doorPivot.rotation.y).toBeGreaterThan(0);

      now = 1_000;
      stepFrame();

      const { doorPivot, bird } = cuckooParts();

      expect(doorPivot.rotation.y).toBe(0);
      expect(bird.visible).toBe(false);
    });

    it('restarts the sequence when a stop is followed by a new identifier', async () => {
      const view = render(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 1, strikes: 1 }}
        />,
      );
      await waitForReadyClock();

      now = 250;
      stepFrame();
      expect(cuckooParts().doorPivot.rotation.y).toBeCloseTo(
        CUCKOO_DOOR_OPEN_RADIANS,
      );

      view.rerender(
        <ThreeClock mode="cuckoo" time={time} chimeAnimation={null} />,
      );
      stepFrame();
      expect(cuckooParts().doorPivot.rotation.y).toBe(0);

      now = 5_000;
      view.rerender(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 2, strikes: 1 }}
        />,
      );
      now = 5_125;
      stepFrame();

      const { doorPivot, bird } = cuckooParts();

      expect(doorPivot.rotation.y).toBeCloseTo(CUCKOO_DOOR_OPEN_RADIANS / 2);
      expect(bird.visible).toBe(true);
    });

    it('does not rewind the sequence when a stop is followed by the same identifier', async () => {
      const chimeAnimation = { id: 1, strikes: 1 };
      const view = render(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={chimeAnimation}
        />,
      );
      await waitForReadyClock();

      now = 250;
      stepFrame();
      expect(cuckooParts().doorPivot.rotation.y).toBeGreaterThan(0);

      view.rerender(
        <ThreeClock mode="cuckoo" time={time} chimeAnimation={null} />,
      );
      stepFrame();

      // The single strike is long spent, so repeating the identifier draws
      // nothing rather than ringing again.
      now = 5_000;
      view.rerender(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={chimeAnimation}
        />,
      );
      now = 5_125;
      stepFrame();

      const { doorPivot, bird } = cuckooParts();

      expect(doorPivot.rotation.y).toBe(0);
      expect(bird.visible).toBe(false);
    });

    it('does not rewind or restart a running sequence when a stale identifier arrives', async () => {
      const chimeAnimation = { id: 9, strikes: 3 };
      const view = render(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={chimeAnimation}
        />,
      );
      await waitForReadyClock();

      // The sequence is still mid-flight through its second strike when the
      // stale identifier arrives, unlike a stale identifier that shows up
      // only after every strike has already finished.
      now = 1_125;
      stepFrame();

      const runningState = getCuckooAnimation(now, chimeAnimation.strikes);
      expect(runningState.active).toBe(true);
      expect(cuckooParts().doorPivot.rotation.y).toBeCloseTo(
        runningState.doorRotation,
      );
      expect(cuckooParts().bird.visible).toBe(true);

      view.rerender(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 8, strikes: 3 }}
        />,
      );
      stepFrame();

      // Refusing the stale identifier is not a rewind: the door and the bird
      // stay exactly where the sequence that is running already placed them.
      expect(cuckooParts().doorPivot.rotation.y).toBeCloseTo(
        runningState.doorRotation,
      );
      expect(cuckooParts().bird.visible).toBe(true);

      now = 2_125;
      stepFrame();

      // Refusing the stale identifier is also not a restart: the third
      // strike is timed from the sequence's true origin at zero, not from
      // the moment the stale identifier arrived.
      const laterState = getCuckooAnimation(now, chimeAnimation.strikes);
      expect(laterState.active).toBe(true);
      expect(cuckooParts().doorPivot.rotation.y).toBeCloseTo(
        laterState.doorRotation,
      );
      expect(cuckooParts().bird.visible).toBe(laterState.birdOffset > 0);
    });

    it('does not extend a running sequence when a repeated identifier changes its strike count', async () => {
      const view = render(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 1, strikes: 1 }}
        />,
      );
      await waitForReadyClock();

      now = 125;
      stepFrame();
      expect(cuckooParts().doorPivot.rotation.y).toBeGreaterThan(0);

      // The same identifier returns claiming five strikes instead of one.
      // Accepting the new count would stretch the sequence from one second
      // to five, so it must be refused.
      view.rerender(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 1, strikes: 5 }}
        />,
      );

      // The single strike recorded for identifier 1 has already run out by
      // now, which it would not have if the new count of five had won.
      now = 1_500;
      stepFrame();

      const { doorPivot, bird } = cuckooParts();

      expect(doorPivot.rotation.y).toBe(0);
      expect(bird.visible).toBe(false);
    });

    it('ignores a stale identifier after every strike has already finished', async () => {
      const view = render(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 9, strikes: 1 }}
        />,
      );
      await waitForReadyClock();

      now = 1_000;
      stepFrame();
      expect(cuckooParts().doorPivot.rotation.y).toBe(0);

      view.rerender(
        <ThreeClock
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 8, strikes: 1 }}
        />,
      );
      now = 1_125;
      stepFrame();

      const { doorPivot, bird } = cuckooParts();

      expect(doorPivot.rotation.y).toBe(0);
      expect(bird.visible).toBe(false);
    });

    it('does not replay a finished sequence after a remount', async () => {
      const finished = { id: 1, strikes: 1 };
      const view = render(
        <ThreeClock mode="cuckoo" time={time} chimeAnimation={finished} />,
      );
      await waitForReadyClock();

      now = 125;
      stepFrame();
      expect(cuckooParts().doorPivot.rotation.y).toBeGreaterThan(0);

      now = 1_500;
      view.unmount();

      now = 2_000;
      render(
        <ThreeClock mode="cuckoo" time={time} chimeAnimation={finished} />,
      );
      await waitForReadyClock();
      stepFrame();

      // A sequence that restarted on mount would have the bird outside by
      // now, so the sample lands in the middle of the first cycle.
      now = 2_125;
      stepFrame();

      const { doorPivot, bird } = cuckooParts();

      expect(doorPivot.rotation.y).toBe(0);
      expect(bird.visible).toBe(false);
    });

    it('does not replay a sequence that rang in another mode', async () => {
      const chimeAnimation = { id: 4, strikes: 3 };
      const view = render(
        <ClockDisplay
          mode="digital"
          time={time}
          chimeAnimation={chimeAnimation}
        />,
      );

      // The sequence is spent while the digital clock is on screen.
      now = 9_000;
      view.rerender(
        <ClockDisplay
          mode="cuckoo"
          time={time}
          chimeAnimation={chimeAnimation}
        />,
      );
      await waitForReadyClock();
      stepFrame();

      // A sequence that started when the cuckoo mounted would have the bird
      // outside by now, so the sample lands in the middle of the first cycle.
      now = 9_125;
      stepFrame();

      const { doorPivot, bird } = cuckooParts();

      expect(doorPivot.rotation.y).toBe(0);
      expect(bird.visible).toBe(false);
    });

    it('resumes a sequence that is still running in another mode', async () => {
      const chimeAnimation = { id: 5, strikes: 3 };
      const view = render(
        <ClockDisplay
          mode="digital"
          time={time}
          chimeAnimation={chimeAnimation}
        />,
      );

      now = 2_125;
      view.rerender(
        <ClockDisplay
          mode="cuckoo"
          time={time}
          chimeAnimation={chimeAnimation}
        />,
      );
      await waitForReadyClock();
      stepFrame();

      expect(cuckooParts().doorPivot.rotation.y).toBeCloseTo(
        CUCKOO_DOOR_OPEN_RADIANS / 2,
      );
    });
  });
});
