import { Check, ChevronRight, Crosshair, Cpu, Lock, MousePointerClick, Zap } from 'lucide-react';
import React from 'react';
import { isGameplayV3Enabled } from '../../shared/config';
import { getMissionEntryCost, getMissionRewardScale } from '../../shared/hack.config';
import {
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEP_TITLES_V3,
  STARTER_MISSION_MAX_SECONDS,
  onboardingStepCopyV3,
} from '../../shared/onboarding.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import { useGame } from '../context/GameContext';
import {
  isStepComplete,
  pickStarterMissionKey,
  pickUpgradeSuggestion,
  starterMissionDuration,
} from '../lib/onboarding';
import { triggerHapticImpact, triggerHapticNotification } from '../lib/telegram';

/**
 * Онбординг первого сеанса (v5.4).
 *
 * Один экран, одно решение на шаг: тап → первая карточка → короткий контракт.
 * В геймплее v3 (GAMEPLAY_V3) шаг 1 — не тап, а первый контракт: текст, заголовок
 * и главная кнопка берутся из shared-конфига, поэтому в первом кадре игры нет
 * ни слова «тапни», ни кнопки «ТАП». Легаси-ветка (флаг off) не изменилась.
 *
 * Шаги читаются из тех же счётчиков, что меняют сами действия (totalClicks,
 * derived.totalCardLevels, totalMissions/activeMissions), поэтому аналитика
 * остаётся в GameContext — здесь ничего не трекается повторно.
 *
 * Оверлей живёт НАД контентом, но ПОД нижним меню (z-20 против z-30), чтобы
 * залоченные вкладки оставались видны: игрок понимает, что игра больше, чем
 * один экран, но не может утонуть в 30 решениях сразу.
 */
const STEP_TITLES_LEGACY = ['Тап', 'Улучшение', 'Контракт'] as const;

/**
 * Текст шага. Флаг решается один раз на рендер (см. `v3` в компоненте), но
 * функция остаётся чистой и сама смотрит флаг — её же зовёт QA-мост через
 * shared-конфиг, поэтому в тестах проверяется ровно тот текст, что у игрока.
 */
function stepCopy(step: number, seconds: number | null): string {
  if (isGameplayV3Enabled()) return onboardingStepCopyV3(step, seconds);
  if (step <= 1) return 'Тапни по столу — каждый тап приносит Data и опыт.';
  if (step === 2) return 'Купи самую дешёвую карточку — она начнёт зарабатывать сама.';
  return seconds === null
    ? 'Запусти короткий контракт — награда придёт меньше чем через две минуты.'
    : `Запусти контракт на ${seconds} секунд — награда придёт почти сразу.`;
}

