import { describe, expect, it, vi } from 'vitest';
import { getHourlyChimeCount, playChime } from './chimes';

function audioHarness() {
  const starts: number[] = [];
  const parameter = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const context = {
    currentTime: 10,
    state: 'running',
    destination: {},
    createGain: () => ({ gain: parameter(), connect: vi.fn() }),
    createBiquadFilter: () => ({ frequency: parameter(), Q: parameter(), connect: vi.fn() }),
    createOscillator: () => ({ frequency: parameter(), connect: vi.fn(), start: (time: number) => starts.push(time), stop: vi.fn() }),
    createBufferSource: () => ({ connect: vi.fn(), start: (time: number) => starts.push(time), stop: vi.fn() }),
    decodeAudioData: vi.fn(async () => ({ duration: 3 })),
  };
  return { context, starts };
}

it('reports exactly the twelve cuckoo call times used by the audio', () => {
  const { context, starts } = audioHarness();
  const scheduled = vi.fn();
  playChime(context as unknown as AudioContext, 'cuckoo', 12, 'hour', scheduled);
  const schedule = scheduled.mock.calls[0][0];
  expect(schedule.strikeOffsetsMilliseconds).toHaveLength(12);
  expect(schedule.strikeOffsetsMilliseconds.at(-1)).toBe(9790);
  schedule.strikeOffsetsMilliseconds.forEach((offset: number, index: number) => {
    expect(starts[index * 6]).toBeCloseTo(context.currentTime + offset / 1000);
  });
});

it('reports recording strikes only after decoding and uses the buffer duration', async () => {
  const { context, starts } = audioHarness();
  const scheduled = vi.fn();
  let release: (value: ArrayBuffer) => void;
  const download = new Promise<ArrayBuffer>(resolve => { release = resolve; });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: () => download })));
  try {
    playChime(context as unknown as AudioContext, 'bell', 3, 'hour', scheduled);
    expect(scheduled).not.toHaveBeenCalled();
    release!(new ArrayBuffer(0));
    await vi.waitFor(() => expect(scheduled).toHaveBeenCalledOnce());
    expect(scheduled.mock.calls[0][0].strikeOffsetsMilliseconds).toEqual([0, 3000, 6000]);
    starts.forEach((start, index) => expect(start).toBeCloseTo(10.01 + index * 3));
  } finally {
    vi.unstubAllGlobals();
  }
});

describe('getHourlyChimeCount', () => {
  it.each([
    [0, 12],
    [1, 1],
    [11, 11],
    [12, 12],
    [13, 1],
    [23, 11],
  ])('maps hour %i to the expected strike count', (hour, expected) => {
    expect(getHourlyChimeCount(new Date(2026, 0, 1, hour))).toBe(expected);
  });
});

it('excludes the classic introduction and includes the final recorded strike', async () => {
  const { context } = audioHarness();
  const scheduled = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));
  try {
    playChime(context as unknown as AudioContext, 'classic', 3, 'hour', scheduled);
    await vi.waitFor(() => expect(scheduled).toHaveBeenCalledOnce());
    expect(scheduled.mock.calls[0][0].strikeOffsetsMilliseconds).toEqual([3000, 6000, 9000]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('does not start an animation for a recording canceled before playback', async () => {
  const { context } = audioHarness();
  const scheduled = vi.fn();
  const playback = playChime(context as unknown as AudioContext, 'classic', 3, 'hour', scheduled);
  playback?.stop();
  await Promise.resolve();
  await Promise.resolve();
  expect(scheduled).not.toHaveBeenCalled();
});
