import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArchiveEntry } from '../../shared/operatorArchive';
import { getStoryState, STORY_SEASONS } from '../../shared/story.config';
import { useGame } from '../context/GameContext';
import { gameApi } from '../lib/api';

export const ArchivePage: React.FC = () => {
  const { player } = useGame();
  const storyState = player ? getStoryState(player) : null;
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [tab, setTab] = useState<'story' | 'city'>('story');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (selectedKey) articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [selectedKey]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setEntries((await gameApi.archiveSync()).entries); }
    catch { setError('Не удалось загрузить архив. Проверь соединение и открой игру через Telegram.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = entries.filter(entry => entry.category === tab).sort((a, b) => a.position - b.position);
  const selected = entries.find(entry => entry.entry_key === selectedKey);
  const read = async (entry: ArchiveEntry) => {
    setSelectedKey(entry.entry_key);
    if (entry.read_at) return;
    setSaving(true); setError('');
    try {
      const saved = (await gameApi.archiveRead(entry.entry_key)).entry;
      setEntries(current => current.map(item => item.entry_key === saved.entry_key ? saved : item));
    } catch { setError('Запись открыта, но отметку не удалось сохранить. Нажми на запись ещё раз.'); }
    finally { setSaving(false); }
  };
  return <section aria-label="Архив оператора" className="space-y-3 pb-4 text-slate-100">
    <Link to="/" className="inline-block text-xs text-[var(--ui-secondary)] underline">← На рабочий стол</Link>
    <div className="rounded-2xl border border-[rgba(var(--ui-secondary-rgb),0.6)] bg-[#20253b] p-4">
      <h2 className="text-base font-extrabold">Архив оператора</h2>
      <p className="mt-1 text-xs text-slate-300">Истории сохраняются в аккаунте. Старые просмотры не записывались; пометки появляются с этого обновления.</p>
      <div className="mt-3 flex gap-2" role="group" aria-label="Раздел архива">
        {([['story','Основной сюжет'], ['city','Городская смена']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => {setTab(key); setSelectedKey(null); setError('');}} className="min-h-[42px] rounded-lg border border-slate-500 px-3 text-xs font-bold aria-pressed:border-[var(--ui-secondary)] aria-pressed:bg-[rgba(var(--ui-secondary-rgb),0.18)]">{label}</button>)}
      </div>
      {loading && <p className="mt-3 text-xs">Загружаем архив…</p>}
      {error && <div role="alert" className="mt-3 rounded-lg border border-rose-400/60 p-2 text-xs text-rose-200">{error} <button type="button" onClick={() => void load()} className="underline">Повторить загрузку</button></div>}
      {!loading && !error && visible.length === 0 && <p className="mt-3 text-xs text-slate-300">Пока нет открытых записей. Заверши вводные задания и выполняй контракты.</p>}
      {tab === 'story' && storyState?.next && <p className="mt-3 text-[11px] text-slate-300">Следующая глава: {storyState.totalMissions}/{storyState.next.missions} закрытых контрактов. Отдельных наград за записи нет.</p>}
      {tab === 'city' && !loading && <p className="mt-3 text-[11px] text-slate-300">Все 14 сообщений доступны для перечитывания; сообщение дня продолжает меняться во «Взломах».</p>}
      <div className="mt-3 space-y-1.5" aria-label="Записи архива">
        {visible.map(entry => <button key={entry.entry_key} type="button" disabled={saving} aria-current={selectedKey === entry.entry_key ? 'true' : undefined} onClick={() => void read(entry)} className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-slate-600 bg-black/20 px-3 py-2 text-left text-xs aria-current:border-[var(--ui-secondary)] disabled:opacity-60"><span className="flex-1"><span className="text-slate-400">{entry.category === 'story' ? `Глава ${entry.content.season ?? '—'} · ` : ''}{entry.position}. </span>{entry.content.title}</span><span className={entry.read_at ? 'text-slate-400' : 'font-bold text-[var(--ui-secondary)]'}>{entry.read_at ? 'Прочитано' : '● Не прочитано'}</span></button>)}
      </div>
    </div>
    {selected && <article ref={articleRef} aria-label="Открытая запись" className="rounded-2xl border border-slate-600 bg-[#20253b] p-4">
      <p className="text-[11px] font-bold text-[var(--ui-secondary)]">{selected.category === 'story' ? `Глава ${selected.content.season} · ${STORY_SEASONS[(selected.content.season ?? 1) - 1] ?? 'История'}` : selected.content.sender}</p>
      <h3 className="mt-1 text-sm font-bold">{selected.content.title}</h3>
      <p className="mt-2 text-xs leading-relaxed">{selected.content.text}</p>
      {selected.category === 'city' && selected.reply && <p className="mt-3 rounded-lg bg-black/20 p-2 text-xs">Твой ответ: {selected.reply === 'careful' ? 'Проверим осторожно' : 'Работаем по плану'}<br />{selected.reply === 'careful' ? selected.content.carefulReply : selected.content.focusedReply}</p>}
      {selected.category === 'city' && !selected.reply && <p className="mt-3 text-[11px] text-slate-400">Сохранённого ответа пока нет.</p>}
      {saving && <p className="mt-2 text-[11px] text-slate-400">Сохраняем отметку…</p>}
      <button type="button" onClick={() => setSelectedKey(null)} className="mt-3 min-h-[40px] rounded-lg border border-slate-500 px-3 text-xs font-bold">Закрыть запись</button>
    </article>}
  </section>;
};
