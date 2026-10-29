import { Check, Lock, Sparkles } from 'lucide-react';
import React from 'react';
import { getProfileFrame, PROFILE_FRAMES } from '../../shared/profileFrames.config';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

const SHOP_FRAMES = PROFILE_FRAMES.filter((frame) => frame.cryptoCost !== undefined);
const GIFTED_FRAMES = PROFILE_FRAMES.filter((frame) => frame.giftOnly);
const EVENT_FRAMES = PROFILE_FRAMES.filter((frame) => frame.eventKey);
const DEFAULT_FRAME = getProfileFrame('default');

/** Постоянная косметика профиля: не влияет на экономику и переживает Prestige. */
export const ProfileFramesShop: React.FC = () => {
  const { player, busyKey, buyOrEquipProfileFrame } = useGame();
  if (!player) return null;

  const unlocked = new Set(player.stats.unlockedProfileFrames ?? []);
  const equippedKey = player.stats.equippedProfileFrame;
  const hasDefault = !equippedKey;

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-[#00f0ff]/30 bg-gradient-to-br from-[#10172e] via-[#121b36] to-[#17122f] p-3.5">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#00f0ff]/12 text-[#00f0ff] ring-1 ring-[#00f0ff]/25">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-white">Рамки профиля</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Цветные и элитные рамки для профиля и рейтинга. Базовые открываются с 30 уровня, элитные требуют высокого уровня и много Crypto. Все купленные рамки остаются навсегда — даже после Global Hack Престижа.
            </p>
          </div>
        </div>
        <div className="mt-2 rounded-lg border border-amber-300/20 bg-amber-300/5 px-2.5 py-2 text-[10px] leading-relaxed text-amber-100/80">
          Рамки Neon Relay не продаются: они выдаются только после полного прохождения всех целей сезонного ивента.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SHOP_FRAMES.map((frame) => {
          const frameUnlocked = unlocked.has(frame.key);
          const frameEquipped = equippedKey === frame.key;
          const requiredLevel = frame.requiredLevel ?? 30;
          const levelLocked = player.derived.level < requiredLevel;
          const price = frame.cryptoCost ?? 0;
          const canBuy = !levelLocked && (frameUnlocked || player.crypto >= price);
          const busy = busyKey === `profile-frame:${frame.key}`;

          return (
            <div
              key={frame.key}
              className={`rounded-xl border p-2 transition ${
                frameEquipped
                  ? 'border-[#7dff00]/60 bg-[#7dff00]/7 shadow-[0_0_18px_rgba(125,255,0,0.08)]'
                  : 'border-slate-700/80 bg-[#10172e]/90'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 text-lg font-black"
                  style={{
                    borderColor: frame.accent,
                    background: frame.background,
                    boxShadow: frame.glow,
                  }}
                  aria-label={`Предпросмотр рамки ${frame.name}`}
                >
                  ✦
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold leading-tight break-words text-white">{frame.name}</div>
                  <div className="mt-0.5 text-[10px] font-bold text-slate-400">{frame.source}</div>
                </div>
                {frameEquipped && <Check className="h-4 w-4 shrink-0 text-[#7dff00]" />}
              </div>

              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{frame.description}</p>

              <div className="mt-2 flex flex-col items-stretch gap-1.5 text-[10px]">
                <span className={levelLocked ? 'text-amber-300' : 'text-slate-400'}>
                  {levelLocked ? `🔒 Ур. ${requiredLevel}` : `${formatCompact(price)} 💎 Crypto`}
                </span>
                <button
                  type="button"
                  disabled={!canBuy || frameEquipped || busy}
                  onClick={() => void buyOrEquipProfileFrame(frame.key)}
                  className={`w-full rounded-lg px-2 py-1.5 font-extrabold transition ${
                    frameEquipped
                      ? 'cursor-default bg-emerald-950/40 text-emerald-300'
                      : canBuy
                        ? 'cursor-pointer bg-[#00f0ff] text-[#061018] hover:brightness-110'
                        : 'cursor-not-allowed bg-slate-800 text-slate-500'
                  }`}
                >
                  {busy ? 'Обработка…' : frameEquipped ? 'Надето' : frameUnlocked ? 'Надеть' : levelLocked ? <><Lock className="mr-1 inline h-3 w-3" /> Ур. {requiredLevel}</> : `Купить · ${formatCompact(price)} 💎`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {GIFTED_FRAMES.some((frame) => unlocked.has(frame.key)) && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-fuchsia-200">
              Персональные подарки
            </div>
            <div className="mt-1 text-[10px] text-slate-500">
              Эти рамки остаются навсегда: их можно снять и снова надеть в любой момент.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {GIFTED_FRAMES.filter((frame) => unlocked.has(frame.key)).map((frame) => {
              const frameEquipped = equippedKey === frame.key;
              const busy = busyKey === `profile-frame:${frame.key}`;
              const previewUrl = frame.iconUrl ?? frame.avatarUrl;
              return (
                <div
                  key={frame.key}
                  className={`rounded-xl border p-2 transition ${
                    frameEquipped
                      ? 'border-fuchsia-300/70 bg-fuchsia-300/8 shadow-[0_0_18px_rgba(217,70,239,0.12)]'
                      : 'border-fuchsia-200/25 bg-[#171535]/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 text-lg font-black"
                      style={{
                        borderColor: frame.accent,
                        background: frame.background,
                        boxShadow: frame.glow,
                      }}
                      aria-label={`Предпросмотр рамки ${frame.name}`}
                    >
                      {previewUrl ? (
                        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        '✦'
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-extrabold leading-tight break-words text-white">{frame.name}</div>
                      <div className="mt-0.5 text-[10px] font-bold text-fuchsia-200/80">Подарок администратора · навсегда</div>
                    </div>
                    {frameEquipped && <Check className="h-4 w-4 shrink-0 text-fuchsia-200" />}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{frame.description}</p>
                  <div className="mt-2 flex flex-col items-stretch gap-1.5">
                    <span className="text-[10px] text-slate-400">В коллекции навсегда</span>
                    <button
                      type="button"
                      disabled={frameEquipped || busy}
                      onClick={() => void buyOrEquipProfileFrame(frame.key)}
                      className={`w-full rounded-lg px-2 py-1.5 text-[10px] font-extrabold transition ${
                        frameEquipped
                          ? 'cursor-default bg-emerald-950/40 text-emerald-300'
                          : 'cursor-pointer bg-fuchsia-300 text-[#210b2c] hover:bg-fuchsia-200'
                      }`}
                    >
                      {busy ? 'Обработка…' : frameEquipped ? 'Надето' : 'Надеть'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">
            Награды ивента
          </div>
          <div className="mt-1 text-[10px] text-slate-500">Не покупаются за Crypto и не требуют уровня</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {EVENT_FRAMES.map((frame) => {
            const frameUnlocked = unlocked.has(frame.key);
            const frameEquipped = equippedKey === frame.key;
            const busy = busyKey === `profile-frame:${frame.key}`;
            return (
              <div
                key={frame.key}
                className={`rounded-xl border p-2 transition ${
                  frameEquipped
                    ? 'border-amber-300/60 bg-amber-300/8 shadow-[0_0_18px_rgba(255,183,3,0.1)]'
                    : frameUnlocked
                      ? 'border-amber-300/25 bg-[#171535]/80'
                      : 'border-slate-800 bg-[#0a0e1a]/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 text-lg font-black ${!frameUnlocked ? 'opacity-45 grayscale' : ''}`}
                    style={{
                      borderColor: frame.accent,
                      background: frame.background,
                      boxShadow: frameUnlocked ? frame.glow : undefined,
                    }}
                    aria-label={`Предпросмотр рамки ${frame.name}`}
                  >
                    ✦
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-extrabold leading-tight break-words text-white">{frame.name}</div>
                    <div className={`mt-0.5 text-[10px] font-bold ${frameUnlocked ? 'text-amber-200/80' : 'text-slate-500'}`}>
                      {frameUnlocked ? 'Получено за ивент' : 'Награда сезонной операции'}
                    </div>
                  </div>
                  {frameEquipped && <Check className="h-4 w-4 shrink-0 text-amber-300" />}
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{frame.description}</p>
                {frameUnlocked ? (
                  <div className="mt-2 flex flex-col items-stretch gap-1.5">
                    <span className="text-[10px] text-slate-400">Можно надеть сразу после получения</span>
                    <button
                      type="button"
                      disabled={frameEquipped || busy}
                      onClick={() => void buyOrEquipProfileFrame(frame.key)}
                      className={`w-full rounded-lg px-2 py-1.5 text-[10px] font-extrabold transition ${
                        frameEquipped
                          ? 'cursor-default bg-emerald-950/40 text-emerald-300'
                          : 'cursor-pointer bg-amber-300 text-[#211600] hover:bg-amber-200'
                      }`}
                    >
                      {busy ? 'Обработка…' : frameEquipped ? 'Надето' : 'Надеть'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/60 px-2.5 py-1.5 text-[10px] font-bold text-slate-500">
                    <Lock className="h-3 w-3 shrink-0" />
                    Награда за полное прохождение ивента
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`rounded-xl border p-3 ${hasDefault ? 'border-slate-600/80 bg-[#10172e]' : 'border-slate-800 bg-[#0a0e1a]/60'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl border-2 text-sm"
              style={{ borderColor: DEFAULT_FRAME.accent, background: DEFAULT_FRAME.background }}
            >
              ·
            </div>
            <div>
              <div className="text-xs font-bold text-white">Стандартный контур</div>
              <div className="text-[10px] text-slate-500">Без рамки профиля</div>
            </div>
          </div>
          <button
            type="button"
            disabled={hasDefault || busyKey === 'profile-frame:default'}
            onClick={() => void buyOrEquipProfileFrame('default')}
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-[10px] font-bold text-slate-300 transition hover:border-slate-500 disabled:cursor-default disabled:opacity-50"
          >
            {hasDefault ? 'Активно' : 'Снять рамку'}
          </button>
        </div>
      </div>
    </section>
  );
};
