import { useEffect } from 'react';
import { getStoryState } from '../../shared/story.config';
import { useGame } from '../context/GameContext';
import { gameApi } from '../lib/api';

/** Persist newly unlocked chapters independently of the player snapshot.
 * Archive outages must never block normal gameplay. The archive retries on open. */
export function ArchiveSync() {
  const { player } = useGame();
  const count = player ? getStoryState(player).unlocked.length : -1;
  useEffect(() => {
    if (count < 0) return;
    void gameApi.archiveSync().catch(() => {});
  }, [count]);
  return null;
}
