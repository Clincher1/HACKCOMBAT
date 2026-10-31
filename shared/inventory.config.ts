import { NEW_YEAR_CANDY_KEY } from './newYearCandy';
import { ACHIEVEMENTS_BY_KEY } from './achievements.config';
import { getProfileFrame } from './profileFrames.config';
import { PETS_CONFIG } from './pets.config';
import { getSkinByKey } from './skins.config';
import type { InventoryItemDefinition } from './types';

/** Первый постоянный приз профиля. Он намеренно не имеет игрового эффекта. */
export const FIRST_DONUT_ITEM_KEY = 'reward:first_donut';
/** Памятный коллекционный подарок всем игрокам, без игрового эффекта. */
export const GIFT_PYTHON_BOOK_ITEM_KEY = 'reward:gift_python_book';

/** Постоянные персональные подарки: только показать или скрыть, без игровых эффектов. */
export const GIFT_COLA_ITEM_KEY = 'reward:gift_cola';
export const GIFT_WHISKEY_ITEM_KEY = 'reward:gift_whiskey';
export const GIFT_SNUS_ITEM_KEY = 'reward:gift_snus';

const REWARD_ITEMS: Record<string, InventoryItemDefinition> = {
  [NEW_YEAR_CANDY_KEY]: {
    key: NEW_YEAR_CANDY_KEY,
    kind: 'reward',
    name: 'Новогодний леденец',
    description: 'Три укуса: каждый даёт ×2 Data за ручные тапы на час. Укусы продлевают время.',
    icon: '🍬',
    source: 'Подарок всем игрокам',
    inventoryCategory: 'gift',
    accent: '#fb7185',
    usable: true,
    equipAction: null,
  },
  [FIRST_DONUT_ITEM_KEY]: {
    key: FIRST_DONUT_ITEM_KEY,
    kind: 'reward',
    name: 'Первый пончик',
    description: 'Памятный первый приз профиля. Его можно только выставить или скрыть.',
    icon: '🍩',
    source: 'Подарок всем игрокам',
    inventoryCategory: 'prize',
    accent: '#f9a8d4',
    usable: false,
    equipAction: null,
  },
  [GIFT_PYTHON_BOOK_ITEM_KEY]: {
    key: GIFT_PYTHON_BOOK_ITEM_KEY,
    kind: 'reward',
    name: 'Учебник по Python',
    description: 'Памятный подарок всем игрокам. Выставь его в витрине, чтобы показать другим.',
    icon: '📘',
    imageUrl: '/assets/inventory/python-book.svg',
    source: 'Подарок всем игрокам',
    inventoryCategory: 'gift',
    accent: '#60a5fa',
    usable: false,
    equipAction: null,
  },
  [GIFT_COLA_ITEM_KEY]: {
    key: GIFT_COLA_ITEM_KEY,
    kind: 'reward',
    name: 'Бутылка колы',
    description: 'Персональный подарок администратора. Его можно только выставить или скрыть.',
    icon: '🥤',
    source: 'Персональный подарок',
    inventoryCategory: 'gift',
    accent: '#60a5fa',
    usable: false,
    equipAction: null,
  },
  [GIFT_WHISKEY_ITEM_KEY]: {
    key: GIFT_WHISKEY_ITEM_KEY,
    kind: 'reward',
    name: 'Виски',
    description: 'Персональный подарок администратора. Его можно только выставить или скрыть.',
    icon: '🥃',
    source: 'Персональный подарок',
    inventoryCategory: 'gift',
    accent: '#f59e0b',
    usable: false,
    equipAction: null,
  },
  [GIFT_SNUS_ITEM_KEY]: {
    key: GIFT_SNUS_ITEM_KEY,
    kind: 'reward',
    name: 'Шайба снюса',
    description: 'Персональный подарок администратора. Его можно только выставить или скрыть.',
    icon: '🟤',
    imageUrl: '/assets/inventory/snus-packed.jpg',
    source: 'Персональный подарок',
    inventoryCategory: 'gift',
    accent: '#a3a3a3',
    usable: false,
    equipAction: null,
  },
};

export function getInventoryItemDefinition(key: string): InventoryItemDefinition | null {
  const special = REWARD_ITEMS[key];
  if (special) return special;

  const separator = key.indexOf(':');
  if (separator <= 0) return null;
  const kind = key.slice(0, separator);
  const sourceKey = key.slice(separator + 1);
  if (!sourceKey) return null;

  if (kind === 'frame') {
    const frame = getProfileFrame(sourceKey);
    if (frame.key !== sourceKey || frame.key === 'default') return null;
    return {
      key,
      kind: 'frame',
      name: frame.name,
      description: frame.description,
      icon: frame.iconUrl || frame.avatarUrl ? '🖼️' : '◈',
      source: frame.source,
      accent: frame.accent,
      usable: true,
      equipAction: 'profile_frame',
      equipKey: frame.key,
      imageUrl: frame.iconUrl ?? frame.avatarUrl,
    };
  }

  if (kind === 'skin') {
    const skin = getSkinByKey(sourceKey);
    if (!skin || skin.key === 'default') return null;
    return {
      key,
      kind: 'skin',
      name: skin.name,
      description: skin.description,
      icon: skin.avatarGlyph ?? (skin.category === 'desk' ? '🖥️' : skin.category === 'ui' ? '🎛️' : '🧑‍💻'),
      source: skin.category === 'desk' ? 'Косметика · рабочий стол' : skin.category === 'ui' ? 'Косметика · интерфейс' : 'Косметика · аватар',
      accent: skin.primaryHex,
      usable: true,
      equipAction: 'skin',
      equipKey: skin.key,
    };
  }

  if (kind === 'achievement') {
    const achievement = ACHIEVEMENTS_BY_KEY[sourceKey];
    if (!achievement) return null;
    return {
      key,
      kind: 'achievement',
      name: achievement.title,
      description: achievement.description,
      icon: achievement.icon,
      source: achievement.inventoryEventReward ? 'Достижение события' : 'Награда за достижение',
      inventoryCategory: achievement.inventoryEventReward ? 'event' : undefined,
      accent:
        achievement.rarity === 'legendary'
          ? '#ffb703'
          : achievement.rarity === 'epic'
            ? '#c084fc'
            : achievement.rarity === 'rare'
              ? '#00f0ff'
              : '#94a3b8',
      usable: false,
      equipAction: null,
    };
  }

  if (kind === 'companion') {
    const pet = PETS_CONFIG.find((candidate) => candidate.key === sourceKey);
    if (!pet) return null;
    return {
      key,
      kind: 'companion',
      name: pet.name,
      description: pet.description,
      icon: pet.emoji,
      source: 'Союзник · питомец',
      accent: '#c084fc',
      usable: false,
      equipAction: null,
    };
  }

  return null;
}

export function isInventoryItemKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 120 && Boolean(getInventoryItemDefinition(value));
}

/** Only explicitly classified prizes and event achievements belong in the inventory. */
export function isCollectibleInventoryItem(key: string): boolean {
  const item = getInventoryItemDefinition(key);
  return Boolean(item?.inventoryCategory && (item.kind === 'reward' || item.kind === 'achievement'));
}
