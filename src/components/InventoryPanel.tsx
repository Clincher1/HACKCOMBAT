import { Check, Eye, EyeOff, Lock, Sparkles } from 'lucide-react';
import React, { useMemo } from 'react';
import { getInventoryItemDefinition } from '../../shared/inventory.config';
import { useGame } from '../context/GameContext';

function isEquipped(player: NonNullable<ReturnType<typeof useGame>['player']>, itemKey: string): boolean {
  const item = getInventoryItemDefinition(itemKey);
  if (!item?.equipKey) return false;
  return (
    player.stats.equippedProfileFrame === item.equipKey ||
    player.equippedSkin === item.equipKey ||
    player.stats.equippedUi === item.equipKey ||
    player.stats.equippedAvatar === item.equipKey
  );
}

/** Постоянный инвентарь профиля: сервер возвращает owned/showcase, UI только управляет ими. */
export const InventoryPanel: React.FC = () => {
  const {
    player,
    busyKey,
    setInventoryVisibility,
    buyOrEquipProfileFrame,
    buyOrEquipSkin,
  } = useGame();

  const items = useMemo(
    () =>
      (player?.inventory.ownedKeys ?? [])
        .map((key) => getInventoryItemDefinition(key))
        .filter((item): item is NonNullable<typeof item> => item !== null),
    [player?.inventory.ownedKeys]
  );

  if (!player) return null;

  const showcase = new Set(player.inventory.showcaseKeys);

  const equip = (item: NonNullable<ReturnType<typeof getInventoryItemDefinition>>) => {
    if (!item.equipKey || item.equipAction === null) return;
    if (item.equipAction === 'profile_frame') {
      void buyOrEquipProfileFrame(item.equipKey);
    } else {
      void buyOrEquipSkin(item.equipKey);
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="inventory-title">
      <div className="rounded-2xl border border-[var(--ui-primary)]/35 bg-[var(--ui-panel)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--ui-primary)]" />
              <h2 id="inventory-title" className="font-display text-sm font-extrabold text-white">
                Инвентарь профиля
              </h2>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              Здесь навсегда остаются полученные рамки, награды и будущие призы. Открой глаз у предмета,
              чтобы добавить его в публичную витрину.
            </p>
          </div>
          <div className="shrink-0 rounded-lg border border-[var(--ui-primary)]/30 bg-black/20 px-2 py-1 text-right text-[10px] font-bold text-[var(--ui-primary)]">
            <div>{items.length} предметов</div>
            <div className="text-slate-400">{showcase.size} открыто</div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#10172e] p-5 text-center text-xs text-slate-400">
          Инвентарь синхронизируется…
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {items.map((item) => {
            const isPublic = showcase.has(item.key);
            const equipped = isEquipped(player, item.key);
            const visibilityKey = `inventory:${item.key}:${isPublic ? 'hide' : 'show'}`;
            const equipKey = item.equipKey
              ? item.equipAction === 'profile_frame'
                ? `profile-frame:${item.equipKey}`
                : `skin:${item.equipKey}`
              : '';
            const visibilityBusy = busyKey === visibilityKey;
            const equipBusy = equipKey !== '' && busyKey === equipKey;

            return (
              <article
                key={item.key}
                className={`relative flex min-h-[190px] flex-col overflow-hidden rounded-2xl border bg-[#10172e] p-2.5 transition ${
                  isPublic ? 'border-[var(--ui-primary)]/70 shadow-[0_0_18px_rgba(var(--ui-primary-rgb),0.12)]' : 'border-slate-800'
                }`}
              >
                <button
                  type="button"
                  aria-label={isPublic ? `Скрыть ${item.name} из витрины` : `Выставить ${item.name}`}
                  aria-pressed={isPublic}
                  disabled={visibilityBusy}
                  onClick={() => void setInventoryVisibility(item.key, !isPublic)}
                  className={`absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg border transition cursor-pointer disabled:cursor-wait disabled:opacity-60 ${
                    isPublic
                      ? 'border-[var(--ui-primary)] bg-[rgba(var(--ui-primary-rgb),0.22)] text-[var(--ui-primary)]'
                      : 'border-slate-700 bg-[#0a0e1a]/90 text-slate-500 hover:border-slate-500 hover:text-slate-200'
                  }`}
                  title={isPublic ? 'Убрать из публичной витрины' : 'Выставить в публичную витрину'}
                >
                  {isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>

                <div
                  className="mt-0.5 flex h-20 items-center justify-center rounded-xl border bg-black/20 text-4xl"
                  style={{ borderColor: `${item.accent}66`, boxShadow: `inset 0 0 20px ${item.accent}12` }}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" className="h-16 w-16 object-contain" />
                  ) : (
                    <span aria-hidden="true">{item.icon}</span>
                  )}
                </div>

                <div className="mt-2 min-w-0 flex-1">
                  <div className="truncate text-xs font-extrabold text-white" title={item.name}>
                    {item.name}
                  </div>
                  <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wide" style={{ color: item.accent }}>
                    {item.kind === 'reward' ? 'Памятный приз' : item.kind === 'frame' ? 'Рамка профиля' : item.kind === 'skin' ? 'Косметика' : item.kind === 'achievement' ? 'Достижение' : 'Союзник'}
                  </div>
                  <p className="mt-1 line-clamp-2 min-h-[25px] text-[10px] leading-relaxed text-slate-400">
                    {item.description}
                  </p>
                </div>

                <div className="mt-2 space-y-1.5">
                  {item.usable && item.equipAction !== null && item.equipKey ? (
                    <button
                      type="button"
                      disabled={equipped || equipBusy || visibilityBusy}
                      onClick={() => equip(item)}
                      className={`flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-extrabold transition cursor-pointer disabled:cursor-not-allowed ${
                        equipped
                          ? 'border border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
                          : 'bg-[var(--ui-primary)] text-[#061018] hover:brightness-110'
                      }`}
                    >
                      {equipped ? <Check className="h-3 w-3" /> : null}
                      {equipBusy ? 'Надевание…' : equipped ? 'Надето' : 'Одеть'}
                    </button>
                  ) : (
                    <div className="flex items-center justify-center gap-1 rounded-lg border border-slate-800 bg-[#0a0e1a] px-2 py-1.5 text-[10px] font-bold text-slate-500">
                      <Lock className="h-3 w-3" /> Только показать
                    </div>
                  )}
                  <div className={`text-center text-[9px] font-bold ${isPublic ? 'text-[var(--ui-primary)]' : 'text-slate-600'}`}>
                    {isPublic ? 'Открыто другим игрокам' : 'Скрыто от других игроков'}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
