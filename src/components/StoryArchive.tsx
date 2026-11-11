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
  return (
    <section aria-label="Сюжетный архив" className="rounded-2xl border border-slate-600 bg-[#252b2e]/90 p-3.5 text-slate-100">
      <div className="flex items-start gap-2.5">
        <BookOpen className="h-5 w-5 shrink-0 text-[#adc8ac]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold">Сюжетный архив · {unlocked.length}/{STORY_EPISODES.length}</h2>
          {!introComplete ? (
            <p className="mt-1 text-[11px] leading-relaxed text-slate-300">Пройди вводные задания оператора, чтобы открыть историю.</p>
          ) : (
            <>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                {next ? `Следующая запись: ${totalMissions}/${next.missions} закрытых контрактов.` : 'Все записи истории открыты. Контракты и развитие продолжаются.'}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Открываются за общее число закрытых контрактов, включая прежние. Дополнительных наград нет.</p>
              {unlocked.length > 0 && <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="mt-2 text-xs font-semibold text-[var(--ui-secondary)] underline underline-offset-2">{open ? 'Свернуть историю' : 'Читать историю'}</button>}
              {next && <Link to="/hacks" className="ml-4 inline-block text-xs text-slate-200 underline underline-offset-2">К контрактам</Link>}
            </>
          )}
        </div>
      </div>
      {open && episode && (
        <article className="mt-3 rounded-xl border border-slate-600 bg-black/20 p-3" aria-live="polite">
          <p className="text-[10px] font-bold text-[#adc8ac]">Сезон {episode.season} · {STORY_SEASONS[episode.season - 1]} · запись {episode.id}/{STORY_EPISODES.length}</p>
          <h3 className="mt-1 text-sm font-bold">{episode.title}</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-200">{episode.text}</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button type="button" aria-label="Предыдущая запись" disabled={index === 0} onClick={() => setIndex(value => value - 1)} className="rounded-lg border border-slate-600 p-2 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs text-slate-300">{index + 1} / {unlocked.length}</span>
            <button type="button" aria-label="Следующая запись" disabled={index >= unlocked.length - 1} onClick={() => setIndex(value => value + 1)} className="rounded-lg border border-slate-600 p-2 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </article>
      )}
    </section>
  );
};
