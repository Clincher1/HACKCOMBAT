import { ArrowLeft, Lock } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { ONBOARDING_UNLOCK_LEVEL } from '../../shared/onboarding.config';

/**
 * Заглушка вкладки в первом сеансе (v5.4).
 *
 * Требование аудита: вкладки не исчезают (иначе игра выглядит пустой), но и не
 * открывают 30 решений сразу. Экран говорит ровно одну вещь: что здесь будет
 * и когда откроется.
 */
export const LockedTab: React.FC<{ title: string; hint?: string }> = ({ title, hint }) => (
  <div className="flex min-h-[55vh] flex-col items-center justify-center px-4 text-center">
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(var(--ui-primary-rgb),0.35)] bg-[rgba(var(--ui-primary-rgb),0.10)]">
      <Lock className="h-6 w-6 text-[var(--ui-primary)]" />
    </div>
    <h2 className="mt-3 font-display text-base font-extrabold text-white">{title}</h2>
    <p className="mt-1 text-xs text-slate-400">
      Откроется на {ONBOARDING_UNLOCK_LEVEL} уровне.
      {hint ? ` ${hint}` : ''}
    </p>
    <Link
      to="/"
      className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[rgba(var(--ui-primary-rgb),0.4)] px-3 py-2 text-xs font-bold text-[var(--ui-primary)] transition hover:brightness-110"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Вернуться к столу
    </Link>
  </div>
);
