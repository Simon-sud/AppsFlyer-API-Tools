import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { DrawerTitle } from './ui/drawer';
import { cn } from '../lib/utils';

export type SettingsDrawerSection = 'gochat' | 'normal' | 'account';

const SECTION_TITLES: Record<SettingsDrawerSection, string> = {
  gochat: 'Go Chat Settings',
  normal: 'Normal Settings',
  account: 'Account Settings',
};

const SECTION_THRESHOLD_PX = 8;

function getOffsetWithinScroll(el: HTMLElement, scrollRoot: HTMLElement): number {
  const elRect = el.getBoundingClientRect();
  const rootRect = scrollRoot.getBoundingClientRect();
  return elRect.top - rootRect.top + scrollRoot.scrollTop;
}

/** Resolve main title section from scroll position */
export function resolveSettingsDrawerSectionFromScroll(
  scrollEl: HTMLDivElement,
  normalStartEl: HTMLElement,
  accountStartEl: HTMLElement
): SettingsDrawerSection {
  const scrollTop = scrollEl.scrollTop;
  const accountTop = getOffsetWithinScroll(accountStartEl, scrollEl);
  const normalTop = getOffsetWithinScroll(normalStartEl, scrollEl);

  if (scrollTop >= accountTop - SECTION_THRESHOLD_PX) return 'account';
  if (scrollTop >= normalTop - SECTION_THRESHOLD_PX) return 'normal';
  return 'gochat';
}

type SettingsDrawerScrollTitleProps = {
  section: SettingsDrawerSection;
  className?: string;
};

/** Drawer header title (switches with scroll section; direct render avoids blank flash) */
export const SettingsDrawerScrollTitle: React.FC<SettingsDrawerScrollTitleProps> = ({
  section,
  className,
}) => (
  <DrawerTitle
    className={cn(
      'select-none text-lg font-semibold leading-tight text-slate-950 dark:text-slate-50',
      className
    )}
  >
    {SECTION_TITLES[section]}
  </DrawerTitle>
);

type UseSettingsDrawerSectionOptions = {
  open: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  normalStartRef: React.RefObject<HTMLElement | null>;
  accountStartRef: React.RefObject<HTMLElement | null>;
};

export function useSettingsDrawerSection({
  open,
  scrollRef,
  normalStartRef,
  accountStartRef,
}: UseSettingsDrawerSectionOptions): {
  section: SettingsDrawerSection;
  onScroll: () => void;
  syncSection: () => void;
} {
  const [section, setSection] = useState<SettingsDrawerSection>('gochat');

  const syncSection = useCallback(() => {
    const scrollEl = scrollRef.current;
    const normalEl = normalStartRef.current;
    const accountEl = accountStartRef.current;
    if (!scrollEl || !normalEl || !accountEl) return;

    const next = resolveSettingsDrawerSectionFromScroll(scrollEl, normalEl, accountEl);
    setSection((prev) => (prev === next ? prev : next));
  }, [scrollRef, normalStartRef, accountStartRef]);

  useLayoutEffect(() => {
    if (!open) return;

    setSection('gochat');
    const scrollEl = scrollRef.current;
    if (scrollEl) scrollEl.scrollTop = 0;
    syncSection();
  }, [open, scrollRef, syncSection]);

  useEffect(() => {
    if (!open) return;

    const timers = [50, 150, 400].map((ms) => window.setTimeout(syncSection, ms));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [open, syncSection]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', syncSection);
    return () => window.removeEventListener('resize', syncSection);
  }, [open, syncSection]);

  return { section, onScroll: syncSection, syncSection };
}
