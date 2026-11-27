import { Archive, Armchair, Building, Building2, Gamepad2, Globe, Laptop, Lock, Monitor, MoonStar, Package, Palmtree, Phone, Satellite, Sparkles, Target, Trophy, Briefcase } from 'lucide-react';
import React from 'react';

/**
 * HACKER KOMBAT — один набор иконок для интерфейса (v6.9).
 *
 * Почему lucide, а не свой спрайт: набор уже в проекте и tree-shake'ится —
 * в бандл попадают только реально импортированные пути (≈0.15–0.3 kB gzip на
 * иконку), а рисовать руками 30 SVG ради тех же пиктограмм — лишний код и
 * риск кривых контуров. Свой спрайт имел бы смысл только при 60+ иконках.
 *
 * Почему эмодзи не годятся: их рисует шрифт ОС, поэтому «🍭» на iOS, Android и
 * Windows — три разных картинки, которые не подчиняются палитре темы.
 *
 * Здесь — ТОЛЬКО алиасы и четыре маппера. Никаких компонентов-обёрток на
 * каждую иконку: обёртка стоит байтов, а выигрыша не даёт.
 */
export {
  BookOpen as BookIcon,
  Check as CheckIcon,
  ChevronsUp as ChevronsUpIcon,
  Circle as CircleBulletIcon,
  Clock3 as ClockIcon,
  Cog as ChipsIcon,
  Cpu as PrestigeIcon,
  Gem as CryptoIcon,
  Glasses as GlassesIcon,
  Image as ImageFrameIcon,
  Lock as LockIcon,
  Lollipop as CandiesIcon,
  Map as MapGlyph,
  Package as PackageIcon,
  PawPrint as PawIcon,
  Scale as ScaleIcon,
  ScrollText as ScrollIcon,
  Shield as RepIcon,
  Smile as AvatarFallbackIcon,
  Sparkles as DataIcon,
  Sparkles as EnergyIcon,
  Sparkles as SparkIcon,
  Target as TargetIcon,
  TriangleAlert as HeatIcon,
  TriangleAlert as TriangleAlertIcon,
  Trophy as TrophyIcon,
  Unlock as UnlockIcon,
  UserRound as UserIcon,
  Bot as HelpIcon,
  Briefcase as BriefcaseIcon,
  Archive as ArchiveIcon,
  ArrowRight as ArrowRightIcon,
  CloudFog as FogIcon,
  DoorOpen as GateIcon,
  HardDrive as DiskIcon,
  Radar as AntennaIcon,
  Snowflake as IceIcon,
  Satellite as SatelliteIcon,
  Building2 as CityIcon,
  MoonStar as MoonIcon,
} from 'lucide-react';

export type UiIconProps = { className?: string };

/** Общий тип «иконка как компонент» — чтобы мапперы и lucide жили в одном словаре. */
type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * Локации: glyph из конфига остаётся в данных (он нужен в текстах и алертах),
 * но в интерфейсе место обозначается иконкой набора.
 */
const LOCATION_ICONS: Record<string, IconComponent> = {
  room: Armchair,
  street: Building2,
  beach: Palmtree,
  cybercafe: Gamepad2,
  techhub: Satellite,
  corpquarter: Building,
};

export const LocationIcon: React.FC<{ locationId?: string | null; className?: string }> = ({
  locationId,
  className,
}) => {
  const Component = (locationId && LOCATION_ICONS[locationId]) || Globe;
  return <Component className={className} />;
};

/** Как игрок вышел в сеть — иконка вместо 📱/💻/🖥️. */
const DEVICE_ICONS: Record<string, IconComponent> = {
  laptop: Laptop,
  phone: Phone,
  desk: Monitor,
};

export const DeviceIcon: React.FC<{ device?: string | null; className?: string }> = ({ device, className }) => {
  const Component = (device && DEVICE_ICONS[device]) || Monitor;
  return <Component className={className} />;
};

/** Источник предмета в коллекции. */
const SOURCE_ICONS: Record<string, IconComponent> = {
  achievements: Trophy,
  quests: Target,
  shop: Briefcase,
  boxes: Archive,
  events: MoonStar,
};

export const SourceIcon: React.FC<{ source?: string | null; className?: string }> = ({ source, className }) => {
  const Component = (source && SOURCE_ICONS[source]) || Sparkles;
  return <Component className={className} />;
};

/** Этапы рабочего стола: одна иконка на этап, замок — пока уровень не взят. */
const STAGE_ICONS: Record<number, IconComponent> = {
  30: Globe,
  25: Satellite,
  20: Satellite,
  15: Satellite,
  10: Archive,
  5: Monitor,
  1: Monitor,
};

export const StageIcon: React.FC<{ stage: number; locked?: boolean; className?: string }> = ({
  stage,
  locked,
  className,
}) => {
  if (locked) return <Lock className={className} />;
  const Component = STAGE_ICONS[stage] ?? Monitor;
  return <Component className={className} />;
};

