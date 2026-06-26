import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';

import { FieldHint } from './FieldHint';
import { formatBenchmarkQuarterAxis } from '../../lib/benchmark/quarter';
import {
  buildTopCountriesStackedPanels,
  type TopCountriesPlatformPanel,
} from '../../lib/benchmark/topCountriesChart';
import {
  formatBenchmarkMetricValue,
  type MetricDisplaySpec,
} from '../../lib/benchmark/metricFormat';
import type { SectionDatum } from '../../lib/benchmark/types';

const MARGIN = { top: 18, right: 10, bottom: 34, left: 42 };
const HOVER_TRANSITION_MS = 180;
const hoverEase = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
/** Panel enter: opacity + slight rise (wrapper div so SVG hit-testing stays correct). */
const CHART_ENTER_MS = 680;
const chartEnterEase = 'cubic-bezier(0.16, 1, 0.3, 1)';
const MIN_PLOT_INNER_H = 228;
const SEGMENT_STROKE = 'rgba(15, 23, 42, 0.18)';
const SEG_CORNER_R = 3;

type StackPos = 'single' | 'bottom' | 'middle' | 'top';

const Swatch: React.FC<{ color: string }> = ({ color }) => (
  <span
    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
    style={{ backgroundColor: color }}
    aria-hidden
  />
);

function clampSegCornerR(r: number, w: number, h: number): number {
  if (w <= 0 || h <= 0) return 0;
  return Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
}

/** Only the column's outer top is rounded; bottom and internal joints are square. */
function stackedSegmentPath(
  x: number,
  y: number,
  w: number,
  h: number,
  pos: StackPos,
  cornerR: number
): string {
  const rr = clampSegCornerR(cornerR, w, h);
  if (rr <= 0 || pos === 'middle' || pos === 'bottom') {
    return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
  }
  /* `top` and `single`: rounded top corners only */
  return `M ${x + rr} ${y} L ${x + w - rr} ${y} Q ${x + w} ${y} ${x + w} ${y + rr} L ${x + w} ${y + h} L ${x} ${y + h} L ${x} ${y + rr} Q ${x} ${y} ${x + rr} ${y} Z`;
}

type SegmentRect = {
  key: string;
  quarter: string;
  /** Axis label for tooltips (e.g. Q3 '25). */
  quarterLabel: string;
  country: string;
  x: number;
  y: number;
  w: number;
  h: number;
  value: number;
  color: string;
  stackPos: StackPos;
};

type SegmentTooltip = {
  key: string;
  quarterLabel: string;
  country: string;
  value: number;
  color: string;
  anchorX: number;
  anchorY: number;
};

/** Shared plot + legend height so 1–3 panels align when side by side. */
export function computeTopCountriesLayout(
  panels: TopCountriesPlatformPanel[]
): { plotInnerH: number; svgHeight: number; legendHeight: number } {
  if (panels.length === 0) {
    return { plotInnerH: MIN_PLOT_INNER_H, svgHeight: MIN_PLOT_INNER_H + MARGIN.top + MARGIN.bottom, legendHeight: 40 };
  }
  const maxQuarters = Math.max(...panels.map((p) => p.quarters.length), 0);
  const maxCountries = Math.max(...panels.map((p) => p.countries.length), 0);
  const panelBonus = panels.length >= 3 ? 44 : panels.length === 2 ? 20 : 0;
  const plotInnerH =
    MIN_PLOT_INNER_H + Math.min(Math.max(maxQuarters - 4, 0) * 6, 56) + panelBonus;
  const legendRows = Math.max(1, Math.ceil(maxCountries / 3));
  const legendHeight = 26 + legendRows * 22;
  const svgHeight = MARGIN.top + plotInnerH + MARGIN.bottom;
  return { plotInnerH, svgHeight, legendHeight };
}

