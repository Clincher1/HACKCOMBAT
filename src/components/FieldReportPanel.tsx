import React, { useState } from 'react';
import { ArrowDown, Radio } from 'lucide-react';
import { getFieldReport, getFieldReportAction } from '../../shared/fieldReports.config';
import type { PlayerState } from '../../shared/types';

type Reply = 'careful' | 'focused';

/** Narrative presentation only: does not create a task, grant a reward or save a choice. */
export const FieldReportPanel: React.FC<{
  player: PlayerState;
  nowMs: number;
  onGoToContracts: (target: 'active' | 'available') => void;
}> = ({ player, nowMs, onGoToContracts }) => {
  const { dayKey, report } = getFieldReport(nowMs);
  const [reply, setReply] = useState<{ dayKey: string; value: Reply } | null>(null);
  const selected = reply?.dayKey === dayKey ? reply.value : null;
  const action = getFieldReportAction(player.activeMissions, nowMs);
  const actionText = action === 'ready' ? 'Контракт готов: проверь результат'
    : action === 'running' ? 'Контракт выполняется: посмотреть ход'
      : 'Выбрать обычный контракт';

  return (
    <section aria-label="Городская смена" className="rounded-2xl border border-[rgba(var(--ui-secondary-rgb),0.65)] bg-gradient-to-br from-[#192535] via-[#21233c] to-[#252b2e] p-3.5 text-slate-100 shadow-[0_0_24px_rgba(var(--ui-secondary-rgb),0.13)]">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--ui-secondary-rgb),0.14)] text-[var(--ui-secondary)]"><Radio className="h-4 w-4" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--ui-secondary)]">● Городская смена · сообщение дня</p>
          <h2 className="mt-1 text-sm font-extrabold text-white">{report.title}</h2>
          <p className="mt-1 text-[11px] font-bold text-slate-300">{report.sender}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-100">{report.message}</p>
          <p className="mt-3 text-[11px] font-semibold text-slate-300">Ответить на сообщение:</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <button type="button" aria-pressed={selected === 'careful'} onClick={() => setReply({ dayKey, value: 'careful' })} className="min-h-[40px] rounded-lg border border-slate-500 bg-black/20 px-2.5 py-2 text-left text-[11px] font-bold text-slate-100 hover:border-[var(--ui-secondary)] aria-pressed:border-[var(--ui-secondary)]">Проверим осторожно</button>
            <button type="button" aria-pressed={selected === 'focused'} onClick={() => setReply({ dayKey, value: 'focused' })} className="min-h-[40px] rounded-lg border border-slate-500 bg-black/20 px-2.5 py-2 text-left text-[11px] font-bold text-slate-100 hover:border-[var(--ui-secondary)] aria-pressed:border-[var(--ui-secondary)]">Работаем по плану</button>
          </div>
          {selected && <p aria-live="polite" className="mt-2 rounded-lg border border-slate-600 bg-black/20 px-2.5 py-2 text-xs leading-relaxed text-slate-200">{selected === 'careful' ? report.carefulReply : report.focusedReply}</p>}
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Ответ — только диалог, он не сохраняется и не влияет на игру. Сообщения меняются каждый день по Москве и повторяются каждые 14 дней (по часам устройства).</p>
          <button type="button" onClick={() => onGoToContracts(action === 'available' ? 'available' : 'active')} className="mt-3 flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--ui-secondary)] px-3 py-2 text-xs font-extrabold text-[#0b0710] hover:brightness-110">{actionText} <ArrowDown className="h-4 w-4" aria-hidden="true" /></button>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">Это история, не отдельное задание. Дополнительной награды нет; обычные контракты работают и оплачиваются по прежним правилам.</p>
        </div>
      </div>
    </section>
  );
};
