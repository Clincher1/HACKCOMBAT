/**
 * HACKER KOMBAT — QA-мост к shared-конфигам геймплея v3.
 * ----------------------------------------------------------------------------
 * scripts/qa/gameplay.mjs — обычный Node-скрипт и не умеет импортировать
 * TypeScript. Чтобы проверять РЕАЛЬНЫЕ функции (а не копию формул в тесте),
 * esbuild собирает этот файл, а mjs запускает его и читает JSON.
 *
 * Запуск (делается автоматически из gameplay.mjs):
 *   npx esbuild scripts/qa/gameplay-config.ts --bundle --platform=node --format=cjs \
 *     --outfile=/tmp/hk-gameplay-config.cjs && node /tmp/hk-gameplay-config.cjs
 */
import { isGameplayV3Enabled, configureFeatureFlags } from '../../shared/config';
import {
  CONTRACT_CPU_COST_BY_TIER,
  CONTRACT_CPU_COST_FALLBACK,
  getContractCpuCost,
  contractIncomePerHour,
  bestContractIncomePerHour,
  isContractReady,
  contractSecondsLeft,
} from '../../shared/economy.config';
import { MISSION_ENTRY_MIN_DATA, getMissionEntryCost, getMissionRewardScale } from '../../shared/hack.config';
import { MISSIONS_CONFIG } from '../../shared/missions.config';
import { ONBOARDING_STEPS, onboardingStepCopyV3 } from '../../shared/onboarding.config';
import {
  TAP_MAX_PER_SEC,
  TAP_BURST_CAPACITY,
  TAP_MAX_BATCH,
  resolveTapAllowance,
} from '../../shared/mechanics';
import { HACK_MAX_TAPS_PER_SEC } from '../../shared/hacks.config';

// v6.4: тап-цикл — те же 6 тап/с, что и во взломах.
const TAP_NOW = 1_000_000;
const tapFresh = resolveTapAllowance({ requested: 20, budget: null, energy: 1_500, nowMs: TAP_NOW });
const tapAfterFull = resolveTapAllowance({
  requested: 20,
  budget: { tokens: 0, at: TAP_NOW },
  energy: 1_500,
  nowMs: TAP_NOW,
});
const tapAfterOneSecond = resolveTapAllowance({
  requested: 20,
  budget: { tokens: 0, at: TAP_NOW },
  energy: 1_500,
  nowMs: TAP_NOW + 1_000,
});
const tapNoEnergy = resolveTapAllowance({
  requested: 20,
  budget: { tokens: 20, at: TAP_NOW },
  energy: 0,
  nowMs: TAP_NOW,
});
const tapIdleDay = resolveTapAllowance({
  requested: 60,
  budget: { tokens: 0, at: TAP_NOW },
  energy: 5_000,
  nowMs: TAP_NOW + 86_400_000,
});

const starter = MISSIONS_CONFIG.find((mission) => mission.key === 'scam_shop') ?? MISSIONS_CONFIG[0];
const now = Date.now();

function entryCostFor(mission: (typeof MISSIONS_CONFIG)[number]): { energy: number; data: number } {
  return getMissionEntryCost(mission, Math.round(mission.baseDataReward * getMissionRewardScale(1)));
}

// V3 включён (по умолчанию) — снимаем цену входа.
configureFeatureFlags({ gameplayV3: true });
const v3Entry = entryCostFor(starter);

// Флаг выключен — цена должна вернуться к «по длительности».
configureFeatureFlags({ gameplayV3: false });
const legacyEntry = entryCostFor(starter);

// Флаг включён обратно, чтобы не влиять на остальные проверки в этом процессе.
configureFeatureFlags({ gameplayV3: true });

process.stdout.write(
  JSON.stringify({
    flagDefault: isGameplayV3Enabled(),
    tiers: CONTRACT_CPU_COST_BY_TIER,
    fallback: CONTRACT_CPU_COST_FALLBACK,
    cost1: getContractCpuCost(1),
    cost3: getContractCpuCost(3),
    cost6: getContractCpuCost(6),
    costNoTier: getContractCpuCost(undefined),
    costOverflow: getContractCpuCost(99),
    starter: { key: starter.key, tier: starter.tier, durationSec: starter.durationSec },
    v3Entry,
    legacyEntry,
    minEntryData: MISSION_ENTRY_MIN_DATA,
    income: bestContractIncomePerHour(
      [{ tier: 1, durationSec: 50, baseDataReward: 200, successChance: 1, dataDeposit: 0 }],
      1
    ),
    incomeZeroChance: contractIncomePerHour({
      baseDataReward: 200,
      rewardScale: 1,
      successChance: 0,
      durationSec: 50,
      dataDeposit: 25,
    }),
    readySoon: isContractReady(new Date(now + 200).toISOString(), now),
    readyLater: isContractReady(new Date(now + 900).toISOString(), now),
    secondsLeft61: contractSecondsLeft(new Date(now + 61_000).toISOString(), now),
    steps: ONBOARDING_STEPS.join(','),
    copyV3: [1, 2, 3].map((step) => onboardingStepCopyV3(step, 60)).join(' | '),
    copyV3Step1: onboardingStepCopyV3(1, null),
    tap: {
      maxPerSec: TAP_MAX_PER_SEC,
      hackMaxPerSec: HACK_MAX_TAPS_PER_SEC,
      burst: TAP_BURST_CAPACITY,
      maxBatch: TAP_MAX_BATCH,
      fresh: tapFresh.allowed,
      afterFull: tapAfterFull.allowed,
      afterOneSecond: tapAfterOneSecond.allowed,
      noEnergy: tapNoEnergy.allowed,
      idleDay: tapIdleDay.allowed,
    },
  })
);
