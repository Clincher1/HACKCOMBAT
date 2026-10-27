/**
 * HACKER KOMBAT — QA: персональный тап-эффект красных перьев.
 *
 * Это намеренно статическая проверка: перья — локальная косметика и не должны
 * менять серверную механику клика. Игрок определяется стабильным Telegram ID,
 * а не редактируемым username.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const deskScene = fs.readFileSync(path.join(root, 'src/components/DeskScene.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, condition, extra = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS — ${name}${extra ? ` :: ${extra}` : ''}`);
  } else {
    fail += 1;
    console.log(`FAIL — ${name}${extra ? ` :: ${extra}` : ''}`);
  }
}

check(
  'эффект привязан к стабильному Telegram ID игрока',
  deskScene.includes('ROOSTER_FEATHER_PLAYER_TG_ID = 495_832_433') &&
    deskScene.includes('player.tgId === ROOSTER_FEATHER_PLAYER_TG_ID')
);
check(
  'успешный тап создаёт несколько перьев',
  deskScene.includes('ROOSTER_FEATHER_FLIGHT.map') &&
    deskScene.includes('setRoosterFeathers((prev) => [...prev.slice(-20), ...featherBatch])') &&
    deskScene.includes('🪶')
);
check(
  'перья исчезают сами и не остаются в DOM навсегда',
  deskScene.includes('setTimeout(() => {') &&
    deskScene.includes('setRoosterFeathers((prev) => prev.filter((feather) => !featherIds.has(feather.id)))')
);
check(
  'эффект остаётся локальной косметикой',
  deskScene.includes('отдельного API-запроса нет') &&
    deskScene.includes('tapHack()')
);
check(
  'у перьев есть красно-золотая визуальная стилизация',
  styles.includes('.rooster-feather-particle--red') &&
    styles.includes('.rooster-feather-particle--gold') &&
    styles.includes('.rooster-feather-particle--scarlet')
);

console.log(`\nИтог: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exitCode = 1;
