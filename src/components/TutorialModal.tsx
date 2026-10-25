import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  ChevronRight,
  Cpu,
  Crosshair,
  Flame,
  Gem,
  Globe,
  Shield,
  Sparkles,
  Users,
  X,
  Zap,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { triggerHapticSelection } from '../lib/telegram';

type GuideTab = 'currencies' | 'upgrades' | 'hacks' | 'team' | 'endgame';

const TABS: { id: GuideTab; short: string; icon: React.ReactNode }[] = [
  { id: 'currencies', short: 'Валюты', icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'upgrades', short: 'Что качать', icon: <Cpu className="w-3.5 h-3.5" /> },
  { id: 'hacks', short: 'Взломы', icon: <Crosshair className="w-3.5 h-3.5" /> },
  { id: 'team', short: 'Команда', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'endgame', short: 'Престиж', icon: <Globe className="w-3.5 h-3.5" /> },
];

export const TutorialModal: React.FC = () => {
  const { player, tutorialModalOpen, closeTutorial, trackEvent } = useGame();
  const [activeTab, setActiveTab] = useState<GuideTab>('currencies');
  const navigate = useNavigate();

  // Достижения «Прилежный Студент» и «Перечитал Мануал»: сообщаем серверу главы Академии
  useEffect(() => {
    if (!tutorialModalOpen) return;
    trackEvent('tutorial_open');
  }, [tutorialModalOpen, trackEvent]);

  useEffect(() => {
    if (!tutorialModalOpen) return;
    trackEvent(`tutorial_tab:${activeTab}`);
  }, [activeTab, tutorialModalOpen, trackEvent]);

  if (!player) return null;

  const jumpTo = (route: string) => {
    closeTutorial();
    navigate(route);
  };

  return (
    <AnimatePresence>
      {tutorialModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
          onClick={closeTutorial}
        >
          <motion.div
            initial={{ scale: 0.93, y: 18 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.93, y: 18 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl bg-[#0e152b] border border-[#00f0ff]/45 shadow-[0_0_50px_rgba(0,240,255,0.22)] overflow-hidden"
          >
            {/* Шапка Академии */}
            <div className="px-4 py-3.5 bg-gradient-to-r from-[#111c3a] to-[#161332] border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#00f0ff]/15 border border-[#00f0ff]/45 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4 text-[#00f0ff]" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display font-extrabold text-sm sm:text-base text-white truncate">
                    Академия HACKER KOMBAT
                  </h2>
                  <p className="text-[11px] text-slate-400 truncate">
                    Полное руководство: что качать и как выйти в Топ-100
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeTutorial}
                className="p-1.5 rounded-lg bg-[#0a0e1a]/70 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Закрыть обучение"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Переключатель 5 разделов гайда */}
            <div className="grid grid-cols-5 gap-1 p-2 bg-[#0a0e1a] border-b border-slate-800/90 shrink-0">
              {TABS.map((t) => {
                const active = t.id === activeTab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      triggerHapticSelection();
                      setActiveTab(t.id);
                    }}
                    className={`py-2 px-1 rounded-xl flex flex-col items-center gap-1 text-[10px] font-bold transition cursor-pointer ${
                      active
                        ? 'bg-[#00f0ff]/20 border border-[#00f0ff]/60 text-[#00f0ff]'
                        : 'text-slate-400 hover:text-white border border-transparent'
                    }`}
                  >
                    {t.icon}
                    <span className="truncate max-w-full">{t.short}</span>
                  </button>
                );
              })}
            </div>

            {/* Контент выбранной вкладки */}
            <div className="p-4 overflow-y-auto space-y-3 text-xs leading-relaxed text-slate-300">
              {activeTab === 'currencies' && (
                <>
                  <div className="rounded-xl bg-[#00f0ff]/10 border border-[#00f0ff]/30 p-3 space-y-1">
                    <div className="font-display font-bold text-[#00f0ff] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" /> 1. DATA — Главная валюта прогресса
                    </div>
                    <p>
                      Добывается кликами по кнопке <strong>HACK</strong>, пассивным майнингом{' '}
                      <strong className="text-[#7dff00]">Data/час</strong> (работает даже когда игра
                      закрыта — копилка до <strong>24 часов оффлайн</strong>!) и контрактами во
                      вкладке «Взломы». Тратится на все 48 карточек улучшений и стартовых NPC.
                    </p>
                  </div>

                  <div className="rounded-xl bg-purple-500/10 border border-purple-400/30 p-3 space-y-1">
                    <div className="font-display font-bold text-purple-300 flex items-center gap-1.5">
                      <Gem className="w-4 h-4" /> 2. CRYPTO (💎) — Редкая премиум-валюта
                    </div>
                    <p>
                      Даётся за <strong>ежедневный бонус (Дни 1–7)</strong>, 24 достижения и
                      секретные «серые» миссии. <strong>Совет профи:</strong> копи Crypto в первую
                      очередь на <strong>Скины стола</strong> — они остаются с тобой{' '}
                      <strong>навсегда</strong> даже после Престижа и дают вечный бонус до{' '}
                      <strong>+22% к силе тапа</strong>!
                    </p>
                  </div>

                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/30 p-3 space-y-1">
                    <div className="font-display font-bold text-emerald-300 flex items-center gap-1.5">
                      <Shield className="w-4 h-4" /> 3. REP (🛡️ Репутация) — Валюта элиты
                    </div>
                    <p>
                      Растёт при ликвидации мошеннических <strong>🔴 Bad</strong>-целей. Нужна для
                      найма лучших специалистов команды (<em>Fence, Analyst, AI Architect, Спектр</em>)
                      и активации мирной ветки <strong>White Hat (+20% Data/час)</strong>.
                    </p>
                  </div>

                  <div className="rounded-xl bg-rose-500/10 border border-rose-500/40 p-3 space-y-1">
                    <div className="font-display font-bold text-rose-300 flex items-center gap-1.5">
                      <Flame className="w-4 h-4" /> 4. HEAT (🔥 Розыск) — Опасный перегрев!
                    </div>
                    <p>
                      Растёт от взлома крупных корпораций (<strong>🟢 Good</strong>) и покупки
                      карточек <strong>Darknet</strong>. Даёт доступ к ветке{' '}
                      <strong>Black Hat (+50% к клику)</strong>, но будь осторожен:{' '}
                      <strong className="text-rose-200">
                        если Heat превысит 100 — сработает Киберпатруль (-10% от текущей Data и
                        блокировка кликов на 60 сек)!
                      </strong>
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#0a0e1a] border border-slate-800 p-3">
                    <strong className="text-white">⚡ CPU Charge (Энергия):</strong> 1 клик тратит 1
                    энергию. Восстанавливается сама (<strong>+1⚡ каждые 3 сек</strong>). Стартовый
                    запас <code>1000</code> разгоняется карточками <strong>Comfort</strong> вплоть до{' '}
                    <code>5000</code>!
                  </div>
                </>
              )}

              {activeTab === 'upgrades' && (
                <>
                  <div className="rounded-xl bg-[#0a0e1a] border border-[#00f0ff]/35 p-3">
                    <div className="font-bold text-white mb-1">
                      📐 Главное правило уровня игрока:
                    </div>
                    <p>
                      <strong className="text-[#00f0ff]">Уровень = опыт.</strong> XP дают только
                      взломами — карточки больше не повышают уровень. Каждые <strong>5 уровней</strong>{' '}
                      визуально эволюционирует рабочий стол, на <strong>10 уровне</strong> открывается
                      второй слот миссий, а на <strong>20</strong> — третий. Команда и питомцы
                      требуют <strong>12–20 уровня</strong>, поэтому «прыгнуть» в эндгейм нельзя.
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#0a0e1a] border border-[#ff00a0]/35 p-3">
                    <div className="font-bold text-[#ff00a0] mb-1">
                      ⚙️ Чипы и Тира — почему нельзя «раскачаться» за час
                    </div>
                    <p>
                      У каждой карточки теперь <strong>до 60 уровней</strong>, но потолок открывается
                      <strong> Тиром</strong>: Тир I — 15, Тир II — 30, Тир III — 45, Тир IV — 60.
                      Тиры стоят <strong>⚙️ Чипы</strong>, а Чипы падают{' '}
                      <strong>только за контракты</strong>: +1 за чистый успех, +2 за серый, +3 за
                      ежедневный вход и за часть достижений. Больше{' '}
                      <strong>45 Чипов в сутки</strong> выбить нельзя — баланс и остаток лимита
                      всегда видны в профиле.
                      Плюс действует <strong>глобальный индекс цен</strong>: чем больше суммарных
                      уровней у тебя уже есть, тем дороже следующий апгрейд. Поэтому прогресс плавный,
                      а не «полтинник за неделю».
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="rounded-xl bg-[#101935] border border-cyan-500/30 p-3">
                      <div className="font-bold text-[#00f0ff]">
                        🖥️ Этап 1 (Ур. 1–10): Старт — Hardware + Comfort
                      </div>
                      <p className="mt-1">
                        Начни с дешёвых карт <strong>Мех. Клавиатура</strong> и{' '}
                        <strong>Монитор IPS</strong> (чтобы каждый клик давал больше Data) и сразу
                        подтягивай <strong>Comfort</strong> (<em>Кибер-кресло, Кофеварка</em>) — они
                        расширяют бак энергии и дешёво дают уровни игрока.
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#101935] border border-[#7dff00]/30 p-3">
                      <div className="font-bold text-[#7dff00]">
                        🤖 Этап 2 (Ур. 10–25): Автономный доход — Software + Команда
                      </div>
                      <p className="mt-1">
                        Качай <strong>Software</strong> (<em>Ботнет, Эксплойт-пак, ИИ-ассистент</em>)
                        для мощного пассивного фарма <strong>Data/час</strong>. Быстро добей{' '}
                        <strong>20 уровень</strong> (100 суммарных апгрейдов дешёвых карт), чтобы
                        фармить по <strong>3 миссии за раз</strong>!
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#101935] border border-rose-500/30 p-3">
                      <div className="font-bold text-rose-300">
                        🔥 Этап 3 (Ур. 25–60+): Мегапроекты и Darknet
                      </div>
                      <p className="mt-1">
                        Карты <strong>Darknet</strong> дают <strong>самый огромный доход в игре</strong>{' '}
                        (вплоть до миллионов Data/ч на <em>«Левиафане»</em>), но прибавляют{' '}
                        <code>+Heat</code> при покупке. Покупай их серией, пока Heat ниже 80–90, и
                        заранее найми <strong>Fence (-20% Heat)</strong>!
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => jumpTo('/upgrades')}
                    className="w-full py-2.5 rounded-xl bg-[#00f0ff]/15 hover:bg-[#00f0ff]/25 border border-[#00f0ff]/50 text-[#00f0ff] font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Перейти в «Улучшения»</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {activeTab === 'hacks' && (
                <>
                  <p>
                    Во вкладке <strong>«Взломы»</strong> каждые 15 минут обновляется скан целей (или
                    мгновенно кнопкой «Обновить»). Награда автоматически растёт вместе с твоим
                    Уровнем и Престижем!
                  </p>

                  <div className="rounded-xl bg-[#0a0e1a] border border-[#7dff00]/35 p-3">
                    <div className="font-bold text-[#7dff00] mb-1">🎲 Взлом не гарантирован</div>
                    <p>
                      У каждой цели есть <strong>сила железа</strong> и базовый шанс успеха. Твой
                      шанс = сила твоих карточек, Базы и команды против этой цели, плюс запас уровня
                      и опыт по такому же классу целей, минус высокий Heat. Провал даёт{' '}
                      <strong>15% опыта</strong> и +50% Heat, частичный результат — половину.
                      Не прыгай на сложные цели: сначала закрой <strong>8–10</strong> обычных
                      контрактов, прокачай железо — и только потом HACK на Тир выше.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <div className="rounded-xl bg-[#0a0e1a] border border-emerald-500/35 p-2.5">
                      <span className="font-bold text-emerald-300">🔴 Bad-цели (Скам и Фишинг):</span>{' '}
                      дают <strong>+Data, много +Rep и 0 Heat</strong>. Лучший выбор для набора
                      Репутации на команду и безопасного фарма!
                    </div>
                    <div className="rounded-xl bg-[#0a0e1a] border border-rose-500/35 p-2.5">
                      <span className="font-bold text-rose-300">🟢 Good-цели (Мегакорпорации):</span>{' '}
                      огромный куш <strong>+++Data</strong>, но <strong>-Rep и высокий +Heat</strong>.
                      Не запускай, если твой Heat уже около 80–90!
                    </div>
                    <div className="rounded-xl bg-[#0a0e1a] border border-slate-700 p-2.5">
                      <span className="font-bold text-slate-200">⚪ Neutral-цели (Блоги и Хабы):</span>{' '}
                      быстрые вылазки на 40–60 сек со средним доходом и минимальным Heat.
                    </div>
                    <div className="rounded-xl bg-purple-950/35 border border-purple-400/40 p-2.5">
                      <span className="font-bold text-purple-300">
                        🟣 Grey-цели (Секретные контракты):
                      </span>{' '}
                      открываются только после найма <strong>Analyst (320 Rep, 18 ур.)</strong> — дают сразу
                      много Data, +Rep и <strong>45–75% шанс выбить 1 💎 Crypto</strong>!
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#101935] border border-slate-700 p-3 space-y-1.5">
                    <div className="font-bold text-white">⚖️ Как работают пути Хакера:</div>
                    <div>
                      • <strong className="text-[#00f0ff]">🛡️ White Hat</strong> (когда{' '}
                      <code>Rep &gt; Heat × 2</code> и <code>Rep ≥ 10</code>):{' '}
                      <strong>+20% к пассивному Data/час</strong> и <strong>×2 награда</strong> за
                      все 🔴 Bad-миссии!
                    </div>
                    <div>
                      • <strong className="text-[#ff00a0]">🕶️ Black Hat</strong> (когда{' '}
                      <code>Heat &gt; Rep × 2</code> и <code>Heat ≥ 10</code>):{' '}
                      <strong>+50% Data за каждый тап</strong>, но розыск Heat растёт на 30% быстрее.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => jumpTo('/hacks')}
                    className="w-full py-2.5 rounded-xl bg-[#ff00a0]/15 hover:bg-[#ff00a0]/25 border border-[#ff00a0]/50 text-[#ff00a0] font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Перейти во «Взломы»</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {activeTab === 'team' && (
                <>
                  <p>
                    В разделе <strong>«Команда»</strong> тебя ждут <strong>8 уникальных NPC</strong>,
                    чьи бонусы складываются и усиливают весь твой аккаунт:
                  </p>
                  <div className="space-y-1.5 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-[#0a0e1a] border border-slate-800">
                      <strong className="text-[#00f0ff]">1. Coder (450 Data)</strong> → бери самым
                      первым для <strong>+5% Data/час</strong>.
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0a0e1a] border border-slate-800">
                      <strong className="text-[#00f0ff]">2. Social Engineer (900 Data)</strong> →{' '}
                      <strong>+10% к силе каждого клика</strong>.
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0a0e1a] border border-slate-800">
                      <strong className="text-[#7dff00]">3. Botmaster (2 200 Data)</strong> →{' '}
                      <strong>Автоклик 1/сек</strong> (фармит за тебя даже оффлайн!).
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0a0e1a] border border-slate-800">
                      <strong className="text-emerald-300">4. Analyst (45 Rep)</strong> →{' '}
                      <strong>ключевой NPC!</strong> Открывает фиолетовые миссии для фарма{' '}
                      <strong>💎 Crypto</strong>.
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0a0e1a] border border-slate-800">
                      <strong className="text-emerald-300">5. Fence (25 Rep)</strong> →{' '}
                      <strong>-20% к приросту Heat</strong> (незаменим для Darknet!).
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#0a0e1a] border border-slate-800">
                      <strong className="text-purple-300">
                        6–8. Cryptographer (65K Data), AI Architect (100 Rep), Спектр (220 Rep)
                      </strong>{' '}
                      → мощнейшие эндгейм-усилители пассива, тапа и автоклика!
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#0a0e1a] border border-[#ff00a0]/35 p-3 space-y-1.5">
                    <div className="font-bold text-[#ff00a0]">🐾 Питомцы-компаньоны</div>
                    <p>
                      Три питомца на вкладке «Команда»: <strong>хомяк «Байт»</strong> (+3% пассива),{' '}
                      <strong>крыса «Глитч»</strong> (+4% к клику) и{' '}
                      <strong>морская свинка «Пиксель»</strong> (−9% Heat, +4% к контрактам).
                      Покупаются один раз и <strong>не сбрасываются Престижем</strong>. Корми их:
                      при сытости 60–100% баф полный, 30–60% — половина, ниже 30% — питомец спит.
                      Стрик кормлений и привязанность (до 10) усиливают баф. Питомцы не умирают.
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#0a0e1a] border border-[#7dff00]/35 p-3 space-y-1.5">
                    <div className="font-bold text-[#7dff00]">🏠 База (вкладка «Улучшения»)</div>
                    <p>
                      10 пассивных покупок по 15 уровней: кофемашина (реген энергии), авто-скрипт
                      (автоклик), ИБП (+к оффлайн-копилке), талисман удачи (шанс Crypto) и другие.
                      Стоят Data + ⚙️ Чипы и <strong>переживают Global Hack</strong> — это твоя
                      постоянная инвестиция в комфорт.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => jumpTo('/team')}
                    className="w-full py-2.5 rounded-xl bg-[#7dff00]/15 hover:bg-[#7dff00]/25 border border-[#7dff00]/50 text-[#7dff00] font-display font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>Открыть «Команду»</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              {activeTab === 'endgame' && (
                <>
                  <div className="rounded-xl bg-gradient-to-br from-purple-950/60 to-[#0a0e1a] border border-purple-500/40 p-3 space-y-1.5">
                    <div className="font-display font-bold text-purple-300">
                      🌐 Многоступенчатый GLOBAL HACK (Престиж)
                    </div>
                    <p>
                      Игра рассчитана на долгую прогрессию из <strong>8 рангов</strong> (от{' '}
                      <em>Script Kiddie</em> до <em>Cyber Overlord</em>) и уровней вплоть до{' '}
                      <strong>97+</strong>!
                    </p>
                    <p>
                      Достигнув <strong>50 уровня</strong> (а затем 60, 70, 80...), ты можешь
                      запустить <strong>Global Hack</strong>: карточки, команда и Data начнут новый
                      виток, но ты <strong>НАВСЕГДА</strong> получишь:
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5 text-slate-200">
                      <li>Вечный удваивающийся множитель дохода (<strong>×2 → ×4 → ×8...</strong>)</li>
                      <li>Эксклюзивный скин стола <strong>Omega Singularity (+22% тап)</strong></li>
                      <li>
                        <strong>100% сохранение</strong> всех твоих <strong>💎 Crypto</strong>,{' '}
                        <strong>достижений</strong>, <strong>купленных скинов</strong> и{' '}
                        <strong>Репутации (Rep)</strong>!
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-xl bg-[#0a0e1a] border border-emerald-500/30 p-3 space-y-1">
                    <div className="font-bold text-emerald-300">
                      ☁️ Облачное сохранение и обновления без вайпов
                    </div>
                    <p>
                      Весь твой прогресс привязан к твоему <strong>Telegram ID</strong> с
                      криптографической проверкой подписи и хранится в облачной БД PostgreSQL — можно
                      играть и с телефона, и с ПК, а все новые обновления игры добавляют контент
                      поверх твоего текущего сохранения!
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Нижняя кнопка */}
            <div className="p-3 bg-[#0a0e1a] border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={closeTutorial}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00f0ff] to-[#00b8ff] text-[#041019] font-display font-extrabold text-xs uppercase tracking-wider cursor-pointer"
              >
                Понятно, за работу! ⚡
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
