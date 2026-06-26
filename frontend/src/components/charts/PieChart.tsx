import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
// Removed unused import: BaseChart
import { ChartDimensions } from './BaseChart';

export interface PieChartData {
  name: string;
  value: number;
  color?: string;
  // optional：forlegendshow（account / App ）
  icon?: string;
  // Optional platform for APP mode
  platform?: string;
  [key: string]: any;
}

export interface PieChartProps {
  data: PieChartData[];
  width?: number;
  height?: number;
  margin?: Partial<ChartDimensions['margin']>;
  innerRadius?: number;
  outerRadius?: number;
  showLabels?: boolean;
  showTooltip?: boolean;
  enableAnimation?: boolean;
  enableLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  nameField?: string;
  valueField?: string;
  className?: string;
}

export const PieChart: React.FC<PieChartProps> = ({
  data,
  width = 400,
  height = 400,
  margin = {},
  innerRadius = 0,
  outerRadius,
  showLabels = true,
  showTooltip = true,
  enableAnimation = true,
  enableLegend = true,
  legendPosition = 'right',
  nameField = 'name',
  valueField = 'value',
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  // Unique instance id to avoid tooltip collisions across instances
  const instanceId = useMemo(() => `pie-chart-${Math.random().toString(36).substr(2, 9)}`, []);
  // state：currentfocus（via name ）
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  // fordata，onlydatatriggeranimation
  const prevDataRef = useRef<string>('');
  // foreventhandlestate
  const selectedItemNameRef = useRef<string | null>(null);
  const [dimensions] = useState(() => ({
    width,
    height,
    margin: {
      top: 20,
      right: 200, // rightlabel（30 + 70 + labelwidth100）
      bottom: 20,
      left: 180, // leftlabel，labelelementsadaptive
      ...margin,
    },
  }));

  // getunique：Ifplatform，usename_platform，otherwiseusename
  const getUniqueId = useCallback((item: PieChartData): string => {
    const itemName = String(item[nameField]);
    if (item.platform) {
      return `${itemName}_${item.platform}`;
    }
    return itemName;
  }, [nameField]);

  const innerWidth = dimensions.width - dimensions.margin.left - dimensions.margin.right;
  const innerHeight = dimensions.height - dimensions.margin.top - dimensions.margin.bottom;
  // pie chartcomputelegend：onlyregioncompute
  const radius = Math.min(innerWidth, innerHeight) / 2;
  // defaultpie chart（）
  const actualOuterRadius = outerRadius || radius * 0.95;
  // ensure：IfinnerRadius0undefined，usedefault
  const actualInnerRadius = (innerRadius !== undefined && innerRadius > 0) ? innerRadius : radius * 0.35; // default

  useEffect(() => {
    if (!data || data.length === 0 || !svgRef.current) return;

    // Detect data change via serialization
    const currentDataKey = JSON.stringify(data.map(d => ({ name: d[nameField], value: d[valueField] })));
    let isDataChanged = prevDataRef.current !== currentDataKey;
    
    const svg = d3.select(svgRef.current);
    
    // Key fix：Ifdata，notclear SVG，Set tooltip
    // clicklegend/pie chartfocus（only selectedItemName），nottriggerre-renderanimation
    if (isDataChanged) {
      // data，Update ref re-render
      prevDataRef.current = currentDataKey;
      svg.selectAll('*').remove();
    } else {
      // Ifdata，Checkelementsalready，Ifcreate
      const existingG = svg.select('g');
      const existingPaths = existingG.selectAll('.arc path');
      const existingLegend = svg.select('.pie-legend');
      if (existingG.empty() || existingPaths.empty() || existingLegend.empty()) {
        // elementsnot，create（not，）
        isDataChanged = true;
        prevDataRef.current = currentDataKey;
        svg.selectAll('*').remove();
      }
    }

    // defs：forlegend Icon
    let defs = svg.select<SVGDefsElement>('defs');
    if (defs.empty()) {
      defs = svg.append<SVGDefsElement>('defs');
    }
    
    // Add
    let blurFilter = defs.select<SVGFilterElement>('#pie-blur-filter');
    if (blurFilter.empty()) {
      blurFilter = defs.append<SVGFilterElement>('filter')
        .attr('id', 'pie-blur-filter')
        .attr('x', '-50%')
        .attr('y', '-50%')
        .attr('width', '200%')
        .attr('height', '200%');
      
      // Add，
      blurFilter.append('feGaussianBlur')
        .attr('in', 'SourceGraphic')
        .attr('stdDeviation', 1.5)
        .attr('result', 'blur');
      
      // mergeraw，create
      blurFilter.append('feMerge')
        .append('feMergeNode')
        .attr('in', 'SourceGraphic');
      blurFilter.select('feMerge')
        .append('feMergeNode')
        .attr('in', 'blur')
        .attr('opacity', 0.3);
    }

    // computechartposition：onlyregion，pie chartlegend
    const chartCenterX = dimensions.margin.left + innerWidth / 2;
    // pie chart，pie chartcontainerbottom
    const verticalOffset = -12; // spacing
    const chartCenterY = dimensions.margin.top + innerHeight / 2 + verticalOffset;
    
    // creategetcontainer
    let g = svg.select<SVGGElement>('g');
    if (g.empty() || isDataChanged) {
      if (g.empty()) {
        g = svg
          .append<SVGGElement>('g')
          .attr('transform', `translate(${chartCenterX},${chartCenterY})`);
      }
    }

    // createpie chart
    const pie = d3
      .pie<PieChartData>()
      .value(d => d[valueField])
      .sort(null);

    // create
    const arc = d3
      .arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(actualInnerRadius)
      .outerRadius(actualOuterRadius);

    // createlabel（forpie chartlabel，）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const labelRadius = actualInnerRadius + (actualOuterRadius - actualInnerRadius) * 0.5;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const labelArc = d3
      .arc<d3.PieArcDatum<PieChartData>>()
      .innerRadius(labelRadius)
      .outerRadius(labelRadius);

    // createcolorscales - use、color
    // color：Avoid，usenot，ensure
    const defaultColors = [
      '#3b82f6', // blue-500 - blue
      '#ef4444', // red-500 - red
      '#10b981', // emerald-500 - green
      '#f59e0b', // amber-500 - orange
      '#8b5cf6', // violet-500 - purple
      '#06b6d4', // cyan-500 - cyan
      '#ec4899', // pink-500 - pink
      '#84cc16', // lime-500 - green
      '#f97316', // orange-500 - red
      '#6366f1', // indigo-500 - blue
      '#14b8a6', // teal-500 - green
      '#a855f7', // fuchsia-500 - red
    ];
    const colorScale = d3
      .scaleOrdinal<string>()
      .domain(data.map(d => d[nameField]))
      .range(data.map((d, i) => d.color || defaultColors[i % defaultColors.length]));

    // Createpie chartdata
    const pieData = pie(data);

    // create（Ifnot）
    const existingArcs = g.selectAll<SVGGElement, d3.PieArcDatum<PieChartData>>('.arc');
    let arcs: d3.Selection<SVGGElement, d3.PieArcDatum<PieChartData>, SVGGElement, unknown>;
    let paths: d3.Selection<SVGPathElement, d3.PieArcDatum<PieChartData>, SVGGElement, unknown>;
    
    if (existingArcs.empty() || isDataChanged) {
      const arcsUpdate = g
        .selectAll<SVGGElement, d3.PieArcDatum<PieChartData>>('.arc')
        .data(pieData);
      
      arcs = arcsUpdate
        .enter()
        .append<SVGGElement>('g')
        .attr('class', 'arc')
        .merge(arcsUpdate);

      // Add（usecolor，useAvoidhover）
      const pathsUpdate = arcs
        .selectAll<SVGPathElement, d3.PieArcDatum<PieChartData>>('path')
        .data((d: d3.PieArcDatum<PieChartData>) => [d]);
      
      paths = pathsUpdate
        .enter()
        .append<SVGPathElement>('path')
        .attr('fill', (d: d3.PieArcDatum<PieChartData>) => {
          const fillColor = colorScale(d.data[nameField]);
          return fillColor;
        })
        .attr('stroke', (d: d3.PieArcDatum<PieChartData>) => {
          // use，Avoidhover
          return colorScale(d.data[nameField]);
        })
        .attr('stroke-width', 1.5) // 1. 5px，not
        .attr('stroke-linejoin', 'round') // rounded corners，
        .attr('stroke-opacity', 1) // 1
        .style('cursor', 'pointer')
        .style('pointer-events', 'all') // ensuremouseevent
        .style('transition', 'opacity 0.15s ease, stroke-opacity 0.15s ease') // Addtransition
        .style('shape-rendering', 'geometricPrecision') // render，reduce
        .style('filter', 'url(#pie-blur-filter)') // app
        // Adddata，
        .attr('data-name', (d: d3.PieArcDatum<PieChartData>) => String(d.data[nameField]))
        .merge(pathsUpdate);
    } else {
      // data，usealready
      arcs = existingArcs;
      paths = g.selectAll<SVGPathElement, d3.PieArcDatum<PieChartData>>('.arc path');
    }

    // Add（Add，ensurepie chart）
    if (isDataChanged) {
      // Remove
      g.selectAll('.ring-line').remove();
      
      // create（usecolor）
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const innerRing = g.append('circle')
        .attr('class', 'ring-line inner-ring')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', actualInnerRadius)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(0, 0, 0, 0.12)')
        .attr('stroke-width', 1.5)
        .attr('stroke-dasharray', '4,4') // ，4px，4px
        .style('opacity', 0.7)
        .style('pointer-events', 'none'); // notmouseevent
      
      // create（use）
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const outerRing = g.append('circle')
        .attr('class', 'ring-line outer-ring')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', actualOuterRadius)
        .attr('fill', 'none')
        .attr('stroke', 'rgba(0, 0, 0, 0.12)')
        .attr('stroke-width', 1.5)
        // notSet stroke-dasharray，use
        .style('opacity', 0.7)
        .style('pointer-events', 'none'); // notmouseevent
    }

    // animation：onlydataplay
    if (enableAnimation && isDataChanged) {
      // create arc （，outerRadius = innerRadius）
      const initialArc = d3
        .arc<d3.PieArcDatum<PieChartData>>()
        .innerRadius(actualInnerRadius)
        .outerRadius(actualInnerRadius); // ，
      
      // data：Set（），playanimation
      paths
        .attr('d', d => initialArc(d) as string)
        .style('opacity', 1); // Set
      
      // use requestAnimationFrame ensurealreadySet，playanimation
      requestAnimationFrame(() => {
        const duration = 1000; // 1s transition
        paths
          .transition()
          .duration(duration)
          .ease(d3.easeCubicOut) // use，
          .attrTween('d', function(d) {
            // note
            const interpolate = d3.interpolate(actualInnerRadius, actualOuterRadius);
            return (t: number) => {
              // create arc ，outerRadius increase
              const animatedArc = d3
                .arc<d3.PieArcDatum<PieChartData>>()
                .innerRadius(actualInnerRadius)
                .outerRadius(interpolate(t));
              return animatedArc(d) as string;
            };
          })
          .on('end', function(d) {
            // animation，ensureuse arc
            d3.select(this).attr('d', (datum) => {
              const arcDatum = datum as d3.PieArcDatum<PieChartData>;
              return arc(arcDatum) as string;
            });
          });
      });
    } else {
      // animation：Set
      paths
        .attr('d', arc)
        .style('opacity', 1); // ensureSet
    }

    // black

    // Removeanimation，chart
    // textshow，usehoverdatalabel

    // legend：pie chartleftregion，color，textuse... ，Avoidpie chartregion
    if (enableLegend) {
      // legendcontainerleftfixedspacing（ SVG / containerleft，pie chartposition）
      const legendPaddingLeft = 16;
      const legendItemHeight = 32; // note
      const legendColorTextGap = 8;

      // legend： SVG left 16px ，not margin. left
      const legendLeft = legendPaddingLeft;
      // legendregionwidth：
      // - ：text
      // - pie chart，via，Avoidpie chartregion
      const donutLeftEdge = chartCenterX - actualOuterRadius; // pie chart
      const safeGapToDonut = 12; // pie chartminspacing
      const maxWidthByDonut = Math.max(0, donutLeftEdge - safeGapToDonut - legendLeft);
      // also，Avoidcontainerlegend
      const legendMaxWidth = Math.min(320, maxWidthByDonut);
      const legendRightMax = legendLeft + legendMaxWidth;
      // legendtextwidth，pie charttrigger
      const legendAvailableWidth = Math.max(0, legendRightMax - legendLeft);

      // ：containertop，independentpie chart
      const legendTop = dimensions.margin.top + 8;

      // clearlegendlegend，Avoidpositiontext
      // Ifdata，svg. selectAll('*'). remove()alreadyclearcontent，legendnot
      // Ifdata，legendalready，clearlegendAvoidcreate
      let legendGroup = svg.select<SVGGElement>('.pie-legend');
      
      if (legendGroup.empty()) {
        // legendnot，create
        legendGroup = svg.append('g').attr('class', 'pie-legend');
      } else {
        // legendalready，clearlegend，Avoidcreatetext
        legendGroup.selectAll('.legend-item-group').remove();
      }

      // width，compute
      const approxCharWidth = 7;
      
      // Check，only
      const hasMultipleItems = data.length > 1;

      data.forEach((item, index) => {
        const legendY = legendTop + index * legendItemHeight;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const color = colorScale(item[nameField]);
        const iconUrl = item.icon;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const itemName = String(item[nameField]);
        const uniqueId = getUniqueId(item); // getunique

        const group = legendGroup
          .append('g')
          .attr('class', 'legend-item-group')
          .attr('transform', `translate(${legendLeft}, ${legendY})`)
          .datum(item) // binddata，Update
          .style('cursor', hasMultipleItems ? 'pointer' : 'default');

        // Addbackground（for hover ）
        const bgRect = group
          .append('rect')
          .attr('class', 'legend-item-bg')
          .attr('x', -4)
          .attr('y', -14)
          .attr('width', legendMaxWidth + 8)
          .attr('height', 28)
          .attr('rx', 6)
          .attr('ry', 6)
          .attr('fill', 'transparent')
          .attr('stroke', 'transparent')
          .attr('stroke-width', 0)
          .style('transition', 'all 0.2s ease');

        // onlyuse（account / App ）legend，not
        // stylelinearea Icon： + + image
        const iconOuterRadius = 12;
        const iconInnerRadius = 10;
        const iconImageSize = 20;
        const symbolSize = iconUrl ? iconOuterRadius * 2 : 0;

        if (iconUrl) {
          // createlegend Icon
          // ensureIcony=0，text
          const iconGroup = group
            .append('g')
            .attr('class', 'pie-legend-icon')
            .attr('transform', `translate(0, 0)`); // Icon(0, 0)，texty=0

          // background（ + ）
          // (0, 0)，ensuretext
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const iconBg = iconGroup
            .append('circle')
            .attr('cx', 0)
            .attr('cy', 0)
            .attr('r', iconOuterRadius)
            .attr('fill', '#ffffff')
            .attr('stroke', '#e5e7eb')
            .attr('stroke-width', 1.2)
            .style('transition', 'all 0.2s ease');

          // legendcreate clipPath，
          const clipPathId = `pie-legend-icon-clip-${instanceId}-${index}`;
          defs
            .append('clipPath')
            .attr('id', clipPathId)
            .append('circle')
            .attr('r', iconInnerRadius);

          // support base64 URL， LineChart
          const iconHref =
            iconUrl.startsWith('data:') || iconUrl.startsWith('http')
              ? iconUrl
              : `data:image/png;base64,${iconUrl}`;

          iconGroup
            .append('image')
            .attr('href', iconHref)
            .attr('x', -iconImageSize / 2)
            .attr('y', -iconImageSize / 2)
            .attr('width', iconImageSize)
            .attr('height', iconImageSize)
            .attr('clip-path', `url(#${clipPathId})`)
            .on('error', function () {
              // imagefailedhide image，Avoid
              d3.select(this).style('display', 'none');
            });
        }

        // textwidth = legendwidth - spacing
        const maxTextWidth = Math.max(0, legendAvailableWidth - symbolSize - legendColorTextGap);
        const maxChars = maxTextWidth > 0 ? Math.floor(maxTextWidth / approxCharWidth) : 0;
        let labelText = String(item[nameField]);

        // Ifplatform，Addtext（unifiedhandle，ensureACCAPPmodestyle）
        if (item.platform) {
          const platformText = item.platform === 'iOS' ? 'IOS' : item.platform;
          labelText = `${labelText} (${platformText})`;
        }

        if (maxChars > 0 && labelText.length > maxChars) {
          // 3 position "... "
          const visibleChars = Math.max(0, maxChars - 3);
          labelText = labelText.slice(0, visibleChars) + '...';
        }

        // text - usestyle，render
        // ensuretexty=0，Icon
        group
          .append('text')
          .attr('class', 'legend-item-text')
          .attr('x', symbolSize + legendColorTextGap)
          .attr('y', 0) // y=0，Icon
          .attr('dominant-baseline', 'central') // note
          .attr('alignment-baseline', 'central') // ，ensure
          .attr('text-anchor', 'start') // ensuretextleft
          .style('font-size', '12px')
          .style('font-weight', '400') // ，
          .style('fill', '#374151') // Tailwind gray-700
          .style('font-family', 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif') // Tailwind font-sans
          .style('font-smoothing', 'antialiased') // render
          .style('-webkit-font-smoothing', 'antialiased') // WebKit
          .style('-moz-osx-font-smoothing', 'grayscale') // Firefox
          .style('transition', 'opacity 0.2s ease')
          .style('white-space', 'nowrap') // Preventtext
          .style('line-height', '1') // ensure1，Avoid
          .text(labelText);

        // Addinteractionevent
        group
          .on('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            
            // Ifonly，notlogic
            if (!hasMultipleItems) {
              return;
            }
            
            // clicklegend：focus（ensureunique）
            const newValue = selectedItemNameRef.current === uniqueId ? null : uniqueId;
            
            // Updateref，ensureeventhandleuse
            selectedItemNameRef.current = newValue;
            
            // Updatelegendstyle，ensureonly，
            legendGroup.selectAll<SVGGElement, PieChartData>('.legend-item-group').each(function(otherItem) {
              const otherGroup = d3.select(this);
              const otherUniqueId = getUniqueId(otherItem);
              const otherBgRect = otherGroup.select('.legend-item-bg');
              const otherText = otherGroup.select('.legend-item-text');
              const otherIconBg = otherGroup.select('.pie-legend-icon circle');
              
              const isOtherSelected = otherUniqueId === newValue;
              const isOtherDimmed = newValue !== null && !isOtherSelected;
              
              if (isOtherSelected) {
                // state：showbackgroundborder
                otherBgRect
                  .attr('fill', '#f3f4f6')
                  .attr('stroke', '#9ca3af')
                  .attr('stroke-width', 1.5)
                  .style('opacity', 1);
                otherText.style('opacity', 1);
                if (!otherIconBg.empty()) {
                  otherIconBg
                    .attr('stroke', '#9ca3af')
                    .attr('stroke-width', 1.8)
                    .style('opacity', 1);
                }
              } else {
                // state：（fillstroketransparent）
                otherBgRect
                  .attr('fill', 'transparent')
                  .attr('stroke', 'transparent')
                  .attr('stroke-width', 0)
                  .style('opacity', 1);
                // textdimmedSet
                otherText.style('opacity', isOtherDimmed ? 0.3 : 1);
                if (!otherIconBg.empty()) {
                  otherIconBg
                    .attr('stroke', '#e5e7eb')
                    .attr('stroke-width', 1.2)
                    .style('opacity', isOtherDimmed ? 0.3 : 1);
                }
              }
            });
            
            // Updatepie chart
            const g = svg.select('g');
            if (g && !g.empty()) {
              const paths = g.selectAll<SVGPathElement, d3.PieArcDatum<PieChartData>>('.arc path');
              paths.each(function(d) {
                const path = d3.select(this);
                const pathUniqueId = getUniqueId(d.data);
                if (newValue === null) {
                  // no：show，show
                  path.style('opacity', 1);
                  path.attr('stroke-opacity', 1);
                } else if (pathUniqueId === newValue) {
                  // ：show，show
                  path.style('opacity', 1);
                  path.attr('stroke-opacity', 1);
                } else {
                  // ：，also，Avoid
                  path.style('opacity', 0.3);
                  path.attr('stroke-opacity', 0.3); // sync
                }
              });
            }
            
            // Updatestate，triggeruseEffectsync（，ensurestate）
            setSelectedItemName(newValue);
          })
          .on('mouseenter', function() {
            // Ifonly，notshowhover
            if (!hasMultipleItems) {
              return;
            }
            // hover：backgroundhighlight（onlycurrentshow）
            const current = selectedItemNameRef.current;
            if (current === null || current === uniqueId) {
              bgRect
                .attr('fill', '#f9fafb') // Tailwind gray-50
                .attr('stroke', '#d1d5db') // Tailwind gray-300
                .attr('stroke-width', 1);
            }
          })
          .on('mouseleave', function() {
            // Ifonly，notshowhover
            if (!hasMultipleItems) {
              return;
            }
            // Restorebackground（state）
            const current = selectedItemNameRef.current;
            if (current === uniqueId) {
              bgRect
                .attr('fill', '#f3f4f6') // Tailwind gray-100
                .attr('stroke', '#9ca3af') // Tailwind gray-400
                .attr('stroke-width', 1.5);
            } else {
              bgRect
                .attr('fill', 'transparent')
                .attr('stroke', 'transparent')
                .attr('stroke-width', 0);
            }
          });
      });
    }

    // legendalreadypie chartlabel，notlegend

    // Addtooltip - useuniqueIDAvoidconflicts
    if (showTooltip) {
      const tooltipId = `pie-chart-tooltip-${instanceId}`;
      // Removetooltip
      d3.select(`#${tooltipId}`).remove();
      // createTailwindtooltip
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
        .style('padding', '0.75rem 1rem') // Tailwind p-3 px-4
        .style('border-radius', '0.5rem') // Tailwind rounded-lg
        .style('font-size', '0.875rem') // Tailwind text-sm
        .style('font-family', 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif') // Tailwind font-sans
        .style('line-height', '1.5') // Tailwind leading-normal
        .style('pointer-events', 'none')
        .style('z-index', '1000')
        .style('box-shadow', '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)') // Tailwind shadow-lg
        .style('border', '1px solid #374151') // Tailwind gray-700 border
        .style('backdrop-filter', 'blur(8px)')
        .style('transition', 'opacity 0.15s ease-in-out');

      const handleMouseOver = (event: MouseEvent, d: d3.PieArcDatum<PieChartData>) => {
        if (!d) return;
        const percentage = Math.round(((d.endAngle - d.startAngle) / (2 * Math.PI)) * 100);
        const platformText = d.data.platform ? (d.data.platform === 'iOS' ? 'IOS' : d.data.platform) : '';
        
        // showtooltip，nottransition
        tooltip
          .style('visibility', 'visible')
          .style('opacity', '1')
          .html(`
            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
              <div style="font-weight: 600; font-size: 0.875rem; color: #f9fafb;">${d.data[nameField]}${platformText ? ` (${platformText})` : ''}</div>
              <div style="display: flex; justify-content: space-between; gap: 1rem; font-size: 0.75rem; color: #d1d5db;">
                <span>Total Records:</span>
                <span style="font-weight: 600; color: #f9fafb;">${d.data[valueField].toLocaleString()}</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 1rem; font-size: 0.75rem; color: #d1d5db;">
                <span>Percentage:</span>
                <span style="font-weight: 600; color: #f9fafb;">${percentage}%</span>
              </div>
            </div>
          `);
        
        // Updateposition
        tooltip
          .style('top', event.pageY - 10 + 'px')
          .style('left', event.pageX + 10 + 'px');
      };

      const handleMouseMove = (event: MouseEvent, d: d3.PieArcDatum<PieChartData>) => {
        // Updatetooltippositioncontent
        if (d) {
          const percentage = Math.round(((d.endAngle - d.startAngle) / (2 * Math.PI)) * 100);
          const platformText = d.data.platform ? (d.data.platform === 'iOS' ? 'IOS' : d.data.platform) : '';
          tooltip
            .style('top', event.pageY - 10 + 'px')
            .style('left', event.pageX + 10 + 'px')
            .style('visibility', 'visible')
            .style('opacity', '1')
            .html(`
              <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                <div style="font-weight: 600; font-size: 0.875rem; color: #f9fafb;">${d.data[nameField]}${platformText ? ` (${platformText})` : ''}</div>
                <div style="display: flex; justify-content: space-between; gap: 1rem; font-size: 0.75rem; color: #d1d5db;">
                  <span>Total Records:</span>
                  <span style="font-weight: 600; color: #f9fafb;">${d.data[valueField].toLocaleString()}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 1rem; font-size: 0.75rem; color: #d1d5db;">
                  <span>Percentage:</span>
                  <span style="font-weight: 600; color: #f9fafb;">${percentage}%</span>
                </div>
              </div>
            `);
        }
      };

      const handleMouseOut = () => {
        // hidetooltip，Avoid
        tooltip
          .style('opacity', '0')
          .style('visibility', 'hidden');
      };

      // clickpie chart：focus
      // Check，only
      const hasMultipleItems = data.length > 1;
      
      paths
        .on('click', function(event, d) {
          event.preventDefault();
          event.stopPropagation(); // event
          
          // Ifonly，notlogic
          if (!hasMultipleItems) {
            return;
          }
          
          const uniqueId = getUniqueId(d.data); // getunique
          // Ifclickalready，；otherwise（unique）
          setSelectedItemName(prev => {
            const newValue = prev === uniqueId ? null : uniqueId;
            // Updateref，ensureeventhandleuse
            selectedItemNameRef.current = newValue;
            return newValue;
          });
        })
        .on('mouseover', handleMouseOver)
        .on('mousemove', handleMouseMove)
        .on('mouseout', handleMouseOut)
        .on('mouseenter', function(event, d) {
          // hover：（onlystate）
          // notAdd，Avoid
          const current = selectedItemNameRef.current;
          const uniqueId = getUniqueId(d.data);
          const path = d3.select(this);
          if (current === null || uniqueId === current) {
            path.style('opacity', 0.9);
            path.attr('stroke-opacity', 0.9); // sync
          }
        })
        .on('mouseleave', function(event, d) {
          // Restorerawstate（state）
          const current = selectedItemNameRef.current;
          const uniqueId = getUniqueId(d.data);
          const path = d3.select(this);
          if (current === null) {
            path.style('opacity', 1);
            path.attr('stroke-opacity', 1);
          } else if (uniqueId === current) {
            path.style('opacity', 1);
            path.attr('stroke-opacity', 1);
          } else {
            path.style('opacity', 0.3);
            path.attr('stroke-opacity', 0.3); // sync
          }
        });
    }

    // Cleanup - onlyclearcurrenttooltip，Avoidchart
    return () => {
      d3.select(`#pie-chart-tooltip-${instanceId}`).remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, dimensions, innerRadius, actualInnerRadius, actualOuterRadius, showLabels, showTooltip, enableAnimation, enableLegend, legendPosition, nameField, valueField, instanceId]); // Remove selectedItemName，Avoidstatere-renderchart

  // sync ref state
  useEffect(() => {
    selectedItemNameRef.current = selectedItemName;
  }, [selectedItemName]);

  // useEffect：onlylisten forstate，Updatestyle（nottriggeranimation）
  useEffect(() => {
    if (!svgRef.current || !data || data.length === 0) return;

    // Ifonly，stateensureelementsnotshow
    const hasMultipleItems = data.length > 1;
    if (!hasMultipleItems) {
      // state
      if (selectedItemName !== null) {
        setSelectedItemName(null);
        selectedItemNameRef.current = null;
      }
      
      // ensurepie chartnot，not
      const svg = d3.select(svgRef.current);
      const g = svg.select('g');
      if (g && !g.empty()) {
        const paths = g.selectAll<SVGPathElement, d3.PieArcDatum<PieChartData>>('.arc path');
        paths
          .style('opacity', 1)
          .attr('stroke-opacity', 1);
      }
      
      // ensurelegendnotshow
      const legendGroup = svg.select('.pie-legend');
      if (legendGroup && !legendGroup.empty()) {
        legendGroup.selectAll('.legend-item-group').each(function() {
          const group = d3.select(this);
          const bgRect = group.select('.legend-item-bg');
          const text = group.select('.legend-item-text');
          const iconBg = group.select('.pie-legend-icon circle');
          
          bgRect
            .attr('fill', 'transparent')
            .attr('stroke', 'transparent')
            .attr('stroke-width', 0)
            .style('opacity', 1);
          text.style('opacity', 1);
          if (!iconBg.empty()) {
            iconBg
              .attr('stroke', '#e5e7eb')
              .attr('stroke-width', 1.2)
              .style('opacity', 1);
          }
        });
      }
      
      return; // ，notstateUpdate
    }

    const svg = d3.select(svgRef.current);
    const g = svg.select('g'); // pie chartcontainer
    const legendGroup = svg.select('.pie-legend');

    // Updatepie chart
    if (g && !g.empty()) {
      const paths = g.selectAll<SVGPathElement, d3.PieArcDatum<PieChartData>>('.arc path');
      paths.each(function(d) {
        const path = d3.select(this);
        const uniqueId = getUniqueId(d.data);
        if (selectedItemName === null) {
          // no：show，show
          path.style('opacity', 1);
          path.attr('stroke-opacity', 1);
        } else if (uniqueId === selectedItemName) {
          // ：show，show
          path.style('opacity', 1);
          path.attr('stroke-opacity', 1);
        } else {
          // ：，also，Avoid
          path.style('opacity', 0.3);
          path.attr('stroke-opacity', 0.3); // sync
        }
      });
    }

    // Updatelegendstyle
    if (legendGroup && !legendGroup.empty()) {
      legendGroup.selectAll<SVGGElement, PieChartData>('.legend-item-group').each(function(d) {
        const group = d3.select(this);
        // datagetuniqueId（createuselogic）
        const uniqueId = getUniqueId(d);
        const isSelected = selectedItemName === uniqueId;
        const isDimmed = selectedItemName !== null && !isSelected;

        // Updatebackground - ensure
        const bgRect = group.select('.legend-item-bg');
        if (!bgRect.empty()) {
          if (isSelected) {
            // state：showbackgroundborder
            bgRect
              .attr('fill', '#f3f4f6')
              .attr('stroke', '#9ca3af')
              .attr('stroke-width', 1.5)
              .style('opacity', 1);
          } else {
            // state：（nodimmed）
            bgRect
              .attr('fill', 'transparent')
              .attr('stroke', 'transparent')
              .attr('stroke-width', 0)
              .style('opacity', 1);
          }
        }

        // Updatetext
        const text = group.select('.legend-item-text');
        if (!text.empty()) {
          text.style('opacity', isDimmed ? 0.3 : 1);
        }

        // Update
        const iconBg = group.select('.pie-legend-icon circle');
        if (!iconBg.empty()) {
          iconBg
            .attr('stroke', isSelected ? '#9ca3af' : '#e5e7eb')
            .attr('stroke-width', isSelected ? 1.8 : 1.2)
            .style('opacity', isDimmed ? 0.3 : 1);
        }
      });
    }
  }, [selectedItemName, data, nameField, instanceId, getUniqueId]);

  return (
    <div className={`pie-chart ${className}`} style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <svg ref={svgRef} width={width} height={height} style={{ display: 'block', maxWidth: '100%' }} />
    </div>
  );
};
