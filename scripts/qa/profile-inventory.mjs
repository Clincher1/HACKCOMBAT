/**
 * Проверка постоянного инвентаря, памятного пончика и публичной витрины.
 * Запуск: node scripts/qa/profile-inventory.mjs (нужен npm run dev).
 */
const BASE = process.env.API_BASE ?? 'http://localhost:5173';
const RUN = Date.now().toString(36);
let pass = 0;
let fail = 0;

function check(name, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}${detail ? ` :: ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL — ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function headers(seed) {
  return {
    'Content-Type': 'application/json',
    'x-demo-user-id': `${seed}-${RUN}`,
    'x-demo-username': `Inventory_${seed}`,
  };
}

async function request(path, seed, method = 'GET', body) {
  const response = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: headers(seed),
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  let json;
  try {
    json = await response.json();
  } catch {
    json = { ok: false, error: 'non-json' };
  }
  return { status: response.status, json };
}

const main = await request('init', 'inventory-main', 'POST', {});
const mainPlayer = main.json.player ?? {};
check('init отдаёт инвентарь', main.status === 200 && mainPlayer.inventory, JSON.stringify(mainPlayer.inventory));
check(
  'всем игрокам выдан первый пончик',
  mainPlayer.inventory?.ownedKeys?.includes('reward:first_donut'),
  mainPlayer.inventory?.ownedKeys?.join(',')
);
check(
  'пончик по умолчанию скрыт',
  !(mainPlayer.inventory?.showcaseKeys ?? []).includes('reward:first_donut'),
  mainPlayer.inventory?.showcaseKeys?.join(',')
);

const show = await request(
  'inventory',
  'inventory-main',
  'POST',
  { action: 'set_public', itemKey: 'reward:first_donut', visible: true }
);
check('владелец может выставить пончик', show.status === 200 && show.json.ok === true);
check(
  'витрина сохраняется на сервере',
  show.json.player?.inventory?.showcaseKeys?.includes('reward:first_donut'),
  show.json.player?.inventory?.showcaseKeys?.join(',')
);

const invalid = await request(
  'inventory',
  'inventory-main',
  'POST',
  { action: 'set_public', itemKey: 'reward:unknown', visible: true }
);
check('неизвестный предмет нельзя выставить', invalid.status >= 400 && invalid.json.ok === false, invalid.json.error);

const other = await request('init', 'inventory-other', 'POST', {});
const otherId = other.json.player?.id;
check('второй игрок создаётся для проверки публичного профиля', Boolean(otherId), otherId);
const publicProfile = await request(`profile?profileId=${encodeURIComponent(otherId ?? '')}`, 'inventory-main');
check('другой игрок может открыть профиль', publicProfile.status === 200 && publicProfile.json.ok === true);
check(
  'скрытые предметы не попадают в публичный профиль',
  (publicProfile.json.profile?.items ?? []).length === 0,
  JSON.stringify(publicProfile.json.profile?.items)
);

const otherShow = await request(
  'inventory',
  'inventory-other',
  'POST',
  { action: 'set_public', itemKey: 'reward:first_donut', visible: true }
);
check('второй игрок тоже может выставить подарок', otherShow.status === 200 && otherShow.json.ok === true);
const publicAfterShow = await request(`profile?profileId=${encodeURIComponent(otherId ?? '')}`, 'inventory-main');
check(
  'публичный профиль показывает только выставленный пончик',
  publicAfterShow.json.profile?.items?.length === 1 && publicAfterShow.json.profile.items[0]?.key === 'reward:first_donut',
  JSON.stringify(publicAfterShow.json.profile?.items)
);
check(
  'пончик остаётся неприменимым предметом',
  publicAfterShow.json.profile?.items?.[0]?.usable === false && publicAfterShow.json.profile?.items?.[0]?.equipAction === null
);

const hide = await request(
  'inventory',
  'inventory-main',
  'POST',
  { action: 'set_public', itemKey: 'reward:first_donut', visible: false }
);
check(
  'владелец может снова скрыть подарок',
  hide.status === 200 && !hide.json.player?.inventory?.showcaseKeys?.includes('reward:first_donut')
);

console.log(`\nProfile inventory QA: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
