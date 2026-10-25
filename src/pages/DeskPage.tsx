import { ShieldAlert } from 'lucide-react';
import React from 'react';
import { DeskScene } from '../components/DeskScene';
import { useGame } from '../context/GameContext';

/**
 * Главный экран — только рабочий стол и предупреждение о розыске.
 *
 * v3.3: убраны дублирующие плашки «Обучение», «Апгрейд: …» и «Вылазки и взломы» —
 * те же разделы уже доступны кнопкой «Обучение» в верхней панели и вкладками
 * «Улучшения» / «Взломы» в нижней навигации. Дубли только съедали место на телефоне.
 */
export const DeskPage: React.FC = () => {
  const { player } = useGame();
  if (!player) return null;

  return (
    <div className="space-y-3.5 pb-4">
      <DeskScene />

      {/* Индикатор риска при высоком Heat */}
      {player.heat >= 70 && (
        <div className="rounded-xl bg-rose-950/60 border border-rose-500/50 p-3 flex items-center gap-2.5 text-xs text-rose-200">
          <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <strong>Внимание: Розыск {player.heat}/100!</strong> При превышении 100 сработает штраф
            (-10% Data и блок кликов на 60 сек). Выполняйте 🔴 Bad-миссии или наймите Fence!
          </div>
        </div>
      )}
    </div>
  );
};
