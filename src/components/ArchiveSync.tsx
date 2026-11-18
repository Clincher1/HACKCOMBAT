import { useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { gameApi } from '../lib/api';

/** Persist newly unlocked chapters independently of the player snapshot.
 * Archive outages must never block normal gameplay. The archive retries on open. */
export function ArchiveSync() {
  const { player } = useGame();
  const count = player ? player.totalMissions : -1;
  useEffect(() => {
    if (count < 0) return;
    void gameApi.archiveSync().catch(() => {});
  }, [count]);
  return null;
}
