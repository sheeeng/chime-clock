import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CuckooClock } from './CuckooClock';
import { resetChimeAnimationSession } from './chimeAnimationSession';

const time = new Date(2026, 9, 14, 3, 30, 0);
let elapsed = 0;
let nextFrame: FrameRequestCallback;

beforeEach(() => {
  resetChimeAnimationSession();
  elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 1;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetChimeAnimationSession();
});

function advance(milliseconds: number) {
  elapsed = milliseconds;
  act(() => nextFrame(milliseconds));
}

it('follows uneven audio strike times instead of a one second timer', () => {
  render(<CuckooClock time={time} chimeAnimation={{
    id: 1,
    strikes: 3,
    startedAtMilliseconds: 0,
    strikeOffsetsMilliseconds: [0, 990, 1890],
  }} />);
  advance(875);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '0');
  advance(1240);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '1');
  advance(2015);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '0.5');
  advance(2640);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '0');
  expect(screen.getByTestId('cuckoo-dancers')).toHaveAttribute('data-dancing', 'false');
});

it('waits for the scheduled playback start before revealing the bird', () => {
  render(<CuckooClock time={time} chimeAnimation={{
    id: 1,
    strikes: 1,
    startedAtMilliseconds: 5000,
    strikeOffsetsMilliseconds: [0],
  }} />);
  advance(4900);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '0');
  advance(5250);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '1');
});

it('shows the local time on the birdhouse dial', () => {
  render(<CuckooClock time={time} chimeAnimation={null} />);
  expect(screen.getByTestId('cuckoo-hour-hand')).toHaveAttribute('transform', 'rotate(105 200 265)');
  expect(screen.getByTestId('cuckoo-minute-hand')).toHaveAttribute('transform', 'rotate(180 200 265)');
});

it('advances the seconds hand with local time', () => {
  const { rerender } = render(<CuckooClock time={new Date(2026, 9, 14, 3, 30, 15)} chimeAnimation={null} />);
  expect(screen.getByTestId('cuckoo-second-hand')).toHaveAttribute('transform', 'rotate(90 200 265)');
  rerender(<CuckooClock time={new Date(2026, 9, 14, 3, 30, 16)} chimeAnimation={null} />);
  expect(screen.getByTestId('cuckoo-second-hand')).toHaveAttribute('transform', 'rotate(96 200 265)');
});

it('opens both doors and closes them after the final strike', () => {
  render(<CuckooClock time={time} chimeAnimation={{ id: 1, strikes: 1 }} />);
  const leftDoor = screen.getByTestId('cuckoo-left-door');
  const rightDoor = screen.getByTestId('cuckoo-right-door');
  const leftClosed = leftDoor.getAttribute('transform');
  const rightClosed = rightDoor.getAttribute('transform');
  expect(screen.getByTestId('cuckoo-dancers')).toHaveAttribute('data-dancing', 'true');
  advance(250);
  expect(leftDoor.getAttribute('transform')).not.toBe(leftClosed);
  expect(rightDoor.getAttribute('transform')).not.toBe(rightClosed);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '1');
  advance(1000);
  expect(screen.getByTestId('cuckoo-dancers')).toHaveAttribute('data-dancing', 'false');
  expect(leftDoor).toHaveAttribute('transform', leftClosed);
  expect(rightDoor).toHaveAttribute('transform', rightClosed);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '0');
});

it('resumes the same sequence after a remount without replaying it', () => {
  const animation = { id: 1, strikes: 2 };
  const { unmount } = render(<CuckooClock time={time} chimeAnimation={animation} />);
  advance(250);
  unmount();
  elapsed = 1750;
  render(<CuckooClock time={time} chimeAnimation={animation} />);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '0');
  advance(2000);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '0');
});

it('hides the bird when the chime is canceled and releases its frame', () => {
  const { rerender, unmount } = render(<CuckooClock time={time} chimeAnimation={{ id: 1, strikes: 12 }} />);
  advance(250);
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '1');
  rerender(<CuckooClock time={time} chimeAnimation={null} />);
  expect(screen.getByTestId('cuckoo-dancers')).toHaveAttribute('data-dancing', 'false');
  expect(screen.getByTestId('cuckoo-bird')).toHaveAttribute('opacity', '0');
  unmount();
  expect(cancelAnimationFrame).toHaveBeenCalled();
});
