import React, { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
// Removed unused import: BaseChart
import { ChartDimensions, formatNumber } from './BaseChart';

export interface BarChartData {
  category: string;
  value: number;
  eventData?: { [eventName: string]: number }; // Per-event counts in Event mode
  [key: string]: any;
}

export interface BarChartProps {
  data: BarChartData[];
  width?: number;
  height?: number;
  margin?: Partial<ChartDimensions['margin']>;
  color?: string | string[];
  showGrid?: boolean;
  showTooltip?: boolean;
  enableAnimation?: boolean;
  horizontal?: boolean;
  xField?: string;
  yField?: string;
  className?: string;
  hideYAxis?: boolean;
  showLabels?: boolean;
  responsive?: boolean;
  labelFormatter?: (value: number, data: BarChartData) => string;
  tooltipValueLabel?: string;
  isEventMode?: boolean; // Event mode flag
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  width = 800,
  height = 400,
  margin = {},
  color = '#1890ff',
  showGrid = true,
  showTooltip = true,
  enableAnimation = true,
  horizontal = false,
  xField = 'category',
  yField = 'value',
  className = '',
  hideYAxis = false,
  showLabels = false,
  responsive = false,
  labelFormatter,
  tooltipValueLabel = 'Value',
  isEventMode = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Unique instance id to avoid tooltip collisions across instances
  const instanceId = useMemo(() => `bar-chart-${Math.random().toString(36).substr(2, 9)}`, []);
  // Track prior data to avoid duplicate animations
  const prevDataRef = useRef<string>('');
  // Track prior dimensions; re-render on size change
  const prevDimensionsRef = useRef<string>('');
  // Track init; run animation on first render
  const hasInitializedRef = useRef<boolean>(false);
  // Track prior data length; detect recovery from empty
  const prevDataLengthRef = useRef<number>(0);
  // Track prior render data key for re-render detection
  const prevRenderDataKeyRef = useRef<string>('');
  // Track showTooltip only; enableAnimation changes must not skip tooltip rebind
  const prevShowTooltipRef = useRef(showTooltip);
  const [dimensions, setDimensions] = useState(() => ({
    // Responsive: skip default 800×400 frame or y scale breaks bar height
    width: responsive ? 0 : width,
    height: responsive ? 0 : height,
    margin: {
      top: 20,
      right: 30,
      bottom: 60,
      left: hideYAxis ? 10 : 60,
      ...margin,
    },
  }));

  // Tooltip shows full values (no k/m abbrev)
  const formatTooltipNumber = (value: number): string => {
    if (!Number.isFinite(value)) return '0';
    return value.toLocaleString('en-US');
  };

  // Responsive width and height
  useEffect(() => {
    if (!responsive || !containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = containerRef.current.offsetHeight;
        if (containerWidth > 0 && containerHeight > 0) {
          setDimensions(prev => ({
            ...prev,
            width: containerWidth,
            height: containerHeight,
            margin: {
              ...prev.margin,
              left: hideYAxis ? 10 : 60,
            },
          }));
        }
      }
    };

    // requestAnimationFrame after DOM ready
    updateDimensions();
    const rafId = requestAnimationFrame(() => {
      updateDimensions();
      requestAnimationFrame(updateDimensions);
    });
    
    // ResizeObserver for container size
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    // window resize as fallback
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [responsive, hideYAxis]);

  const innerWidth = dimensions.width - dimensions.margin.left - dimensions.margin.right;
  const innerHeight = dimensions.height - dimensions.margin.top - dimensions.margin.bottom;

  // Update SVG size when dimensions change
  useEffect(() => {
    if (svgRef.current) {
      d3.select(svgRef.current)
        .attr('width', dimensions.width)
        .attr('height', dimensions.height);
    }
  }, [dimensions.width, dimensions.height]);

  useEffect(() => {
    if (!svgRef.current) return;

    // Drop invalid rows (yField must be a number)
    // Keep all fields including eventData
    const validData = (data || []).filter(d => {
      const value = d[yField];
      return value !== undefined && value !== null && !isNaN(Number(value));
    }).map(d => ({ ...d })); // Clone rows; keep eventData

    // Detect data change via serialization
    // Build key even when validData empty for compare
    // Key fix: include eventData in compare or tooltip keeps stale eventData
    // Skipped re-render leaves stale eventData in tooltip closure
    // Symptom: Regional Statistics tooltip shows
    // "Event: total" instead of per event_name breakdown.
    const currentDataKey = JSON.stringify(
      validData.map(d => ({
        [xField]: d[xField],
        [yField]: d[yField],
        eventData: d.eventData ?? null,
      }))
    );
    const isDataChanged = prevDataRef.current !== currentDataKey;
    
    // Check dimension change
    const currentDimensionsKey = JSON.stringify({ width: dimensions.width, height: dimensions.height, margin: dimensions.margin });
    const isDimensionsChanged = prevDimensionsRef.current !== currentDimensionsKey;
    
    // Check recovery from empty data
    const isRecoveringFromEmpty = prevDataLengthRef.current === 0 && validData.length > 0;
    
    // Initial load (incl. remount; hasInitializedRef resets)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isInitialLoad = !hasInitializedRef.current && validData.length > 0;
    
    // Key fix: new render cycle even if data unchanged
    // Different prev render key => new cycle (e.g. after loading)
    // Remount resets prevRenderDataKeyRef => isNewRenderCycle
    const isNewRenderCycle = prevRenderDataKeyRef.current !== currentDataKey;

    // false→true showTooltip without re-render: tooltip never binds (Regional Statistics)
    const isShowTooltipChanged = prevShowTooltipRef.current !== showTooltip;

    // Skip re-render if data/size unchanged, not empty recovery, not new cycle, initialized
    // Re-render on new cycle even if data equal (tooltip bind + animation)
    // Remount (key change) resets hasInitializedRef => re-render
    const shouldSkipRender =
      !isDataChanged &&
      !isDimensionsChanged &&
      !isRecoveringFromEmpty &&
      !isNewRenderCycle &&
      !isShowTooltipChanged &&
      hasInitializedRef.current;

    const tooltipId = `bar-chart-tooltip-${instanceId}`;

    const removeTooltipElement = () => {
      d3.selectAll(`#${tooltipId}`).remove();
      document.querySelectorAll(`#${tooltipId}`).forEach(el => el.remove());
    };

    const ensureTooltipElement = () => {
      removeTooltipElement();
      if (!document.body) {
        return null;
      }
      return d3
        .select(document.body)
        .append('div')
        .attr('id', tooltipId)
        .attr('class', 'chart-tooltip')
        .style('position', 'absolute')
        .style('visibility', 'hidden')
        .style('display', 'block')
        .style('width', 'fit-content')
        .style('max-width', '90vw')
        .style('background', 'rgba(17, 24, 39, 0.95)')
        .style('color', '#f9fafb')
        .style('padding', '8px 12px')
        .style('border-radius', '6px')
        .style('font-size', '12px')
        .style('font-family', 'system-ui, -apple-system, sans-serif')
        .style('pointer-events', 'none')
        .style('z-index', '99999')
        .style('opacity', '1')
        .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
        .style('white-space', 'nowrap');
    };

    const attachTooltipHandlers = (
      g: d3.Selection<SVGGElement, unknown, null, undefined>,
      dataForTooltip: BarChartData[]
    ) => {
      if (!showTooltip || g.empty()) {
        return;
      }

      ensureTooltipElement();

      const handleMouseOver = (event: MouseEvent, d?: BarChartData) => {
        let dataItem = d;
        if (!dataItem && event.target) {
          const target = event.target as SVGRectElement;
          const selection = d3.select(target.closest('.bar') || target);
          if (!selection.empty()) {
            dataItem = selection.datum() as BarChartData | undefined;
          }
        }
        if (!dataItem || dataItem[xField] === undefined || dataItem[yField] === undefined) {
          return;
        }
        if (dataItem && dataItem[xField]) {
          const matchingData = dataForTooltip.find(vd => vd[xField] === dataItem![xField]);
          if (matchingData) {
            dataItem = { ...dataItem, ...matchingData };
          }
        }
        const categoryValue = String(dataItem[xField] || '');
        const valueNum = Number(dataItem[yField]) || 0;
        const tooltipElement = document.getElementById(tooltipId);
        if (!tooltipElement) {
          return;
        }
        tooltipElement.style.setProperty('visibility', 'visible', 'important');
        tooltipElement.style.setProperty('display', 'block', 'important');
        tooltipElement.style.setProperty('opacity', '1', 'important');
        tooltipElement.style.setProperty('top', (event.pageY - 10) + 'px', 'important');
        tooltipElement.style.setProperty('left', (event.pageX + 10) + 'px', 'important');

        let tooltipContent = '';
        if (isEventMode === true) {
          const rawDataItem = dataItem as BarChartData & { eventData?: Record<string, number> };
          const eventData = rawDataItem?.eventData;
          const hasValidEventData =
            eventData &&
            typeof eventData === 'object' &&
            !Array.isArray(eventData) &&
            Object.keys(eventData).length > 0;
          if (hasValidEventData) {
            const eventEntries = Object.entries(eventData)
              .filter(([_, count]) => count !== undefined && count !== null && !isNaN(Number(count)))
              .sort((a, b) => Number(b[1]) - Number(a[1]));
            if (eventEntries.length > 0) {
              tooltipContent = `
                <div style="white-space: nowrap;">
                  <div style="font-weight: 600; color: #f9fafb;">${categoryValue}</div>
                  ${eventEntries
                    .map(([eventName, count]) =>
                      `<div style="color: #d1d5db; margin-top: 4px;">${eventName}: <span style="font-weight: 600;">${formatTooltipNumber(Number(count))}</span></div>`
                    )
                    .join('')}
                </div>
              `;
            } else {
              tooltipContent = `
                <div style="white-space: nowrap;">
                  <div style="font-weight: 600; color: #f9fafb;">${categoryValue}</div>
                  <div style="color: #d1d5db; margin-top: 4px;">${tooltipValueLabel}: <span style="font-weight: 600;">${formatTooltipNumber(valueNum)}</span></div>
                </div>
              `;
            }
          } else {
            tooltipContent = `
              <div style="white-space: nowrap;">
                <div style="font-weight: 600; color: #f9fafb;">${categoryValue}</div>
                <div style="color: #d1d5db; margin-top: 4px;">${tooltipValueLabel}: <span style="font-weight: 600;">${formatTooltipNumber(valueNum)}</span></div>
              </div>
            `;
          }
        } else {
          tooltipContent = `
            <div style="white-space: nowrap;">
              <div style="font-weight: 600; color: #f9fafb;">${categoryValue}</div>
              <div style="color: #d1d5db; margin-top: 4px;">${tooltipValueLabel}: <span style="font-weight: 600;">${formatTooltipNumber(valueNum)}</span></div>
            </div>
          `;
        }
        tooltipElement.innerHTML = tooltipContent;
      };

      const handleMouseMove = (event: MouseEvent) => {
        const tooltipElement = document.getElementById(tooltipId);
        if (tooltipElement) {
          tooltipElement.style.setProperty('top', (event.pageY - 10) + 'px', 'important');
          tooltipElement.style.setProperty('left', (event.pageX + 10) + 'px', 'important');
        }
      };

      const handleMouseOut = () => {
        const tooltipElement = document.getElementById(tooltipId);
        if (tooltipElement) {
          tooltipElement.style.setProperty('visibility', 'hidden', 'important');
          tooltipElement.style.setProperty('display', 'none', 'important');
        }
        d3.selectAll(`#${tooltipId}`).style('visibility', 'hidden').style('display', 'none');
      };

      const bindTooltipEvents = () => {
        const barsSelection = g.selectAll<SVGRectElement, BarChartData>('.bar');
        barsSelection.on('mouseover', null).on('mousemove', null).on('mouseout', null);
        barsSelection
          .on('mouseover', function (event: MouseEvent, d: BarChartData) {
            let dataItem: BarChartData | undefined = d;
            if (!dataItem) {
              dataItem = d3.select(this).datum() as BarChartData | undefined;
            }
            if (dataItem && dataItem[xField]) {
              const matchingData = dataForTooltip.find(vd => vd[xField] === dataItem![xField]);
              if (matchingData) {
                dataItem = matchingData;
              }
            }
            if (dataItem) {
              handleMouseOver(event, dataItem);
              d3.select(this).style('opacity', 0.85);
            }
          })
          .on('mousemove', function (event: MouseEvent) {
            handleMouseMove(event);
          })
          .on('mouseout', function () {
            handleMouseOut();
            d3.select(this).style('opacity', 1);
          });
      };

      bindTooltipEvents();
      requestAnimationFrame(bindTooltipEvents);
    };

    let svgMouseLeaveHandler: (() => void) | null = null;
    let svgElementForCleanup: SVGSVGElement | null = null;

    if (shouldSkipRender) {
      prevShowTooltipRef.current = showTooltip;
      if (showTooltip && svgRef.current) {
        const existingG = d3.select(svgRef.current).select<SVGGElement>('g');
        if (!existingG.empty() && validData.length > 0) {
          attachTooltipHandlers(existingG, validData);
        }
      }
      return () => {
        removeTooltipElement();
      };
    }

    const MIN_PLOT_WIDTH = 120;
    const MIN_PLOT_HEIGHT = 120;
    if (innerWidth < MIN_PLOT_WIDTH || innerHeight < MIN_PLOT_HEIGHT) {
      return () => {
        removeTooltipElement();
      };
    }
    
    // Bar grow animation only on data/size/first paint; not on enableAnimation false→true
    // Else interrupt leaves bars at height≈0
    const shouldAnimate =
      enableAnimation &&
      validData.length > 0 &&
      (isDataChanged || isNewRenderCycle || isRecoveringFromEmpty || !hasInitializedRef.current);
    
    // Update refs always (even when empty) for next compare
    // Update refs after shouldAnimate using old values
    if (isDataChanged) {
      prevDataRef.current = currentDataKey;
    }
    if (isDimensionsChanged) {
      prevDimensionsRef.current = currentDimensionsKey;
    }
    
    // Update data length ref
    prevDataLengthRef.current = validData.length;
    
    // Update prev render key after shouldAnimate
    prevRenderDataKeyRef.current = currentDataKey;
    
    prevShowTooltipRef.current = showTooltip;

    // No valid data: clear chart and refs; continue for tooltip cleanup
    if (validData.length === 0) {
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();
      // Update refs for next data load compare
      if (isDataChanged) {
        prevDataRef.current = currentDataKey;
      }
      // Clear tooltip
      if (showTooltip) {
        const tooltipId = `bar-chart-tooltip-${instanceId}`;
        d3.select(`#${tooltipId}`).remove();
      }
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg
      .append('g')
      .attr('transform', `translate(${dimensions.margin.left},${dimensions.margin.top})`);

    // Createscales（Usefiltered valid data）
    const xScale = horizontal
      ? d3.scaleLinear().domain([0, d3.max(validData, d => Number(d[yField])) || 0]).range([0, innerWidth])
      : d3.scaleBand().domain(validData.map(d => d[xField])).range([0, innerWidth]).padding(0.1);

    const yScale = horizontal
      ? d3.scaleBand().domain(validData.map(d => d[xField])).range([0, innerHeight]).padding(0.1)
      : d3.scaleLinear().domain([0, d3.max(validData, d => Number(d[yField])) || 0]).range([innerHeight, 0]);

    // Color scale from filtered data
    const colorScale = Array.isArray(color)
      ? d3.scaleOrdinal().domain(validData.map(d => d[xField])).range(color)
      : () => color;

    // Grid lines - Tailwind minimal
    if (showGrid) {
      if (horizontal) {
        const xScaleLinear = xScale as d3.ScaleLinear<number, number>;
        g.append('g')
          .attr('class', 'grid')
          .call(
            d3
              .axisBottom(xScaleLinear)
              .tickSize(-innerHeight)
              .tickFormat(() => '')
          )
          .style('stroke', '#f3f4f6') // gray-100
          .style('stroke-width', 1)
          .style('opacity', 1);
      } else {
        const yScaleLinear = yScale as d3.ScaleLinear<number, number>;
        g.append('g')
          .attr('class', 'grid')
          .call(
            d3
              .axisLeft(yScaleLinear)
              .tickSize(-innerWidth)
              .tickFormat(() => '')
          )
          .style('stroke', '#f3f4f6') // gray-100
          .style('stroke-width', 1)
          .style('opacity', 1);
      }
    }

    // Gradient defs — subtle black (filtered data)
    const defs = svg.append('defs');
    validData.forEach((d, i) => {
      const gradient = defs
        .append('linearGradient')
        .attr('id', `barGradient${i}`)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 0)
        .attr('y2', horizontal ? 0 : innerHeight);

      // Black with subtle gradient (lighter to pure black)
      const barColor = typeof colorScale === 'function' ? colorScale(d[xField]) : colorScale;
      // Black bars: add subtle gradient
      const isBlack = barColor === '#000000' || barColor === 'black' || barColor === '#000';
      
      if (isBlack) {
        // #2a2a2a to #000000
        gradient
          .append('stop')
          .attr('offset', '0%')
          .attr('stop-color', '#2a2a2a'); // Slightly lighter black at top

        gradient
          .append('stop')
          .attr('offset', '100%')
          .attr('stop-color', '#000000'); // Pure black at bottom
      } else {
        // Other colors unchanged
        gradient
          .append('stop')
          .attr('offset', '0%')
          .attr('stop-color', String(barColor))
          .attr('stop-opacity', 0.9);

        gradient
          .append('stop')
          .attr('offset', '100%')
          .attr('stop-color', String(barColor))
          .attr('stop-opacity', 0.5);
      }
    });

    // Bars — Tailwind minimal (filtered data)
    // D3 join enter/update/exit
    const barsSelection = g.selectAll('.bar').data(validData, (d: any) => d[xField] || String(d));

    // Remove old elements
    barsSelection.exit().remove();

    // Enter and update
    const barsEnter = barsSelection
      .enter()
      .append('rect')
      .attr('class', 'bar');
    
    const bars = barsEnter
      .merge(barsSelection as unknown as d3.Selection<SVGRectElement, BarChartData, SVGGElement, unknown>)
      .attr('x', d => (horizontal ? 0 : xScale(d[xField]) || 0))
      .attr('fill', (d, i) => `url(#barGradient${i})`)
      .attr('rx', 4) // Rounded corners
      .attr('ry', 4)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 0.5)
      .style('cursor', 'pointer')
      .style('pointer-events', 'all'); // Pointer events enabled

    // transition in outer scope
    let transition: d3.Transition<SVGRectElement, BarChartData, SVGGElement, unknown> | null = null;

    // Set geometry before events so handlers attach to final nodes
    if (shouldAnimate) {
      // Animate from bottom (vertical) or zero width (horizontal)
      if (horizontal) {
        const yScaleBand = yScale as d3.ScaleBand<string>;
        const xScaleLinear = xScale as d3.ScaleLinear<number, number>;
      bars
          .attr('y', d => yScaleBand(d[xField]) || 0)
          .attr('width', 0)
          .attr('height', yScaleBand.bandwidth());

        // Run animation
        transition = bars
          .transition()
          .duration(500)
          .ease(d3.easeCubicOut)
          .attr('y', d => yScaleBand(d[xField]) || 0)
          .attr('width', d => xScaleLinear(Number(d[yField])))
          .attr('height', yScaleBand.bandwidth());
          } else {
        const xScaleBand = xScale as d3.ScaleBand<string>;
        const yScaleLinear = yScale as d3.ScaleLinear<number, number>;
        bars
          .attr('y', innerHeight)
          .attr('width', xScaleBand.bandwidth())
          .attr('height', 0);

      // Run animation
      transition = bars
        .transition()
        .duration(500)
        .ease(d3.easeCubicOut)
        .attr('y', d => {
            const yValue = Number(d[yField]);
            return yScaleLinear(yValue);
        })
          .attr('width', xScaleBand.bandwidth())
        .attr('height', d => {
            const yValue = Number(d[yField]);
            return innerHeight - yScaleLinear(yValue);
          });
          }
    } else {
      if (horizontal) {
        const yScaleBand = yScale as d3.ScaleBand<string>;
        const xScaleLinear = xScale as d3.ScaleLinear<number, number>;
      bars
          .attr('y', d => yScaleBand(d[xField]) || 0)
          .attr('width', d => xScaleLinear(Number(d[yField])))
          .attr('height', yScaleBand.bandwidth());
      } else {
        const xScaleBand = xScale as d3.ScaleBand<string>;
        const yScaleLinear = yScale as d3.ScaleLinear<number, number>;
        bars
          .attr('y', d => {
            const yValue = Number(d[yField]);
            return yScaleLinear(yValue);
          })
          .attr('width', xScaleBand.bandwidth())
          .attr('height', d => {
            const yValue = Number(d[yField]);
            return innerHeight - yScaleLinear(yValue);
          });
      }
    }

    // Value labels from filtered data
    if (showLabels) {
      const labelsSelection = g.selectAll('.label')
        .data(validData, (d: any) => d[xField] || String(d));
      
      // Remove old labels
      labelsSelection.exit().remove();
      
      // Create labels
      const labelsEnter = labelsSelection
        .enter()
        .append('text')
        .attr('class', 'label');
      
      const labels = labelsEnter
        .merge(labelsSelection as unknown as d3.Selection<SVGTextElement, BarChartData, SVGGElement, unknown>)
        .attr('text-anchor', horizontal ? 'start' : 'middle')
        .attr('alignment-baseline', horizontal ? 'middle' : 'baseline')
        .style('font-size', '11px')
        .style('fill', '#6b7280') // gray-500
        .style('font-weight', '500')
        .style('font-family', 'system-ui, -apple-system, sans-serif')
        .style('pointer-events', 'none')
        .text(d => {
          const value = Number(d[yField]);
          return labelFormatter ? labelFormatter(value, d) : formatNumber(value);
        });
      
      // Label position follows bar animation when enabled
      if (shouldAnimate && transition) {
        // Animate label with bars
        labels
          .attr('x', d => {
            if (horizontal) {
              return 0; // initial position：from zero
            }
            const xScaleBand = xScale as d3.ScaleBand<string>;
            return (xScaleBand(d[xField]) || 0) + xScaleBand.bandwidth() / 2;
          })
          .attr('y', d => {
            if (horizontal) {
              const yScaleBand = yScale as d3.ScaleBand<string>;
              return (yScaleBand(d[xField]) || 0) + yScaleBand.bandwidth() / 2;
            }
            return innerHeight; // initial position：from bottom
          })
          .style('opacity', 0) // start transparent
          .transition()
          .duration(500)
          .ease(d3.easeCubicOut)
          .attr('x', d => {
            if (horizontal) {
              const xScaleLinear = xScale as d3.ScaleLinear<number, number>;
              return xScaleLinear(Number(d[yField])) + 5;
            }
            const xScaleBand = xScale as d3.ScaleBand<string>;
            return (xScaleBand(d[xField]) || 0) + xScaleBand.bandwidth() / 2;
          })
          .attr('y', d => {
            if (horizontal) {
              const yScaleBand = yScale as d3.ScaleBand<string>;
              return (yScaleBand(d[xField]) || 0) + yScaleBand.bandwidth() / 2;
            }
            const yScaleLinear = yScale as d3.ScaleLinear<number, number>;
            return yScaleLinear(Number(d[yField])) - 5;
          })
          .style('opacity', 1);
      } else {
        // Non-animated: set final position
        labels
          .attr('x', d => {
            if (horizontal) {
              const xScaleLinear = xScale as d3.ScaleLinear<number, number>;
              return xScaleLinear(Number(d[yField])) + 5;
            }
            const xScaleBand = xScale as d3.ScaleBand<string>;
            return (xScaleBand(d[xField]) || 0) + xScaleBand.bandwidth() / 2;
          })
          .attr('y', d => {
            if (horizontal) {
              const yScaleBand = yScale as d3.ScaleBand<string>;
              return (yScaleBand(d[xField]) || 0) + yScaleBand.bandwidth() / 2;
            }
            const yScaleLinear = yScale as d3.ScaleLinear<number, number>;
            return yScaleLinear(Number(d[yField])) - 5;
          })
          .style('opacity', 1);
      }
    }

    // Axes
    const xAxis = horizontal
      ? g
          .append('g')
          .attr('class', 'x-axis')
          .attr('transform', `translate(0,${innerHeight})`)
          .call(d3.axisBottom(xScale as d3.ScaleLinear<number, number>).tickFormat((value) => formatNumber(value as number)))
      : g
          .append('g')
          .attr('class', 'x-axis')
          .attr('transform', `translate(0,${innerHeight})`)
          .call(d3.axisBottom(xScale as d3.ScaleBand<string>));

    // Style axes - Tailwind minimal
    xAxis.selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#9ca3af') // gray-400
      .style('font-family', 'system-ui, -apple-system, sans-serif');
    xAxis.selectAll('path, line').style('stroke', '#e5e7eb'); // gray-200

    // Y axis
    if (!hideYAxis) {
      const yAxis = horizontal
        ? g
            .append('g')
            .attr('class', 'y-axis')
            .call(d3.axisLeft(yScale as d3.ScaleBand<string>))
        : g
            .append('g')
            .attr('class', 'y-axis')
            .call(d3.axisLeft(yScale as d3.ScaleLinear<number, number>).tickFormat((value) => formatNumber(value as number)));
      
      yAxis.selectAll('text')
        .style('font-size', '12px')
        .style('fill', '#9ca3af') // gray-400
        .style('font-family', 'system-ui, -apple-system, sans-serif');
      yAxis.selectAll('path, line').style('stroke', '#e5e7eb'); // gray-200
    }

    if (validData.length > 0) {
      hasInitializedRef.current = true;
    }

    // Tooltip after axes; rebind after animation if transition interrupted
    if (showTooltip) {
      attachTooltipHandlers(g, validData);
      if (shouldAnimate && transition) {
        transition.on('end', () => {
          requestAnimationFrame(() => {
            attachTooltipHandlers(g, validData);
          });
        });
      }
      svgElementForCleanup = svgRef.current;
      if (svgElementForCleanup) {
        svgMouseLeaveHandler = () => {
          const tooltipElement = document.getElementById(tooltipId);
          if (tooltipElement) {
            tooltipElement.style.setProperty('visibility', 'hidden', 'important');
            tooltipElement.style.setProperty('display', 'none', 'important');
          }
        };
        svgElementForCleanup.addEventListener('mouseleave', svgMouseLeaveHandler);
      }
    } else {
      g.selectAll('.bar')
        .on('mouseenter', function() {
          d3.select(this).style('opacity', 0.85);
        })
        .on('mouseleave', function() {
          d3.select(this).style('opacity', 1);
        });
    }

    return () => {
      removeTooltipElement();
      if (svgElementForCleanup && svgMouseLeaveHandler) {
        svgElementForCleanup.removeEventListener('mouseleave', svgMouseLeaveHandler);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dimensions, color, showGrid, showTooltip, enableAnimation, horizontal, xField, yField, instanceId, hideYAxis, showLabels, labelFormatter, tooltipValueLabel, isEventMode]);

  return (
    <div ref={containerRef} className={`bar-chart ${className}`} style={{ width: '100%', height: '100%' }}>
      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} style={{ display: 'block' }} />
    </div>
  );
};
