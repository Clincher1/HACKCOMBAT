import { ArrowRight, CheckCircle2, Clock, Cpu, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { contractSecondsLeft, getContractCpuCost, isContractReady } from '../../shared/economy.config';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

/**
 * HACKER KOMBAT — контрактная доска рабочего стола (v5.7, GAMEPLAY_V3).
 * ----------------------------------------------------------------------------
 * Главная поверхность экрана вместо кнопки HACK:
 *   • активные контракты с прогресс-баром и остатком времени (считается по
 *     finish_at, то есть по СЕРВЕРНОМУ времени — прогресс идёт и с закрытым
 *     приложением);
 *   • готовые контракты подсвечены и отдают награду одной кнопкой (или сами,
 *     через авто-сбор в GameContext);
 *   • CPU Charge показан как ресурс «на операцию», а не как «топливо для тапа»;
 *   • если слотов нет — одна кнопка «Взять контракт», которая ведёт на витрину.
 *
 * Никакой новой экономики: награда, шанс успеха и время приходят с сервера.
 */
export const ContractBoard: React.FC = () => {
  const { player, claimMission, busyKey, gameplayV3, readyContracts } = useGame();
  // Свой тик: доска должна «жить», даже если HUD-тик остановлен в фоне.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!gameplayV3 || !player) return null;

  const missions = player.activeMissions;
  const slotsFree = Math.max(0, player.derived.missionSlots - missions.length);

  return (
    <section
      aria-label="Контракты"
      data-qa="contract-board"
      className="space-y-2 rounded-2xl border border-[rgba(var(--ui-primary-rgb),0.35)] bg-[var(--ui-panel)] p-3"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-[var(--ui-primary)]">
          <Cpu className="h-3.5 w-3.5" /> Контракты
        </div>
        <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--ui-text-muted)]">
          <span className="flex items-center gap-1 text-[var(--ui-primary)]" title="CPU Charge — заряд на тап и запуск контракта. Копится сам, +1 за 2 секунды.">
            <Zap className="h-3 w-3" />
            {formatCompact(player.energy)}/{formatCompact(player.derived.maxEnergy)} CPU
          </span>
          <span className="rounded-md bg-[var(--ui-panel-deep)] px-1.5 py-0.5">
            {missions.length}/{player.derived.missionSlots} слота
          </span>
        </div>
      </header>

      {missions.length === 0 && (
        <p className="text-[11px] leading-relaxed text-slate-300">
          Слотов нет — самое время взять первый контракт. Контракт идёт по реальному времени:
          можно закрыть приложение и вернуться к готовой награде.
        </p>
      )}

      {missions.map((mission) => {
        const startMs = new Date(mission.startedAt).getTime();
        const finishMs = new Date(mission.finishAt).getTime();
        const totalMs = Math.max(1000, finishMs - startMs);
        const pct = Math.min(100, Math.max(0, ((now - startMs) / totalMs) * 100));
        const leftSec = contractSecondsLeft(mission.finishAt, now);
        const ready = isContractReady(mission.finishAt, now);
        const claiming = busyKey === `mission:claim:${mission.id}`;

        return (
          <div
            key={mission.id}
            data-qa="contract-card"
            data-qa-ready={ready ? 'true' : 'false'}
            className={`rounded-xl border p-2.5 ${
              ready
                ? 'border-[var(--ui-success)]/60 bg-[var(--ui-success)]/8'
                : 'border-slate-700/70 bg-[var(--ui-panel-deep)]/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[12px] font-bold text-white">{mission.targetName}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--ui-success)]">
                  до +{formatCompact(mission.reward)} Data · {Math.round((mission.successChance ?? 0) * 100)}%
                </div>
              </div>
              {ready ? (
                <button
                  type="button"
                  data-qa-action="collect-contract"
                  disabled={claiming}
                  onClick={() => void claimMission(mission.id)}
                  className="flex shrink-0 items-center gap-1 rounded-xl bg-[var(--ui-success)] px-2.5 py-1.5 text-[11px] font-extrabold text-[#071005] cursor-pointer disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Забрать
                </button>
              ) : (
                <span className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--ui-panel)] px-2 py-1 text-[11px] font-bold tabular-nums text-slate-200">
                  <Clock className="h-3 w-3" />
                  {Math.floor(leftSec / 60)}:{String(leftSec % 60).padStart(2, '0')}
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${ready ? 'bg-[var(--ui-success)]' : 'bg-[var(--ui-primary)]'}`}
                style={{ width: `${ready ? 100 : Math.max(3, pct)}%` }}
              />
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[10px] text-[var(--ui-text-muted)]">
          {readyContracts > 0
            ? `Готово к сбору: ${readyContracts}. Награда придёт сама при следующем входе.`
            : `Старт контракта: от ${getContractCpuCost(1)} CPU (тир 1)`}
        </span>
        <Link
          to="/hacks"
          data-qa-action="open-contracts"
          className="flex shrink-0 items-center gap-1 rounded-xl bg-[var(--ui-primary)] px-2.5 py-1.5 text-[11px] font-extrabold text-[var(--ui-on-primary)]"
        >
          {slotsFree > 0 ? 'Взять контракт' : 'К витрине'}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
};

export default ContractBoard;
