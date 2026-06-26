import React, { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Layers2 } from 'lucide-react';

export interface ConversionSeriesPickerSeries {
  groupName: string;
  platform?: string;
  icon?: string;
}

export interface ConversionSeriesPickerProps {
  viewMode: 'ACC' | 'APP';
  currentSeries: ConversionSeriesPickerSeries;
  onPrev: () => void;
  onNext: () => void;
  /** Narrow mode: single click cycles series (wraps) */
  onCycleNext: () => void;
  /** Use compact button when container width is below this */
  compactBelowWidth?: number;
  className?: string;
}

/**
 * Install/Event Conversion chart header: series name + prev/next.
 * Wide: full strip + chevrons; narrow: single button cycles series.
 */
export const ConversionSeriesPicker: React.FC<ConversionSeriesPickerProps> = ({
  viewMode,
  currentSeries,
  onPrev,
  onNext,
  onCycleNext,
  compactBelowWidth = 220,
  className = '',
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setCompact(w > 0 && w < compactBelowWidth);
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [compactBelowWidth]);

  const iconSrc = currentSeries.icon
    ? currentSeries.icon.startsWith('data:') || currentSeries.icon.startsWith('http')
      ? currentSeries.icon
      : `data:image/png;base64,${currentSeries.icon}`
    : undefined;

  if (compact) {
    return (
      <div
        ref={wrapRef}
        className={`flex items-center ml-2 shrink-0 ${className}`.trim()}
        style={{ alignItems: 'center', height: 'fit-content' }}
      >
        <button
          type="button"
          onClick={() => onCycleNext()}
          className="flex items-center justify-center rounded-md bg-white border border-gray-300 shadow-sm h-[26px] w-[26px] shrink-0 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors select-none"
          title="Switch series (tap to cycle)"
          aria-label="Switch series"
        >
          <Layers2 className="w-4 h-4 text-gray-700" strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`flex items-center ml-2 flex-1 min-w-0 ${className}`.trim()}
      style={{ alignItems: 'center', height: 'fit-content' }}
    >
      <div className="flex items-center rounded-md bg-white border border-gray-300 shadow-sm h-[26px] overflow-hidden w-full min-w-0 max-w-full">
        <button
          type="button"
          onClick={() => onPrev()}
          className="flex items-center justify-center px-1.5 h-full cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors select-none flex-shrink-0 border-0 bg-transparent"
          title="Previous series"
          aria-label="Previous series"
        >
          <ChevronLeft className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 flex-1 min-w-0 overflow-hidden">
          {iconSrc && (
            <img
              src={iconSrc}
              alt={currentSeries.groupName}
              className="w-4 h-4 rounded-full flex-shrink-0 object-cover"
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div className="min-w-0 overflow-hidden flex flex-col justify-center">
            {viewMode === 'APP' && currentSeries.platform ? (
              <>
                <div className="text-[11px] font-medium text-gray-900 truncate leading-[13px] text-center">
                  {currentSeries.groupName}
                </div>
                <div className="text-[9px] text-gray-500 leading-[11px] text-center">
                  {currentSeries.platform === 'iOS' ? 'IOS' : currentSeries.platform}
                </div>
              </>
            ) : (
              <div className="text-xs font-medium text-gray-900 truncate leading-tight text-center">
                {currentSeries.groupName}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNext()}
          className="flex items-center justify-center px-1.5 h-full cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors select-none flex-shrink-0 border-0 bg-transparent"
          title="Next series"
          aria-label="Next series"
        >
          <ChevronRight className="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </div>
  );
};
