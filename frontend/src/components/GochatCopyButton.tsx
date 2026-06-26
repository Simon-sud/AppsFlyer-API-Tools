import React, { memo, useCallback, useRef, useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';
import { cn } from '../lib/utils';
import { copyTextToClipboard } from '../utils/clipboard';

type CopyStatus = 'idle' | 'copying' | 'copied' | 'failed';

type GochatCopyButtonProps = {
  /** Live copy payload — updated in parent without re-rendering this button */
  textRef: React.MutableRefObject<string>;
  sourceRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  disabled?: boolean;
  variant?: 'onDark' | 'onLight';
};

const STATUS_RESET_MS = 2400;

const GochatCopyButtonInner: React.FC<GochatCopyButtonProps> = ({
  textRef,
  sourceRef,
  className,
  disabled = false,
  variant = 'onDark',
}) => {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const resetTimerRef = useRef<number | null>(null);

  const scheduleReset = useCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setStatus('idle');
      resetTimerRef.current = null;
    }, STATUS_RESET_MS);
  }, []);

  const runCopy = useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;

      setStatus('copying');
      const sourceEl = sourceRef?.current ?? null;
      const payload = sourceEl?.textContent?.trim() || textRef.current;

      const ok = await copyTextToClipboard(payload, { sourceElement: sourceEl });
      setStatus(ok ? 'copied' : 'failed');
      scheduleReset();
    },
    [disabled, textRef, sourceRef, scheduleReset]
  );

  const onDark = variant === 'onDark';
  const copied = status === 'copied';
  const failed = status === 'failed';
  const label = copied ? 'Copied' : failed ? 'Failed' : 'Copy';

  return (
    <button
      type="button"
      onClick={runCopy}
      disabled={disabled}
      aria-label={
        copied ? 'Copied to clipboard' : failed ? 'Copy failed' : 'Copy to clipboard'
      }
      className={cn(
        'gochat-copy-btn relative z-30 shrink-0',
        'inline-flex h-7 min-w-[5.25rem] items-center justify-center gap-1.5 rounded-md px-2.5',
        'text-xs font-semibold leading-none select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 focus-visible:ring-offset-1',
        disabled && 'cursor-not-allowed opacity-40',
        copied
          ? onDark
            ? 'bg-emerald-500/35 text-emerald-50'
            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100'
          : failed
            ? onDark
              ? 'bg-rose-500/30 text-rose-100'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/45 dark:text-rose-100'
            : onDark
              ? 'gochat-copy-btn--dark text-slate-300'
              : 'gochat-copy-btn--light text-slate-600 dark:text-slate-300',
        className
      )}
    >
      <span className="relative h-3.5 w-3.5 shrink-0">
        <Copy
          className={cn(
            'absolute inset-0 h-3.5 w-3.5',
            status === 'idle' || status === 'copying' ? 'opacity-100' : 'opacity-0'
          )}
          aria-hidden
        />
        <Check
          className={cn('absolute inset-0 h-3.5 w-3.5', copied ? 'opacity-100' : 'opacity-0')}
          strokeWidth={2.5}
          aria-hidden
        />
        <AlertCircle
          className={cn('absolute inset-0 h-3.5 w-3.5', failed ? 'opacity-100' : 'opacity-0')}
          strokeWidth={2.5}
          aria-hidden
        />
      </span>
      <span>{label}</span>
    </button>
  );
};

export const GochatCopyButton = memo(
  GochatCopyButtonInner,
  (prev, next) =>
    prev.disabled === next.disabled &&
    prev.variant === next.variant &&
    prev.textRef === next.textRef &&
    prev.sourceRef === next.sourceRef
);

export default GochatCopyButton;
