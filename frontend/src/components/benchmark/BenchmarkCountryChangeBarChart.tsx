import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { scaleBand, scaleLinear } from 'd3-scale';

import { FieldHint } from './FieldHint';
import {
  buildCountryChangePanels,
  type CountryChangeBar,
  type CountryChangePanel,
} from '../../lib/benchmark/countryChangeChart';
import {
  formatBenchmarkMetricValue,
  type MetricDisplaySpec,
} from '../../lib/benchmark/metricFormat';
import type { SectionDatum } from '../../lib/benchmark/types';

const CHART_HEIGHT = 300;
const MARGIN = { top: 18, right: 10, bottom: 56, left: 48 };
const HOVER_TRANSITION_MS = 200;
const hoverEase = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
const BAR_CORNER_R = 3;
const ANIM_MS = 640;

/** Positive change — mint (AppsFlyer movers & shakers). */
const POS_FILL = '#5eead4';
/** Negative change — pale teal wash. */
const NEG_FILL = '#ccfbf1';
const BAR_STROKE = 'rgba(15, 23, 42, 0.22)';
const ZERO_LINE = '#0f172a';

function clampCornerR(r: number, w: number, h: number): number {
  if (w <= 0 || h <= 0) return 0;
  return Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
}

/** Rounded top only (sits on 0 baseline, grows upward in SVG = smaller y). */
function pathPositiveBar(x: number, yTop: number, w: number, h: number, cornerR: number): string {
  const rr = clampCornerR(cornerR, w, h);
  if (rr <= 0) {
    return `M ${x} ${yTop} L ${x + w} ${yTop} L ${x + w} ${yTop + h} L ${x} ${yTop + h} Z`;
  }
  return `M ${x + rr} ${yTop} L ${x + w - rr} ${yTop} Q ${x + w} ${yTop} ${x + w} ${yTop + rr} L ${x + w} ${yTop + h} L ${x} ${yTop + h} L ${x} ${yTop + rr} Q ${x} ${yTop} ${x + rr} ${yTop} Z`;
}

/** Rounded bottom only (hangs below 0 baseline). */
function pathNegativeBar(x: number, yTop: number, w: number, h: number, cornerR: number): string {
  const rr = clampCornerR(cornerR, w, h);
  if (rr <= 0) {
    return `M ${x} ${yTop} L ${x + w} ${yTop} L ${x + w} ${yTop + h} L ${x} ${yTop + h} Z`;
  }
  return `M ${x} ${yTop} L ${x + w} ${yTop} L ${x + w} ${yTop + h - rr} Q ${x + w} ${yTop + h} ${x + w - rr} ${yTop + h} L ${x + rr} ${yTop + h} Q ${x} ${yTop + h} ${x} ${yTop + h - rr} L ${x} ${yTop} Z`;
}

type BarGeom = {
  key: string;
  country: string;
  value: number;
  pathD: string;
  fill: string;
  x: number;
  w: number;
  yTop: number;
  h: number;
};

function computeYDomain(bars: CountryChangeBar[], display: MetricDisplaySpec): [number, number] {
  const vals = bars.map((b) => b.value).filter((v) => Number.isFinite(v));
  if (vals.length === 0) return [0, 1];
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const isSignedChange = display.kind === 'percent_change';

  if (isSignedChange) {
    const hasPos = vals.some((v) => v > 0);
    const hasNeg = vals.some((v) => v < 0);
    let lo: number;
    let hi: number;
    if (hasPos && hasNeg) {
      const m = Math.max(Math.abs(minV), Math.abs(maxV)) * 1.12;
      lo = -m;
      hi = m;
    } else if (hasPos && !hasNeg) {
      lo = 0;
      hi = maxV * 1.12;
    } else if (hasNeg && !hasPos) {
      lo = minV * 1.12;
      hi = 0;
    } else {
      lo = 0;
      hi = 1;
    }
    const d = scaleLinear().domain([lo, hi]).nice().domain();
    let d0 = d[0]!;
    let d1 = d[1]!;
    if (d0 > 0) d0 = 0;
    if (d1 < 0) d1 = 0;
    return [d0, d1];
  }
  const pad = maxV === minV ? Math.max(Math.abs(maxV) * 0.15, 1) : (maxV - minV) * 0.1;
  const d = scaleLinear()
    .domain([minV - pad, maxV + pad])
    .nice()
    .domain();
  return [d[0]!, d[1]!];
}

