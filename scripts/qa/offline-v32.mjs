/**
 * HACKER KOMBAT — QA v3.2: правило «8 минут игры в день» и оффлайн-копилка.
 *
 * Запускается на собранном ядре api/_core.cjs (npm run build), БЕЗ сети и БЕЗ Supabase:
 * ядро работает в memory-fallback режиме, а время мы двигаем вручную через Date.now.
 *
 *   node scripts/qa/offline-v32.mjs
 *
 * Проверяем:
 *  1. Новая игра: оффлайн без 8 минут активности не платит вообще.
 *  2. Пауза > 45 с не считается игрой (нельзя «наиграть» 8 минут просто открыв вкладку).
 *  3. Наиграли 8 минут → копилка платит: тапы 0.1/с × сила клика + карточки ×0.5.
 *  4. Оффлайн платит только за «закрытые» сутки; кап 8 часов.
 *  5. Оффлайн НЕ даёт XP / Crypto / чипов.
 *  6. Смена суток (Москва, UTC+3) обнуляет счётчик активности, новый день без игры — 0.
 *  7. Переход через полночь: часы после 00:00 не оплачиваются до новой сессии.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const REPO_ROOT = process.cwd();
const CORE = path.join(REPO_ROOT, 'api/_core.cjs');
if (!fs.existsSync(CORE)) {
  console.error('Нет api/_core.cjs — сначала выполните: npm run build');
  process.exit(1);
}

// Ядро читает .local-db.json из текущей папки — уводим его в изолированный каталог.
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-v32-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { dispatchApiRequest } = require(CORE);

// ─────────────────────────────────────────────── управление временем
// Стартуем в фиксированную точку: 00:10 по Москве. Тогда в сутках ещё ~24 часа,
// поэтому сценарии не упираются в полночь и не зависят от реального времени запуска.
const realDateNow = Date.now;
let fakeNow = Date.parse('2026-10-23T21:10:00Z');
Date.now = () => fakeNow;
const advance = (sec) => {
  fakeNow += sec * 1000;
};
const msk = (ms = fakeNow) => new Date(ms + 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

// ─────────────────────────────────────────────── mock req/res
function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    payload: '',
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(chunk) {
      this.payload = chunk ?? '';
    },
  };
}

async function api(route, body = {}) {
  const req = {
    url: `/api/${route}`,
    method: 'POST',
    headers: {
      host: 'localhost:5173',
      'x-demo-user-id': 'v32-tester',
      'x-demo-username': 'V32Tester',
      'x-forwarded-for': '10.32.0.1',
    },
    body,
    socket: { remoteAddress: '127.0.0.1' },
    on() {},
  };
  const res = makeRes();
  await dispatchApiRequest(req, res);
  try {
    return JSON.parse(res.payload);
  } catch {
    return { raw: res.payload };
  }
}

// ─────────────────────────────────────────────── проверки
let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`PASS — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`FAIL — ${name}${extra !== '' ? ` :: ${extra}` : ''}`);
  }
}
const near = (a, b, tolPct = 0.02) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * tolPct);

// «Играем» n секунд: heartbeat каждые 30 секунд, как у реального клиента.
async function play(seconds) {
  for (let i = 0; i < Math.floor(seconds / 30); i++) {
    advance(30);
    await api('init');
  }
}

const ALERT_TITLE = /Оффлайн-доход не начислен/;

(async () => {
  console.log(`=== HACKER KOMBAT — QA v3.2: оффлайн и 8 минут игры ===\nСтарт: ${msk()} MSK\n`);

  // ── 1. Новая игра
  let r = await api('init');
  let p = r.player;
  check('игрок создан', r.ok === true && !!p, p?.id);
  check('новый игрок: 250 Data', p.data === 250, p.data);
  check('новый игрок: активность 0 с', (p.stats.activeSecondsToday ?? 0) === 0);
  check('новый игрок: оффлайн ещё не открыт', p.stats.lastQualifiedDayKey === null, p.stats.lastQualifiedDayKey);

  // ── 2. Оффлайн без 8 минут игры → 0 Data
  const beforeIdle = p.data;
  advance(3 * 3600);
  r = await api('init');
  p = r.player;
  check('без 8 минут игры оффлайн не платит', Math.abs(p.data - beforeIdle) < 0.001, `${beforeIdle} → ${p.data}`);
  check('offlineEarned не отдаётся', r.offlineEarned === undefined, r.offlineEarned);
  check(
    'честное предупреждение в алертах',
    (r.alerts ?? []).some((a) => ALERT_TITLE.test(a.title ?? '')),
    (r.alerts ?? []).map((a) => a.title).join(' | ')
  );

  // ── 3. Пауза 2 минуты не даёт активности
  advance(120);
  r = await api('init');
  check(
    'пауза 2 минуты не защитана как игра',
    (r.player.stats.activeSecondsToday ?? 0) === 0,
    r.player.stats.activeSecondsToday
  );

  // ── 4. Играем 8 минут
  await play(8 * 60);
  r = await api('init');
  p = r.player;
  check(
    '8 минут игры закрывают день',
    p.stats.lastQualifiedDayKey === p.stats.activeDayKey,
    `${p.stats.activeDayKey}, активность ${Math.round(p.stats.activeSecondsToday)} с`
  );
  const clickPower = p.derived.clickPower;

  // ── 5. Копилка: 3 часа оффлайна в тот же день (без карточек = только тапы)
  const beforeGrace = p.data;
  advance(3 * 3600);
  r = await api('init');
  p = r.player;
  const gained = p.data - beforeGrace;
  const expectedTaps = Math.floor(3 * 3600 * 0.1) * clickPower;
  console.log(`  ожидание: тапы ${expectedTaps} × сила клика ${clickPower}, начислено ${gained.toFixed(0)}`);
  check('копилка платит после закрытого дня', gained > 0, `+${gained.toFixed(0)}`);
  check('тапы идут по ставке 0.1/сек', near(gained, expectedTaps, 0.03), `${gained.toFixed(0)} ≈ ${expectedTaps}`);

  // ── 6. Оффлайн не даёт XP / Crypto / чипов
  check('оффлайн не даёт XP', p.xp === 0, p.xp);
  check('оффлайн не даёт Crypto', (p.crypto ?? 0) === 5, p.crypto);
  check('оффлайн не даёт чипов', (p.chips ?? 0) === 0, p.chips);

  // ── 7. Покупаем карточку: пассив в оффлайне идёт с множителем ×0.5, кап 8 часов
  r = await api('buy-card', { cardKey: 'monitor' });
  check('карточка куплена', r.ok === true, r.error ?? '');
  r = await api('init');
  p = r.player;
  const dataPerHour = p.derived.dataPerHour;
  const clickPowerAfter = p.derived.clickPower; // карточка даёт и бонус к силе клика
  check('пассив с карточки появился', dataPerHour > 0, `${dataPerHour} Data/час`);

  const beforeCap = p.data;
  advance(12 * 3600);
  r = await api('init');
  p = r.player;
  const capped = p.data - beforeCap;
  const capTaps = Math.floor(8 * 3600 * 0.1) * clickPowerAfter;
  const capPassive = Math.floor(dataPerHour * 0.5 * 8 * 10) / 10;
  console.log(
    `  кап 8 ч: тапы ${capTaps} + карточки ×0.5 ${capPassive.toFixed(0)} = ${(capTaps + capPassive).toFixed(0)}, начислено ${capped.toFixed(0)}`
  );
  check('за 12 часов платят как за 8', near(capped, capTaps + capPassive, 0.03), capped.toFixed(0));
  check('карточки в оффлайне платят половину', capPassive > 0 && capPassive === dataPerHour * 0.5 * 8, capPassive);

  // ── 8. Переход через полночь: новые сутки без 8 минут игры не оплачиваются
  // Прыгаем на 23:40 MSK того же дня и забираем остаток.
  const toLate = Date.parse('2026-10-24T20:40:00Z');
  advance((toLate - fakeNow) / 1000);
  const beforeLate = (await api('init')).player.data;
  const dayKeyLate = (await api('init')).player.stats.activeDayKey;
  check('до полуночи сутки ещё закрыты', dayKeyLate === '2026-10-24', dayKeyLate);

  advance(3600); // 00:40 MSK — уже следующие сутки
  r = await api('init');
  p = r.player;
  const nightGain = p.data - beforeLate;
  const nightMinutes = 20; // с 23:40 до 00:00 платятся только 20 минут
  const nightSec = nightMinutes * 60;
  const nightExpected =
    Math.floor(nightSec * 0.1) * clickPowerAfter + Math.floor(((dataPerHour * 0.5) / 3600) * nightSec * 10) / 10;
  console.log(`  через полночь: начислено ${nightGain.toFixed(0)}, ожидание только за 20 мин ≈ ${nightExpected.toFixed(0)}`);
  check('смена суток сменила activeDayKey', p.stats.activeDayKey === '2026-10-25', p.stats.activeDayKey);
  check('активность новых суток = 0', (p.stats.activeSecondsToday ?? 0) === 0, p.stats.activeSecondsToday);
  check(
    'после полуночи платят лишь остаток закрытых суток',
    near(nightGain, nightExpected, 0.05),
    nightGain.toFixed(0)
  );

  // ── 9. Новые сутки без 8 минут игры → оффлайн снова молчит
  const beforeGhost = p.data;
  advance(3 * 3600); // 03:40 MSK
  r = await api('init');
  p = r.player;
  check('в новый день без игры оффлайн не платит', Math.abs(p.data - beforeGhost) < 0.001, `${beforeGhost} → ${p.data}`);
  check(
    'предупреждение снова показано',
    (r.alerts ?? []).some((a) => ALERT_TITLE.test(a.title ?? '')),
    (r.alerts ?? []).map((a) => a.title).join(' | ')
  );

  // ── 10. Играем в новых сутках — копилка возвращается
  await play(8 * 60);
  r = await api('init');
  p = r.player;
  check('новая сессия закрыла новые сутки', p.stats.lastQualifiedDayKey === '2026-10-25', p.stats.lastQualifiedDayKey);
  const beforeNew = p.data;
  advance(2 * 3600);
  r = await api('init');
  p = r.player;
  check('копилка снова платит', p.data - beforeNew > 0, `+${(p.data - beforeNew).toFixed(0)}`);

  // ── 11. Старые сейвы (играли до v3.2): одна бесплатная выдача, потом всё по правилам
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-v32-legacy-'));
  const dbSnapshot = JSON.parse(fs.readFileSync(path.join(sandbox, '.local-db.json'), 'utf8'));
  const legacyRecord = Object.values(dbSnapshot.playersByTgId)[0];
  // Имитируем сейв «из прошлой версии»: счётчиков активности ещё нет,
  // отметки оффлайна — три часа назад, игрок явно играл (есть клики).
  const legacyStats = { ...legacyRecord.stats };
  delete legacyStats.activeDayKey;
  delete legacyStats.activeSecondsToday;
  delete legacyStats.lastQualifiedDayKey;
  delete legacyStats.lastActiveAt;
  delete legacyStats.offlineGraceUsed;
  const threeHoursAgo = new Date(fakeNow - 3 * 3600_000).toISOString();
  legacyRecord.stats = { ...legacyStats, lastTapClaimAt: threeHoursAgo };
  legacyRecord.lastPassiveClaim = threeHoursAgo;
  legacyRecord.totalClicks = Math.max(1, legacyRecord.totalClicks ?? 1);
  fs.writeFileSync(
    path.join(legacyDir, '.local-db.json'),
    JSON.stringify({ playersByTgId: { [legacyRecord.tgId]: legacyRecord } })
  );
  const legacyOut = JSON.parse(
    execFileSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts/qa/legacy-grace-child.cjs'), legacyDir, String(fakeNow + 60_000), 'v32-tester'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim()
  );
  console.log(
    `  старый сейв: первая выдача ${legacyOut.firstEarned} Data, вторая ${legacyOut.secondEarned} Data`
  );
  check('старому сейву один раз прощают оффлайн', legacyOut.firstEarned > 0, legacyOut.firstEarned);
  check('поблажка помечена как использованная', legacyOut.graceUsed === true);
  check('повторно поблажка не выдаётся', legacyOut.secondEarned === 0, legacyOut.secondEarned);
  check('после поблажки игроку честно объясняют причину', legacyOut.secondAlert === true);

  console.log(`\n=== ИТОГО: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) console.log('Провалы: ' + failures.join(' | '));

  Date.now = realDateNow;
  fs.rmSync(sandbox, { recursive: true, force: true });
  process.exitCode = fail > 0 ? 1 : 0;
})().catch((err) => {
  Date.now = realDateNow;
  console.error('CRASH', err);
  process.exitCode = 1;
});
