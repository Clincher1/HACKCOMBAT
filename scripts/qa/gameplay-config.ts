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
  })
);
