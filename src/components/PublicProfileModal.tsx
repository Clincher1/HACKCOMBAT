import { ExternalLink, Loader2, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { getInventoryItemDefinition } from '../../shared/inventory.config';
import type { PublicProfile } from '../../shared/types';
import { gameApi } from '../lib/api';
import { getProfileFrame } from '../../shared/profileFrames.config';

interface PublicProfileModalProps {
  profileId: string | null;
  onClose: () => void;
}

export const PublicProfileModal: React.FC<PublicProfileModalProps> = ({ profileId, onClose }) => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId) {
      setProfile(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setProfile(null);
    setError(null);
    void gameApi
      .publicProfile(profileId)
      .then((response) => {
        if (!cancelled) setProfile(response.profile);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Профиль недоступен');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, profileId]);

  if (!profileId) return null;

  const frame = getProfileFrame(profile?.profileFrameKey);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Публичный профиль игрока"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-[var(--ui-primary)]/40 bg-[#0b1020] p-4 shadow-[0_0_45px_rgba(var(--ui-primary-rgb),0.22)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-[var(--ui-primary)]" />
            <h2 className="font-display text-sm font-extrabold text-white">Публичный профиль</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-800 p-2 text-slate-400 transition hover:border-slate-600 hover:text-white cursor-pointer"
            aria-label="Закрыть профиль"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--ui-primary)]" />
            Открываем витрину…
          </div>
        ) : error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-center text-xs text-rose-200">
            {error}
          </div>
        ) : profile ? (
          <>
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-slate-800 bg-[#10172e] p-3">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 text-xl font-black"
                style={{ borderColor: frame.accent, background: frame.background, boxShadow: frame.glow }}
              >
                {profile.avatarKey ? getInventoryItemDefinition(`skin:${profile.avatarKey}`)?.icon ?? '🧑‍💻' : '🕶️'}
              </div>
              <div className="min-w-0">
                <div className="truncate font-display text-base font-extrabold text-white">{profile.username}</div>
                <div className="mt-1 text-[11px] font-bold text-[var(--ui-primary)]">
                  Ур. {profile.level} · {profile.rankTitle}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {frame.name} {profile.prestigeCount > 0 ? `· Prestige ×${profile.prestigeCount}` : ''}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div>
                <h3 className="font-display text-xs font-extrabold text-white">Витрина достижений</h3>
                <p className="mt-1 text-[10px] text-slate-500">Владелец открыл эти предметы для просмотра.</p>
              </div>
              <span className="rounded-lg border border-[var(--ui-primary)]/30 px-2 py-1 text-[10px] font-bold text-[var(--ui-primary)]">
                {profile.items.length} предметов
              </span>
            </div>

            {profile.items.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-slate-800 bg-[#10172e] p-5 text-center text-xs text-slate-500">
                Игрок пока ничего не выставил.
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {profile.items.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-2xl border bg-[#10172e] p-2.5"
                    style={{ borderColor: `${item.accent}66` }}
                  >
                    <div className="flex h-16 items-center justify-center rounded-xl bg-black/20 text-3xl">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" loading="lazy" className="h-14 w-14 object-contain" />
                      ) : (
                        <span aria-hidden="true">{item.icon}</span>
                      )}
                    </div>
                    <div className="mt-2 truncate text-xs font-extrabold text-white" title={item.name}>
                      {item.name}
                    </div>
                    <div className="mt-1 text-[9px] leading-relaxed text-slate-400">{item.description}</div>
                    {item.equipped && (
                      <div className="mt-2 text-[9px] font-bold text-emerald-300">Надето на профиле</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};
