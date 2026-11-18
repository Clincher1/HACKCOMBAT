import { strict as assert } from 'node:assert';
import { buildReturnCaseScenes, getReturnCaseProgress, RETURN_CASE_STAGES } from '../../shared/returnTrace.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
let n=0; function check(name: string, value: unknown) { assert.ok(value, name); console.log('PASS', name); n++; }
const ev = (mission_key:string, outcome='success') => ({mission_key, outcome});
const build = (items: ReturnType<typeof ev>[], saved: string[] = []) => buildReturnCaseScenes(new Set(saved),items);
check('initial story exists without claiming a contract', build([]).map(x=>x.entry_key).join(',') === 'case:1');
check('partial, fail and unrelated successes do not give evidence', build([ev('scam_shop','partial'), ev('fake_lottery','fail'), ev('retro_blog')]).length === 1);
for (const first of RETURN_CASE_STAGES[0].missions) for (const second of RETURN_CASE_STAGES[1].missions) for (const third of RETURN_CASE_STAGES[2].missions) {
  const scenes = build([ev(first), ev(second), ev(third)]);
  check(`${first}/${second}/${third}: all alternatives close the case`, scenes.length === 4 && scenes[1].content.sourceMission === first && scenes[2].content.sourceMission === second && scenes[3].content.sourceMission === third);
}
check('a later success cannot leap over missing earlier clue', build([ev('bot_spam_net'), ev('malware_bazaar')]).length === 1);
check('saved earlier scenes remain valid when prior mission rows are absent', build([ev('bot_spam_net')],['case:1','case:2']).map(x=>x.entry_key).join(',') === 'case:3');
check('snapshots are never recreated or overwritten', build([ev('scam_shop'),ev('bot_spam_net')],['case:1','case:2','case:3']).length === 0);
check('duplicate successes do not create duplicate scenes', build([ev('scam_shop'),ev('scam_shop')]).length === 2);
check('only contiguous previously saved clues count', getReturnCaseProgress(new Set(['case:1','case:3'])).completed === 0);
check('progress and next goal reflect all three clues', getReturnCaseProgress(new Set(['case:1','case:2','case:3','case:4'])).next === null);
check('all references correspond to real missions', RETURN_CASE_STAGES.every(stage=>stage.missions.every(key=>MISSIONS_CONFIG.some(m=>m.key===key))));
check('all four scenes contain substantial story', build([ev('scam_shop'),ev('bot_spam_net'),ev('malware_bazaar')]).every(s=>s.content.text.length > 1000));
console.log(`${n} case logic checks passed`);
