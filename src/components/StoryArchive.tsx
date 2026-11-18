import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStoryState, STORY_EPISODES, STORY_SEASONS } from '../../shared/story.config';
import type { PlayerState } from '../../shared/types';

/** Read-only story archive: no API mutations or additional rewards. */
export const StoryArchive: React.FC<{ player: PlayerState }> = ({ player }) => {
  const { introComplete, totalMissions, unlocked, next } = getStoryState(player);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  useEffect(() => { setIndex(current => Math.min(current, Math.max(0, unlocked.length - 1))); }, [unlocked.length]);
  const episode = unlocked[index];
  const availableChapters = STORY_SEASONS.map((title, chapterIndex) => ({
    title, chapterIndex, firstIndex: unlocked.findIndex(item => item.season === chapterIndex + 1),
  })).filter(chapter => chapter.firstIndex !== -1);
  return (
    <section aria-label="Сюжетный архив" className={`rounded-2xl border p-3.5 text-slate-100 ${unlocked.length > 0 ? 'border-[rgba(var(--ui-secondary-rgb),0.8)] bg-gradient-to-br from-purple-950/80 via-[#242040] to-[#252b2e] shadow-[0_0_28px_rgba(var(--ui-secondary-rgb),0.28)]' : 'border-slate-600 bg-[#252b2e]/90'}`}>
      {unlocked.length > 0 && <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ui-secondary)]">● История доступна · начни с первой главы</div>}
      <div className="flex items-start gap-2.5">
        <BookOpen className="h-5 w-5 shrink-0 text-[#adc8ac]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold">Сюжет · главы истории · {unlocked.length}/{STORY_EPISODES.length}</h2>
          {!introComplete ? (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">Пройди вводные задания оператора, чтобы открыть историю.</p>
          ) : (
            <>
              <p className="mt-1 text-xs leading-relaxed text-slate-100">Странный сигнал. Исчезнувшие журналы. Узнай, что скрывает Shadow Corp.</p>
              {unlocked.length > 0 && <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="mt-2 min-h-[40px] w-full rounded-xl bg-[var(--ui-secondary)] px-3 py-2 text-xs font-extrabold text-[#0b0710] shadow-[0_0_16px_rgba(var(--ui-secondary-rgb),0.28)] transition hover:brightness-110">{open ? 'Свернуть историю' : 'Читать историю'}</button>}
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">
                {next ? `Следующая запись: ${totalMissions}/${next.missions} закрытых контрактов.` : 'Все записи истории открыты. Контракты и развитие продолжаются.'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Открываются за контракты, в том числе прежние. Дополнительных наград нет.</p>
              {unlocked.length > 24 && (
                <div className="mt-2 rounded-lg border border-[rgba(var(--ui-secondary-rgb),0.55)] bg-black/20 p-2">
                  <p className="text-[11px] font-bold text-[var(--ui-secondary)]">● Продолжение истории · открыто {unlocked.length - 24} из {STORY_EPISODES.length - 24}</p>
                  <button type="button" onClick={() => { setIndex(24); setOpen(true); }} className="mt-1 min-h-[36px] text-xs font-semibold text-slate-100 underline underline-offset-2">Читать новые записи</button>
                </div>
              )}
              {next && <Link to="/hacks" className="mt-2 inline-block text-xs text-slate-200 underline underline-offset-2">К контрактам</Link>}
            </>
          )}
        </div>
      </div>
      {open && episode && (
        <div className="mt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-300">Открытые главы</p>
          <div className="flex flex-wrap gap-1.5" aria-label="Открытые главы истории">
            {availableChapters.map(chapter => (
              <button key={chapter.chapterIndex} type="button" onClick={() => setIndex(chapter.firstIndex)}
                aria-current={episode.season === chapter.chapterIndex + 1 ? 'true' : undefined}
                className={`min-h-[36px] rounded-lg border px-2 py-1 text-left text-[11px] font-semibold ${episode.season === chapter.chapterIndex + 1 ? 'border-[var(--ui-secondary)] bg-[rgba(var(--ui-secondary-rgb),0.18)] text-white' : 'border-slate-600 bg-black/20 text-slate-200'}`}>
                Глава {chapter.chapterIndex + 1} · {chapter.title}
              </button>
            ))}
          </div>
        <article className="mt-3 rounded-xl border border-slate-600 bg-black/20 p-3" aria-live="polite">
          <p className="text-[10px] font-bold text-[#adc8ac]">Глава {episode.season} · {STORY_SEASONS[episode.season - 1]} · запись {episode.id}/{STORY_EPISODES.length}</p>
          <h3 className="mt-1 text-sm font-bold">{episode.title}</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-200">{episode.text}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button type="button" aria-label="Предыдущая запись" disabled={index === 0} onClick={() => setIndex(value => value - 1)} className="rounded-lg border border-slate-600 p-2 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs text-slate-300">{index + 1} / {unlocked.length}</span>
            <button type="button" aria-label="Следующая запись" disabled={index >= unlocked.length - 1} onClick={() => setIndex(value => value + 1)} className="rounded-lg border border-slate-600 p-2 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </article>
        </div>
      )}
    </section>
  );
};
