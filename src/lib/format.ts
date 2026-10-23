export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2).replace(/\.00$/, '')}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  if (Number.isInteger(value)) {
    return value.toLocaleString('ru-RU');
  }
  return (Math.round(value * 10) / 10).toLocaleString('ru-RU');
}

export function formatCountdown(totalSec: number): string {
  const sec = Math.max(0, Math.ceil(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
