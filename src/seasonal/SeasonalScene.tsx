import {
  SylvaLivingWorldScene,
  type SylvaLivingWorldVariant,
} from '../shaders/sylva-living-world/SylvaLivingWorldScene';
import '../shaders/threeui.css';
import type { SeasonId } from '../weather/weather';

const seasonVariants: Record<SeasonId, SylvaLivingWorldVariant> = {
  spring: 'sakura-sunset',
  summer: 'living-green',
  autumn: 'maple-autumn',
  winter: 'sequoia-mist',
};

type SeasonalSceneProps = {
  season: SeasonId;
};

export default function SeasonalScene({ season }: SeasonalSceneProps) {
  return <SylvaLivingWorldScene variant={seasonVariants[season]} />;
}
