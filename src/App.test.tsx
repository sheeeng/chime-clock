import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { playChime } from './audio/chimes';
import { playSecondsSound } from './audio/seconds';

const stopPlayback = vi.fn();

vi.mock('./audio/chimes', async (importOriginal) => {
  const original = await importOriginal<typeof import('./audio/chimes')>();

  return {
    ...original,
    playChime: vi.fn(() => ({ stop: stopPlayback })),
  };
});

vi.mock('./audio/seconds', () => ({
  playSecondsSound: vi.fn(),
}));

class AudioContextStub {
  state = 'running';

  resume = vi.fn();
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 16, 12, 0, 0));
    vi.stubGlobal('AudioContext', AudioContextStub);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ time: Date.now() }),
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the clock, date, title, and disabled chime controls', () => {
    render(<App />);

    expect(screen.getByText('Chime Clock')).toBeInTheDocument();
    expect(screen.getByText('Sunday, 16 August 2026')).toBeInTheDocument();
    expect(screen.getByText('Chime Interval')).toBeInTheDocument();
    expect(screen.getByText('Seconds Sound')).toBeInTheDocument();
    expect(screen.queryByText('Chime Sound')).not.toBeInTheDocument();
  });

  it('reveals chime choices and previews twelve strikes at noon', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));

    expect(screen.getByText('Chime Sound')).toBeInTheDocument();
    expect(playChime).toHaveBeenCalledWith(
      expect.any(AudioContextStub),
      'classic',
      12,
      'hour',
    );
  });

  it('stops the active chime before previewing another style', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
    fireEvent.click(screen.getByRole('button', { name: 'Modern' }));

    expect(stopPlayback).toHaveBeenCalledOnce();
    expect(playChime).toHaveBeenLastCalledWith(
      expect.any(AudioContextStub),
      'modern',
      1,
      'hour',
    );
  });

  it.each([
    ['Bell', 'bell'],
    ['Cuckoo', 'cuckoo'],
    ['Modern', 'modern'],
    ['Westminster', 'westminster'],
  ] as const)('previews the %s chime style', (label, style) => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(playChime).toHaveBeenLastCalledWith(
      expect.any(AudioContextStub),
      style,
      1,
      'hour',
    );
  });

  it.each([
    ['Quarterly', 15, 'quarter'],
    ['Half-Hourly', 30, 'half-hour'],
  ] as const)('previews %s once', (label, _interval, timing) => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(playChime).toHaveBeenCalledWith(
      expect.any(AudioContextStub),
      'classic',
      1,
      timing,
    );
  });

  it('stops playback when chimes are disabled', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Off' })[0]);

    expect(stopPlayback).toHaveBeenCalledOnce();
  });

  it('plays the matching hour count at an hourly boundary', () => {
    vi.setSystemTime(new Date(2026, 7, 16, 10, 59, 59, 900));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Hourly' }));
    vi.mocked(playChime).mockClear();

    vi.setSystemTime(new Date(2026, 7, 16, 11, 0, 0, 100));
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(playChime).toHaveBeenCalledWith(
      expect.any(AudioContextStub),
      'classic',
      11,
      'hour',
    );
  });

  it.each(['Mechanical', 'Cinematic', 'Textured'])(
    'previews the %s seconds sound',
    (label) => {
      render(<App />);

      fireEvent.click(screen.getByRole('button', { name: label }));

      expect(playSecondsSound).toHaveBeenCalledWith(
        expect.any(AudioContextStub),
        label.toLowerCase(),
        0,
      );
    },
  );

  it('shows successful server time synchronization', async () => {
    render(<App />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/The time difference is/)).toBeInTheDocument();
    expect(screen.getByText('2.pool.ntp.org')).toBeInTheDocument();
  });

  it('shows a synchronization error when both sources fail', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network unavailable.'));
    render(<App />);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Failed to sync NTP.')).toBeInTheDocument();
  });

  it('hides and restores the interface from the clock canvas', () => {
    render(<App />);
    const clockCanvas = screen.getByTitle('Click to toggle full-screen clock.');

    fireEvent.click(clockCanvas);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Chime Clock')).not.toBeInTheDocument();

    fireEvent.click(clockCanvas);
    expect(screen.getByText('Chime Clock')).toBeInTheDocument();
  });
});