function layoutBars(
  bars: CountryChangeBar[],
  innerW: number,
  innerH: number,
  display: MetricDisplaySpec
): { geoms: BarGeom[]; yDomain: [number, number]; yTicks: number[]; x0: ReturnType<typeof scaleBand<string>> } {
  const domain = computeYDomain(bars, display);
  const yScale = scaleLinear().domain(domain).range([innerH, 0]);
  const countries = bars.map((b) => b.country);
  const x0 = scaleBand<string>().domain(countries).range([0, innerW]).padding(0.26);
  const bw = x0.bandwidth();

  const y0 = yScale(0);
  const zeroInView = Number.isFinite(y0) && y0 >= 0 && y0 <= innerH;

  const geoms: BarGeom[] = [];

  for (const b of bars) {
    const x = x0(b.country) ?? 0;
    const v = b.value;
    const yV = yScale(v);
    if (!Number.isFinite(yV)) continue;

    let pathD: string;
    let fill: string;
    let yTop: number;
    let h: number;

    if (v >= 0) {
      const baseline = zeroInView ? y0 : innerH;
      const yTopP = Math.min(yV, baseline);
      const yBot = Math.max(yV, baseline);
      yTop = yTopP;
      h = Math.max(0, yBot - yTopP);
      if (h <= 0.25) continue;
      pathD = pathPositiveBar(x, yTop, bw, h, BAR_CORNER_R);
      fill = POS_FILL;
    } else {
      const baseline = zeroInView ? y0 : 0;
      const yTopN = Math.min(baseline, yV);
      const yBotN = Math.max(baseline, yV);
      yTop = yTopN;
      h = Math.max(0, yBotN - yTopN);
      if (h <= 0.25) continue;
      pathD = pathNegativeBar(x, yTop, bw, h, BAR_CORNER_R);
      fill = NEG_FILL;
    }

    geoms.push({
      key: `${b.country}`,
      country: b.country,
      value: v,
      pathD,
      fill,
      x,
      w: bw,
      yTop,
      h,
    });
  }

  const tickCount = 7;
  const yTicks = yScale.ticks(tickCount);

  return { geoms, yDomain: domain, yTicks, x0 };
}

function pickBarIndex(mx: number, x0: ReturnType<typeof scaleBand<string>>, countries: string[]): number | null {
  if (countries.length === 0) return null;
  const innerW = x0.range()[1] - x0.range()[0];
  if (mx < 0 || mx > innerW) return null;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < countries.length; i++) {
    const c = countries[i]!;
    const cx = (x0(c) ?? 0) + x0.bandwidth() / 2;
    const d = Math.abs(mx - cx);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  const c = countries[best]!;
  const x = x0(c) ?? 0;
  return mx >= x && mx <= x + x0.bandwidth() ? best : null;
}

const Swatch: React.FC<{ color: string }> = ({ color }) => (
  <span
    className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
    style={{ backgroundColor: color }}
    aria-hidden
  />
);

