/**
 * Align benchmark table rows with the country encoded in the slice URL.
 * AppsFlyer sometimes returns empty countryName or other countries (e.g. sub-region leakage).
 */
import { parseDescriptorFromUrl } from './normalize';
import type { PageProps, SectionDatum, SectionId, SliceDescriptor } from './types';

const COUNTRY_ALIAS: Record<string, string> = {
  uk: 'united-kingdom',
  gb: 'united-kingdom',
  'great-britain': 'united-kingdom',
  'united-kingdom': 'united-kingdom',
  us: 'united-states',
  usa: 'united-states',
  'united-states': 'united-states',
  uae: 'united-arab-emirates',
  'united-arab-emirates': 'united-arab-emirates',
};

/** Normalize country label or slug to a single comparable token. */
export function countryToComparableSlug(input: string): string {
  const raw = String(input ?? '').trim().toLowerCase();
  if (!raw) return '';
  const slug = raw
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return '';
  return COUNTRY_ALIAS[slug] ?? slug;
}

export function countriesMatch(sliceCountrySlug: string, rowCountryName: string): boolean {
  const sliceSlug = countryToComparableSlug(sliceCountrySlug);
  if (!sliceSlug) return true;
  const rowSlug = countryToComparableSlug(rowCountryName);
  if (!rowSlug) return true;
  if (rowSlug === sliceSlug) return true;
  // Sub-region label on a country slice (AppsFlyer FAQ): keep row if label contains slice tokens
  const sliceTokens = sliceSlug.split('-').filter((t) => t.length > 2);
  if (sliceTokens.length > 0 && sliceTokens.every((t) => rowSlug.includes(t))) return true;
  return false;
}

export type SliceCountryContext = {
  descriptor: SliceDescriptor;
  slug: string;
  label: string;
};

export function resolveSliceCountry(
  sliceUrl: string | undefined,
  pageProps?: PageProps | null
): SliceCountryContext | null {
  if (!sliceUrl?.trim()) return null;
  const descriptor = parseDescriptorFromUrl(sliceUrl, pageProps?.slug);
  if (!descriptor.country?.trim()) return null;
  return {
    descriptor,
    slug: descriptor.country,
    label: descriptor.labels.country || descriptor.country,
  };
}

export type AlignRowsResult = {
  rows: SectionDatum[];
  /** Rows removed because countryName did not match the slice URL country */
  droppedMismatch: number;
  /** Rows where empty countryName was filled from slice label */
  filledEmpty: number;
};

/**
 * When the slice URL targets one country: fill blank country cells and drop obvious mismatches.
 */
export function alignSectionRowsToSliceCountry(
  rows: SectionDatum[],
  slice: SliceCountryContext | null
): AlignRowsResult {
  if (!slice || !slice.slug) {
    return { rows, droppedMismatch: 0, filledEmpty: 0 };
  }

  const out: SectionDatum[] = [];
  let droppedMismatch = 0;
  let filledEmpty = 0;

  for (const row of rows) {
    const raw = String(row.countryName ?? '').trim();
    if (!raw) {
      filledEmpty += 1;
      out.push({ ...row, countryName: slice.label });
      continue;
    }
    if (!countriesMatch(slice.slug, raw)) {
      droppedMismatch += 1;
      continue;
    }
    out.push(row);
  }

  // If strict filter would wipe almost everything, keep rows but still fill empty — data may be sub-region labeled
  if (out.length === 0 && rows.length > 0 && droppedMismatch === rows.length) {
    let fallbackFilled = 0;
    const kept = rows.map((row) => {
      const raw = String(row.countryName ?? '').trim();
      if (!raw) {
        fallbackFilled += 1;
        return { ...row, countryName: slice.label };
      }
      return row;
    });
    return {
      rows: kept,
      droppedMismatch: 0,
      filledEmpty: filledEmpty + fallbackFilled,
    };
  }

  return { rows: out, droppedMismatch, filledEmpty };
}

export function alignMetricDataToSliceCountry(
  metrics: Record<string, { data?: SectionDatum[] }> | undefined,
  slice: SliceCountryContext | null,
  _sectionId: SectionId
): { metrics: Record<string, { data?: SectionDatum[] }>; droppedMismatch: number; filledEmpty: number } {
  if (!metrics || !slice) {
    return { metrics: metrics ?? {}, droppedMismatch: 0, filledEmpty: 0 };
  }

  let droppedMismatch = 0;
  let filledEmpty = 0;
  const next: Record<string, { data?: SectionDatum[] }> = {};

  for (const [metricName, metric] of Object.entries(metrics)) {
    const data = Array.isArray(metric?.data) ? metric.data : [];
    const aligned = alignSectionRowsToSliceCountry(data, slice);
    droppedMismatch += aligned.droppedMismatch;
    filledEmpty += aligned.filledEmpty;
    next[metricName] = { ...metric, data: aligned.rows };
  }

  return { metrics: next, droppedMismatch, filledEmpty };
}
