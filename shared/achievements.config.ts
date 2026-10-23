import type { AchievementConfig } from './types';

// Достижения начисляют редкую валюту Crypto (раздел 2 и 4.5 ТЗ)
export const ACHIEVEMENTS_CONFIG: AchievementConfig[] = [
  {
    key: 'first_boot',
    title: 'Hello, World!',
    description: 'Сделать первые 25 кликов по терминалу.',
    cryptoReward: 3,
    icon: '⚡',
  },
  {
    key: 'first_upgrade',
    title: 'Апгрейд Железа',
    description: 'Купить первую карточку улучшения стола.',
    cryptoReward: 5,
    icon: '🛠️',
  },
  {
    key: 'desk_lvl_5',
    title: 'Двойной Неон',
    description: 'Достичь 5 уровня и эволюционировать рабочий стол.',
    cryptoReward: 8,
    icon: '🖥️',
  },
  {
    key: 'first_mission',
    title: 'Полевое Крещение',
    description: 'Успешно завершить первую миссию взлома.',
    cryptoReward: 5,
    icon: '🎯',
  },
  {
    key: 'first_teammate',
    title: 'Мы — Команда',
    description: 'Нанять первого специалиста в команду.',
    cryptoReward: 8,
    icon: '🤝',
  },
  {
    key: 'white_hat_path',
    title: 'Страж Сети (White Hat)',
    description: 'Активировать ветку Белой Шляпы и набрать 40+ Rep.',
    cryptoReward: 12,
    icon: '🛡️',
  },
  {
    key: 'black_hat_path',
    title: 'Призрак Даркнета (Black Hat)',
    description: 'Активировать ветку Чёрной Шляпы с высоким Heat.',
    cryptoReward: 12,
    icon: '🕶️',
  },
  {
    key: 'desk_lvl_15',
    title: 'Небо под Контролем',
    description: 'Достичь 15 уровня и запустить дрон-разведчик.',
    cryptoReward: 15,
    icon: '🛸',
  },
  {
    key: 'full_squad',
    title: 'Синдикат Сборе',
    description: 'Собрать полную команду из всех 6 специалистов.',
    cryptoReward: 25,
    icon: '👑',
  },
  {
    key: 'data_millionaire',
    title: 'Терабайтный Магнат',
    description: 'Накопить 100 000 Data на балансе.',
    cryptoReward: 20,
    icon: '💾',
  },
  {
    key: 'desk_lvl_30',
    title: 'Матрица Пробуждена',
    description: 'Достичь 30 уровня — голограммы и цифровой дождь.',
    cryptoReward: 30,
    icon: '🟩',
  },
  {
    key: 'global_hack_prestige',
    title: 'GLOBAL HACK LEGEND',
    description: 'Выполнить Престиж на 50 уровне и получить вечный множитель ×2.',
    cryptoReward: 50,
    icon: '🌐',
  },
];
