import React from 'react';
import {
  AntennaIcon,
  CityIcon,
  DiskIcon,
  FogIcon,
  GateIcon,
  GlassesIcon,
  IceIcon,
  MoonIcon,
  SatelliteIcon,
  SparkIcon,
} from './ui-icons';

/**
 * HACKER KOMBAT — обложка главы сюжета (v6.11).
 *
 * Живёт отдельно от `ui-icons`, потому что нужна ровно одному экрану —
 * ленивому чанку `/story`. Если положить маппер в хаб, шесть иконок обложек
 * поедут в главный бандл всем игрокам (и провалят бюджет +0.5 kB), хотя
 * девяносто процентов из них экран «История» никогда не откроют.
 *
 * В данных `StoryArc.cover` — ключ (`ice`, `gate`, …), а не текстовый глиф:
 * обложка подчиняется палитре и одинаково выглядит на всех ОС.
 */
type IconComponent = React.ComponentType<{ className?: string }>;

const STORY_COVERS: Record<string, IconComponent> = {
  ice: IceIcon,
  antenna: AntennaIcon,
  signal: SatelliteIcon,
  shades: GlassesIcon,
  disk: DiskIcon,
  fog: FogIcon,
  moon: MoonIcon,
  city: CityIcon,
  gate: GateIcon,
};

export const StoryCoverIcon: React.FC<{ cover?: string | null; className?: string }> = ({ cover, className }) => {
  const Component = (cover && STORY_COVERS[cover]) || SparkIcon;
  return <Component className={className} />;
};

export default StoryCoverIcon;
