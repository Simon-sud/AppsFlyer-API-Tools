import React, { memo, useRef } from 'react';
import { cn } from '../lib/utils';
import { GochatCopyButton } from './GochatCopyButton';
import { GochatScrollArea } from './GochatScrollArea';

const STREAMING_BADGE = (
  <span className="text-[10px] italic text-gray-400 dark:text-gray-500">streaming…</span>
);

type ShellHeaderProps = {
  label: string;
  copyTextRef: React.MutableRefObject<string>;
  copySourceRef: React.RefObject<HTMLDivElement | null>;
  variant: 'code' | 'json';
  copyDisabled?: boolean;
  showStreaming?: boolean;
};

const GochatContentShellHeader = memo(
  function GochatContentShellHeader({
    label,
    copyTextRef,
    copySourceRef,
    variant,
    copyDisabled,
    showStreaming,
  }: ShellHeaderProps) {
    const isCode = variant === 'code';

    return (
      <div
        className={cn(
          'relative z-10 flex select-none items-center justify-between gap-3 px-3 py-2',
          'border-b border-gray-200/70 bg-gray-50/95 dark:border-gray-600/50 dark:bg-slate-900/90'
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              'inline-flex shrink-0 select-none items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide',
              isCode
                ? 'bg-slate-200/70 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200'
                : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
            )}
          >
            {label}
          </span>
          {showStreaming ? STREAMING_BADGE : null}
        </div>
        <GochatCopyButton
          textRef={copyTextRef}
          sourceRef={copySourceRef}
          disabled={copyDisabled}
          variant="onLight"
        />
      </div>
    );
  },
  (prev, next) =>
    prev.label === next.label &&
    prev.variant === next.variant &&
    prev.copyDisabled === next.copyDisabled &&
    prev.showStreaming === next.showStreaming &&
    prev.copyTextRef === next.copyTextRef &&
    prev.copySourceRef === next.copySourceRef
);

type GochatContentShellProps = {
  label: string;
  copyText: string;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  variant?: 'code' | 'json';
  copyDisabled?: boolean;
  showStreaming?: boolean;
  scrollDirection?: 'y' | 'x' | 'both';
  maxBodyHeight?: string;
};

export const GochatContentShell: React.FC<GochatContentShellProps> = ({
  label,
  copyText,
  children,
  className,
  bodyClassName,
  variant = 'code',
  copyDisabled,
  showStreaming,
  scrollDirection = 'both',
  maxBodyHeight,
}) => {
  const copySourceRef = useRef<HTMLDivElement>(null);
  const copyTextRef = useRef(copyText);
  copyTextRef.current = copyText;

  return (
    <div
      className={cn(
        'not-prose my-1.5 overflow-hidden rounded-xl border border-gray-200/80 shadow-sm dark:border-gray-600/60',
        className
      )}
    >
      <GochatContentShellHeader
        label={label}
        copyTextRef={copyTextRef}
        copySourceRef={copySourceRef}
        variant={variant}
        copyDisabled={copyDisabled}
        showStreaming={showStreaming}
      />
      <GochatScrollArea
        direction={scrollDirection}
        maxHeight={maxBodyHeight}
        className={cn('bg-white dark:bg-slate-950', bodyClassName)}
        contentClassName="min-w-0"
      >
        <div ref={copySourceRef} className="gochat-copy-source select-text">
          {children}
        </div>
      </GochatScrollArea>
    </div>
  );
};

export default GochatContentShell;
