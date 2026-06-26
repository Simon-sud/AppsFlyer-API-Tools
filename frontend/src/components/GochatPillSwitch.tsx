import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export type GochatPillOption = {
  id: string;
  label: string;
};

type GochatPillSwitchProps = {
  options: readonly GochatPillOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /** Compact mode (short labels e.g. language) */
  compact?: boolean;
};

/**
 * Segmented text switch: highlight slides to selected option (Go Chat styling).
 */
export const GochatPillSwitch: React.FC<GochatPillSwitchProps> = ({
  options,
  value,
  onChange,
  className,
  compact = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const measure = useCallback(() => {
    const track = trackRef.current;
    const btn = buttonRefs.current[value];
    if (!track || !btn) return;
    const trackRect = track.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({
      left: btnRect.left - trackRect.left,
      width: btnRect.width,
    });
  }, [value]);

  useLayoutEffect(() => {
    measure();
  }, [measure, options, value]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  if (options.length === 0) return null;

  return (
    <div className={cn('w-full', className)}>
      <div
        ref={trackRef}
        className={cn(
          'relative flex w-full rounded-xl p-0.5',
          'bg-slate-200/90 dark:bg-slate-800/90',
          'border border-slate-200/60 dark:border-slate-700/60'
        )}
        role="tablist"
      >
        <div
          className={cn(
            'absolute top-0.5 bottom-0.5 rounded-[10px]',
            'bg-white dark:bg-slate-950',
            'shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10',
            'transition-[left,width] duration-300 ease-out',
            'pointer-events-none z-[1]'
          )}
          style={{
            left: indicator.left,
            width: indicator.width,
            willChange: 'left, width',
          }}
          aria-hidden
        />

        {options.map((option) => {
          const selected = option.id === value;
          return (
            <button
              key={option.id}
              ref={(el) => {
                buttonRefs.current[option.id] = el;
              }}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                if (option.id !== value) onChange(option.id);
              }}
              className={cn(
                'relative z-[2] flex-1 min-w-0 border-0 bg-transparent outline-none',
                'flex items-center justify-center cursor-pointer',
                'transition-[font-weight] duration-200',
                compact ? 'px-2 py-1.5 text-xs' : 'px-2.5 py-2 text-[11px] sm:text-xs',
                selected
                  ? 'font-semibold text-slate-900 dark:text-slate-50'
                  : 'font-normal text-slate-500 dark:text-slate-400'
              )}
            >
              <span className="truncate">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default GochatPillSwitch;
