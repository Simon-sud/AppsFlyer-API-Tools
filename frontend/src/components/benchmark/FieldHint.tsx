import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { FieldHelpSpec } from '../../lib/benchmark/fieldHelp';

type FieldHintProps = {
  spec: FieldHelpSpec;
  /** Icon-only — for table headers, tabs, and tight layouts */
  iconOnly?: boolean;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
};

/** Compact ? control — keeps labels clean while exposing field definitions on hover/focus. */
export const FieldHint: React.FC<FieldHintProps> = ({
  spec,
  iconOnly = true,
  side = 'top',
  className = '',
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={`About ${spec.title}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`inline-flex shrink-0 items-center justify-center rounded-sm text-slate-400 transition-colors hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${
          iconOnly ? 'h-3.5 w-3.5' : 'gap-1'
        } ${className}`}
      >
        <HelpCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
      </button>
    </TooltipTrigger>
    <TooltipContent
      side={side}
      className="z-[200] max-w-[18rem] space-y-1.5 p-3 text-xs leading-relaxed"
    >
      <p className="font-medium text-slate-50">{spec.title}</p>
      <p className="text-slate-300">{spec.body}</p>
      {spec.href ? (
        <a
          href={spec.href}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-sky-300 hover:underline"
        >
          {spec.hrefLabel ?? 'Learn more'}
        </a>
      ) : null}
    </TooltipContent>
  </Tooltip>
);

/** Section label + optional hint (Metric / Filter row headers). */
export const FieldLabel: React.FC<{
  children: React.ReactNode;
  help?: FieldHelpSpec;
  className?: string;
}> = ({ children, help, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${className}`}
  >
    {children}
    {help ? <FieldHint spec={help} className="-mt-px" /> : null}
  </span>
);
