import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  FolderOutput,
  Filter,
  Globe2,
  HelpCircle,
  Inbox,
  Layers,
  LayoutList,
  Loader2,
  RefreshCw,
  ScanSearch,
  Search,
  Sigma,
  X as XIcon,
} from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { useUser } from '../contexts/UserContext';
import { autopipeAxiosInstance } from '../services/api';
import {
  compareBenchmarkQuarters,
  countDataPoints,
  getFirstSectionWithData,
  sectionHasData,
  SECTION_META,
  slicePickerSlugToLabel,
  toTitleCase,
  type PageProps,
  type SectionDatum,
  type SectionKey,
  type SectionMetric,
  type SummaryStats,
  type SectionId,
} from '../lib/benchmark';
import {
  formatBenchmarkMetricValue,
  normalizePercentScale,
  resolveMetricDisplay,
  valueColumnLabel,
  type MetricDisplaySpec,
} from '../lib/benchmark/metricFormat';
import {
  BENCHMARK_FIELD_HELP,
  getMetricFieldHelp,
  getValueColumnHelp,
  type FieldHelpSpec,
} from '../lib/benchmark/fieldHelp';
import { sortBenchmarkMetricKeys } from '../lib/benchmark/metricOrder';
import {
  alignMetricDataToSliceCountry,
  resolveSliceCountry,
} from '../lib/benchmark/sliceRows';
import { BenchmarkPerformanceBarChart } from '../components/benchmark/BenchmarkPerformanceBarChart';
import { BenchmarkQuarterChart } from '../components/benchmark/BenchmarkQuarterChart';
import { BenchmarkTopCountriesStackedChart } from '../components/benchmark/BenchmarkTopCountriesStackedChart';
import { BenchmarkCountryChangeBarChart } from '../components/benchmark/BenchmarkCountryChangeBarChart';
import { BenchmarkMediaTypeStackedChart } from '../components/benchmark/BenchmarkMediaTypeStackedChart';
import {
  BenchmarkCombobox as Combobox,
  BenchmarkStatTile as StatTile,
  type ComboboxOption,
} from '../components/benchmark';
import { FieldHint } from '../components/benchmark/FieldHint';
import {
  BenchmarkAnimatedPanel,
  BenchmarkButton,
  BenchmarkInlineCardMotion,
  closeActiveBenchmarkCombobox,
  getActiveBenchmarkComboboxId,
  useBenchmarkHoverPopover,
} from '../components/benchmark/benchmarkMotion';
import './Benchmark.css';

// ============================================================================
// AppsFlyer Public Benchmark Explorer
// ----------------------------------------------------------------------------
// Thin, stateless integration with the AppsFlyer public benchmarks site.
// - Backend exposes /api/dashboard/benchmark/* on Go :5001 (sitemap, fetch, export)
//   (no DB, no persistence).
// - All scraped slices live in React state only; refreshing the page wipes them.
// ============================================================================

type SitemapItem = {
  url: string;
  category: string;
  subCategory: string;
  subSubCategory: string;
  country: string;
  mediaType: string;
};

type SitemapResponse = {
  success: boolean;
  total: number;
  items: SitemapItem[];
  loadedAt?: string;
  expiresAt?: string;
  /** memory | redis | db | upstream | *-stale */
  source?: string;
  error?: string;
};

type FetchResponse = {
  success: boolean;
  url: string;
  pageProps: PageProps;
  /** true when pageProps served from cache (not upstream) */
  cached?: boolean;
  /** redis | mysql | upstream */
  cacheLayer?: string;
  error?: string;
};

type BulkResult = {
  url: string;
  ok: boolean;
  error?: string;
  pageProps?: PageProps;
};

type FilterKey = 'category' | 'subCategory' | 'subSubCategory' | 'country' | 'mediaType';

const ALL_VALUE = '__ALL__';
const NONE_VALUE = '__NONE__';
const BULK_CONCURRENCY = 4;
const BULK_SEARCH_MAX = 32;

const SECTION_DEFS = SECTION_META.map(({ key, label, description }) => ({
  key,
  label,
  description,
}));

// ----------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------
const uniqueSorted = (arr: string[]): string[] =>
  Array.from(new Set(arr.filter((v) => v !== undefined && v !== null))).sort((a, b) =>
    a.localeCompare(b)
  );

const downloadJson = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ----------------------------------------------------------------------------
// Section data table with per-metric tabs, summary KPI strip, sortable columns,
// inline search, chip-style dimensions, value mini-bar and CSV export.
// ----------------------------------------------------------------------------
type DimFilter = { platform: string; appSize: string; country: string };
type SortKey = 'date' | 'platform' | 'appSize' | 'countryName' | 'mediaType' | 'dataValue';
type SortDir = 'asc' | 'desc';

