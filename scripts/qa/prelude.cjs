// Прелюдия для SSR-прогонов QA (esbuild --banner:js): модули игры трогают
// браузерные API на этапе импорта, поэтому заглушки ставим до их загрузки.
const memoryStore = () => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(String(key)) ? map.get(String(key)) : null),
    setItem: (key, value) => map.set(String(key), String(value)),
    removeItem: (key) => map.delete(String(key)),
    clear: () => map.clear(),
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  };
};
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = memoryStore();
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = memoryStore();
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    localStorage: globalThis.localStorage,
    sessionStorage: globalThis.sessionStorage,
    location: { href: 'https://hacker-kombat.vercel.app/', origin: 'https://hacker-kombat.vercel.app', search: '', pathname: '/', hash: '' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    navigator: { userAgent: 'QA/1.0 (overlays)', language: 'ru-RU' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
}
if (typeof globalThis.navigator === 'undefined') globalThis.navigator = { userAgent: 'QA/1.0 (overlays)', language: 'ru-RU' };
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    documentElement: { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null },
    body: { style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, appendChild() {} },
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} }, addEventListener() {} }),
    getElementById: () => null,
    head: { appendChild() {} },
    cookie: '',
  };
}
