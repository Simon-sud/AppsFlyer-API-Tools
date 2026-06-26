import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { max, min } from 'd3-array';
import { scaleLinear, scalePoint } from 'd3-scale';
import { line, curveMonotoneX } from 'd3-shape';

import { FieldHint } from './FieldHint';
import { CHART_PLATFORM_ORDER, type ChartPlatformId } from '../../lib/benchmark/chartPlatform';
import type { BenchmarkChartPoint } from '../../lib/benchmark/chartSeries';
import { buildBenchmarkPlatformSeries } from '../../lib/benchmark/chartSeries';
import { formatBenchmarkQuarterAxis } from '../../lib/benchmark/quarter';
import { formatBenchmarkMetricValue, type MetricDisplaySpec } from '../../lib/benchmark/metricFormat';
import type { SectionDatum } from '../../lib/benchmark/types';

const CHART_HEIGHT = 280;
const MARGIN = { top: 20, right: 12, bottom: 36, left: 52 };
const ANIM_MS = 720;
const HOVER_TRANSITION_MS = 200;
const hoverEase = 'cubic-bezier(0.25, 0.1, 0.25, 1)';

/** Legend / tooltip color swatch — rounded square (not circle). */
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

/** Snap pointer x to nearest quarter index using half-gap between tick positions. */
function pickQuarterIndex(mx: number, xPositions: number[]): number | null {
  if (xPositions.length === 0) return null;
  if (xPositions.length === 1) return 0;

  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xPositions.length; i++) {
    const d = Math.abs(mx - xPositions[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }

  const leftGap =
    bestIdx > 0 ? (xPositions[bestIdx] - xPositions[bestIdx - 1]) / 2 : Infinity;
  const rightGap =
    bestIdx < xPositions.length - 1
      ? (xPositions[bestIdx + 1] - xPositions[bestIdx]) / 2
      : Infinity;
  const snapRadius = Math.min(leftGap, rightGap) * 1.1;

  return bestDist <= snapRadius ? bestIdx : null;
}

export type BenchmarkQuarterChartProps = {
  rows: SectionDatum[];
  metricName: string;
  display: MetricDisplaySpec;
  sectionLabel?: string;
  className?: string;
};

export const BenchmarkQuarterChart: React.FC<BenchmarkQuarterChartProps> = ({
  rows,
  metricName,
  display,
  sectionLabel,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const linePathRefs = useRef<Partial<Record<ChartPlatformId, SVGPathElement>>>({});
  const areaPathRef = useRef<SVGPathElement | null>(null);
  const gradientId = useId().replace(/:/g, '');

  const [width, setWidth] = useState(640);
  const [highlightedSeries, setHighlightedSeries] = useState<ChartPlatformId | null>(null);
  const [hoverQuarterIdx, setHoverQuarterIdx] = useState<number | null>(null);
  const [tooltipAnchorX, setTooltipAnchorX] = useState(0);

  const { series, quarters } = useMemo(
    () => buildBenchmarkPlatformSeries(rows, display),
    [rows, display]
  );

  const animationKey = useMemo(
    () =>
      `${metricName}|${series.map((s) => `${s.id}:${s.points.map((p) => `${p.quarter}=${p.value}`).join(',')}`).join(';')}`,
    [metricName, series]
  );

  const multiSeries = series.length > 1;
  const canDraw = quarters.length >= 2 && series.length > 0;

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
    if (!canDraw) {
      return {
        yDomain: [0, 1] as [number, number],
        yTicks: [] as number[],
        xPositions: [] as number[],
        xLabels: [] as string[],
        seriesPaths: [] as {
          id: ChartPlatformId;
          color: string;
          lineD: string;
          areaD: string;
          dots: { quarterIdx: number; x: number; y: number; value: number }[];
        }[],
      };
    }

    const allValues = series.flatMap((s) =>
      s.points.map((p) => p.value).filter((v) => Number.isFinite(v))
    );
    let yMin = min(allValues) ?? 0;
    let yMax = max(allValues) ?? 0;
    if (isPercentKind(display.kind)) yMin = Math.min(0, yMin);
    if (yMin === yMax) {
      const pad = Math.abs(yMax) > 0 ? Math.abs(yMax) * 0.15 : 1;
      yMin -= pad;
      yMax += pad;
    } else {
      const pad = (yMax - yMin) * 0.08;
      yMin -= pad;
      yMax += pad;
    }

    const yScale = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);
    const xScale = scalePoint<string>().domain(quarters).range([0, innerW]).padding(0.35);

    const xPositions = quarters.map((q) => xScale(q) ?? 0);
    const xLabels = quarters.map((q) => formatBenchmarkQuarterAxis(q));

    const lineGen = line<BenchmarkChartPoint>()
      .defined((d) => Number.isFinite(d.value))
      .x((d) => xScale(d.quarter) ?? 0)
      .y((d) => yScale(d.value))
      .curve(curveMonotoneX);

    const seriesPaths = series.map((s) => {
      const valid = s.points.filter((p) => Number.isFinite(p.value));
      const lineD = lineGen(s.points) ?? '';
      const firstX = xScale(valid[0]?.quarter ?? quarters[0]) ?? 0;
      const lastX = xScale(valid[valid.length - 1]?.quarter ?? quarters[quarters.length - 1]) ?? innerW;
      const areaD =
        lineD && valid.length > 0
          ? `${lineD} L ${lastX} ${innerH} L ${firstX} ${innerH} Z`
          : '';
      const dots = s.points
        .map((p, quarterIdx) => {
          if (!Number.isFinite(p.value)) return null;
          return {
            quarterIdx,
            x: xScale(p.quarter) ?? 0,
            y: yScale(p.value),
            value: p.value,
          };
        })
        .filter((d): d is NonNullable<typeof d> => d != null);
      return { id: s.id, color: s.color, lineD, areaD, dots };
    });

    return {
      yDomain: [yMin, yMax] as [number, number],
      yTicks: niceYTicks(yMin, yMax, 5),
      xPositions,
      xLabels,
      seriesPaths,
    };
  }, [canDraw, series, quarters, display.kind, innerW, innerH]);

  const yScale = useMemo(
    () => scaleLinear().domain(chartModel.yDomain).range([innerH, 0]),
    [chartModel.yDomain, innerH]
  );

  const updateTooltipAnchor = useCallback(
    (quarterIdx: number) => {
      const svg = svgRef.current;
      const container = containerRef.current;
      const crosshairX = chartModel.xPositions[quarterIdx];
      if (!svg || !container || crosshairX == null) return;
      const svgRect = svg.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setTooltipAnchorX(svgRect.left - containerRect.left + MARGIN.left + crosshairX);
    },
    [chartModel.xPositions]
  );

  const handlePlotMouseMove = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left - MARGIN.left;
      const idx = pickQuarterIndex(mx, chartModel.xPositions);
      setHoverQuarterIdx((prev) => {
        if (prev === idx) return prev;
        if (idx != null) updateTooltipAnchor(idx);
        return idx;
      });
    },
    [chartModel.xPositions, updateTooltipAnchor]
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

  useLayoutEffect(() => {
    if (!canDraw) return;

    CHART_PLATFORM_ORDER.forEach((id) => {
      const el = linePathRefs.current[id];
      if (!el) return;
      const length = el.getTotalLength();
      el.style.transition = 'none';
      el.style.strokeDasharray = `${length} ${length}`;
      el.style.strokeDashoffset = `${length}`;
      void el.getBoundingClientRect();
      el.style.transition = `stroke-dashoffset ${ANIM_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`;
      el.style.strokeDashoffset = '0';
    });

    const area = areaPathRef.current;
    if (area && !multiSeries) {
      area.style.opacity = '0';
      requestAnimationFrame(() => {
        area.style.transition = 'opacity 520ms ease-out';
        area.style.opacity = '1';
      });
    }
  }, [animationKey, canDraw, multiSeries, chartModel.seriesPaths]);

  useEffect(() => {
    if (hoverQuarterIdx != null) updateTooltipAnchor(hoverQuarterIdx);
  }, [width, hoverQuarterIdx, updateTooltipAnchor]);

  const title = sectionLabel ? `Trend by quarter · ${sectionLabel}` : 'Trend by quarter';
  const hoverQuarter = hoverQuarterIdx != null ? quarters[hoverQuarterIdx] : null;
  const crosshairX =
    hoverQuarterIdx != null ? chartModel.xPositions[hoverQuarterIdx] : null;

  const seriesOpacity = (id: ChartPlatformId) => {
    if (!highlightedSeries) return 1;
    return highlightedSeries === id ? 1 : 0.28;
  };

  const tooltipLeft = useMemo(() => {
    if (hoverQuarterIdx == null || !containerRef.current) return null;
    const containerW = containerRef.current.clientWidth || width;
    const half = 76;
    return Math.max(half + 4, Math.min(tooltipAnchorX, containerW - half - 4));
  }, [hoverQuarterIdx, tooltipAnchorX, width]);

  return (
    <section
      className={`rounded-md border border-slate-200 bg-white shadow-sm ${className}`}
      aria-label="Quarter trend chart"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-slate-800">{title}</h3>
          <FieldHint
            spec={{
              title: 'Quarter trend chart',
              body: 'Interactive lines by platform (Overall, Android, iOS). Hover the chart or legend to inspect values',
            }}
            side="top"
            className="shrink-0"
          />
        </div>
        <span className="shrink-0 truncate text-xs text-slate-500">{metricName}</span>
      </div>

      <div className="flex flex-col sm:flex-row">
        <div ref={containerRef} className="relative min-w-0 flex-1 px-2 pb-3 pt-2 sm:px-4">
          {!canDraw ? (
            <div
              className="flex items-center justify-center text-sm text-slate-400"
              style={{ height: CHART_HEIGHT }}
            >
              {series.length === 0
                ? 'No Android, iOS, or Overall platform rows match the current filters.'
                : 'At least two quarters are needed to draw a trend line.'}
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
                aria-label={`Line chart of ${metricName} by quarter and platform`}
              >
                <defs>
                  {!multiSeries && series[0] ? (
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={series[0].color} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={series[0].color} stopOpacity={0.02} />
                    </linearGradient>
                  ) : null}
                </defs>
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                  {/* Grid & axes */}
                  <g aria-hidden className="pointer-events-none">
                    {chartModel.yTicks.map((tick) => {
                      const y = yScale(tick);
                      return (
                        <g key={tick}>
                          <line x1={0} x2={innerW} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
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
                        x={chartModel.xPositions[i]}
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

                  {/* Series geometry — no pointer events (avoids stealing hover from plot layer) */}
                  <g className="pointer-events-none">
                    {!multiSeries && chartModel.seriesPaths[0]?.areaD ? (
                      <path
                        ref={areaPathRef}
                        d={chartModel.seriesPaths[0].areaD}
                        fill={`url(#${gradientId})`}
                        style={{ opacity: seriesOpacity(chartModel.seriesPaths[0].id) }}
                      />
                    ) : null}

                    {chartModel.seriesPaths.map((sp) => {
                      const active =
                        !highlightedSeries || highlightedSeries === sp.id;
                      return (
                        <g key={sp.id} style={{ opacity: seriesOpacity(sp.id) }}>
                          <path
                            ref={(el) => {
                              linePathRefs.current[sp.id] = el ?? undefined;
                            }}
                            d={sp.lineD}
                            fill="none"
                            stroke={sp.color}
                            strokeWidth={active && hoverQuarterIdx != null ? 2.75 : 2.25}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </g>
                      );
                    })}
                  </g>

                  {/* Single plot hit-target — stable quarter snapping */}
                  <rect
                    x={0}
                    y={0}
                    width={innerW}
                    height={innerH}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseMove={handlePlotMouseMove}
                    onMouseLeave={handlePlotMouseLeave}
                  />

                  {/* Crosshair + hover markers — topmost layer, full plot height */}
                  <g className="pointer-events-none" aria-hidden>
                    {crosshairX != null ? (
                      <g
                        style={{
                          transform: `translateX(${crosshairX}px)`,
                          transition: `transform ${HOVER_TRANSITION_MS}ms ${hoverEase}`,
                        }}
                      >
                        <line
                          x1={0}
                          x2={0}
                          y1={0}
                          y2={innerH}
                          stroke="#94a3b8"
                          strokeWidth={1}
                          strokeDasharray="4 3"
                          style={{ shapeRendering: 'crispEdges' }}
                        />
                      </g>
                    ) : null}

                    {hoverQuarterIdx != null
                      ? chartModel.seriesPaths.flatMap((sp) => {
                          const dot = sp.dots.find((d) => d.quarterIdx === hoverQuarterIdx);
                          if (!dot) return [];
                          const dim =
                            highlightedSeries && highlightedSeries !== sp.id;
                          return (
                            <g
                              key={sp.id}
                              style={{
                                transform: `translate(${dot.x - 4}px, ${dot.y - 4}px)`,
                                transition: `transform ${HOVER_TRANSITION_MS}ms ${hoverEase}, opacity 160ms ease-out`,
                                opacity: dim ? 0.35 : 1,
                              }}
                            >
                              <rect
                                x={0}
                                y={0}
                                width={8}
                                height={8}
                                rx={1.5}
                                fill="#fff"
                                stroke={sp.color}
                                strokeWidth={2}
                              />
                            </g>
                          );
                        })
                      : null}
                  </g>
                </g>
              </svg>
            </>
          )}
        </div>

        {canDraw ? (
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
