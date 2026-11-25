// ============================================================================
// ДЕМО-ВЕРСИЯ: «все открытия» (v4.3)
// ----------------------------------------------------------------------------
// Отдельный экран вне игрового провайдера: не требует Telegram-сессии, не
// обращается к API и не может изменить живой прогресс. Всё содержимое берётся
// из shared/*.config.ts, то есть это ровно тот контент, что есть в игре.
//
// Зачем: 228 из 235 живых аккаунтов не сделали ни одного клика, и человек не
// видит, что игра вообще приготовила на 10–40 уровнях. Здесь всё видно сразу:
// 7 сцен, 48 модулей, 30 контрактов, 80 ачивок и ползунок «а что будет на 30-м».
// ============================================================================

import { ArrowLeft, Eye, EyeOff, Lock, Search, Sparkles, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DEMO_LADDER,
  DEMO_MAX_LEVEL,
  DEMO_SECTIONS,
  DEMO_TOTAL_UNLOCKS,
  type DemoItem,
  type DemoSection,
} from '../demo/catalog';
import { DEMO_CEILING } from '../demo/ceiling';
import {
  computeDeskStage,
  getDeskStageInfo,
  getRankForLevel,
} from '../../shared/mechanics';

const TEAL = '#2ee6d6';
const CORAL = '#ff7a4d';
const SAND = '#f5d5b0';

const LEVEL_STOPS = [1, 5, 10, 20, 30, 50, 100, 200] as const;

const isLocked = (item: DemoItem, level: number): boolean => item.level > level;

const normalize = (value: string): string => value.toLowerCase().replace(/ё/g, 'е');

function matchesQuery(item: DemoItem, query: string, revealSecrets: boolean): boolean {
  if (!query) return true;
  if (item.secret && !revealSecrets) return false;
  const haystack = normalize(`${item.title} ${item.subtitle ?? ''} ${item.tag ?? ''} ${item.cost ?? ''}`);
  return haystack.includes(query);
}

// ---------------------------------------------------------------- карточка

