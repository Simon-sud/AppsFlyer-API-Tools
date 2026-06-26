import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

const TOOLTIP_MAX_WIDTH = 256;
const VIEWPORT_PADDING = 12;

type SettingsHelpTipProps = {
  text: string;
};

/**
 * Help tooltip: portal to body; clamp horizontal position in viewport.
 */
export const SettingsHelpTip: React.FC<SettingsHelpTipProps> = ({ text }) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: TOOLTIP_MAX_WIDTH });

  const updateCoords = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(TOOLTIP_MAX_WIDTH, window.innerWidth - VIEWPORT_PADDING * 2);
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(VIEWPORT_PADDING, Math.min(left, window.innerWidth - width - VIEWPORT_PADDING));
    setCoords({
      top: rect.bottom + 6,
      left,
      width,
    });
  }, []);

  const show = () => {
    updateCoords();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex flex-shrink-0 rounded-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        aria-label="Help"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            className="fixed z-[3200] rounded-md bg-slate-900 px-3 py-2.5 text-xs leading-snug text-slate-50 shadow-lg dark:bg-slate-100 dark:text-slate-900 pointer-events-none"
            style={{
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
};

export default SettingsHelpTip;
