/** Standalone inventory scope, legacy data preservation and public visibility. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const core = path.join(root, 'api/_core.cjs');
if (!fs.existsSync(core)) throw new Error('Сначала выполните npm run build');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'hk-inventory-scope-'));
process.chdir(sandbox);
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const seed = 'inventory-scope';
const tgId = -(100_000_000 + crypto.createHash('sha256').update(`hk-guest-sandbox:${seed}`).digest().readUInt32BE(0) % 800_000_000);
const profileId = 'a0000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();
const legacy = ['achievement:first_mission', 'achievement:first_upgrade', 'frame:frame_rooster_red', 'skin:neon', 'companion:hamster'];
const record = {
  id: profileId, tgId, username: 'InventoryScope', data: 10000, crypto: 500, chips: 0, xp: 0,
  energy: 100, energyUpdated: now, heat: 0, rep: 0, prestigeCount: 0, cardTier: 1,
  clickBlockedUntil: null, dailyStreak: 0, lastDailyClaim: null, equippedSkin: 'default',
  unlockedSkins: ['default', 'neon'], totalClicks: 0, totalMissions: 0, lastPassiveClaim: now,
  lastClickBatchAt: 0, cards: {}, team: [], pets: [], baseUpgrades: {},
  stats: { inventoryOwned: ['reward:first_donut', 'reward:gift_snus'], inventoryShowcase: legacy,
    unlockedProfileFrames: ['frame_rooster_red'], equippedProfileFrame: 'frame_rooster_red' },
  activeMissions: [], availableMissionKeys: [], missionsRefreshedAt: now,
  achievements: ['first_mission', 'first_upgrade'],
};
fs.writeFileSync(path.join(sandbox, '.local-db.json'), JSON.stringify({ playersByTgId: { [tgId]: record } }));
const { dispatchApiRequest } = createRequire(import.meta.url)(core);
async function api(route, body = {}, method = 'POST', caller = seed) {
  const req = { url: `/api/${route}`, method, headers: { host: 'localhost:5173', 'x-demo-user-id': caller, 'x-demo-username': 'InventoryScope', 'x-forwarded-for': '10.41.0.1' }, body, socket: { remoteAddress: '127.0.0.1' }, on() {} };
  const res = { statusCode: 200, payload: '', setHeader() {}, end(chunk) { this.payload = chunk ?? ''; } };
  await dispatchApiRequest(req, res);
  return { ...JSON.parse(res.payload), status: res.statusCode };
}
let pass = 0;
let fail = 0;
function check(name, value) {
  console.log(`${value ? 'PASS' : 'FAIL'} — ${name}`);
  if (value) pass++; else fail++;
}
const init = await api('init');
check('инвентарь содержит только памятные предметы', init.ok && JSON.stringify([...init.player.inventory.ownedKeys].sort()) === JSON.stringify(['reward:first_donut', 'reward:gift_python_book', 'reward:gift_snus', 'reward:new_year_candy']));
check('прежние рамки и достижения сохранены', init.player.stats.unlockedProfileFrames.includes('frame_rooster_red') && init.player.stats.equippedProfileFrame === 'frame_rooster_red' && init.player.achievements.includes('first_mission'));
check('старые типы не отображаются в витрине инвентаря', init.player.inventory.showcaseKeys.length === 0);
const refused = await api('inventory', { action: 'set_public', itemKey: 'achievement:first_mission', visible: true });
check('нельзя добавить обычную ачивку в инвентарь', !refused.ok);
const show = await api('inventory', { action: 'set_public', itemKey: 'reward:gift_snus', visible: true });
check('подарок можно выставить', show.ok && show.player.inventory.showcaseKeys.includes('reward:gift_snus'));
const persisted = JSON.parse(fs.readFileSync(path.join(sandbox, '.local-db.json'), 'utf8')).playersByTgId[tgId];
check('старые настройки витрины не уничтожаются при сохранении', legacy.every((key) => persisted.stats.inventoryShowcase.includes(key)));
const publicView = await api(`profile?profileId=${profileId}`, {}, 'GET', 'inventory-viewer');
const publicItems = publicView.profile?.items ?? [];
check('публичная витрина содержит только выставленный подарок', publicView.ok && publicItems.length === 1 && publicItems[0].key === 'reward:gift_snus');
check('фото снюса доступно в публичной витрине', publicItems[0]?.imageUrl === '/assets/inventory/snus-packed.jpg');
check('подарок не расходуется и не экипируется', publicItems[0]?.usable === false && publicItems[0]?.equipAction === null);
const hide = await api('inventory', { action: 'set_public', itemKey: 'reward:gift_snus', visible: false });
const reload = await api('init');
const publicAfter = await api(`profile?profileId=${profileId}`, {}, 'GET', 'inventory-viewer');
check('скрытие сохраняется после перезагрузки', hide.ok && reload.player.inventory.ownedKeys.includes('reward:gift_snus') && !reload.player.inventory.showcaseKeys.includes('reward:gift_snus') && publicAfter.profile?.items.length === 0);
const book = 'reward:gift_python_book';
const newPlayer = await api('init', {}, 'POST', 'python-book-new-player');
const newAgain = await api('init', {}, 'POST', 'python-book-new-player');
check('новый игрок получает учебник без автоматической публикации', newPlayer.ok && newPlayer.player.inventory.ownedKeys.includes(book) && !newPlayer.player.inventory.showcaseKeys.includes(book));
check('повторный вход не дублирует учебник у нового игрока', newAgain.player.inventory.ownedKeys.filter((key) => key === book).length === 1);
check('старый игрок получил учебник без публикации', reload.player.inventory.ownedKeys.includes(book) && !reload.player.inventory.showcaseKeys.includes(book));
const snackAgain = await api('inventory', { action: 'set_public', itemKey: 'reward:gift_snus', visible: true });
const bookShow = await api('inventory', { action: 'set_public', itemKey: book, visible: true });
const bookReload = await api('init');
const bookPublic = await api(`profile?profileId=${profileId}`, {}, 'GET', 'python-book-viewer');
const visibleBook = (bookPublic.profile?.items ?? []).find((item) => item.key === book);
check('учебник можно выставить и сохранить рядом с другими предметами', snackAgain.ok && bookShow.ok && bookReload.player.inventory.showcaseKeys.includes(book) && bookReload.player.inventory.showcaseKeys.includes('reward:gift_snus'));
check('другой игрок видит учебник и его изображение', visibleBook?.name === 'Учебник по Python' && visibleBook?.imageUrl === '/assets/inventory/python-book.svg');
check('учебник остаётся подарком без использования или экипировки', visibleBook?.inventoryCategory === 'gift' && visibleBook?.usable === false && visibleBook?.equipAction === null);
check('у публичного профиля нет приватного баланса или Telegram ID', !('data' in bookPublic.profile) && !('tgId' in bookPublic.profile) && !('stats' in bookPublic.profile));
const bookHide = await api('inventory', { action: 'set_public', itemKey: book, visible: false });
const bookHiddenProfile = await api(`profile?profileId=${profileId}`, {}, 'GET', 'python-book-viewer');
check('скрытие учебника сохраняет его в инвентаре и не скрывает другой подарок', bookHide.ok && bookHide.player.inventory.ownedKeys.includes(book) && !(bookHiddenProfile.profile?.items ?? []).some((item) => item.key === book) && (bookHiddenProfile.profile?.items ?? []).some((item) => item.key === 'reward:gift_snus'));
const invalidUse = await api('inventory', { action: 'use', itemKey: book });
check('учебник нельзя использовать или расходовать', !invalidUse.ok);
check('изображение учебника включено в сборку', fs.existsSync(path.join(root, 'dist/assets/inventory/python-book.svg')));
check('исходное фото включено в сборку', fs.existsSync(path.join(root, 'dist/assets/inventory/snus-packed.jpg')));
fs.rmSync(sandbox, { recursive: true, force: true });
console.log(`\nИтог: ${pass} pass / ${fail} fail`);
if (fail) process.exitCode = 1;
