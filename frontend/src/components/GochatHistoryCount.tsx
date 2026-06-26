import React from 'react';
import { cn } from '../lib/utils';

const BADGE_H = 18;
const BADGE_R = 8.5;

type GochatHistoryCountProps = {
  count: number;
  className?: string;
};

/** SVG badge: textAnchor + dominantBaseline center digit in circle */
export const GochatHistoryCount: React.FC<GochatHistoryCountProps> = ({ count, className }) => {
  const label = String(count);
  const isWide = count >= 10;
  const charW = 6.5;
  const padX = 6;
  const width = isWide ? Math.ceil(label.length * charW + padX * 2) : BADGE_H;
  const rx = isWide ? BADGE_H / 2 : BADGE_R;

  return (
    <svg
      className={cn('gochat-history-count-svg', isWide && 'is-wide', className)}
      width={width}
      height={BADGE_H}
      viewBox={`0 0 ${width} ${BADGE_H}`}
      aria-hidden
    >
      <rect
        className="gochat-history-count-shape"
        x={0.5}
        y={0.5}
        width={width - 1}
        height={BADGE_H - 1}
        rx={rx}
        ry={rx}
      />
      <text
        className="gochat-history-count-label"
        x={width / 2}
        y={BADGE_H / 2}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </svg>
  );
};
