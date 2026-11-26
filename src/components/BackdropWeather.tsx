import React from 'react';
import type { BackdropWeather as WeatherKind } from '../../shared/backdrops.config';

/**
 * Погодный слой поверх «вида из окна» (v4.1).
 *
 * Правила производительности (важно для Telegram WebView на слабых Android):
 *   • только `transform` и `opacity` — ни `filter`, ни `background-position`,
 *     ни `box-shadow` в анимации;
 *   • 5–9 элементов на сцену, `pointer-events: none`, `will-change` точечно;
 *   • дождь прокручивается на фиксированные 120px при тайле 120px — шов не виден,
 *     а перерисовки нет;
 *   • `prefers-reduced-motion` полностью выключает движение (см. index.css).
 */

interface CloudProps {
  top: string;
  width: number;
  duration: number;
  delay: number;
  opacity: number;
  tone?: string;
}

const Cloud: React.FC<CloudProps> = ({ top, width, duration, delay, opacity, tone }) => (
  <div
    className="bd-cloud"
    style={{
      top,
      width: `${width}%`,
      height: `${width * 0.16}%`,
      opacity,
      background: tone ?? 'radial-gradient(closest-side, rgba(255,255,255,.85), rgba(255,255,255,0))',
      animationDuration: `${duration}s`,
      animationDelay: `${-delay}s`,
    }}
  />
);

const Gull: React.FC<{ top: string; size: number; duration: number; delay: number }> = ({
  top,
  size,
  duration,
  delay,
}) => (
  <svg
    className="bd-gull"
    viewBox="0 0 24 8"
    style={{ top, width: size, animationDuration: `${duration}s`, animationDelay: `${-delay}s` }}
    aria-hidden="true"
  >
    <path d="M1 6 Q6 1 12 6 Q18 1 23 6" fill="none" stroke="rgba(20,16,30,.55)" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

export const BackdropWeather: React.FC<{ kind: WeatherKind }> = ({ kind }) => {
  if (kind === 'sunset') {
    return (
      <div className="bd-layer" aria-hidden="true">
        <div className="bd-sun" />
        <Cloud top="14%" width={46} duration={110} delay={20} opacity={0.32} />
        <Cloud top="26%" width={30} duration={86} delay={55} opacity={0.24} />
        <Cloud top="6%" width={62} duration={140} delay={90} opacity={0.16} />
        <Gull top="30%" size={22} duration={34} delay={6} />
        <Gull top="36%" size={16} duration={44} delay={18} />
        <div className="bd-warm-haze" />
      </div>
    );
  }

  if (kind === 'day') {
    return (
      <div className="bd-layer" aria-hidden="true">
        <Cloud top="10%" width={54} duration={120} delay={12} opacity={0.5} />
        <Cloud top="22%" width={34} duration={92} delay={48} opacity={0.4} />
        <Cloud top="4%" width={70} duration={150} delay={70} opacity={0.28} />
        <Gull top="26%" size={20} duration={30} delay={4} />
        <Gull top="31%" size={14} duration={40} delay={14} />
        <div className="bd-day-breeze" />
      </div>
    );
  }

  if (kind === 'night') {
    return (
      <div className="bd-layer" aria-hidden="true">
        <div className="bd-bokeh">
          <span style={{ left: '12%', top: '58%', width: 10, height: 10, animationDelay: '0s' }} />
          <span style={{ left: '24%', top: '66%', width: 6, height: 6, animationDelay: '1.4s' }} />
          <span style={{ left: '38%', top: '54%', width: 8, height: 8, animationDelay: '2.6s' }} />
          <span style={{ left: '57%', top: '62%', width: 12, height: 12, animationDelay: '0.7s' }} />
          <span style={{ left: '72%', top: '52%', width: 7, height: 7, animationDelay: '2.1s' }} />
          <span style={{ left: '86%', top: '60%', width: 9, height: 9, animationDelay: '3.2s' }} />
        </div>
        <Cloud top="12%" width={48} duration={150} delay={30} opacity={0.14} />
        <div className="bd-night-mist" />
      </div>
    );
  }

  // rain
  return (
    <div className="bd-layer" aria-hidden="true">
      <div className="bd-rain bd-rain--far" />
      <div className="bd-rain bd-rain--near" />
      <div className="bd-fog" />
      <div className="bd-glass" />
    </div>
  );
};
