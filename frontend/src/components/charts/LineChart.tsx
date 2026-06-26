import React, { useRef, useEffect, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
// Removed unused import: BaseChart
import { ChartDimensions, formatNumber, formatDate } from './BaseChart';

export interface LineChartData {
  date: string;
  value: number;
  [key: string]: any;
}

// datainterface
export interface LineChartSeries {
  id: string;        // ID（accountappID）
  name: string;     // （accountapp）
  icon?: string;    // URLbase64
  platform?: string; // platform：IOSAndroid（onlyAPP）
  data: LineChartData[]; // data
  color?: string;   // optionalcolor
}

export interface LineChartProps {
  data?: LineChartData[]; // data（compatibility，Whenuseseriesoptional）
  series?: LineChartSeries[]; // data（）
  width?: number;
  height?: number;
  margin?: Partial<ChartDimensions['margin']>;
  color?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  enableZoom?: boolean;
  enableAnimation?: boolean;
  xField?: string;
  yField?: string;
  className?: string;
  hideYAxis?: boolean; // hideY
  showArea?: boolean; // showarea
  useStraightLine?: boolean; // use（notcurve）
  areaGradientColor?: 'red' | 'green' | 'blue' | string; // regiongradient
  valueLabel?: string; // value labelstext（ "Install" "Event"）
  highlightedSeriesId?: string | null; // highlightID
  onHighlightChange?: (seriesId: string | null) => void; // highlightcallback
  /** true containerwidth SVG X （ CSS zoom），for*/
  fitContainerWidth?: boolean;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  series,
  width = 800,
  height = 400,
  margin = {},
  color = '#1890ff',
  showGrid = true,
  showTooltip = true,
  enableZoom = true,
  enableAnimation = true,
  xField = 'date',
  yField = 'value',
  className = '',
  hideYAxis = false,
  showArea = true,
  useStraightLine = false,
  areaGradientColor = 'green',
  valueLabel = 'Install',
  highlightedSeriesId: externalHighlightedSeriesId,
  onHighlightChange,
  fitContainerWidth = false,
}) => {
  // Ifseries，usemode；otherwiseusemode（compatibility）
  const isMultiSeries = series && series.length > 0;
  const seriesData = useMemo(() => {
    return isMultiSeries ? series! : (data && data.length > 0 ? [{ id: 'default', name: 'Default', data, color }] : []);
  }, [isMultiSeries, series, data, color]);
  const svgRef = useRef<SVGSVGElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _tooltipRef = useRef<HTMLDivElement>(null);
  
  // Unique instance id to avoid tooltip collisions across instances
  const instanceId = useMemo(() => `line-chart-${Math.random().toString(36).substr(2, 9)}`, []);
  
  // fordata，onlydatatriggeranimation
  const prevDataRef = useRef<string>('');
  
  // highlightfocusstate：If，use；otherwiseusestate
  const [internalHighlightedSeriesId, setInternalHighlightedSeriesId] = useState<string | null>(
    isMultiSeries && seriesData.length > 0 ? seriesData[0].id : null
  );
  
  // usehighlightID，Ifusestate
  const highlightedSeriesId = externalHighlightedSeriesId !== undefined 
    ? externalHighlightedSeriesId 
    : internalHighlightedSeriesId;
  
  // UpdatehighlightID
  const setHighlightedSeriesId = useCallback((seriesId: string | null) => {
    if (onHighlightChange) {
      // Ifcallback，callback
      onHighlightChange(seriesId);
    } else {
      // otherwiseUpdatestate
      setInternalHighlightedSeriesId(seriesId);
    }
  }, [onHighlightChange]);
  
  // userefhighlightedSeriesId，
  const highlightedSeriesIdRef = useRef<string | null>(highlightedSeriesId);
  
  // syncrefstate
  useEffect(() => {
    highlightedSeriesIdRef.current = highlightedSeriesId;
  }, [highlightedSeriesId]);
  
  const [dimensions] = useState(() => ({
    width,
    height,
    margin: {
      top: 20,
      right: 30,
      bottom: 40,
      left: 60,
      ...margin,
    },
  }));

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

  const svgWidth = fitContainerWidth ? layoutMeasuredWidth : width;
  const innerHeight = dimensions.height - dimensions.margin.top - dimensions.margin.bottom;
  const innerWidth = Math.max(24, svgWidth - dimensions.margin.left - dimensions.margin.right);

  // Whenseries，Updatehighlight
  // Ifcurrenthighlight，；otherwisetoggle
  // Note：If，use，nottoggle
  const seriesIds = useMemo(() => seriesData.map(s => s.id).join(','), [seriesData]);
  useEffect(() => {
    // If，nothighlight
    if (externalHighlightedSeriesId !== undefined) {
      return;
    }
    
    if (isMultiSeries && seriesData.length > 0) {
      const currentHighlightedId = highlightedSeriesIdRef.current;
      // Checkcurrenthighlight（useid）
      const currentSeriesExists = currentHighlightedId && seriesData.some(s => s.id === currentHighlightedId);
      
      if (currentSeriesExists) {
        // currenthighlight，
        // notUpdate，id
      } else {
        // currenthighlightnot，toggle
        const firstSeriesId = seriesData[0].id;
        setHighlightedSeriesId(firstSeriesId);
        highlightedSeriesIdRef.current = firstSeriesId;
      }
    } else {
      setHighlightedSeriesId(null);
      highlightedSeriesIdRef.current = null;
    }
  }, [isMultiSeries, seriesIds, externalHighlightedSeriesId, seriesData, setHighlightedSeriesId]);

  useEffect(() => {
    // Checkdata
    const hasData = isMultiSeries 
      ? (seriesData.length > 0 && seriesData.some(s => s.data && s.data.length > 0))
      : (data && data.length > 0);
    
    if (!hasData || !svgRef.current) return;

    // Detect data change via serialization
    const currentDataKey = isMultiSeries
      ? JSON.stringify(seriesData.map(s => ({ id: s.id, data: s.data })))
      : JSON.stringify(data);
    const isDataChanged = prevDataRef.current !== currentDataKey;
    const layoutChanged =
      fitContainerWidth && lastDrawnSvgWidthRef.current !== svgWidth;
    // ResizeObserver width：only layoutChanged ，dataplayanimation
    const shouldPlayIntroAnimation = enableAnimation && (isDataChanged || layoutChanged);

    const svg = d3.select(svgRef.current);

    // data、containerwidth；onlyhighlightkeep SVG，independent effect Updatestyle
    if (isDataChanged || layoutChanged) {
      if (isDataChanged) {
        prevDataRef.current = currentDataKey;
      }
      if (fitContainerWidth) {
        lastDrawnSvgWidthRef.current = svgWidth;
      }
      svg.selectAll('*').remove();
    }
    // Ifdata，notclear SVG，Set tooltip

    // createcontainer（Ifnot）
    let g = svg.select('g') as d3.Selection<SVGGElement, unknown, null, undefined>;
    if (g.empty()) {
      g = svg
        .append('g')
        .attr('transform', `translate(${dimensions.margin.left},${dimensions.margin.top})`);
    }
    
    // getcreatedefselements（useinstanceIdensureunique）
    let defs = svg.select<SVGDefsElement>(`defs[data-instance-id="${instanceId}"]`);
    if (defs.empty()) {
      defs = svg.append<SVGDefsElement>('defs').attr('data-instance-id', instanceId);
    } else {
      // Ifdefsalreadydata，cleargradientclipPath
      if (isDataChanged) {
        defs.selectAll('*').remove();
      }
    }

    // data
    const allParsedSeries = seriesData.map(series => {
      const seriesDataArray = series.data;
      if (!seriesDataArray || seriesDataArray.length === 0) return null;

      // date，for
      const parsedDates = seriesDataArray.map(d => {
        const dateStr = d[xField].toString();
        return new Date(dateStr);
      }).filter(d => !isNaN(d.getTime()));
      
      // data
      if (parsedDates.length > 0) {
        const dateExtent = d3.extent(parsedDates) as [Date, Date];
        const isSingleDay = dateExtent[0] && dateExtent[1] && 
          dateExtent[0].getFullYear() === dateExtent[1].getFullYear() &&
          dateExtent[0].getMonth() === dateExtent[1].getMonth() &&
          dateExtent[0].getDate() === dateExtent[1].getDate();
        
        // Checkdata
        // 1：Checkraw（date）
        const firstValue = seriesDataArray[0][xField];
        const firstValueStr = firstValue ? firstValue.toString() : '';
        const hasSpaceAndColon = firstValueStr.includes(' ') && firstValueStr.includes(':');
        
        // 2：CheckDate
        let hasHourInfo = false;
        try {
          const testDate = new Date(firstValueStr);
          if (!isNaN(testDate.getTime())) {
            hasHourInfo = testDate.getHours() !== 0 || testDate.getMinutes() !== 0 || testDate.getSeconds() !== 0;
          }
        } catch (e) {
          // error
        }
        
        // onlyWhendata，data
        // If，，show
        const isHourlyData = (hasSpaceAndColon || hasHourInfo) && isSingleDay;

        const parsedData = seriesDataArray.map((d, index) => {
          let dateValue: Date;
          const dateStr = d[xField].toString();
          
          if (isHourlyData) {
            // data：keep
            dateValue = new Date(dateStr);
          } else {
            // datadata：When（00: 00: 00）
            dateValue = new Date(dateStr);
            dateValue.setHours(0, 0, 0, 0);
          }
          
          return {
            ...d,
            date: dateValue,
            value: +d[yField],
            originalIndex: index,
            seriesId: series.id,
            seriesName: series.name,
          };
        });

        return {
          ...series,
          parsedData,
          isHourlyData,
        };
      }
      
      // Ifnodate，null
      return null;
    }).filter(s => s !== null) as Array<{
      id: string;
      name: string;
      icon?: string;
      platform?: string;
      color?: string;
      parsedData: Array<{
        date: Date;
        value: number;
        seriesId: string;
        seriesName: string;
        [key: string]: any;
      }>;
      isHourlyData: boolean;
    }>;

    if (allParsedSeries.length === 0) return;

    // mergedatacomputedomain
    const allDates: Date[] = [];
    let maxValue = 0;
    allParsedSeries.forEach(series => {
      series.parsedData.forEach(d => {
        allDates.push(d.date);
        if (d.value > maxValue) maxValue = d.value;
      });
    });

    // createscales - data
    const xDomain = d3.extent(allDates) as [Date, Date];
    
    // data：Checkmindatedatesame day
    // ensureisSingleDay，data
    const isSingleDay = xDomain[0] && xDomain[1] ? (
      xDomain[0].getFullYear() === xDomain[1].getFullYear() &&
      xDomain[0].getMonth() === xDomain[1].getMonth() &&
      xDomain[0].getDate() === xDomain[1].getDate()
    ) : false;
    
    // onlyWhendata，data
    // If，，show
    const isHourlyData = allParsedSeries[0].isHourlyData && isSingleDay;
    
    // datedata，ensuredomaindateWhen
    if (!isHourlyData && xDomain[1]) {
      const endDate = new Date(xDomain[1]);
      endDate.setHours(23, 59, 59, 999);
      xDomain[1] = endDate;
    }

    // X logic：foradaptivewidth（fitContainerWidth ）
    const uniqueDatesForTicks = !isHourlyData
      ? Array.from(
          new Set(
            allDates.map(d => {
              const date = new Date(d);
              date.setHours(0, 0, 0, 0);
              return date.getTime();
            })
          )
        )
          .sort((a, b) => a - b)
          .map(t => new Date(t))
      : [];
    const tickCount = isHourlyData ? 24 : Math.max(1, uniqueDatesForTicks.length);
    const tickIntervals = Math.max(1, tickCount - 1);

    let xPlotWidth = innerWidth;
    if (fitContainerWidth) {
      const charW = 7; // 12px
      const basePad = 6;
      let endReserve: number;
      if (isHourlyData) {
        // 24 ： 1～2 ，right，widthspacing
        endReserve = basePad + 14;
      } else if (uniqueDatesForTicks.length > 8) {
        const n = uniqueDatesForTicks.length;
        endReserve = basePad + 4 + String(n).length * charW;
      } else {
        endReserve = basePad + 26; // "MM/DD"
      }
      endReserve = Math.min(endReserve, innerWidth * 0.2);

      let plotFromLabels = Math.max(8, innerWidth - endReserve);

      // suggestionsminspacing，container「label」「spacing」
      const minGap =
        tickCount >= 20 ? 9 : tickCount >= 12 ? 11 : tickCount >= 8 ? 14 : 18;
      const minPlotForTicks = minGap * tickIntervals;
      const maxPlot = Math.max(8, innerWidth - 8);
      plotFromLabels = Math.max(plotFromLabels, Math.min(minPlotForTicks, maxPlot));
      xPlotWidth = Math.min(plotFromLabels, maxPlot);
    }

    const xScale = d3
      .scaleTime()
      .domain(xDomain)
      .range([0, xPlotWidth]);

    const yScale = d3
      .scaleLinear()
      .domain([0, maxValue])
      .nice()
      .range([innerHeight, 0]);

    // detectIconoverlap：logic，onlydetectpositionoverlap（Iconposition）
    // Icon12，overlapthreshold24（Iconoverlap）
    const iconPositions: Array<{ 
      seriesId: string; 
      x: number; 
      y: number; 
    }> = [];
    allParsedSeries.forEach(series => {
      if (series.parsedData.length > 0 && series.icon) {
        // Iconfixedshowstart point（data points）
        const firstPoint = series.parsedData[0];
        // IconXcoordinatefixedYposition（-20），Ycoordinatefixedstart point
        const iconX = -20; // fixedYleft20
        const iconY = yScale(firstPoint.value); // Ycoordinatefixedstart point
        iconPositions.push({ 
          seriesId: series.id, 
          x: iconX, 
          y: iconY
        });
      }
    });

    // positionoverlapIcon（onlypositionoverlap，notIcon）
    // threshold：24（Iconoverlap，Icon12*2）
    const overlapThreshold = 24;
    
    // useunion-find，ensureoverlapIcon
    const seriesToGroup: Map<string, string[]> = new Map();
    
    // Initialize：Icon
    iconPositions.forEach(pos => {
      seriesToGroup.set(pos.seriesId, [pos.seriesId]);
    });
    
    // mergeoverlap（onlypositionoverlap）
    iconPositions.forEach((pos1, i) => {
      iconPositions.forEach((pos2, j) => {
        if (i !== j) {
          // onlydetectpositionoverlap（Ycoordinatethreshold）
          const distance = Math.abs(pos1.y - pos2.y);
          if (distance < overlapThreshold) {
            // note
            const group1 = seriesToGroup.get(pos1.seriesId) || [];
            const group2 = seriesToGroup.get(pos2.seriesId) || [];
            
            // Ifnot，merge
            if (group1 !== group2) {
              const mergedGroup = [...new Set([...group1, ...group2])];
              // Updaterefs
              mergedGroup.forEach(seriesId => {
                seriesToGroup.set(seriesId, mergedGroup);
              });
            }
          }
        }
      });
    });

    // createregion
    const lineCurve = useStraightLine ? d3.curveLinear : d3.curveMonotoneX;
    const createLine = (seriesData: typeof allParsedSeries[0]['parsedData']) => {
      return d3
        .line<typeof seriesData[0]>()
        .x(d => xScale(d.date))
        .y(d => yScale(d.value))
        .curve(lineCurve);
    };

    const createArea = (seriesData: typeof allParsedSeries[0]['parsedData']) => {
      return d3
        .area<typeof seriesData[0]>()
        .x(d => xScale(d.date))
        .y0(innerHeight)
        .y1(d => yScale(d.value))
        .curve(lineCurve);
    };

    // Grid lines - Tailwind minimal（optional）
    // IfshowGridfalse，notshowgrid lines

    // Addgradient defs - creategradient（ areaGradientColor ）
    // Note：defsalreadygetcreate
    const getGradientColors = (colorType: string) => {
      switch (colorType.toLowerCase()) {
        case 'red':
          return { start: '#000000', end: '#ef4444' }; // blackred
        case 'green':
          return { start: '#000000', end: '#10b981' }; // blackgreen
        case 'blue':
          return { start: '#000000', end: '#3b82f6' }; // blackblue
        default:
          // Ifcolor，use
          return { start: '#000000', end: colorType };
      }
    };
    
    allParsedSeries.forEach((series, seriesIndex) => {
      const gradientColors = getGradientColors(areaGradientColor);
      // useinstanceIdensurechartgradientIDunique，Avoidnotchartconflicts
      const gradientId = `lineGradient-${instanceId}-${series.id}`;
      
      // Key fix：Removegradient，AvoidAddcolor
      // use：linearGradientelements，viaidRemove
      defs.selectAll('linearGradient').each(function() {
        const elem = d3.select(this);
        if (elem.attr('id') === gradientId) {
          elem.remove();
        }
      });
      
      // creategradient（each timecreate，ensurenot）
      const gradient = defs
        .append('linearGradient')
        .attr('id', gradientId)
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 0)
        .attr('y2', innerHeight);

      gradient
        .append('stop')
        .attr('offset', '0%')
        .attr('stop-color', gradientColors.start)
        .attr('stop-opacity', 0.3);

      gradient
        .append('stop')
        .attr('offset', '100%')
        .attr('stop-color', gradientColors.end)
        .attr('stop-opacity', 0.1);
    });

    // createregion
    allParsedSeries.forEach((series, seriesIndex) => {
      // Ifdata，Checkelementsalready，Ifcreate
      if (!isDataChanged) {
        // useensureID
        const existingLine = g.selectAll('path').filter(function() {
          const className = d3.select(this).attr('class') || '';
          return className.includes('line') && className.includes(`line-${series.id}`);
        });
        const existingArea = showArea ? g.selectAll('path').filter(function() {
          const className = d3.select(this).attr('class') || '';
          return className.includes('area') && className.includes(`area-${series.id}`);
        }) : { empty: () => true };
        if (!existingLine.empty() && (!showArea || !existingArea.empty())) {
          // elementsalready，create，
          return;
        }
      }

      const line = createLine(series.parsedData);
      const area = createArea(series.parsedData);
      const seriesColor = series.color || '#000000';
      
      // currenthighlight（mode）
      const isHighlighted = !isMultiSeries || highlightedSeriesId === series.id;
      const opacity = isHighlighted ? 1 : 0.3; // highlight

      // Addregion（IfshowAreatrue）
      if (showArea) {
        // Key fix：Removeregionelements，AvoidAddcolor
        // useensureID
        const existingArea = g.selectAll('path').filter(function() {
          const className = d3.select(this).attr('class') || '';
          return className.includes('area') && className.includes(`area-${series.id}`);
        });
        if (!existingArea.empty()) {
          existingArea.remove();
        }
        
        // useinstanceIdensuregradientrefs
        const gradientId = `lineGradient-${instanceId}-${series.id}`;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const areaPath = g
          .append('path')
          .datum(series.parsedData)
          .attr('class', `area area-${series.id}`)
          .attr('fill', `url(#${gradientId})`)
          .attr('d', area)
          .style('opacity', opacity);
      }

      // Add - useblack
      // Key fix：Removeelements，AvoidAdd
      // useensureID
      const existingLine = g.selectAll('path').filter(function() {
        const className = d3.select(this).attr('class') || '';
        return className.includes('line') && className.includes(`line-${series.id}`);
      });
      if (!existingLine.empty()) {
        existingLine.remove();
      }
      
      const path = g
        .append('path')
        .datum(series.parsedData)
        .attr('class', `line line-${series.id}`)
        .attr('fill', 'none')
        .attr('stroke', seriesColor)
        .attr('stroke-width', 2)
        .attr('d', line)
        .style('opacity', opacity);

      // Addanimation：onlydataplay
      if (shouldPlayIntroAnimation) {
        const totalLength = path.node()?.getTotalLength() || 0;
        path
          .attr('stroke-dasharray', totalLength + ' ' + totalLength)
          .attr('stroke-dashoffset', totalLength)
          .transition()
          .duration(950)
          .delay(seriesIndex * 70) // 70ms
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0);
      }

      // Note：createX，ensureX
      // createlogicXcreate

      // YAddIcon（fixedshowstart pointposition）
      if (series.parsedData.length > 0 && series.icon) {
        // Key fix：RemoveIconelements，AvoidAdd
        // useensureID
        const existingIconGroup = g.selectAll('g').filter(function() {
          const className = d3.select(this).attr('class') || '';
          // ：class "icon-group" "icon-{series. id}"
          return className.includes('icon-group') && className.includes(`icon-${series.id}`);
        });
        if (!existingIconGroup.empty()) {
          existingIconGroup.remove();
        }
        
        // Iconfixedshowstart point（data points）
        const firstPoint = series.parsedData[0];
        // IconXcoordinatefixedYposition（left20），Ycoordinatefixedstart point
        const iconX = -20; // fixedYleft20
        const iconY = yScale(firstPoint.value); // Ycoordinatefixedstart point
        
        // createIcon
        // Key fix：ensureIconresponseclickevent，overlap
        // viaSetpointer-eventsensureIconevent
        const iconGroup = g
          .append('g')
          .attr('class', `icon-group icon-${series.id}`)
          .attr('transform', `translate(${iconX}, ${iconY})`)
          .style('opacity', opacity)
          .style('pointer-events', 'all'); // ensureIconclickevent

        // AddIconbackground（）
        // Key fix：ensureIconbackgroundclickevent，overlap
        const iconBg = iconGroup
          .append('circle')
          .attr('r', 12)
          .attr('fill', '#ffffff')
          .attr('stroke', isHighlighted ? '#000000' : '#e5e7eb')
          .attr('stroke-width', isHighlighted ? 2 : 1)
          .style('transition', 'all 0.2s ease')
          .style('pointer-events', 'all'); // ensurebackgroundclickevent

        // createclipPath（defs）
        // useinstanceIdensurechartclipPath IDunique，Avoidnotchartconflicts
        const clipPathId = `iconClip-${instanceId}-${series.id}`;
        
        // Key fix：RemoveclipPath，AvoidAdd
        defs.selectAll('clipPath').each(function() {
          const elem = d3.select(this);
          if (elem.attr('id') === clipPathId) {
            elem.remove();
          }
        });
        
        // createclipPath
        const clipPath = defs
          .append('clipPath')
          .attr('id', clipPathId);
        clipPath
          .append('circle')
          .attr('r', 10);

        // AddIconimage（supportbase64URL）
        const iconHref = series.icon.startsWith('data:') || series.icon.startsWith('http') 
          ? series.icon 
          : `data:image/png;base64,${series.icon}`;
        
        iconGroup
          .append('image')
          .attr('href', iconHref)
          .attr('x', -10)
          .attr('y', -10)
          .attr('width', 20)
          .attr('height', 20)
          .attr('clip-path', `url(#${clipPathId})`)
          .on('error', function() {
            // Ifimagefailed，hideimageelements
            d3.select(this).style('display', 'none');
          });

        // Addhoverlabel - useuniqueIDAvoidconflicts
        const iconTooltipId = `line-chart-icon-tooltip-${instanceId}`;
        // Removetooltip
        d3.select(`#${iconTooltipId}`).remove();
        const iconTooltip = d3
          .select(document.body)
          .append('div')
          .attr('id', iconTooltipId)
          .attr('class', 'chart-tooltip')
          .style('position', 'absolute')
          .style('visibility', 'hidden')
          .style('width', 'fit-content') // fit-content width
          .style('max-width', '90vw') // Cap width at viewport
          .style('background', 'rgba(17, 24, 39, 0.95)')
          .style('color', '#f9fafb')
          .style('padding', '8px 12px')
          .style('border-radius', '6px')
          .style('font-size', '12px')
          .style('font-family', 'system-ui, -apple-system, sans-serif')
          .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
          .style('pointer-events', 'none')
          .style('z-index', '1000');
        
        // Addhoverclickevent（mode）
        if (isMultiSeries) {
          iconGroup
            .style('cursor', 'pointer')
            .on('mouseover', function(event: MouseEvent) {
              // Icon hover：shadow
              iconBg
                .transition()
                .duration(200)
                .attr('r', 14)
                .attr('stroke-width', 2.5)
                .style('filter', 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15))');
              
              // platformshow：iOS -> IOS
              const displayPlatform = series.platform === 'iOS' ? 'IOS' : (series.platform || '');
              
              // Checkoverlap
              const overlapGroup = seriesToGroup.get(series.id);
              
              let tooltipContent = '';
              
              if (overlapGroup && overlapGroup.length > 1) {
                // overlap：showoverlapappplatform（Remove）
                const overlapSeries = overlapGroup
                  .map(id => allParsedSeries.find(s => s.id === id))
                  .filter(s => s !== undefined) as typeof allParsedSeries;
                
                tooltipContent = `
                  <div class="font-semibold text-gray-50 mb-2">${series.name}</div>
                  ${displayPlatform ? `<div class="text-gray-300 text-xs mb-2">Platform: ${displayPlatform}</div>` : ''}
                  <div class="text-gray-300 text-xs mb-1">Overlapping items (${overlapGroup.length}):</div>
                  <div class="space-y-1">
                    ${overlapSeries.map(s => {
                      const sPlatform = s.platform === 'iOS' ? 'IOS' : (s.platform || 'N/A');
                      return `<div class="text-xs text-gray-400">
                        ${s.name} ${sPlatform ? `(${sPlatform})` : ''}
                      </div>`;
                    }).join('')}
                  </div>
                  <div class="text-gray-300 text-xs mt-2 pt-2 border-t border-gray-600">Click to cycle through items</div>
                `;
              } else {
                // nooverlap：show
                tooltipContent = `
                  <div class="font-semibold text-gray-50">${series.name}</div>
                  ${displayPlatform ? `<div class="text-gray-300 text-xs mt-1">Platform: ${displayPlatform}</div>` : ''}
                  <div class="text-gray-300 text-xs mt-1">Click to highlight</div>
                `;
              }
              
              iconTooltip
                .style('visibility', 'visible')
                .style('background', 'rgba(17, 24, 39, 0.95)')
                .style('color', '#f9fafb')
                .style('padding', '8px 12px')
                .style('border-radius', '6px')
                .style('font-size', '12px')
                .style('font-family', 'system-ui, -apple-system, sans-serif')
                .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
                .html(tooltipContent);
            })
            .on('mousemove', function(event: MouseEvent) {
              iconTooltip
                .style('top', (event.pageY - 10) + 'px')
                .style('left', (event.pageX + 10) + 'px');
            })
            .on('mouseout', function() {
              // RestoreIcon
              iconBg
                .transition()
                .duration(200)
                .attr('r', 12)
                .attr('stroke-width', isHighlighted ? 2 : 1)
                .style('filter', null);
              
              iconTooltip.style('visibility', 'hidden');
            })
            .on('click', function(event) {
              // event
              event.stopPropagation();
              
              // Checkoverlap
              const overlapGroup = seriesToGroup.get(series.id);
              
              let newHighlightedId: string;
              
              // Checkoverlap（Ycoordinate，1）
              // Ifoverlap，noclickIcon，in order
              let isFullyOverlapped = false;
              if (overlapGroup && overlapGroup.length > 1) {
                // getcurrentYcoordinate
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const currentIconY = yScale(series.parsedData[0].value);
                // CheckoverlapYcoordinate
                const fullyOverlappedThreshold = 1; // 1threshold，overlap
                const allYPositions = overlapGroup.map(otherSeriesId => {
                  const otherSeries = allParsedSeries.find(s => s.id === otherSeriesId);
                  if (!otherSeries || otherSeries.parsedData.length === 0) return null;
                  return yScale(otherSeries.parsedData[0].value);
                }).filter(y => y !== null) as number[];
                
                // IfYcoordinate1in range，overlap
                if (allYPositions.length > 1) {
                  const minY = Math.min(...allYPositions);
                  const maxY = Math.max(...allYPositions);
                  isFullyOverlapped = (maxY - minY) < fullyOverlappedThreshold;
                }
              }
              
              if (isFullyOverlapped && overlapGroup && overlapGroup.length > 1) {
                // overlap：in order
                // getcurrenthighlightID
                const currentHighlightedId = highlightedSeriesIdRef.current;
                
                // currenthighlightposition
                const currentIndex = overlapGroup.indexOf(currentHighlightedId || '');
                
                // looptogglelogic
                let nextIndex: number;
                if (currentIndex >= 0) {
                  // currenthighlight
                  if (currentIndex < overlapGroup.length - 1) {
                    // not，toggle
                    nextIndex = currentIndex + 1;
                  } else {
                    // ，loop
                    nextIndex = 0;
                  }
                } else {
                  // currenthighlightnot，toggle
                  nextIndex = 0;
                }
                newHighlightedId = overlapGroup[nextIndex];
              } else {
                // notoverlapnotoverlap：toggle（）
                newHighlightedId = series.id;
              }
              
              // ensurenewHighlightedId
              const targetSeries = allParsedSeries.find(s => s.id === newHighlightedId);
              if (!targetSeries) {
                console.warn(`Series not found: ${newHighlightedId}`);
                return;
              }
              
              if (targetSeries) {
                // Updateref，ensure
                highlightedSeriesIdRef.current = newHighlightedId;
                // Updatestate，triggerstyleUpdate
                setHighlightedSeriesId(newHighlightedId);
                
                // Updatestyle，ensure
                // Update
                allParsedSeries.forEach(s => {
                  const isHighlighted = s.id === newHighlightedId;
                  const opacity = isHighlighted ? 1 : 0.3;
                  
                  // Updateline - useensureID
                  const path = g.selectAll('path').filter(function() {
                    const className = d3.select(this).attr('class') || '';
                    return className.includes('line') && className.includes(`line-${s.id}`);
                  });
                  if (!path.empty()) {
                    path.style('opacity', opacity);
                  }
                  
                  // Updatearea - useensureID
                  // highlight：show；highlight：hide（notSet）
                  const area = g.selectAll('path').filter(function() {
                    const className = d3.select(this).attr('class') || '';
                    return className.includes('area') && className.includes(`area-${s.id}`);
                  });
                  if (!area.empty()) {
                    if (isHighlighted) {
                      // highlight：show
                      area.style('opacity', 1).style('display', 'block');
                    } else {
                      // highlight：hide
                      area.style('display', 'none');
                    }
                  }
                  
                  // Updatedata points - useensureID
                  const dots = g.selectAll('circle').filter(function() {
                    const className = d3.select(this).attr('class') || '';
                    return className.includes('dot') && className.includes(`dot-${s.id}`);
                  });
                  if (!dots.empty()) {
                    if (isHighlighted) {
                      // highlight：show，interaction
                      dots
                        .attr('r', 4)
                        .style('opacity', 1)
                        .style('pointer-events', 'all')
                        .style('cursor', 'pointer');
                    } else {
                      // highlight：hide，interaction
                      dots
                        .attr('r', 0)
                        .style('opacity', 0)
                        .style('pointer-events', 'none');
                    }
                  }
                  
                  // Update
                  // useensureID
                  const iconGroup = g.selectAll('g').filter(function() {
                    const className = d3.select(this).attr('class') || '';
                    // ：class "icon-group" "icon-{s. id}"
                    return className.includes('icon-group') && className.includes(`icon-${s.id}`);
                  });
                  if (!iconGroup.empty()) {
                    iconGroup.style('opacity', opacity);
                    const iconBg = iconGroup.select('circle');
                    if (!iconBg.empty()) {
                      iconBg
                        .attr('stroke', isHighlighted ? '#000000' : '#e5e7eb')
                        .attr('stroke-width', isHighlighted ? 2 : 1);
                    }
                  }
                });
                
                // IconDOM，ensureshow
                // useensureID
                const selectedIconGroup = g.selectAll('g').filter(function() {
                  const className = d3.select(this).attr('class') || '';
                  // ：class "icon-group" "icon-{newHighlightedId}"
                  return className.includes('icon-group') && className.includes(`icon-${newHighlightedId}`);
                });
                if (!selectedIconGroup.empty() && selectedIconGroup.node()) {
                  const node = selectedIconGroup.node();
                  if (node && 'parentNode' in node && node.parentNode) {
                    node.parentNode.appendChild(node);
                  }
                }
              }
            });
        } else {
          // modeonlyshowtooltip
          iconGroup
            .style('cursor', 'pointer')
            .on('mouseover', function(event: MouseEvent) {
              // platformshow：iOS -> IOS
              const displayPlatform = series.platform === 'iOS' ? 'IOS' : (series.platform || '');
              const platformText = displayPlatform ? `<div class="text-gray-300 text-xs mt-1">Platform: ${displayPlatform}</div>` : '';
              iconTooltip
                .style('visibility', 'visible')
                .style('background', 'rgba(17, 24, 39, 0.95)')
                .style('color', '#f9fafb')
                .style('padding', '8px 12px')
                .style('border-radius', '6px')
                .style('font-size', '12px')
                .style('font-family', 'system-ui, -apple-system, sans-serif')
                .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
                .html(`<div class="font-semibold text-gray-50">${series.name}</div>${platformText}`);
            })
            .on('mousemove', function(event: MouseEvent) {
              iconTooltip
                .style('top', (event.pageY - 10) + 'px')
                .style('left', (event.pageX + 10) + 'px');
            })
            .on('mouseout', function() {
              iconTooltip.style('visibility', 'hidden');
            });
        }
      }
    });

    // Axes - data typeadaptiveformat
    // clearX，Avoidcreatetext
    const existingXAxis = g.select('.x-axis');
    if (!existingXAxis.empty()) {
      existingXAxis.remove();
    }
    
    let xAxisGenerator: d3.Axis<Date>;
    
    if (isHourlyData) {
      // data：show1-24
      const axisBottom = d3.axisBottom<Date>(xScale as d3.ScaleTime<number, number>);
      xAxisGenerator = axisBottom
        .tickFormat((d: Date) => {
          const hour = d.getHours();
          return (hour + 1).toString();
        })
        .ticks(24);
    } else {
      // datedata：show（ xPlotWidth uniqueDatesForTicks ）
      const uniqueDates = uniqueDatesForTicks;

      // computedata
      const dayCount = uniqueDates.length;
      
      if (dayCount > 8) {
        // 8：use1-31（1、2... ）
        // computedate
        const startDate = uniqueDates[0];
        startDate.setHours(0, 0, 0, 0);
        
        const axisBottom = d3.axisBottom<Date>(xScale as d3.ScaleTime<number, number>);
        xAxisGenerator = axisBottom
          .tickFormat((d: Date) => {
            // computecurrentdatedate
            const currentDate = new Date(d);
            currentDate.setHours(0, 0, 0, 0);
            const diffTime = currentDate.getTime() - startDate.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 11
            return diffDays.toString();
          })
          .tickValues(uniqueDates);
      } else {
        // <=8：usedate（"01/01"）
        const axisBottom = d3.axisBottom<Date>(xScale as d3.ScaleTime<number, number>);
        xAxisGenerator = axisBottom
          .tickFormat((d: Date) => {
            const format = d3.timeFormat('%m/%d');
            return format(d);
          })
          .tickValues(uniqueDates);
      }
    }
    
    // ensureXonlycreate
    const xAxis = g
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxisGenerator);

    // styleX - Tailwind minimal style，render
    xAxis.selectAll('text')
      .style('font-size', '12px')
      .style('font-weight', '400') // ，
      .style('fill', '#9ca3af') // gray-400
      .style('font-family', 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif') // Tailwind font-sans
      .style('font-smoothing', 'antialiased') // render
      .style('-webkit-font-smoothing', 'antialiased') // WebKit
      .style('-moz-osx-font-smoothing', 'grayscale') // Firefox
      .style('text-rendering', 'optimizeLegibility'); // textrender
    xAxis.selectAll('path, line').style('stroke', '#e5e7eb'); // gray-200

    // Y（hideYAxistruecreate，forzoom，hide）
    const yAxis = g
      .append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft<number>(yScale as d3.ScaleLinear<number, number>).tickFormat((d: number) => formatNumber(d)));

    // styleY - Tailwind minimal style
    yAxis.selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#9ca3af') // gray-400
      .style('font-family', 'system-ui, -apple-system, sans-serif');
    yAxis.selectAll('path, line').style('stroke', '#e5e7eb'); // gray-200

    // IfhideYAxistrue，hideY
    if (hideYAxis) {
      yAxis.style('display', 'none');
    }

    // Xcreate，ensureX
    // createdata points（mode），onlyshowhighlight
    // Whentogglehighlight，show/hide，notcreate
    
    // getXposition，for
    const tickLines = xAxis.selectAll('line').nodes() as SVGLineElement[];
    const tickPositions = new Map<number, number>(); // datexcoordinate
    
    // Xgetposition
    tickLines.forEach(tickLine => {
      const x1 = tickLine.getAttribute('x1');
      const x2 = tickLine.getAttribute('x2');
      if (x1 !== null && x2 !== null) {
        const x = parseFloat(x1); // x1x2（）
        // viaxcoordinatedate
        const date = xScale.invert(x);
        if (date instanceof Date && !isNaN(date.getTime())) {
          const timestamp = date.getTime();
          tickPositions.set(timestamp, x);
        }
      }
    });
    
    // create，ensureXDraw
    let dotsGroup = g.select<SVGGElement>('g.dots-group');
    if (dotsGroup.empty()) {
      dotsGroup = g.append<SVGGElement>('g').attr('class', 'dots-group');
    }
    // X，ensureX
    const xAxisNode = xAxis.node();
    const dotsGroupNode = dotsGroup.node();
    if (xAxisNode && xAxisNode.parentNode && dotsGroupNode) {
      const xAxisParent = xAxisNode.parentNode;
      // IfnotX，X
      if (xAxisParent && xAxisParent.contains(dotsGroupNode)) {
        xAxisParent.appendChild(dotsGroupNode);
      }
    }
    
    if (isMultiSeries) {
      allParsedSeries.forEach((series, seriesIndex) => {
        const seriesColor = series.color || '#000000';
        const isHighlighted = highlightedSeriesId === series.id;
        
        // Checkalready
        // useensureID
        const existingDots = dotsGroup.selectAll('circle').filter(function() {
          const className = d3.select(this).attr('class') || '';
          return className.includes('dot') && className.includes(`dot-${series.id}`);
        });
        
        if (existingDots.empty() || isDataChanged) {
          // Ifnotdata，createUpdate
          // Remove（Ifdata）
          if (isDataChanged) {
            existingDots.remove();
          }
          
          // getXposition，ensure
          // d3axiscreate，xcoordinatexScale(tickValue)
          // ensure，usexScalecomputeposition
          const dots = dotsGroup
            .selectAll(`circle.temp-dot-${series.id.replace(/[^a-zA-Z0-9]/g, '-')}`)
            .data(series.parsedData)
            .enter()
            .append('circle')
            .attr('class', `dot dot-${series.id}`)
            // X：preferuseposition，IfusexScalecompute
            .attr('cx', d => {
              const dateTime = d.date.getTime();
              // findposition
              let bestX = xScale(d.date);
              let minDiff = Infinity;
              
              tickPositions.forEach((tickX, tickTime) => {
                const diff = Math.abs(tickTime - dateTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  bestX = tickX;
                }
              });
              
              // Ifposition（1），useposition
              // otherwiseusexScalecomputeposition
              if (minDiff < 24 * 60 * 60 * 1000) { // 1
                return bestX;
              } else {
                return xScale(d.date);
              }
            })
            .attr('cy', d => yScale(d.value))
            .attr('r', isHighlighted ? 4 : 0)
            .attr('fill', seriesColor)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 2.5)
            .style('opacity', isHighlighted ? 1 : 0)
            .style('cursor', 'pointer')
            .style('pointer-events', isHighlighted ? 'all' : 'none')
            // interactionregion，ensureclick
            .style('stroke-width', 2.5)
            // Addhovertooltip（onlyhighlight）
            // Note：tooltipunifiedbind，onlyhandle
            .on('mouseover', function(event) {
              event.stopPropagation(); // eventoverlay
              if (isHighlighted) {
                d3.select(this)
                  .transition()
                  .duration(100) // animation
                  .attr('r', 5.5) // （45. 5）
                  .attr('stroke-width', 3) // increaseborder
                  .style('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))'); // shadow
              }
            })
            .on('mouseout', function(event) {
              event.stopPropagation(); // eventoverlay
              if (isHighlighted) {
                d3.select(this)
                  .transition()
                  .duration(100) // animation
                  .attr('r', 4) // Restoreraw
                  .attr('stroke-width', 2.5) // Restorerawborder
                  .style('filter', null); // Removeshadow
              }
            });

          // Addanimation：onlydataplay
          if (shouldPlayIntroAnimation && isHighlighted) {
            dots
              .transition()
              .delay((d: typeof series.parsedData[0], i: number) => seriesIndex * 70 + i * 35)
              .duration(320)
              .attr('r', 4)
              .style('opacity', 1);
          }
        } else {
          // Ifalreadydata，onlyUpdateshowstateposition（scales）
          type ParsedDataPoint = typeof series.parsedData[0];
          existingDots
            // X：preferuseposition，IfusexScalecompute
            .attr('cx', (d: unknown) => {
              const dataPoint = d as ParsedDataPoint;
              const dateTime = dataPoint.date.getTime();
              // findposition
              let bestX = xScale(dataPoint.date);
              let minDiff = Infinity;
              
              tickPositions.forEach((tickX, tickTime) => {
                const diff = Math.abs(tickTime - dateTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  bestX = tickX;
                }
              });
              
              // Ifposition（1），useposition
              // otherwiseusexScalecomputeposition
              if (minDiff < 24 * 60 * 60 * 1000) { // 1
                return bestX;
              } else {
                return xScale(dataPoint.date);
              }
            })
            .attr('cy', (d: unknown) => {
              const dataPoint = d as ParsedDataPoint;
              return yScale(dataPoint.value);
            })
            .attr('r', isHighlighted ? 4 : 0)
            .style('opacity', isHighlighted ? 1 : 0)
            .style('pointer-events', isHighlighted ? 'all' : 'none')
            .style('cursor', isHighlighted ? 'pointer' : 'default')
            // bindhover（ensureevent）
            // Note：tooltipunifiedbind，onlyhandle
            .on('mouseover', function(event) {
              event.stopPropagation(); // eventoverlay
              if (isHighlighted) {
                d3.select(this)
                  .transition()
                  .duration(100) // animation
                  .attr('r', 5.5) // （45. 5）
                  .attr('stroke-width', 3) // increaseborder
                  .style('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))'); // shadow
              }
            })
            .on('mouseout', function(event) {
              event.stopPropagation(); // eventoverlay
              if (isHighlighted) {
                d3.select(this)
                  .transition()
                  .duration(100) // animation
                  .attr('r', 4) // Restoreraw
                  .attr('stroke-width', 2.5) // Restorerawborder
                  .style('filter', null); // Removeshadow
              }
            });
        }
      });
    }

    // zoom，useadaptivezoom（vianice()domain）
    // enableZoomalreadyRemove，chartdata

    // Addtooltip - useuniqueIDAvoidconflicts
    if (showTooltip) {
      const tooltipId = `line-chart-tooltip-${instanceId}`;
      // Removetooltip
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
        .style('background', 'rgba(17, 24, 39, 0.95)')
        .style('color', '#f9fafb')
        .style('padding', '8px 12px')
        .style('border-radius', '6px')
        .style('font-size', '12px')
        .style('font-family', 'system-ui, -apple-system, sans-serif')
        .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
        .style('pointer-events', 'none')
        .style('z-index', '1000');

      // onlyhighlightAddtooltip（mode）
      allParsedSeries.forEach(series => {
        const isHighlighted = !isMultiSeries || highlightedSeriesId === series.id;
        
        // onlyhighlightAddtooltiphover
        if (isHighlighted) {
          // data pointsAddtooltiphover
          // useensureID
          // Note：dotsGroup
          const dotsGroup = g.select('g.dots-group');
          const dots = dotsGroup.selectAll('circle').filter(function() {
            const className = d3.select(this).attr('class') || '';
            return className.includes('dot') && className.includes(`dot-${series.id}`);
          });
          
          type ParsedDataPoint = typeof series.parsedData[0];
          dots
            .on('mouseover', function(event, d: unknown) {
              const dataPoint = d as ParsedDataPoint;
              // hover：shadow
              d3.select(this)
                .transition()
                .duration(100) // animation
                .attr('r', 5.5) // （45. 5）
                .attr('stroke-width', 3) // increaseborder
                .style('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))'); // shadow
              
              // showtooltip
              // onlyWhendata，showHour
              const isSeriesHourlyData = series.isHourlyData && isSingleDay;
              let dateText: string;
              let hourText: string | null = null;
              
              if (isSeriesHourlyData) {
                // data：showdate，show
                dateText = formatDate(dataPoint.date);
                const hour = dataPoint.date.getHours();
                hourText = `Hour ${hour + 1}`;
              } else {
                // datedata：onlyshowdate
                dateText = formatDate(dataPoint.date);
              }
              
              // platformshow：iOS -> IOS
              const displayPlatform = series.platform === 'iOS' ? 'IOS' : (series.platform || '');
              const platformText = displayPlatform ? `<div class="text-gray-300 text-xs">Platform: ${displayPlatform}</div>` : '';
              
              tooltip
                .style('visibility', 'visible')
                .style('background', 'rgba(17, 24, 39, 0.95)')
                .style('color', '#f9fafb')
                .style('padding', '8px 12px')
                .style('border-radius', '6px')
                .style('font-size', '12px')
                .style('font-family', 'system-ui, -apple-system, sans-serif')
                .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
                .html(`
                  <div class="space-y-1">
                    <div class="font-semibold text-gray-50">${series.name}</div>
                    ${platformText}
                    <div class="text-gray-300">${dateText}</div>
                    ${hourText ? `<div class="text-gray-300">${hourText}</div>` : ''}
                    <div class="text-gray-300">${valueLabel}: <span class="font-semibold">${formatNumber(dataPoint.value)}</span></div>
                  </div>
                `);
            })
            .on('mousemove', function(event) {
              tooltip
                .style('top', (event.pageY - 10) + 'px')
                .style('left', (event.pageX + 10) + 'px');
            })
            .on('mouseout', function() {
              // Restorehover
              d3.select(this)
                .transition()
                .duration(100) // animation
                .attr('r', 4) // Restoreraw
                .attr('stroke-width', 2.5) // Restorerawborder
                .style('filter', null); // Removeshadow
              
              // hidetooltip
              tooltip.style('visibility', 'hidden');
            })
            .style('cursor', 'pointer')
            .style('pointer-events', 'all');
        }
      });

      // createchart areainteraction（formodeIconUpdate）
      // Note：overlaycreate，ensurenotinteraction
      if (isMultiSeries) {
        const globalOverlay = g
          .append('rect')
          .attr('class', 'line-overlay-global')
          .attr('width', xPlotWidth)
          .attr('height', innerHeight)
          .style('fill', 'transparent')
          .style('pointer-events', 'all')
          .style('cursor', 'crosshair')
          // z-index，ensureevent
          .lower(); // overlay，ensure
        
        // createbisector
        type ParsedDataPoint = typeof allParsedSeries[0]['parsedData'][0];
        const bisectors = new Map<string, (array: ParsedDataPoint[], x: Date, lo?: number, hi?: number) => number>();
        allParsedSeries.forEach(series => {
          const bisector = d3.bisector<ParsedDataPoint, Date>((d: ParsedDataPoint) => d.date);
          bisectors.set(series.id, bisector.left);
        });
        
        globalOverlay
          .on('mousemove', function(event) {
            // Checkmouse，Ifnothandleoverlayevent
            const [mouseX, mouseY] = d3.pointer(event, g.node() as Element);
            
            // Checkclick（4-5. 5，stroke，6-7）
            const dotRadius = 7; // interaction
            let isOverDot = false;
            
            // Checkhighlight
            const currentHighlightedId = highlightedSeriesIdRef.current;
            const highlightedSeries = allParsedSeries.find(s => s.id === currentHighlightedId);
            
            if (highlightedSeries) {
              highlightedSeries.parsedData.forEach(d => {
                const dotX = xScale(d.date);
                const dotY = yScale(d.value);
                const distance = Math.sqrt(Math.pow(mouseX - dotX, 2) + Math.pow(mouseY - dotY, 2));
                if (distance < dotRadius) {
                  isOverDot = true;
                }
              });
            }
            
            // Ifmouse，nothandleoverlayevent，handle
            if (isOverDot) {
              return;
            }
            
            const mouseDate = xScale.invert(mouseX);
            
            // userefgethighlightID，ensuretooltipshowcurrentlinedata
            if (highlightedSeries) {
              const bisectDate = bisectors.get(highlightedSeries.id);
              if (!bisectDate) return;
              const index = bisectDate(highlightedSeries.parsedData, mouseDate, 1);
              const a = highlightedSeries.parsedData[index - 1];
              const b = highlightedSeries.parsedData[index];
              if (a && b) {
                const nearestPoint = mouseDate.getTime() - a.date.getTime() > b.date.getTime() - mouseDate.getTime() ? b : a;
                
                // showtooltip：data，showdate，show
                // onlyWhendata，showHour
                const isSeriesHourlyData = highlightedSeries.isHourlyData && isSingleDay;
                let dateText: string;
                let hourText: string | null = null;
                
                if (isSeriesHourlyData) {
                  // data：showdate，show
                  dateText = formatDate(nearestPoint.date);
                  const hour = nearestPoint.date.getHours();
                  hourText = `Hour ${hour + 1}`;
                } else {
                  // datedata：onlyshowdate
                  dateText = formatDate(nearestPoint.date);
                }
                
                // platformshow：iOS -> IOS
                const displayPlatform = highlightedSeries.platform === 'iOS' ? 'IOS' : (highlightedSeries.platform || '');
                const platformText = displayPlatform ? `<div class="text-gray-300 text-xs">Platform: ${displayPlatform}</div>` : '';
                
                tooltip
                  .style('visibility', 'visible')
                  .style('background', 'rgba(17, 24, 39, 0.95)')
                  .style('color', '#f9fafb')
                  .style('padding', '8px 12px')
                  .style('border-radius', '6px')
                  .style('font-size', '12px')
                  .style('font-family', 'system-ui, -apple-system, sans-serif')
                  .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
                  .html(`
                    <div class="space-y-1">
                      <div class="font-semibold text-gray-50">${highlightedSeries.name}</div>
                      ${platformText}
                      <div class="text-gray-300">${dateText}</div>
                      ${hourText ? `<div class="text-gray-300">${hourText}</div>` : ''}
                      <div class="text-gray-300">${valueLabel}: <span class="font-semibold">${formatNumber(nearestPoint.value)}</span></div>
                    </div>
                  `)
                  .style('top', (event.pageY - 10) + 'px')
                  .style('left', (event.pageX + 10) + 'px');
              }
            }
          })
          .on('mouseout', function() {
            tooltip.style('visibility', 'hidden');
          });
      } else {
        // mode：highlightAddoverlay
        allParsedSeries.forEach(series => {
          const isHighlighted = !isMultiSeries || highlightedSeriesId === series.id;
          if (isHighlighted) {
            const bisectDate = d3.bisector((d: typeof series.parsedData[0]) => d.date).left;
            
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const overlay = g
              .append('rect')
              .attr('class', `line-overlay-${series.id}`)
              .attr('width', xPlotWidth)
              .attr('height', innerHeight)
              .style('fill', 'transparent')
              .style('pointer-events', 'all')
              .style('cursor', 'crosshair')
              .on('mousemove', function(event) {
                const [mouseX] = d3.pointer(event, g.node() as Element);
                const mouseDate = xScale.invert(mouseX);
                
                const index = bisectDate(series.parsedData, mouseDate, 1);
                const a = series.parsedData[index - 1];
                const b = series.parsedData[index];
                if (!a || !b) return;
                
                const nearestPoint = mouseDate.getTime() - a.date.getTime() > b.date.getTime() - mouseDate.getTime() ? b : a;
                
                // showtooltip：data，showdate，show
                // onlyWhendata，showHour
                const isSeriesHourlyData = series.isHourlyData && isSingleDay;
                let dateText: string;
                let hourText: string | null = null;
                
                if (isSeriesHourlyData) {
                  // data：showdate，show
                  dateText = formatDate(nearestPoint.date);
                  const hour = nearestPoint.date.getHours();
                  hourText = `Hour ${hour + 1}`;
                } else {
                  // datedata：onlyshowdate
                  dateText = formatDate(nearestPoint.date);
                }
                
                // platformshow：iOS -> IOS
                const displayPlatform = series.platform === 'iOS' ? 'IOS' : (series.platform || '');
                const platformText = displayPlatform ? `<div class="text-gray-300 text-xs">Platform: ${displayPlatform}</div>` : '';
                
                tooltip
                  .style('visibility', 'visible')
                  .style('background', 'rgba(17, 24, 39, 0.95)')
                  .style('color', '#f9fafb')
                  .style('padding', '8px 12px')
                  .style('border-radius', '6px')
                  .style('font-size', '12px')
                  .style('font-family', 'system-ui, -apple-system, sans-serif')
                  .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
                  .html(`
                    <div class="space-y-1">
                      <div class="font-semibold text-gray-50">${series.name}</div>
                      ${platformText}
                      <div class="text-gray-300">${dateText}</div>
                      ${hourText ? `<div class="text-gray-300">${hourText}</div>` : ''}
                      <div class="text-gray-300">${valueLabel}: <span class="font-semibold">${formatNumber(nearestPoint.value)}</span></div>
                    </div>
                  `)
                  .style('top', (event.pageY - 10) + 'px')
                  .style('left', (event.pageX + 10) + 'px');
              })
              .on('mouseout', function() {
                tooltip.style('visibility', 'hidden');
              });
          }
        });
      }

    }

    // WhenhighlightedSeriesId，IconDOM（ensureshow）
    if (isMultiSeries && highlightedSeriesId) {
      // useensureID
      const selectedIconGroup = g.selectAll('g').filter(function() {
        const className = d3.select(this).attr('class') || '';
        // ：class "icon-group" "icon-{highlightedSeriesId}"
        return className.includes('icon-group') && className.includes(`icon-${highlightedSeriesId}`);
      });
      if (!selectedIconGroup.empty() && selectedIconGroup.node()) {
        const node = selectedIconGroup.node();
        if (node && 'parentNode' in node && node.parentNode) {
          node.parentNode.appendChild(node);
        }
      }
    }

    // Cleanup - onlyclearcurrenttooltip，Avoidchart
    return () => {
      d3.select(`#line-chart-tooltip-${instanceId}`).remove();
      d3.select(`#line-chart-icon-tooltip-${instanceId}`).remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, series, dimensions, color, showGrid, showTooltip, enableZoom, enableAnimation, xField, yField, hideYAxis, showArea, useStraightLine, areaGradientColor, valueLabel, isMultiSeries, seriesData, instanceId, svgWidth, fitContainerWidth, innerWidth]); // Remove highlightedSeriesId，Avoidstatere-renderchart

  // useEffect：ensureXstyleapp，clearX（initial loadstyle）
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select('g');
    if (g.empty()) return;

    // CheckX，Ifonlykeep
    const xAxes = g.selectAll('.x-axis');
    const xAxisCount = xAxes.size();
    if (xAxisCount > 1) {
      // keep，
      xAxes.nodes().forEach((node, index) => {
        if (index < xAxisCount - 1) {
          d3.select(node).remove();
        }
      });
    }

    // UpdateXtextstyle，ensurerender（userequestAnimationFrameensureDOMUpdate）
    requestAnimationFrame(() => {
      const xAxis = g.select('.x-axis');
      if (!xAxis.empty()) {
        xAxis.selectAll('text')
          .style('font-size', '12px')
          .style('font-weight', '400') // ，
          .style('fill', '#9ca3af') // gray-400
          .style('font-family', 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif') // Tailwind font-sans
          .style('font-smoothing', 'antialiased') // render
          .style('-webkit-font-smoothing', 'antialiased') // WebKit
          .style('-moz-osx-font-smoothing', 'grayscale') // Firefox
          .style('text-rendering', 'optimizeLegibility'); // textrender
      }
    });
  }, [seriesData, data, dimensions, svgWidth, innerWidth, fitContainerWidth]); // listen fordatadimensions，ensurestyleapp

  // useEffect：onlylisten forstate，Updatestyle（nottriggeranimation）
  useEffect(() => {
    if (!svgRef.current || !isMultiSeries || !seriesData || seriesData.length === 0) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select('g'); // container

    if (g.empty()) return;
    
    // computeisSingleDay：data
    const allDates: Date[] = [];
    seriesData.forEach(series => {
      if (series.data && series.data.length > 0) {
        series.data.forEach(d => {
          if (d && typeof d === 'object' && 'date' in d && d.date) {
            const dateValue = d.date as unknown;
            let date: Date | null = null;
            if (dateValue instanceof Date) {
              date = dateValue;
            } else if (typeof dateValue === 'string' || typeof dateValue === 'number') {
              date = new Date(dateValue);
            }
            if (date && !isNaN(date.getTime())) {
              allDates.push(date);
            }
          }
        });
      }
    });
    
    // computeisSingleDay：data
    // ensureisSingleDay，data
    const isSingleDay = allDates.length > 0 ? (() => {
      const dateExtent = d3.extent(allDates) as [Date, Date];
      if (!dateExtent[0] || !dateExtent[1]) return false;
      return dateExtent[0].getFullYear() === dateExtent[1].getFullYear() &&
        dateExtent[0].getMonth() === dateExtent[1].getMonth() &&
        dateExtent[0].getDate() === dateExtent[1].getDate();
    })() : false;
    
    // Checkdata
    const firstDataPoint = seriesData[0]?.data?.[0];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const isHourlyData = firstDataPoint && typeof firstDataPoint === 'object' && 'date' in firstDataPoint && firstDataPoint.date && 
      (() => {
        try {
          const dateValue = firstDataPoint.date as unknown;
          let date: Date | null = null;
          if (dateValue instanceof Date) {
            date = dateValue;
          } else if (typeof dateValue === 'string' || typeof dateValue === 'number') {
            date = new Date(dateValue);
          }
          return date !== null && !isNaN(date.getTime()) && date.getHours !== undefined;
        } catch {
          return false;
        }
      })();

    // Update：highlight，
    seriesData.forEach((series, seriesIndex) => {
      const isHighlighted = highlightedSeriesId === series.id;
      const opacity = isHighlighted ? 1 : 0.3;

      // Updateline - useensureID
      const path = g.selectAll('path').filter(function() {
        const className = d3.select(this).attr('class') || '';
        return className.includes('line') && className.includes(`line-${series.id}`);
      });
      if (!path.empty()) {
        path.style('opacity', opacity);
      }

      // Updatearea - useensureID
      // highlight：show；highlight：hide（notSet）
      const area = g.selectAll('path').filter(function() {
        const className = d3.select(this).attr('class') || '';
        return className.includes('area') && className.includes(`area-${series.id}`);
      });
      if (!area.empty()) {
        if (isHighlighted) {
          // highlight：show
          area.style('opacity', 1).style('display', 'block');
        } else {
          // highlight：hide
          area.style('display', 'none');
        }
      }

      // Updatedata points：highlightshow，highlighthide
      // useensureID
      // Note：dotsGroup
      const dotsGroup = g.select('g.dots-group');
      const dots = dotsGroup.selectAll('circle').filter(function() {
        const className = d3.select(this).attr('class') || '';
        return className.includes('dot') && className.includes(`dot-${series.id}`);
      });
      if (!dots.empty()) {
        if (isHighlighted) {
          // highlight：show，interaction，bindhover
          // Removeeventlisten for
          dots.on('mouseover', null).on('mouseout', null);
          
          // getcreatetooltip
          const tooltipId = `line-chart-tooltip-${instanceId}`;
          let tooltip = d3.select(`#${tooltipId}`) as unknown as d3.Selection<HTMLDivElement, unknown, HTMLElement, any>;
          if (tooltip.empty()) {
            tooltip = d3
              .select(document.body)
              .append<HTMLDivElement>('div')
              .attr('id', tooltipId)
              .attr('class', 'chart-tooltip')
              .style('position', 'absolute')
              .style('visibility', 'hidden')
              .style('width', 'fit-content') // fit-content width
              .style('max-width', '90vw') // Cap width at viewport
              .style('background', 'rgba(17, 24, 39, 0.95)')
              .style('color', '#f9fafb')
              .style('padding', '8px 12px')
              .style('border-radius', '6px')
              .style('font-size', '12px')
              .style('font-family', 'system-ui, -apple-system, sans-serif')
              .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
              .style('pointer-events', 'none')
              .style('z-index', '1000') as unknown as d3.Selection<HTMLDivElement, unknown, HTMLElement, any>;
          }
          
          // bindhovertooltip
          // use series. data ， useEffect allParsedSeries
          type ParsedDataPoint = {
            date: Date;
            value: number;
            [key: string]: any;
          };
          dots
            .attr('r', 4)
            .style('opacity', 1)
            .style('pointer-events', 'all')
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d: unknown) {
              const dataPoint = d as ParsedDataPoint;
              // hover：shadow
              d3.select(this)
                .transition()
                .duration(100) // animation
                .attr('r', 5.5) // （45. 5）
                .attr('stroke-width', 3) // increaseborder
                .style('filter', 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))'); // shadow
              
              // showtooltip
              if (dataPoint && 'date' in dataPoint && 'value' in dataPoint) {
                // showtooltip：data，showdate，show
                // onlyWhendata，showHour
                // Checkdata：Checkdata pointsdate（、not0）
                // orCheckdatanot
                let isSeriesHourlyData = false;
                if (dataPoint.date instanceof Date) {
                  // Checkcurrentdata points、、
                  const currentHour = dataPoint.date.getHours();
                  const currentMinute = dataPoint.date.getMinutes();
                  const currentSecond = dataPoint.date.getSeconds();
                  
                  // Ifcurrentdata points（not000），data
                  if (currentHour !== 0 || currentMinute !== 0 || currentSecond !== 0) {
                    isSeriesHourlyData = true;
                  } else {
                    // Checkdatadata points
                    const hasTimeInfo = series.data && series.data.length > 0 && 
                      series.data.some((item: any) => {
                        if (!item.date) return false;
                        const itemDate = new Date(item.date);
                        return itemDate.getHours() !== 0 || itemDate.getMinutes() !== 0 || itemDate.getSeconds() !== 0;
                      });
                    isSeriesHourlyData = hasTimeInfo || false;
                  }
                }
                
                // onlyWhendata，showHour
                isSeriesHourlyData = isSeriesHourlyData && isSingleDay;
                
                let dateText: string;
                let hourText: string | null = null;
                
                if (isSeriesHourlyData && dataPoint.date instanceof Date) {
                  // data：showdate，show
                  dateText = formatDate(dataPoint.date);
                  const hour = dataPoint.date.getHours();
                  hourText = `Hour ${hour + 1}`;
                } else if (dataPoint.date instanceof Date) {
                  // datedata：onlyshowdate
                  dateText = formatDate(dataPoint.date);
                } else {
                  dateText = String(dataPoint.date);
                }
                
                // platformshow：iOS -> IOS
                const displayPlatform = series.platform === 'iOS' ? 'IOS' : (series.platform || '');
                const platformText = displayPlatform ? `<div class="text-gray-300 text-xs">Platform: ${displayPlatform}</div>` : '';
                
                tooltip
                  .style('visibility', 'visible')
                  .html(`
                    <div class="space-y-1">
                      <div class="font-semibold text-gray-50">${series.name}</div>
                      ${platformText}
                      <div class="text-gray-300">${dateText}</div>
                      ${hourText ? `<div class="text-gray-300">${hourText}</div>` : ''}
                      <div class="text-gray-300">${valueLabel}: <span class="font-semibold">${formatNumber(dataPoint.value)}</span></div>
                    </div>
                  `);
              }
            })
            .on('mousemove', function(event) {
              tooltip
                .style('top', (event.pageY - 10) + 'px')
                .style('left', (event.pageX + 10) + 'px');
            })
            .on('mouseout', function() {
              // Restorehover
              d3.select(this)
                .transition()
                .duration(100) // animation
                .attr('r', 4) // Restoreraw
                .attr('stroke-width', 2.5) // Restorerawborder
                .style('filter', null); // Removeshadow
              
              // hidetooltip
              tooltip.style('visibility', 'hidden');
            });
        } else {
          // highlight：hide，interaction
          dots
            .attr('r', 0)
            .style('opacity', 0)
            .style('pointer-events', 'none')
            .on('mouseover', null)
            .on('mouseout', null)
            .on('mousemove', null);
        }
      }

      // Update
      // useensureID
      const iconGroup = g.selectAll('g').filter(function() {
        const className = d3.select(this).attr('class') || '';
        // ：class "icon-group" "icon-{series. id}"
        return className.includes('icon-group') && className.includes(`icon-${series.id}`);
      });
      if (!iconGroup.empty()) {
        iconGroup.style('opacity', opacity);
        const iconBg = iconGroup.select('circle');
        if (!iconBg.empty()) {
          iconBg
            .attr('stroke', isHighlighted ? '#000000' : '#e5e7eb')
            .attr('stroke-width', isHighlighted ? 2 : 1);
        }
      }
    });
  }, [highlightedSeriesId, isMultiSeries, seriesData, instanceId, valueLabel]);

  return (
    <div
      ref={fitContainerWidth ? containerRef : undefined}
      className={`line-chart ${className}`}
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
