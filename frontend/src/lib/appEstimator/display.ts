export const SOURCE_QUALITY_FILTER_OPTIONS = [
  { value: 'country_specific', label: 'Specific' },
  { value: 'global_not_country', label: 'Global' },
] as const;

/** Shown in Ratings tab. */
export const RATINGS_TAB_HELP =
  'Latest store ratings by app and country. Click a row to view history.';

/** Shown in Velocity tab — rating count change per calendar day between two snapshots. */
export const RATING_VELOCITY_DAILY_HELP =
  'Average daily change in store rating count between two snapshots (Δ ratings ÷ snapshot days). Used as input for download estimates.';

/** Shown in Benchmarks tab. */
export const BENCHMARKS_TAB_HELP =
  'Traindate download benchmarks used as ground truth for K calibration.';

/** Shown in Calibration tab. */
export const CALIBRATION_TAB_HELP =
  'Effective K coefficient per segment (platform × category × country). Sample count and MAPE reflect fit quality for that segment.';

/** Shown in Estimates tab. */
export const ESTIMATES_TAB_HELP =
  'Latest estimate date only. Daily and monthly downloads are model outputs (V4.1), not store-reported figures.';

export const buildSourceQualityFilterOptions = (
  available: string[] | undefined
): { value: string; label: string }[] => {
  const set = new Set(available ?? []);
  if (set.size === 0) {
    return SOURCE_QUALITY_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  }
  return SOURCE_QUALITY_FILTER_OPTIONS.filter((o) => set.has(o.value)).map((o) => ({
    value: o.value,
    label: o.label,
  }));
};

export const CONFIDENCE_FILTER_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;

export const formatSourceQuality = (value: string | undefined | null): string => {
  switch (value) {
    case 'country_specific':
      return 'Specific';
    case 'global_not_country':
      return 'Global';
    case 'unknown':
      return 'Unknown';
    default:
      if (!value?.trim()) return 'Unknown';
      return value
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
  }
};

export const sourceQualityTone = (value: string | undefined | null): 'ok' | 'warn' | 'neutral' => {
  if (value === 'country_specific') return 'ok';
  if (value === 'global_not_country') return 'warn';
  return 'neutral';
};

export const formatConfidence = (value: string | undefined | null): string => {
  if (!value?.trim()) return '—';
  const v = value.trim().toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
};

export const confidenceTone = (value: string | undefined | null): 'ok' | 'sky' | 'neutral' => {
  const v = value?.trim().toLowerCase();
  if (v === 'high') return 'ok';
  if (v === 'medium') return 'sky';
  return 'neutral';
};
