import { ArrowRight, Flame, MapPin } from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ContractBoard } from '../components/ContractBoard';
import { DeskScene, OfflineBankNote } from '../components/DeskScene';
import { DEVICE_LABEL, LocationPickerModal } from '../components/LocationPicker';
import { StreakBar } from '../components/StreakBar';
import { TasksTeaser } from '../components/TasksTeaser';
import { useGame } from '../context/GameContext';
import { nextLocationHint } from '../lib/world';

/**
 * v5.5: карта города грузится отдельным чанком — на первом экране она не нужна,
 * а бюджет главного бандла важнее мгновенного открытия оверлея.
 */
const WorldMap = React.lazy(async () => {
  const module = await import('../components/WorldMap');
  return { default: module.WorldMap };
});

/**
 * Главный экран рабочего стола.
 *
 * Навигация к улучшениям и операциям остаётся в нижней панели, поэтому
 * рабочий стол не дублирует её дополнительной промо-карточкой.
 */
/**
 * v5.0: «где я сейчас». Игрок выходит из дома одним тапом: улица, кафе,
 * пляжный бар, крыша. Подпись честно говорит, с чего он там работает.
 */
const DeskLocationBar: React.FC = () => {
  const { deskBackdrop } = useGame();
  const [open, setOpen] = useState(false);
  const device = deskBackdrop ? DEVICE_LABEL[deskBackdrop.device] : null;

  return (
    <>
      <button
        type="button"
        data-qa="change-location-bar"
        aria-label="Сменить локацию"
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-[rgba(var(--ui-primary-rgb),0.45)] bg-[var(--ui-panel)] px-3 py-2 text-left shadow-[0_0_18px_rgba(var(--ui-primary-rgb),0.14)] transition hover:border-[var(--ui-primary)] active:scale-[0.995] cursor-pointer"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-base"
              style={{
                background: `${deskBackdrop?.accent ?? 'var(--ui-primary)'}22`,
                border: `1px solid ${deskBackdrop?.accent ?? 'var(--ui-primary)'}44`,
              }}
              aria-hidden
            >
              {deskBackdrop?.glyph ?? '🏠'}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-bold text-white">
                {deskBackdrop?.place ?? 'Своя сцена по уровню'}
              </span>
              <span className="block truncate text-[10px] text-[var(--ui-text-muted)]">
                {device ? `${device.icon} ${device.label}` : '🖥️ за столом'} ·{' '}
                {deskBackdrop?.weatherLabel ?? 'твой рабочий стол растёт вместе с уровнем'}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 rounded-xl bg-[var(--ui-primary)] px-2.5 py-1.5 text-[11px] font-extrabold text-[var(--ui-on-primary)] shadow-[0_0_16px_rgba(var(--ui-primary-rgb),0.45)]">
            <MapPin className="h-3.5 w-3.5" />
            Сменить
          </span>
        </span>
      </button>
      <LocationPickerModal open={open} onClose={() => setOpen(false)} />
    </>
  );
};

/**
 * v5.5: «Выйти» — дверь в мир. Кнопка есть только при включённом WORLD_V2,
 * поэтому без флага рабочий стол выглядит ровно как раньше.
 */
const WorldExitBar: React.FC = () => {
  const { player, worldEnabled, activeLocation } = useGame();
  const [open, setOpen] = useState(false);
  if (!worldEnabled || !player) return null;
  const next = nextLocationHint(player.derived.level);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Выйти в город"
        className="w-full rounded-2xl border border-[rgba(var(--loc-accent-rgb),0.45)] bg-[var(--ui-panel)] px-3 py-2 text-left transition hover:border-[var(--loc-accent)] cursor-pointer"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[rgba(var(--loc-accent-rgb),0.16)] text-base"
              aria-hidden
            >
              {activeLocation.glyph}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-bold text-white">
                {activeLocation.name}
              </span>
              <span className="block truncate text-[10px] text-[var(--ui-text-muted)]">
                {next
                  ? `Дальше: ${next.name} — с ${next.minLevel} ур.`
                  : 'Все локации города открыты'}
              </span>
            </span>
          </span>
          <span className="shrink-0 rounded-lg bg-[rgba(var(--loc-accent-rgb),0.16)] px-2 py-1 text-[10px] font-extrabold text-[var(--loc-accent)]">
            Выйти
          </span>
        </span>
      </button>
      {open && (
        <React.Suspense fallback={null}>
          <WorldMap open={open} onClose={() => setOpen(false)} />
        </React.Suspense>
      )}
    </>
  );
};

export const DeskPage: React.FC = () => {
  const { player } = useGame();
  if (!player) return null;

  return (
    <div className="space-y-3.5 pb-4">
      <DeskScene />
      {/* v5.8: локация — сразу под сценой, которую она меняет (раньше уезжала под доску) */}
      <DeskLocationBar />
      {/* v5.7: контрактная доска — основная поверхность дохода вместо кнопки HACK */}
      <ContractBoard />
      <WorldExitBar />
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
