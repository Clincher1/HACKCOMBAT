import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { contractSecondsLeft, getContractCpuCost, isContractReady } from '../../shared/economy.config';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';
import { ArrowRightIcon, CheckIcon, ClockIcon, EnergyIcon, PrestigeIcon } from './ui-icons';

/**
 * HACKER KOMBAT — контрактная доска рабочего стола (v6.10, GAMEPLAY_V3).
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
 *
 * v6.10 — только форма, не поведение:
 *   • вложенность: секция → карточка → листья. Карточка сама является гридом,
 *     поэтому внутри неё нет обёрток «строка в строке» (было три уровня);
 *   • типографика строго по шкале 11/13/16 px, ни одного промежуточного размера;
 *   • прозрачность — через токен `--ui-success-rgb`, а не `bg-[var(--x)]/8`:
 *     модификатор прозрачности на var-цвет Tailwind молча игнорирует.
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
        <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.1em] text-[var(--ui-primary)]">
          <PrestigeIcon className="h-3.5 w-3.5" /> Контракты
        </span>
        <span className="flex items-center gap-2 text-[11px] font-bold text-[var(--ui-text-muted)]">
          <span
            className="flex items-center gap-1 text-[var(--ui-primary)]"
            title="CPU Charge — заряд на тап и запуск контракта. Копится сам, +1 за 2 секунды."
          >
            <EnergyIcon className="h-3 w-3" />
            {formatCompact(player.energy)}/{formatCompact(player.derived.maxEnergy)} CPU
          </span>
          <span className="rounded-md bg-[var(--ui-panel-deep)] px-1.5 py-0.5">
            {missions.length}/{player.derived.missionSlots} слота
          </span>
        </span>
      </header>

      {missions.length === 0 && (
        <p className="text-[11px] leading-relaxed text-[var(--ui-text-muted)]">
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
        const turn = Math.round((mission.successChance ?? 0) * 100);

        return (
          <article
            key={mission.id}
            data-qa="contract-card"
            data-qa-ready={ready ? 'true' : 'false'}
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-xl border p-2.5 ${
              ready
                ? 'border-[rgba(var(--ui-success-rgb),0.6)] bg-[rgba(var(--ui-success-rgb),0.08)]'
                : 'border-slate-700/70 bg-[rgba(var(--ui-panel-deep-rgb),0.6)]'
            }`}
          >
            <span className="col-start-1 row-start-1 truncate text-[13px] font-bold text-white">
              {mission.targetName}
            </span>
            <span className="col-start-1 row-start-2 truncate text-[11px] font-semibold text-[var(--ui-success)]">
              до +{formatCompact(mission.reward)} Data · {turn}%
            </span>

            {ready ? (
              <button
                type="button"
                data-qa-action="collect-contract"
                disabled={claiming}
                onClick={() => void claimMission(mission.id)}
                className="col-start-2 row-span-2 row-start-1 flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1 self-center rounded-xl bg-[var(--ui-success)] px-2.5 text-[11px] font-extrabold text-[var(--ui-on-primary)] disabled:opacity-60"
              >
                <CheckIcon className="h-3.5 w-3.5" /> Забрать
              </button>
            ) : (
              <span className="col-start-2 row-span-2 row-start-1 flex shrink-0 items-center gap-1 self-center rounded-lg bg-[var(--ui-panel)] px-2 py-1 text-[11px] font-bold tabular-nums text-slate-200">
                <ClockIcon className="h-3 w-3" />
                {Math.floor(leftSec / 60)}:{String(leftSec % 60).padStart(2, '0')}
              </span>
            )}

            <span className="col-span-2 col-start-1 row-start-3 mt-0.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <span
                className={`block h-full rounded-full transition-all ${
                  ready ? 'bg-[var(--ui-success)]' : 'bg-[var(--ui-primary)]'
                }`}
                style={{ width: `${ready ? 100 : Math.max(3, pct)}%` }}
              />
            </span>
          </article>
        );
      })}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[11px] leading-snug text-[var(--ui-text-muted)]">
          {readyContracts > 0
            ? `Готово к сбору: ${readyContracts}. Награда придёт сама при следующем входе.`
            : `Старт контракта: от ${getContractCpuCost(1)} CPU (тир 1)`}
        </span>
        <Link
          to="/hacks"
          data-qa-action="open-contracts"
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl bg-[var(--ui-primary)] px-2.5 text-[11px] font-extrabold text-[var(--ui-on-primary)]"
        >
          {slotsFree > 0 ? 'Взять контракт' : 'К витрине'}
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
};

export default ContractBoard;
