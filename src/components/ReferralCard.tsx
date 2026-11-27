import { Check, Copy, Gift, Link2, Share2, Users } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { formatCompact } from '../lib/format';
import { gameApi } from '../lib/api';
import { useGame } from '../context/GameContext';

// ============================================================================
// «Пригласи друга» (v3.5)
// ----------------------------------------------------------------------------
// Награда выдаётся не за клик по ссылке, а когда друг реально поиграл 8 минут.
// Поэтому в карточке честно написано правило — это снимает поток вопросов
// «я позвал, а бонуса нет».
// ============================================================================

interface ReferralInfo {
  code: string;
  link: string | null;
  botUsername: string | null;
  stats: { invited: number; qualified: number; xpEarned: number; dataEarned: number };
  rules: string;
  qualifySeconds: number;
  dailyLimit: number;
  weeklyLimit: number;
  /** v5.6: ссылка по Telegram ID и её недельный кап. */
  tgLink?: string | null;
  tgWeeklyCap?: number;
  referralV1?: boolean;
}

export const ReferralCard: React.FC = () => {
  const { tgProfile, pushClientAlert } = useGame();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;

    const refresh = () => {
      void gameApi
        .referralInfo()
        .then((res) => {
          if (alive) setInfo(res as ReferralInfo);
        })
        .catch(() => {
          // Рефералка недоступна — не мешаем играть.
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    };

    refresh();
    // Приглашение может привязаться, пока пригласивший уже держит игру
    // открытой. Обновляем карточку по фокусу и редко по таймеру, чтобы
    // «0 из 0» не оставалось на экране после успешного перехода друга.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      alive = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, []);

  // v5.6: приоритет у ссылки по Telegram ID (?start=ref_<tgId>) — её видно в
  // чате и понятно, кого зовёшь. Кодовая ссылка v3.5 остаётся как резерв
  // (флаг referralV1 выключен или сервер её не выдал).
  const shareLink = info?.tgLink ?? info?.link ?? null;

  const shareText = shareLink
    ? `Залетай в HACKER KOMBAT — киберпанк-кликер в Telegram. Ссылка приглашения внутри ⚡`
    : '';

  const handleShare = useCallback(async () => {
    if (!shareLink) return;
    try {
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(shareText)}`;
      const { openTelegramLink } = await import('@telegram-apps/sdk-react');
      if (openTelegramLink.isAvailable()) {
        openTelegramLink(shareUrl);
        return;
      }
      throw new Error('no-sdk');
    } catch {
      // Вне Telegram или старый клиент — обычный системный шит.
      try {
        if (navigator.share) {
          await navigator.share({ title: 'HACKER KOMBAT', text: shareText, url: shareLink });
          return;
        }
        await navigator.clipboard.writeText(shareLink);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        pushClientAlert({
          type: 'success',
          title: 'Ссылка скопирована',
          message: 'Отправь её другу — награда придёт, когда он сыграет 8 минут.',
        });
      } catch {
        pushClientAlert({
          type: 'warning',
          title: 'Не удалось поделиться',
          message: 'Скопируй ссылку вручную из поля выше.',
        });
      }
    }
  }, [pushClientAlert, shareLink, shareText]);

  const handleCopy = useCallback(async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard может быть недоступен — игрок скопирует вручную.
    }
  }, [shareLink]);

  const invited = info?.stats.invited ?? 0;
  const qualified = info?.stats.qualified ?? 0;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[var(--ui-panel)] to-[var(--ui-panel-deep)] border border-[var(--ui-primary)]/35 p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-display text-[16px] font-extrabold text-white">
          <Users className="w-4 h-4 text-[var(--ui-primary)]" /> Пригласи друга
        </span>
        <span className="text-[11px] font-bold text-[var(--ui-primary)] bg-[var(--ui-primary)]/12 border border-[var(--ui-primary)]/35 px-2 py-0.5 rounded">
          {qualified} из {invited} засчитано
        </span>
      </div>

      <p className="text-[11px] text-slate-300 leading-relaxed">
        За каждого друга, который <strong className="text-white">сыграет 8 минут</strong>: половина
        твоего уровня в XP и час пассивного дохода в Data. Друг получает стартовый бонус.
      </p>

      {loading && <div className="text-[11px] text-slate-500">Готовлю твою ссылку…</div>}

      {!loading && !shareLink && (
        <div className="text-[11px] text-amber-300/90">
          Ссылка станет доступна внутри Telegram — в превью браузера приглашения не работают.
        </div>
      )}

      {shareLink && info && (
        <>
          <div className="flex items-center gap-1.5 rounded-xl bg-[var(--ui-panel-deep)] border border-slate-800 px-2.5 py-2">
            <Link2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-[11px] text-slate-300 truncate flex-1">{shareLink}</span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="p-1 rounded-md text-slate-400 hover:text-[var(--ui-primary)] cursor-pointer shrink-0"
              title="Скопировать ссылку"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[var(--ui-success)]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleShare()}
            className="w-full py-2.5 rounded-xl bg-[var(--ui-primary)] hover:bg-[var(--ui-primary)]/90 text-[var(--ui-on-primary)] font-display font-extrabold text-[13px] uppercase tracking-wider inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" /> Поделиться ссылкой
          </button>

          <div className="grid grid-cols-3 gap-1.5 pt-0.5 text-center">
            <div className="rounded-xl bg-[var(--ui-panel-deep)] border border-slate-800 p-1.5">
              <div className="text-[11px] text-slate-400">Пришло</div>
              <div className="text-[13px] font-bold text-white">{info.stats.invited}</div>
            </div>
            <div className="rounded-xl bg-[var(--ui-panel-deep)] border border-slate-800 p-1.5">
              <div className="text-[11px] text-slate-400">XP</div>
              <div className="text-[13px] font-bold text-[var(--ui-purple)]">{formatCompact(info.stats.xpEarned)}</div>
            </div>
            <div className="rounded-xl bg-[var(--ui-panel-deep)] border border-slate-800 p-1.5">
              <div className="text-[11px] text-slate-400">Data</div>
              <div className="text-[13px] font-bold text-[var(--ui-success)]">
                {formatCompact(info.stats.dataEarned)}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-1.5 text-[11px] text-slate-400">
            <Gift className="w-3.5 h-3.5 text-[var(--ui-primary)] mt-0.5 shrink-0" />
            <span>
              Лимит: {info.dailyLimit} друга в сутки, {info.weeklyLimit} в неделю
              {typeof info.tgWeeklyCap === 'number' ? ` (по личной ссылке — ${info.tgWeeklyCap})` : ''} —
              чтобы рефералка не заменяла игру. Открыть свой код в боте: <code>/invite</code>.
            </span>
          </div>
        </>
      )}

      {tgProfile.isInsideTelegram && !shareLink && !loading && (
        <div className="text-[11px] text-slate-500">
          Если ссылки нет — проверь, что бот настроен (нужен BOT_TOKEN на сервере).
        </div>
      )}
    </div>
  );
};
