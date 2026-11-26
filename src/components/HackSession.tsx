import { Flame, ShieldAlert, Wallet } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  HACK_SESSION_SECONDS,
  countHackNodes,
  getHackDifficulty,
  isHackTrapNode,
  type HackDifficultyKey,
} from '../../shared/hacks.config';
import type { HackSessionState } from '../../shared/types';

/**
 * Активная сессия взлома (v6.2).
 *
 * Почему отдельный чанк: сетка, requestAnimationFrame и состояние узлов нужны
 * только здесь. Стол, задания и остальные вкладки этот код не грузят.
 *
 * Правила отклика:
 *   • тап по узлу меняет только этот узел (локальный state карточки узла),
 *     счётчики обновляются отдельно — сетка не перерисовывается целиком;
 *   • таймер и полоса времени живут в одном rAF-цикле; полоса двигается через
 *     `transform`, секунды обновляются только при смене значения;
 *   • сетка замирает по концу времени и отправляет итог одним запросом.
 */

interface SessionView {
  id: string;
  difficulty: HackDifficultyKey;
  seed: number;
  endsAt: string;
  cost: number;
}

interface HackSessionProps {
  session: SessionView;
  /** Возвращает подтверждённый сервером итог или null при отказе. */
  onFinish: (sessionId: string, safeHits: number, trapHits: number) => Promise<HackSessionState | null>;
  onRestart: (difficulty: HackDifficultyKey) => void;
  busy: boolean;
}

const NODE_BASE =
  'grid aspect-square min-h-[44px] place-items-center rounded-lg border text-[11px] font-extrabold transition-[background-color,border-color,transform] duration-100';

