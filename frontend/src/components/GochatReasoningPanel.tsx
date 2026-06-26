import React, { useState } from 'react';
import { Brain, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { GochatScrollArea } from './GochatScrollArea';

type GochatReasoningPanelProps = {
  reasoning: string;
  isStreaming?: boolean;
  hasAnswer?: boolean;
  className?: string;
};

/**
 * Collapsible reasoning trace (collapsed by default; user expands manually).
 */
export const GochatReasoningPanel: React.FC<GochatReasoningPanelProps> = ({
  reasoning,
  isStreaming = false,
  hasAnswer = false,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!reasoning.trim() && !isStreaming) return null;

  const statusLabel = isStreaming
    ? 'Thinking…'
    : hasAnswer
      ? 'Reasoning'
      : 'Thinking';

  return (
    <div
      className={cn(
        'gochat-reasoning-panel mb-3 overflow-hidden rounded-lg border select-none',
        'border-cyan-200/70 dark:border-cyan-800/45',
        'bg-gradient-to-br from-slate-50/95 via-white to-cyan-50/40',
        'dark:from-slate-900/80 dark:via-slate-900/60 dark:to-cyan-950/25',
        'shadow-sm',
        'animate-in fade-in-0 slide-in-from-top-1 duration-300 ease-out',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'flex w-full select-none items-center gap-2 px-3 py-2.5 text-left transition-colors duration-200',
          'hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-inset'
        )}
        aria-expanded={expanded}
      >
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-md',
            'bg-cyan-100/80 dark:bg-cyan-900/40',
            isStreaming && 'gochat-reasoning-icon-active'
          )}
        >
          <Brain className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
        </span>
        <span className="min-w-0 flex-1 select-none text-xs font-semibold tracking-wide text-cyan-800 dark:text-cyan-300">
          {statusLabel}
        </span>
        {!expanded && reasoning.trim() && (
          <span className="hidden sm:block max-w-[45%] select-none truncate text-[10px] text-slate-500 dark:text-slate-500">
            {reasoning.replace(/\s+/g, ' ').trim()}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-cyan-600/70 dark:text-cyan-400/70 transition-transform duration-300 ease-out',
            expanded && 'rotate-180'
          )}
        />
      </button>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-95'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-cyan-100/80 px-3 py-2.5 dark:border-cyan-900/35">
            <GochatScrollArea
              className="max-h-[min(280px,40vh)]"
              contentClassName={cn(
                'select-text text-[11px] leading-relaxed text-slate-600 dark:text-slate-400',
                'whitespace-pre-wrap break-words font-mono'
              )}
            >
              {reasoning}
              {isStreaming && (
                <span className="gochat-stream-caret gochat-stream-caret--reasoning" aria-hidden />
              )}
            </GochatScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GochatReasoningPanel;
