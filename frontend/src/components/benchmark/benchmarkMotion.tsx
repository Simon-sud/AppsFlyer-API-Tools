import React, { useCallback, useEffect, useRef, useState } from 'react';

export const BENCHMARK_DISMISS_MS = 240;
export const BENCHMARK_PANEL_MS = 280;

/** Browser timeout id (DOM lib); avoids NodeJS.Timeout vs number mismatch in useRef. */
type BenchmarkTimerId = number;

let activeComboboxId: string | null = null;
let activeComboboxClose: (() => void) | null = null;

/** Close any other open Benchmark combobox before opening a new one. */
export function registerBenchmarkCombobox(id: string, close: () => void): void {
  if (activeComboboxId !== null && activeComboboxId !== id) {
    activeComboboxClose?.();
  }
  activeComboboxId = id;
  activeComboboxClose = close;
}

export function unregisterBenchmarkCombobox(id: string): void {
  if (activeComboboxId === id) {
    activeComboboxId = null;
    activeComboboxClose = null;
  }
}

/** Close the currently open combobox (e.g. outside click or another control). */
export function closeActiveBenchmarkCombobox(): void {
  if (activeComboboxClose) {
    const close = activeComboboxClose;
    activeComboboxId = null;
    activeComboboxClose = null;
    close();
  }
}

export function getActiveBenchmarkComboboxId(): string | null {
  return activeComboboxId;
}

/** Dropdown open/close with exit animation (AutoPipe select-dropdown pattern). */
export function useBenchmarkDropdownDismiss() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const openRef = useRef(false);
  const timerRef = useRef<BenchmarkTimerId | undefined>(undefined);

  openRef.current = open;

  const clearCloseTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const openDropdown = useCallback(() => {
    clearCloseTimer();
    setClosing(false);
    setOpen(true);
    openRef.current = true;
  }, [clearCloseTimer]);

  const closeDropdown = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    setClosing(true);
    clearCloseTimer();
    timerRef.current = window.setTimeout(() => {
      setClosing(false);
      timerRef.current = undefined;
    }, BENCHMARK_DISMISS_MS);
  }, [clearCloseTimer]);

  const toggleDropdown = useCallback(() => {
    if (openRef.current) closeDropdown();
    else openDropdown();
  }, [closeDropdown, openDropdown]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const isVisible = open || closing;
  const isExpanded = open && !closing;

  return {
    open,
    closing,
    isVisible,
    isExpanded,
    openDropdown,
    closeDropdown,
    toggleDropdown,
  };
}

/** Combobox dismiss with global single-open behavior (Slice Picker + inline filters). */
export function useBenchmarkComboboxDismiss(comboboxId: string) {
  const dismiss = useBenchmarkDropdownDismiss();

  const closeDropdown = useCallback(() => {
    dismiss.closeDropdown();
    unregisterBenchmarkCombobox(comboboxId);
  }, [comboboxId, dismiss]);

  const openDropdown = useCallback(() => {
    registerBenchmarkCombobox(comboboxId, closeDropdown);
    dismiss.openDropdown();
  }, [comboboxId, closeDropdown, dismiss]);

  const toggleDropdown = useCallback(() => {
    if (dismiss.open) closeDropdown();
    else openDropdown();
  }, [dismiss.open, closeDropdown, openDropdown]);

  useEffect(() => () => unregisterBenchmarkCombobox(comboboxId), [comboboxId]);

  return {
    ...dismiss,
    closeDropdown,
    openDropdown,
    toggleDropdown,
  };
}

type PanelPhase = 'hidden' | 'entering' | 'visible' | 'leaving';

/** Mount panel with enter/leave motion when `active` toggles. */
export function useBenchmarkPanelPresence(active: boolean, duration = BENCHMARK_PANEL_MS) {
  const [mounted, setMounted] = useState(active);
  const [phase, setPhase] = useState<PanelPhase>(active ? 'entering' : 'hidden');

  useEffect(() => {
    if (active) {
      setMounted(true);
      setPhase('entering');
      const enterId = requestAnimationFrame(() => {
        requestAnimationFrame(() => setPhase('visible'));
      });
      return () => cancelAnimationFrame(enterId);
    }
    setPhase('leaving');
    const t = window.setTimeout(() => {
      setMounted(false);
      setPhase('hidden');
    }, duration);
    return () => clearTimeout(t);
  }, [active, duration]);

  const motionClass =
    phase === 'visible'
      ? 'is-visible'
      : phase === 'entering'
        ? 'is-entering'
        : phase === 'leaving'
          ? 'is-leaving'
          : '';

  return { mounted, phase, motionClass };
}

export const BenchmarkAnimatedPanel: React.FC<{
  show: boolean;
  className?: string;
  children: React.ReactNode;
  as?: 'section' | 'div';
}> = ({ show, className = '', children, as = 'section' }) => {
  const { mounted, motionClass } = useBenchmarkPanelPresence(show);
  if (!mounted) return null;
  const Tag = as;
  return (
    <Tag className={`benchmark-panel-motion ${motionClass} ${className}`.trim()}>
      {children}
    </Tag>
  );
};

export const BenchmarkButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: 'default' | 'sm' | 'compact';
    variant?: 'outline' | 'primary' | 'ghost';
  }
> = ({ size = 'default', variant = 'outline', className = '', children, ...props }) => (
  <button
    type="button"
    className={[
      'benchmark-btn',
      size === 'sm' || size === 'compact' ? 'benchmark-btn--sm' : 'benchmark-btn--default',
      variant === 'primary' ? 'benchmark-btn--primary' : '',
      variant === 'ghost' ? 'benchmark-btn--ghost' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    {...props}
  >
    {children}
  </button>
);

/** Hover-triggered popover with the same dismiss animation as filter dropdowns. */
export function useBenchmarkHoverPopover(enterDelayMs = 120) {
  const dismiss = useBenchmarkDropdownDismiss();
  const enterTimerRef = useRef<BenchmarkTimerId | undefined>(undefined);

  const onPointerEnter = useCallback(() => {
    if (enterTimerRef.current !== undefined) {
      window.clearTimeout(enterTimerRef.current);
    }
    enterTimerRef.current = window.setTimeout(() => {
      dismiss.openDropdown();
      enterTimerRef.current = undefined;
    }, enterDelayMs);
  }, [dismiss, enterDelayMs]);

  const onPointerLeave = useCallback(() => {
    if (enterTimerRef.current !== undefined) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = undefined;
    }
    dismiss.closeDropdown();
  }, [dismiss]);

  useEffect(
    () => () => {
      if (enterTimerRef.current !== undefined) {
        window.clearTimeout(enterTimerRef.current);
      }
    },
    []
  );

  return { ...dismiss, onPointerEnter, onPointerLeave };
}

export const BenchmarkInlineCardMotion: React.FC<{
  show: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ show, className = '', children }) => {
  const [mounted, setMounted] = useState(show);
  const [expanded, setExpanded] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<BenchmarkTimerId | undefined>(undefined);

  useEffect(() => {
    if (show) {
      setMounted(true);
      setLeaving(false);
      const id = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(id);
    }
    if (!mounted) return undefined;
    setExpanded(false);
    setLeaving(true);
    timerRef.current = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
      timerRef.current = undefined;
    }, BENCHMARK_DISMISS_MS);
    return () => {
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, [show, mounted]);

  if (!mounted) return null;

  const stateClass = leaving ? 'is-leaving' : expanded ? 'is-visible' : '';

  return <div className={`benchmark-inline-card-motion ${stateClass} ${className}`.trim()}>{children}</div>;
};
