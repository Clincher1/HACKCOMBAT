/**
 * HACKER KOMBAT — фон и акцент текущей локации (v5.5).
 *
 * Слой лежит под контентом (WORLD_Z_INDEX.backdrop) и не перехватывает тапы:
 * это чистый CSS-градиент из src/index.css, без картинок и видео. Акцент
 * выставляется в CSS-переменные на :root, поэтому HUD и кнопки подхватывают
 * цвет локации без перерисовки всего дерева.
 */

import React, { useEffect } from 'react';
import { locationAccentVars, WORLD_Z_INDEX } from '../../shared/world.config';
import { useGame } from '../context/GameContext';

export const LocationBackdrop: React.FC = () => {
  const { activeLocation, worldEnabled } = useGame();
  const bgClass = activeLocation.bgClass;

  useEffect(() => {
    if (!worldEnabled) return undefined;
    const root = document.documentElement;
    const vars = locationAccentVars(activeLocation);
    root.style.setProperty('--loc-accent', vars['--loc-accent']);
    root.style.setProperty('--loc-accent-rgb', vars['--loc-accent-rgb']);
    return () => {
      // Возврат в Комнату (или выключение флага) обязан вернуть прежний HUD:
      // переменные снимаются, и интерфейс снова читает --ui-primary.
      root.style.removeProperty('--loc-accent');
      root.style.removeProperty('--loc-accent-rgb');
    };
  }, [activeLocation, worldEnabled]);

  if (!worldEnabled) return null;

  return (
    <div
      aria-hidden
      data-location={activeLocation.id}
      className={`loc-bg ${bgClass}`}
      style={{ zIndex: WORLD_Z_INDEX.backdrop }}
    />
  );
};
