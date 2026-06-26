import { slicePickerSlugToLabel } from './display';
import type {
  BenchmarkSlice,
  MetricCube,
  MetricStats,
  PageProps,
  SectionDatum,
  SectionId,
  SectionKey,
  SliceDescriptor,
} from './types';
import { SECTION_META } from './types';

export function parseDescriptorFromUrl(url: string, slug?: string[]): SliceDescriptor {
  const parts =
    slug && slug.length > 0
      ? slug
      : url
          .replace(/^https:\/\/www\.appsflyer\.com\/benchmarks\/?/i, '')
          .replace(/\/$/, '')
          .split('/')
          .filter(Boolean);

  let category = '';
  let subCategory = '';
  let subSubCategory: string | null = null;
  let country = '';
  let mediaType = '';

  if (parts.length === 4) {
    [category, subCategory, country, mediaType] = parts;
  } else if (parts.length >= 5) {
    category = parts[0];
    subCategory = parts[1];
    subSubCategory = parts[2];
    country = parts[3];
    mediaType = parts[4];
  }

  const labels = {
    category: slicePickerSlugToLabel(category),
    subCategory: slicePickerSlugToLabel(subCategory),
    ...(subSubCategory ? { subSubCategory: slicePickerSlugToLabel(subSubCategory) } : {}),
    country: slicePickerSlugToLabel(country),
    mediaType: slicePickerSlugToLabel(mediaType),
  };

  return {
    category,
    subCategory,
    subSubCategory,
    country,
    mediaType,
    labels,
  };
}

function computeStats(values: number[]): MetricStats {
  if (values.length === 0) {
    return { n: 0, min: 0, median: 0, avg: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return {
    n: values.length,
    min: sorted[0],
    median,
    avg,
    max: sorted[sorted.length - 1],
  };
}

function sectionData(
  pageProps: PageProps | null | undefined,
  key: SectionKey
): Record<string, { data?: SectionDatum[] }> | undefined {
  return pageProps?.[key] as Record<string, { data?: SectionDatum[] }> | undefined;
}

export function normalizePageProps(url: string, pageProps: PageProps | null | undefined): BenchmarkSlice | null {
  if (!pageProps) return null;

  const descriptor = parseDescriptorFromUrl(url, pageProps.slug);
  const cubes: MetricCube[] = [];
  const sectionsAvailable: SectionId[] = [];

  for (const meta of SECTION_META) {
    const sec = sectionData(pageProps, meta.key);
    if (!sec || Object.keys(sec).length === 0) continue;
    sectionsAvailable.push(meta.id);

    for (const [metricName, metric] of Object.entries(sec)) {
      const rows = Array.isArray(metric?.data) ? metric.data : [];
      if (rows.length === 0) continue;
      const values = rows.map((r) => Number(r.dataValue)).filter((v) => Number.isFinite(v));
      cubes.push({
        section: meta.id,
        sectionLabel: meta.label,
        metric: metricName,
        rows,
        stats: computeStats(values),
      });
    }
  }

  if (cubes.length === 0) return null;

  const pointCount = cubes.reduce((s, c) => s + c.rows.length, 0);
  const id = url.replace(/^https:\/\/www\.appsflyer\.com\/benchmarks\/?/i, '').replace(/\/$/, '');

  return {
    id,
    url,
    descriptor,
    sectionsAvailable,
    cubes,
    pointCount,
  };
}

export function sectionHasData(
  props: PageProps | null | undefined,
  key: SectionKey
): boolean {
  if (!props) return false;
  const sec = props[key];
  return !!sec && Object.keys(sec).length > 0;
}

export function getFirstSectionWithData(
  props: PageProps | null | undefined
): SectionKey {
  const found = SECTION_META.find((s) => sectionHasData(props, s.key));
  return found?.key ?? SECTION_META[0].key;
}

export function countDataPoints(pageProps: PageProps | null | undefined): number {
  if (!pageProps) return 0;
  let n = 0;
  for (const meta of SECTION_META) {
    const sec = sectionData(pageProps, meta.key);
    if (!sec) continue;
    for (const m of Object.values(sec)) {
      n += Array.isArray(m?.data) ? m.data.length : 0;
    }
  }
  return n;
}