const ItemCard: React.FC<{
  item: DemoItem;
  level: number;
  revealSecrets: boolean;
  onOpen: (item: DemoItem) => void;
}> = ({ item, level, revealSecrets, onOpen }) => {
  const locked = isLocked(item, level);
  const hidden = Boolean(item.secret) && !revealSecrets;
  const accent = item.accent ?? TEAL;

  const title = hidden ? 'Секретное достижение' : item.title;
  const subtitle = hidden ? 'Откроется само — название скрыто до получения' : item.subtitle;

  if (item.image && !hidden) {
    return (
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={`group relative overflow-hidden rounded-2xl border text-left transition cursor-pointer ${
          locked ? 'border-white/10' : 'border-white/15 hover:border-[#2ee6d6]/60'
        }`}
        title={locked ? `Откроется на ${item.level} уровне` : 'Открыть на весь экран'}
      >
        <img
          src={item.image}
          alt={item.title}
          loading="lazy"
          className={`h-40 w-full object-cover transition duration-300 sm:h-44 ${
            locked ? 'opacity-35 saturate-50 grayscale-[35%]' : 'group-hover:scale-[1.03]'
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--ui-panel-deep)] via-[var(--ui-panel-deep)]/35 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
            style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}
          >
            {item.tag ?? 'сцена'}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
              locked ? 'bg-black/60 text-slate-300' : 'bg-[#2ee6d6]/15 text-[#2ee6d6]'
            }`}
          >
            {locked && <Lock className="h-2.5 w-2.5" />}
            Ур. {item.level}
          </span>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <div className="font-display text-[12px] font-extrabold leading-tight text-white">
            {title}
          </div>
          {subtitle && (
            <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-300">
              {subtitle}
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <div
      className={`rounded-xl border p-2.5 transition ${
        locked ? 'border-white/8 bg-white/[0.02]' : 'border-white/12 bg-white/[0.04]'
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-base"
          style={{
            background: `${accent}1f`,
            border: `1px solid ${accent}44`,
            opacity: locked ? 0.5 : 1,
          }}
          aria-hidden
        >
          {hidden ? '❔' : item.glyph ?? '◈'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <div
              className={`text-[11px] font-bold leading-tight ${
                locked ? 'text-slate-400' : 'text-slate-100'
              }`}
            >
              {title}
            </div>
            {locked && <Lock className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />}
          </div>
          {subtitle && (
            <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-500">{subtitle}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {item.tag && (
              <span
                className="rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide"
                style={{
                  background: locked ? 'rgba(255,255,255,0.05)' : `${accent}1a`,
                  color: locked ? '#94a3b8' : accent,
                }}
              >
                {item.tag}
              </span>
            )}
            {item.cost && (
              <span className="text-[9px] text-slate-400">{item.cost}</span>
            )}
            {item.level > 1 && (
              <span className="text-[9px] text-slate-500">с {item.level} ур.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- лестница

const LadderView: React.FC<{ level: number }> = ({ level }) => (
  <div className="space-y-2">
    {DEMO_LADDER.filter((row) => row.level <= Math.max(level, 10) || row.lines.length > 0).map(
      (row) => {
        const reached = row.level <= level;
        const stageInfo = getDeskStageInfo(row.stage as 1 | 5 | 10 | 15 | 20 | 25 | 30);
        return (
          <div
            key={row.level}
            className={`rounded-xl border px-2.5 py-2 transition ${
              reached
                ? 'border-[#2ee6d6]/35 bg-[#2ee6d6]/[0.06]'
                : 'border-white/8 bg-white/[0.02] opacity-70'
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg font-display text-[11px] font-extrabold ${
                  reached ? 'bg-[#2ee6d6] text-[var(--ui-on-success)]' : 'bg-white/8 text-slate-400'
                }`}
              >
                {row.level}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {row.lines.map((line) => (
                    <span key={`${row.level}-${line.section}-${line.title}`} className="text-[10px] leading-snug">
                      <span className="text-slate-200">{line.title}</span>
                      <span className="ml-1 text-slate-500">· {line.section}</span>
                    </span>
                  ))}
                  {row.more > 0 && (
                    <span className="text-[10px] font-bold text-[#ff7a4d]">+{row.more} ещё</span>
                  )}
                </div>
                {row.notes.length > 0 && (
                  <div className="mt-0.5 text-[9px] uppercase tracking-wide text-[#ff7a4d]/90">
                    {row.notes.join(' · ')}
                  </div>
                )}
              </div>
              <span className="hidden shrink-0 text-[9px] text-slate-500 sm:block">
                {stageInfo.title.replace(' — ', ' · ')}
              </span>
            </div>
          </div>
        );
      }
    )}
  </div>
);

// ---------------------------------------------------------------- секция

const SectionView: React.FC<{
  section: DemoSection;
  level: number;
  query: string;
  onlyUnlocked: boolean;
  revealSecrets: boolean;
  onOpen: (item: DemoItem) => void;
}> = ({ section, level, query, onlyUnlocked, revealSecrets, onOpen }) => {
  const visible = section.items.filter((item) => {
    if (onlyUnlocked && isLocked(item, level)) return false;
    return matchesQuery(item, query, revealSecrets);
  });
  const unlockedCount = section.items.filter((item) => !isLocked(item, level)).length;

  if (visible.length === 0) return null;

  const media = visible.filter((item) => item.image);
  const plain = visible.filter((item) => !item.image);

  return (
    <section id={section.id} className="scroll-mt-28">
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 font-display text-[13px] font-extrabold uppercase tracking-wide text-white">
            <span aria-hidden>{section.glyph}</span>
            {section.title}
          </h2>
          <p className="text-[10px] text-slate-400">{section.subtitle}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold"
          style={{ background: `${section.accent}1a`, color: section.accent }}
        >
          {unlockedCount}/{section.items.length}
        </span>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-white/15 to-transparent mb-2.5" />

      {media.length > 0 && (
        <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {media.map((item) => (
            <ItemCard
              key={item.key}
              item={item}
              level={level}
              revealSecrets={revealSecrets}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}

      {plain.length > 0 && (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {plain.map((item) => (
            <ItemCard
              key={item.key}
              item={item}
              level={level}
              revealSecrets={revealSecrets}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </section>
  );
};

// ---------------------------------------------------------------- страница

export const DemoPage: React.FC = () => {
  const [level, setLevel] = useState(1);
  const [query, setQuery] = useState('');
  const [onlyUnlocked, setOnlyUnlocked] = useState(false);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [opened, setOpened] = useState<DemoItem | null>(null);

  const normalizedQuery = normalize(query.trim());

  const totalUnlocked = useMemo(
    () =>
      DEMO_SECTIONS.reduce(
        (sum, section) => sum + section.items.filter((item) => !isLocked(item, level)).length,
        0
      ),
    [level]
  );

  const percent = Math.round((totalUnlocked / DEMO_TOTAL_UNLOCKS) * 100);
  const rank = getRankForLevel(level).rankTitle;
  const stageInfo = getDeskStageInfo(computeDeskStage(level));

  const jump = useCallback((id: string) => {
    const node = document.getElementById(id);
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--ui-panel-deep)] text-slate-200">
      {/* Тёплое свечение «заката» — общий фон демо, чтобы экран не был холодным. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(900px 380px at 15% -10%, rgba(255,122,77,0.20), transparent 60%), radial-gradient(700px 340px at 90% 0%, rgba(46,230,214,0.14), transparent 60%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-5xl px-3 pb-16 pt-3">
        {/* Шапка */}
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 transition hover:border-[#2ee6d6]/60 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            В игру
          </Link>
          <span className="font-display text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
            Hacker Kombat · демо
          </span>
          <span
            className="rounded-full px-2 py-1 text-[10px] font-extrabold"
            style={{ background: 'rgba(46,230,214,0.14)', color: TEAL }}
          >
            Ур. {level}
          </span>
        </div>

        {/* Герой */}
        <header className="mt-4">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff7a4d]">
            <Sparkles className="h-3 w-3" />
            полная витрина контента
          </div>
          <h1 className="mt-1 font-display text-[26px] font-extrabold leading-[1.05] text-white sm:text-4xl">
            ВСЕ ОТКРЫТИЯ
            <span className="block text-[#2ee6d6]">БЕЗ ГРИНДА</span>
          </h1>
          <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-slate-400 sm:text-xs">
            {DEMO_TOTAL_UNLOCKS} предметов и механик из тех же конфигов, что использует игра: сцены
            рабочего стола, модули, контракты, синдикат, база, косметика, ачивки и события. Двигай
            ползунок уровня — витрина честно показывает, что к этому моменту уже открыто.
          </p>
        </header>

        {/* Сводка */}
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {[
            { label: 'Сцен стола', value: '7' },
            { label: 'Модулей', value: '48' },
            { label: 'Контрактов', value: '30' },
            { label: 'Достижений', value: '80' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2"
            >
              <div className="font-display text-lg font-extrabold leading-none text-white">
                {stat.value}
              </div>
              <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Потолок профиля */}
        <div className="mt-2 rounded-2xl border border-[#ff7a4d]/30 bg-gradient-to-br from-[#2a1712]/80 to-[#0b1117]/90 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-1">
            <h2 className="font-display text-[11px] font-extrabold uppercase tracking-wide text-[#ffb45c]">
              Потолок профиля · {DEMO_CEILING.level} ур. · {DEMO_CEILING.rank}
            </h2>
            <span className="text-[9px] text-slate-500">
              все модули {DEMO_CEILING.cardLevels}, вся команда, вся база
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {[
              { label: 'Data/час', value: DEMO_CEILING.dataPerHour },
              { label: 'за тап', value: DEMO_CEILING.clickPower },
              { label: 'сила железа', value: DEMO_CEILING.hackPower },
            ].map((cell) => (
              <div key={cell.label} className="rounded-lg bg-black/25 px-2 py-1.5">
                <div className="font-display text-[13px] font-extrabold text-white">{cell.value}</div>
                <div className="text-[8px] uppercase tracking-wide text-slate-500">{cell.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Управление */}
        <div className="sticky top-0 z-20 -mx-3 mt-3 border-y border-white/10 bg-[var(--ui-panel-deep)]/95 px-3 py-2 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] text-slate-400">
              <span className="font-bold text-white">{totalUnlocked}</span> из {DEMO_TOTAL_UNLOCKS}{' '}
              открыто · {percent}%
            </div>
            <div className="text-[10px] font-bold" style={{ color: TEAL }}>
              {rank}
            </div>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${percent}%`,
                background: `linear-gradient(90deg, ${TEAL}, ${CORAL})`,
              }}
            />
          </div>
          <input
            type="range"
            min={1}
            max={DEMO_MAX_LEVEL}
            step={1}
            value={level}
            onChange={(event) => setLevel(Number(event.target.value))}
            className="mt-2 h-2 w-full cursor-pointer accent-[#2ee6d6]"
            aria-label="Уровень игрока"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {LEVEL_STOPS.map((stop) => (
              <button
                key={stop}
                type="button"
                onClick={() => setLevel(stop)}
                className={`rounded-lg px-2 py-1 text-[10px] font-bold transition cursor-pointer ${
                  level === stop
                    ? 'bg-[#2ee6d6] text-[var(--ui-on-success)]'
                    : 'bg-white/6 text-slate-300 hover:bg-white/12'
                }`}
              >
                {stop}
              </button>
            ))}
            <span className="ml-1 hidden text-[9px] text-slate-500 sm:inline">
              сцена: {stageInfo.title}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOnlyUnlocked((value) => !value)}
                className={`rounded-lg px-2 py-1 text-[10px] font-bold transition cursor-pointer ${
                  onlyUnlocked ? 'bg-[#ff7a4d] text-[#1b0a04]' : 'bg-white/6 text-slate-300'
                }`}
              >
                только открытое
              </button>
              <button
                type="button"
                onClick={() => setRevealSecrets((value) => !value)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition cursor-pointer ${
                  revealSecrets ? 'bg-[#ff7a4d] text-[#1b0a04]' : 'bg-white/6 text-slate-300'
                }`}
              >
                {revealSecrets ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                секреты
              </button>
            </div>
          </div>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск: модуль, контракт, скин, ачивка…"
              className="w-full rounded-xl border border-white/10 bg-white/5 py-1.5 pl-7 pr-7 text-[11px] text-slate-100 outline-none placeholder:text-slate-500 focus:border-[#2ee6d6]/60"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Очистить поиск"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="mt-1.5 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {DEMO_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => jump(section.id)}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold text-slate-300 transition hover:border-[#2ee6d6]/50 hover:text-white cursor-pointer"
              >
                {section.glyph} {section.title}
              </button>
            ))}
          </div>
        </div>

        {/* Лестница уровней */}
        <section id="ladder" className="mt-4 scroll-mt-40">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <h2 className="flex items-center gap-1.5 font-display text-[13px] font-extrabold uppercase tracking-wide text-white">
                <span aria-hidden>🪜</span>
                Лестница открытий
              </h2>
              <p className="text-[10px] text-slate-400">
                Всё, что меняется по уровням: предметы, ранги, слоты контрактов и Престиж
              </p>
            </div>
            <span className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-bold text-slate-300">
              {DEMO_LADDER.length} ступеней
            </span>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-white/15 to-transparent mb-2.5" />
          <LadderView level={level} />
        </section>

        {/* Секции каталога */}
        <div className="mt-5 space-y-5">
          {DEMO_SECTIONS.map((section) => (
            <SectionView
              key={section.id}
              section={section}
              level={level}
              query={normalizedQuery}
              onlyUnlocked={onlyUnlocked}
              revealSecrets={revealSecrets}
              onOpen={setOpened}
            />
          ))}
        </div>

        {/* Подвал */}
        <footer className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[10px] leading-relaxed text-slate-400">
            Витрина ничего не открывает в реальном аккаунте: она только читает{' '}
            <code className="text-slate-200">shared/*.config.ts</code> — те же самые конфиги, что
            использует сервер. Уровень здесь — симулятор, а не изменение прогресса.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { to: '/', label: 'Рабочий стол' },
              { to: '/upgrades', label: 'Апгрейды' },
              { to: '/hacks', label: 'Контракты' },
              { to: '/team', label: 'Синдикат' },
              { to: '/profile', label: 'Профиль' },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-200 transition hover:border-[#2ee6d6]/60 hover:text-white"
              >
                {link.label} →
              </Link>
            ))}
          </div>
        </footer>
      </div>

      {/* Просмотр сцены на весь экран */}
      {opened?.image && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-3 backdrop-blur-sm"
          onClick={() => setOpened(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setOpened(null)}
            className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 cursor-pointer"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={opened.image}
            alt={opened.title}
            className="max-h-[78vh] w-full max-w-4xl rounded-xl border border-white/15 object-contain"
          />
          <div className="mt-2 max-w-4xl text-center">
            <div className="font-display text-sm font-extrabold text-white">{opened.title}</div>
            {opened.subtitle && (
              <p className="mt-0.5 text-[11px] text-slate-400">{opened.subtitle}</p>
            )}
            <p className="mt-1 text-[10px] uppercase tracking-wide text-[#ffb45c]">
              {opened.tag} · открывается на {opened.level} уровне
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
