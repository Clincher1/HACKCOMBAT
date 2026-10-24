/**
 * HACKER KOMBAT — QA v3.2, вспомогательный процесс.
 *
 * Проверяет одноразовую поблажку для «старых» сейвов: игрок играл до v3.2,
 * счётчиков активности у него ещё нет — ему один раз платят за оффлайн,
 * а затем копилка закрывается до честных 8 минут игры.
 *
 * Запускается из scripts/qa/offline-v32.mjs (второй процесс = чистое in-memory
 * хранилище с заранее подготовленным .local-db.json):
 *
 *   node scripts/qa/legacy-grace-child.cjs <sandboxDir> <fakeNowMs> [demoSeed]
 *
 * Печатает JSON: { first, second, secondAlert, qualified, graceUsed }.
 */
const path = require('node:path');
const { createRequire } = require('node:module');
const requireFromHere = createRequire(__filename);

const [sandboxDir, fakeNowArg, demoSeed = 'v32-tester'] = process.argv.slice(2);
let fakeNow = Number(fakeNowArg);
const corePath = path.resolve(__dirname, '../../api/_core.cjs');

if (!sandboxDir || !Number.isFinite(fakeNow)) {
  console.error('usage: node legacy-grace-child.cjs <sandboxDir> <fakeNowMs>');
  process.exit(1);
}

process.chdir(sandboxDir);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
Date.now = () => fakeNow;

const { dispatchApiRequest } = requireFromHere(corePath);

async function init() {
  const req = {
    url: '/api/init',
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': demoSeed,
      'x-demo-username': 'V32Tester',
      'x-forwarded-for': '10.32.9.9',
    },
    body: {},
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = {
    statusCode: 200,
    headers: {},
    payload: '',
    setHeader() {},
    end(chunk) {
      this.payload = chunk ?? '';
    },
  };
  await dispatchApiRequest(req, res);
  try {
    return JSON.parse(res.payload);
  } catch {
    return { raw: res.payload };
  }
}

(async () => {
  const first = await init();
  // +30 минут: поблажка израсходована, а игрок всё ещё не наиграл 8 минут.
  // Такой разрыв уже достаточен, чтобы получить честное предупреждение.
  fakeNow += 30 * 60_000;
  const second = await init();
  const stats = second.player?.stats ?? {};
  console.log(
    JSON.stringify({
      firstEarned: first.offlineEarned ?? 0,
      firstData: first.player?.data ?? 0,
      secondEarned: second.offlineEarned ?? 0,
      secondData: second.player?.data ?? 0,
      secondAlert: (second.alerts ?? []).some((a) => /Оффлайн-доход не начислен/.test(a.title ?? '')),
      graceUsed: stats.offlineGraceUsed === true,
      qualified: stats.lastQualifiedDayKey ?? null,
    })
  );
})().catch((err) => {
  console.error('CRASH', err);
  process.exit(1);
});
