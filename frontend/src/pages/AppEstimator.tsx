import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Filter,
  Gauge,
  Globe2,
  HelpCircle,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  Smartphone,
  Star,
  TrendingUp,
} from 'lucide-react';

import { TooltipProvider } from '../components/ui/tooltip';
import {
  BenchmarkCombobox,
  buildComboOptionsWithAll,
} from '../components/benchmark';
import {
  BenchmarkAnimatedPanel,
  BenchmarkButton,
  closeActiveBenchmarkCombobox,
  getActiveBenchmarkComboboxId,
  useBenchmarkHoverPopover,
} from '../components/benchmark/benchmarkMotion';
import {
  fetchAppEstimatorBenchmarks,
  fetchAppEstimatorCalibration,
  fetchAppEstimatorEstimates,
  fetchAppEstimatorOverview,
  fetchAppEstimatorPipeline,
  fetchAppEstimatorSnapshotHistory,
  fetchAppEstimatorSnapshots,
  fetchAppEstimatorVelocity,
} from '../lib/appEstimator/api';
import type {
  AppEstimatorFilters,
  AppEstimatorOverview,
  AppEstimatorPipelineStatus,
  AppEstimatorTab,
  BenchmarkItem,
  CalibrationItem,
  EstimateItem,
  SnapshotItem,
  VelocityItem,
} from '../lib/appEstimator/types';
import {
  AppIdentityCell,
  appDisplayTitle,
} from '../components/appEstimator/AppIdentityCell';
import {
  BENCHMARKS_TAB_HELP,
  CALIBRATION_TAB_HELP,
  CONFIDENCE_FILTER_OPTIONS,
  ESTIMATES_TAB_HELP,
  RATINGS_TAB_HELP,
  RATING_VELOCITY_DAILY_HELP,
  buildSourceQualityFilterOptions,
  confidenceTone,
  formatConfidence,
  formatSourceQuality,
  sourceQualityTone,
} from '../lib/appEstimator/display';
import './Benchmark.css';

const PAGE_SIZE = 50;
const ALL_VALUE = '__ALL__';
const SEARCH_PLACEHOLDER = 'App name / package / bundle';
const SEARCH_CONTROL_MIN_FALLBACK_PX = 248;

const TAB_DEFS: { id: AppEstimatorTab; label: string; description: string }[] = [
  { id: 'overview', label: 'Overview', description: 'Pipeline health and table counts' },
  { id: 'snapshots', label: 'Ratings', description: 'Daily rating snapshots by app and country' },
  { id: 'velocity', label: 'Velocity', description: 'Rating velocity derived from adjacent snapshots' },
  { id: 'benchmarks', label: 'Benchmarks', description: 'Traindate benchmark downloads for calibration' },
  { id: 'calibration', label: 'Calibration', description: 'Effective K coefficients by segment' },
  { id: 'estimates', label: 'Estimates', description: 'Estimated daily and monthly downloads per app' },
];

const pipelineStepTone = (
  status: string
): 'neutral' | 'ok' | 'warn' | 'sky' => {
  switch (status) {
    case 'completed':
      return 'ok';
    case 'running':
      return 'sky';
    case 'failed':
      return 'warn';
    default:
      return 'neutral';
  }
};

const pipelineStepLabel = (status: string): string => {
  switch (status) {
    case 'completed':
      return 'Done';
    case 'running':
      return 'Running';
    case 'failed':
      return 'Failed';
    default:
      return 'Pending';
  }
};