const HackNode = React.memo(function HackNode({
  index,
  seed,
  difficultyKey,
  disabled,
  onReveal,
}: {
  index: number;
  seed: number;
  difficultyKey: HackDifficultyKey;
  disabled: boolean;
  onReveal: (isTrap: boolean) => void;
}) {
  // Раскладка считается из seed ровно так же, как на сервере.
  const difficulty = getHackDifficulty(difficultyKey);
  const isTrap = difficulty ? isHackTrapNode(seed, index, difficulty) : false;
  const [revealed, setRevealed] = useState(false);

  const handleTap = useCallback(() => {
    if (revealed || disabled) return;
    setRevealed(true);
    onReveal(isTrap);
  }, [disabled, isTrap, onReveal, revealed]);

  if (revealed) {
    return (
      <div
        data-qa="hack-node"
        data-node-state={isTrap ? 'trap' : 'safe'}
        className={`${NODE_BASE} ${
          isTrap
            ? 'border-rose-400/50 bg-rose-500/15 text-rose-300'
            : 'border-[rgba(var(--ui-success-rgb),0.55)] bg-[rgba(var(--ui-success-rgb),0.14)] text-[var(--ui-success)]'
        }`}
      >
        {isTrap ? '⚠' : '✓'}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-qa="hack-node"
      data-node-state="sealed"
      onClick={handleTap}
      disabled={disabled}
      aria-label={`Узел ${index + 1}`}
      className={`${NODE_BASE} border-slate-700/70 bg-[var(--ui-panel-deep)]/70 text-slate-500 active:scale-[0.96] active:border-[var(--ui-primary)] cursor-pointer`}
    >
      ·
    </button>
  );
});

export const HackSession: React.FC<HackSessionProps> = ({ session, onFinish, onRestart, busy }) => {
  const difficulty = getHackDifficulty(session.difficulty);
  const endsAtMs = new Date(session.endsAt).getTime();
  const nodes = difficulty ? countHackNodes(session.seed, difficulty) : { total: 0, traps: 0, safe: 0 };

  const [safeHits, setSafeHits] = useState(0);
  const [trapHits, setTrapHits] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000))
  );
  const [phase, setPhase] = useState<'run' | 'result'>('run');
  const [result, setResult] = useState<HackSessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const barRef = useRef<HTMLSpanElement | null>(null);
  const statsRef = useRef({ safe: 0, trap: 0 });
  const finishedRef = useRef(false);

  const finish = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('result');
    const confirmed = await onFinish(session.id, statsRef.current.safe, statsRef.current.trap);
    if (confirmed) setResult(confirmed);
    else setError('Сервер не подтвердил итог — данные не начислены.');
  }, [onFinish, session.id]);

  // Один rAF-цикл на всю сессию: полоса — через transform, секунды — по факту смены.
  useEffect(() => {
    if (phase !== 'run') return;
    const totalMs = HACK_SESSION_SECONDS * 1000;
    let raf = 0;
    const tick = () => {
      const leftMs = Math.max(0, endsAtMs - Date.now());
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${Math.min(1, leftMs / totalMs)})`;
      }
      const nextSeconds = Math.ceil(leftMs / 1000);
      setSecondsLeft((prev) => (prev === nextSeconds ? prev : nextSeconds));
      if (leftMs <= 0) {
        void finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAtMs, finish, phase]);

  const handleReveal = useCallback((isTrap: boolean) => {
    // Мутируем счётчики в ref и обновляем состояние — счётчики нужны на экране,
    // но сетка от этого не перерисовывается (узлы мемоизированы и держат свой state).
    if (isTrap) statsRef.current.trap += 1;
    else statsRef.current.safe += 1;
    setSafeHits(statsRef.current.safe);
    setTrapHits(statsRef.current.trap);
  }, []);

  if (!difficulty) return null;

  const liveData = Math.round(safeHits * difficulty.dataPerNode);
  const liveHeat = trapHits * difficulty.trapHeat;
  const running = phase === 'run';

  return (
    <section
      data-qa="hack-session"
      data-hack-phase={phase}
      className="rounded-2xl border border-[rgba(var(--ui-primary-rgb),0.4)] bg-[var(--ui-panel)] p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-display text-sm font-extrabold text-white">
            {difficulty.icon} Взлом · {difficulty.title.toLowerCase()}
          </h2>
          <p className="truncate text-[10px] text-[var(--ui-text-muted)]">
            {running ? 'Тапай узлы: ловушка добавит Heat' : 'Итог сессии'}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-lg px-2 py-1 text-[12px] font-extrabold tabular-nums ${
            secondsLeft <= 5 && running
              ? 'bg-rose-500/15 text-rose-300'
              : 'bg-[var(--ui-panel-deep)] text-slate-200'
          }`}
        >
          {secondsLeft}с
        </span>
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
        <span
          ref={barRef}
          className="block h-full w-full origin-left rounded-full bg-[var(--ui-primary)]"
          style={{ transform: 'scaleX(1)' }}
        />
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10px] font-bold tabular-nums">
        <span className="inline-flex items-center gap-1 rounded-md bg-[rgba(var(--ui-success-rgb),0.14)] px-1.5 py-0.5 text-[var(--ui-success)]">
          <Wallet className="h-3 w-3" />+{liveData.toLocaleString('ru-RU')}
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/12 px-1.5 py-0.5 text-rose-300">
          <Flame className="h-3 w-3" />+{liveHeat}
        </span>
        <span className="ml-auto text-slate-500">
          узлов {safeHits + trapHits}/{nodes.total}
        </span>
      </div>

      <div
        className="mt-2.5 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${difficulty.cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: nodes.total }, (_, index) => (
          <HackNode
            key={index}
            index={index}
            seed={session.seed}
            difficultyKey={session.difficulty}
            disabled={!running}
            onReveal={handleReveal}
          />
        ))}
      </div>

      {phase === 'result' && (
        <div className="mt-3 space-y-2" data-qa="hack-result">
          <div className="rounded-xl border border-slate-700/70 bg-[var(--ui-panel-deep)]/60 p-2.5 text-[11px] leading-relaxed text-slate-300">
            {error ? (
              <span className="text-rose-300">{error}</span>
            ) : (
              <>
                Подтверждено сервером:{' '}
                <strong className="text-[var(--ui-success)]">
                  +{(result?.dataGained ?? liveData).toLocaleString('ru-RU')} Data
                </strong>{' '}
                ·{' '}
                <strong className="text-rose-300">
                  +{(result?.heatGained ?? liveHeat)} Heat
                </strong>{' '}
                · узлов {result?.safeHits ?? safeHits} · ловушек {result?.trapHits ?? trapHits}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-qa-action="hack-restart"
              onClick={() => onRestart(session.difficulty)}
              disabled={busy}
              className="flex-1 rounded-xl bg-[var(--ui-primary)] px-3 py-2.5 text-[11px] font-extrabold text-[#071005] transition-transform duration-150 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              Ещё раз · −{difficulty.cost} CPU
            </button>
            <Link
              to="/"
              className="flex-1 rounded-xl border border-slate-700 bg-[var(--ui-panel-deep)] px-3 py-2.5 text-center text-[11px] font-extrabold text-slate-300"
            >
              На стол
            </Link>
          </div>
        </div>
      )}

      {running && trapHits >= 3 && (
        <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-relaxed text-rose-300/90">
          <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
          Много Heat. При перегреве включится блокировка терминала.
        </p>
      )}
    </section>
  );
};

export default HackSession;
