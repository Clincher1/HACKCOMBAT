import { CalendarDays, ChevronRight, ClipboardList, FileText, Inbox, Trophy } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { getGameDayBoundsMs } from '../../shared/mechanics';
import { QuestCard } from '../components/QuestCard';
import { useGame } from '../context/GameContext';
import { formatCountdown } from '../lib/format';
import { buildQuestSections, type Quest, type QuestSection } from '../lib/quests';

/**
 * Экран «Задания» (v6.0) — три секции, один тип карточки.
 *
 * Производительность:
 *   • секции собираются из PlayerState через `useMemo` — данные заданий не
 *     пересчитываются на каждом тике таймера;
 *   • каждая секция — `React.memo` со стабильными пропсами, поэтому тап по
 *     «Забрать» не перерисовывает соседние секции и не создаёт ре-маунтов;
 *   • таймер до сброса живёт в отдельном листе и не тянет за собой список.
 */

const SECTION_ICONS = {
  daily: CalendarDays,
  contract: FileText,
  progress: Trophy,
  event: ClipboardList,
} as const;

/** Тикает раз в секунду, но перерисовывает только себя — родитель мемоизирован. */
const DailyResetNote: React.FC<{ dayKey: string }> = ({ dayKey }) => {
  const { nowMs } = useGame();
  const resetAt = getGameDayBoundsMs(dayKey).end;
  const seconds = Math.max(0, (resetAt - nowMs) / 1000);
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-[var(--ui-text-muted)]">
      Новый набор через <strong className="font-bold text-slate-300">{formatCountdown(seconds)}</strong>
    </span>
  );
};

interface SectionProps {
  section: QuestSection;
  pendingClaims: ReadonlySet<string>;
  onClaim: (quest: Quest) => void;
  /** Ключ игрового дня — только для ежедневной секции. */
  dayKey?: string;
}

const SectionBody: React.FC<SectionProps> = ({ section, pendingClaims, onClaim, dayKey }) => {
  const Icon = SECTION_ICONS[section.id];
  const closed = section.quests.filter((quest) => quest.status === 'closed').length;

  return (
    <section aria-label={section.title} data-qa={`quest-section-${section.id}`} className="space-y-2">
      <header className="flex items-start gap-2.5 px-0.5">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--ui-primary-rgb),0.14)] text-[var(--ui-primary)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-sm font-extrabold text-white">{section.title}</h2>
            {section.quests.length > 0 && (
              <span className="shrink-0 rounded-md bg-[var(--ui-panel-deep)] px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-300">
                {closed}/{section.quests.length}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--ui-text-muted)]">{section.subtitle}</p>
        </div>
      </header>

      {section.quests.length === 0 ? (
        <div
          data-qa="quest-section-empty"
          className="flex items-start gap-2 rounded-xl border border-slate-700/60 bg-[var(--ui-panel-deep)]/40 px-3 py-3"
        >
          <Inbox className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-slate-400">{section.empty}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {section.quests.map((quest) => (
            <QuestCard
              key={quest.id}
              quest={quest}
              pending={quest.claimId ? pendingClaims.has(quest.claimId) : false}
              onClaim={onClaim}
            />
          ))}
        </div>
      )}

      {section.id === 'daily' && dayKey && section.quests.length > 0 && (
        <div className="flex justify-end pr-0.5">
          <DailyResetNote dayKey={dayKey} />
        </div>
      )}
    </section>
  );
};

const MemoSection = React.memo(SectionBody);

export const TasksPage: React.FC = () => {
  const { player, pendingClaims, claimDailyTask, claimContract } = useGame();

  // Секции зависят только от состояния игрока: тик таймера их не пересобирает.
  const sections = React.useMemo(() => (player ? buildQuestSections(player) : []), [player]);

  const onClaim = React.useCallback(
    (quest: Quest) => {
      if (!quest.claimKey) return;
      // Единая обёртка забора: обе награды идут через pendingClaims, поэтому
      // кнопка гаснет в том же кадре, что и тап, а не после ответа сервера.
      if (quest.kind === 'contract') void claimContract(quest.claimKey);
      else if (quest.kind === 'daily') void claimDailyTask(quest.claimKey);
    },
    [claimContract, claimDailyTask]
  );

  if (!player) return null;

  const total = sections.reduce((sum, section) => sum + section.quests.length, 0);
  const closed = sections.reduce(
    (sum, section) => sum + section.quests.filter((quest) => quest.status === 'closed').length,
    0
  );
  const dayKey = player.stats.dailyTasks?.dayKey;

  return (
    <div className="space-y-4 pb-4" data-qa="tasks-page">
      <header className="rounded-2xl border border-[rgba(var(--ui-primary-rgb),0.35)] bg-[var(--ui-panel)] px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-base font-extrabold text-white">Задания</h1>
          <span className="rounded-md bg-[rgba(var(--ui-primary-rgb),0.16)] px-2 py-0.5 text-[11px] font-extrabold tabular-nums text-[var(--ui-primary)]">
            {closed}/{total}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--ui-text-muted)]">
          Поручения дня, сюжетные цели и события — всё в одном месте. Награду за готовое забираешь одним тапом.
        </p>
      </header>

      {sections.map((section) => (
        <MemoSection
          key={section.id}
          section={section}
          pendingClaims={pendingClaims}
          onClaim={onClaim}
          dayKey={section.id === 'daily' ? dayKey : undefined}
        />
      ))}

      <Link
        to="/hacks"
        className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700/70 bg-[var(--ui-panel-deep)]/40 px-3 py-2.5 text-[11px] font-bold text-slate-300"
      >
        К контрактам
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};

export default TasksPage;
