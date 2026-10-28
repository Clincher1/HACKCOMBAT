import { ACHIEVEMENTS_BY_KEY } from '../../shared/achievements.config';
import { getInventoryItemDefinition, isCollectibleInventoryItem } from '../../shared/inventory.config';

let failed = 0;
function check(name: string, condition: boolean) {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${name}`);
  if (!condition) failed++;
}

check('обычные достижения и косметика не входят в инвентарь',
  !isCollectibleInventoryItem('achievement:first_mission') &&
  !isCollectibleInventoryItem('achievement:first_upgrade') &&
  !isCollectibleInventoryItem('frame:frame_rooster_red') &&
  !isCollectibleInventoryItem('companion:hamster'));
check('подарки и призы относятся к разным разделам',
  getInventoryItemDefinition('reward:gift_snus')?.inventoryCategory === 'gift' &&
  getInventoryItemDefinition('reward:first_donut')?.inventoryCategory === 'prize');

// Будущие ивентовые достижения должны отмечаться явно, без включения обычного прогресса.
ACHIEVEMENTS_BY_KEY.qa_event_reward = {
  key: 'qa_event_reward', title: 'QA Event', description: 'Event reward', icon: '🏆',
  rarity: 'rare', cryptoReward: 0, inventoryEventReward: true,
};
check('явно отмеченное достижение события попадает в отдельный раздел',
  isCollectibleInventoryItem('achievement:qa_event_reward') &&
  getInventoryItemDefinition('achievement:qa_event_reward')?.inventoryCategory === 'event');
delete ACHIEVEMENTS_BY_KEY.qa_event_reward;
if (failed) process.exitCode = 1;