const CountryChangePanelView: React.FC<{
  panel: CountryChangePanel;
  display: MetricDisplaySpec;
  animationKey: string;
}> = ({ panel, display, animationKey }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const barPlotRef = useRef<SVGGElement | null>(null);
  const barRefs = useRef<Record<string, SVGPathElement | null>>({});
  const [width, setWidth] = useState(320);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tooltipAnchorX, setTooltipAnchorX] = useState(0);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || 320);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.max(120, width - MARGIN.left - MARGIN.right);
  const innerH = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const { geoms, yDomain, yTicks, x0 } = useMemo(
    () => layoutBars(panel.bars, innerW, innerH, display),
    [panel.bars, innerW, innerH, display]
  );

  const countries = useMemo(() => panel.bars.map((b) => b.country), [panel.bars]);
  const yScale = useMemo(
    () => scaleLinear().domain(yDomain).range([innerH, 0]),
    [yDomain, innerH]
  );
  const y0 = yScale(0);
  const zeroInView = Number.isFinite(y0) && y0 >= 0 && y0 <= innerH;

  useLayoutEffect(() => {
    if (geoms.length === 0) return;
    const group = barPlotRef.current;
    if (group) {
      group.style.transition = 'none';
      group.style.opacity = '0';
    }
    geoms.forEach((g) => {
      const el = barRefs.current[g.key];
      if (!el) return;
      el.style.transition = 'none';
      el.setAttribute('opacity', '0');
    });
    void group?.getBoundingClientRect();
    requestAnimationFrame(() => {
      if (group) {
        group.style.transition = `opacity ${ANIM_MS * 0.35}ms ${hoverEase}`;
        group.style.opacity = '1';
      }
      geoms.forEach((g, i) => {
        const el = barRefs.current[g.key];
        if (!el) return;
        const delay = Math.min(i * 14, 280);
        el.style.transition = `opacity ${ANIM_MS}ms ${hoverEase} ${delay}ms`;
        el.setAttribute('opacity', '1');
      });
    });
  }, [animationKey, geoms]);

  const updateTooltipX = useCallback(
    (idx: number) => {
      const svg = svgRef.current;
      const wrap = wrapRef.current;
      if (!svg || !wrap || idx < 0 || idx >= countries.length) return;
      const c = countries[idx]!;
      const bx = (x0(c) ?? 0) + x0.bandwidth() / 2;
      const svgBox = svg.getBoundingClientRect();
      const wrapBox = wrap.getBoundingClientRect();
      setTooltipAnchorX(svgBox.left - wrapBox.left + MARGIN.left + bx);
    },
    [countries, x0]
  );

  const handlePlotMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      let mx: number;
      try {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        if (ctm) {
          const p = pt.matrixTransform(ctm.inverse());
          mx = p.x - MARGIN.left;
        } else {
          const r = svg.getBoundingClientRect();
          mx = ((e.clientX - r.left) / Math.max(r.width, 1)) * width - MARGIN.left;
        }
      } catch {
        const r = svg.getBoundingClientRect();
        mx = ((e.clientX - r.left) / Math.max(r.width, 1)) * width - MARGIN.left;
      }
      const idx = pickBarIndex(mx, x0, countries);
      setHoverIdx((prev) => {
        if (prev === idx) return prev;
        if (idx != null) updateTooltipX(idx);
        return idx;
      });
    },
    [countries, width, x0, updateTooltipX]
  );

  const clearHover = useCallback(() => setHoverIdx(null), []);

  const hoveredCountry = hoverIdx != null ? countries[hoverIdx] : null;
  const hoveredBar = hoveredCountry ? panel.bars.find((b) => b.country === hoveredCountry) : null;

  const tooltipLeft = useMemo(() => {
    if (hoverIdx == null || !wrapRef.current) return null;
    const cw = wrapRef.current.clientWidth || width;
    const half = 72;
    return Math.max(half + 4, Math.min(tooltipAnchorX, cw - half - 4));
  }, [hoverIdx, tooltipAnchorX, width]);

  const formatY = (v: number) => {
    if (display.kind === 'percent_change') {
      const prefix = v > 0 ? '+' : '';
      const abs = Math.abs(v);
      const decimals = abs >= 100 && abs % 1 < 1e-6 ? 0 : abs >= 10 ? 1 : 2;
      return `${prefix}${v.toFixed(decimals)}%`;
    }
    return formatBenchmarkMetricValue(v, display);
  };

  const hasZeroTick = yTicks.some((t) => Math.abs(t) < 1e-9);

  return (
    <div className="flex min-w-0 flex-1 flex-col border-slate-200 lg:border-l lg:first:border-l-0">
      <p className="border-b border-slate-100 px-3 py-2 text-center text-xs font-semibold text-slate-700">
        {panel.platform}
      </p>
      <div ref={wrapRef} className="relative px-2 pb-2 pt-1">
        {hoveredBar != null && tooltipLeft != null ? (
          <div
            className="pointer-events-none absolute top-1 z-20 min-w-[9rem] -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs shadow-lg"
            style={{
              left: tooltipLeft,
              transition: `left ${HOVER_TRANSITION_MS}ms ${hoverEase}`,
            }}
          >
            <p className="font-mono font-semibold text-slate-800">{hoveredBar.country}</p>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-600">
                <Swatch color={hoveredBar.value >= 0 ? POS_FILL : NEG_FILL} />
                <span className="text-[10px] text-slate-500">{panel.quarterLabel}</span>
              </span>
              <span className="font-mono font-medium tabular-nums text-slate-900">
                {formatBenchmarkMetricValue(hoveredBar.value, display)}
              </span>
            </div>
          </div>
        ) : null}

        <svg
          ref={svgRef}
          width={width}
          height={CHART_HEIGHT}
          className="block w-full cursor-default select-none text-slate-400"
          role="img"
          aria-label={`${panel.platform} country change bars`}
          onMouseMove={handlePlotMove}
          onMouseLeave={clearHover}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            <g aria-hidden className="pointer-events-none">
              {yTicks.map((t) => {
                const y = yScale(t);
                const isAxisZero = Math.abs(t) < 1e-9;
                return (
                  <g key={`${t}`}>
                    <line
                      x1={0}
                      x2={innerW}
                      y1={y}
                      y2={y}
                      stroke={isAxisZero ? ZERO_LINE : '#eef2f6'}
                      strokeWidth={isAxisZero ? 1.25 : 1}
                    />
                    <text
                      x={-8}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      className="fill-slate-400 text-[10px]"
                    >
                      {formatY(t)}
                    </text>
                  </g>
                );
              })}
              {zeroInView && !hasZeroTick ? (
                <line x1={0} x2={innerW} y1={y0} y2={y0} stroke={ZERO_LINE} strokeWidth={1.25} />
              ) : null}
            </g>

            <g ref={barPlotRef} className="pointer-events-none">
              {geoms.map((g) => {
                const dim = hoveredCountry != null && hoveredCountry !== g.country;
                return (
                  <path
                    key={g.key}
                    ref={(el) => {
                      barRefs.current[g.key] = el;
                    }}
                    d={g.pathD}
                    fill={g.fill}
                    stroke={BAR_STROKE}
                    strokeWidth={dim ? 0.5 : 0.75}
                    opacity={dim ? 0.35 : 1}
                    style={{
                      transition: `opacity ${HOVER_TRANSITION_MS}ms ${hoverEase}, stroke-width ${HOVER_TRANSITION_MS}ms ${hoverEase}`,
                    }}
                  />
                );
              })}
            </g>

            <g aria-hidden className="pointer-events-none">
              {countries.map((c) => {
                const cx = (x0(c) ?? 0) + x0.bandwidth() / 2;
                const active = hoveredCountry === c;
                return (
                  <text
                    key={c}
                    x={cx}
                    y={innerH + 14}
                    textAnchor="end"
                    transform={`rotate(-38 ${cx} ${innerH + 14})`}
                    className={`fill-slate-500 text-[9px] ${active ? 'font-semibold fill-slate-800' : ''}`}
                  >
                    {c.length > 18 ? `${c.slice(0, 16)}…` : c}
                  </text>
                );
              })}
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};

