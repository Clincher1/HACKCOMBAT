import {
  CheckCircle2,
  Clock,
  Flame,
  Gem,
  Info,
  Lock,
  RefreshCw,
  Shield,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  describeReadiness,
  getHackOdds,
  getMissionEntryCost,
  getMissionRewardScale,
  getMissionXpAward,
} from '../../shared/hack.config';
import { getFirstChapterState } from '../../shared/chapter.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import type { MissionTargetType } from '../../shared/types';
import { DailyIncidentPanel } from '../components/DailyIncidentPanel';
import { useGame } from '../context/GameContext';
import { formatCompact, formatCountdown } from '../lib/format';

type FilterType = 'all' | 'white' | 'black' | 'neutral';

function hackCategory(targetType: MissionTargetType): Exclude<FilterType, 'all'> {
  if (targetType === 'bad') return 'white';
  if (targetType === 'good') return 'black';
  // Grey Ops остаются отдельным внутренним типом ради Crypto и достижений,
  // но для игрока это нейтральная ветка, а не четвёртая категория.
  return 'neutral';
}

const TYPE_META: Record<
  MissionTargetType,
  { badge: string; dot: string; border: string; bg: string }
> = {
  bad: {
    badge: '⚪ Белый хакинг · +Rep, 0 Heat',
    dot: 'text-emerald-300',
    border: 'border-[#00f0ff]/35',
    bg: 'bg-[#00f0ff]/10 text-[#00f0ff]',
  },
  good: {
    badge: '⚫ Чёрный хакинг · +Data, +Heat',
    dot: 'text-rose-300',
    border: 'border-[#ff00a0]/35',
    bg: 'bg-[#ff00a0]/12 text-[#ff00a0]',
  },
  neutral: {
    badge: '🔵 Нейтральный хакинг · +Data',
    dot: 'text-slate-300',
    border: 'border-slate-700',
    bg: 'bg-slate-800 text-slate-300',
  },
  grey: {
    badge: '🟣 Нейтральный спецконтракт · +Data, +Rep, 💎',
    dot: 'text-purple-300',
    border: 'border-purple-500/45',
    bg: 'bg-purple-500/15 text-purple-300',
  },
};

