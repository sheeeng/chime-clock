import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SeasonalBackground } from './SeasonalBackground';
import type { SeasonId } from '../weather/weather';

const seasonVariants: Record<SeasonId, string> = {
  spring: 'sakura-sunset',
  summer: 'living-green',
  autumn: 'maple-autumn',
  winter: 'sequoia-mist',
};

vi.mock('./SeasonalScene', () => ({
  default: ({ season }: { season: SeasonId }) => (
    <div data-testid="seasonal-scene" data-variant={seasonVariants[season]} />
  ),
}));

describe('SeasonalBackground', () => {
  it('renders nothing when no season is active', () => {
    const { container } = render(<SeasonalBackground season={null} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('seasonal-scene')).not.toBeInTheDocument();
  });

  it('renders the sakura-sunset variant for spring', async () => {
    render(<SeasonalBackground season="spring" />);

    expect(await screen.findByTestId('seasonal-scene')).toHaveAttribute(
      'data-variant',
      'sakura-sunset',
    );
  });

  it('renders the living-green variant for summer', async () => {
    render(<SeasonalBackground season="summer" />);

    expect(await screen.findByTestId('seasonal-scene')).toHaveAttribute(
      'data-variant',
      'living-green',
    );
  });

  it('renders the maple-autumn variant for autumn', async () => {
    render(<SeasonalBackground season="autumn" />);

    expect(await screen.findByTestId('seasonal-scene')).toHaveAttribute(
      'data-variant',
      'maple-autumn',
    );
  });

  it('renders the sequoia-mist variant for winter', async () => {
    render(<SeasonalBackground season="winter" />);

    expect(await screen.findByTestId('seasonal-scene')).toHaveAttribute(
      'data-variant',
      'sequoia-mist',
    );
  });

  it('is decorative and does not intercept page clicks', async () => {
    const { container } = render(<SeasonalBackground season="summer" />);
    await screen.findByTestId('seasonal-scene');

    const decorativeLayer = container.firstElementChild;

    expect(decorativeLayer).toHaveAttribute('aria-hidden', 'true');
    expect(decorativeLayer).toHaveClass('pointer-events-none');
  });
});
