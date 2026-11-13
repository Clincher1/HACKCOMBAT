import { BadgeCheck, Gem, Lock, Shield, Sparkles, Trophy } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { ACHIEVEMENTS_CONFIG } from '../../shared/achievements.config';
import { getDeskStageInfo } from '../../shared/mechanics';
import { PETS_CONFIG } from '../../shared/pets.config';
import { SKINS_CONFIG, resolveEquippedSkins } from '../../shared/skins.config';
import { BASE_THEMES } from '../../shared/themes.config';
import { TEAM_CONFIG } from '../../shared/team.config';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

type CollectionFilter = 'all' | 'trophies' | 'cosmetics' | 'milestones' | 'companions';

type CollectionItem = {
  key: string;
  category: Exclude<CollectionFilter, 'all'>;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  secret?: boolean;
  rarity?: string;
  rarityColor?: string;
  status: string;
  reward?: string;
  source?: string;
  accent: string;
};

const FILTERS: { id: CollectionFilter; label: string }[] = [
  { id: 'all', label: 'Всё' },
  { id: 'trophies', label: 'Трофеи' },
  { id: 'cosmetics', label: 'Косметика' },
  { id: 'milestones', label: 'Рубежи' },
  { id: 'companions', label: 'Союзники' },
];

const RARITY_META: Record<string, { label: string; color: string }> = {
  common: { label: 'Обычное', color: '#94a3b8' },
  rare: { label: 'Редкое', color: '#00f0ff' },
  epic: { label: 'Эпическое', color: '#c084fc' },
  legendary: { label: 'Легендарное', color: '#ffb703' },
  secret: { label: 'Секретное', color: '#ff00a0' },
};

const STAGES: (1 | 5 | 10 | 15 | 20 | 25 | 30)[] = [1, 5, 10, 15, 20, 25, 30];

function costLabel(currency: 'data' | 'crypto' | 'rep', amount: number): string {
  const symbol = currency === 'data' ? 'Data' : currency === 'crypto' ? '💎' : 'Rep';
  return `${formatCompact(amount)} ${symbol}`;
}

function rewardLabel(cryptoReward: number, chipReward?: number, dataReward?: number): string {
  const rewards = [`+${cryptoReward}💎`];
  if (chipReward) rewards.push(`+${chipReward}⚙️`);
  if (dataReward) rewards.push(`+${formatCompact(dataReward)} Data`);
  return rewards.join(' · ');
}

/**
 * Коллекция оператора — read-only слой над уже существующим прогрессом.
 *
 * Здесь намеренно нет новой валюты и отдельной экономики: предметы собираются
 * из achievements, косметики, этапов стола, команды и питомцев, которые уже
 * авторитетно приходят в PlayerState с сервера.
 */
