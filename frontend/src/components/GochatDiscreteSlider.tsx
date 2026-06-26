import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Slider } from './ui/slider';
import { cn } from '../lib/utils';

type GochatDiscreteSliderProps = {
  values: readonly number[];
  value: number;
  onChange: (value: number) => void;
  className?: string;
  formatLabel?: (value: number) => string;
};

function nearestValueIndex(values: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i] - value) < Math.abs(values[best] - value)) {
      best = i;
    }
  }
  return best;
}

/**
 * Discrete slider: step=1 snap; value label follows thumb (not centered).
 */
export const GochatDiscreteSlider: React.FC<GochatDiscreteSliderProps> = ({
  values,
  value,
  onChange,
  className,
  formatLabel = (n) => String(n),
}) => {
  const maxIndex = Math.max(0, values.length - 1);
  const committedIndex = useMemo(() => nearestValueIndex(values, value), [values, value]);
  const [activeIndex, setActiveIndex] = useState(committedIndex);
  const [labelLeftPx, setLabelLeftPx] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveIndex(committedIndex);
  }, [committedIndex]);

  const snapIndex = useCallback(
    (raw: number) => Math.min(maxIndex, Math.max(0, Math.round(raw))),
    [maxIndex]
  );

  const measureLabelPosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const thumb = root.querySelector<HTMLElement>('[role="slider"]');
    const rootRect = root.getBoundingClientRect();

    if (thumb) {
      const thumbRect = thumb.getBoundingClientRect();
      setLabelLeftPx(thumbRect.left + thumbRect.width / 2 - rootRect.left);
      return;
    }

    const track = root.querySelector<HTMLElement>('[data-orientation="horizontal"]');
    const trackRect = track?.getBoundingClientRect() ?? rootRect;
    const trackWidth = trackRect.width || rootRect.width;
    const ratio = maxIndex > 0 ? activeIndex / maxIndex : 0;
    setLabelLeftPx(trackRect.left - rootRect.left + trackWidth * ratio);
  }, [activeIndex, maxIndex]);

  useLayoutEffect(() => {
    measureLabelPosition();
  }, [measureLabelPosition, activeIndex, values.length]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureLabelPosition());
    ro.observe(root);
    window.addEventListener('resize', measureLabelPosition);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureLabelPosition);
    };
  }, [measureLabelPosition]);

  const handleValueChange = (next: number[]) => {
    const idx = snapIndex(next[0]);
    setActiveIndex(idx);
    requestAnimationFrame(measureLabelPosition);
  };

  const handleValueCommit = (next: number[]) => {
    const idx = snapIndex(next[0]);
    setActiveIndex(idx);
    const nextValue = values[idx];
    if (nextValue !== value) onChange(nextValue);
    requestAnimationFrame(measureLabelPosition);
  };

  const displayValue = values[activeIndex];

  return (
    <div ref={rootRef} className={cn('relative w-full pb-7 pt-0.5', className)}>
      <Slider
        value={[activeIndex]}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
        min={0}
        max={maxIndex}
        step={1}
        className={cn(
          'w-full touch-none',
          '[&_[role=slider]]:transition-none [&_[role=slider]]:will-change-[left]',
          '[&_.bg-slate-900]:transition-[width] [&_.bg-slate-900]:duration-75 [&_.bg-slate-900]:ease-linear',
          'dark:[&_.bg-slate-50]:transition-[width] dark:[&_.bg-slate-50]:duration-75'
        )}
      />
      <div
        className="absolute bottom-0 pointer-events-none -translate-x-1/2"
        style={{ left: labelLeftPx }}
      >
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          {formatLabel(displayValue)}
        </span>
      </div>
    </div>
  );
};

export default GochatDiscreteSlider;