/** Slice Insights header stats strip: lighter weight/size than table bold mono values */
const InsightStatsStrip: React.FC<{
  stats: SummaryStats;
  formatValue: (v: number) => string;
}> = ({ stats, formatValue }) => {
  const cells = [
    { label: 'Rows', value: stats.rows.toLocaleString() },
    { label: 'Min', value: formatValue(stats.min) },
    { label: 'Median', value: formatValue(stats.median) },
    { label: 'Avg', value: formatValue(stats.avg) },
    { label: 'Max', value: formatValue(stats.max) },
  ];
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-slate-200/80 bg-slate-50/60 shadow-sm">
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className={`flex min-w-[56px] flex-col items-center justify-center px-3 py-2 ${
            i < cells.length - 1 ? 'border-r border-slate-200/80' : ''
          }`}
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            {cell.label}
          </span>
          <span className="mt-0.5 text-[13px] font-normal leading-tight tracking-tight tabular-nums text-slate-700">
            {cell.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// Compact chip cells (Platform / App size / Media type):
// Neutral gray border, no fill; matches rounded-md / slate style.
const DimChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex h-5 max-w-full items-center truncate rounded-sm border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-600">
    {children}
  </span>
);

// Sortable header (Quarter / Value only)
const SortableTh: React.FC<{
  label: string;
  sortKey: SortKey;
  current: { key: SortKey; dir: SortDir };
  onToggle: (k: SortKey) => void;
  align?: 'left' | 'center' | 'right';
  help?: FieldHelpSpec;
}> = ({ label, sortKey, current, onToggle, align = 'left', help }) => {
  const active = current.key === sortKey;
  const alignClass =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return (
    <th className={`border-b border-slate-200 px-4 py-2.5 ${alignClass}`}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition ${
          align === 'center' ? 'mx-auto' : align === 'right' ? 'ml-auto' : ''
        } ${active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
      >
        {label}
        {help ? <FieldHint spec={help} side="top" /> : null}
        <span className="flex flex-col leading-none">
          <ChevronUp
            className={`h-2 w-2 ${active && current.dir === 'asc' ? 'text-slate-900' : 'text-slate-300'}`}
            strokeWidth={3}
          />
          <ChevronDown
            className={`-mt-0.5 h-2 w-2 ${active && current.dir === 'desc' ? 'text-slate-900' : 'text-slate-300'}`}
            strokeWidth={3}
          />
        </span>
      </button>
    </th>
  );
};

// Static header (Platform / App size / Country / Media type)
const StaticTh: React.FC<{
  label: string;
  help?: FieldHelpSpec;
}> = ({ label, help }) => (
  <th className="border-b border-slate-200 px-4 py-2.5 text-center">
    <span className="inline-flex items-center justify-center gap-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
      {label}
      {help ? <FieldHint spec={help} side="top" /> : null}
    </span>
  </th>
);

const SectionDataView: React.FC<{
  metrics?: Record<string, SectionMetric>;
  sectionId: SectionId;
  /** Current slice URL; correct row countryName from path country */
  sliceUrl?: string;
  pageProps?: PageProps | null;
  /** Callback to download full JSON (segmented with CSV on filter row) */
  onDownloadJson?: () => void;
  /** Lift filtered summary stats + unit to parent header stats strip */
  onStatsChange?: (payload: {
    stats: SummaryStats | null;
    display: MetricDisplaySpec | null;
  }) => void;
}> = ({ metrics, sectionId, sliceUrl, pageProps, onDownloadJson, onStatsChange }) => {
  const sliceCountry = useMemo(
    () => resolveSliceCountry(sliceUrl, pageProps),
    [sliceUrl, pageProps]
  );

  const alignedMetrics = useMemo(() => {
    if (!metrics) return { metrics: undefined as Record<string, SectionMetric> | undefined, dropped: 0, filled: 0 };
    const { metrics: aligned, droppedMismatch, filledEmpty } = alignMetricDataToSliceCountry(
      metrics,
      sliceCountry,
      sectionId
    );
    return {
      metrics: aligned as Record<string, SectionMetric>,
      dropped: droppedMismatch,
      filled: filledEmpty,
    };
  }, [metrics, sliceCountry, sectionId]);

  const metricKeys = useMemo(
    () => sortBenchmarkMetricKeys(Object.keys(alignedMetrics.metrics || {})),
    [alignedMetrics.metrics]
  );
  /** Metric-set signature for section; reset row filters on section/metrics change */
  const metricKeysSig = useMemo(() => [...metricKeys].sort().join('\u0001'), [metricKeys]);
  const [activeMetric, setActiveMetric] = useState<string>('');
  const [dimFilter, setDimFilter] = useState<DimFilter>({
    platform: ALL_VALUE,
    appSize: ALL_VALUE,
    country: ALL_VALUE,
  });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'desc' });

  useEffect(() => {
    if (metricKeys.length === 0) {
      setActiveMetric('');
    } else if (!metricKeys.includes(activeMetric)) {
      setActiveMetric(metricKeys[0]);
    }
  }, [metricKeys, activeMetric]);

  // On section/metric change: bind row filters/search to current table; drop cross-dataset picks
  useEffect(() => {
    setDimFilter({ platform: ALL_VALUE, appSize: ALL_VALUE, country: ALL_VALUE });
    setSearch('');
  }, [activeMetric, metricKeysSig]);

  const allRows = useMemo<SectionDatum[]>(() => {
    if (!alignedMetrics.metrics || !activeMetric) return [];
    const m = alignedMetrics.metrics[activeMetric];
    return Array.isArray(m?.data) ? m.data : [];
  }, [alignedMetrics.metrics, activeMetric]);

  const metricDisplay = useMemo(
    () => resolveMetricDisplay(activeMetric, sectionId),
    [activeMetric, sectionId]
  );

  const formatMetricValue = useCallback(
    (v: number) => formatBenchmarkMetricValue(v, metricDisplay),
    [metricDisplay]
  );

  const platformOpts = useMemo(() => uniqueSorted(allRows.map((r) => r.platform)), [allRows]);
  const appSizeOpts = useMemo(() => uniqueSorted(allRows.map((r) => r.appSize)), [allRows]);
  const countryOpts = useMemo(() => uniqueSorted(allRows.map((r) => r.countryName)), [allRows]);

  // After refresh: revert Platform/App size/Country to All if no longer in row set (avoid false empty)
  useEffect(() => {
    setDimFilter((f) => ({
      platform:
        f.platform === ALL_VALUE || platformOpts.includes(f.platform) ? f.platform : ALL_VALUE,
      appSize:
        f.appSize === ALL_VALUE || appSizeOpts.includes(f.appSize) ? f.appSize : ALL_VALUE,
      country:
        f.country === ALL_VALUE || countryOpts.includes(f.country) ? f.country : ALL_VALUE,
    }));
  }, [platformOpts, appSizeOpts, countryOpts]);

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const filtered = allRows.filter(
      (r) =>
        (dimFilter.platform === ALL_VALUE || r.platform === dimFilter.platform) &&
        (dimFilter.appSize === ALL_VALUE || r.appSize === dimFilter.appSize) &&
        (dimFilter.country === ALL_VALUE || r.countryName === dimFilter.country) &&
        (s === '' ||
          String(r.date ?? '').toLowerCase().includes(s) ||
          String(r.platform ?? '').toLowerCase().includes(s) ||
          String(r.appSize ?? '').toLowerCase().includes(s) ||
          String(r.countryName ?? '').toLowerCase().includes(s) ||
          String(r.mediaType ?? '').toLowerCase().includes(s))
    );
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sort.key === 'dataValue') {
        const va = Number(a.dataValue);
        const vb = Number(b.dataValue);
        const naA = !Number.isFinite(va);
        const naB = !Number.isFinite(vb);
        if (naA && naB) cmp = 0;
        else if (naA) cmp = -1;
        else if (naB) cmp = 1;
        else cmp = va - vb;
      } else if (sort.key === 'date') {
        cmp = compareBenchmarkQuarters(String(a.date ?? ''), String(b.date ?? ''));
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [allRows, dimFilter, search, sort]);

  // Summary stats (rows/min/median/avg/max) + max abs value for mini-bar normalization
  // Lift stats via onStatsChange to parent (Slice insights header strip); avoid duplicate renders
  const { stats, maxAbsForBar } = useMemo(() => {
    const values = filteredRows
      .map((r) => {
        const n = Number(r.dataValue);
        if (!Number.isFinite(n)) return NaN;
        if (
          metricDisplay.kind === 'percent' ||
          metricDisplay.kind === 'percent_change' ||
          metricDisplay.kind === 'percent_share'
        ) {
          return normalizePercentScale(n);
        }
        return n;
      })
      .filter((v) => Number.isFinite(v));
    if (values.length === 0) {
      return { stats: null as SummaryStats | null, maxAbsForBar: 0 };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const max = sorted[sorted.length - 1];
    const min = sorted[0];
    return {
      stats: { rows: filteredRows.length, min, median, avg, max } as SummaryStats,
      maxAbsForBar: Math.max(...values.map((v) => Math.abs(v))),
    };
  }, [filteredRows, metricDisplay]);

  // Lift stats to parent (header strip)
  const onStatsChangeRef = useRef(onStatsChange);
  onStatsChangeRef.current = onStatsChange;

  useEffect(() => {
    onStatsChangeRef.current?.({ stats, display: metricDisplay });
  }, [stats, metricDisplay]);

  // Clear on unmount only; avoid unstable onStatsChange causing infinite setState
  useEffect(() => {
    return () => onStatsChangeRef.current?.({ stats: null, display: null });
  }, []);

  const toggleSort = (key: SortKey) => {
    if (key !== 'date' && key !== 'dataValue') return;
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
    );
  };

  const exportCSV = () => {
    if (filteredRows.length === 0) return;
    const valueHeader = valueColumnLabel(metricDisplay).replace(/^Value\s*/i, 'value');
    const headers = ['quarter', 'platform', 'app_size', 'country', 'media_type', valueHeader];
    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      headers.map(escape).join(','),
      ...filteredRows.map((r) =>
        [
          r.date,
          r.platform,
          r.appSize,
          r.countryName,
          r.mediaType,
          formatMetricValue(Number(r.dataValue)),
        ]
          .map(escape)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark_${activeMetric || 'metric'}_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!alignedMetrics.metrics || metricKeys.length === 0) {
    return null;
  }

  return (
    <div className="min-h-[550px] space-y-3">
      {/* Row 1: metric tabs (stats strip moved to parent Slice insights header) */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Metric
        </span>
        <div className="flex flex-wrap gap-1.5">
          {/*
            Skip transition-colors: on active <-> inactive, bg and text both animate 150ms,
            overlapping yields gray text + semi-transparent black (perceived black flash).
            Instant active switch; same for hover to eliminate flash.
          */}
          {metricKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveMetric(key)}
              className={`benchmark-tab benchmark-tab--sm ${
                activeMetric === key ? 'is-active' : ''
              }`}
            >
              <span className="benchmark-btn__label">{key}</span>
            </button>
          ))}
        </div>
      </div>
      {activeMetric && (
        <div className="rounded-md border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs leading-relaxed text-slate-600">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-800">{activeMetric}</span>
            {metricDisplay.unitLabel ? (
              <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200">
                {metricDisplay.unitLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-1 inline-flex max-w-full items-start gap-1 text-slate-500">
            <span>{metricDisplay.description}</span>
            <FieldHint
              spec={getMetricFieldHelp(activeMetric, sectionId)}
              side="top"
              className="mt-px shrink-0"
            />
          </div>
        </div>
      )}

      {/*
        Row 2: align structure, font size, height with Metric row
        - Filter label without icon; inherits Metric row label style
        - Three Comboboxes reuse Slice Picker (compact + hideLabel + explicit width)
        - Search, CSV, JSON all h-8 / text-xs, matching Metric tabs
      */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Filter</span>
        {(
          [
            { key: 'platform' as const, opts: platformOpts, label: 'Platform' },
            { key: 'appSize' as const, opts: appSizeOpts, label: 'App size' },
            { key: 'country' as const, opts: countryOpts, label: 'Country' },
          ]
        ).map(({ key, opts, label }) => {
          const comboOptions: ComboboxOption[] = [
            {
              value: ALL_VALUE,
              label: `All ${toTitleCase(
                label === 'Country' ? 'Countries' : label === 'App size' ? 'App sizes' : `${label}s`
              )}`,
            },
            ...opts.map((o) => ({ value: o, label: o })),
          ];
          const widthClass =
            key === 'country' ? 'w-44' : key === 'appSize' ? 'w-36' : 'w-32';
          return (
            <Combobox
              key={key}
              label={label}
              value={dimFilter[key]}
              options={comboOptions}
              onChange={(v: string) => setDimFilter((f) => ({ ...f, [key]: v }))}
              size="compact"
              hideLabel
              hideSearch
              buttonClassName={widthClass}
            />
          );
        })}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rows..."
            className="h-8 w-48 rounded-md border border-slate-300 bg-white pl-6 pr-2 text-xs text-slate-700 shadow-sm hover:border-slate-400 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>

        {/*
          Right group: rows/data-points hint + CSV/JSON download on one line
          - CSV/JSON match Bulk results "Download all": <Button variant="outline" size="sm"> + Download icon
            size="sm" => h-8 / text-xs, same height as other Filter controls
        */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">
            Showing <span className="font-mono text-slate-700">{filteredRows.length}</span> /{' '}
            <span className="font-mono text-slate-700">{allRows.length}</span>
          </span>
          {sliceCountry && alignedMetrics.dropped > 0 && (
            <span
              className="text-[11px] text-amber-700"
              title={`Hidden ${alignedMetrics.dropped} row(s) whose country did not match slice country (${sliceCountry.label})`}
            >
              · {alignedMetrics.dropped} non-matching hidden
            </span>
          )}
          {onDownloadJson ? (
            <div className="benchmark-segmented" role="group" aria-label="Download data">
              <button
                type="button"
                onClick={exportCSV}
                disabled={filteredRows.length === 0}
                title="Download the currently visible rows as CSV"
                className="benchmark-segmented__btn"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                <span className="benchmark-btn__label">CSV</span>
              </button>
              <button
                type="button"
                onClick={onDownloadJson}
                title="Download the full slice as a JSON document"
                className="benchmark-segmented__btn"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                <span className="benchmark-btn__label">JSON</span>
              </button>
            </div>
          ) : (
            <BenchmarkButton
              size="sm"
              onClick={exportCSV}
              disabled={filteredRows.length === 0}
              title="Download the currently visible rows as CSV"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              <span className="benchmark-btn__label">CSV</span>
            </BenchmarkButton>
          )}
        </div>
      </div>

      {/* Row 3: data table — sortable header / chip dims / value mini-bar
          Scroll container uses .benchmark-scrollable (same thin scrollbar as Slice Picker). */}
      <div className="rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="benchmark-scrollable max-h-[460px] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
              <tr>
                <SortableTh label="Quarter" sortKey="date" current={sort} onToggle={toggleSort} help={BENCHMARK_FIELD_HELP.colQuarter} />
                <StaticTh label="Platform" help={BENCHMARK_FIELD_HELP.colPlatform} />
                <StaticTh label="App size" help={BENCHMARK_FIELD_HELP.colAppSize} />
                <StaticTh label="Country" help={BENCHMARK_FIELD_HELP.colCountry} />
                <StaticTh label="Media type" help={BENCHMARK_FIELD_HELP.colMediaType} />
                <SortableTh
                  label={valueColumnLabel(metricDisplay)}
                  sortKey="dataValue"
                  current={sort}
                  onToggle={toggleSort}
                  align="center"
                  help={getValueColumnHelp(activeMetric, sectionId)}
                />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => {
                const num = Number(r.dataValue);
                const pct =
                  maxAbsForBar > 0 && Number.isFinite(num)
                    ? Math.max(2, Math.min(100, (Math.abs(num) / maxAbsForBar) * 100))
                    : 0;
                return (
                  <tr key={i} className="border-t border-slate-100 hover:bg-sky-50/30">
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-xs tabular-nums text-slate-700">
                      {r.date}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-center">
                      <DimChip>{r.platform}</DimChip>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-center">
                      <DimChip>{r.appSize}</DimChip>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-center text-sm font-medium text-slate-800">
                      {r.countryName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-center">
                      <DimChip>{r.mediaType}</DimChip>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-center">
                      <div className="inline-flex items-center justify-center gap-2">
                        <div
                          className="h-1.5 w-16 overflow-hidden rounded-sm bg-slate-100"
                          aria-hidden="true"
                        >
                          <div
                            className="h-full rounded-sm bg-slate-600"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="min-w-[3.5rem] text-center font-mono text-sm font-semibold tabular-nums text-slate-900">
                          {formatMetricValue(num)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-400">
                    <div className="flex flex-col items-center gap-1">
                      <Inbox className="h-5 w-5 text-slate-300" />
                      No rows match the current filters.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeMetric && sectionId === 'trends' ? (
        <BenchmarkQuarterChart
          rows={filteredRows}
          metricName={activeMetric}
          display={metricDisplay}
          sectionLabel={SECTION_META.find((s) => s.id === sectionId)?.label}
        />
      ) : null}
      {activeMetric && sectionId === 'performance' ? (
        <BenchmarkPerformanceBarChart
          rows={filteredRows}
          metricName={activeMetric}
          display={metricDisplay}
          sectionLabel={SECTION_META.find((s) => s.id === sectionId)?.label}
        />
      ) : null}
      {activeMetric && sectionId === 'top_countries' ? (
        <BenchmarkTopCountriesStackedChart
          rows={filteredRows}
          metricName={activeMetric}
          display={metricDisplay}
          sectionLabel={SECTION_META.find((s) => s.id === sectionId)?.label}
        />
      ) : null}
      {activeMetric && sectionId === 'change' ? (
        <BenchmarkCountryChangeBarChart
          rows={filteredRows}
          metricName={activeMetric}
          display={metricDisplay}
          sectionLabel={SECTION_META.find((s) => s.id === sectionId)?.label}
        />
      ) : null}
      {activeMetric && sectionId === 'extra' ? (
        <BenchmarkMediaTypeStackedChart
          rows={filteredRows}
          metricName={activeMetric}
          display={metricDisplay}
          sectionLabel={SECTION_META.find((s) => s.id === sectionId)?.label}
        />
      ) : null}
    </div>
  );
};

// ----------------------------------------------------------------------------
// Main page
// ----------------------------------------------------------------------------
const Benchmark: React.FC = () => {
  const { userProfile } = useUser();
  const isSuperAdmin = userProfile?.role === 'Super Admin';

  const [sitemap, setSitemap] = useState<SitemapItem[]>([]);
  const [sitemapMeta, setSitemapMeta] = useState<{
    loadedAt?: string;
    expiresAt?: string;
    source?: string;
  }>({});
  const [sitemapLoading, setSitemapLoading] = useState(false);
  const [sitemapError, setSitemapError] = useState('');

  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    category: ALL_VALUE,
    subCategory: ALL_VALUE,
    subSubCategory: ALL_VALUE,
    country: ALL_VALUE,
    mediaType: ALL_VALUE,
  });

  const [activeUrl, setActiveUrl] = useState<string>('');
  const [pageProps, setPageProps] = useState<PageProps | null>(null);
  const lastPagePropsRef = useRef<PageProps | null>(null);
  if (pageProps) lastPagePropsRef.current = pageProps;
  const insightsPanelProps = pageProps ?? lastPagePropsRef.current;
  const [viewTab, setViewTab] = useState<SectionKey>('section2Data');
  // Filtered summary from SectionDataView (rows/min/median/avg/max);
  // rendered in Slice insights header; cleared on section change or refetch
  const [headerStatsCtx, setHeaderStatsCtx] = useState<{
    stats: SummaryStats;
    display: MetricDisplaySpec;
  } | null>(null);

  // On slice change: select first section with data (skip empty Performance)
  useEffect(() => {
    if (!pageProps) return;
    setViewTab((current) =>
      sectionHasData(pageProps, current) ? current : getFirstSectionWithData(pageProps)
    );
  }, [pageProps]);

  const handleSectionStatsChange = useCallback(
    (payload: { stats: SummaryStats | null; display: MetricDisplaySpec | null }) => {
      if (payload.stats && payload.display) {
        setHeaderStatsCtx({ stats: payload.stats, display: payload.display });
      } else {
        setHeaderStatsCtx(null);
      }
    },
    []
  );

  // Clear stats strip on section/slice change until SectionDataView re-lifts
  useEffect(() => {
    setHeaderStatsCtx(null);
  }, [pageProps, viewTab]);

  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const bulkStartRef = useRef<number>(0);

  const [openClawExporting, setOpenClawExporting] = useState(false);
  const [openClawExportInfo, setOpenClawExportInfo] = useState('');

  const handleOpenClawExport = useCallback(async () => {
    if (!isSuperAdmin) return;

    const seen = new Set<string>();
    const slices: Array<{
      url: string;
      ok: boolean;
      error?: string;
      pageProps?: PageProps;
    }> = [];

    for (const r of bulkResults) {
      if (seen.has(r.url)) continue;
      seen.add(r.url);
      slices.push({
        url: r.url,
        ok: r.ok,
        error: r.error,
        pageProps: r.pageProps,
      });
    }
    if (pageProps && activeUrl && !seen.has(activeUrl)) {
      slices.push({ url: activeUrl, ok: true, pageProps });
    }

    const okCount = slices.filter((s) => s.ok && s.pageProps).length;
    if (okCount === 0) {
      setOpenClawExportInfo('No slice data to export. Run Bulk Search or Inspect a slice first.');
      return;
    }

    setOpenClawExporting(true);
    setOpenClawExportInfo('');
    try {
      const okUrls = slices
        .filter((s) => s.ok && s.pageProps)
        .map((s) => s.url);

      const res = await autopipeAxiosInstance.post<{
        success: boolean;
        exportId: string;
        exportPath: string;
        relativePath: string;
        rootPath: string;
        slicesOk?: number;
        slicesFailed?: number;
        error?: string;
      }>('/api/dashboard/benchmark/export-from-urls', {
        label: `benchmark_${new Date().toISOString().slice(0, 10)}`,
        filters,
        urls: okUrls,
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Export failed');
      }
      const failed = res.data.slicesFailed ?? 0;
      const suffix =
        failed > 0 ? ` (${okCount} loaded, ${failed} failed on server — see manifest failures)` : '';
      setOpenClawExportInfo(
        `OpenClaw export saved: ${res.data.exportPath} (${res.data.slicesOk ?? okCount} slices${suffix}, see latest.json under ${res.data.rootPath})`
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setOpenClawExportInfo(`Export failed: ${msg}`);
    } finally {
      setOpenClawExporting(false);
    }
  }, [activeUrl, bulkResults, filters, isSuperAdmin, pageProps]);

  // -------------------------------------------------------------------------
  // 1. Sitemap loading
  // -------------------------------------------------------------------------
  const loadSitemap = useCallback(async (force = false) => {
    setSitemapLoading(true);
    setSitemapError('');
    try {
      const res = await autopipeAxiosInstance.get<SitemapResponse>('/api/dashboard/benchmark/sitemap', {
        params: force ? { force: 1 } : undefined,
      });
      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Sitemap load failed');
      }
      setSitemap(res.data.items || []);
      setSitemapMeta({
        loadedAt: res.data.loadedAt,
        expiresAt: res.data.expiresAt,
        source: res.data.source,
      });
    } catch (e: any) {
      setSitemapError(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          e?.message ||
          'Failed to load sitemap'
      );
    } finally {
      setSitemapLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSitemap(false);
  }, [loadSitemap]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      if (target.closest('.benchmark-select-dropdown')) return;

      const wrapper = target.closest('.benchmark-select-wrapper');
      const activeId = getActiveBenchmarkComboboxId();
      if (wrapper) {
        const id = wrapper.getAttribute('data-benchmark-combobox');
        if (id && id === activeId) return;
      }
      closeActiveBenchmarkCombobox();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, []);

  // -------------------------------------------------------------------------
  // 2. Cascading filter options
  // -------------------------------------------------------------------------
  const categoryOptions = useMemo(
    () => uniqueSorted(sitemap.map((i) => i.category)),
    [sitemap]
  );

  const subCategoryOptions = useMemo(
    () =>
      uniqueSorted(
        sitemap
          .filter((i) => filters.category === ALL_VALUE || i.category === filters.category)
          .map((i) => i.subCategory)
      ),
    [sitemap, filters.category]
  );

  const subSubCategoryOptions = useMemo(
    () =>
      uniqueSorted(
        sitemap
          .filter(
            (i) =>
              (filters.category === ALL_VALUE || i.category === filters.category) &&
              (filters.subCategory === ALL_VALUE || i.subCategory === filters.subCategory)
          )
          .map((i) => i.subSubCategory)
      ),
    [sitemap, filters.category, filters.subCategory]
  );

  const countryOptions = useMemo(
    () =>
      uniqueSorted(
        sitemap
          .filter(
            (i) =>
              (filters.category === ALL_VALUE || i.category === filters.category) &&
              (filters.subCategory === ALL_VALUE || i.subCategory === filters.subCategory) &&
              (filters.subSubCategory === ALL_VALUE || i.subSubCategory === filters.subSubCategory)
          )
          .map((i) => i.country)
      ),
    [sitemap, filters.category, filters.subCategory, filters.subSubCategory]
  );

  const mediaTypeOptions = useMemo(
    () =>
      uniqueSorted(
        sitemap
          .filter(
            (i) =>
              (filters.category === ALL_VALUE || i.category === filters.category) &&
              (filters.subCategory === ALL_VALUE || i.subCategory === filters.subCategory) &&
              (filters.subSubCategory === ALL_VALUE || i.subSubCategory === filters.subSubCategory) &&
              (filters.country === ALL_VALUE || i.country === filters.country)
          )
          .map((i) => i.mediaType)
      ),
    [sitemap, filters.category, filters.subCategory, filters.subSubCategory, filters.country]
  );

  // Reset downstream filters when their value becomes invalid after upstream change
  useEffect(() => {
    setFilters((f) => {
      const next = { ...f };
      if (next.subCategory !== ALL_VALUE && !subCategoryOptions.includes(next.subCategory))
        next.subCategory = ALL_VALUE;
      if (
        next.subSubCategory !== ALL_VALUE &&
        next.subSubCategory !== NONE_VALUE &&
        !subSubCategoryOptions.includes(next.subSubCategory)
      )
        next.subSubCategory = ALL_VALUE;
      if (next.country !== ALL_VALUE && !countryOptions.includes(next.country))
        next.country = ALL_VALUE;
      if (next.mediaType !== ALL_VALUE && !mediaTypeOptions.includes(next.mediaType))
        next.mediaType = ALL_VALUE;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subCategoryOptions, subSubCategoryOptions, countryOptions, mediaTypeOptions]);

  const toComboOptions = (
    values: string[],
    label: string,
    formatSlug: (v: string) => string = slicePickerSlugToLabel
  ): ComboboxOption[] => [
    { value: ALL_VALUE, label: `All ${toTitleCase(label)} (${values.length})` },
    ...values.map((v) => ({
      value: v || NONE_VALUE,
      label: v ? formatSlug(v) : '— (none) —',
    })),
  ];

  // -------------------------------------------------------------------------
  // 3. Matched slices
  // -------------------------------------------------------------------------
  const matchedItems = useMemo(
    () =>
      sitemap.filter(
        (i) =>
          (filters.category === ALL_VALUE || i.category === filters.category) &&
          (filters.subCategory === ALL_VALUE || i.subCategory === filters.subCategory) &&
          (filters.subSubCategory === ALL_VALUE ||
            (filters.subSubCategory === NONE_VALUE
              ? i.subSubCategory === ''
              : i.subSubCategory === filters.subSubCategory)) &&
          (filters.country === ALL_VALUE || i.country === filters.country) &&
          (filters.mediaType === ALL_VALUE || i.mediaType === filters.mediaType)
      ),
    [sitemap, filters]
  );

  // -------------------------------------------------------------------------
  // 4. Bulk fetch
  // Single fetch removed; Bulk Search with 1 match = one slice, 2+ = batch — same UX
  // -------------------------------------------------------------------------
  const runBulk = async () => {
    if (matchedItems.length === 0 || matchedItems.length > BULK_SEARCH_MAX || bulkRunning) return;
    setBulkRunning(true);
    setBulkResults([]);
    setBulkProgress({ done: 0, total: matchedItems.length });
    bulkStartRef.current = Date.now();

    const queue = [...matchedItems];
    const results: BulkResult[] = new Array(matchedItems.length);
    let pickIdx = 0;
    let completed = 0;

    const worker = async () => {
      while (true) {
        const currentIdx = pickIdx++;
        if (currentIdx >= queue.length) return;
        const item = queue[currentIdx];
        try {
          const res = await autopipeAxiosInstance.get<FetchResponse>('/api/dashboard/benchmark/fetch', {
            params: { url: item.url },
            timeout: 60_000,
          });
          if (!res.data?.success) throw new Error(res.data?.error || 'fetch failed');
          results[currentIdx] = { url: item.url, ok: true, pageProps: res.data.pageProps };
        } catch (e: any) {
          results[currentIdx] = {
            url: item.url,
            ok: false,
            error:
              e?.response?.data?.error ||
              e?.response?.data?.message ||
              e?.message ||
              'failed',
          };
        } finally {
          completed += 1;
          setBulkProgress({ done: completed, total: queue.length });
          if (completed % 4 === 0 || completed === queue.length) {
            setBulkResults(results.filter(Boolean));
          }
        }
      }
    };

    await Promise.all(Array.from({ length: BULK_CONCURRENCY }, () => worker()));
    setBulkResults(results);
    setBulkRunning(false);
  };

  // -------------------------------------------------------------------------
  // 6. Misc
  // -------------------------------------------------------------------------
  const resetFilters = () => {
    setFilters({
      category: ALL_VALUE,
      subCategory: ALL_VALUE,
      subSubCategory: ALL_VALUE,
      country: ALL_VALUE,
      mediaType: ALL_VALUE,
    });
  };

  const slicePoints = useMemo(() => countDataPoints(pageProps), [pageProps]);
  const bulkPct = bulkProgress.total
    ? Math.round((bulkProgress.done / bulkProgress.total) * 100)
    : 0;
  const bulkElapsedMs = bulkRunning ? Date.now() - bulkStartRef.current : 0;
  const bulkEta =
    bulkRunning && bulkProgress.done > 0
      ? Math.max(
          0,
          Math.round(
            ((bulkElapsedMs / bulkProgress.done) * (bulkProgress.total - bulkProgress.done)) / 1000
          )
        )
      : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const pageHelp = useBenchmarkHoverPopover(100);

  return (
    <TooltipProvider delayDuration={150}>
      {/*
        Custom scrollbar (Slice Picker CommandList / any .benchmark-scrollable)
        AppsFinder-style: transparent track + semi-transparent thumb; avoids bulky native bar
       */}
      <style>{`
        .benchmark-scrollable::-webkit-scrollbar { width: 8px; height: 8px; background-color: transparent; }
        .benchmark-scrollable::-webkit-scrollbar-track { background-color: transparent; border-radius: 4px; }
        .benchmark-scrollable::-webkit-scrollbar-thumb {
          background-color: rgba(0,0,0,0.2);
          border-radius: 4px;
          border: 1px solid transparent;
          background-clip: content-box;
        }
        .benchmark-scrollable::-webkit-scrollbar-thumb:hover { background-color: rgba(0,0,0,0.3); }
        .benchmark-scrollable::-webkit-scrollbar-thumb:active { background-color: rgba(0,0,0,0.4); }
        .benchmark-scrollable { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.2) transparent; }
      `}</style>
      <div className="max-w-[1800px] mx-auto p-6">
        <div className="space-y-5">
          {/* --- Page header (matches Dashboard / DispatchAccess pattern) --- */}
          <div className="select-none">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-gray-900 m-0 text-2xl font-bold">Benchmark Explorer</h1>
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                  <span>Browse public AppsFlyer benchmark dataset programmatically</span>
                  <div
                    className="benchmark-help-anchor"
                    onMouseEnter={pageHelp.onPointerEnter}
                    onMouseLeave={pageHelp.onPointerLeave}
                    onFocus={pageHelp.onPointerEnter}
                    onBlur={pageHelp.onPointerLeave}
                  >
                    <button
                      type="button"
                      className="benchmark-help-trigger"
                      aria-label="About Benchmark Explorer"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                    {pageHelp.isVisible && (
                      <div
                        className={`benchmark-help-popover ${
                          pageHelp.isExpanded ? 'is-show' : ''
                        }`}
                        role="tooltip"
                      >
                        Explore AppsFlyer&apos;s public industry benchmarks for your app: pick a
                        market and metric slice to compare performance, or export results for offline
                        review. Data is sourced from AppsFlyer&apos;s public benchmarks site.
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <BenchmarkButton
                  size="sm"
                  onClick={() => loadSitemap(true)}
                  disabled={sitemapLoading}
                >
                  {sitemapLoading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  <span className="benchmark-btn__label">Reload Sitemap</span>
                </BenchmarkButton>
                <a
                  href="https://www.appsflyer.com/benchmarks/"
                  target="_blank"
                  rel="noreferrer"
                  className="benchmark-btn benchmark-btn--sm"
                >
                  <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
                  <span className="benchmark-btn__label">Source</span>
                </a>
              </div>
            </div>
          </div>

          {/* --- KPI stat tiles --- */}
          {/* Note: these 4 icons (Sigma / Crosshair / ScanSearch / LayoutList) are KPI-only on this page;
              must not overlap icons used by Slice picker / Combobox / Slice insights / Bulk results. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              icon={<Sigma className="h-4 w-4" />}
              label="Total slices"
              value={sitemap.length.toLocaleString()}
            />
            <StatTile
              icon={<Crosshair className="h-4 w-4" />}
              label="Match count"
              value={matchedItems.length.toLocaleString()}
            />
            <StatTile
              icon={<ScanSearch className="h-4 w-4" />}
              label="Active slice"
              value={pageProps ? `${slicePoints.toLocaleString()} PTS` : '—'}
            />
            <StatTile
              icon={<LayoutList className="h-4 w-4" />}
              label="Bulk Results"
              value={
                bulkResults.length
                  ? `${bulkResults.filter((r) => r.ok).length} / ${bulkResults.length}`
                  : '—'
              }
            />
          </div>

          {sitemapError && (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">Sitemap load failed:</span> {sitemapError}
              </span>
            </div>
          )}

          {/* --- Filters --- */}
          <section className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">
                  Slice Picker
                </h2>
              </div>
              <BenchmarkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  closeActiveBenchmarkCombobox();
                  resetFilters();
                }}
              >
                <span className="benchmark-btn__label">Reset filters</span>
              </BenchmarkButton>
            </div>

            <div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <Combobox
                  label="Category"
                  icon={<Layers className="h-3 w-3" />}
                  value={filters.category}
                  options={toComboOptions(categoryOptions, 'categories')}
                  onChange={(v: string) => setFilters((f) => ({ ...f, category: v }))}
                  disabled={sitemap.length === 0}
                />
                <Combobox
                  label="Sub-category"
                  icon={<Layers className="h-3 w-3" />}
                  value={filters.subCategory}
                  options={toComboOptions(subCategoryOptions, 'sub-categories')}
                  onChange={(v: string) => setFilters((f) => ({ ...f, subCategory: v }))}
                  disabled={sitemap.length === 0}
                />
                <Combobox
                  label="Segments"
                  icon={<Layers className="h-3 w-3" />}
                  value={filters.subSubCategory}
                  options={toComboOptions(subSubCategoryOptions, 'segments')}
                  onChange={(v: string) => setFilters((f) => ({ ...f, subSubCategory: v }))}
                  disabled={sitemap.length === 0}
                />
                <Combobox
                  label="Country"
                  icon={<Globe2 className="h-3 w-3" />}
                  value={filters.country}
                  options={toComboOptions(countryOptions, 'countries')}
                  onChange={(v: string) => setFilters((f) => ({ ...f, country: v }))}
                  disabled={sitemap.length === 0}
                />
                <Combobox
                  label="Media type"
                  icon={<Activity className="h-3 w-3" />}
                  value={filters.mediaType}
                  options={toComboOptions(mediaTypeOptions, 'channels')}
                  onChange={(v: string) => setFilters((f) => ({ ...f, mediaType: v }))}
                  disabled={sitemap.length === 0}
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                {/*
                  Bulk Search button:
                  - Count in parens tracks filter live (matchedItems from useMemo); no thousands sep
                  - While running: disabled only; no icon swap or spinner —
                    progress shown in separate "Scraping in progress" card below
                 */}
                <BenchmarkButton
                  onClick={runBulk}
                  disabled={
                    matchedItems.length === 0 ||
                    matchedItems.length > BULK_SEARCH_MAX ||
                    bulkRunning
                  }
                  title={
                    matchedItems.length > BULK_SEARCH_MAX
                      ? 'Max 32 slices'
                      : undefined
                  }
                >
                  <Search className="mr-1.5 h-4 w-4" />
                  <span className="benchmark-btn__label">
                    Bulk Search ({matchedItems.length})
                  </span>
                </BenchmarkButton>
                {matchedItems.length > BULK_SEARCH_MAX ? (
                  <span className="text-xs text-rose-700">Max 32 slices</span>
                ) : null}
                <span className="ml-auto text-xs text-slate-400">
                  {sitemapLoading
                    ? 'Loading sitemap...'
                    : sitemapMeta.loadedAt
                    ? `Sitemap cached at ${new Date(sitemapMeta.loadedAt).toLocaleString()}`
                    : ''}
                </span>
              </div>

              <BenchmarkInlineCardMotion show={bulkRunning} className="mt-4">
                <div className="rounded-md border border-sky-200 bg-sky-50/60 p-3">
                  <div className="mb-2 flex items-center justify-between text-xs text-sky-900">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Scraping in progress
                    </span>
                    <span className="font-mono">
                      {bulkProgress.done.toLocaleString()} / {bulkProgress.total.toLocaleString()}
                      {bulkEta !== null && <span className="ml-2 text-sky-700">ETA ~{bulkEta}s</span>}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-sm bg-sky-100">
                    <div
                      className="h-full rounded-sm bg-gradient-to-r from-sky-500 to-violet-500 transition-all duration-300"
                      style={{ width: `${bulkPct}%` }}
                    />
                  </div>
                </div>
              </BenchmarkInlineCardMotion>

            </div>
          </section>

          {/*
            --- Bulk results ---
            Before Slice Insights: Bulk Search first, then Inspect row to drill into details
          */}
          <BenchmarkAnimatedPanel
            show={bulkResults.length > 0}
            className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <LayoutList className="h-4 w-4 text-slate-500" />
                  <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">
                    Bulk Results
                  </h2>
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    {bulkResults.filter((r) => r.ok).length} OK
                  </span>
                  {bulkResults.some((r) => !r.ok) && (
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                      {bulkResults.filter((r) => !r.ok).length} FAIL
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isSuperAdmin && (
                    <BenchmarkButton
                      size="sm"
                      disabled={openClawExporting}
                      onClick={handleOpenClawExport}
                      title="Write AI-ready pack to /tmp/Benckmark/ on server (override: BENCHMARK_OPENCLAW_ROOT)"
                    >
                      {openClawExporting ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FolderOutput className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      <span className="benchmark-btn__label">Export for OpenClaw</span>
                    </BenchmarkButton>
                  )}
                  <BenchmarkButton
                    size="sm"
                    onClick={() =>
                      downloadJson(
                        `benchmark_bulk_${Date.now()}.json`,
                        bulkResults.map((r) =>
                          r.ok
                            ? { url: r.url, ok: true, pageProps: r.pageProps }
                            : { url: r.url, ok: false, error: r.error }
                        )
                      )
                    }
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    <span className="benchmark-btn__label">Download all</span>
                  </BenchmarkButton>
                </div>
              </div>

              {isSuperAdmin && openClawExportInfo && (
                <div
                  className={`mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                    openClawExportInfo.startsWith('Export failed') ||
                    openClawExportInfo.startsWith('No slice')
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  }`}
                >
                  <FolderOutput className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="break-all font-mono">{openClawExportInfo}</span>
                </div>
              )}

              <div>
                <div className="overflow-hidden rounded-md border border-slate-200">
                  <div className="benchmark-scrollable max-h-[440px] overflow-auto">
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                        <tr>
                          {['#', 'Slice', 'Status', 'Data points', ''].map((h, i) => (
                            <th
                              key={i}
                              className={`border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
                                i === 2 || i === 3
                                  ? 'text-center'
                                  : i === 4
                                  ? 'text-right'
                                  : 'text-left'
                              }`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkResults.map((r, idx) => {
                          const points = r.ok ? countDataPoints(r.pageProps) : 0;
                          const slicePath = r.url.replace(
                            /^https:\/\/www\.appsflyer\.com\/benchmarks\//,
                            ''
                          );
                          return (
                            <tr key={idx} className="odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/30">
                              <td className="whitespace-nowrap px-4 py-2 text-slate-400">{idx + 1}</td>
                              <td className="max-w-[640px] truncate px-4 py-2 font-mono text-xs text-slate-700">
                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:text-sky-700 hover:underline"
                                >
                                  {slicePath}
                                </a>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-center">
                                {r.ok ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                    <Check className="h-3 w-3" /> OK
                                  </span>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="inline-flex cursor-help items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                                        <XIcon className="h-3 w-3" /> FAIL
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-sm">{r.error}</TooltipContent>
                                  </Tooltip>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-center font-mono text-slate-700">
                                {points.toLocaleString()}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-right">
                                {r.ok && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveUrl(r.url);
                                      const nextProps = r.pageProps || null;
                                      setPageProps(nextProps);
                                      setViewTab(getFirstSectionWithData(nextProps));
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                    className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline"
                                  >
                                    Inspect <ArrowUpRight className="h-3 w-3" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
          </BenchmarkAnimatedPanel>

          {/* --- Slice detail (Slice Insights) --- */}
          <BenchmarkAnimatedPanel
            show={Boolean(pageProps)}
            className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          >
            {insightsPanelProps ? (
              <>
              {/* Header: left = title + URL; right = stats strip (rows / min / median / avg / max) */}
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-slate-500" />
                    <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">
                      Slice Insights
                    </h2>
                  </div>
                  {activeUrl && (
                    <a
                      href={activeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-sky-700 hover:underline"
                    >
                      {activeUrl}
                      <ArrowUpRight className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                </div>
                {headerStatsCtx && (
                  <InsightStatsStrip
                    stats={headerStatsCtx.stats}
                    formatValue={(v) =>
                      formatBenchmarkMetricValue(v, headerStatsCtx.display)
                    }
                  />
                )}
              </div>

              <div>
                {/*
                  Section tabs: no transition-colors; instant active <-> inactive to avoid
                  bg-slate-900 + text-white 150ms overlap flash. Instant hover too.
                 */}
                <div className="mb-4 flex flex-wrap items-center gap-1">
                  {SECTION_DEFS.map((s) => {
                    const empty = !sectionHasData(insightsPanelProps, s.key);
                    const active = viewTab === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        disabled={empty}
                        onClick={() => setViewTab(s.key)}
                        className={`benchmark-tab benchmark-tab--md benchmark-tab--section ${
                          active ? 'is-active' : ''
                        }`}
                        title={s.description}
                      >
                        <span className="benchmark-btn__label">{s.label}</span>
                      </button>
                    );
                  })}
                </div>

                <SectionDataView
                  metrics={insightsPanelProps[viewTab as SectionKey]}
                  sectionId={
                    SECTION_META.find((m) => m.key === viewTab)?.id ?? 'performance'
                  }
                  sliceUrl={activeUrl}
                  pageProps={insightsPanelProps}
                  onStatsChange={handleSectionStatsChange}
                  onDownloadJson={() =>
                    downloadJson(
                      `benchmark_${(insightsPanelProps.slug || []).join('_') || 'slice'}.json`,
                      { url: activeUrl, pageProps: insightsPanelProps }
                    )
                  }
                />
              </div>
              </>
            ) : null}
          </BenchmarkAnimatedPanel>

          {/* --- Footer disclaimer --- */}
          <div className="benchmark-footer-disclaimer select-none px-2 text-center text-[11px] text-slate-400">
            Data sourced from <a className="hover:underline" href="https://www.appsflyer.com/benchmarks/" target="_blank" rel="noreferrer">www.appsflyer.com/benchmarks</a>.
            Subject to AppsFlyer&apos;s site terms.
            All results in this view are ephemeral and discarded on reload.
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default Benchmark;
