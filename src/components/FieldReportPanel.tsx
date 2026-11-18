import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, Radio } from 'lucide-react';
import { getFieldReport, getFieldReportAction } from '../../shared/fieldReports.config';
import type { PlayerState } from '../../shared/types';
import type { ArchiveEntry } from '../../shared/operatorArchive';
import { gameApi } from '../lib/api';

type Reply = 'careful' | 'focused';

/** Narrative presentation only: no task or reward; replies are stored separately. */
export const FieldReportPanel: React.FC<{
  player: PlayerState;
  nowMs: number;
  onGoToContracts: (target: 'active' | 'available') => void;
}> = ({ player, nowMs, onGoToContracts }) => {
  const { index, report } = getFieldReport(nowMs);
  const key = `city:${index + 1}`;
  const [entry, setEntry] = useState<ArchiveEntry | null>(null);
  const [localReply, setLocalReply] = useState<Reply | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const panelRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([item]) => setVisible(item.isIntersecting), { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setEntry(null); setLocalReply(null); setError('');
    void (async () => {
      try {
        const entries = (await gameApi.archiveSync()).entries;
        const found = entries.find(item => item.entry_key === key);
        if (!found) throw new Error('missing');
        if (active) setEntry(found);
      } catch { if (active) setError('Не удалось сохранить сообщение. Проверь соединение и открой игру через Telegram.'); }
    })();
    return () => { active = false; };
  }, [key, attempt]);
  useEffect(() => {
    if (!visible || !entry || entry.entry_key !== key || entry.read_at || error) return;
    let active = true;
    void gameApi.archiveRead(key).then(({ entry: saved }) => {
      if (active) setEntry(current => current?.entry_key === key ? { ...saved, reply: current.reply ?? saved.reply } : current);
    }).catch(() => { if (active) setError('Не удалось сохранить отметку о прочтении.'); });
    return () => { active = false; };
  }, [visible, key, entry?.entry_key, entry?.read_at, error]);
  const selected = entry?.entry_key === key ? entry.reply : localReply;
  const answer = async (value: Reply) => {
    if (!entry) { setLocalReply(value); return; }
    setSaving(true); setError('');
    try { const saved = (await gameApi.archiveReply(key, value)).entry; setEntry(current => current?.entry_key === key ? { ...saved, read_at: current.read_at ?? saved.read_at } : current); }
    catch { setError('Ответ не сохранён. Попробуй ещё раз.'); }
    finally { setSaving(false); }
  };
  const action = getFieldReportAction(player.activeMissions, nowMs);
  const actionText = action === 'ready' ? 'Контракт готов: проверь результат'
    : action === 'running' ? 'Контракт выполняется: посмотреть ход'
      : 'Выбрать обычный контракт';

  return (
    <section ref={panelRef} aria-label="Городская смена" className="rounded-2xl border border-[rgba(var(--ui-secondary-rgb),0.65)] bg-gradient-to-br from-[#192535] via-[#21233c] to-[#252b2e] p-3.5 text-slate-100 shadow-[0_0_24px_rgba(var(--ui-secondary-rgb),0.13)]">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--ui-secondary-rgb),0.14)] text-[var(--ui-secondary)]"><Radio className="h-4 w-4" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ui-secondary)]">● Городская смена · сообщение дня</p>
          <h2 className="mt-1 text-sm font-extrabold text-white">{entry?.content.title ?? report.title}</h2>
          <p className="mt-1 text-[11px] font-bold text-slate-300">{entry?.content.sender ?? report.sender}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-100">{entry?.content.text ?? report.message}</p>
          <p className="mt-3 text-[11px] font-semibold text-slate-300">Ответить на сообщение:</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" aria-pressed={selected === 'careful'} disabled={(!entry && !error) || saving} onClick={() => void answer('careful')} className="min-h-[40px] rounded-lg border border-slate-500 bg-black/20 px-2.5 py-2 text-left text-[11px] font-bold text-slate-100 hover:border-[var(--ui-secondary)] aria-pressed:border-[var(--ui-secondary)]">Проверим осторожно</button>
            <button type="button" aria-pressed={selected === 'focused'} disabled={(!entry && !error) || saving} onClick={() => void answer('focused')} className="min-h-[40px] rounded-lg border border-slate-500 bg-black/20 px-2.5 py-2 text-left text-[11px] font-bold text-slate-100 hover:border-[var(--ui-secondary)] aria-pressed:border-[var(--ui-secondary)]">Работаем по плану</button>
          </div>
          {selected && <p aria-live="polite" className="mt-2 rounded-lg border border-slate-600 bg-black/20 px-2.5 py-2 text-xs leading-relaxed text-slate-200">{selected === 'careful' ? (entry?.content.carefulReply ?? report.carefulReply) : (entry?.content.focusedReply ?? report.focusedReply)}</p>}
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Ответ не влияет на игру. При подключении архива он сохраняется в аккаунте. Сообщения меняются каждый день по Москве и повторяются каждые 14 дней (по часам устройства).</p>
          {saving && <p className="mt-2 text-[10px] text-slate-300">Сохраняем ответ…</p>}
          {error && <p role="alert" className="mt-2 text-[10px] text-rose-200">{error} <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>Повторить</button></p>}
          <button type="button" onClick={() => onGoToContracts(action === 'available' ? 'available' : 'active')} className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--ui-secondary)] px-3 py-2 text-xs font-extrabold text-[#0b0710] hover:brightness-110">{actionText} <ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Это история, не отдельное задание. Дополнительной награды нет; обычные контракты работают и оплачиваются по прежним правилам.</p>
        </div>
      </div>
    </section>
  );
};