function layoutStackedBars(
  panel: TopCountriesPlatformPanel,
  innerW: number,
  innerH: number
): { rects: SegmentRect[]; xCenters: number[]; xLabels: string[] } {
  const quarters = panel.quarters.map((q) => q.quarter);
  const x0 = scaleBand<string>().domain(quarters).range([0, innerW]).padding(0.28);
  const barW = x0.bandwidth();

  const rects: SegmentRect[] = [];
  const xCenters: number[] = [];
  const xLabels: string[] = [];

  panel.quarters.forEach((bar) => {
    const x = x0(bar.quarter) ?? 0;
    xCenters.push(x + barW / 2);
    const qLabel = formatBenchmarkQuarterAxis(bar.quarter);
    xLabels.push(qLabel);
    const visible = bar.segments.filter((seg) => (seg.value / 100) * innerH > 0);
    const n = visible.length;
    let yBottom = innerH;
    for (let i = 0; i < n; i++) {
      const seg = visible[i];
      const h = Math.max(0, (seg.value / 100) * innerH);
      yBottom -= h;
      if (h <= 0) continue;
      const stackPos: StackPos =
        n === 1 ? 'single' : i === 0 ? 'bottom' : i === n - 1 ? 'top' : 'middle';
      rects.push({
        key: `${panel.platform}-${bar.quarter}-${seg.country}`,
        quarter: bar.quarter,
        quarterLabel: qLabel,
        country: seg.country,
        x,
        y: yBottom,
        w: barW,
        h,
        value: seg.value,
        color: seg.color,
        stackPos,
      });
    }
  });

  return { rects, xCenters, xLabels };
}

/** Single hit-test: no overlapping transparent rects (avoids hover flicker). */
function pickSegmentAtPlot(
  rects: SegmentRect[],
  mx: number,
  my: number,
  innerW: number,
  innerH: number
): SegmentRect | null {
  if (mx < 0 || my < 0 || mx > innerW || my > innerH) return null;
  const inColumn = rects.filter((r) => mx >= r.x && mx < r.x + r.w);
  if (inColumn.length === 0) return null;
  const topFirst = [...inColumn].sort((a, b) => a.y - b.y);
  for (const r of topFirst) {
    if (my >= r.y && my < r.y + r.h) return r;
  }
  const bottomLast = topFirst[topFirst.length - 1];
  if (my >= bottomLast.y && my <= bottomLast.y + bottomLast.h) return bottomLast;
  return null;
}