export type BenchmarkCountryChangeBarChartProps = {
  rows: SectionDatum[];
  metricName: string;
  display: MetricDisplaySpec;
  sectionLabel?: string;
  className?: string;
};

export const BenchmarkCountryChangeBarChart: React.FC<BenchmarkCountryChangeBarChartProps> = ({
  rows,
  metricName,
  display,
  sectionLabel,
  className = '',
}) => {
  const panels = useMemo(() => buildCountryChangePanels(rows, display), [rows, display]);

  const animationKey = useMemo(
    () =>
      `${metricName}|${panels.map((p) => `${p.platform}:${p.bars.map((b) => `${b.country}:${b.value}`).join('|')}`).join(';')}`,
    [metricName, panels]
  );

  const title = sectionLabel
    ? `Country movers & shakers · ${sectionLabel}`
    : 'Country movers & shakers';

  if (panels.length === 0) {
    return (
      <section
        className={`rounded-md border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400 shadow-sm ${className}`}
      >
        No country-level rows for the latest quarter in the current filters (Change section).
      </section>
    );
  }

  const quarterNote = panels[0]?.quarterLabel ?? '';

  return (
    <section
      className={`rounded-md border border-slate-200 bg-white shadow-sm ${className}`}
      aria-label="Country change bar chart"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-sm font-semibold text-slate-800">{title}</h3>
          <FieldHint
            spec={{
              title: 'Country movers & shakers',
              body: `QoQ change by country for the latest quarter in your filtered rows (${quarterNote}). Bars sort best → worst; green = positive, pale = negative (AppsFlyer-style).`,
            }}
            side="top"
            className="shrink-0"
          />
        </div>
        <span className="shrink-0 truncate text-xs text-slate-500">{metricName}</span>
      </div>

      <div className="flex flex-col lg:flex-row">
        {panels.map((panel) => (
          <CountryChangePanelView key={panel.platform} panel={panel} display={display} animationKey={animationKey} />
        ))}
      </div>
    </section>
  );
};