export const CollectionPanel: React.FC = () => {
  const { player, baseTheme } = useGame();
  const [filter, setFilter] = useState<CollectionFilter>('all');

  const items = useMemo<CollectionItem[]>(() => {
    if (!player) return [];

    const achievementItems: CollectionItem[] = ACHIEVEMENTS_CONFIG.map((achievement) => {
      const unlocked = player.achievements.includes(achievement.key);
      const secret = Boolean(achievement.secret);
      const rarity = RARITY_META[achievement.rarity] ?? RARITY_META.common;
      return {
        key: `achievement:${achievement.key}`,
        category: 'trophies',
        title: secret && !unlocked ? 'Секретный трофей' : achievement.title,
        description:
          secret && !unlocked
            ? 'Секретное достижение. Оно откроется само — играй по-своему.'
            : achievement.description,
        icon: secret && !unlocked ? '???' : achievement.icon,
        unlocked,
        secret,
        rarity: rarity.label,
        rarityColor: rarity.color,
        status: unlocked ? 'Получено' : secret ? 'Секрет' : 'Впереди',
        reward: unlocked || !secret
          ? rewardLabel(achievement.cryptoReward, achievement.chipReward, achievement.dataReward)
          : undefined,
        source: 'Награда за достижение',
        accent: rarity.color,
      };
    });

    const themeItems: CollectionItem[] = BASE_THEMES.map((theme) => {
      const active = baseTheme.key === theme.key;
      return {
        key: `theme:${theme.key}`,
        category: 'cosmetics',
        title: theme.name,
        description: theme.tagline,
        icon: theme.glyph,
        unlocked: true,
        status: active ? 'Активна' : 'Бесплатно',
        reward: active ? 'Надето сейчас' : theme.hiddenFromSelection ? 'Тема скрыта из выбора' : 'Можно включить в настройках темы',
        source: 'Бесплатная тема оформления',
        accent: theme.previewFrom,
      };
    });

    const skinItems: CollectionItem[] = SKINS_CONFIG.map((skin) => {
      const unlocked = player.unlockedSkins.includes(skin.key);
      const equipped =
        skin.category === 'desk'
          ? player.equippedSkin === skin.key
          : skin.category === 'ui'
            ? player.stats.equippedUi === skin.key
            : player.stats.equippedAvatar === skin.key;
      const requirement = skin.prestigeRequired
        ? 'Нужен Prestige'
        : skin.requiredLevel && player.derived.level < skin.requiredLevel
          ? `Нужен Ур. ${skin.requiredLevel}`
          : `${skin.cryptoCost} 💎`;
      return {
        key: `skin:${skin.key}`,
        category: 'cosmetics',
        title: skin.name,
        description: skin.description,
        icon: skin.avatarGlyph ?? (skin.category === 'desk' ? '🖥️' : skin.category === 'ui' ? '🎛️' : '🧑‍💻'),
        unlocked,
        status: equipped ? 'Надето' : unlocked ? 'Открыто' : requirement,
        reward: equipped ? 'Активно сейчас' : skin.category === 'desk' ? 'Рабочий стол' : skin.category === 'ui' ? 'Интерфейс' : 'Аватар',
        source: 'Магазин косметики',
        accent: skin.primaryHex,
      };
    });

    const stageItems: CollectionItem[] = STAGES.map((stage) => {
      const info = getDeskStageInfo(stage);
      const unlocked = player.derived.level >= stage;
      const active = player.derived.deskStage === stage;
      return {
        key: `stage:${stage}`,
        category: 'milestones',
        title: unlocked ? info.title : 'Закрытый этап',
        description: unlocked
          ? info.subtitle
          : 'Сцена рабочего стола откроется после достижения этого уровня.',
        icon: unlocked
          ? stage === 30
            ? '🌐'
            : stage >= 15
              ? '🛸'
              : stage >= 10
                ? '🗄️'
                : '🖥️'
          : '🔒',
        unlocked,
        status: active ? 'Текущий этап' : unlocked ? 'Открыто' : `Откроется на Ур. ${stage}`,
        reward: active ? 'Рабочий стол сейчас' : 'Новая сцена стола',
        source: 'Уровень игрока',
        accent: '#00f0ff',
      };
    });

    const prestigeItem: CollectionItem = {
      key: 'prestige:first',
      category: 'milestones',
      title: 'Первый Global Hack',
      description: 'Перезапусти матрицу и получи постоянный престижный множитель.',
      icon: '🌐',
      unlocked: player.prestigeCount > 0,
      status: player.prestigeCount > 0 ? `Пройдено ×${player.prestigeCount}` : 'Впереди',
      reward: 'Множитель, сохранение коллекции и знак Prestige',
      source: 'Global Hack',
      accent: '#ff00a0',
    };

    const teamItems: CollectionItem[] = TEAM_CONFIG.map((npc) => {
      const unlocked = player.team.includes(npc.key);
      const requirement =
        player.derived.level < npc.requiredLevel
          ? `Нужен Ур. ${npc.requiredLevel}`
          : player.totalMissions < npc.requiredMissions
            ? `Нужно ${npc.requiredMissions} контрактов`
            : costLabel(npc.costCurrency, npc.costAmount);
      return {
        key: `team:${npc.key}`,
        category: 'companions',
        title: npc.callsign,
        description: npc.effectLabel,
        icon: '👤',
        unlocked,
        status: unlocked ? 'В команде' : requirement,
        reward: `+${npc.hackPower} силы железа`,
        source: 'Найм специалиста',
        accent: '#7dff00',
      };
    });

    const petItems: CollectionItem[] = PETS_CONFIG.map((pet) => {
      const unlocked = player.pets.some((owned) => owned.key === pet.key);
      const requirement =
        player.derived.level < pet.requiredLevel
          ? `Нужен Ур. ${pet.requiredLevel}`
          : costLabel(pet.costCurrency, pet.costAmount);
      return {
        key: `pet:${pet.key}`,
        category: 'companions',
        title: pet.name,
        description: pet.buffLabel,
        icon: pet.emoji,
        unlocked,
        status: unlocked ? 'В коллекции' : requirement,
        reward: pet.buffLabel,
        source: 'Команда → Питомцы',
        accent: '#c084fc',
      };
    });

    return [
      ...achievementItems,
      ...themeItems,
      ...skinItems,
      ...stageItems,
      prestigeItem,
      ...teamItems,
      ...petItems,
    ];
  }, [baseTheme.key, player]);

  if (!player) return null;

  const publicItems = items.filter((item) => !item.secret);
  const unlockedPublic = publicItems.filter((item) => item.unlocked).length;
  const hiddenSecretsFound = items.filter((item) => item.secret && item.unlocked).length;
  const secretTotal = items.filter((item) => item.secret).length;
  const progressPct = Math.round((unlockedPublic / Math.max(1, publicItems.length)) * 100);
  const visibleItems = filter === 'all' ? items : items.filter((item) => item.category === filter);

  const wallItems: CollectionItem[] = [];
  const addToWall = (item: CollectionItem | undefined) => {
    if (!item || !item.unlocked || wallItems.some((current) => current.key === item.key)) return;
    wallItems.push(item);
  };
  addToWall(items.find((item) => item.key === `stage:${player.derived.deskStage}`));
  addToWall(items.find((item) => item.key === `skin:${player.equippedSkin}`));
  addToWall(items.find((item) => item.key === `theme:${baseTheme.key}`));
  addToWall(items.find((item) => item.key === `skin:${player.stats.equippedUi}`));
  addToWall(items.find((item) => item.key === `skin:${player.stats.equippedAvatar}`));
  items.filter((item) => item.category === 'trophies' && item.unlocked).forEach(addToWall);
  items.filter((item) => item.unlocked).forEach(addToWall);

  return (
    <div className="space-y-3.5">
      <section className="rounded-2xl bg-gradient-to-br from-[#15112f] to-[#10172e] border border-purple-500/35 p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-display font-extrabold text-white">
              <Trophy className="w-4 h-4 text-amber-300 shrink-0" />
              <span>Стена оператора</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Здесь собирается история твоего терминала: трофеи, сцены, косметика и союзники. Это витрина
              прогресса, а не новая боевая валюта.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-display text-sm font-extrabold text-amber-300">
              {unlockedPublic}/{publicItems.length}
            </div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">открыто</div>
          </div>
        </div>

        <div className="h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#00f0ff] via-[#c084fc] to-[#ffb703] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {wallItems.slice(0, 6).map((item) => (
            <div
              key={item.key}
              className="min-w-0 rounded-xl bg-black/20 border p-2.5"
              style={{ borderColor: `${item.accent}66`, boxShadow: `inset 0 0 18px ${item.accent}12` }}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-lg leading-none shrink-0">{item.icon}</span>
                <span className="text-[10px] font-bold text-white truncate">{item.title}</span>
              </div>
              <div className="text-[9px] text-slate-400 mt-1 truncate">{item.status}</div>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 6 - wallItems.length) }).map((_, index) => (
            <div
              key={`empty-wall-${index}`}
              className="rounded-xl border border-dashed border-slate-800 bg-black/10 p-2.5 text-center text-[10px] text-slate-600"
            >
              Трофей ещё впереди
            </div>
          ))}
        </div>

        {secretTotal > 0 && (
          <div className="text-[10px] text-slate-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-pink-400" /> Секретов найдено: {hiddenSecretsFound}/{secretTotal}
          </div>
        )}
      </section>

      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFilter(option.id)}
            className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
              filter === option.id
                ? 'bg-[rgba(var(--ui-primary-rgb),0.16)] border-[var(--ui-primary)] text-[var(--ui-primary)]'
                : 'bg-[#10172e] border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {visibleItems.map((item) => {
          const lockedSecret = item.secret && !item.unlocked;
          return (
            <article
              key={item.key}
              className={`rounded-xl border p-3 flex items-start gap-2.5 transition ${
                item.unlocked
                  ? 'bg-[#101c28]'
                  : lockedSecret
                    ? 'bg-[#0b0f1c] border-slate-800/70'
                    : 'bg-[#0d1224] border-slate-800/80'
              }`}
              style={item.unlocked ? { borderColor: `${item.accent}66` } : undefined}
            >
              <div
                className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-xl border"
                style={{
                  borderColor: item.unlocked ? `${item.accent}88` : '#1e293b',
                  background: item.unlocked ? `${item.accent}18` : '#080d18',
                }}
              >
                {lockedSecret ? <Lock className="w-4 h-4 text-slate-600" /> : item.unlocked ? item.icon : '🔒'}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className={`text-xs font-bold leading-snug ${item.unlocked ? 'text-white' : 'text-slate-300'}`}>
                    {lockedSecret ? '???' : item.title}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.rarity && !lockedSecret && (
                      <span
                        className="theme-accent-text text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/20"
                        style={{ color: item.rarityColor }}
                      >
                        {item.rarity}
                      </span>
                    )}
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        item.unlocked ? 'bg-[#7dff00]/12 text-[#7dff00]' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {lockedSecret ? 'СЕКРЕТ' : item.status}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                  {lockedSecret ? 'Секретный трофей. Откроется во время игры.' : item.description}
                </p>
                {!lockedSecret && (item.source || item.reward) && (
                  <div className={`text-[9px] font-bold mt-1.5 flex items-center gap-1 ${item.unlocked ? 'text-purple-300' : 'text-slate-500'}`}>
                    {item.category === 'trophies' ? <Gem className="w-3 h-3" /> : <BadgeCheck className="w-3 h-3" />}
                    <span className="truncate">
                      {[item.source, item.reward].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {visibleItems.length === 0 && (
        <div className="rounded-xl bg-[#10172e] border border-slate-800 p-5 text-center text-[11px] text-slate-500">
          В этой секции пока ничего нет.
        </div>
      )}

      <div className="rounded-xl bg-[#0b1020] border border-slate-800/80 p-3 text-[10px] text-slate-500 leading-relaxed flex items-start gap-2">
        <Shield className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
        <span>
          Все предметы коллекции читаются из текущего серверного прогресса. Никаких новых покупок,
          случайных лутбоксов или преимуществ за донат здесь нет.
        </span>
      </div>
    </div>
  );
};
