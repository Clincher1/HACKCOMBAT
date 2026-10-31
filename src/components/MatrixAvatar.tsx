import React from 'react';

const MATRIX_RAIN_COLUMNS = [
  'ﾊ7K0N1Zﾐ3',
  '01ｱR8ﾎQ2',
  'Z9ﾐﾊ0X7ｶ',
  'ﾛ3V1N0ｱ6',
  '1K0ﾂ8RZ4',
  'ﾊ2Q7N0ﾐ5',
  '0X9ｱK3ﾛ1',
  'R4ﾎ0Z8N2',
  '7ﾐ1V0ｶQ6',
  'N0ﾊ5K2Z9',
  'ｱ8R1ﾛ0X3',
  '2Q0ﾐ7V1ﾊ',
];

const MATRIX_BURST_LINES = [
  '010101 // ACCESS_GRANTED // 0101',
  'ﾊ7K0N1Z // useryou2202 // ﾐ3R8',
  'RUNNING_STREAM // 1100101 // RUN',
  '0X9ｱK3 // MATRIX_LINK // ｶQ6',
];

interface MatrixAvatarProps {
  label: string;
  className?: string;
  style?: React.CSSProperties;
  /** Increment to replay the local running-code reaction after a tap. */
  burstId?: number;
}

/**
 * Self-contained Matrix-style avatar: the rain is rendered in CSS/DOM so it
 * stays crisp at both leaderboard and profile sizes and needs no extra image.
 */
export const MatrixAvatar: React.FC<MatrixAvatarProps> = ({
  label,
  className = '',
  style,
  burstId = 0,
}) => (
  <div
    className={`theme-art matrix-avatar ${className}`.trim()}
    style={style}
    role="img"
    aria-label={`Матричный аватар ${label}`}
  >
    <div className="matrix-avatar__rain" aria-hidden="true">
      {MATRIX_RAIN_COLUMNS.map((column, index) => (
        <span
          key={`${column}-${index}`}
          className={`matrix-avatar__column matrix-avatar__column--${index + 1}`}
        >
          {column}
        </span>
      ))}
    </div>
    <div className="matrix-avatar__grid" aria-hidden="true" />
    <div className="matrix-avatar__scanline" aria-hidden="true" />
    <div className="matrix-avatar__vignette" aria-hidden="true" />
    <span className="matrix-avatar__label">{label}</span>
    {burstId > 0 && (
      <div
        key={burstId}
        className="matrix-avatar__burst"
        aria-live="polite"
        aria-label={`Бегущие строки Матрицы для ${label}`}
      >
        {MATRIX_BURST_LINES.map((line, index) => (
          <span
            key={`${burstId}-${line}`}
            className={`matrix-avatar__burst-line matrix-avatar__burst-line--${index + 1}`}
          >
            {line}
          </span>
        ))}
        <span className="matrix-avatar__burst-label">{label}</span>
      </div>
    )}
  </div>
);
