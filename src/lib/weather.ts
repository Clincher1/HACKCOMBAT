// Client-only visual weather. No network requests, player data or economy changes.
export type WeatherPreview = 'auto' | 'day' | 'night' | 'rain';
export const WEATHER_WINDOW_MS = 3 * 60 * 60 * 1000;
const WEATHER_SEED_KEY = 'hk-demo-weather-seed-v1';

export function weatherSeed(): number {
  if (typeof window === 'undefined') return 1;
  try {
    const stored = window.localStorage.getItem(WEATHER_SEED_KEY);
    if (stored !== null && /^\d+$/.test(stored)) {
      const parsed = Number(stored);
      if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 0xffffffff) return parsed;
    }
    const values = new Uint32Array(1);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
    else values[0] = Math.floor(Math.random() * 0xffffffff);
    const seed = values[0] || 1;
    window.localStorage.setItem(WEATHER_SEED_KEY, String(seed));
    return seed;
  } catch {
    // Private browsing can deny storage; a session seed still works.
    return Math.floor(Math.random() * 0xffffffff) || 1;
  }
}

// Stable within each three-hour period and per device, but different periods
// and devices need not have identical weather. This is a simulation, not a forecast.
export function isRainyWindow(nowMs: number, seed: number): boolean {
  const slot = Math.floor(nowMs / WEATHER_WINDOW_MS);
  let hash = (slot ^ seed) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  return hash / 0x100000000 < 0.3;
}

export function getVisualWeather(nowMs: number, seed: number, preview: WeatherPreview) {
  const hour = new Date(nowMs).getHours();
  const autoNight = hour < 7 || hour >= 19;
  const rain = preview === 'rain' || (preview === 'auto' && isRainyWindow(nowMs, seed));
  const night = preview === 'night' || ((preview === 'auto' || preview === 'rain') && autoNight);
  return { rain, light: night ? 'night' as const : 'day' as const, sun: !night && !rain };
}
