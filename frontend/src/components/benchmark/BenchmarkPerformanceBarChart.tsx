import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { max, min } from 'd3-array';
import { scaleBand, scaleLinear } from 'd3-scale';

import { FieldHint } from './FieldHint';
import {
  PERFORMANCE_CLUSTER_PLATFORM_ORDER,
  type ChartPlatformId,
} from '../../lib/benchmark/chartPlatform';
import { buildBenchmarkPlatformSeries } from '../../lib/benchmark/chartSeries';
import { formatBenchmarkQuarterAxis } from '../../lib/benchmark/quarter';
import {
  formatBenchmarkMetricValue,
  type MetricDisplaySpec,
} from '../../lib/benchmark/metricFormat';
import type { SectionDatum } from '../../lib/benchmark/types';

const CHART_HEIGHT = 280;
const MARGIN = { top: 20, right: 12, bottom: 36, left: 52 };
const ANIM_MS = 720;
const HOVER_TRANSITION_MS = 200;
const hoverEase = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
const BAR_RX = 3;
const BAR_STROKE = '#0f172a';

type BarGeom = {
  key: string;
  quarterIdx: number;
  platformId: ChartPlatformId;
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  color: string;
};

function barHoverOpacity(
  b: BarGeom,
  hoverQuarterIdx: number | null,
  highlightedSeries: ChartPlatformId | null
): number {
  if (hoverQuarterIdx != null) {
    if (b.quarterIdx !== hoverQuarterIdx) return 0.22;
    if (highlightedSeries && b.platformId !== highlightedSeries) return 0.4;
    return 1;
  }
  if (highlightedSeries) {
    return highlightedSeries === b.platformId ? 1 : 0.28;
  }
  return 1;
}

function barEmphasized(
  b: BarGeom,
  hoverQuarterIdx: number | null,
  highlightedSeries: ChartPlatformId | null
): boolean {
  if (hoverQuarterIdx == null) {
    return !highlightedSeries || highlightedSeries === b.platformId;
  }
  return (
    b.quarterIdx === hoverQuarterIdx &&
    (!highlightedSeries || highlightedSeries === b.platformId)
  );
}

