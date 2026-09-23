import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observeChimeAnimation,
  resetChimeAnimationSession,
  useChimeAnimationSession,
} from './chimeAnimationSession';

describe('observeChimeAnimation', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    resetChimeAnimationSession();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetChimeAnimationSession();
  });

  it('records the arrival of a new sequence', () => {
    now = 1_500;

    expect(observeChimeAnimation({ id: 1, strikes: 3 })).toBe(1_500);
  });

  it('keeps the original start time when the same sequence is seen again', () => {
    observeChimeAnimation({ id: 1, strikes: 3 });
    now = 4_000;

    expect(observeChimeAnimation({ id: 1, strikes: 3 })).toBe(0);
  });

  it('starts a fresh sequence when the identifier changes', () => {
    observeChimeAnimation({ id: 1, strikes: 3 });
    now = 4_000;

    expect(observeChimeAnimation({ id: 2, strikes: 3 })).toBe(4_000);
  });

  it('refuses an absent sequence without disturbing the record', () => {
    observeChimeAnimation({ id: 1, strikes: 3 });
    now = 4_000;

    expect(observeChimeAnimation(null)).toBeNull();
    expect(observeChimeAnimation({ id: 1, strikes: 3 })).toBe(0);
  });

  it('refuses a sequence with no strikes', () => {
    expect(observeChimeAnimation({ id: 1, strikes: 0 })).toBeNull();
    expect(observeChimeAnimation({ id: 1, strikes: -2 })).toBeNull();
  });

  it('refuses a sequence with a nonfinite identifier', () => {
    expect(observeChimeAnimation({ id: Number.NaN, strikes: 3 })).toBeNull();
  });

  it('forgets every sequence when the session is reset', () => {
    observeChimeAnimation({ id: 1, strikes: 3 });
    resetChimeAnimationSession();
    now = 4_000;

    expect(observeChimeAnimation({ id: 1, strikes: 3 })).toBe(4_000);
  });
});

describe('useChimeAnimationSession', () => {
  let now = 0;

  beforeEach(() => {
    now = 0;
    resetChimeAnimationSession();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetChimeAnimationSession();
  });

  it('resolves a live sequence against the session start time', () => {
    now = 800;

    const { result } = renderHook(() =>
      useChimeAnimationSession({ id: 1, strikes: 4 }),
    );

    expect(result.current.current).toEqual({
      strikes: 4,
      startedAtMilliseconds: 800,
    });
  });

  it('holds nothing for an absent sequence', () => {
    const { result } = renderHook(() => useChimeAnimationSession(null));

    expect(result.current.current).toBeNull();
  });

  it('holds nothing for a sequence with no strikes', () => {
    const { result } = renderHook(() =>
      useChimeAnimationSession({ id: 1, strikes: 0 }),
    );

    expect(result.current.current).toBeNull();
  });

  it('cancels the sequence when the event is withdrawn', () => {
    type Props = { id: number; strikes: number } | null;

    const { result, rerender } = renderHook(
      (animation: Props) => useChimeAnimationSession(animation),
      { initialProps: { id: 1, strikes: 4 } as Props },
    );

    expect(result.current.current).not.toBeNull();

    rerender(null);

    expect(result.current.current).toBeNull();
  });

  it('keeps the original start time when a later consumer mounts', () => {
    renderHook(() => useChimeAnimationSession({ id: 1, strikes: 4 }));
    now = 6_000;

    const { result } = renderHook(() =>
      useChimeAnimationSession({ id: 1, strikes: 4 }),
    );

    expect(result.current.current).toEqual({
      strikes: 4,
      startedAtMilliseconds: 0,
    });
  });
});
