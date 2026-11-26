/**
 * HACKER KOMBAT — фон и акцент текущей локации (v5.5 → v6.5).
 *
 * Слой лежит под контентом (WORLD_Z_INDEX.backdrop) и не перехватывает тапы.
 *
 * v6.5 «локации как миры»:
 *  • у каждой локации свой .webp-бэкдроп (shared/locations.ts), но грузится
 *    ТОЛЬКО картинка активного места: остальные ждут, пока игрок туда переедет;
 *  • градиент (bgClass из world.config) остаётся фолбэком и подложкой — картинка
 *    ложится поверх него с прозрачностью, поэтому слабый девайс видит тот же
 *    экран, даже если webp не загрузился;
 *  • акцент выставляется в CSS-переменные на :root, поэтому HUD и кнопки
 *    подхватывают цвет локации без перерисовки дерева.
 *
 * Перф: компонент мемоизирован и получает локацию пропсом — смена места меняет
 * только класс контейнера и одна картинка, тапы по столу её не перерисовывают.
 */

import React, { useEffect, useMemo } from 'react';
import { locationBackdropUrl } from '../../shared/locations';
import { locationAccentVars, WORLD_Z_INDEX, type WorldLocation } from '../../shared/world.config';

export interface LocationBackdropProps {
  /** Активная локация игрока (готовая, из GameContext). */
  location: WorldLocation;
  /** Включён ли мир: при выключенном флаге слоя нет вовсе. */
  enabled: boolean;
}

const LocationBackdropInner: React.FC<LocationBackdropProps> = ({ location, enabled }) => {
  const bgClass = location.bgClass;
  const photo = useMemo(() => locationBackdropUrl(location.id), [location.id]);

  useEffect(() => {
    if (!enabled) return undefined;
    const root = document.documentElement;
    const vars = locationAccentVars(location);
    root.style.setProperty('--loc-accent', vars['--loc-accent']);
    root.style.setProperty('--loc-accent-rgb', vars['--loc-accent-rgb']);
    return () => {
      // Возврат в Комнату (или выключение флага) обязан вернуть прежний HUD:
      // переменные снимаются, и интерфейс снова читает --ui-primary.
      root.style.removeProperty('--loc-accent');
      root.style.removeProperty('--loc-accent-rgb');
    };
  }, [location, enabled]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden
      data-location={location.id}
      data-backdrop-photo={photo ? 'true' : 'false'}
      className={`loc-bg ${bgClass}`}
      style={{ zIndex: WORLD_Z_INDEX.backdrop }}
    >
      {photo && (
        <img
          key={photo}
          src={photo}
          alt=""
          aria-hidden
          data-qa="location-backdrop-photo"
          loading="lazy"
          decoding="async"
          draggable={false}
          className="loc-bg-photo"
        />
      )}
    </div>
  );
};

export const LocationBackdrop = React.memo(LocationBackdropInner);