export const Onboarding: React.FC = () => {
  const {
    player,
    newPlayerMode,
    onboardingStep,
    tapHack,
    buyCard,
    startMission,
    busyKey,
    lockdownRemainingSec,
  } = useGame();

  const completedCount = React.useRef(0);

  // Гарп: шаг 3 закрывается в GameContext (completeOnboarding + haptic), здесь —
  // шаги 1 и 2. try/catch обязателен: Telegram SDK может отсутствовать в браузере.
  React.useEffect(() => {
    if (!player) return;
    const done = [1, 2, 3].filter((step) => isStepComplete(player, step)).length;
    if (done > completedCount.current) {
      completedCount.current = done;
      try {
        triggerHapticNotification('success');
      } catch {
        // вибро — необязательный бонус
      }
    } else {
      completedCount.current = done;
    }
  }, [player]);

  if (!player || !newPlayerMode) return null;

  const v3 = isGameplayV3Enabled();
  const step = Math.min(Math.max(onboardingStep, 1), ONBOARDING_STEP_COUNT);
  const stepTitles = v3 ? ONBOARDING_STEP_TITLES_V3 : STEP_TITLES_LEGACY;
  const suggestion = pickUpgradeSuggestion(player);
  const starterKey = pickStarterMissionKey(player);
  const starterMission = starterKey ? MISSIONS_CONFIG.find((mission) => mission.key === starterKey) : undefined;
  const starterSeconds = starterMissionDuration(player);
  const busy = busyKey !== null;

  const handleTap = (): void => {
    if (lockdownRemainingSec > 0) return;
    tapHack();
  };

  const handleUpgrade = (): void => {
    if (!suggestion || !suggestion.affordable || busy) return;
    try {
      triggerHapticImpact('light');
    } catch {
      // вибро — необязательный бонус
    }
    buyCard(suggestion.card.key);
  };

  const handleMission = (): void => {
    if (!starterKey || busy) return;
    try {
      triggerHapticImpact('medium');
    } catch {
      // вибро — необязательный бонус
    }
    startMission(starterKey);
  };

  // Вход в контракт считаем тем же shared-кодом, что сервер и витрина взломов.
  const entryCost = starterMission
    ? getMissionEntryCost(
        starterMission,
        Math.round(starterMission.baseDataReward * getMissionRewardScale(player.derived.level))
      )
    : null;
  const tapsToAfford =
    suggestion && !suggestion.affordable
      ? Math.max(1, Math.ceil((suggestion.price - player.data) / Math.max(1, player.derived.clickPower)))
      : 0;
  // При v3 тапа нет: прогресс до карточки считается в Data, а не в «тапах».
  const dataShortfall =
    suggestion && !suggestion.affordable ? Math.max(1, Math.ceil(suggestion.price - player.data)) : 0;

  return (
    <section
      aria-label="Первый заказ"
      className="fixed inset-x-0 top-0 bottom-[68px] z-20 overflow-y-auto bg-[rgba(var(--ui-panel-deep-rgb),0.97)] backdrop-blur-xl"
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-5 px-4 py-6">
        <header className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--ui-primary)]">
            Первый заказ
          </p>
          <h1 className="mt-2 font-display text-xl font-extrabold text-white">
            {v3
              ? stepTitles[step - 1]
              : step === 1
                ? 'Разогрей стол'
                : step === 2
                  ? 'Первое улучшение'
                  : 'Первый контракт'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{stepCopy(step, starterSeconds)}</p>
        </header>

        <div className="rounded-2xl border border-[rgba(var(--ui-primary-rgb),0.28)] bg-[rgba(var(--ui-panel-rgb),0.85)] p-4">
          {step === 1 &&
            (v3 ? (
              <div className="flex flex-col gap-2" data-qa="onboarding-first-contract">
                {starterMission ? (
                  <div className="rounded-xl border border-[rgba(var(--ui-primary-rgb),0.2)] bg-black/20 px-3 py-2.5">
                    <p className="text-sm font-bold text-white">{starterMission.targetName}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{starterMission.description}</p>
                    <p className="mt-1 text-[11px] font-semibold text-[var(--ui-secondary)]">
                      {starterMission.durationSec} сек · до {starterMission.baseDataReward.toLocaleString('ru-RU')} Data
                      {entryCost ? ` · вход ${entryCost.energy} CPU` : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Короткий контракт появится через минуту — витрина обновляется автоматически.
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleMission}
                  disabled={!starterKey || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ui-primary)] px-3 py-3 text-sm font-extrabold text-[var(--ui-on-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Crosshair className="h-4 w-4" />
                  Запустить контракт
                </button>
                <p className="text-center text-[10px] leading-snug text-slate-400">
                  Контракт идёт на сервере: закрой игру и вернись к готовой награде.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleTap}
                className="flex w-full flex-col items-center gap-3 rounded-2xl bg-[var(--ui-primary)] px-4 py-7 text-[var(--ui-on-primary)] transition active:scale-[0.98] cursor-pointer"
              >
                <MousePointerClick className="h-10 w-10" />
                <span className="font-display text-2xl font-extrabold tracking-wide">ТАП</span>
                <span className="text-xs font-semibold opacity-80">
                  +{Math.round(player.derived.clickPower * 10) / 10} Data за тап · тапов: {player.totalClicks}
                </span>
              </button>
            ))}

          {step === 2 && suggestion && (
            <div className="flex flex-col gap-2.5">
              <div className="rounded-xl border border-[rgba(var(--ui-primary-rgb),0.2)] bg-black/20 px-3 py-2.5">
                <p className="text-sm font-bold text-white">
                  {suggestion.card.iconGlyph} {suggestion.card.name}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{suggestion.card.description}</p>
                <p className="mt-1 text-[11px] font-semibold text-[var(--ui-secondary)]">
                  Цена: {suggestion.price.toLocaleString('ru-RU')} Data
                </p>
              </div>
              {/* Прогресс до первой покупки: видно, что тап ведёт к цели, а не в пустоту. */}
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-[var(--ui-primary)] transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.round((player.data / Math.max(1, suggestion.price)) * 100))}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-[10px] tabular-nums text-slate-400">
                  {Math.floor(player.data).toLocaleString('ru-RU')} / {suggestion.price.toLocaleString('ru-RU')} Data
                </p>
              </div>
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={!suggestion.affordable || busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ui-primary)] px-3 py-3 text-sm font-extrabold text-[var(--ui-on-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Cpu className="h-4 w-4" />
                {suggestion.affordable
                  ? 'Купить'
                  : v3
                    ? `Купить · нужно ещё ${dataShortfall.toLocaleString('ru-RU')} Data`
                    : `Купить · ещё ${tapsToAfford} тап(ов)`}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-2">
              {starterMission ? (
                <div className="rounded-xl border border-[rgba(var(--ui-primary-rgb),0.2)] bg-black/20 px-3 py-2.5">
                  <p className="text-sm font-bold text-white">{starterMission.targetName}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{starterMission.description}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[var(--ui-secondary)]">
                    {starterMission.durationSec} сек · до {starterMission.baseDataReward.toLocaleString('ru-RU')} Data
                    {entryCost ? ` · вход ${entryCost.energy} ${v3 ? 'CPU' : 'Energy'}` : ''}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Короткий контракт появится через минуту — витрина обновляется автоматически.
                </p>
              )}
              <button
                type="button"
                onClick={handleMission}
                disabled={!starterKey || busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--ui-primary)] px-3 py-3 text-sm font-extrabold text-[var(--ui-on-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Crosshair className="h-4 w-4" />
                Запустить контракт
              </button>
            </div>
          )}
        </div>

        {/* Легаси (флаг off): тап — главное действие на любом шаге, без него не
            собрать первую карточку. При v3 тапа на экране нет вообще: второй
            контракт — такой же источник Data и опыта для шага «улучшение». */}
        {step !== 1 &&
          (v3 ? (
            <button
              type="button"
              onClick={handleMission}
              disabled={!starterKey || busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(var(--ui-primary-rgb),0.45)] bg-[rgba(var(--ui-primary-rgb),0.12)] px-3 py-3 text-sm font-extrabold text-[var(--ui-primary)] transition active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Crosshair className="h-4 w-4" />
              Взять ещё контракт
              {starterMission ? ` · до ${starterMission.baseDataReward.toLocaleString('ru-RU')} Data` : ''}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleTap}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[rgba(var(--ui-primary-rgb),0.45)] bg-[rgba(var(--ui-primary-rgb),0.12)] px-3 py-3 text-sm font-extrabold text-[var(--ui-primary)] transition active:scale-[0.99] cursor-pointer"
            >
              <MousePointerClick className="h-4 w-4" />
              ТАП · +{Math.round(player.derived.clickPower * 10) / 10} Data · всего {player.totalClicks}
            </button>
          ))}

        <ol className="grid grid-cols-3 gap-1.5">
          {stepTitles.map((title, index) => {
            const stepNumber = index + 1;
            const done = isStepComplete(player, stepNumber);
            const active = !done && stepNumber === step;
            return (
              <li
                key={title}
                className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold ${
                  done
                    ? 'border-transparent bg-[rgba(var(--ui-primary-rgb),0.18)] text-[var(--ui-primary)]'
                    : active
                      ? 'border-[rgba(var(--ui-primary-rgb),0.55)] text-white'
                      : 'border-white/10 text-slate-500'
                }`}
              >
                {done ? (
                  <Check className="h-3 w-3" />
                ) : active ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                <span className="truncate">{title}</span>
              </li>
            );
          })}
        </ol>

        <p className="flex items-center justify-center gap-1 text-center text-[10px] text-slate-500">
          <Zap className="h-3 w-3" />
          {v3
            ? 'Остальные вкладки откроются на 2 уровне · CPU Charge копится сам'
            : `Остальные вкладки откроются на 2 уровне · контрактов короче ${STARTER_MISSION_MAX_SECONDS} сек хватает`}
        </p>
      </div>
    </section>
  );
};
