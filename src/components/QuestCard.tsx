import { Check, ChevronRight, Gift, LockKeyhole, Loader2 } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import type { Quest, QuestStatus } from '../lib/quests';

/**
 * Единственная карточка задания на весь раздел (v6.0).
 *
 * Правила, за которые отвечает этот файл:
 *   • один визуальный язык: заголовок → награда → прогресс → состояние → действие;
 *   • прогресс двигается через `transform: scaleX()`, а не через width, поэтому
 *     анимация не вызывает layout и не дёргает соседние карточки;
 *   • карточка мемоизирована: тап по «Забрать» перерисовывает одну карточку,
 *     а не весь список.
 */

const STATUS_STYLES: Record<QuestStatus, { card: string; chip: string; label: string }> = {
  available: {
    card: 'border-slate-700/70 bg-[var(--ui-panel-deep)]/45',
    chip: 'bg-slate-800/70 text-slate-400',
    label: 'Доступно',
  },
  active: {
    card: 'border-[rgba(var(--ui-primary-rgb),0.4)] bg-[var(--ui-panel-deep)]/55',
    chip: 'bg-[rgba(var(--ui-primary-rgb),0.16)] text-[var(--ui-primary)]',
    label: 'В процессе',
  },
  ready: {
    card: 'border-[rgba(var(--ui-success-rgb),0.6)] bg-[rgba(var(--ui-success-rgb),0.08)]',
    chip: 'bg-[rgba(var(--ui-success-rgb),0.18)] text-[var(--ui-success)]',
    label: 'Готово к забору',
  },
  closed: {
    card: 'border-emerald-400/25 bg-emerald-950/15',
    chip: 'bg-emerald-500/12 text-emerald-300',
    label: 'Закрыто',
  },
};

interface QuestCardProps {
  quest: Quest;
  /** Оптимистичный флаг: награда уже «забрана» в UI, ответ сервера ещё летит. */
  pending: boolean;
  /** Идёт сезонный леденец — на Data-целях показываем «×2 сейчас». */
  boostActive?: boolean;
  onClaim: (quest: Quest) => void;
}

const QuestCardBase: React.FC<QuestCardProps> = ({ quest, pending, boostActive = false, onClaim }) => {
  const status: QuestStatus = pending ? 'closed' : quest.status;
  const styles = STATUS_STYLES[status];
  const ratio = quest.target > 0 ? Math.min(1, Math.max(0, quest.current / quest.target)) : 0;
  const canClaim = Boolean(quest.claimKey) && status === 'ready';

  return (
    <article
      data-qa="quest-card"
      data-quest-id={quest.id}
      data-status={status}
      className={`rounded-xl border p-3 transition-[border-color,background-color,transform] duration-150 ${styles.card}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base leading-none" aria-hidden="true">
          {quest.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-xs font-bold leading-snug text-white">{quest.title}</h3>
            <span className="shrink-0 rounded-md bg-amber-300/12 px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums text-amber-200">
              {quest.rewardLabel}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-400">{quest.description}</p>
          {boostActive && quest.boostEligible && (
            <span
              data-qa="quest-boost"
              className="mt-1 inline-flex items-center gap-1 rounded bg-amber-300/15 px-1 py-0.5 text-[9px] font-extrabold leading-none text-amber-200"
            >
              🍭 ×2 сейчас
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full w-full origin-left rounded-full ${
              status === 'closed' ? 'bg-emerald-400' : status === 'ready' ? 'bg-[var(--ui-success)]' : 'bg-[var(--ui-primary)]'
            }`}
            style={{ transform: `scaleX(${status === 'closed' ? 1 : ratio})`, transition: 'transform 200ms ease-out' }}
          />
        </div>
        <span className="shrink-0 text-[10px] font-bold tabular-nums text-slate-300">
          {quest.current.toLocaleString('ru-RU')}/{quest.target.toLocaleString('ru-RU')}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${styles.chip}`}>
          {status === 'closed' ? <Check className="h-3 w-3 shrink-0" /> : null}
          <span className="truncate">{pending ? 'Получено' : quest.hint ?? styles.label}</span>
        </span>

        {canClaim ? (
          <button
            type="button"
            data-qa-action="claim-quest"
            onClick={() => onClaim(quest)}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--ui-success)] px-2.5 py-1.5 text-[10px] font-extrabold text-[#071005] transition-transform duration-150 active:scale-[0.97] cursor-pointer"
          >
            <Gift className="h-3 w-3" />
            Забрать
          </button>
        ) : quest.claimKey && status === 'closed' ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-950/40 px-2.5 py-1.5 text-[10px] font-extrabold text-emerald-300">
            <Check className="h-3 w-3" />
            Получено
          </span>
        ) : quest.claimKey ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[10px] font-extrabold text-slate-500">
            <LockKeyhole className="h-3 w-3" />
            Не готово
          </span>
        ) : quest.href ? (
          <Link
            to={quest.href}
            data-qa-action="open-quest-target"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[rgba(var(--ui-primary-rgb),0.45)] px-2.5 py-1.5 text-[10px] font-extrabold text-[var(--ui-primary)] transition-colors duration-150"
          >
            {status === 'closed' ? 'Повторить' : 'Открыть'}
            <ChevronRight className="h-3 w-3" />
          </Link>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-800/70 px-2.5 py-1.5 text-[10px] font-extrabold text-slate-500">
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {styles.label}
          </span>
        )}
      </div>
    </article>
  );
};

export const QuestCard = React.memo(QuestCardBase);
QuestCard.displayName = 'QuestCard';