const PlatformStackedPanel: React.FC<{
  panel: TopCountriesPlatformPanel;
  display: MetricDisplaySpec;
  plotInnerH: number;
  svgHeight: number;
  legendHeight: number;
  animationKey: string;
}> = ({ panel, display, plotInnerH, svgHeight, legendHeight, animationKey }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const chartMotionRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const hoverKeyRef = useRef<string | null>(null);
  const [width, setWidth] = useState(280);
  const [segmentTooltip, setSegmentTooltip] = useState<SegmentTooltip | null>(null);
  const [highlightedCountry, setHighlightedCountry] = useState<string | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 280);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(80, width - MARGIN.left - MARGIN.right);
  const innerH = plotInnerH;

  const { rects, xCenters, xLabels } = useMemo(
    () => layoutStackedBars(panel, innerW, innerH),
    [panel, innerW, innerH]
  );

  const rectsWithPath = useMemo(
    () =>
      rects.map((r) => ({
        ...r,
        pathD: stackedSegmentPath(r.x, r.y, r.w, r.h, r.stackPos, SEG_CORNER_R),
      })),
    [rects]
  );

  const yTicks = [0, 25, 50, 75, 100];
  const yScale = scaleLinear().domain([0, 100]).range([innerH, 0]);

  useLayoutEffect(() => {
    const el = chartMotionRef.current;
    if (!el || rects.length === 0) return;
    el.style.willChange = 'opacity, transform';
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translate3d(0, 14px, 0)';
    void el.getBoundingClientRect();
    el.style.transition = `opacity ${CHART_ENTER_MS}ms ${chartEnterEase}, transform ${CHART_ENTER_MS}ms ${chartEnterEase}`;
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translate3d(0, 0, 0)';
    });
  }, [animationKey, rects.length]);

  const updateHoverFromEvent = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      const wrap = wrapRef.current;
      if (!svg || !wrap) return;

      let mx: number;
      let my: number;
      try {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const p = pt.matrixTransform(ctm.inverse());
          mx = p.x - MARGIN.left;
          my = p.y - MARGIN.top;
        } else {
          const r = svg.getBoundingClientRect();
          mx = ((e.clientX - r.left) / Math.max(r.width, 1)) * width - MARGIN.left;
          my = ((e.clientY - r.top) / Math.max(r.height, 1)) * svgHeight - MARGIN.top;
        }
      } catch {
        const r = svg.getBoundingClientRect();
        mx = ((e.clientX - r.left) / Math.max(r.width, 1)) * width - MARGIN.left;
        my = ((e.clientY - r.top) / Math.max(r.height, 1)) * svgHeight - MARGIN.top;
      }

      const hit = pickSegmentAtPlot(rects, mx, my, innerW, innerH);
      if (!hit) {
        if (hoverKeyRef.current !== null) {
          hoverKeyRef.current = null;
          setSegmentTooltip(null);
        }
        return;
      }

      if (hoverKeyRef.current === hit.key) return;
      hoverKeyRef.current = hit.key;

      const wrapBox = wrap.getBoundingClientRect();
      const svgBox = svg.getBoundingClientRect();
      const centerXSvg = MARGIN.left + hit.x + hit.w / 2;
      const topYSvg = MARGIN.top + hit.y;
      const anchorX = svgBox.left - wrapBox.left + centerXSvg;
      const anchorY = svgBox.top - wrapBox.top + topYSvg - 4;

      setSegmentTooltip({
        key: hit.key,
        quarterLabel: hit.quarterLabel,
        country: hit.country,
        value: hit.value,
        color: hit.color,
        anchorX,
        anchorY,
      });
    },
    [rects, innerW, innerH, width, svgHeight]
  );

  useEffect(() => {
    hoverKeyRef.current = null;
    setSegmentTooltip(null);
    setHighlightedCountry(null);
  }, [animationKey, panel.platform]);

  const clearHover = useCallback(() => {
    hoverKeyRef.current = null;
    setSegmentTooltip(null);
  }, []);

  const handleLegendMouseMove = useCallback((e: React.MouseEvent<HTMLUListElement>) => {
    const root = legendRef.current;
    if (!root) return;
    const x = e.clientX;
    const y = e.clientY;
    let hit: string | null = null;
    root.querySelectorAll<HTMLElement>('[data-legend-item]').forEach((node) => {
      const r = node.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        const c = node.dataset.country;
        if (c) hit = c;
      }
    });
    setHighlightedCountry((prev) => (prev === hit ? prev : hit));
  }, []);

  const handleLegendMouseLeave = useCallback(() => {
    setHighlightedCountry(null);
  }, []);

  const plotHoverKey = segmentTooltip?.key ?? null;

  return (
    <div className="flex min-w-0 flex-1 flex-col border-slate-200 lg:border-l lg:first:border-l-0">
      <p className="border-b border-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-700">
        {panel.platform}
      </p>
      <div ref={wrapRef} className="relative px-2 pb-2 pt-1">
        {segmentTooltip ? (
          <div
            className="pointer-events-none absolute z-30 min-w-[9.5rem] -translate-x-1/2 -translate-y-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-lg"
            style={{
              left: segmentTooltip.anchorX,
              top: segmentTooltip.anchorY,
            }}
          >
            <p className="font-mono font-semibold text-slate-800">{segmentTooltip.quarterLabel}</p>
            <ul className="mt-1.5 space-y-1">
              <li className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-600">
                  <Swatch color={segmentTooltip.color} />
                  <span className="truncate">{segmentTooltip.country}</span>
                </span>
                <span className="shrink-0 font-mono font-medium tabular-nums text-slate-900">
                  {formatBenchmarkMetricValue(segmentTooltip.value, display)}
                </span>
              </li>
            </ul>
          </div>
        ) : null}

        <div ref={chartMotionRef} className="overflow-visible">
          <svg
            ref={svgRef}
            width={width}
            height={svgHeight}
            className="block w-full cursor-default select-none"
            role="img"
            aria-label={`${panel.platform} country share stacked bars`}
            onMouseMove={updateHoverFromEvent}
            onMouseLeave={clearHover}
          >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            <g aria-hidden className="pointer-events-none">
              {yTicks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={0}
                    x2={innerW}
                    y1={yScale(tick)}
                    y2={yScale(tick)}
                    stroke="#eef2f6"
                    strokeWidth={1}
                  />
                  <text
                    x={-6}
                    y={yScale(tick)}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-slate-400 text-[9px]"
                  >
                    {tick}%
                  </text>
                </g>
              ))}
              <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="#cbd5e1" strokeWidth={1} />
              {xLabels.map((label, i) => (
                <text
                  key={`${xCenters[i]}-${label}`}
                  x={xCenters[i]}
                  y={innerH + 20}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px]"
                >
                  {label}
                </text>
              ))}
            </g>

            <g className="pointer-events-none">
              {rectsWithPath.map((r) => {
                const plotHover = plotHoverKey != null;
                const dimmed = plotHover
                  ? r.key !== plotHoverKey
                  : highlightedCountry != null && r.country !== highlightedCountry;
                const emphasized = plotHover
                  ? r.key === plotHoverKey
                  : highlightedCountry != null && r.country === highlightedCountry;
                return (
                  <path
                    key={r.key}
                    d={r.pathD}
                    fill={r.color}
                    stroke={SEGMENT_STROKE}
                    strokeWidth={emphasized ? 1 : 0.6}
                    opacity={dimmed ? 0.32 : 1}
                    style={{
                      transition: `opacity ${HOVER_TRANSITION_MS}ms ${hoverEase}, filter ${HOVER_TRANSITION_MS}ms ${hoverEase}`,
                      filter: emphasized ? 'brightness(1.06) saturate(1.06)' : undefined,
                    }}
                  />
                );
              })}
            </g>
          </g>
        </svg>
        </div>

        <ul
          ref={legendRef}
          className="mt-1 flex list-none flex-wrap justify-center gap-x-0 gap-y-1.5 px-1"
          style={{ minHeight: legendHeight }}
          onMouseMove={handleLegendMouseMove}
          onMouseLeave={handleLegendMouseLeave}
        >
          {panel.countries.map((country) => {
            const active = highlightedCountry === country;
            const dim = highlightedCountry != null && !active;
            return (
              <li key={country} className="shrink-0">
                <button
                  type="button"
                  data-legend-item
                  data-country={country}
                  aria-pressed={active}
                  onFocus={() => setHighlightedCountry(country)}
                  onBlur={(ev) => {
                    if (!legendRef.current?.contains(ev.relatedTarget as Node)) {
                      setHighlightedCountry(null);
                    }
                  }}
                  className={`flex max-w-[7rem] items-center gap-1 rounded-md px-1 py-2 text-left text-[10px] outline-none transition-colors ${
                    dim ? 'opacity-40' : 'opacity-100'
                  } ${active ? 'bg-slate-50' : 'hover:bg-slate-50'} focus-visible:ring-2 focus-visible:ring-sky-300`}
                >
                  <Swatch color={panel.countryLegendColors[country] ?? '#94a3b8'} />
                  <span className={`truncate font-medium ${active ? 'text-slate-900' : 'text-slate-700'}`}>
                    {country}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export type BenchmarkTopCountriesStackedChartProps = {
  rows: SectionDatum[];
  metricName: string;
  display: MetricDisplaySpec;
  sectionLabel?: string;
  className?: string;
};

export const BenchmarkTopCountriesStackedChart: React.FC<BenchmarkTopCountriesStackedChartProps> = ({
  rows,
  metricName,
  display,
  sectionLabel,
  className = '',
}) => {
  const panels = useMemo(
    () => buildTopCountriesStackedPanels(rows, display),
    [rows, display]
  );

  const animationKey = useMemo(
    () =>
      `${metricName}|${panels.map((p) => `${p.platform}:${p.quarters.length}`).join(';')}`,
    [metricName, panels]
  );

  const layout = useMemo(() => computeTopCountriesLayout(panels), [panels]);

  const title = sectionLabel
    ? `Country split by quarter · ${sectionLabel}`
    : 'Country split by quarter';

  if (panels.length === 0) {
    return (
      <section
        className={`rounded-md border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 shadow-sm ${className}`}
      >
        No Overall / Android / iOS platform rows with country breakdown for the current filters.
      </section>
    );
  }

  return (
    <section
      className={`rounded-md border border-slate-200 bg-white shadow-sm ${className}`}
      aria-label="Top countries stacked chart"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-slate-800">{title}</h3>
          <FieldHint
            spec={{
              title: 'Top countries stacked chart',
              body: 'Hover segments or legend for country share; legend highlights that country across quarters',
            }}
            side="top"
            className="shrink-0"
          />
        </div>
        <span className="shrink-0 truncate text-xs text-slate-500">{metricName}</span>
      </div>

      <div className="flex flex-col lg:flex-row">
        {panels.map((panel) => (
          <PlatformStackedPanel
            key={panel.platform}
            panel={panel}
            display={display}
            plotInnerH={layout.plotInnerH}
            svgHeight={layout.svgHeight}
            legendHeight={layout.legendHeight}
            animationKey={animationKey}
          />
        ))}
      </div>
    </section>
  );
};
