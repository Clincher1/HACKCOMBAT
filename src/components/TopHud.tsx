import { BookOpen, Flame, Gift, Palette, Sparkles, Volume2, VolumeX, Zap } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getSkinByKey } from '../../shared/skins.config';
import { useGame } from '../context/GameContext';
import { formatCompact } from '../lib/format';

/**
 * Цвета валют — те же, что в обучении (вкладка «Валюты») и в остальных экранах:
 * Data — циан, Crypto — фиолетовый, Чипы — лайм (⚙️), Rep — изумруд, Heat — роза.
 * Один и тот же цвет везде = игрок узнаёт валюту, не читая подпись.
 */
const CURRENCY_COLORS = {
  data: '#00f0ff',
  crypto: '#c084fc',
  chips: '#7dff00',
  rep: '#34d399',
  heat: '#fb7185',
} as const;

interface CurrencyTileProps {
  glyph: string;
  label: string;
  value: string;
  accent: string;
  hint: string;
  onClick?: () => void;
  muted?: boolean;
}

/**
 * Одна валюта = иконка + подпись + число. Раньше в одной клетке жили Чипы, Rep
 * и Heat без подписей — по шестерёнке невозможно было понять, что это и сколько.
 */
const CurrencyTile: React.FC<CurrencyTileProps> = ({
  glyph,
  label,
  value,
  accent,
  hint,
  onClick,
  muted,
}) => {
  const body = (
    <>
      {/* Число — первым: значок + количество читаются сразу, подпись уточняет. */}
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-[13px] leading-none shrink-0" aria-hidden="true">
          {glyph}
        </span>
        <span
          className={`font-display text-[15px] font-extrabold leading-none tabular-nums truncate ${
            muted ? 'text-slate-400' : 'text-white'
          }`}
        >
          {value}
        </span>
      </div>
      <div
        className="text-[9px] font-bold uppercase tracking-[0.08em] leading-none mt-1 truncate"
        style={{ color: accent }}
      >
        {label}
      </div>
    </>
  );

  const className = `rounded-xl bg-gradient-to-b from-[#141d3a] to-[#0d1428] border px-2 py-1.5 text-left min-w-0 transition ${
    onClick ? 'hover:from-[#1a2548] hover:to-[#101a33] active:scale-[0.98] cursor-pointer' : ''
  }`;
  const style = {
    borderColor: `${accent}55`,
    boxShadow: `inset 0 0 18px ${accent}14`,
  };

  if (!onClick) {
    return (
      <div className={className} style={style} title={hint}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-label={`${label}: ${value}. ${hint}`}
      className={className}
      style={style}
    >
      {body}
    </button>
  );
};

export const TopHud: React.FC = () => {
  const {
    player,
    soundMuted,
    toggleSound,
    setDailyModalOpen,
    setSkinModalOpen,
    openTutorial,
    tutorialUnseen,
    nowMs,
    baseTheme,
  } = useGame();
  const navigate = useNavigate();

  if (!player) return null;

  const { derived } = player;
  const energyPct = Math.min(100, Math.max(0, (player.energy / derived.maxEnergy) * 100));
  const xpPct =
    derived.xpToNext > 0
      ? Math.min(100, Math.max(0, (derived.xpIntoLevel / derived.xpToNext) * 100))
      : 100;
  const equippedSkin = getSkinByKey(player.equippedSkin);

  const dailyAvailable =
    !player.lastDailyClaim ||
    (nowMs - new Date(player.lastDailyClaim).getTime()) / (1000 * 3600) >= 20;

  const heatPct = Math.min(100, Math.max(0, player.heat));
  const heatRisk = player.heat >= 75;

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0a0e1a]/92 border-b border-[#00f0ff]/18 px-3 pt-2.5 pb-2">
      <div className="max-w-xl mx-auto space-y-2">
        {/* Верхняя строка: Уровень/Ранг + быстрые кнопки Бонуса, Скинов и Звука */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-6 h-6 shrink-0 rounded-lg bg-[#0a0e1a] border border-[#00f0ff]/40 flex items-center justify-center text-sm leading-none"
              style={{ boxShadow: `0 0 10px ${equippedSkin?.primaryHex ?? '#00f0ff'}44` }}
              title={equippedSkin?.name ?? 'Аватар'}
            >
              {equippedSkin?.avatarGlyph ?? '🕶️'}
            </div>
            <div className="px-2 py-0.5 rounded-md bg-[#00f0ff]/15 border border-[#00f0ff]/40 text-[#00f0ff] font-display text-xs font-bold shrink-0">
              УР. {derived.level}
            </div>
            <span className="text-xs text-slate-300 truncate font-semibold">
              {derived.rankTitle}
            </span>
            {player.prestigeCount > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-[#ff00a0]/20 border border-[#ff00a0]/45 text-[#ff00a0] text-[10px] font-bold">
                ×{derived.prestigeMultiplier} PRESTIGE
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={openTutorial}
              className="relative flex items-center gap-1 px-2 py-1 rounded-lg bg-[#131b36] hover:bg-[#1a2548] border border-[#00f0ff]/45 text-[#00f0ff] text-xs font-semibold transition cursor-pointer"
              title="Обучение: что качать и как играть"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Обучение</span>
              {tutorialUnseen && (
                <span className="w-2 h-2 rounded-full bg-[#00f0ff] animate-ping absolute -top-0.5 -right-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setDailyModalOpen(true)}
              className="relative flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#131b36] hover:bg-[#1a2548] border border-[#7dff00]/35 text-[#7dff00] text-xs font-semibold transition cursor-pointer"
              title="Ежедневный бонус Crypto"
            >
              <Gift className="w-3.5 h-3.5" />
              <span>Бонус</span>
              {dailyAvailable && (
                <span className="w-2 h-2 rounded-full bg-[#7dff00] animate-ping absolute -top-0.5 -right-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setSkinModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#131b36] hover:bg-[#1a2548] border border-[#ff00a0]/35 text-[#ff00a0] text-xs font-semibold transition cursor-pointer"
              title="Эксклюзивные скины за Crypto"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Скины</span>
            </button>

            <button
              type="button"
              onClick={toggleSound}
              aria-label="Переключить звук"
              className="p-1.5 rounded-lg bg-[#131b36] hover:bg-[#1a2548] border border-slate-700/70 text-slate-300 transition cursor-pointer"
            >
              {soundMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5 text-[#00f0ff]" />}
            </button>
          </div>
        </div>

        {/* Опыт: уровень качается только взломами */}
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-bold text-[#c084fc] uppercase tracking-wider">
              XP {formatCompact(derived.xpIntoLevel)} / {derived.xpToNext > 0 ? formatCompact(derived.xpToNext) : 'MAX'}
            </span>
            <span className="text-slate-400">
              сила железа {Math.round(derived.hackPower)}⚡
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#090d19] border border-slate-800 p-[1px] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${xpPct}%`,
                background: 'linear-gradient(90deg, #a855f7 0%, #00f0ff 100%)',
                boxShadow: '0 0 8px rgba(168, 85, 247, 0.5)',
              }}
            />
          </div>
        </div>

        {/* Валюты: у каждой своя иконка и подпись. Чипы (⚙️) — отдельная
            клетка, как в обучении: сразу видно и значок, и количество. */}
        <div className="grid grid-cols-4 gap-1.5">
          <div
            className="col-span-2 rounded-xl bg-gradient-to-b from-[#141d3a] to-[#0d1428] border px-2 py-1.5 min-w-0"
            style={{
              borderColor: `${CURRENCY_COLORS.data}55`,
              boxShadow: `inset 0 0 18px ${CURRENCY_COLORS.data}14`,
            }}
            title="Data — главная валюта: покупки, апгрейды, команда"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="font-display text-[15px] font-extrabold text-white leading-none tabular-nums truncate">
                {formatCompact(Math.floor(player.data))}
              </span>
              {/* Цвет прироста — из темы: у женской мягкая мята вместо кислотного лайма */}
              <span
                className="text-[9px] font-bold shrink-0 whitespace-nowrap"
                style={{ color: baseTheme.ui.successHex }}
              >
                +{formatCompact(derived.dataPerHour)}/ч
              </span>
            </div>
            <div
              className="text-[9px] font-bold uppercase tracking-[0.08em] leading-none mt-1 flex items-center gap-1"
              style={{ color: CURRENCY_COLORS.data }}
            >
              <Sparkles className="w-2.5 h-2.5 shrink-0" />
              Data
            </div>
          </div>

          <CurrencyTile
            glyph="💎"
            label="Crypto"
            value={String(player.crypto)}
            accent={CURRENCY_COLORS.crypto}
            hint="Crypto — премиум-валюта: скины стола и косметика. Нажми, чтобы открыть магазин"
            onClick={() => setSkinModalOpen(true)}
            muted={player.crypto === 0}
          />

          <CurrencyTile
            glyph="⚙️"
            label="Чипы"
            value={String(player.chips)}
            accent={CURRENCY_COLORS.chips}
            hint="Чипы — открывают Тиры карточек и улучшения Базы. Нажми, чтобы перейти в «Улучшения»"
            onClick={() => navigate('/upgrades')}
            muted={player.chips === 0}
          />
        </div>

        {/* Rep (репутация) — валюта, ей нужна своя клетка. Heat — не валюта,
            а шкала риска: она полосой рядом, чтобы не путать с балансом.
            Оба в одну строку — панель не должна съедать экран. */}
        <div className="grid grid-cols-4 gap-1.5">
          <div
            className="rounded-xl bg-[#10172e] border px-2 py-1 flex items-center justify-between gap-1 min-w-0"
            style={{ borderColor: `${CURRENCY_COLORS.rep}55` }}
            title="Rep — репутация: найм элитной команды и мирная ветка White Hat"
          >
            <span
              className="text-[9px] font-bold uppercase tracking-[0.06em] leading-none truncate"
              style={{ color: CURRENCY_COLORS.rep }}
            >
              🛡️ Rep
            </span>
            <span className="font-display text-[13px] font-extrabold text-white leading-none tabular-nums shrink-0">
              {formatCompact(player.rep)}
            </span>
          </div>

          <div
            className="col-span-3 rounded-xl bg-[#10172e] border px-2 py-1 flex items-center gap-2 min-w-0"
            style={{
              borderColor: heatRisk ? 'rgba(251, 113, 133, 0.55)' : 'rgba(255, 0, 160, 0.32)',
            }}
            title="Heat (розыск): чем выше, тем ближе блокировка кликов. Штраф при 100"
          >
            <span
              className={`text-[10px] font-bold leading-none flex items-center gap-1 shrink-0 ${
                heatRisk ? 'text-rose-400' : 'text-[#ff00a0]'
              }`}
            >
              <Flame className={`w-3 h-3 ${heatRisk ? 'animate-pulse' : ''}`} />
              Heat {player.heat}/100
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden min-w-6">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${heatPct}%`,
                  background: heatRisk
                    ? 'linear-gradient(90deg, #fb7185, #ef4444)'
                    : 'linear-gradient(90deg, #ff00a0, #fb7185)',
                }}
              />
            </div>
            <span
              className={`text-[9px] font-bold uppercase leading-none shrink-0 ${
                heatRisk ? 'text-rose-300' : 'text-slate-500'
              }`}
            >
              {heatRisk ? 'риск' : 'норма'}
            </span>
          </div>
        </div>

        {/* Шкала CPU Energy (восстановление 1 Energy / 3 сек) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 font-semibold text-[#00f0ff]">
              <Zap className="w-3.5 h-3.5 fill-[#00f0ff]/30" />
              CPU Charge: {player.energy} / {derived.maxEnergy}
            </span>
            <span className="text-slate-400 text-[10px]">
              Тап: +{formatCompact(derived.clickPower)} Data • +1⚡/3с
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#090d19] border border-slate-800 p-[1px] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${energyPct}%`,
                background: 'linear-gradient(90deg, #00f0ff 0%, #7dff00 100%)',
                boxShadow: '0 0 10px rgba(0, 240, 255, 0.55)',
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
