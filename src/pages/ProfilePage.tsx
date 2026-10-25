import { Award, BookOpen, Cog, Crown, Edit3, Globe, Scale, Trophy } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  ACHIEVEMENTS_CONFIG,
  PUBLIC_ACHIEVEMENTS_COUNT,
} from '../../shared/achievements.config';
import { AchievementsPanel } from '../components/AchievementsPanel';
import { DonateCard } from '../components/DonateCard';
import { ReferralCard } from '../components/ReferralCard';
import {
  CHIP_DAILY_CAP,
  CHIP_REWARD_PER_DAILY,
  CHIP_REWARD_PER_GREY_MISSION,
  CHIP_REWARD_PER_MISSION,
} from '../../shared/base.config';
import { getGameDayKey, getPrestigeRequiredLevel } from '../../shared/mechanics';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

export const ProfilePage: React.FC = () => {
  const {
    player,
    tgProfile,
    storageMode,
    leaderboard,
    refreshLeaderboard,
    triggerPrestige,
    updateDemoName,
    openTutorial,
    busyKey,
  } = useGame();

  const [tab, setTab] = useState<'leaderboard' | 'achievements'>('leaderboard');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    void refreshLeaderboard();
  }, [refreshLeaderboard, player?.data]);

  if (!player) return null;

  const { derived } = player;

  // Визуальное положение ползунка на шкале «White Hat (0%) <---> Neutral (50%) <---> Black Hat (100%)»
  const alignmentDiff = player.heat - player.rep;
  const alignmentMarkerPct = Math.min(95, Math.max(5, 50 + alignmentDiff * 0.45));

  const requiredPrestigeLevel = getPrestigeRequiredLevel(player.prestigeCount);
  // Дневной счётчик Чипов считаем по тому же игровому дню (Москва), что и сервер:
  // после полуночи показываем 0, даже если сервер ещё не успел обнулить.
  const chipsDayIsToday = player.stats.chipsDayKey === getGameDayKey();
  const chipsToday = chipsDayIsToday
    ? Math.min(CHIP_DAILY_CAP, Math.floor(player.stats.chipsToday ?? 0))
    : 0;
  const chipsLeftToday = Math.max(0, CHIP_DAILY_CAP - chipsToday);
  const canPrestige = derived.level >= requiredPrestigeLevel;
  const publicUnlockedCount = ACHIEVEMENTS_CONFIG.filter(
    (a) => !a.secret && player.achievements.includes(a.key)
  ).length;

  return (
    <div className="space-y-3.5 pb-6">
      {/* Карточка профиля игрока (Ник, Аватар, Ранг) */}
      <div className="rounded-2xl bg-[#10172e] border border-[#00f0ff]/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {tgProfile.photoUrl ? (
              <img
                src={tgProfile.photoUrl}
                alt={player.username}
                loading="lazy"
                className="w-14 h-14 rounded-2xl object-cover border-2 border-[#00f0ff]"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00f0ff]/25 to-[#ff00a0]/25 border border-[#00f0ff]/50 flex items-center justify-center font-display text-xl font-black text-[#00f0ff] shrink-0">
                {player.username.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display text-base font-extrabold text-white truncate">
                  {player.username}
                </h2>
                {!tgProfile.isInsideTelegram && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(player.username);
                      setEditingName((v) => !v);
                    }}
                    className="p-1 text-slate-400 hover:text-[#00f0ff] cursor-pointer"
                    title="Изменить никнейм в превью"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="inline-flex items-center gap-1.5 mt-0.5 px-2 py-0.5 rounded-md bg-[#00f0ff]/12 border border-[#00f0ff]/35 text-[11px] font-bold text-[#00f0ff]">
                <Crown className="w-3 h-3" />
                <span>Ранг: {derived.rankTitle}</span>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
            <span className="text-[10px] px-2 py-0.5 rounded bg-[#0a0e1a] border border-slate-800 text-slate-400">
              {storageMode === 'supabase' ? '🟢 Supabase Cloud' : '⚡ Local Sync'}
            </span>
            <button
              type="button"
              onClick={openTutorial}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00f0ff]/12 border border-[#00f0ff]/35 text-[10px] font-bold text-[#00f0ff] hover:bg-[#00f0ff]/20 cursor-pointer"
            >
              <BookOpen className="w-3 h-3" /> Справка и Билды
            </button>
          </div>
        </div>

        {editingName && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void updateDemoName(draftName);
              setEditingName(false);
            }}
            className="flex gap-2 pt-1"
          >
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              maxLength={24}
              placeholder="Ваш кибер-ник..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#0a0e1a] border border-slate-700 text-xs text-white focus:outline-none focus:border-[#00f0ff]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-[#00f0ff] text-[#061018] font-bold text-xs cursor-pointer"
            >
              Сохранить
            </button>
          </form>
        )}

        {/* Сводка статистики */}
        <div className="grid grid-cols-4 gap-2 pt-1 text-center">
          <div className="rounded-xl bg-[#0a0e1a] p-2 border border-slate-800/80">
            <div className="text-[10px] text-slate-400">Клики</div>
            <div className="text-xs font-bold text-white">{formatCompact(player.totalClicks)}</div>
          </div>
          <div className="rounded-xl bg-[#0a0e1a] p-2 border border-slate-800/80">
            <div className="text-[10px] text-slate-400">Взломы</div>
            <div className="text-xs font-bold text-white">{player.totalMissions}</div>
          </div>
          <div className="rounded-xl bg-[#0a0e1a] p-2 border border-slate-800/80">
            <div className="text-[10px] text-slate-400">Уровень</div>
            <div className="text-xs font-bold text-[#00f0ff]">{derived.level}</div>
          </div>
          <div className="rounded-xl bg-[#0a0e1a] p-2 border border-slate-800/80">
            <div className="text-[10px] text-slate-400">Множитель</div>
            <div className="text-xs font-bold text-[#7dff00]">×{derived.prestigeMultiplier}</div>
          </div>
        </div>

        {/* ⚙️ Чипы (v3.5): раньше их вообще не было видно в профиле — только
            мелкая цифра в верхней панели. Здесь и баланс, и остаток дневного
            лимита, и честное объяснение, откуда они берутся. */}
        <div className="rounded-xl bg-[#0a0e1a] border border-[#7dff00]/30 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#7dff00] flex items-center gap-1">
              <Cog className="w-3.5 h-3.5" /> Чипы — валюта апгрейда
            </span>
            <span className="font-display text-sm font-extrabold text-white">{player.chips}</span>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>выбито сегодня</span>
            <span className={chipsLeftToday === 0 ? 'text-amber-300' : 'text-slate-300'}>
              {chipsToday} / {CHIP_DAILY_CAP}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, (chipsToday / CHIP_DAILY_CAP) * 100)}%`,
                background:
                  chipsLeftToday === 0
                    ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                    : 'linear-gradient(90deg, #7dff00, #00f0ff)',
              }}
            />
          </div>

          <p className="text-[10px] text-slate-400 leading-relaxed">
            Падают только за <strong className="text-slate-300">чистый успех взлома</strong>: +
            {CHIP_REWARD_PER_MISSION} за контракт, +{CHIP_REWARD_PER_GREY_MISSION} за серый, плюс{' '}
            {CHIP_REWARD_PER_DAILY} за ежедневный вход и за часть достижений. Тратятся на открытие
            Тиров карточек (60 / 150 / 320) и на улучшения Базы.
          </p>
          {chipsLeftToday === 0 && (
            <p className="text-[10px] text-amber-300/90">
              Лимит на сегодня выбран — обнулится после полуночи по Москве. Data, XP и Crypto капают
              как обычно.
            </p>
          )}
        </div>

        {/* Опыт и подготовка к взломам */}
        <div className="rounded-xl bg-[#0a0e1a] border border-purple-500/25 p-2.5 space-y-1.5 mt-2">
          <div className="flex items-center justify-between text-[10px] font-bold">
            <span className="text-purple-300">
              XP {formatCompact(derived.xpIntoLevel)} /{' '}
              {derived.xpToNext > 0 ? formatCompact(derived.xpToNext) : 'MAX'}
            </span>
            <span className="text-slate-400">всего {formatCompact(derived.totalXp)} XP</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${
                  derived.xpToNext > 0
                    ? Math.min(100, (derived.xpIntoLevel / derived.xpToNext) * 100)
                    : 100
                }%`,
                background: 'linear-gradient(90deg, #a855f7 0%, #00f0ff 100%)',
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>
              Сила железа: <strong className="text-white">{Math.round(derived.hackPower)}⚡</strong>
            </span>
            <span>
              Провалов: <strong className="text-rose-400">{player.stats.missionFails ?? 0}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Визуальная шкала «White Hat <---> Black Hat» (п. 4.5 и 5.4 ТЗ) */}
      <div className="rounded-2xl bg-[#10172e] border border-slate-800 p-4 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-[#00f0ff]">🛡️ White Hat ({player.rep} Rep)</span>
          <span className="text-[#ff00a0]">🕶️ Black Hat ({player.heat}/100 Heat)</span>
        </div>

        <div className="relative h-3 rounded-full bg-gradient-to-r from-[#00f0ff]/40 via-slate-700 to-[#ff00a0]/50 border border-slate-700">
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-[#0a0e1a] shadow-[0_0_12px_#fff] transition-all duration-300"
            style={{ left: `${alignmentMarkerPct}%` }}
          />
        </div>

        <div className="text-[11px] text-slate-300 bg-[#0a0e1a] rounded-xl p-2.5 border border-slate-800/80">
          {derived.alignment === 'white_hat' ? (
            <span className="text-[#00f0ff] font-semibold">
              Активна ветка <strong>White Hat</strong>: +20% к пассивному Data/час и ×2 награда за
              ликвидацию 🔴 Bad-сайтов!
            </span>
          ) : derived.alignment === 'black_hat' ? (
            <span className="text-[#ff00a0] font-semibold">
              Активна ветка <strong>Black Hat</strong>: +50% Data за каждый клик, но розыск Heat
              растёт быстрее. Не превышайте 100 Heat!
            </span>
          ) : (
            <span className="text-slate-400">
              Для <strong>White Hat</strong> наберите <code>Rep &gt; Heat × 2</code> (мин. 10). Для{' '}
              <strong>Black Hat</strong> — <code>Heat &gt; Rep × 2</code> (мин. 10).
            </span>
          )}
        </div>
      </div>

      {/* Панель Престижа — Global Hack на 50 уровне (п. 3 и 5.5 ТЗ) */}
      <div className="rounded-2xl bg-gradient-to-br from-[#161233] to-[#0f172e] border border-purple-500/40 p-4 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-display text-sm font-extrabold text-white">
            <Globe className="w-4 h-4 text-[#ff00a0]" />
            <span>GLOBAL HACK — ПРЕСТИЖ</span>
          </div>
          <span className="text-xs font-bold text-purple-300">
            Ур. {derived.level} / {requiredPrestigeLevel}
          </span>
        </div>

        <p className="text-[11px] text-slate-300 leading-relaxed">
          На {requiredPrestigeLevel} уровне вы можете перезапустить матрицу: карточки, команда и Data
          обнулятся, но вы навсегда получите{' '}
          <strong>множитель ×{derived.prestigeMultiplier * 2} к доходу</strong>, сохраните все{' '}
          <strong>💎 Crypto, достижения, скины и Rep</strong>!
        </p>

        <button
          type="button"
          disabled={!canPrestige || busyKey === 'prestige'}
          onClick={() => void triggerPrestige()}
          className={`w-full py-2.5 rounded-xl font-display font-extrabold text-xs uppercase tracking-wider transition cursor-pointer ${
            canPrestige
              ? 'bg-gradient-to-r from-[#ff00a0] to-purple-500 text-white shadow-[0_0_24px_rgba(255,0,160,0.45)]'
              : 'bg-[#0a0e1a]/90 text-slate-500 border border-slate-800 cursor-not-allowed'
          }`}
        >
          {canPrestige
            ? `🌐 ЗАПУСТИТЬ GLOBAL HACK (×${derived.prestigeMultiplier * 2} НАВСЕГДА)`
            : `Требуется ${requiredPrestigeLevel} уровень (ещё ${requiredPrestigeLevel - derived.level} ур.)`}
        </button>
      </div>

      {/* Вкладки Лидерборд Топ-100 / Достижения */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setTab('leaderboard')}
          className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
            tab === 'leaderboard'
              ? 'bg-[#00f0ff]/18 border-[#00f0ff] text-[#00f0ff]'
              : 'bg-[#10172e] border-slate-800 text-slate-400'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>Топ-100 Игроков</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('achievements')}
          className={`py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
            tab === 'achievements'
              ? 'bg-[#7dff00]/18 border-[#7dff00] text-[#7dff00]'
              : 'bg-[#10172e] border-slate-800 text-slate-400'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>
            Ачивки ({publicUnlockedCount}/{PUBLIC_ACHIEVEMENTS_COUNT})
          </span>
        </button>
      </div>

      {tab === 'leaderboard' ? (
        <div className="rounded-2xl bg-[#10172e] border border-slate-800 divide-y divide-slate-800/80 overflow-hidden">
          {leaderboard.map((entry, idx) => (
            <div
              key={`${entry.username}-${idx}`}
              className={`px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs ${
                entry.isCurrentUser ? 'bg-[#00f0ff]/12' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-6 text-center font-display font-extrabold ${
                    idx === 0
                      ? 'text-amber-300'
                      : idx === 1
                        ? 'text-slate-200'
                        : idx === 2
                          ? 'text-amber-600'
                          : 'text-slate-500'
                  }`}
                >
                  #{idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-white truncate flex items-center gap-1.5">
                    <span>{entry.username}</span>
                    {entry.isCurrentUser && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#00f0ff] text-[#061018] font-extrabold">
                        ВЫ
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Ур. {entry.level} • {entry.rankTitle}
                  </div>
                </div>
              </div>
              <div className="font-display font-bold text-[#7dff00] shrink-0">
                {formatCompact(entry.data)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <AchievementsPanel />
      )}

      {/* Рефералка: своя ссылка, статистика и правила (v3.5) */}
      <ReferralCard />

      {/* Донат (Telegram Stars): карточка внизу профиля, чтобы не дублировать
          навигацию на рабочем столе и не мешать тапать. */}
      <DonateCard />

      {/* Обязательное уведомление юридической безопасности (раздел 9 ТЗ) */}
      <div className="rounded-xl bg-[#0b1020] border border-slate-800/80 p-3 text-[10px] text-slate-400 leading-relaxed flex items-start gap-2">
        <Scale className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <span>
          <strong className="text-slate-300">Возрастной рейтинг: 12+.</strong> Hacker Kombat —
          вымышленная развлекательная игра. Не обучает реальному взлому и не пропагандирует
          киберпреступность. Все названия организаций, сетей и события полностью выдуманы.
        </span>
      </div>
    </div>
  );
};
