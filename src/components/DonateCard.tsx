import { CreditCard, Heart, Loader2, ShieldCheck, Star } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DONATE_CARD_NOTE,
  DONATE_TIER_STARS,
  isTelegramLink,
} from '../../shared/donate.config';
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
  // v3.6.6: постоянный итог поддержки с сервера.
  // Раньше показывались только звёзды, оплаченные в ТЕКУЩЕЙ сессии, поэтому
  // после перезапуска в профиле снова красовалось «Telegram Stars» и
  // казалось, что платёж не учли. Теперь читаем итог из базы.
  const [supported, setSupported] = useState(0);
  const [payments, setPayments] = useState(0);
  // v3.6.8: внешний донат «настоящими деньгами» (карта/СБП/ЮMoney).
  // Сервер отдаёт null, пока владелец не задал DONATE_CARD_URL, — тогда
  // карточка выглядит и ведёт себя ровно как раньше.
  const [external, setExternal] = useState<{ url: string; label: string } | null>(null);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);

  const refreshSummary = useCallback(async () => {
    try {
      const info = await gameApi.donateInfo();
      if (!mountedRef.current) return;
      if (info.summary) {
        setSupported(info.summary.stars);
        setPayments(info.summary.count);
      }
      setExternal(info.external ?? null);
    } catch {
      // Профиль не должен ломаться из-за недоступной витрины.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshSummary();
    return () => {
      mountedRef.current = false;
    };
  }, [refreshSummary]);

  /**
   * Вебхук Telegram приходит отдельным запросом и может задержаться на пару
   * секунд. Поэтому после «оплачено» обновляем итог несколько раз, а не один.
   */
  const refreshSummaryAfterPayment = useCallback(async () => {
    for (const delay of [800, 2000, 4000]) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      await refreshSummary();
    }
  }, [refreshSummary]);

  /**
   * Внешняя страница доната открывается в браузере: внутри мини-аппа
   * по правилам Telegram платить можно только Stars.
   */
  const openExternalDonate = useCallback(async (url: string) => {
    const openInBrowser = () => window.open(url, '_blank', 'noopener,noreferrer');
    try {
      if (isTelegramLink(url)) {
        const { openTelegramLink } = await import('@telegram-apps/sdk-react');
        if (openTelegramLink.isAvailable()) {
          openTelegramLink(url);
          return;
        }
        openInBrowser();
        return;
      }
      const { openLink } = await import('@telegram-apps/sdk-react');
      if (openLink.isAvailable()) {
        openLink(url, { tryInstantView: false });
        return;
      }
      openInBrowser();
    } catch {
      openInBrowser();
    }
  }, []);

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
          // Оптимистично прибавляем сразу, затем сверяемся с сервером.
          setSupported((prev) => prev + stars);
          setPayments((prev) => prev + 1);
          void refreshSummaryAfterPayment();
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
    [busyStars, pushClientAlert, refreshSummaryAfterPayment, tgProfile.isInsideTelegram]
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
          {supported > 0 ? `Поддержано ${supported} ⭐` : 'Telegram Stars'}
        </span>
      </button>

      <p className="text-[11px] text-slate-300 leading-relaxed">
        Игра бесплатная и без платных преимуществ. Если хочется угостить разработчика
        звёздами — сумма уходит на серверы и обновления.{' '}
        <strong className="text-white">Бонусов за донат нет</strong>: ни Data, ни чипов, ни
        скинов со статами. Звёзды не превращаются в игровую валюту.
      </p>

      {supported > 0 && (
        <div className="rounded-xl bg-[#0a0e1a] border border-[#ff00a0]/25 px-2.5 py-2 space-y-0.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300">Поддержано всего</span>
            <span className="font-extrabold text-[#ffd75e]">{supported} ⭐</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>Платежей</span>
            <span>{payments}</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed pt-0.5">
            Чек и возврат — команда <code>/paysupport</code> в чате с ботом.
          </p>
        </div>
      )}

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

          {external && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => void openExternalDonate(external.url)}
                className="w-full py-2 rounded-xl bg-[#ff00a0]/12 border border-[#ff00a0]/40 text-[11px] font-bold text-white hover:bg-[#ff00a0]/20 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <CreditCard className="w-3.5 h-3.5 text-[#ff8ac0]" />
                {external.label}
              </button>
              <p className="text-[10px] text-slate-500 leading-relaxed">{DONATE_CARD_NOTE}</p>
            </div>
          )}

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