const DailyPipelineMonitor: React.FC<{ pipeline?: AppEstimatorPipelineStatus }> = ({ pipeline }) => {
  if (!pipeline) {
    return (
      <p className="mb-0 text-xs text-slate-500">Pipeline status is not available yet.</p>
    );
  }
  if (!pipeline?.enabled) {
    return (
      <p className="mb-0 text-xs text-slate-500">Daily pipeline scheduler is disabled on the server.</p>
    );
  }
  return (
    <div>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {pipeline.steps.map((step) => (
          <div
            key={step.id}
            className="rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5"
            title={step.error || step.verifiedBy || undefined}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-sm text-slate-700">{step.label}</span>
              <DimChip tone={pipelineStepTone(step.status)}>{pipelineStepLabel(step.status)}</DimChip>
            </div>
            <div className="text-[11px] text-slate-500">
              {step.finishedAt
                ? `Finished ${step.finishedAt.replace('T', ' ').slice(0, 19)}`
                : step.startedAt
                  ? `Started ${step.startedAt.replace('T', ' ').slice(0, 19)}`
                  : 'Not started'}
            </div>
          </div>
        ))}
      </div>

      {pipeline.lastError ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {pipeline.lastError}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>
          Backend runs collect → velocity → calibration → estimates once per day and skips completed steps.
        </span>
        <span>
          {pipeline.lastTickAt ? `Last tick ${pipeline.lastTickAt.replace('T', ' ').slice(0, 19)} UTC` : 'No tick yet'}
        </span>
      </div>
    </div>
  );
};
const formatNum = (n: number | undefined | null): string => {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};


const formatBytes = (bytes?: number): string => {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DimChip: React.FC<{ children: React.ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'sky' }> = ({
  children,
  tone = 'neutral',
}) => {
  const cls =
    tone === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : tone === 'sky'
          ? 'border-sky-200 bg-sky-50 text-sky-700'
          : 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <span
      className={`inline-flex h-5 max-w-full items-center truncate rounded-sm border px-1.5 text-[11px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
};

const EmptyTableRow: React.FC<{ colSpan: number; title: string; hint?: string }> = ({
  colSpan,
  title,
  hint,
}) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-slate-400">
      <div className="flex flex-col items-center gap-1">
        <Inbox className="h-5 w-5 text-slate-300" />
        <span className="font-medium text-slate-500">{title}</span>
        {hint ? <span className="max-w-md text-xs">{hint}</span> : null}
      </div>
    </td>
  </tr>
);

/** App column is always first (left); Platform second when present (center); remaining columns center. */
const colAlign = (index: number) => (index === 0 ? 'text-left' : 'text-center');

const PlatformCell: React.FC<{ platform: string }> = ({ platform }) => (
  <td className="whitespace-nowrap px-4 py-2 text-center capitalize text-slate-700">
    <DimChip>{platform}</DimChip>
  </td>
);

const QualityCell: React.FC<{ sourceQuality: string }> = ({ sourceQuality }) => (
  <td className="whitespace-nowrap px-4 py-2 text-center">
    <DimChip tone={sourceQualityTone(sourceQuality)}>
      {formatSourceQuality(sourceQuality)}
    </DimChip>
  </td>
);

const ConfidenceCell: React.FC<{ confidence: string }> = ({ confidence }) => (
  <td className="whitespace-nowrap px-4 py-2 text-center">
    <DimChip tone={confidenceTone(confidence)}>{formatConfidence(confidence)}</DimChip>
  </td>
);

const toTitleCase = (text: string): string =>
  text
    .split(/([\s/_-]+)/)
    .map((part) =>
      /^[a-zA-Z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
    )
    .join('');

const formatCountryLabel = (code: string): string =>
  /^[a-z]{2}$/i.test(code) ? code.toUpperCase() : toTitleCase(code);

const TablePaginationFooter: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
}> = ({ page, totalPages, total, loading, onPrev, onNext }) => {
  if (total <= 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
      <span>Page {page} / {totalPages}</span>
      {totalPages > 1 ? (
        <div className="flex items-center gap-2">
          <BenchmarkButton size="sm" disabled={page <= 1 || loading} onClick={onPrev}>
            <ChevronLeft className="mr-1 h-3.5 w-3.5" />
            <span className="benchmark-btn__label">Prev</span>
          </BenchmarkButton>
          <BenchmarkButton size="sm" disabled={page >= totalPages || loading} onClick={onNext}>
            <span className="benchmark-btn__label">Next</span>
            <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </BenchmarkButton>
        </div>
      ) : null}
    </div>
  );
};

const AppEstimator: React.FC = () => {
  const [tab, setTab] = useState<AppEstimatorTab>('overview');
  const [overview, setOverview] = useState<AppEstimatorOverview | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<AppEstimatorPipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<AppEstimatorFilters>({
    platform: ALL_VALUE,
    country: ALL_VALUE,
    category: ALL_VALUE,
    search: '',
    calcMethod: 'adjacent',
    sourceQuality: ALL_VALUE,
    confidence: ALL_VALUE,
  });
  const [searchInput, setSearchInput] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [controlMinWidth, setControlMinWidth] = useState(SEARCH_CONTROL_MIN_FALLBACK_PX);

  const [snapshots, setSnapshots] = useState<SnapshotItem[]>([]);
  const [velocity, setVelocity] = useState<VelocityItem[]>([]);
  const [benchmarks, setBenchmarks] = useState<BenchmarkItem[]>([]);
  const [estimates, setEstimates] = useState<EstimateItem[]>([]);
  const [calibration, setCalibration] = useState<CalibrationItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotItem | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<
    { snapshotDate: string; ratingCount: number; avgRating: number; sourceQuality: string }[]
  >([]);

  const platformOptions = overview?.platforms ?? [];
  const countryOptions = overview?.countries ?? [];

  const qualityFilterOptions = useMemo(
    () => [
      { value: ALL_VALUE, label: 'All Qualities' },
      ...buildSourceQualityFilterOptions(overview?.sourceQualities),
    ],
    [overview?.sourceQualities]
  );

  const apiFilters = useMemo(
    () => ({
      platform: filters.platform !== ALL_VALUE ? filters.platform : undefined,
      country: filters.country !== ALL_VALUE ? filters.country : undefined,
      category: filters.category !== ALL_VALUE ? filters.category : undefined,
      search: filters.search || undefined,
      calcMethod: filters.calcMethod || undefined,
      sourceQuality: filters.sourceQuality !== ALL_VALUE ? filters.sourceQuality : undefined,
      confidence: filters.confidence !== ALL_VALUE ? filters.confidence : undefined,
    }),
    [filters]
  );

  const loadOverview = useCallback(async () => {
    const data = await fetchAppEstimatorOverview();
    if (!data.success) throw new Error(data.error || 'Failed to load overview');
    setOverview(data);
    if (data.pipeline) setPipelineStatus(data.pipeline);
  }, []);

  const refreshPipeline = useCallback(async () => {
    try {
      const res = await fetchAppEstimatorPipeline();
      if (res.success && res.pipeline) {
        setPipelineStatus(res.pipeline);
        if (overview) {
          setOverview((prev) => (prev ? { ...prev, pipeline: res.pipeline } : prev));
        }
      }
    } catch {
      /* ignore background refresh errors */
    }
  }, [overview]);

  const loadTabData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = {
        page,
        pageSize: PAGE_SIZE,
        ...apiFilters,
      };

      if (tab === 'overview') {
        await loadOverview();
        setTotal(0);
      } else if (tab === 'snapshots') {
        const res = await fetchAppEstimatorSnapshots(query);
        if (!res.success) throw new Error(res.error || 'Failed to load snapshots');
        setSnapshots(res.items);
        setTotal(res.total);
      } else if (tab === 'velocity') {
        const res = await fetchAppEstimatorVelocity(query);
        if (!res.success) throw new Error(res.error || 'Failed to load velocity');
        setVelocity(res.items);
        setTotal(res.total);
      } else if (tab === 'benchmarks') {
        const res = await fetchAppEstimatorBenchmarks(query);
        if (!res.success) throw new Error(res.error || 'Failed to load benchmarks');
        setBenchmarks(res.items);
        setTotal(res.total);
        if (res.categories?.length) setCategories(res.categories);
      } else if (tab === 'estimates') {
        const res = await fetchAppEstimatorEstimates({ ...query, latestOnly: true });
        if (!res.success) throw new Error(res.error || 'Failed to load estimates');
        setEstimates(res.items);
        setTotal(res.total);
      } else if (tab === 'calibration') {
        const res = await fetchAppEstimatorCalibration(query);
        if (!res.success) throw new Error(res.error || 'Failed to load calibration');
        setCalibration(res.items);
        setTotal(res.total);
        if (res.categories?.length) setCategories(res.categories);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setError(msg);
    } finally {
      setLoading(false);
      setSearchLoading(false);
    }
  }, [tab, page, apiFilters, loadOverview]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  useEffect(() => {
    if (tab !== 'overview') return undefined;
    const needsPoll =
      pipelineStatus?.running ||
      (pipelineStatus?.overall !== 'completed' && pipelineStatus?.enabled !== false);
    if (!needsPoll) return undefined;
    const id = window.setInterval(() => void refreshPipeline(), 15000);
    return () => window.clearInterval(id);
  }, [tab, pipelineStatus?.running, pipelineStatus?.overall, pipelineStatus?.enabled, refreshPipeline]);

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

  useEffect(() => {
    setPage(1);
    setSelectedSnapshot(null);
    setHistory([]);
  }, [tab, filters.platform, filters.country, filters.category, filters.search, filters.calcMethod, filters.sourceQuality, filters.confidence]);

  useEffect(() => {
    if (filters.sourceQuality === ALL_VALUE) return;
    const allowed = qualityFilterOptions.map((o) => o.value);
    if (!allowed.includes(filters.sourceQuality)) {
      setFilters((f) => ({ ...f, sourceQuality: ALL_VALUE }));
    }
  }, [qualityFilterOptions, filters.sourceQuality]);

  const loadHistory = async (row: SnapshotItem) => {
    setSelectedSnapshot(row);
    setHistoryLoading(true);
    try {
      const res = await fetchAppEstimatorSnapshotHistory({
        platform: row.platform,
        appId: row.appId || undefined,
        package: row.package || undefined,
        country: row.country,
      });
      setHistory(res.items ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPipeline = pipelineStatus ?? overview?.pipeline;

  const pipelineCards = useMemo(() => {
    const counts = overview?.counts ?? {};
    return [
      { key: 'rating_snapshots', label: 'Rating Snapshots', count: counts.rating_snapshots ?? 0 },
      { key: 'rating_velocity', label: 'Rating Velocity', count: counts.rating_velocity ?? 0 },
      { key: 'traindate_benchmarks', label: 'Traindate Benchmarks', count: counts.traindate_benchmarks ?? 0 },
      { key: 'countries', label: 'Countries', count: countryOptions.length },
      { key: 'k_calibration', label: 'K Calibration', count: counts.k_calibration ?? 0 },
      { key: 'download_estimates', label: 'Download Estimates', count: counts.download_estimates ?? 0 },
    ];
  }, [overview, countryOptions.length]);

  const resetFilters = () => {
    setFilters({
      platform: ALL_VALUE,
      country: ALL_VALUE,
      category: ALL_VALUE,
      search: '',
      calcMethod: 'adjacent',
      sourceQuality: ALL_VALUE,
      confidence: ALL_VALUE,
    });
    setSearchInput('');
    setPage(1);
  };

  const applySearch = () => {
    setSearchLoading(true);
    setFilters((f) => ({ ...f, search: searchInput.trim() }));
    setPage(1);
  };

  const tabTitle = TAB_DEFS.find((t) => t.id === tab)?.label ?? 'Data';
  const showDataFilters = tab !== 'overview';
  const pageHelp = useBenchmarkHoverPopover(100);

  useEffect(() => {
    if (!showDataFilters || tab === 'calibration') return undefined;

    let w = SEARCH_CONTROL_MIN_FALLBACK_PX;
    if (typeof document !== 'undefined') {
      const probe = document.createElement('span');
      probe.textContent = SEARCH_PLACEHOLDER;
      probe.style.cssText =
        'position:absolute;visibility:hidden;white-space:nowrap;font:14px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
      document.body.appendChild(probe);
      w = Math.ceil(probe.getBoundingClientRect().width + 48);
      document.body.removeChild(probe);
    }
    setControlMinWidth(w);

    return undefined;
  }, [showDataFilters, tab]);

  const filterRowStyle = useMemo(
    () =>
      ({ '--app-estimator-control-min-width': `${controlMinWidth}px` }) as React.CSSProperties,
    [controlMinWidth]
  );

  const tablePagination = (
    <TablePaginationFooter
      page={page}
      totalPages={totalPages}
      total={total}
      loading={loading}
      onPrev={() => setPage((p) => Math.max(1, p - 1))}
      onNext={() => setPage((p) => p + 1)}
    />
  );

  const tableWrap = (children: React.ReactNode, maxH = 'max-h-[520px]') => (
    <div className="overflow-hidden rounded-md border border-slate-200">
      <div className={`benchmark-scrollable ${maxH} overflow-auto`}>{children}</div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
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
          <div className="select-none">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-gray-900 m-0 text-2xl font-bold">App Estimator</h1>
                <div className="mt-2 flex items-center gap-2 text-sm text-gray-700">
                  <span>Explore app download estimates from store ratings and benchmark data</span>
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
                      aria-label="About App Estimator"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                    {pageHelp.isVisible && (
                      <div
                        className={`benchmark-help-popover ${pageHelp.isExpanded ? 'is-show' : ''}`}
                        role="tooltip"
                      >
                        View rating trends, benchmark downloads, and calibration metrics by app
                        and market. Switch tabs to explore each dataset.
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <BenchmarkButton size="sm" onClick={() => void loadTabData()} disabled={loading}>
                  {loading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  <span className="benchmark-btn__label">Refresh</span>
                </BenchmarkButton>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">Request failed:</span> {error}
              </span>
            </div>
          )}

          <section className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-slate-500" />
                <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">
                  Data Explorer
                </h2>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-1">
              {TAB_DEFS.map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`benchmark-tab benchmark-tab--md benchmark-tab--section ${
                      active ? 'is-active' : ''
                    }`}
                    title={t.description}
                  >
                    <span className="benchmark-btn__label">{t.label}</span>
                  </button>
                );
              })}
            </div>

            {showDataFilters ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-slate-500" />
                    <h3 className="m-0 text-sm font-semibold text-slate-700">Filters</h3>
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
                    <span className="benchmark-btn__label">Reset Filters</span>
                  </BenchmarkButton>
                </div>

                <div className="app-estimator-filter-row flex flex-wrap items-end gap-4" style={filterRowStyle}>
                  <BenchmarkCombobox
                    label="Platform"
                    icon={<Smartphone className="h-3 w-3" />}
                    value={filters.platform}
                    options={buildComboOptionsWithAll(
                      platformOptions,
                      'Platforms',
                      ALL_VALUE,
                      (v) => toTitleCase(v)
                    )}
                    onChange={(v) => setFilters((f) => ({ ...f, platform: v }))}
                    disabled={!overview}
                    hideSearch
                    filterStyle
                    labelCase="title"
                  />
                  <BenchmarkCombobox
                    label="Country"
                    icon={<Globe2 className="h-3 w-3" />}
                    value={filters.country}
                    options={buildComboOptionsWithAll(countryOptions, 'Countries', ALL_VALUE, (v) =>
                      formatCountryLabel(v)
                    )}
                    onChange={(v) => setFilters((f) => ({ ...f, country: v }))}
                    disabled={!overview}
                    filterStyle
                    labelCase="title"
                  />
                  {tab === 'snapshots' && qualityFilterOptions.length > 1 ? (
                    <BenchmarkCombobox
                      label="Quality"
                      icon={<Star className="h-3 w-3" />}
                      value={filters.sourceQuality}
                      options={qualityFilterOptions}
                      onChange={(v) => setFilters((f) => ({ ...f, sourceQuality: v }))}
                      hideSearch
                      filterStyle
                      labelCase="title"
                    />
                  ) : null}
                  {tab === 'benchmarks' || tab === 'calibration' ? (
                    <BenchmarkCombobox
                      label="Category"
                      icon={<BarChart3 className="h-3 w-3" />}
                      value={filters.category}
                      options={buildComboOptionsWithAll(categories, 'Categories', ALL_VALUE, (v) =>
                        toTitleCase(v)
                      )}
                      onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
                      disabled={categories.length === 0}
                      filterStyle
                      labelCase="title"
                    />
                  ) : null}
                  {tab === 'velocity' || tab === 'estimates' ? (
                    <>
                      <BenchmarkCombobox
                        label="Confidence"
                        icon={<Gauge className="h-3 w-3" />}
                        value={filters.confidence}
                        options={[
                          { value: ALL_VALUE, label: 'All Confidences' },
                          ...CONFIDENCE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
                        ]}
                        onChange={(v) => setFilters((f) => ({ ...f, confidence: v }))}
                        hideSearch
                        filterStyle
                        labelCase="title"
                      />
                      {tab === 'velocity' ? (
                        <BenchmarkCombobox
                          label="Calc Method"
                          icon={<TrendingUp className="h-3 w-3" />}
                          value={filters.calcMethod}
                          options={[
                            { value: 'adjacent', label: 'Adjacent' },
                            { value: 'window_7d', label: 'Window 7d' },
                            { value: 'window_14d', label: 'Window 14d' },
                          ]}
                          onChange={(v) => setFilters((f) => ({ ...f, calcMethod: v }))}
                          hideSearch
                          filterStyle
                          labelCase="title"
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>

                {tab !== 'calibration' ? (
                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                    <div className="app-estimator-search-field flex min-w-[240px] flex-1 items-center gap-2">
                      <div className="app-estimator-search-wrap">
                        <input
                          type="text"
                          value={searchInput}
                          onChange={(e) => setSearchInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && applySearch()}
                          placeholder={SEARCH_PLACEHOLDER}
                          className="app-estimator-search-input"
                        />
                      </div>
                      <BenchmarkButton onClick={applySearch} disabled={searchLoading}>
                        {searchLoading ? (
                          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="mr-1.5 h-4 w-4" />
                        )}
                        <span className="benchmark-btn__label">Search</span>
                      </BenchmarkButton>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          <BenchmarkAnimatedPanel
            show={tab === 'overview'}
            className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          >
            {loading && !overview ? (
              <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading overview…
              </div>
            ) : overview ? (
              <>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-slate-500" />
                    <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">
                      Estimator Overview
                    </h2>
                  </div>
                  <span className="text-xs text-slate-400">
                    DB {formatBytes(overview.dbSizeBytes)} · snapshots{' '}
                    {overview.ranges?.snapshots?.min || '—'} → {overview.ranges?.snapshots?.max || '—'}
                  </span>
                </div>

                <div className="mb-4 border-t border-slate-100 pt-4">
                  <DailyPipelineMonitor pipeline={currentPipeline} />
                </div>

                <div className="space-y-2.5">
                  {pipelineCards.map((card) => (
                    <div
                      key={card.key}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-slate-50/40 px-3.5 py-2.5"
                    >
                      <span className="text-sm font-medium text-slate-700">{card.label}</span>
                      <span
                        className={`font-mono text-sm font-semibold tabular-nums ${
                          card.count > 0 ? 'text-slate-900' : 'text-amber-600'
                        }`}
                      >
                        {formatNum(card.count)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </BenchmarkAnimatedPanel>

          <BenchmarkAnimatedPanel
            show={tab === 'snapshots'}
            className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-slate-500" />
                  <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">
                    {tabTitle}
                  </h2>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </div>
                <span className="text-xs text-slate-400">{formatNum(total)} Counts</span>
              </div>
              <p className="mb-0 mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-500">
                {RATINGS_TAB_HELP}
              </p>
            </div>

            {tableWrap(
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr>
                    {['App', 'Platform', 'Quality', 'Country', 'Ratings', 'Avg', 'Date'].map((h, i) => (
                      <th
                        key={h}
                        className={`border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${colAlign(i)}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((row, i) => (
                    <tr
                      key={`${row.platform}-${row.appId}-${row.country}-${i}`}
                      className={`cursor-pointer odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/30 ${
                        selectedSnapshot === row ? 'bg-sky-50/50' : ''
                      }`}
                      onClick={() => void loadHistory(row)}
                    >
                      <td className="max-w-[280px] px-4 py-2 text-left">
                        <AppIdentityCell {...row} sourceUrl={row.sourceUrl} />
                      </td>
                      <PlatformCell platform={row.platform} />
                      <QualityCell sourceQuality={row.sourceQuality} />
                      <td className="whitespace-nowrap px-4 py-2 text-center text-slate-700">{row.country}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-center font-mono text-slate-900">
                        {formatNum(row.ratingCount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-center font-mono text-slate-700">
                        {row.avgRating?.toFixed(2) ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-center text-slate-600">{row.snapshotDate}</td>
                    </tr>
                  ))}
                  {snapshots.length === 0 && !loading ? (
                    <EmptyTableRow
                      colSpan={7}
                      title="No rating snapshots"
                      hint="Check filters or wait for the daily pipeline collect step."
                    />
                  ) : null}
                </tbody>
              </table>
            )}

            {selectedSnapshot ? (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50/40 p-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-800">
                  History — {appDisplayTitle(selectedSnapshot)} / {selectedSnapshot.country}
                </h3>
                {historyLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : history.length === 0 ? (
                  <p className="text-sm text-slate-500">No history points.</p>
                ) : (
                  tableWrap(
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                        <tr>
                          {['Date', 'Ratings', 'Avg', 'Quality'].map((h, i) => (
                            <th
                              key={h}
                              className={`border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${colAlign(i)}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h) => (
                          <tr key={h.snapshotDate} className="odd:bg-white even:bg-slate-50/40">
                            <td className="px-4 py-2 text-left text-slate-700">{h.snapshotDate}</td>
                            <td className="px-4 py-2 text-center font-mono">{formatNum(h.ratingCount)}</td>
                            <td className="px-4 py-2 text-center font-mono">
                              {h.avgRating?.toFixed(2) ?? '—'}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <DimChip tone={sourceQualityTone(h.sourceQuality)}>
                                {formatSourceQuality(h.sourceQuality)}
                              </DimChip>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>,
                    'max-h-[280px]'
                  )
                )}
              </div>
            ) : null}
            {tablePagination}
          </BenchmarkAnimatedPanel>

          <BenchmarkAnimatedPanel
            show={tab === 'velocity'}
            className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-slate-500" />
                  <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">{tabTitle}</h2>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </div>
                <span className="text-xs text-slate-400">{formatNum(total)} Counts</span>
              </div>
              <p className="mb-0 mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-500">
                {RATING_VELOCITY_DAILY_HELP}
              </p>
            </div>
            {tableWrap(
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr>
                    {['App', 'Platform', 'Confidence', 'Country', 'Velocity / day', 'As of'].map((h, i) => (
                      <th
                        key={h}
                        className={`border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${colAlign(i)}`}
                        title={h === 'Velocity / day' ? RATING_VELOCITY_DAILY_HELP : undefined}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {velocity.map((row, i) => (
                    <tr key={`${row.appId}-${row.country}-${i}`} className="odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/30">
                      <td className="max-w-[280px] px-4 py-2 text-left">
                        <AppIdentityCell {...row} />
                      </td>
                      <PlatformCell platform={row.platform} />
                      <ConfidenceCell confidence={row.confidence} />
                      <td className="px-4 py-2 text-center text-slate-700">{row.country}</td>
                      <td className="px-4 py-2 text-center font-mono text-slate-900">
                        {formatNum(row.ratingVelocityDaily)}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-600">{row.asOfDate}</td>
                    </tr>
                  ))}
                  {velocity.length === 0 && !loading ? (
                    <EmptyTableRow colSpan={6} title="No velocity records" />
                  ) : null}
                </tbody>
              </table>
            )}
            {tablePagination}
          </BenchmarkAnimatedPanel>

          <BenchmarkAnimatedPanel
            show={tab === 'benchmarks'}
            className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-500" />
                  <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">{tabTitle}</h2>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </div>
                <span className="text-xs text-slate-400">{formatNum(total)} Counts</span>
              </div>
              <p className="mb-0 mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-500">
                {BENCHMARKS_TAB_HELP}
              </p>
            </div>
            {tableWrap(
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr>
                    {['App', 'Platform', 'Country', 'Category', 'Downloads', 'Report period'].map(
                      (h, i) => (
                        <th
                          key={h}
                          className={`border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${colAlign(i)}`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {benchmarks.map((row, i) => (
                    <tr key={`${row.appId}-${row.country}-${i}`} className="odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/30">
                      <td className="max-w-[280px] px-4 py-2 text-left">
                        <AppIdentityCell {...row} />
                      </td>
                      <PlatformCell platform={row.platform} />
                      <td className="px-4 py-2 text-center text-slate-700">{row.country}</td>
                      <td className="max-w-[160px] truncate px-4 py-2 text-center text-xs text-slate-600">
                        {row.categoryName || row.category}
                      </td>
                      <td className="px-4 py-2 text-center font-mono text-sm font-semibold text-slate-900">
                        {formatNum(row.downloads)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-center text-xs text-slate-500">
                        {row.reportStart} — {row.reportEnd}
                      </td>
                    </tr>
                  ))}
                  {benchmarks.length === 0 && !loading ? (
                    <EmptyTableRow colSpan={6} title="No traindate benchmarks" />
                  ) : null}
                </tbody>
              </table>
            )}
            {tablePagination}
          </BenchmarkAnimatedPanel>

          <BenchmarkAnimatedPanel
            show={tab === 'calibration'}
            className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-slate-500" />
                  <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">{tabTitle}</h2>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </div>
                <span className="text-xs text-slate-400">{formatNum(total)} Counts</span>
              </div>
              <p className="mb-0 mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-500">
                {CALIBRATION_TAB_HELP}
              </p>
            </div>
            {tableWrap(
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr>
                    {['Platform', 'Category', 'Country', 'Effective K', 'Samples', 'MAPE'].map(
                      (h, i) => (
                        <th
                          key={h}
                          className={`border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${i === 0 ? 'text-left' : 'text-center'}`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {calibration.map((row, i) => (
                    <tr
                      key={`${row.platform}-${row.category}-${row.country}-${i}`}
                      className="odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/30"
                    >
                      <td className="px-4 py-2 capitalize text-slate-700">
                        <DimChip>{row.platform}</DimChip>
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2 text-center text-xs text-slate-600">
                        {row.category}
                      </td>
                      <td className="px-4 py-2 text-center text-slate-700">{row.country}</td>
                      <td className="px-4 py-2 text-center font-mono text-slate-900">
                        {row.effectiveK?.toFixed(4) ?? '—'}
                      </td>
                      <td className="px-4 py-2 text-center font-mono text-slate-700">
                        {formatNum(row.sampleCount)}
                      </td>
                      <td className="px-4 py-2 text-center font-mono text-slate-700">
                        {row.mape != null ? `${(row.mape * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                  {calibration.length === 0 && !loading ? (
                    <EmptyTableRow
                      colSpan={6}
                      title="No K calibration rows"
                      hint="Runs automatically after daily pipeline calibration step."
                    />
                  ) : null}
                </tbody>
              </table>
            )}
            {tablePagination}
          </BenchmarkAnimatedPanel>

          <BenchmarkAnimatedPanel
            show={tab === 'estimates'}
            className="select-none rounded-md border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-slate-500" />
                  <h2 className="m-0 text-base font-semibold tracking-tight text-slate-800">{tabTitle}</h2>
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </div>
                <span className="text-xs text-slate-400">{formatNum(total)} Counts</span>
              </div>
              <p className="mb-0 mt-1.5 max-w-3xl text-xs leading-relaxed text-slate-500">
                {ESTIMATES_TAB_HELP}
              </p>
            </div>
            {tableWrap(
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
                  <tr>
                    {[
                      'App',
                      'Platform',
                      'Confidence',
                      'Country',
                      'Est / day',
                      'Est / month',
                      'Velocity / day',
                      'As of',
                    ].map((h, i) => (
                      <th
                        key={h}
                        className={`border-b border-slate-200 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${colAlign(i)}`}
                        title={h === 'Velocity / day' ? RATING_VELOCITY_DAILY_HELP : undefined}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {estimates.map((row, i) => (
                    <tr
                      key={`${row.appId}-${row.country}-${row.estimateDate}-${i}`}
                      className="odd:bg-white even:bg-slate-50/40 hover:bg-sky-50/30"
                    >
                      <td className="max-w-[280px] px-4 py-2 text-left">
                        <AppIdentityCell {...row} />
                      </td>
                      <PlatformCell platform={row.platform} />
                      <ConfidenceCell confidence={row.confidence} />
                      <td className="px-4 py-2 text-center text-slate-700">{row.country}</td>
                      <td className="px-4 py-2 text-center font-mono text-sm font-semibold text-slate-900">
                        {formatNum(row.estDailyDownloads)}
                      </td>
                      <td className="px-4 py-2 text-center font-mono text-sm font-semibold text-slate-900">
                        {formatNum(row.estMonthlyDownloads)}
                      </td>
                      <td className="px-4 py-2 text-center font-mono text-slate-700">
                        {formatNum(row.ratingVelocityDaily)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-center text-xs text-slate-500">
                        {row.estimateDate}
                      </td>
                    </tr>
                  ))}
                  {estimates.length === 0 && !loading ? (
                    <EmptyTableRow
                      colSpan={8}
                      title="No download estimates"
                      hint="Runs automatically when the daily pipeline completes the estimate step."
                    />
                  ) : null}
                </tbody>
              </table>
            )}
            {tablePagination}
          </BenchmarkAnimatedPanel>

          <div className="benchmark-footer-disclaimer select-none px-2 text-center text-[11px] text-slate-400">
            Data is updated periodically.
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default AppEstimator;
