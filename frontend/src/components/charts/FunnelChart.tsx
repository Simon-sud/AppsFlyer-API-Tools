import React, { useRef, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { ChartDimensions, formatNumber } from './BaseChart';
import { EventNameStatisticsData } from '../../services/api';

// funnel chartdatainterface（compatibilityinterface）
export interface FunnelChartMultiMetricData {
  eventName: string;          // Event name
  install: number;            // Install count (UA)
  event: number;              // Event count (UA)
  retargetingInstall: number; // Retargeting install (RT)
  retargetingEvent: number;    // Retargeting event (RT)
  groupDetails?: Array<{
    groupName: string;
    install: number;
    event: number;
  }>;
}

// funnel chartdata type（compatibilityinterface）
export type FunnelChartData = EventNameStatisticsData | FunnelChartMultiMetricData;

export interface FunnelChartProps {
  data: EventNameStatisticsData[] | FunnelChartMultiMetricData[];
  width?: number;
  height?: number;
  margin?: Partial<ChartDimensions['margin']>;
  showLabels?: boolean;
  showTooltip?: boolean;
  enableAnimation?: boolean;
  className?: string;
  mode?: 'ACC' | 'APP'; // ACCmodeshowaccount，APPmodeshowapp
  badge?: 'UA' | 'RT'; // UAmodeonlyshowInstallEvent，RTmodeonlyshowRetargeting InstallRetargeting Event
  /** true containerwidthSet SVG width， LineChart fitContainerWidth*/
  fitContainerWidth?: boolean;
}

export const FunnelChart: React.FC<FunnelChartProps> = ({
  data,
  width = 400,
  height = 400,
  margin = {},
  showLabels = true,
  showTooltip = true,
  enableAnimation = true,
  className = '',
  mode = 'ACC',
  badge = 'UA',
  fitContainerWidth = false,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const instanceId = useMemo(() => `funnel-chart-${Math.random().toString(36).substr(2, 9)}`, []);
  const prevDataRef = useRef<string>('');
  // Track init; run animation on first render
  const hasInitializedRef = useRef<boolean>(false);
  // Track prior render data key for re-render detection
  const prevRenderDataKeyRef = useRef<string>('');
  // for enableAnimation previous ，detectanimationstate
  const prevEnableAnimationRef = useRef<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [layoutMeasuredWidth, setLayoutMeasuredWidth] = useState(() => width);
  const lastDrawnSvgWidthRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!fitContainerWidth) return;
    const el = containerRef.current;
    if (!el) return;
    const applyWidth = (w: number) => {
      if (w > 0) {
        setLayoutMeasuredWidth(Math.max(200, Math.floor(w)));
      }
    };
    applyWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(entries => {
      applyWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitContainerWidth]);

  const [dimensions] = useState(() => ({
    width,
    height,
    margin: {
      top: 20,
      right: 100, // rightvalue labels
      bottom: 40,
      left: 200, // lefteventlabel（fixedwidth160 + spacing40）
      ...margin,
    },
  }));

  const svgWidth = fitContainerWidth ? layoutMeasuredWidth : width;
  const innerWidth = Math.max(24, svgWidth - dimensions.margin.left - dimensions.margin.right);
  const innerHeight = dimensions.height - dimensions.margin.top - dimensions.margin.bottom;

  useEffect(() => {
    if (!data || data.length === 0 || !svgRef.current) return;

    // Checkdata
    const currentDataKey = JSON.stringify(data);
    const isDataChanged = prevDataRef.current !== currentDataKey;
    
    // Initial load (incl. remount; hasInitializedRef resets)
    const _isInitialLoad = !hasInitializedRef.current && data.length > 0;
    void _isInitialLoad; // reserved for future use

    // Key fix: new render cycle even if data unchanged
    // Different prev render key => new cycle (e.g. after loading)
    // Whencomponent remount（React key），prevRenderDataKeyRefreset，isNewRenderCycletrue
    const _isNewRenderCycle = prevRenderDataKeyRef.current !== currentDataKey;
    void _isNewRenderCycle; // reserved for future use
    
    // detect enableAnimation false true（animation）
    // Key fix：When enableAnimation false true ，triggeranimation
    const wasAnimationDisabled = !prevEnableAnimationRef.current;
    const isAnimationEnabled = enableAnimation;
    const animationJustEnabled = wasAnimationDisabled && isAnimationEnabled;
    
    if (isDataChanged) {
      prevDataRef.current = currentDataKey;
    }
    
    // Update prev render key after shouldAnimate
    prevRenderDataKeyRef.current = currentDataKey;
    
    // Update enableAnimation previous
    prevEnableAnimationRef.current = enableAnimation;

    const svg = d3.select(svgRef.current);
    
    const layoutChanged =
      fitContainerWidth && lastDrawnSvgWidthRef.current !== svgWidth;

    // Key fix：Whenanimation，clearcreateelements，ensureanimationtrigger
    // BarChart ，each timeanimationclearcreate
    const shouldRecreate = isDataChanged || animationJustEnabled || layoutChanged;
    
    // getcreatecontainer
    let g = svg.select<SVGGElement>('g');
    if (g.empty() || shouldRecreate) {
      if (shouldRecreate) {
        if (fitContainerWidth) {
          lastDrawnSvgWidthRef.current = svgWidth;
        }
        svg.selectAll('*').remove();
      }
      g = svg
        .append('g')
        .attr('transform', `translate(${dimensions.margin.left},${dimensions.margin.top})`);
    }

    // compute（4）
    const dataWithTotal = data.map(d => ({
      ...d,
      total: d.install + d.event + d.retargetingInstall + d.retargetingEvent
    }));

    // compute（forfunneltopwidth）
    const maxValue = d3.max(dataWithTotal, d => d.total) || 1;
    
    // computewidthposition
    const stageHeight = innerHeight / data.length;
    const gap = 2; // spacing

    // unifieduseblackdefault
    const defaultColor = '#000000'; // black

    // createcolor - unifiedblack（keep）
    const _getColor = (_index: number) => defaultColor;
    void _getColor;

    // createfunnel
    const stagesUpdate = g
      .selectAll<SVGGElement, typeof dataWithTotal[0]>('.funnel-stage')
      .data(dataWithTotal);
    
    const stages = stagesUpdate
      .enter()
      .append('g')
      .attr('class', 'funnel-stage')
      .merge(stagesUpdate)
      .attr('transform', (d, i) => `translate(0, ${i * stageHeight})`);
    
    // Removeelements
    stagesUpdate.exit().remove();

    // computewidth（）
    // ：datadistribution，handledata
    const sortedValues = [...dataWithTotal].map(d => d.total).sort((a, b) => b - a);
    const _uniqueValues = [...new Set(sortedValues)];
    void _uniqueValues; // reserved for future use
    
    // datadistribution
    const analyzeDataDistribution = () => {
      if (sortedValues.length <= 1 || maxValue === 0) {
        return { type: 'uniform', groups: [] };
      }
      
      // compute
      const ratios: number[] = [];
      for (let i = 0; i < sortedValues.length - 1; i++) {
        if (sortedValues[i + 1] > 0) {
          ratios.push(sortedValues[i] / sortedValues[i + 1]);
        }
      }
      
      // detectdata：If，
      const largeRatioThreshold = 5; // 5，
      const largeRatios = ratios.filter(r => r >= largeRatioThreshold);
      
      // 1：（ < 1%）
      if (sortedValues[1] / maxValue < 0.01) {
        return { 
          type: 'extreme-large-range', 
          maxValueRatio: 0.97, // ，
          otherValuesRatio: 0.03
        };
      }
      
      // 2：（ < 10%）
      if (sortedValues[1] / maxValue < 0.1) {
        return { 
          type: 'large-range', 
          maxValueRatio: 0.92,
          otherValuesRatio: 0.08
        };
      }
      
      // 3：（10%-50%，）
      // or，（）
      if ((sortedValues[1] / maxValue >= 0.1 && sortedValues[1] / maxValue < 0.5 && largeRatios.length > 0) ||
          (sortedValues.length >= 3 && sortedValues[1] / maxValue >= 0.3 && sortedValues[2] / maxValue < 0.1 && largeRatios.length > 0)) {
        // position，data
        // ratios[i]sortedValues[i]sortedValues[i+1]
        const firstLargeRatioIndex = ratios.findIndex(r => r >= largeRatioThreshold);
        if (firstLargeRatioIndex >= 0) {
          // firstLargeRatioIndex+1（ratios[i]sortedValues[i]sortedValues[i+1]）
          const largeGroup = sortedValues.slice(0, firstLargeRatioIndex + 1);
          const smallGroup = sortedValues.slice(firstLargeRatioIndex + 1);
          
          // If，handle
          if (smallGroup.length > 1 && smallGroup[0] / smallGroup[smallGroup.length - 1] > 3) {
            return {
              type: 'three-groups',
              largeGroup: largeGroup,
              mediumGroup: smallGroup.slice(0, Math.ceil(smallGroup.length / 2)),
              smallGroup: smallGroup.slice(Math.ceil(smallGroup.length / 2)),
              largeGroupRatio: 0.7,
              mediumGroupRatio: 0.2,
              smallGroupRatio: 0.1
            };
          }
          
          return {
            type: 'two-groups',
            largeGroup: largeGroup,
            smallGroup: smallGroup,
            largeGroupRatio: 0.7,
            smallGroupRatio: 0.3
          };
        }
      }
      
      // 4：（500, 450, 10, 5, 3）
      // detect，
      if (sortedValues.length >= 3) {
        const firstTwoRatio = sortedValues[0] / sortedValues[1];
        const secondThirdRatio = sortedValues[1] / sortedValues[2];
        // If（<2），（>10）
        if (firstTwoRatio < 2 && secondThirdRatio > 10) {
          const largeGroup = sortedValues.slice(0, 2);
          const smallGroup = sortedValues.slice(2);
          return {
            type: 'two-groups',
            largeGroup: largeGroup,
            smallGroup: smallGroup,
            largeGroupRatio: 0.75,
            smallGroupRatio: 0.25
          };
        }
      }
      
      // 5：distribution，uselinearscales
      return { type: 'uniform', groups: [] };
    };
    
    const distribution = analyzeDataDistribution();

    // value labels（text-anchor start）， SVG margin. right，right margin，Avoid innerWidth
    const plotExtentX = Math.max(
      innerWidth,
      innerWidth + Math.max(0, dimensions.margin.right - 6)
    );

    // LineChart ：「 + value labels」width，only barTrackWidth
    const rowCount = dataWithTotal.length;
    const charW = 6.5;
    const maxTotalForLabel = d3.max(dataWithTotal, d => d.total) || 0;
    const maxValueLabelText = formatNumber(maxTotalForLabel);
    let labelReserve = 4 + maxValueLabelText.length * charW;
    labelReserve = Math.min(labelReserve + 6, plotExtentX * 0.2);
    if (rowCount >= 8) {
      labelReserve = Math.min(labelReserve, plotExtentX * 0.17 + maxValueLabelText.length * charW);
    }
    if (rowCount >= 12) {
      labelReserve = Math.min(labelReserve, plotExtentX * 0.15 + maxValueLabelText.length * charW);
    }
    const BAR_TO_VALUE_GAP = 10;
    let plotFromReserve = Math.max(8, plotExtentX - BAR_TO_VALUE_GAP - labelReserve);
    const maxPlot = Math.max(8, plotExtentX - 6);
    const minBarTrack =
      rowCount >= 12 ? 48 : rowCount >= 8 ? 56 : rowCount >= 4 ? 64 : 72;
    plotFromReserve = Math.max(plotFromReserve, Math.min(minBarTrack, maxPlot));
    const barTrackWidth = Math.min(plotFromReserve, maxPlot);

    const calculateWidth = (value: number) => {
      if (distribution.type === 'extreme-large-range') {
        const maxRatio = distribution.maxValueRatio ?? 0.97;
        const otherRatio = distribution.otherValuesRatio ?? 0.03;
        if (value === maxValue) {
          return barTrackWidth * maxRatio;
        } else {
          const otherValues = sortedValues.filter(v => v !== maxValue);
          const maxOtherValue = otherValues[0] || 1;
          const availableWidth = barTrackWidth * otherRatio;
          const proportionalWidth = (value / maxOtherValue) * availableWidth;
          const minWidth = Math.max(availableWidth * 0.05, 6);
          return Math.max(proportionalWidth, minWidth);
        }
      } else if (distribution.type === 'large-range') {
        const maxRatio = distribution.maxValueRatio ?? 0.92;
        const otherRatio = distribution.otherValuesRatio ?? 0.08;
        if (value === maxValue) {
          return barTrackWidth * maxRatio;
        } else {
          const otherValues = sortedValues.filter(v => v !== maxValue);
          const maxOtherValue = otherValues[0] || 1;
          const availableWidth = barTrackWidth * otherRatio;
          const proportionalWidth = (value / maxOtherValue) * availableWidth;
          const minWidth = Math.max(availableWidth * 0.05, 8);
          return Math.max(proportionalWidth, minWidth);
        }
      } else if (distribution.type === 'two-groups') {
        const largeGroup = distribution.largeGroup ?? [];
        const smallGroup = distribution.smallGroup ?? [];
        const largeGroupRatio = distribution.largeGroupRatio ?? 0.7;
        const smallGroupRatio = distribution.smallGroupRatio ?? 0.3;
        const isInLargeGroup = largeGroup.includes(value);
        const isInSmallGroup = smallGroup.includes(value);

        if (isInLargeGroup) {
          const maxLargeValue = largeGroup.length > 0 ? Math.max(...largeGroup) : 1;
          const availableWidth = barTrackWidth * largeGroupRatio;
          return (value / maxLargeValue) * availableWidth;
        } else if (isInSmallGroup) {
          const maxSmallValue = smallGroup.length > 0 ? Math.max(...smallGroup) : 1;
          const availableWidth = barTrackWidth * smallGroupRatio;
          const proportionalWidth = (value / maxSmallValue) * availableWidth;
          const minWidth = Math.max(availableWidth * 0.05, 8);
          return Math.max(proportionalWidth, minWidth);
        } else {
          return (value / maxValue) * barTrackWidth;
        }
      } else if (distribution.type === 'three-groups') {
        const largeGroup = distribution.largeGroup ?? [];
        const mediumGroup = distribution.mediumGroup ?? [];
        const smallGroup = distribution.smallGroup ?? [];
        const largeGroupRatio = distribution.largeGroupRatio ?? 0.7;
        const mediumGroupRatio = distribution.mediumGroupRatio ?? 0.2;
        const smallGroupRatio = distribution.smallGroupRatio ?? 0.1;
        const isInLargeGroup = largeGroup.includes(value);
        const isInMediumGroup = mediumGroup.includes(value);
        const isInSmallGroup = smallGroup.includes(value);

        if (isInLargeGroup) {
          const maxLargeValue = largeGroup.length > 0 ? Math.max(...largeGroup) : 1;
          const availableWidth = barTrackWidth * largeGroupRatio;
          return (value / maxLargeValue) * availableWidth;
        } else if (isInMediumGroup) {
          const maxMediumValue = mediumGroup.length > 0 ? Math.max(...mediumGroup) : 1;
          const availableWidth = barTrackWidth * mediumGroupRatio;
          const proportionalWidth = (value / maxMediumValue) * availableWidth;
          const minWidth = Math.max(availableWidth * 0.05, 6);
          return Math.max(proportionalWidth, minWidth);
        } else if (isInSmallGroup) {
          const maxSmallValue = smallGroup.length > 0 ? Math.max(...smallGroup) : 1;
          const availableWidth = barTrackWidth * smallGroupRatio;
          const proportionalWidth = (value / maxSmallValue) * availableWidth;
          const minWidth = Math.max(availableWidth * 0.05, 4);
          return Math.max(proportionalWidth, minWidth);
        } else {
          return (value / maxValue) * barTrackWidth;
        }
      } else {
        return (value / maxValue) * barTrackWidth;
      }
    };

    const barW = (d: (typeof dataWithTotal)[0]) => calculateWidth(d.total);

    // Addfunnel（eventonlyshow，）
    // bars，not
    const rectsUpdate = stages.selectAll<SVGRectElement, typeof dataWithTotal[0]>('.funnel-rect').data(d => [d]);
    
    // Remove old elements
    rectsUpdate.exit().remove();
    
    // createelements
    const rectsEnter = rectsUpdate
      .enter()
      .append('rect')
      .attr('class', 'funnel-rect')
      .attr('x', 0) // note
      .attr('y', gap / 2)
      .attr('height', stageHeight - gap)
      .attr('fill', () => {
        // unifieduseblack
        return defaultColor;
      })
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 1)
      .attr('rx', 4) // rounded corners
      .attr('ry', 4)
      .style('cursor', 'pointer');
    
    // merge enter update
    const rects = rectsEnter.merge(rectsUpdate);
    
    // animationSetstate
    // logic：onlyanimationdata，run animation（ BarChart ）
    // ensureeach time enableAnimation true ，triggeranimation
    const shouldAnimate = enableAnimation && data.length > 0;
    
    if (shouldAnimate) {
      // animated mode：Setstate（width0，left），animation
      // BarChart chartanimation： width: 0 width
      rects
        .attr('width', 0)
        .style('opacity', 1);
      
      // Run animation：（width 0 width）
      // use BarChart animation
      const duration = 500; // BarChart sync：500ms transition
      rects
        .transition()
        .duration(duration)
        .ease(d3.easeCubicOut) // use BarChart
        .attr('width', d => barW(d))
        .on('end', function() {
          // animation，ensurestylealreadySet
          d3.select(this).style('opacity', 1);
        });
    } else {
      // animated mode：Setstate
      rects
        .attr('width', d => barW(d))
        .style('opacity', 1);
    }
    
    // alreadyInitialize（onlydata，Avoiddata）
    if (data.length > 0) {
      hasInitializedRef.current = true;
    }

    // Addlabel
    if (showLabels) {
      // leftlabel（event）- fixedwidth，，...
      const maxLabelWidth = 160; // fixedlabelwidth
      const approxCharWidth = 7; // width
      const maxChars = Math.floor(maxLabelWidth / approxCharWidth);
      
      const nameLabelsUpdate = stages.selectAll<SVGTextElement, typeof dataWithTotal[0]>('.funnel-label-name').data(d => [d]);
      const nameLabels = nameLabelsUpdate
        .enter()
        .append('text')
        .attr('class', 'funnel-label-name')
        .merge(nameLabelsUpdate)
        .attr('x', -maxLabelWidth - 20) // fixedposition，ensurelabelposition
        .attr('y', stageHeight / 2)
        .attr('text-anchor', 'start') // note
        .attr('dominant-baseline', 'middle')
        .style('font-size', '12px')
        .style('font-weight', '500')
        .style('fill', '#374151') // Tailwind gray-700
        .style('font-family', 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif')
        .text(d => {
          const eventName = String(d.eventName);
          if (eventName.length > maxChars) {
            return eventName.slice(0, maxChars - 3) + '...';
          }
          return eventName;
        });
      nameLabelsUpdate.exit().remove();

      // rightlabel（）- bars，bars
      const valueLabelsUpdate = stages.selectAll<SVGTextElement, typeof dataWithTotal[0]>('.funnel-label-value').data(d => [d]);
      
      // Removelabel
      valueLabelsUpdate.exit().remove();
      
      // createlabel
      const valueLabelsEnter = valueLabelsUpdate
        .enter()
        .append('text')
        .attr('class', 'funnel-label-value')
        .attr('y', stageHeight / 2)
        .attr('text-anchor', 'start')
        .attr('dominant-baseline', 'middle')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('fill', '#111827') // Tailwind gray-900
        .style('font-family', 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif')
        .text(d => formatNumber(d.total));
      
      // merge enter update
      const valueLabels = valueLabelsEnter.merge(valueLabelsUpdate);
      
      // Ifanimation，labelbars
      if (shouldAnimate) {
        // animated mode：Setstate（xpositionbarswidth0position，x=15），bars
        valueLabels
          .attr('x', BAR_TO_VALUE_GAP)
          .style('opacity', 1);
        
        // Run animation：labelbars
        // usebarsanimation
        const duration = 500; // barsanimationsync：500ms transition
        valueLabels
          .transition()
          .duration(duration)
          .ease(d3.easeCubicOut) // usebars
          .attr('x', d => {
            const rectWidth = barW(d);
            return rectWidth + BAR_TO_VALUE_GAP;
          });
      } else {
        // animated mode：Setfinal position
        valueLabels
          .attr('x', d => {
            const rectWidth = barW(d);
            return rectWidth + BAR_TO_VALUE_GAP;
          })
          .style('opacity', 1);
      }
      
      // leftlabel（event）show，notanimation（fixedposition）
      nameLabels.style('opacity', 1);
    }

    // Addtooltip（show4detaileddata）
    if (showTooltip) {
      const tooltipId = `funnel-chart-tooltip-${instanceId}`;
      d3.select(`#${tooltipId}`).remove();
      
      const tooltip = d3
        .select(document.body)
        .append('div')
        .attr('id', tooltipId)
        .attr('class', 'chart-tooltip')
        .style('position', 'absolute')
        .style('visibility', 'hidden')
        .style('width', 'fit-content') // fit-content width
        .style('max-width', '90vw') // Cap width at viewport
        .style('background', '#1f2937') // Tailwind gray-800
        .style('color', '#f9fafb') // Tailwind gray-50
        .style('padding', '0.75rem 1rem')
        .style('border-radius', '0.5rem')
        .style('font-size', '0.875rem')
        .style('font-family', 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif')
        .style('line-height', '1.5')
        .style('pointer-events', 'none')
        .style('z-index', '1000')
        .style('box-shadow', '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)')
        .style('border', '1px solid #374151')
        .style('backdrop-filter', 'blur(8px)')
        .style('transition', 'opacity 0.15s ease-in-out');

      // currentbadge，ensureeventhandleuse
      const currentBadge = badge;

      rects
        .on('mouseover', function(event, d) {
          // tooltipcontent
          let tooltipContent = `
            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
              <div style="font-weight: 600; font-size: 0.875rem; color: #f9fafb;">${d.eventName}</div>
          `;
          
          // computeTotal（badge）
          const total = currentBadge === 'UA' 
            ? (d.install + d.event) 
            : (d.retargetingInstall + d.retargetingEvent);
          
          // If，mode（ACC/APP）showeventNamedata
          // groupDetailsalreadymode（ACCmodeaccount，APPmodeapp_id）
          if (d.groupDetails && d.groupDetails.length > 0) {
            // badgeshow
            // ：Check groupDetails retargetingInstall retargetingEvent
            const hasRetargetingFields = d.groupDetails.length > 0 && 
              'retargetingInstall' in d.groupDetails[0] && 
              'retargetingEvent' in d.groupDetails[0];
            
            const groupsWithData = d.groupDetails.filter(g => {
              if (currentBadge === 'UA') {
                // UAmode：useinstall + event
                return (g.install + g.event) > 0;
              } else {
                // RTmode：useretargetingInstall + retargetingEvent（If）
                if (hasRetargetingFields) {
                  const groupWithRT = g as typeof g & { retargetingInstall: number; retargetingEvent: number };
                  return (groupWithRT.retargetingInstall + groupWithRT.retargetingEvent) > 0;
                }
                return false;
              }
            });
            
            // showdata
            if (groupsWithData.length > 0) {
              groupsWithData.forEach(group => {
                const groupValue = currentBadge === 'UA' 
                  ? (group.install + group.event)
                  : (hasRetargetingFields ? (group as typeof group & { retargetingInstall: number; retargetingEvent: number }).retargetingInstall + (group as typeof group & { retargetingInstall: number; retargetingEvent: number }).retargetingEvent : 0);
                tooltipContent += `
                  <div style="display: flex; justify-content: space-between; gap: 1rem; font-size: 0.75rem; color: #d1d5db; margin-top: 0.25rem;">
                    <span>${group.groupName}:</span>
                    <span style="font-weight: 600; color: #f9fafb;">${groupValue.toLocaleString()}</span>
                  </div>
                `;
              });
            }
          }
          
          // showTotal
          tooltipContent += `
            <div style="display: flex; justify-content: space-between; gap: 1rem; font-size: 0.75rem; color: #d1d5db; margin-top: 0.5rem; padding-top: 0.25rem; border-top: 1px solid #374151;">
              <span>Total:</span>
              <span style="font-weight: 600; color: #f9fafb;">${total.toLocaleString()}</span>
            </div>
          `;
          
          tooltipContent += `
            </div>
          `;
          
          tooltip
            .style('visibility', 'visible')
            .style('opacity', '1')
            .html(tooltipContent)
            .style('top', event.pageY - 10 + 'px')
            .style('left', event.pageX + 10 + 'px');
          
          d3.select(this)
            .style('opacity', 0.8);
        })
        .on('mousemove', function(event) {
          tooltip
            .style('top', event.pageY - 10 + 'px')
            .style('left', event.pageX + 10 + 'px');
        })
        .on('mouseout', function() {
          tooltip
            .style('opacity', '0')
            .style('visibility', 'hidden');
          
          d3.select(this)
            .style('opacity', 1);
        });
    }

    // Cleanup
    return () => {
      d3.select(`#funnel-chart-tooltip-${instanceId}`).remove();
    };
  }, [
    data,
    dimensions,
    showLabels,
    showTooltip,
    enableAnimation,
    instanceId,
    innerWidth,
    innerHeight,
    mode,
    badge,
    svgWidth,
    fitContainerWidth,
  ]);

  return (
    <div
      ref={fitContainerWidth ? containerRef : undefined}
      className={`funnel-chart ${className}`}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <svg
        ref={svgRef}
        width={svgWidth}
        height={height}
        style={{ display: 'block', ...(fitContainerWidth ? {} : { maxWidth: '100%' }) }}
      />
    </div>
  );
};
