import assert from 'node:assert/strict';
import { getStoryState, STORY_EPISODES, STORY_SEASONS } from '../../shared/story.config';
import type { PlayerState } from '../../shared/types';
const player = (totalMissions: number, level = 3, unlocked = true) => ({
  totalMissions, achievements: unlocked ? ['first_upgrade', 'first_mission'] : [],
  derived: { level, totalCardLevels: unlocked ? 1 : 0 },
}) as PlayerState;
let checks = 0;
function test(label: string, fn: () => void) { fn(); console.log(`PASS ${label}`); checks++; }
test('four seasons contain 24 unique episodes', () => {
  assert.equal(STORY_SEASONS.length, 4); assert.equal(STORY_EPISODES.length, 24);
  assert.equal(new Set(STORY_EPISODES.map(x => x.id)).size, 24);
  for (let i = 0; i < 4; i++) assert.equal(STORY_EPISODES.filter(e => e.season === i + 1).length, 6);
  assert.ok(STORY_EPISODES.every(x => x.title && x.text));
});
test('unfinished introduction blocks story even for old career totals', () => {
  const state = getStoryState(player(100, 1, false));
  assert.equal(state.introComplete, false); assert.equal(state.unlocked.length, 0); assert.equal(state.next, null);
});
test('all thresholds have correct boundary and next episode', () => {
  for (const [index, episode] of STORY_EPISODES.entries()) {
    if (index > 0) assert.equal(getStoryState(player(episode.missions - 1)).unlocked.length, index);
    const state = getStoryState(player(episode.missions));
    assert.equal(state.unlocked.length, index + 1); assert.equal(state.unlocked[index].id, index + 1);
    assert.equal(state.next?.id ?? null, index < 23 ? index + 2 : null);
  }
});
test('existing experienced players unlock prior episodes without any mutation', () => {
  const p = player(250, 80); const before = JSON.stringify(p); const state = getStoryState(p);
  assert.equal(state.unlocked.length, 24); assert.equal(state.next, null); assert.equal(JSON.stringify(p), before);
});
test('invalid or negative counts cannot unlock episodes', () => {
  for (const value of [NaN, Infinity, -3]) assert.equal(getStoryState(player(value)).unlocked.length, 0);
});
console.log(`${checks} tests passed; pure state evaluation, no player writes.`);
