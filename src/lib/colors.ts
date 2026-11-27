/**
 * HACKER KOMBAT — единственный способ смешать акцент с прозрачностью (v6.9).
 *
 * Зачем: до этой версии в компонентах жили строки вида `${accent}55`, где
 * accent — то hex из конфига, то CSS-токен темы. Для токена такая склейка даёт
 * `var(--ui-primary)55` — невалидный цвет, и браузер молча рисовал рамку
 * прозрачной. Теперь оба случая идут через одну функцию.
 *
 * Правило проекта: hex живёт только в shared/*.config.ts и в index.css.
 * В .tsx цвет берётся токеном (var(--ui-*)), проверяется scripts/qa/ui.mjs.
 */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 100) / 100;
  const value = String(color || '').trim();

  // Конфиг отдал hex — раскладываем в rgba (сразу, без токенов).
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const raw = hex[1];
    const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // Токен темы — у каждого есть брат-близнец с RGB-триплетом (--ui-*-rgb).
  const token = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  if (token) return `rgba(var(${token[1]}-rgb), ${a})`;

  // Уже rgba/цвет-функция или неизвестный формат — не портим, возвращаем как есть.
  return value;
}
