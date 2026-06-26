import { slugifySliceId } from './display';
import { normalizePageProps } from './normalize';
import type { BenchmarkSlice, PageProps } from './types';
import { SECTION_META } from './types';

export const OPENCLAW_PACK_VERSION = '1.0';

export type OpenClawExportInput = {
  label?: string;
  filters?: Record<string, string>;
  slices: Array<{
    url: string;
    ok: boolean;
    error?: string;
    pageProps?: PageProps;
  }>;
};

export type OpenClawFileEntry =
  | { path: string; kind: 'text'; content: string }
  | { path: string; kind: 'json'; content: unknown };

export type OpenClawExportPack = {
  exportId: string;
  manifest: Record<string, unknown>;
  files: OpenClawFileEntry[];
};

const CSV_ESCAPE = (v: string | number): string => {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const LONG_CSV_HEADER = [
  'slice_id',
  'slice_url',
  'category',
  'sub_category',
  'sub_sub_category',
  'slice_country',
  'slice_media_type',
  'section',
  'metric',
  'quarter',
  'platform',
  'app_size',
  'row_country',
  'row_media_type',
  'value',
].join(',');

function buildLongCsvRows(slice: BenchmarkSlice): string[] {
  const d = slice.descriptor;
  const base = [
    slice.id,
    slice.url,
    d.category,
    d.subCategory,
    d.subSubCategory ?? '',
    d.country,
    d.mediaType,
  ];
  const lines: string[] = [];
  for (const cube of slice.cubes) {
    for (const row of cube.rows) {
      lines.push(
        [
          ...base,
          cube.section,
          cube.metric,
          row.date,
          row.platform,
          row.appSize,
          row.countryName,
          row.mediaType,
          row.dataValue,
        ]
          .map(CSV_ESCAPE)
          .join(',')
      );
    }
  }
  return lines;
}

const README = `# AppsFlyer Benchmark Export (OpenClaw)

This folder is an **AI-ready export pack** from Benchmark Explorer.
Source: AppsFlyer Public Benchmarks (industry aggregates, not client actuals).

## Read order

1. \`manifest.json\` — export metadata, schema, slice list
2. \`index.json\` — quick lookup table
3. \`data/benchmark_long.csv\` — **primary analysis file** (all slices, long format)
4. \`slices/<slice_id>/summary.json\` — per-slice metric medians (compact)
5. \`slices/<slice_id>/cubes/<section>__<metric>.json\` — metric-level stats + row count

## CSV columns (benchmark_long.csv)

| Column | Meaning |
|--------|---------|
| slice_id | URL path under /benchmarks/ |
| section | performance / trends / top_countries / change / extra |
| metric | Metric name as published by AppsFlyer |
| quarter | date field (quarter label) |
| row_country | Country dimension **inside** the metric row |
| slice_country | Country filter of the benchmark URL |

## Rules for analysis

- Do not invent metrics or slices not listed in manifest.json
- Empty sections are omitted (AppsFlyer sample thresholds)
- Compare slices using slice_id or descriptor fields in index.json
`;

export function buildOpenClawExportPack(input: OpenClawExportInput): OpenClawExportPack {
  const ts = new Date();
  const exportId = `${ts.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const normalized: BenchmarkSlice[] = [];
  const failures: { url: string; error?: string }[] = [];

  for (const item of input.slices) {
    if (!item.ok || !item.pageProps) {
      failures.push({ url: item.url, error: item.error || 'fetch failed' });
      continue;
    }
    const slice = normalizePageProps(item.url, item.pageProps);
    if (slice) normalized.push(slice);
    else failures.push({ url: item.url, error: 'no published metrics' });
  }

  const longCsvLines = [LONG_CSV_HEADER];
  const indexEntries: Record<string, unknown>[] = [];

  const files: OpenClawFileEntry[] = [{ path: 'README.md', kind: 'text', content: README }];

  for (const slice of normalized) {
    longCsvLines.push(...buildLongCsvRows(slice));
    const folder = slugifySliceId(slice.url);

    const metricSummaries = slice.cubes.map((c) => ({
      section: c.section,
      metric: c.metric,
      rows: c.rows.length,
      stats: c.stats,
    }));

    indexEntries.push({
      slice_id: slice.id,
      folder: `slices/${folder}`,
      url: slice.url,
      descriptor: slice.descriptor,
      sections: slice.sectionsAvailable,
      point_count: slice.pointCount,
      metrics: metricSummaries.map((m) => ({
        section: m.section,
        metric: m.metric,
        median: m.stats.median,
      })),
    });

    files.push({
      path: `slices/${folder}/descriptor.json`,
      kind: 'json',
      content: slice.descriptor,
    });
    files.push({
      path: `slices/${folder}/summary.json`,
      kind: 'json',
      content: {
        slice_id: slice.id,
        url: slice.url,
        sections_available: slice.sectionsAvailable,
        point_count: slice.pointCount,
        metrics: metricSummaries,
      },
    });

    for (const cube of slice.cubes) {
      const safeMetric = cube.metric.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
      files.push({
        path: `slices/${folder}/cubes/${cube.section}__${safeMetric}.json`,
        kind: 'json',
        content: {
          section: cube.section,
          section_label: cube.sectionLabel,
          metric: cube.metric,
          stats: cube.stats,
          row_count: cube.rows.length,
        },
      });
    }
  }

  files.push({ path: 'data/benchmark_long.csv', kind: 'text', content: longCsvLines.join('\n') });

  const manifest = {
    pack_version: OPENCLAW_PACK_VERSION,
    export_id: exportId,
    created_at: ts.toISOString(),
    label: input.label || 'benchmark_export',
    source: {
      provider: 'appsflyer',
      product: 'public_benchmarks',
      url: 'https://www.appsflyer.com/benchmarks/',
    },
    schema: {
      long_csv: 'data/benchmark_long.csv',
      slice_root: 'slices/',
      sections: SECTION_META.map((s) => ({ id: s.id, label: s.label, key: s.key })),
    },
    filters: input.filters ?? {},
    stats: {
      slices_ok: normalized.length,
      slices_failed: failures.length,
      total_rows: longCsvLines.length - 1,
      total_points: normalized.reduce((s, x) => s + x.pointCount, 0),
    },
    slices: indexEntries,
    failures,
  };

  files.push({ path: 'manifest.json', kind: 'json', content: manifest });
  files.push({
    path: 'index.json',
    kind: 'json',
    content: {
      export_id: exportId,
      slices: indexEntries,
      failures,
    },
  });

  return { exportId, manifest, files };
}
