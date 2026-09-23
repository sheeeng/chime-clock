import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockDisplay } from './ClockDisplay';
import { resetChimeAnimationSession } from './chimeAnimationSession';

const threeClock = vi.hoisted(() => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  return { gate, release, imported: vi.fn() };
});

vi.mock('./ThreeClock', async () => {
  threeClock.imported();
  await threeClock.gate;

  return {
    default: ({
      mode,
      time,
      chimeAnimation,
    }: {
      mode: string;
      time: Date;
      chimeAnimation: { id: number; strikes: number } | null;
    }) => (
      <div
        data-testid="three-clock"
        data-mode={mode}
        data-time={time.toISOString()}
        data-strikes={chimeAnimation ? String(chimeAnimation.strikes) : 'none'}
      />
    ),
  };
});

const time = new Date(2026, 8, 22, 15, 4, 9);

function formattedParts(value: Date) {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);

  return {
    hour: parts.find((part) => part.type === 'hour')?.value ?? '',
    minute: parts.find((part) => part.type === 'minute')?.value ?? '',
    second: parts.find((part) => part.type === 'second')?.value ?? '',
  };
}

describe('ClockDisplay', () => {
  // The session record lives in module scope and outlives every render, so
  // each case starts from an empty record rather than inheriting the chime
  // identifiers of the case before it.
  beforeEach(() => {
    resetChimeAnimationSession();
  });

  afterEach(() => {
    resetChimeAnimationSession();
  });

  describe('digital mode', () => {
    beforeEach(() => {
      threeClock.imported.mockClear();
    });

    it('renders the formatted local time', () => {
      render(<ClockDisplay mode="digital" time={time} chimeAnimation={null} />);

      const { hour, minute, second } = formattedParts(time);
      const display = screen.getByTestId('digital-clock');

      expect(display).toHaveTextContent(hour);
      expect(display).toHaveTextContent(minute);
      expect(display).toHaveTextContent(second);
    });

    it('never loads the Three.js clock module', async () => {
      render(<ClockDisplay mode="digital" time={time} chimeAnimation={null} />);

      await Promise.resolve();

      expect(threeClock.imported).not.toHaveBeenCalled();
      expect(screen.queryByTestId('three-clock')).not.toBeInTheDocument();
    });
  });

  describe('analog mode', () => {
    it('shows an accessible loading label until the model arrives', async () => {
      render(<ClockDisplay mode="analog" time={time} chimeAnimation={null} />);

      expect(screen.getByRole('status')).toHaveTextContent(/loading/i);

      threeClock.release();

      const clock = await screen.findByTestId('three-clock');

      expect(clock).toHaveAttribute('data-mode', 'analog');
      expect(clock).toHaveAttribute('data-time', time.toISOString());
      expect(clock).toHaveAttribute('data-strikes', 'none');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('keeps a stable 16:10 frame around the model', async () => {
      threeClock.release();
      render(<ClockDisplay mode="analog" time={time} chimeAnimation={null} />);

      const clock = await screen.findByTestId('three-clock');

      expect(clock.parentElement).toHaveClass('aspect-[16/10]');
    });
  });

  describe('cuckoo mode', () => {
    it('passes the chime animation to the model', async () => {
      threeClock.release();
      render(
        <ClockDisplay
          mode="cuckoo"
          time={time}
          chimeAnimation={{ id: 7, strikes: 12 }}
        />,
      );

      const clock = await screen.findByTestId('three-clock');

      expect(clock).toHaveAttribute('data-mode', 'cuckoo');
      expect(clock).toHaveAttribute('data-strikes', '12');
    });
  });
});