const Swatch: React.FC<{ color: string; className?: string }> = ({ color, className = '' }) => (
  <span
    className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${className}`}
    style={{ backgroundColor: color }}
    aria-hidden
  />
);

function isPercentKind(kind: MetricDisplaySpec['kind']): boolean {
  return kind === 'percent' || kind === 'percent_change' || kind === 'percent_share';
}

function niceYTicks(minV: number, maxV: number, count: number): number[] {
  const span = maxV - minV;
  if (!Number.isFinite(span) || span <= 0) return [minV, maxV];
  const rough = span / Math.max(1, count - 1);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.ceil(rough / pow) * pow;
  const start = Math.floor(minV / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= maxV + step * 0.001; t += step) {
    if (t >= minV - step * 0.001) ticks.push(t);
  }
  if (ticks.length < 2) return [minV, maxV];
  return ticks;
}

function formatYTick(v: number, display: MetricDisplaySpec): string {
  if (isPercentKind(display.kind)) {
    const abs = Math.abs(v);
    if (abs >= 10) return `${v.toFixed(0)}%`;
    if (abs >= 1) return `${v.toFixed(1)}%`;
    return `${v.toFixed(2)}%`;
  }
  return formatBenchmarkMetricValue(v, display);
}

function formatTooltipValue(v: number, display: MetricDisplaySpec): string {
  if (!Number.isFinite(v)) return '—';
  return formatBenchmarkMetricValue(v, display);
}

function pickQuarterIndex(mx: number, xCenters: number[], quarterCount: number): number | null {
  if (quarterCount === 0) return null;
  if (quarterCount === 1) return 0;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xCenters.length; i++) {
    const d = Math.abs(mx - xCenters[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const leftGap =
    bestIdx > 0 ? (xCenters[bestIdx] - xCenters[bestIdx - 1]) / 2 : Infinity;
  const rightGap =
    bestIdx < xCenters.length - 1
      ? (xCenters[bestIdx + 1] - xCenters[bestIdx]) / 2
      : Infinity;
  const snapRadius = Math.min(leftGap, rightGap) * 1.1;
  return bestDist <= snapRadius ? bestIdx : null;
}

export type BenchmarkPerformanceBarChartProps = {
  rows: SectionDatum[];
  metricName: string;
  display: MetricDisplaySpec;
  sectionLabel?: string;
  className?: string;
};

export const BenchmarkPerformanceBarChart: React.FC<BenchmarkPerformanceBarChartProps> = ({
  rows,
  metricName,
  display,
  sectionLabel,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const barPlotGroupRef = useRef<SVGGElement | null>(null);
  const barRefs = useRef<Record<string, SVGRectElement | null>>({});

  const [width, setWidth] = useState(640);
  const [highlightedSeries, setHighlightedSeries] = useState<ChartPlatformId | null>(null);
  const [hoverQuarterIdx, setHoverQuarterIdx] = useState<number | null>(null);
  const [tooltipAnchorX, setTooltipAnchorX] = useState(0);

  const { series, quarters } = useMemo(
    () => buildBenchmarkPlatformSeries(rows, display),
    [rows, display]
  );

  const platformsInCluster = useMemo(
    () => PERFORMANCE_CLUSTER_PLATFORM_ORDER.filter((id) => series.some((s) => s.id === id)),
    [series]
  );

  const hasAnyBar = useMemo(
    () =>
      quarters.length > 0 &&
      series.some((s) => s.points.some((p) => Number.isFinite(p.value))),
    [series, quarters.length]
  );

  const animationKey = useMemo(
    () =>
      `${metricName}|${series.map((s) => `${s.id}:${s.points.map((p) => `${p.quarter}=${p.value}`).join(',')}`).join(';')}`,
    [metricName, series]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 640);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(120, width - MARGIN.left - MARGIN.right);
  const innerH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const chartModel = useMemo(() => {
    if (!hasAnyBar || platformsInCluster.length === 0) {
      return {
        yDomain: [0, 1] as [number, number],
        yTicks: [] as number[],
        xCenters: [] as number[],
        xLabels: [] as string[],
        bars: [] as BarGeom[],
      };
    }

    const vals = series.flatMap((s) =>
      s.points.map((p) => p.value).filter((v) => Number.isFinite(v))
    );
    let yMin = min(vals) ?? 0;
    let yMax = max(vals) ?? 1;
    if (isPercentKind(display.kind) && yMin >= 0) yMin = 0;
    if (yMin === yMax) {
      const pad = Math.abs(yMax) > 0 ? Math.abs(yMax) * 0.12 : 1;
      yMin = Math.min(0, yMin - pad);
      yMax += pad;
    } else {
      const pad = (yMax - yMin) * 0.08;
      yMin = isPercentKind(display.kind) && yMin >= 0 ? 0 : yMin - pad;
      yMax += pad;
    }

    const yScale = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);
    const x0 = scaleBand<string>().domain(quarters).range([0, innerW]).padding(0.28);
    const x1 = scaleBand<ChartPlatformId>()
      .domain(platformsInCluster)
      .range([0, x0.bandwidth()])
      .padding(0.22);

    const xCenters = quarters.map((q) => (x0(q) ?? 0) + x0.bandwidth() / 2);
    const xLabels = quarters.map((q) => formatBenchmarkQuarterAxis(q));

    const bars: BarGeom[] = [];

    quarters.forEach((q, qIdx) => {
      platformsInCluster.forEach((pid) => {
        const s = series.find((x) => x.id === pid);
        const v = s?.points[qIdx]?.value;
        if (!Number.isFinite(v)) return;
        const xBase = x0(q) ?? 0;
        const bx = xBase + (x1(pid) ?? 0);
        const bw = x1.bandwidth();
        const topY = yScale(v as number);
        const h = Math.max(0, innerH - topY);
        if (h <= 0) return;
        bars.push({
          key: `${q}-${pid}`,
          quarterIdx: qIdx,
          platformId: pid,
          x: bx,
          y: topY,
          w: bw,
          h,
          value: v as number,
          color: s!.color,
        });
      });
    });

    return {
      yDomain: [yMin, yMax] as [number, number],
      yTicks: niceYTicks(yMin, yMax, 5),
      xCenters,
      xLabels,
      bars,
    };
  }, [hasAnyBar, series, quarters, platformsInCluster, display.kind, innerW, innerH]);

  const yScale = useMemo(
    () => scaleLinear().domain(chartModel.yDomain).range([innerH, 0]),
    [chartModel.yDomain, innerH]
  );

  const updateTooltipAnchor = useCallback(
    (quarterIdx: number) => {
      const svg = svgRef.current;
      const container = containerRef.current;
      const cx = chartModel.xCenters[quarterIdx];
      if (!svg || !container || cx == null) return;
      const svgRect = svg.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setTooltipAnchorX(svgRect.left - containerRect.left + MARGIN.left + cx);
    },
    [chartModel.xCenters]
  );

  const handlePlotMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left - MARGIN.left;
      const idx = pickQuarterIndex(mx, chartModel.xCenters, quarters.length);
      setHoverQuarterIdx((prev) => {
        if (prev === idx) return prev;
        if (idx != null) updateTooltipAnchor(idx);
        return idx;
      });
    },
    [chartModel.xCenters, quarters.length, updateTooltipAnchor]
  );

  const handlePlotMouseLeave = useCallback(() => {
    setHoverQuarterIdx(null);
  }, []);

  const handleLegendMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const root = legendRef.current;
    if (!root) return;
    const y = e.clientY;
    let hit: ChartPlatformId | null = null;
    root.querySelectorAll<HTMLElement>('[data-legend-item]').forEach((node) => {
      const r = node.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        const id = node.dataset.platformId as ChartPlatformId | undefined;
        if (id) hit = id;
      }
    });
    setHighlightedSeries(hit);
  }, []);

  const handleLegendMouseLeave = useCallback(() => {
    setHighlightedSeries(null);
  }, []);

  useEffect(() => {
    if (hoverQuarterIdx != null) updateTooltipAnchor(hoverQuarterIdx);
  }, [width, hoverQuarterIdx, updateTooltipAnchor]);

  useLayoutEffect(() => {
    if (!hasAnyBar) return;

    const group = barPlotGroupRef.current;
    if (group) {
      group.style.transition = 'none';
      group.style.opacity = '0';
    }

    chartModel.bars.forEach((b) => {
      const el = barRefs.current[b.key];
      if (!el) return;
      el.style.transition = 'none';
      el.setAttribute('y', String(innerH));
      el.setAttribute('height', '0');
    });
    void group?.getBoundingClientRect();

    requestAnimationFrame(() => {
      if (group) {
        group.style.opacity = '1';
      }
      chartModel.bars.forEach((b, i) => {
        const el = barRefs.current[b.key];
        if (!el) return;
        const delay = Math.min(i * 28, 320);
        el.style.transition = `y ${ANIM_MS}ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms, height ${ANIM_MS}ms cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms`;
        el.setAttribute('y', String(b.y));
        el.setAttribute('height', String(b.h));
      });
    });
  }, [animationKey, hasAnyBar, innerH, chartModel.bars]);

  const hoverQuarter = hoverQuarterIdx != null ? quarters[hoverQuarterIdx] : null;

  const tooltipLeft = useMemo(() => {
    if (hoverQuarterIdx == null || !containerRef.current) return null;
    const containerW = containerRef.current.clientWidth || width;
    const half = 76;
    return Math.max(half + 4, Math.min(tooltipAnchorX, containerW - half - 4));
  }, [hoverQuarterIdx, tooltipAnchorX, width]);

  const title = sectionLabel
    ? `Performance by quarter · ${sectionLabel}`
    : 'Performance by quarter';

  return (
    <section
      className={`rounded-md border border-slate-200 bg-white shadow-sm ${className}`}
      aria-label="Performance bar chart"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-slate-800">{title}</h3>
          <FieldHint
            spec={{
              title: 'Performance bar chart',
              body: 'Grouped bars by platform per quarter (median of filtered rows). Hover for values',
            }}
            side="top"
            className="shrink-0"
          />
        </div>
        <span className="shrink-0 truncate text-xs text-slate-500">{metricName}</span>
      </div>

      <div className="flex flex-col sm:flex-row">
        <div ref={containerRef} className="relative min-w-0 flex-1 px-2 pb-3 pt-2 sm:px-4">
          {!hasAnyBar ? (
            <div
              className="flex items-center justify-center text-sm text-slate-400"
              style={{ height: CHART_HEIGHT }}
            >
              {series.length === 0
                ? 'No Android, iOS, or Overall platform rows match the current filters.'
                : 'No numeric values to plot for the current filters.'}
            </div>
          ) : (
            <>
              {hoverQuarter != null && hoverQuarterIdx != null && tooltipLeft != null ? (
                <div
                  className="pointer-events-none absolute top-2 z-20 min-w-[9.5rem] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-lg will-change-[left,transform]"
                  style={{
                    left: tooltipLeft,
                    transition: `left ${HOVER_TRANSITION_MS}ms ${hoverEase}, opacity 160ms ${hoverEase}`,
                  }}
                >
                  <p className="font-mono font-semibold text-slate-800">
                    {formatBenchmarkQuarterAxis(hoverQuarter)}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {series.map((s) => {
                      const pt = s.points[hoverQuarterIdx];
                      const dim =
                        highlightedSeries && highlightedSeries !== s.id ? 'opacity-40' : '';
                      return (
                        <li
                          key={s.id}
                          className={`flex items-center justify-between gap-3 ${dim}`}
                        >
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <Swatch color={s.color} />
                            {s.label}
                          </span>
                          <span className="font-mono font-medium tabular-nums text-slate-900">
                            {formatTooltipValue(pt?.value ?? NaN, display)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <svg
                ref={svgRef}
                width={width}
                height={CHART_HEIGHT}
                className="block max-w-full select-none text-slate-400"
                role="img"
                aria-label={`Bar chart of ${metricName} by quarter and platform`}
              >
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                  <g aria-hidden className="pointer-events-none">
                    {chartModel.yTicks.map((tick) => {
                      const y = yScale(tick);
                      return (
                        <g key={tick}>
                          <text
                            x={-8}
                            y={y}
                            textAnchor="end"
                            dominantBaseline="middle"
                            className="fill-slate-400 text-[10px]"
                          >
                            {formatYTick(tick, display)}
                          </text>
                        </g>
                      );
                    })}
                    <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#cbd5e1" strokeWidth={1} />
                    {chartModel.xLabels.map((label, i) => (
                      <text
                        key={`${quarters[i]}-${label}`}
                        x={chartModel.xCenters[i]}
                        y={innerH + 22}
                        textAnchor="middle"
                        className={`fill-slate-500 text-[10px] ${
                          hoverQuarterIdx === i ? 'font-semibold fill-slate-700' : ''
                        }`}
                      >
                        {label}
                      </text>
                    ))}
                  </g>

                  <g ref={barPlotGroupRef} className="pointer-events-none">
                    {chartModel.bars.map((b) => {
                      const emphasized = barEmphasized(b, hoverQuarterIdx, highlightedSeries);
                      const opacity = barHoverOpacity(b, hoverQuarterIdx, highlightedSeries);
                      return (
                        <rect
                          key={b.key}
                          ref={(el) => {
                            barRefs.current[b.key] = el;
                          }}
                          x={b.x}
                          y={b.y}
                          width={b.w}
                          height={b.h}
                          rx={BAR_RX}
                          ry={BAR_RX}
                          fill={b.color}
                          stroke={BAR_STROKE}
                          strokeWidth={emphasized ? 1.25 : 0.75}
                          opacity={opacity}
                          style={{
                            transition: `opacity ${HOVER_TRANSITION_MS}ms ${hoverEase}, stroke-width ${HOVER_TRANSITION_MS}ms ${hoverEase}`,
                            filter: emphasized ? 'brightness(1.06)' : undefined,
                          }}
                        />
                      );
                    })}
                  </g>

                  <rect
                    x={0}
                    y={0}
                    width={innerW}
                    height={innerH}
                    fill="transparent"
                    className="cursor-default"
                    onMouseMove={handlePlotMouseMove}
                    onMouseLeave={handlePlotMouseLeave}
                  />
                </g>
              </svg>
            </>
          )}
        </div>

        {hasAnyBar ? (
          <div
            ref={legendRef}
            className="flex shrink-0 flex-col border-t border-slate-100 px-4 py-3 sm:w-32 sm:border-l sm:border-t-0"
            onMouseMove={handleLegendMouseMove}
            onMouseLeave={handleLegendMouseLeave}
          >
            <span className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Platform
            </span>
            <div className="flex flex-col gap-0">
              {series.map((s) => {
                const active = highlightedSeries === s.id;
                const dim = highlightedSeries && !active;
                return (
                  <button
                    key={s.id}
                    type="button"
                    data-legend-item
                    data-platform-id={s.id}
                    aria-pressed={active}
                    onFocus={() => setHighlightedSeries(s.id)}
                    onBlur={(ev) => {
                      if (!legendRef.current?.contains(ev.relatedTarget as Node)) {
                        setHighlightedSeries(null);
                      }
                    }}
                    className={`flex w-full items-center gap-2 rounded-md px-1 py-2 text-left text-xs outline-none transition-colors ${
                      dim ? 'opacity-40' : 'opacity-100'
                    } ${active ? 'bg-slate-50' : 'hover:bg-slate-50'} focus-visible:ring-2 focus-visible:ring-sky-300`}
                  >
                    <Swatch color={s.color} />
                    <span className={`font-medium ${active ? 'text-slate-900' : 'text-slate-700'}`}>
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
