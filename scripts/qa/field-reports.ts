import assert from 'node:assert/strict';
import { FIELD_REPORTS, getFieldReport, getFieldReportAction } from '../../shared/fieldReports.config';

let count = 0;
function check(label: string, condition: unknown) { assert.ok(condition, label); console.log('PASS', label); count++; }
const day = 86_400_000;
const start = Date.parse('2026-10-22T21:00:00.000Z'); // midnight Moscow, 23 October
check('14 separate dispatches with distinct titles and both dialogue replies', FIELD_REPORTS.length === 14 && new Set(FIELD_REPORTS.map(r => r.title)).size === 14 && FIELD_REPORTS.every(r => r.sender && r.message && r.carefulReply && r.focusedReply && r.carefulReply !== r.focusedReply));
const first = getFieldReport(start);
check('rotation starts on the intended Moscow date', first.dayKey === '2026-10-23' && first.index === 0);
check('last instant before Moscow midnight belongs to previous day', getFieldReport(start - 1).dayKey === '2026-10-22' && getFieldReport(start - 1).index === 13);
check('daily rotation changes at Moscow midnight', getFieldReport(start + day - 1).index === 0 && getFieldReport(start + day).index === 1);
check('all 14 days are distinct and then repeat', new Set(Array.from({length: 14}, (_, i) => getFieldReport(start + i * day).index)).size === 14 && getFieldReport(start + 14 * day).index === first.index);
check('rotation works before the epoch', getFieldReport(start - 15 * day).index === 13);
check('no active contract directs to available offers', getFieldReportAction([], start) === 'available');
const running = [{finishAt: new Date(start + 1000).toISOString()}];
check('unfinished active contract directs to active section', getFieldReportAction(running, start) === 'running');
check('contract becomes ready exactly at finish time', getFieldReportAction(running, start + 1000) === 'ready');
check('ready contract takes priority over running contract', getFieldReportAction([...running,{finishAt:new Date(start - 1).toISOString()}], start) === 'ready');
check('invalid finish time never looks ready', getFieldReportAction([{finishAt:'invalid'}], start) === 'running');
check('action inspection does not mutate mission data', JSON.stringify(running) === JSON.stringify([{finishAt:new Date(start+1000).toISOString()}]));
console.log(`${count} field report checks passed. Presentation only, no additional rewards.`);
