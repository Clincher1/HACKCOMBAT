import { ArrowRight, Flame } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { ContractBoard } from '../components/ContractBoard';
import { DeskScene, OfflineBankNote } from '../components/DeskScene';
import { LocationStrip } from '../components/LocationStrip';
import { StreakBar } from '../components/StreakBar';
import { TasksTeaser } from '../components/TasksTeaser';
import { useGame } from '../context/GameContext';

export const DeskPage: React.FC = () => {
  const { player } = useGame();
  if (!player) return null;

  return (
    <div className="space-y-3.5 pb-4">
      <DeskScene />
      {/* v6.5: единственный вход в мир — полоса локаций под сценой и над доской.
          Раньше здесь стояли две двери подряд («Сменить» и «Выйти»), и игрок
          не понимал, какая из них меняет место, а какая — картинку за окном. */}
      <LocationStrip />
      {/* v5.7: контрактная доска — основная поверхность дохода вместо кнопки HACK */}
      <ContractBoard />
      {/* v5.6: streak bar — 7 клеток дневного цикла. Скрыт при активном онбординге. */}
      <StreakBar />

      {/* v6.0: весь раздел заданий (поручения, прогресс, события) — на /tasks.
          На столе остаётся одна строка-вход, а не три блока разных эпох. */}
      <TasksTeaser />
      <OfflineBankNote derived={player.derived} stats={player.stats} />

      {/* Индикатор риска при высоком Heat */}
      {player.heat >= 70 && (
        <Link
          to="/hacks"
          className="rounded-xl bg-rose-950/60 border border-rose-500/50 p-3 flex items-center gap-2.5 text-xs text-rose-200 hover:bg-rose-950/80 transition"
        >
          <Flame className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="flex-1">
            <strong>Внимание: Розыск {player.heat}/100!</strong> При превышении 100 сработает штраф
            (-10% Data и блок кликов на 60 сек). Выполняйте белые миссии или наймите Fence.
          </span>
          <ArrowRight className="w-4 h-4 shrink-0 text-rose-300" />
        </Link>
      )}
    </div>
  );
};
