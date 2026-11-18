/** Verify event visibility without mutating an account or changing the server. */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { getSeasonEventWindow } from '../../shared/seasonalEvent.config';
import type { SeasonEventState } from '../../shared/types';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: () => {} } });
const { SeasonEventPanelView } = require('../../src/components/SeasonEventPanel') as typeof import('../../src/components/SeasonEventPanel');

const { startMs, endMs, weekKey } = getSeasonEventWindow();
const state: SeasonEventState = {
  version: 2, eventKey: 'neon-relay', weekKey, currentDay: 7, days: {},
  completedDays: [1, 2, 3, 5, 6, 7], participationClaimed: true, masteryClaimed: false,
};
const snapshot = structuredClone(state);
const render = (nowMs: number, eventState?: SeasonEventState) => renderToStaticMarkup(<SeasonEventPanelView nowMs={nowMs} state={eventState} />);
const check = (label: string, ok: boolean) => { assert.ok(ok, label); console.log('PASS', label); };
delete process.env.SEASON_EVENT_TEST_MODE;
check('upcoming event is visible before launch', render(startMs - 1).includes('СКОРО В ИГРЕ'));
check('event becomes visible exactly at launch', render(startMs, state).includes('ИВЕНТ В ИГРЕ'));
check('event remains visible up to its last millisecond', render(endMs - 1, state).includes('ИВЕНТ В ИГРЕ'));
check('event is hidden exactly when it ends, even with saved progress', render(endMs, state) === '');
check('event stays hidden for returning players', render(endMs + 30 * 86400_000, state) === '');
check('event stays hidden for players without saved progress', render(endMs + 1) === '');
check('rendering never mutates saved event progress', JSON.stringify(state) === JSON.stringify(snapshot));
console.log('7 event visibility and preservation checks passed.');
