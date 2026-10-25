import { Heart, Loader2, ShieldCheck, Star } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { DONATE_TIER_STARS } from '../../shared/donate.config';
import { useGame } from '../context/GameContext';
import { gameApi } from '../lib/api';

// ============================================================================
// «Поддержать проект» (v3.4)
// ----------------------------------------------------------------------------
// Это ДОНАТ, а не магазин: ни Data, ни чипов, ни скинов со статами за звёзды
// не выдаётся. Поэтому донат не ломает баланс и не делает игру pay-to-win.
// Оплата — только Telegram Stars (валюта XTR), счёт создаёт сервер: подменить
// цену из DevTools нельзя.
// ============================================================================

export const DonateCard: React.FC = () => {
  const { tgProfile, pushClientAlert } = useGame();

  const [open, setOpen] = useState(false);
  const [busyStars, setBusyStars] = useState<number | null>(null);
  // Сколько звёзд поддержано в этой сессии (полный список — /paysupport в боте).
  const [supported, setSupported] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);

  const donate = useCallback(
    async (stars: number) => {
      if (busyStars) return;
      setError(null);
      setBusyStars(stars);

      try {
        // Звёзды существуют только внутри Telegram: в браузере-превью донат
        // честно недоступен (иначе это был бы фиктивный платёж).
        if (!tgProfile.isInsideTelegram) {
          setError('Донат работает в Telegram — открой игру через бота.');
          return;
        }

        const res = await gameApi.donateLink(stars);

        // WebApp.openInvoice доступен в Mini Apps 6.1+. Если клиент старый —
        // отправляем в чат с ботом, там те же кнопки.
        const { openInvoice } = await import('@telegram-apps/sdk-react');
        if (!openInvoice.isAvailable()) {
          setError('Обнови Telegram — оплата Stars появится после обновления.');
          return;
        }

        const status = await openInvoice(res.invoiceLink, 'url');
        if (status === 'paid') {
          setJustPaid(true);
          setSupported((prev) => prev + stars);
          pushClientAlert({
            type: 'success',
            title: '❤️ Спасибо за поддержку!',
            message:
              `Ты поддержал проект на ${stars} ⭐. Это не даёт игровых бонусов — ` +
              'просто помогает держать серверы и делать обновления.',
          });
        } else if (status === 'failed') {
          setError('Платёж не прошёл. Звёзды не списаны — попробуй ещё раз.');
        }
        // 'cancelled' и 'pending' — молча: игрок сам закрыл окно оплаты.
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось создать счёт');
      } finally {
        setBusyStars(null);
      }
    },
    [busyStars, pushClientAlert, tgProfile.isInsideTelegram]
  );

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#2a0f1f] to-[#0f172e] border border-[#ff00a0]/35 p-4 space-y-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 cursor-pointer"
      >
        <span className="flex items-center gap-2 font-display text-sm font-extrabold text-white">
          <Heart className="w-4 h-4 text-[#ff00a0]" />
          Поддержать проект
        </span>
        <span className="text-[10px] font-bold text-[#ff8ac0] bg-[#ff00a0]/12 border border-[#ff00a0]/35 px-2 py-0.5 rounded">
          {supported > 0 ? `${supported} ⭐` : 'Telegram Stars'}
        </span>
      </button>

      <p className="text-[11px] text-slate-300 leading-relaxed">
        Игра бесплатная и без платных преимуществ. Если хочется угостить разработчика
        звёздами — сумма уходит на серверы и обновления.{' '}
        <strong className="text-white">Бонусов за донат нет</strong>: ни Data, ни чипов, ни
        скинов со статами.
      </p>

      {open && (
        <>
          <div className="grid grid-cols-4 gap-1.5 pt-0.5">
            {DONATE_TIER_STARS.map((stars) => (
              <button
                key={stars}
                type="button"
                disabled={busyStars !== null}
                onClick={() => void donate(stars)}
                className="py-2 rounded-xl bg-[#0a0e1a] border border-[#ff00a0]/40 text-xs font-bold text-[#ffd75e] hover:bg-[#ff00a0]/12 disabled:opacity-50 disabled:cursor-wait cursor-pointer flex items-center justify-center gap-1"
              >
                {busyStars === stars ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Star className="w-3 h-3 fill-current" />
                )}
                <span>{stars}</span>
              </button>
            ))}
          </div>

          <div className="flex items-start gap-1.5 text-[10px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-[#7dff00] mt-0.5 shrink-0" />
            <span>
              Оплата в Telegram Stars. Возврат — команда <code>/paysupport</code> в боте, условия —{' '}
              <code>/terms</code>.
            </span>
          </div>
        </>
      )}

      {error && <div className="text-[11px] text-rose-300">{error}</div>}
      {justPaid && !error && (
        <div className="text-[11px] text-[#7dff00] font-semibold">
          ❤️ Спасибо! Чек придёт в чат с ботом, там же /paysupport.
        </div>
      )}
    </div>
  );
};
