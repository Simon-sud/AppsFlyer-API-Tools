export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

export const DATA_TYPES = {
  EVENT: 'event',
  INSTALL: 'install',
  RETARGET_EVENT: 'retarget_event',
  RETARGET_INSTALL: 'retarget_install',
  // Aggregate mode data types
  DAILY: 'daily',
  PARTNER_DAILY: 'partner_daily',
  GEO_DAILY: 'geo_daily',
} as const;

export const ACCOUNT_TYPES = {
  PID: 'PID',
  PRT: 'PRT',
} as const;

export const DATE_FORMAT = 'YYYY-MM-DD';

export type DataType = typeof DATA_TYPES[keyof typeof DATA_TYPES];
export type AccountType = typeof ACCOUNT_TYPES[keyof typeof ACCOUNT_TYPES];

// Event type helpers
export const isEventType = (dataType: DataType): boolean => {
  return dataType === DATA_TYPES.EVENT || dataType === DATA_TYPES.RETARGET_EVENT;
};

export const AUTO_REFRESH_RULE_OPTIONS = ['5MIN', '10MIN', '15MIN'] as const;
export type AutoRefreshRule = (typeof AUTO_REFRESH_RULE_OPTIONS)[number];
export const DEFAULT_AUTO_REFRESH_RULE: AutoRefreshRule = '15MIN';

export function accountRefreshRuleStorageKey(userId: string): string {
  return `accountRefreshRule_${userId}`;
}

/** Map localStorage rule to Settings slider index; null if invalid */
export function autoRefreshRuleToSliderIndex(rule: string | null): number | null {
  const idx = AUTO_REFRESH_RULE_OPTIONS.indexOf(rule as AutoRefreshRule);
  return idx >= 0 ? idx : null;
}

/**
 * One-time migration: legacy default 5MIN → 15MIN (once per user).
 */
export function migrateAutoRefreshRuleDefault(userId: string): void {
  if (!userId || typeof window === 'undefined') return;
  const key = accountRefreshRuleStorageKey(userId);
  const flag = `${key}_migrated_default_15min`;
  if (localStorage.getItem(flag) === '1') return;
  const saved = localStorage.getItem(key);
  if (!saved || saved === '5MIN') {
    localStorage.setItem(key, DEFAULT_AUTO_REFRESH_RULE);
  }
  localStorage.setItem(flag, '1');
}

/** Read Auto Refresh slider index; defaults to 15MIN (index 2) */
export function readAutoRefreshSliderIndex(userId: string): number {
  if (!userId || typeof window === 'undefined') return 2;
  migrateAutoRefreshRuleDefault(userId);
  const key = accountRefreshRuleStorageKey(userId);
  const saved = localStorage.getItem(key);
  const idx = autoRefreshRuleToSliderIndex(saved);
  if (idx !== null) return idx;
  localStorage.setItem(key, DEFAULT_AUTO_REFRESH_RULE);
  return 2;
}

export function writeAutoRefreshRule(userId: string, sliderIndex: number): void {
  if (!userId || typeof window === 'undefined') return;
  const rule = AUTO_REFRESH_RULE_OPTIONS[sliderIndex] ?? DEFAULT_AUTO_REFRESH_RULE;
  localStorage.setItem(accountRefreshRuleStorageKey(userId), rule);
}

// Account refresh interval for current user (ms)
export function getAccountRefreshInterval(userId: string): number {
  const key = accountRefreshRuleStorageKey(userId);
  const val = localStorage.getItem(key) || DEFAULT_AUTO_REFRESH_RULE;
  if (val === '10MIN') return 10 * 60 * 1000;
  if (val === '15MIN') return 15 * 60 * 1000;
  return 5 * 60 * 1000;
}