/** «4 мин 20 с» вместо «260 сек» — таймеры теперь длинные, секунды читать неудобно. */
function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} сек`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s > 0 ? `${m} мин ${s} с` : `${m} мин`;
}

const TIER_LABEL: Record<number, string> = {
  1: 'T1 · Разминка',
  2: 'T2 · Бытовая сеть',
  3: 'T3 · Корпоратив',
  4: 'T4 · Госструктура',
  5: 'T5 · Инфраструктура',
  6: 'T6 · Орбита',
};

export const HacksPage: React.FC = () => {
  const {
    player,
    nowMs,
    startMission,
    claimMission,
    skipMission,
    refreshMissions,
    busyKey,
    missionHistory,
  } = useGame();
  const [filter, setFilter] = useState<FilterType>('all');
  const autoRefreshRequestedRef = useRef(false);
  const refreshLeftSec = player
    ? Math.max(
        0,
        15 * 60 -
          Math.floor(
            (nowMs -
              new Date(player.stats.lastMissionRefreshAt ?? player.missionsRefreshedAt).getTime()) /
              1000
          )
      )
    : 0;
  const missionRefreshBusy = busyKey === 'mission:refresh';
  const scanRefreshing = missionRefreshBusy || refreshLeftSec <= 0;

  // Не оставляем игрока со старым списком после истечения 15 минут. Раньше
  // сервер уже пересоздавал скан при следующем HACK, а экран ещё показывал
  // старую цель — отсюда «цель не представлена в текущем скане».
  useEffect(() => {
    if (!player) return;
    if (refreshLeftSec > 0) {
      autoRefreshRequestedRef.current = false;
      return;
    }
    if (autoRefreshRequestedRef.current || missionRefreshBusy) return;
    autoRefreshRequestedRef.current = true;
    void refreshMissions().finally(() => {
      // При сетевой ошибке повторим попытку через 5 секунд, но не устроим
      // бесконечный поток запросов.
      window.setTimeout(() => {
        autoRefreshRequestedRef.current = false;
      }, 5_000);
    });
  }, [missionRefreshBusy, player, refreshLeftSec, refreshMissions]);

  if (!player) return null;

  const { derived } = player;

  // В любой категории показываем только цели из текущего серверного скана.
  // Раньше фильтр раскрывал ВСЕ открытые цели, хотя сервер разрешал запускать
  // только текущий оффер — пользователь видел кнопку и получал отказ.
  const visibleMissions = MISSIONS_CONFIG.filter((m) => {
    if (!player.availableMissionKeys.includes(m.key)) return false;
    if (m.targetType === 'grey' && !derived.unlockedGreyMissions) return false;
    return filter === 'all' || hackCategory(m.targetType) === filter;
  });

  const rewardScale = getMissionRewardScale(derived.level);
  const chapter = getFirstChapterState(player);
  const storyMissionKeys = new Set(chapter.activeStep?.missionKeys ?? []);

  return (
    <div className="space-y-3.5 pb-4">
      {/* Верхняя панель слотов и 15-минутного обновления */}
      <div className="rounded-2xl bg-[#10172e] border border-[#00f0ff]/25 p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-extrabold text-white">
              Активные слоты: {player.activeMissions.length} / {derived.missionSlots}
              {derived.missionSlots < 3 && (
                <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                  ({derived.missionSlots === 1 ? '2 слота с 10 ур.' : '3 слота с 20 ур.'})
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-[#00f0ff]" />
              <span>Автообновление целей: {formatCountdown(refreshLeftSec)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={busyKey === 'mission:refresh' || refreshLeftSec > 0}
            onClick={() => void refreshMissions()}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#162244] hover:bg-[#1f305e] border border-[#00f0ff]/35 text-xs font-bold text-[#00f0ff] transition cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${busyKey === 'mission:refresh' ? 'animate-spin' : ''}`}
            />
            <span>{refreshLeftSec > 0 ? 'Скан свежий' : 'Обновить'}</span>
          </button>
        </div>

        {/* Сила железа = главный множитель шанса успеха */}
        <div className="flex items-center justify-between gap-2 rounded-xl bg-[#0a0e1a] border border-slate-800 px-2.5 py-1.5">
          <span className="text-[11px] text-slate-300 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-[#ffe600]" /> Сила железа:
            <strong className="text-white">{Math.round(derived.hackPower)}</strong>
          </span>
          <span className="text-[10px] text-slate-500">
            карточки + База + команда = шанс успеха
          </span>
        </div>
        <div className="rounded-xl border border-amber-400/25 bg-amber-950/20 px-2.5 py-1.5 text-[10px] leading-snug text-amber-200">
          Запуск платный: контракт списывает Data и Energy сразу. При успехе награда возвращает вложение с прибылью; при провале взнос не возвращается.
        </div>
      </div>

      <DailyIncidentPanel />

      {/* Короткая легенда риска: помогает новичку читать шанс без отдельного туториала. */}
      <div className="rounded-xl bg-[#0a0e1a]/65 border border-slate-800/90 px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <Info className="w-3.5 h-3.5 text-[var(--ui-primary)]" />
          Как читать шанс операции
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-[10px] leading-snug">
          <div className="rounded-lg bg-emerald-950/35 border border-emerald-400/25 px-2 py-1.5">
            <div className="font-bold text-[#7dff00]">80%+ · надёжно</div>
            <div className="text-slate-400 mt-0.5">лучший выбор для стабильного XP и Чипов</div>
          </div>
          <div className="rounded-lg bg-amber-950/35 border border-amber-400/25 px-2 py-1.5">
            <div className="font-bold text-amber-300">55–79% · баланс</div>
            <div className="text-slate-400 mt-0.5">выше награда, но возможен частичный доступ</div>
          </div>
          <div className="rounded-lg bg-rose-950/35 border border-rose-400/25 px-2 py-1.5">
            <div className="font-bold text-rose-300">меньше 55% · риск</div>
            <div className="text-slate-400 mt-0.5">бери только ради цели или большой награды</div>
          </div>
        </div>
      </div>

      {!chapter.complete && chapter.activeStep && (
        <section
          aria-label="Сюжетная глава"
          className="rounded-2xl bg-gradient-to-br from-purple-950/35 to-[#10172e] border border-purple-400/30 p-3"
        >
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-400/10 text-purple-300">
              <span aria-hidden="true">📖</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-purple-300">
                  Глава 1 · Первый выход
                </div>
                <span className="shrink-0 text-[10px] text-slate-500">
                  {chapter.completedCount}/{chapter.steps.length}
                </span>
              </div>
              <div className="mt-0.5 text-sm font-display font-extrabold text-white">
                {chapter.activeStep.title}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                {chapter.activeStep.missionBrief}
              </p>
            </div>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5" aria-label="Прогресс главы">
            {chapter.steps.map((step, index) => (
              <div
                key={step.id}
                className={`h-1.5 rounded-full ${
                  step.complete
                    ? 'bg-[#7dff00]'
                    : step.active
                      ? 'bg-purple-300'
                      : 'bg-slate-800'
                }`}
                title={`${index + 1}. ${step.title}`}
              />
            ))}
          </div>
          {chapter.activeStep.href !== '/hacks' && (
            <Link
              to={chapter.activeStep.href}
              className="mt-2.5 inline-flex items-center rounded-lg border border-purple-300/35 bg-purple-300/10 px-2.5 py-1.5 text-[10px] font-bold text-purple-200 hover:bg-purple-300/20 transition"
            >
              Сначала: {chapter.activeStep.actionLabel}
            </Link>
          )}
        </section>
      )}

      {/* Секция текущих запущенных миссий с живыми прогресс-барами */}
      {player.activeMissions.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-[#7dff00] px-1">⚡ В процессе взлома</div>
          {player.activeMissions.map((active) => {
            const startMs = new Date(active.startedAt).getTime();
            const finishMs = new Date(active.finishAt).getTime();
            const totalMs = Math.max(1000, finishMs - startMs);
            const pct = Math.min(100, Math.max(0, ((nowMs - startMs) / totalMs) * 100));
            const remSec = Math.max(0, Math.ceil((finishMs - nowMs) / 1000));
            const ready = remSec <= 0;
            const chance = Math.round((active.successChance ?? 0) * 100);

            return (
              <div
                key={active.id}
                className="rounded-2xl bg-[#121c38] border border-[#7dff00]/50 p-3.5 space-y-2.5 shadow-[0_0_20px_rgba(125,255,0,0.08)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-display font-bold text-white">
                      {active.targetName}
                    </div>
                    <div className="text-[11px] text-[#7dff00] font-semibold">
                      До +{formatCompact(active.reward)} Data · +{formatCompact(active.xpReward ?? 0)}{' '}
                      XP
                      {active.repDelta !== 0 &&
                        ` · ${active.repDelta > 0 ? '+' : ''}${active.repDelta} Rep`}
                      {active.heatDelta > 0 && ` · +${active.heatDelta} Heat`}
                    </div>
                    <div className="text-[10px] text-amber-300 mt-0.5">
                      {(active.entryDataCost ?? 0) > 0 || (active.entryEnergyCost ?? 0) > 0
                        ? `Взнос уже списан: −${formatCompact(active.entryDataCost ?? 0)} Data · −${formatCompact(active.entryEnergyCost ?? 0)} Energy`
                        : 'Старый контракт: входной взнос не зафиксирован'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Шанс успеха{' '}
                      <strong className={chance >= 80 ? 'text-[#7dff00]' : chance >= 55 ? 'text-amber-300' : 'text-rose-400'}>
                        {chance}%
                      </strong>{' '}
                      · при провале — 15% опыта и никаких Чипов
                    </div>
                  </div>

                  {ready ? (
                    <button
                      type="button"
                      disabled={busyKey === `mission:claim:${active.id}`}
                      onClick={() => void claimMission(active.id)}
                      className="px-3.5 py-2 rounded-xl bg-[#7dff00] text-[#071005] font-display font-extrabold text-xs flex items-center gap-1.5 animate-pulse cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Забрать</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyKey === `mission:skip:${active.id}`}
                      onClick={() => void skipMission(active.id)}
                      className="px-3 py-1.5 rounded-xl bg-purple-600/85 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      title="Мгновенно завершить за 1 Crypto (частичный результат)"
                    >
                      <Gem className="w-3 h-3" />
                      <span>Пропустить (1💎)</span>
                    </button>
                  )}
                </div>

                {/* Прогресс-бар миссии */}
                <div className="space-y-1">
                  <div className="h-2.5 w-full rounded-full bg-[#090d1a] overflow-hidden p-[1px] border border-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        background: ready
                          ? '#7dff00'
                          : 'linear-gradient(90deg, #00f0ff 0%, #ff00a0 100%)',
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{ready ? 'Прорыв завершён!' : 'Подбор ключей доступа...'}</span>
                    <span className="font-bold text-white">
                      {ready ? 'ГОТОВО' : formatCountdown(remSec)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Локальный журнал результата не зависит от таймера toast и не меняет серверную экономику. */}
      {missionHistory.length > 0 && (
        <section
          className="rounded-2xl bg-[#0d152b]/90 border border-[#00f0ff]/20 p-3"
          aria-label="Последние операции"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-xs font-extrabold text-white">📜 Последние операции</div>
            <span className="text-[10px] text-slate-500">текущая сессия · {missionHistory.length}/5</span>
          </div>
          <div className="space-y-1.5">
            {missionHistory.map((entry) => {
              const isPenalty = entry.type === 'penalty';
              const isPartial = entry.type === 'info';
              const tone = isPenalty
                ? 'border-rose-400/25 bg-rose-950/20'
                : isPartial
                  ? 'border-amber-300/25 bg-amber-950/15'
                  : 'border-emerald-400/25 bg-emerald-950/15';
              const marker = isPenalty ? '×' : isPartial ? '·' : '✓';
              const markerTone = isPenalty
                ? 'text-rose-300 bg-rose-400/10'
                : isPartial
                  ? 'text-amber-300 bg-amber-400/10'
                  : 'text-[#7dff00] bg-[#7dff00]/10';

              return (
                <div key={entry.id} className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 ${tone}`}>
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${markerTone}`}>
                    {marker}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-slate-100">{entry.title}</div>
                    <div className="text-[10px] leading-snug text-slate-400">{entry.message}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            Архив виден до перезапуска игры; награды и статусы всегда подтверждает сервер.
          </div>
        </section>
      )}

      {/* Три понятных направления хакинга. Отдельной кнопки «Витрина» больше нет. */}
      <div className="rounded-xl bg-[#0a0e1a]/70 border border-slate-800/80 px-2.5 py-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 px-0.5">
          Направление хакинга · можно выбрать одно
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {[
            { id: 'white', label: '⚪ Белый хакинг' },
            { id: 'black', label: '⚫ Чёрный хакинг' },
            { id: 'neutral', label: '🔵 Нейтральный' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              onClick={() => setFilter(filter === tab.id ? 'all' : (tab.id as FilterType))}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#00f0ff]/18 border-[#00f0ff] text-[#00f0ff]'
                  : 'bg-[#10172e] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Подсказка о секретных «серых» миссиях, если Analyst ещё не нанят */}
      {!derived.unlockedGreyMissions && (
        <Link
          to="/team"
          className="block rounded-xl bg-purple-950/30 border border-purple-500/35 px-3 py-2 text-[11px] text-purple-200 hover:bg-purple-950/45 transition"
        >
          <span className="font-bold inline-flex items-center gap-1">
            <Lock className="w-3 h-3 text-purple-400" /> Секретные нейтральные миссии закрыты:
          </span>{' '}
          наймите <strong>Analyst</strong> во вкладке «Команда», чтобы получать контракты с шансом
          дропа 💎 Crypto!
        </Link>
      )}

      {/* Список доступных целей */}
      {visibleMissions.length === 0 ? (
        <div className="rounded-2xl bg-[#10172e]/90 border border-slate-800 px-3.5 py-4 text-center text-[11px] text-slate-400">
          В текущем скане нет целей этого направления. Выбери другую категорию или нажми «Обновить».
        </div>
      ) : null}
      <div className="space-y-2.5">
        {visibleMissions.map((m) => {
          const meta = TYPE_META[m.targetType];
          const storyMission = storyMissionKeys.has(m.key);
          const whiteHatMult =
            derived.alignment === 'white_hat' && m.targetType === 'bad' ? 2 : 1;
          const estReward = Math.round(
            m.baseDataReward *
              rewardScale *
              whiteHatMult *
              derived.prestigeMultiplier *
              (1 + derived.missionRewardBonusPct)
          );
          const estRep = m.repDelta * (whiteHatMult > 1 && m.repDelta > 0 ? 2 : 1);
          const estHeat = Math.round(m.heatDelta * derived.heatMultiplier);
          const alreadyRunning = player.activeMissions.some((am) => am.missionKey === m.key);
          const slotsFull = player.activeMissions.length >= derived.missionSlots;
          const levelLocked = (m.minLevel ?? 1) > derived.level && filter !== 'all';
          const odds = getHackOdds({
            mission: m,
            level: derived.level,
            hackPower: derived.hackPower,
            heat: player.heat,
            tierSuccesses: player.stats.hackSuccessByType?.[m.targetType] ?? 0,
            tierFails: player.stats.hackFailByType?.[m.targetType] ?? 0,
          });
          const chancePct = Math.round(odds.chance * 100);
          const readiness = describeReadiness(odds);
          const xpAward = getMissionXpAward(m.xpReward ?? 10, m.tier ?? 1, derived.level);
          const durationMinutes = Math.max(1, m.durationSec / 60);
          const successDataPerMinute = Math.round(estReward / durationMinutes);
          const successXpPerMinute = Math.round(xpAward / durationMinutes);
          const entryCost = getMissionEntryCost(m, estReward);
          const netSuccessData = Math.max(0, estReward - entryCost.data);
          const energyLocked = player.energy < entryCost.energy;
          const dataLocked = player.data < entryCost.data;
          const riskMeta =
            chancePct >= 80
              ? { label: 'Надёжно', className: 'text-[#7dff00]', icon: <ShieldCheck className="w-3 h-3" /> }
              : chancePct >= 55
                ? { label: 'Компромисс', className: 'text-amber-300', icon: <Shield className="w-3 h-3" /> }
                : { label: 'Риск', className: 'text-rose-300', icon: <Flame className="w-3 h-3" /> };

          return (
            <div
              key={m.key}
              className={`rounded-2xl bg-[#10172e]/95 border ${meta.border} p-3.5 flex items-center justify-between gap-3 ${
                levelLocked ? 'opacity-60' : ''
              }`}
            >
              <div className="space-y-1.5 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${meta.bg}`}>
                    {meta.badge}
                  </span>
                  {storyMission && (
                    <span className="rounded-md border border-purple-300/35 bg-purple-300/10 px-2 py-0.5 text-[10px] font-bold text-purple-200">
                      📖 Глава 1
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                    <Clock className="w-3 h-3" /> {formatDuration(m.durationSec)}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">
                    {TIER_LABEL[m.tier ?? 1] ?? `T${m.tier}`}
                  </span>
                </div>

                <h3 className="font-display text-sm font-bold text-white truncate">
                  {m.targetName}
                </h3>
                <p className="text-[11px] text-slate-400 leading-snug">{m.description}</p>

                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] font-bold">
                  <span className="text-[#7dff00]">+{formatCompact(estReward)} Data</span>
                  <span className="text-[#00f0ff]">+{formatCompact(xpAward)} XP</span>
                  {estRep !== 0 && (
                    <span
                      className={`flex items-center gap-0.5 ${
                        estRep > 0 ? 'text-[#00f0ff]' : 'text-amber-400'
                      }`}
                    >
                      <Shield className="w-3 h-3" /> {estRep > 0 ? `+${estRep}` : estRep} Rep
                    </span>
                  )}
                  {estHeat > 0 && (
                    <span className="text-rose-400 flex items-center gap-0.5">
                      <Flame className="w-3 h-3" /> +{estHeat} Heat
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-bold">
                  <span className={dataLocked ? 'text-rose-300' : 'text-amber-300'}>
                    Вход: −{formatCompact(entryCost.data)} Data
                  </span>
                  <span className={energyLocked ? 'text-rose-300' : 'text-amber-300'}>
                    −{formatCompact(entryCost.energy)} Energy
                  </span>
                  <span className="text-[#7dff00]">
                    Чистыми при успехе: +{formatCompact(netSuccessData)} Data
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500">
                  <span>При успехе: ~{formatCompact(successDataPerMinute)} Data/мин</span>
                  <span>· ~{formatCompact(successXpPerMinute)} XP/мин</span>
                  <span className={riskMeta.className}>{riskMeta.label}</span>
                </div>

                {/* Шанс успеха: главный элемент выбора цели */}
                <div className="flex items-center gap-2 pt-0.5">
                  <div className="h-1.5 w-20 rounded-full bg-[#090d1a] border border-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${chancePct}%`,
                        background:
                          chancePct >= 80 ? '#7dff00' : chancePct >= 55 ? '#ffb800' : '#ff3b6b',
                      }}
                    />
                  </div>
                  <span
                    className={`text-[10px] font-bold ${
                      chancePct >= 80
                        ? 'text-[#7dff00]'
                        : chancePct >= 55
                          ? 'text-amber-300'
                          : 'text-rose-400'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {riskMeta.icon}
                      {chancePct}% · {readiness.label}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    (нужно {m.requiredPower}⚡ железа)
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={
                  levelLocked ||
                  alreadyRunning ||
                  slotsFull ||
                  dataLocked ||
                  energyLocked ||
                  scanRefreshing ||
                  busyKey === `mission:start:${m.key}`
                }
                onClick={() => void startMission(m.key)}
                className={`shrink-0 px-4 py-2.5 rounded-xl font-display font-extrabold text-xs uppercase tracking-wider transition cursor-pointer ${
                  levelLocked
                    ? 'bg-[#0a0e1a] text-slate-400 border border-slate-800 cursor-not-allowed'
                    : alreadyRunning
                      ? 'bg-[#7dff00]/15 text-[#7dff00] border border-[#7dff00]/40'
                    : slotsFull || dataLocked || energyLocked
                      ? 'bg-[#0a0e1a] text-slate-500 border border-slate-800 cursor-not-allowed'
                      : 'bg-[#00f0ff] hover:bg-[#00f0ff]/90 text-[#061018] shadow-[0_0_16px_rgba(0,240,255,0.28)]'
                }`}
              >
                {levelLocked ? (
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3" /> {m.minLevel} ур.
                  </span>
                ) : alreadyRunning ? (
                  'Активна'
                ) : slotsFull ? (
                  'Занято'
                ) : dataLocked ? (
                  `Нужно ${formatCompact(entryCost.data)} Data`
                ) : energyLocked ? (
                  `Нужно ${formatCompact(entryCost.energy)} Energy`
                ) : scanRefreshing ? (
                  'Скан...'
                ) : (
                  chancePct < 55 ? 'Рискнуть' : 'HACK'
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
