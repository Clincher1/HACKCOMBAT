import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArchiveEntry } from '../../shared/operatorArchive';
import { RETURN_CASE_NAME, getReturnCaseProgress } from '../../shared/returnTrace.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import { STORY_SEASONS } from '../../shared/story.config';
import { gameApi } from '../lib/api';

export const ArchivePage: React.FC = () => {
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [tab, setTab] = useState<'story' | 'city'>('story');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [caseAvailable, setCaseAvailable] = useState(false);
  const [caseAttempted, setCaseAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (selectedKey) articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [selectedKey]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await gameApi.archiveSync(); setEntries(result.entries); setCaseAvailable(result.caseAvailable === true); setCaseAttempted(result.caseAttempted === true); }
    catch { setError('Не удалось загрузить архив. Проверь соединение и открой игру через Telegram.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const caseEntries = entries.filter(entry => entry.entry_key.startsWith('case:')).sort((a,b) => a.position-b.position);
  const legacy = entries.filter(entry => entry.entry_key.startsWith('story:')).sort((a,b) => a.position-b.position);
  const city = entries.filter(entry => entry.category === 'city').sort((a,b) => a.position-b.position);
  const progress = getReturnCaseProgress(new Set(caseEntries.map(entry => entry.entry_key)));
  const targets = progress.next ? MISSIONS_CONFIG.filter(m => (progress.next!.missions as readonly string[]).includes(m.key)) : [];
  const selected = entries.find(entry => entry.entry_key === selectedKey);
  const read = async (entry: ArchiveEntry) => {
    setSelectedKey(entry.entry_key);
    if (entry.read_at) return;
    setSaving(true); setError('');
    try { const saved = (await gameApi.archiveRead(entry.entry_key)).entry; setEntries(current => current.map(item => item.entry_key === saved.entry_key ? saved : item)); }
    catch { setError('Запись открыта, но отметку не удалось сохранить. Нажми на запись ещё раз.'); }
    finally { setSaving(false); }
  };
  const list = (items: ArchiveEntry[]) => <div className="mt-2 space-y-1.5" aria-label="Записи архива">{items.map(entry => <button key={entry.entry_key} type="button" disabled={saving} aria-current={selectedKey === entry.entry_key ? 'true' : undefined} onClick={() => void read(entry)} className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-slate-600 bg-black/20 px-3 py-2 text-left text-xs aria-current:border-[var(--ui-secondary)] disabled:opacity-60"><span className="flex-1">{entry.content.title}</span><span className={entry.read_at ? 'text-slate-400' : 'font-bold text-[var(--ui-secondary)]'}>{entry.read_at ? 'Прочитано' : '● Не прочитано'}</span></button>)}</div>;
  return <section aria-label="Архив оператора" className="space-y-3 pb-4 text-slate-100">
    <Link to="/" className="inline-block text-xs text-[var(--ui-secondary)] underline">← На рабочий стол</Link>
    <div className="rounded-2xl border border-[rgba(var(--ui-secondary-rgb),0.6)] bg-[#20253b] p-4">
      <h2 className="text-base font-extrabold">Архив оператора</h2>
      <p className="mt-1 text-xs text-slate-300">Записи и отметки сохраняются в аккаунте. Просмотры до появления архива восстановить нельзя.</p>
      <div className="mt-3 flex gap-2" role="group" aria-label="Раздел архива">
        {([['story','Расследования'], ['city','Городская смена']] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => {setTab(key); setSelectedKey(null); setError('');}} className="min-h-[42px] rounded-lg border border-slate-500 px-3 text-xs font-bold aria-pressed:border-[var(--ui-secondary)] aria-pressed:bg-[rgba(var(--ui-secondary-rgb),0.18)]">{label}</button>)}
      </div>
      {loading && <p className="mt-3 text-xs">Загружаем архив…</p>}
      {error && <div role="alert" className="mt-3 rounded-lg border border-rose-400/60 p-2 text-xs text-rose-200">{error} <button type="button" onClick={() => void load()} className="underline">Повторить загрузку</button></div>}
      {tab === 'story' && !loading && <>
        {caseAvailable ? <div className="mt-3 rounded-xl border border-[rgba(var(--ui-secondary-rgb),0.6)] bg-black/20 p-3">
          <h3 className="text-sm font-extrabold">● Дело «{RETURN_CASE_NAME}»</h3>
          <p className="mt-1 text-[11px] text-slate-300">{progress.next ? `Улик собрано: ${progress.completed}/3 · ${progress.next.goal}` : 'Дело завершено · 3/3 улики'}</p>
          {progress.next && <><p className="mt-2 text-xs leading-relaxed">Нужен успех в одном из контрактов: <strong>{targets.map(m => m.targetName).join(' или ')}</strong>.</p>
            <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Частичный результат и провал не дают улику. Подходящие старые успешные контракты тоже учитываются. Цели зависят от уровня и текущего скана.</p>
            {caseAttempted && <p className="mt-1 text-[10px] text-amber-300">Есть частичная или неудачная попытка. Повтори контракт или выбери другую цель.</p>}
            <Link to="/hacks" className="mt-2 inline-block text-xs font-bold text-[var(--ui-secondary)] underline">К контрактам</Link></>}
          {list(caseEntries)}
        </div> : <div role="status" className="mt-3 text-xs text-amber-200">Не удалось обновить расследование. Уже сохранённые сцены доступны ниже. <button type="button" onClick={() => void load()} className="underline">Повторить</button>{list(caseEntries)}</div>}
        <details className="mt-3 rounded-xl border border-slate-600 p-3"><summary className="cursor-pointer text-xs font-bold">Прежние записи · {legacy.length}</summary><p className="mt-1 text-[10px] text-slate-400">Старый сюжет и отметки сохранены.</p>{list(legacy)}</details>
      </>}
      {tab === 'city' && !loading && <><p className="mt-3 text-[11px] text-slate-300">Все 14 сообщений можно перечитать; сообщение дня меняется во «Взломах».</p>{list(city)}</>}
    </div>
    {selected && <article ref={articleRef} aria-label="Открытая запись" className="rounded-2xl border border-slate-600 bg-[#20253b] p-4">
      <p className="text-[11px] font-bold text-[var(--ui-secondary)]">{selected.entry_key.startsWith('case:') ? `Дело «${RETURN_CASE_NAME}»` : selected.category === 'story' ? `Глава ${selected.content.season} · ${STORY_SEASONS[(selected.content.season ?? 1) - 1] ?? 'История'}` : selected.content.sender}</p>
      <h3 className="mt-1 text-sm font-bold">{selected.content.title}</h3>
      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed">{selected.content.text}</p>
      {selected.category === 'city' && selected.reply && <p className="mt-3 rounded-lg bg-black/20 p-2 text-xs">Твой ответ: {selected.reply === 'careful' ? 'Проверим осторожно' : 'Работаем по плану'}<br />{selected.reply === 'careful' ? selected.content.carefulReply : selected.content.focusedReply}</p>}
      {selected.category === 'city' && !selected.reply && <p className="mt-3 text-[11px] text-slate-400">Сохранённого ответа пока нет.</p>}
      {saving && <p className="mt-2 text-[11px] text-slate-400">Сохраняем отметку…</p>}
      <button type="button" onClick={() => setSelectedKey(null)} className="mt-3 min-h-[40px] rounded-lg border border-slate-500 px-3 text-xs font-bold">Закрыть запись</button>
    </article>}
  </section>;
};
