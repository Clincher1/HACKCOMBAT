import type { ProfileFrameConfig } from './types';

/** Профильные рамки — чистая витрина, без игровых коэффициентов. */
export const PROFILE_FRAMES: readonly ProfileFrameConfig[] = [
  {
    key: 'default',
    name: 'Без рамки',
    description: 'Стандартный профиль оператора.',
    accent: '#64748b',
    background: 'rgba(15, 23, 42, 0.92)',
    glow: 'none',
    source: 'Базовый профиль',
  },
  {
    key: 'frame_neon_relay',
    name: 'Neon Relay · Участник',
    description: 'Рамка первой международной сезонной операции.',
    accent: '#00f0ff',
    background: 'linear-gradient(135deg, rgba(0,240,255,0.22), rgba(168,85,247,0.24))',
    glow: '0 0 12px rgba(0, 240, 255, 0.42)',
    source: 'Сезонная операция · участие',
    eventKey: 'neon-relay',
  },
  {
    key: 'frame_neon_relay_master',
    name: 'Neon Relay · Мастер',
    description: 'Редкая рамка за закрытие всех целей сезонной операции.',
    accent: '#ffb703',
    background: 'linear-gradient(135deg, rgba(255,183,3,0.28), rgba(255,0,160,0.24))',
    glow: '0 0 16px rgba(255, 183, 3, 0.52)',
    source: 'Сезонная операция · мастерство',
    eventKey: 'neon-relay',
  },
];

export function getProfileFrame(key?: string): ProfileFrameConfig {
  return PROFILE_FRAMES.find((frame) => frame.key === key) ?? PROFILE_FRAMES[0];
}
