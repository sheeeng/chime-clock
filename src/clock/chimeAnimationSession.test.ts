import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  observeChimeAnimation,
  resetChimeAnimationSession,
  useChimeAnimationSession,
} from './chimeAnimationSession';

describe('observeChimeAnimation', () => {
  let now = 0;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    now = 0;
    resetChimeAnimationSession();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    // Refusing a stale identifier or a mismatched strike count warns in
    // development. Silencing it here keeps every other case's test output
    // clean; the warning tests below read this same spy.
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('starts a fresh sequence when the identifier increases', () => {
    observeChimeAnimation({ id: 1, strikes: 3 });
    now = 4_000;

    expect(observeChimeAnimation({ id: 2, strikes: 3 })).toBe(4_000);
  });

  it('refuses an identifier below the record', () => {
    now = 1_000;
    observeChimeAnimation({ id: 7, strikes: 3 });
    now = 4_000;

    expect(observeChimeAnimation({ id: 6, strikes: 3 })).toBeNull();
  });

  it('keeps the record intact when a stale identifier arrives', () => {
    now = 1_000;
    observeChimeAnimation({ id: 7, strikes: 3 });
    now = 4_000;
    observeChimeAnimation({ id: 6, strikes: 3 });

    expect(observeChimeAnimation({ id: 7, strikes: 3 })).toBe(1_000);
    expect(observeChimeAnimation({ id: 8, strikes: 3 })).toBe(4_000);
  });

  it('refuses a repeated identifier with a different strike count', () => {
    now = 1_000;
    observeChimeAnimation({ id: 7, strikes: 3 });
    now = 4_000;

    expect(observeChimeAnimation({ id: 7, strikes: 4 })).toBeNull();
  });

  it('keeps the recorded strike count when a mismatched count is refused', () => {
    now = 1_000;
    observeChimeAnimation({ id: 7, strikes: 3 });
    now = 4_000;
    observeChimeAnimation({ id: 7, strikes: 4 });

    expect(observeChimeAnimation({ id: 7, strikes: 3 })).toBe(1_000);
  });

  it('warns in development when it refuses a stale identifier', () => {
    now = 1_000;
    observeChimeAnimation({ id: 7, strikes: 3 });
    now = 4_000;

    observeChimeAnimation({ id: 6, strikes: 3 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('6');
    expect(warn.mock.calls[0][0]).toContain('7');
  });

  it('warns in development when it refuses a mismatched strike count', () => {
    observeChimeAnimation({ id: 7, strikes: 3 });

    observeChimeAnimation({ id: 7, strikes: 4 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('4');
    expect(warn.mock.calls[0][0]).toContain('3');
  });

  it('does not warn in production for either refusal', () => {
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = false;

    try {
      now = 1_000;
      observeChimeAnimation({ id: 7, strikes: 3 });
      now = 4_000;
      observeChimeAnimation({ id: 6, strikes: 3 });
      observeChimeAnimation({ id: 7, strikes: 4 });
    } finally {
      import.meta.env.DEV = originalDev;
    }

    expect(warn).not.toHaveBeenCalled();
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

  it('resumes rather than rewinds when the same identifier rings after a stop', () => {
    now = 1_000;
    observeChimeAnimation({ id: 3, strikes: 3 });
    observeChimeAnimation(null);
    now = 5_000;

    expect(observeChimeAnimation({ id: 3, strikes: 3 })).toBe(1_000);
  });

  it('starts a new sequence when a restart carries a new identifier', () => {
    now = 1_000;
    observeChimeAnimation({ id: 3, strikes: 3 });
    observeChimeAnimation(null);
    now = 5_000;

    expect(observeChimeAnimation({ id: 4, strikes: 3 })).toBe(5_000);
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
    // A refused identifier or strike count warns in development. These
    // tests assert on the resolved sequence, not on the warning, so the
    // warning itself is silenced here.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  it('resumes the original sequence when the same identifier returns after a stop', () => {
    type Props = { id: number; strikes: number } | null;

    const { result, rerender } = renderHook(
      (animation: Props) => useChimeAnimationSession(animation),
      { initialProps: { id: 1, strikes: 4 } as Props },
    );

    rerender(null);
    now = 7_000;
    rerender({ id: 1, strikes: 4 });

    expect(result.current.current).toEqual({
      strikes: 4,
      startedAtMilliseconds: 0,
    });
  });

  it('starts a new sequence when a restart carries a new identifier', () => {
    type Props = { id: number; strikes: number } | null;

    const { result, rerender } = renderHook(
      (animation: Props) => useChimeAnimationSession(animation),
      { initialProps: { id: 1, strikes: 4 } as Props },
    );

    rerender(null);
    now = 7_000;
    rerender({ id: 2, strikes: 4 });

    expect(result.current.current).toEqual({
      strikes: 4,
      startedAtMilliseconds: 7_000,
    });
  });

  it('keeps the running sequence when a later identifier is stale', () => {
    type Props = { id: number; strikes: number } | null;

    const { result, rerender } = renderHook(
      (animation: Props) => useChimeAnimationSession(animation),
      { initialProps: { id: 9, strikes: 4 } as Props },
    );

    now = 7_000;
    rerender({ id: 8, strikes: 4 });

    // The stale identifier is refused, and refusing it is not a withdrawal:
    // the sequence this consumer already resolved for identifier 9 keeps
    // running at its original start time rather than being rewound.
    expect(result.current.current).toEqual({
      strikes: 4,
      startedAtMilliseconds: 0,
    });
  });

  it('keeps the running sequence when a repeated identifier changes strikes', () => {
    type Props = { id: number; strikes: number } | null;

    const { result, rerender } = renderHook(
      (animation: Props) => useChimeAnimationSession(animation),
      { initialProps: { id: 1, strikes: 4 } as Props },
    );

    now = 7_000;
    rerender({ id: 1, strikes: 9 });

    // The mismatched strike count is refused for the same reason: it does
    // not silently change how long the running sequence plays for.
    expect(result.current.current).toEqual({
      strikes: 4,
      startedAtMilliseconds: 0,
    });
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
