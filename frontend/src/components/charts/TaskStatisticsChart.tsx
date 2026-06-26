"use client"

import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import { Bar, XAxis, YAxis, CartesianGrid, ComposedChart, Rectangle } from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import * as d3 from 'd3';
import './TaskStatisticsChart.css';

interface TaskStatisticsChartProps {
  tasks: Array<{
    status: 'running' | 'paused' | 'completed' | 'warning' | 'failed';
    createTime: string;
    latestUpdateTime: string;
    dataPointer?: 'Daily Execution' | 'Single Execution';
    accountId?: string; // Account ID
    apps?: Array<{ app_id: string; app_name: string }>; // App
    type?: 'install_pb' | 'event_pb' | 'install_rtpb' | 'event_rtpb'; // task
  }>;
  timeRange?: 1 | 3 | 7 | 15 | 30;
  dataTag?: 'TASK' | 'ACCOUNT' | 'TYPE';
  chartMode?: 'STACKED' | 'DIVERT';
  accountConfigs?: Array<{ id: string; account_name: string }>; // Accountconfig，forgetaccount
}

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  // TASKdimension
  running?: number;
  paused?: number;
  completed?: number;
  warning?: number;
  failed?: number;
  total?: number;
  // ACCOUNTdimension
  [accountId: string]: string | number | undefined; // account，accounttaskcount
  totalTasks?: number; // taskcount
  totalApps?: number; // dedupeapptotal
  // TYPEdimension
  install_pb?: number; // install_pbtaskcount
  event_pb?: number; // event_pbtaskcount
  install_rtpb?: number; // install_rtpbtaskcount
  event_rtpb?: number; // event_rtpbtaskcount
  typeTotal?: number; // TYPEdimensiontaskcount
  avgTypeGrowthRate?: number; // taskday-over-day growth rate（%）
  growthRate?: number; // day-over-day growth rate（%）
}

type TimeRangeOption = 1 | 3 | 7 | 15 | 30;

// chartconfig - component，Avoideach timerendercreate
const chartConfig = {
  running: {
    label: 'Running',
    color: '#6b46c1', // purple
  },
  paused: {
    label: 'Paused',
    color: '#dc2626', // red
  },
  completed: {
    label: 'Completed',
    color: '#16a34a', // green
  },
  warning: {
    label: 'Warning',
    color: '#f59e0b', // orange
  },
  failed: {
    label: 'Failed',
    color: '#ea580c', // red
  },
  rate: {
    label: 'Rate',
    color: '#000000', // black
  },
  install_pb: {
    label: 'Install PB',
    color: '#3b82f6', // blue
  },
  event_pb: {
    label: 'Event PB',
    color: '#10b981', // green
  },
  install_rtpb: {
    label: 'Install RTPB',
    color: '#f59e0b', // orange
  },
  event_rtpb: {
    label: 'Event RTPB',
    color: '#ef4444', // red
  },
} satisfies ChartConfig;

// time range - component
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const timeRangeOptions: { value: TimeRangeOption; label: string }[] = [
  { value: 1, label: '1D' },
  { value: 3, label: '3D' },
  { value: 7, label: '7D' },
  { value: 15, label: '15D' },
  { value: 30, label: '30D' },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type DataTagOption = 'TASK' | 'ACCOUNT' | 'APP';

const TaskStatisticsChart: React.FC<TaskStatisticsChartProps> = (props) => {
  const { 
    tasks, 
    timeRange: externalTimeRange = 7, 
    dataTag: externalDataTag = 'TASK',
    chartMode: externalChartMode = 'STACKED',
    accountConfigs = []
  } = props;
  // use timeRange dataTag，Ifusedefault
  const timeRange = externalTimeRange;
  const dataTag = externalDataTag;
  const chartMode = externalChartMode;
  const svgRef = useRef<SVGSVGElement>(null);
  const previousDataRef = useRef<string>(''); // fordata
  const isInitialRenderRef = useRef<boolean>(true); // first render
  const tooltipRef = useRef<d3.Selection<HTMLDivElement, unknown, HTMLElement, any> | null>(null); // tooltiprefs

  // computechartdata - cumulative state count（onlyWhendataTag'TASK'）
  const chartData = useMemo((): ChartDataPoint[] => {
    const today = new Date();
    const dataMap = new Map<string, ChartDataPoint>();

    // InitializeNdata
    const dateKeys: string[] = [];
    for (let i = timeRange - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dateKeys.push(dateKey);
      
      // formatdatelabel
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let dateLabel = '';
      
      if (timeRange === 1) {
        dateLabel = `${date.getDate()}\n${dayNames[date.getDay()]}`;
      } else if (timeRange === 3) {
        dateLabel = `${monthNames[date.getMonth()]} ${date.getDate()}\n${dayNames[date.getDay()]}`;
      } else if (timeRange === 7) {
        dateLabel = `${monthNames[date.getMonth()]} ${date.getDate()}`;
      } else if (timeRange === 15) {
        // 15：showmonthdate，5show
        dateLabel = `${monthNames[date.getMonth()]} ${date.getDate()}`;
      } else {
        // 30：showmonthdate，10show
        dateLabel = `${monthNames[date.getMonth()]} ${date.getDate()}`;
      }
      
      // dataTagInitializenotdata
      if (dataTag === 'TASK') {
        dataMap.set(dateKey, {
          date: dateKey,
          dateLabel,
          running: 0,
          paused: 0,
          completed: 0,
          warning: 0,
          failed: 0,
          total: 0,
          growthRate: 0, // day-over-day growth rate
        });
      } else if (dataTag === 'ACCOUNT') {
        // ACCOUNTdimension：Initializeaccount
        const entry: ChartDataPoint = {
          date: dateKey,
          dateLabel,
          totalTasks: 0, // taskcount
          totalApps: 0, // dedupeapptotal
        };
        dataMap.set(dateKey, entry);
      } else {
        // APPdimension（logic）
      dataMap.set(dateKey, {
        date: dateKey,
        dateLabel,
        running: 0,
        paused: 0,
        completed: 0,
        warning: 0,
        failed: 0,
        total: 0,
          growthRate: 0,
        });
      }
    }

    // IfTASKdimension，usecumulative state count
    if (dataTag === 'TASK') {
      // date，datecreatetaskdatestate（cumulative count）
      dateKeys.forEach((dateKey) => {
        tasks.forEach((task) => {
          const createDate = new Date(task.createTime);
          const updateDate = new Date(task.latestUpdateTime);
          const createDateKey = createDate.toISOString().split('T')[0];
          const updateDateKey = updateDate.toISOString().split('T')[0];
          
          // onlydateWhencreatetask（cumulative count）
          if (createDateKey <= dateKey) {
            const entry = dataMap.get(dateKey);
            if (entry) {
              // cumulative state countlogic：
              // 1. IftaskUpdate <= currentdate，usecurrentstate（statealreadydate）
              // 2. IftaskUpdate > currentdate，state
              // ，taskdatestate
              // state，taskcreatestate，Update
              
              if (updateDateKey <= dateKey) {
                // taskUpdatecurrentdate，usecurrentstate
                const statusKey = task.status as keyof ChartDataPoint;
                if (typeof entry[statusKey] === 'number') {
                  entry[statusKey] = (entry[statusKey] as number) + 1;
                }
                if (entry.total !== undefined) {
                  entry.total = (entry.total || 0) + 1;
                }
              } else {
                // taskUpdatecurrentdate，state
                // cumulative count，taskdatestate
                // state，task：
                // - Daily Executiontask：runningstate，state
                // - Single Executiontask：completedstate，state
                
                const isDaily = task.dataPointer === 'Daily Execution';
                const inferredStatus = isDaily ? 'running' : 'completed';
                const statusKey = inferredStatus as keyof ChartDataPoint;
                
                // Ifcurrentstatewarning/failed，Update，datestate
                // Ifcurrentstaterunning/paused/completed，Update，datestate
                if (typeof entry[statusKey] === 'number') {
                  entry[statusKey] = (entry[statusKey] as number) + 1;
                }
                if (entry.total !== undefined) {
                  entry.total = (entry.total || 0) + 1;
                }
              }
            }
          }
        });
      });
    } else if (dataTag === 'ACCOUNT') {
      // ACCOUNTdimension：accountdatacountappcount
      // getuniqueaccount ID
      const accountIds = new Set<string>();
      tasks.forEach((task) => {
        if (task.accountId) {
          accountIds.add(task.accountId);
        }
      });

      // dateInitializeaccount
      dateKeys.forEach((dateKey) => {
        const entry = dataMap.get(dateKey);
        if (entry) {
          accountIds.forEach((accountId) => {
            entry[accountId] = 0; // Initializeaccountdatacount
          });
        }
      });

      // date，datecreatetaskdatedata（cumulative count）
      dateKeys.forEach((dateKey) => {
        // foraccountdatetaskcount
        const accountTasksMap = new Map<string, number>(); // accountId -> taskcount
        // fordateapp_id（dedupe）
        const allAppsSet = new Set<string>();
        
        tasks.forEach((task) => {
          if (!task.accountId) return;
          
          const createDate = new Date(task.createTime);
          const updateDate = new Date(task.latestUpdateTime);
          const createDateKey = createDate.toISOString().split('T')[0];
          const updateDateKey = updateDate.toISOString().split('T')[0];
          
          // onlydateWhencreatetask（cumulative count）
          if (createDateKey <= dateKey) {
            // taskdatestate
            let isActive = false;
            if (updateDateKey <= dateKey) {
              // taskUpdatecurrentdate，usecurrentstate
              isActive = task.status === 'running' || task.status === 'completed';
            } else {
              // taskUpdatecurrentdate，state
              const isDaily = task.dataPointer === 'Daily Execution';
              isActive = isDaily; // Dailytaskrunningstate
            }
            
            if (isActive) {
              // taskcount
              const currentTasks = accountTasksMap.get(task.accountId) || 0;
              accountTasksMap.set(task.accountId, currentTasks + 1);
              
              // appcount（dedupe，accountapp_idmergededupe）
              if (task.apps && task.apps.length > 0) {
                task.apps.forEach((app) => {
                  if (app.app_id) {
                    allAppsSet.add(app.app_id);
                  }
                });
              }
            }
          }
        });
        
        // dataentry
        const entry = dataMap.get(dateKey);
        if (entry) {
          let totalTasks = 0;
          
          accountTasksMap.forEach((tasks, accountId) => {
            entry[accountId] = tasks;
            totalTasks += tasks;
          });
          
          entry.totalTasks = totalTasks;
          entry.totalApps = allAppsSet.size; // dedupeappcount
        }
      });
    } else if (dataTag === 'TYPE') {
      // TYPEdimension：datetaskcount（cumulative count）
      dateKeys.forEach((dateKey) => {
        tasks.forEach((task) => {
          if (!task.type) return;
          
          const createDate = new Date(task.createTime);
          const updateDate = new Date(task.latestUpdateTime);
          const createDateKey = createDate.toISOString().split('T')[0];
          const updateDateKey = updateDate.toISOString().split('T')[0];
          
          // onlydateWhencreatetask（cumulative count）
          if (createDateKey <= dateKey) {
            // taskdatestate
            let isActive = false;
            if (updateDateKey <= dateKey) {
              // taskUpdatecurrentdate，usecurrentstate
              isActive = task.status === 'running' || task.status === 'completed';
            } else {
              // taskUpdatecurrentdate，state
              const isDaily = task.dataPointer === 'Daily Execution';
              isActive = isDaily; // Dailytaskrunningstate
            }
            
            if (isActive) {
              const entry = dataMap.get(dateKey);
              if (entry) {
                // taskcount
                entry[task.type] = (entry[task.type] || 0) + 1;
                entry.typeTotal = (entry.typeTotal || 0) + 1;
              }
            }
          }
        });
      });
    } else {
      // dimension：logic（createdate）
    tasks.forEach((task) => {
      const createDate = new Date(task.createTime).toISOString().split('T')[0];
      const entry = dataMap.get(createDate);
      if (entry) {
        const statusKey = task.status as keyof ChartDataPoint;
        if (typeof entry[statusKey] === 'number') {
          entry[statusKey] = (entry[statusKey] as number) + 1;
        }
        if (entry.total !== undefined) {
          entry.total = (entry.total || 0) + 1;
        }
      }
    });
    }

    // Computeday-over-day growth rate
    const sortedEntries = Array.from(dataMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    sortedEntries.forEach((entry, index) => {
      if (dataTag === 'TASK') {
        // TASKdimension：computetotaltaskcountday-over-day growth rate
        if (index > 0) {
          const previousEntry = sortedEntries[index - 1];
          const currentTotal = entry.total || 0;
          const previousTotal = previousEntry.total || 0;
          
          if (previousTotal > 0) {
            entry.growthRate = ((currentTotal - previousTotal) / previousTotal) * 100;
          } else if (currentTotal > 0) {
            entry.growthRate = 100;
          } else {
            entry.growthRate = 0;
          }
        } else {
          entry.growthRate = 0;
        }
      } else if (dataTag === 'ACCOUNT') {
        // ACCOUNTdimension：notcomputeday-over-day growth rate（line chartonlyshowappcount）
        // ，orSet0
      } else if (dataTag === 'TYPE') {
        // TYPEdimension：computetaskday-over-day growth rate
        if (index > 0) {
          const previousEntry = sortedEntries[index - 1];
          const types: Array<'install_pb' | 'event_pb' | 'install_rtpb' | 'event_rtpb'> = ['install_pb', 'event_pb', 'install_rtpb', 'event_rtpb'];
          const growthRates: number[] = [];
          
          types.forEach((type) => {
            const currentCount = entry[type] || 0;
            const previousCount = previousEntry[type] || 0;
            
            if (previousCount > 0) {
              const growthRate = ((currentCount - previousCount) / previousCount) * 100;
              growthRates.push(growthRate);
            } else if (currentCount > 0) {
              growthRates.push(100); // 0data，100%
            } else {
              growthRates.push(0); // 0，0
            }
          });
          
          // compute
          if (growthRates.length > 0) {
            const sum = growthRates.reduce((a, b) => a + b, 0);
            entry.avgTypeGrowthRate = sum / growthRates.length;
          } else {
            entry.avgTypeGrowthRate = 0;
          }
        } else {
          entry.avgTypeGrowthRate = 0;
        }
      } else {
        // dimension：logic
        if (index > 0) {
          const previousEntry = sortedEntries[index - 1];
          const currentTotal = entry.total || 0;
          const previousTotal = previousEntry.total || 0;
          
          if (previousTotal > 0) {
            entry.growthRate = ((currentTotal - previousTotal) / previousTotal) * 100;
          } else if (currentTotal > 0) {
            entry.growthRate = 100;
          } else {
            entry.growthRate = 0;
          }
        } else {
          entry.growthRate = 0;
        }
      }
    });

    return sortedEntries;
  }, [tasks, timeRange, dataTag]);

  // getaccount ID（forACCOUNTdimension）
  const accountIds = useMemo(() => {
    if (dataTag !== 'ACCOUNT') return [];
    const ids = new Set<string>();
    tasks.forEach((task) => {
      if (task.accountId) {
        ids.add(task.accountId);
      }
    });
    return Array.from(ids).sort();
  }, [tasks, dataTag]);

  // accountcolor（accountnotcolor）
  const accountColors = useMemo(() => {
    const colors = [
      '#3b82f6', // blue
      '#10b981', // green
      '#f59e0b', // orange
      '#ef4444', // red
      '#8b5cf6', // purple
      '#06b6d4', // cyan
      '#f97316', // red
      '#84cc16', // green
      '#ec4899', // pink
      '#6366f1', // blue
    ];
    const colorMap: Record<string, string> = {};
    accountIds.forEach((accountId, index) => {
      colorMap[accountId] = colors[index % colors.length];
    });
    return colorMap;
  }, [accountIds]);

  // format X label - use useCallback optimize performance
  const formatXAxisLabel = useCallback((value: string) => {
    const entry = chartData.find(d => d.date === value);
    return entry?.dateLabel || value;
  }, [chartData]);

  const suppressChartFocus = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.recharts-wrapper') || target.closest('.recharts-surface')) {
      event.preventDefault();
      const activeEl = document.activeElement as HTMLElement | null;
      activeEl?.blur?.();
    }
  }, []);

  const getStackedBarRadius = useCallback(
    (payload: ChartDataPoint, key: string, order: string[]): [number, number, number, number] => {
      const current = Number(payload[key] || 0);
      if (current <= 0) return [0, 0, 0, 0];
      const currentIndex = order.indexOf(key);
      if (currentIndex < 0) return [0, 0, 0, 0];
      const hasHigherLayer = order
        .slice(currentIndex + 1)
        .some((nextKey) => Number(payload[nextKey] || 0) > 0);
      return hasHigherLayer ? [0, 0, 0, 0] : [4, 4, 0, 0];
    },
    []
  );

  // DIVERTmode：used3. jsrenderline chart
  useEffect(() => {
    if (chartMode !== 'DIVERT' || !svgRef.current) {
      // IfnotDIVERTmode，cleartooltip
      if (tooltipRef.current && !tooltipRef.current.empty() && tooltipRef.current.node()) {
        tooltipRef.current.remove();
      }
      d3.selectAll('.d3-tooltip').remove();
      tooltipRef.current = null;
      previousDataRef.current = '';
      isInitialRenderRef.current = true;
      return;
    }

    // currentdataunique（chartDatacontent）
    // usedata，Avoidrefsrender
    const dataKeyParts: any[] = [];
    chartData.forEach(d => {
      const part: any = { date: d.date };
      if (dataTag === 'TASK') {
        part.running = d.running || 0;
        part.paused = d.paused || 0;
        part.completed = d.completed || 0;
        part.warning = d.warning || 0;
      } else if (dataTag === 'ACCOUNT') {
        accountIds.forEach(id => {
          part[id] = typeof d[id] === 'number' ? d[id] : 0;
        });
      } else if (dataTag === 'TYPE') {
        part.install_pb = d.install_pb || 0;
        part.event_pb = d.event_pb || 0;
        part.install_rtpb = d.install_rtpb || 0;
        part.event_rtpb = d.event_rtpb || 0;
      }
      dataKeyParts.push(part);
    });
    
    const currentDataKey = JSON.stringify({
      data: dataKeyParts,
      dataTag,
      timeRange,
      accountIds: accountIds.join(',') // usenotrefs
    });

    // Ifdatanotfirst render，notredraw
    const dataChanged = previousDataRef.current !== currentDataKey;
    const shouldAnimate = dataChanged || isInitialRenderRef.current;

    // Updatedata（Update，ensure）
    const wasInitialRender = isInitialRenderRef.current;
    if (isInitialRenderRef.current) {
      isInitialRenderRef.current = false;
    }

    if (!dataChanged && !wasInitialRender) {
      // data，notredraw，
      return;
    }

    // Updatedata
    previousDataRef.current = currentDataKey;

    const svg = d3.select(svgRef.current);
    // onlydatacontent
    if (dataChanged || wasInitialRender) {
      svg.selectAll('*').remove();
      // cleartooltip，keeprefscreate
      if (tooltipRef.current && !tooltipRef.current.empty() && tooltipRef.current.node()) {
        tooltipRef.current.remove();
      }
      d3.selectAll('.d3-tooltip').remove();
      tooltipRef.current = null; // resetrefs，create
    }

    const container = svgRef.current.parentElement;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 240;
    const margin = { top: 10, right: 10, bottom: 25, left: 0 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    svg.attr('width', width).attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // showline
    let lines: Array<{ key: string; label: string; color: string; data: number[] }> = [];

    if (dataTag === 'TASK') {
      // TASKmode：showrunning, paused, warning, completed
      const taskKeys: Array<'running' | 'paused' | 'warning' | 'completed'> = ['running', 'paused', 'warning', 'completed'];
      taskKeys.forEach(key => {
        const data = chartData.map(d => d[key] || 0);
        const hasData = data.some(v => v > 0);
        if (hasData) {
          lines.push({
            key,
            label: chartConfig[key].label,
            color: chartConfig[key].color,
            data
          });
        }
      });
    } else if (dataTag === 'ACCOUNT') {
      // ACCOUNTmode：account
      accountIds.forEach(accountId => {
        const data = chartData.map(d => {
          const value = d[accountId];
          return typeof value === 'number' ? value : 0;
        });
        const hasData = data.some(v => v > 0);
        if (hasData) {
          const accountConfig = accountConfigs.find(ac => ac.id === accountId);
          const accountName = accountConfig?.account_name || accountId;
          lines.push({
            key: accountId,
            label: accountName,
            color: accountColors[accountId],
            data
          });
        }
      });
    } else if (dataTag === 'TYPE') {
      // TYPEmode：data type
      const typeKeys: Array<'install_pb' | 'event_pb' | 'install_rtpb' | 'event_rtpb'> = ['install_pb', 'event_pb', 'install_rtpb', 'event_rtpb'];
      typeKeys.forEach(key => {
        const data = chartData.map(d => d[key] || 0);
        const hasData = data.some(v => v > 0);
        if (hasData) {
          lines.push({
            key,
            label: chartConfig[key].label,
            color: chartConfig[key].color,
            data
          });
        }
      });
    }

    if (lines.length === 0) return;

    // computeY
    const allValues = lines.flatMap(line => line.data);
    const maxValue = Math.max(...allValues, 1);
    const yScale = d3.scaleLinear()
      .domain([0, maxValue])
      .range([innerHeight, 0])
      .nice();

    // Xscales
    const xScale = d3.scaleBand()
      .domain(chartData.map(d => d.date))
      .range([0, innerWidth])
      .padding(0.1);

    // createline
    const lineGenerator = d3.line<number>()
      .x((_, i) => {
        const date = chartData[i].date;
        const band = xScale(date);
        return band !== undefined ? band + xScale.bandwidth() / 2 : 0;
      })
      .y(d => yScale(d))
      .curve(d3.curveLinear); // use

    // Drawgrid lines
    const gridLines = g.append('g')
      .attr('class', 'grid-lines');
    
    const yTicks = yScale.ticks(5);
    yTicks.forEach(tick => {
      gridLines.append('line')
        .attr('x1', 0)
        .attr('x2', innerWidth)
        .attr('y1', yScale(tick))
        .attr('y2', yScale(tick))
        .attr('stroke', 'rgba(0, 0, 0, 0.05)')
        .attr('stroke-dasharray', '3 3')
        .attr('stroke-width', 1);
    });

    // creategettooltipcontainer（Tailwind）- userefrefs，Avoidcreate
    let tooltip = tooltipRef.current;
    if (!tooltip || tooltip.empty() || !tooltip.node() || !document.body.contains(tooltip.node()!)) {
      // IftooltipnotalreadyRemove，create
      d3.selectAll('.d3-tooltip').remove();
      tooltip = d3.select('body').append('div')
        .attr('class', 'd3-tooltip')
        .style('position', 'absolute')
        .style('opacity', 0)
        .style('visibility', 'hidden') // statehide
        .style('display', 'block') // useblock
        .style('background', '#ffffff')
        .style('color', '#111827')
        .style('padding', '8px 12px')
        .style('border-radius', '6px')
        .style('border', '1px solid #e5e7eb')
        .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
        .style('font-size', '12px')
        .style('font-family', 'system-ui, -apple-system, sans-serif')
        .style('pointer-events', 'none')
        .style('z-index', 9999) // z-indexensure
        .style('line-height', '1.5')
        .style('width', 'fit-content') // fit-content width
        .style('max-width', '90vw') // Cap width at viewport
        .style('min-width', 'auto') // notSetminwidth
        .style('white-space', 'normal') // content
        .style('box-sizing', 'border-box'); // ensurepaddingnotwidthcompute
      tooltipRef.current = tooltip; // refs
    }

    // create
    const verticalLine = g.append('line')
      .attr('stroke', '#9ca3af')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '3 3')
      .attr('opacity', 0)
      .attr('y1', 0)
      .attr('y2', innerHeight);

    // Drawline
    lines.forEach((line, index) => {
      const path = g.append('path')
        .datum(line.data)
        .attr('fill', 'none')
        .attr('stroke', line.color)
        .attr('stroke-width', 2)
        .attr('d', lineGenerator);

      // onlydatafirst renderplayanimation
      if (shouldAnimate) {
        path
          .style('opacity', 0)
          .transition()
          .duration(500)
          .delay(index * 100)
          .style('opacity', 1);
      } else {
        path.style('opacity', 1);
      }

      // Adddata points（：，border）
      line.data.forEach((value, i) => {
        const date = chartData[i].date;
        const band = xScale(date);
        const x = band !== undefined ? band + xScale.bandwidth() / 2 : 0;
        const y = yScale(value);

        // Adddata points（：）
        const circle = g.append('circle')
          .attr('cx', x)
          .attr('cy', y)
          .attr('r', 4)
          .attr('fill', '#ffffff')
          .attr('stroke', line.color)
          .attr('stroke-width', 2);

        // onlydatafirst renderplayanimation
        if (shouldAnimate) {
          circle
            .style('opacity', 0)
            .transition()
            .duration(300)
            .delay(index * 100 + i * 20)
            .style('opacity', 1);
        } else {
          circle.style('opacity', 1);
        }
      });
    });

    // createhighlightdata points
    const highlightGroup = g.append('g')
      .attr('class', 'highlight-points');

    // createinteraction：chart areamouse（alreadybindevent，onlyforrefs）
    const interactionLayerRef = g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .style('pointer-events', 'all') // ensuremouseevent
      .on('mousemove', function(event) {
        const [mouseX] = d3.pointer(event, this);
        
        // date
        let closestIndex = 0;
        let minDistance = Infinity;
        
        chartData.forEach((d, i) => {
          const band = xScale(d.date);
          if (band !== undefined) {
            const centerX = band + xScale.bandwidth() / 2;
            const distance = Math.abs(mouseX - centerX);
            if (distance < minDistance) {
              minDistance = distance;
              closestIndex = i;
            }
          }
        });

        const entry = chartData[closestIndex];
        if (!entry) return; // Check：ensureentry
        
        const band = xScale(entry.date);
        const x = band !== undefined ? band + xScale.bandwidth() / 2 : 0;

        // Update
        verticalLine
          .attr('x1', x)
          .attr('x2', x)
          .attr('opacity', 1);

        // highlight
        highlightGroup.selectAll('*').remove();

        // highlightcurrentdata points
        lines.forEach((line, lineIndex) => {
          const value = line.data[closestIndex];
          if (value === undefined || isNaN(value)) return; // Check：ensure
          const y = yScale(value);
          
          // Drawhighlightdata points（，）
          highlightGroup.append('circle')
            .attr('cx', x)
            .attr('cy', y)
            .attr('r', 6)
            .attr('fill', '#ffffff')
            .attr('stroke', line.color)
            .attr('stroke-width', 3)
            .style('opacity', 1);
        });

        // tooltipcontent：showdatelinedata
        let tooltipContent = '';
        let tooltipItems: Array<{ label: string; value: number; color: string; percentage: string }> = [];

        if (dataTag === 'TASK') {
          const total = entry.total || 0;
          // Computeday-over-day growth rate
          let growthRateText = '';
          if (closestIndex > 0) {
            const previousEntry = chartData[closestIndex - 1];
            const currentTotal = entry.total || 0;
            const previousTotal = previousEntry.total || 0;
            if (previousTotal > 0) {
              const growthRate = ((currentTotal - previousTotal) / previousTotal) * 100;
              const sign = growthRate >= 0 ? '+' : '';
              growthRateText = ` (${sign}${growthRate.toFixed(1)}%)`;
            } else if (currentTotal > 0) {
              growthRateText = ' (+100.0%)';
            } else {
              growthRateText = ' (0.0%)';
            }
          }
          tooltipContent = `<div style="font-weight: 600; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; white-space: nowrap;">${entry.dateLabel} - Total: ${total}${growthRateText}</div>`;
          
          lines.forEach(line => {
            const value = line.data[closestIndex];
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            tooltipItems.push({
              label: line.label,
              value,
              color: line.color,
              percentage
            });
          });
        } else if (dataTag === 'ACCOUNT') {
          const totalTasks = entry.totalTasks || 0;
          tooltipContent = `<div style="font-weight: 600; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; white-space: nowrap;">${entry.dateLabel} - Tasks: ${totalTasks}, Apps: ${entry.totalApps || 0}</div>`;
          
          lines.forEach(line => {
            const value = line.data[closestIndex];
            const percentage = totalTasks > 0 ? ((value / totalTasks) * 100).toFixed(1) : '0.0';
            tooltipItems.push({
              label: line.label,
              value,
              color: line.color,
              percentage
            });
          });
        } else if (dataTag === 'TYPE') {
          const typeTotal = entry.typeTotal || 0;
          // computeday-over-day growth rate
          let growthRateText = '';
          if (closestIndex > 0) {
            const avgRate = entry.avgTypeGrowthRate || 0;
            const sign = avgRate >= 0 ? '+' : '';
            growthRateText = ` (${sign}${avgRate.toFixed(1)}%)`;
          }
          tooltipContent = `<div style="font-weight: 600; margin-bottom: 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; white-space: nowrap;">${entry.dateLabel} - Total: ${typeTotal}${growthRateText}</div>`;
          
          lines.forEach(line => {
            const value = line.data[closestIndex];
            const percentage = typeTotal > 0 ? ((value / typeTotal) * 100).toFixed(1) : '0.0';
            tooltipItems.push({
              label: line.label,
              value,
              color: line.color,
              percentage
            });
          });
        }

        // Addlinedata - useflex，ensuretext
        tooltipItems.forEach(item => {
          tooltipContent += `<div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
            <div style="width: 12px; height: 12px; min-width: 12px; max-width: 12px; border-radius: 2px; background: ${item.color}; flex-shrink: 0; display: inline-block;"></div>
            <span style="white-space: nowrap; flex: 0 0 auto;">${item.label}: ${item.value} (${item.percentage}%)</span>
          </div>`;
        });

        // ensuretooltipshow，datashow
        // Checktooltip，Ifnotcreate
        if (!tooltip || tooltip.empty() || !tooltip.node() || !document.body.contains(tooltip.node()!)) {
          d3.selectAll('.d3-tooltip').remove();
          tooltip = d3.select('body').append('div')
            .attr('class', 'd3-tooltip')
            .style('position', 'absolute')
            .style('opacity', 0)
            .style('visibility', 'hidden')
            .style('display', 'block')
            .style('background', '#ffffff')
            .style('color', '#111827')
            .style('padding', '8px 12px')
            .style('border-radius', '6px')
            .style('border', '1px solid #e5e7eb')
            .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)')
            .style('font-size', '12px')
            .style('font-family', 'system-ui, -apple-system, sans-serif')
            .style('pointer-events', 'none')
            .style('z-index', 9999)
            .style('line-height', '1.5')
            .style('width', 'fit-content')
            .style('max-width', '90vw')
            .style('min-width', 'auto')
            .style('white-space', 'normal')
            .style('box-sizing', 'border-box');
          tooltipRef.current = tooltip; // Updaterefs
        }
        
        if (tooltipContent && tooltipContent.trim() !== '') {
          // showtooltip，ensureeach timemousemoveshow
          tooltip.html(tooltipContent)
            .style('opacity', 1)
            .style('visibility', 'visible') // ensure
            .style('display', 'block') // useblock
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 10) + 'px')
            .style('width', 'fit-content') // fit-content width
            .style('max-width', '90vw'); // width，Preventcontainer
        } else {
          // Ifcontent，hidetooltip
          if (tooltip && !tooltip.empty() && tooltip.node()) {
            tooltip.style('opacity', 0).style('visibility', 'hidden');
          }
        }
      })
      .on('mouseout', function() {
        verticalLine.attr('opacity', 0);
        highlightGroup.selectAll('*').remove();
        if (tooltip && !tooltip.empty() && tooltip.node()) {
          tooltip.style('opacity', 0).style('visibility', 'hidden');
        }
      })
      .on('mouseleave', function() {
        // ensuremousehidetooltip
        verticalLine.attr('opacity', 0);
        highlightGroup.selectAll('*').remove();
        if (tooltip && !tooltip.empty() && tooltip.node()) {
          tooltip.style('opacity', 0).style('visibility', 'hidden');
        }
      });
    void interactionLayerRef; // rect refs，eventalreadyviabind

    // DrawX
    const xAxis = g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale)
        .tickFormat((d) => {
          const entry = chartData.find(e => e.date === d);
          return entry?.dateLabel || '';
        })
        .tickSize(0)
      );

    xAxis.selectAll('text')
      .attr('fill', '#6b7280')
      .attr('font-size', timeRange === 1 || timeRange === 3 ? '10px' : timeRange <= 7 ? '11px' : '10px')
      .attr('font-family', 'system-ui, -apple-system, sans-serif')
      .style('text-anchor', 'middle');

    // timeRangeXlabel
    if (timeRange === 15) {
      xAxis.selectAll('text')
        .attr('opacity', (d, i) => i % 2 === 0 ? 1 : 0);
    } else if (timeRange === 30) {
      xAxis.selectAll('text')
        .attr('opacity', (d, i) => i % 4 === 0 ? 1 : 0);
    }

    xAxis.selectAll('line, path').remove();

    // Cleanup - nottooltip，onlyhide，refsuse
    return () => {
      if (tooltipRef.current && !tooltipRef.current.empty() && tooltipRef.current.node()) {
        tooltipRef.current.style('opacity', 0).style('visibility', 'hidden');
      }
    };
  }, [chartMode, chartData, dataTag, accountIds, accountColors, accountConfigs, timeRange]);

  // IfDIVERTmode，renderd3line chart
  if (chartMode === 'DIVERT') {
    return (
      <div className="task-statistics-chart-container" style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
        <div className="chart-wrapper" onMouseDownCapture={suppressChartFocus}>
          <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="task-statistics-chart-container" style={{ userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none', msUserSelect: 'none' }}>
      {/* chart area */}
      <div className="chart-wrapper" onMouseDownCapture={suppressChartFocus}>
        <ChartContainer config={chartConfig} className="w-full chart-container-wide">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, bottom: 25, left: 0 }}
            syncId="task-statistics-chart"
            accessibilityLayer={false}
            tabIndex={-1}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0, 0, 0, 0.05)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxisLabel}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#6b7280', fontSize: timeRange === 1 || timeRange === 3 ? 10 : timeRange <= 7 ? 11 : 10 }}
              style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
              tickMargin={timeRange === 1 || timeRange === 3 ? 8 : 10}
              interval={timeRange === 15 ? 2 : timeRange === 30 ? 4 : 0}
              height={timeRange === 1 || timeRange === 3 ? 40 : 30}
              angle={0}
              textAnchor="middle"
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tick={false}
              width={0}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideIndicator={true}
                  className="!w-auto !max-w-none !min-w-[8rem] !z-[9999]"
                  style={{ width: 'auto', maxWidth: 'none', zIndex: 9999 }}
                  labelFormatter={(value) => {
                    const entry = chartData.find(d => d.date === value);
                    if (!entry) return value;
                    
                    if (dataTag === 'ACCOUNT') {
                      // ACCOUNTdimension：showtaskcountappcount
                      return `${entry.dateLabel} - Tasks: ${entry.totalTasks || 0}, Apps: ${entry.totalApps || 0}`;
                    } else if (dataTag === 'TYPE') {
                      // TYPEdimension：showtaskcountday-over-day growth rate
                      const currentIndex = chartData.findIndex(d => d.date === value);
                      let growthRateText = '';
                      
                      if (currentIndex > 0) {
                        const avgRate = entry.avgTypeGrowthRate || 0;
                        const sign = avgRate >= 0 ? '+' : '';
                        growthRateText = ` (${sign}${avgRate.toFixed(1)}%)`;
                      }
                      
                      return `${entry.dateLabel} - Total: ${entry.typeTotal || 0}${growthRateText}`;
                    } else {
                      // TASKdimension：showtotaltaskcountday-over-day growth rate
                      const currentIndex = chartData.findIndex(d => d.date === value);
                      let growthRateText = '';
                      
                      if (currentIndex > 0) {
                        const previousEntry = chartData[currentIndex - 1];
                        const currentTotal = entry.total || 0;
                        const previousTotal = previousEntry.total || 0;
                        
                        if (previousTotal > 0) {
                          const growthRate = ((currentTotal - previousTotal) / previousTotal) * 100;
                          const sign = growthRate >= 0 ? '+' : '';
                          growthRateText = ` (${sign}${growthRate.toFixed(1)}%)`;
                        } else if (currentTotal > 0) {
                          growthRateText = ' (+100.0%)';
                        } else {
                          growthRateText = ' (0.0%)';
                        }
                      }
                      
                      return `${entry.dateLabel} - Total: ${entry.total || 0}${growthRateText}`;
                    }
                  }}
                  formatter={(value, name, item, index, payload) => {
                    // show（alreadylabelshow）
                    if (name === 'rate' || name === 'completionRate' || name === 'growthRate') {
                      return null;
                    }
                    
                    // Failedstateshow
                    if (name === 'failed') {
                      return null;
                    }
                    
                    // ACCOUNTdimension：show（totalTaskstotalAppsalreadylabelshow）
                    if (dataTag === 'ACCOUNT' && (name === 'totalTasks' || name === 'totalApps')) {
                      return null;
                    }
                    
                    // TYPEdimension：show（typeTotalavgTypeGrowthRatealreadylabelshow）
                    if (dataTag === 'TYPE' && (name === 'typeTotal' || name === 'avgTypeGrowthRate')) {
                      return null;
                    }
                    
                    if (dataTag === 'ACCOUNT') {
                      // ACCOUNTdimension：showaccounttaskcount
                      if (payload && typeof payload === 'object' && 'date' in payload) {
                        const entry = chartData.find(d => d.date === payload.date);
                        if (entry) {
                          const totalTasks = entry.totalTasks || 0;
                          const count = Number(value);
                          const percentage = totalTasks > 0 ? ((count / totalTasks) * 100).toFixed(1) : '0.0';
                          // getaccount
                          const accountConfig = accountConfigs.find(ac => ac.id === name);
                          const accountName = accountConfig?.account_name || name;
                          const indicatorColor = (item && typeof item === 'object' && 'color' in item ? item.color : undefined) || (item && typeof item === 'object' && 'payload' in item && item.payload && typeof item.payload === 'object' && 'fill' in item.payload ? item.payload.fill : undefined) || '#9ca3af';
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', minWidth: '170px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#6b7280' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: String(indicatorColor), flexShrink: 0 }} />
                                {accountName}
                              </span>
                              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>{`${count} (${percentage}%)`}</span>
                            </div>
                          );
                        }
                      }
                    } else if (dataTag === 'TYPE') {
                      // TYPEdimension：showtaskcount
                      if (payload && typeof payload === 'object' && 'date' in payload) {
                        const entry = chartData.find(d => d.date === payload.date);
                        if (entry) {
                          const typeTotal = entry.typeTotal || 0;
                          const count = Number(value);
                          const percentage = typeTotal > 0 ? ((count / typeTotal) * 100).toFixed(1) : '0.0';
                          const label = chartConfig[name as keyof typeof chartConfig]?.label || name;
                          const indicatorColor = (item && typeof item === 'object' && 'color' in item ? item.color : undefined) || (item && typeof item === 'object' && 'payload' in item && item.payload && typeof item.payload === 'object' && 'fill' in item.payload ? item.payload.fill : undefined) || '#9ca3af';
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', minWidth: '170px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#6b7280' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: String(indicatorColor), flexShrink: 0 }} />
                                {label}
                              </span>
                              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>{`${count} (${percentage}%)`}</span>
                            </div>
                          );
                        }
                      }
                    } else {
                      // TASKdimension：handlebar chartdata
                      if (payload && typeof payload === 'object' && 'date' in payload) {
                        const entry = chartData.find(d => d.date === payload.date);
                        if (entry) {
                          const total = entry.total || 0;
                          const count = Number(value);
                          const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                          const label = chartConfig[name as keyof typeof chartConfig]?.label || name;
                          const indicatorColor = (item && typeof item === 'object' && 'color' in item ? item.color : undefined) || (item && typeof item === 'object' && 'payload' in item && item.payload && typeof item.payload === 'object' && 'fill' in item.payload ? item.payload.fill : undefined) || '#9ca3af';
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', minWidth: '170px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#6b7280' }}>
                                <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: String(indicatorColor), flexShrink: 0 }} />
                                {label}
                              </span>
                              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#111827' }}>{`${count} (${percentage}%)`}</span>
                            </div>
                          );
                        }
                      }
                    }
                    
                    return [value, chartConfig[name as keyof typeof chartConfig]?.label || name];
                  }}
                />
              }
            />
            {/* dataTagrendernotchart*/}
            {dataTag === 'TASK' ? (
              <>
                {/* TASKdimension：bar chart - in order：Running(bottompurple) -> Paused(red) -> Warning(orange) -> Completed(topgreen)*/}
                {(() => {
                  const taskOrder = ['running', 'paused', 'warning', 'completed'];
                  return (
                    <>
            <Bar
              yAxisId="left"
              dataKey="running"
              stackId="a"
              fill="var(--color-running)"
              radius={[0, 0, 0, 0]}
              isAnimationActive={true}
              animationDuration={380}
              animationEasing="ease-out"
              animationBegin={0}
              activeBar={false}
              shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'running', taskOrder)} />}
            />
            <Bar
              yAxisId="left"
              dataKey="paused"
              stackId="a"
              fill="var(--color-paused)"
              radius={[0, 0, 0, 0]}
              isAnimationActive={true}
              animationDuration={380}
              animationEasing="ease-out"
              animationBegin={0}
              activeBar={false}
              shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'paused', taskOrder)} />}
            />
                <Bar
                  yAxisId="left"
                  dataKey="warning"
                  stackId="a"
                  fill="var(--color-warning)"
              radius={[0, 0, 0, 0]}
              isAnimationActive={true}
              animationDuration={380}
              animationEasing="ease-out"
              animationBegin={0}
              activeBar={false}
              shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'warning', taskOrder)} />}
            />
            <Bar
              yAxisId="left"
              dataKey="completed"
              stackId="a"
              fill="var(--color-completed)"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={380}
                  animationEasing="ease-out"
                  animationBegin={0}
              activeBar={false}
                  shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'completed', taskOrder)} />}
                />
                    </>
                  );
                })()}
              </>
            ) : dataTag === 'ACCOUNT' ? (
              <>
                {/* ACCOUNTdimension：bar chart - accountshowdatacount*/}
                {accountIds.map((accountId) => {
                  const accountConfig = accountConfigs.find(ac => ac.id === accountId);
                  const accountName = accountConfig?.account_name || accountId;
                  return (
                    <Bar
                      key={accountId}
                      yAxisId="left"
                      dataKey={accountId}
                      stackId="account"
                      name={accountName}
                      fill={accountColors[accountId]}
                      radius={[0, 0, 0, 0]}
                      isAnimationActive={true}
                      animationDuration={380}
                      animationEasing="ease-out"
                      animationBegin={0}
                      activeBar={false}
                      shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, accountId, accountIds)} />}
                    />
                  );
                })}
              </>
            ) : dataTag === 'TYPE' ? (
              <>
                {/* TYPEdimension：bar chart - in order：install_pb(blue) -> event_pb(green) -> install_rtpb(orange) -> event_rtpb(red)*/}
                {(() => {
                  const typeOrder = ['install_pb', 'event_pb', 'install_rtpb', 'event_rtpb'];
                  return (
                    <>
                <Bar
                  yAxisId="left"
                  dataKey="install_pb"
                  stackId="type"
                  fill="var(--color-install_pb)"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={380}
                  animationEasing="ease-out"
                  animationBegin={0}
                  activeBar={false}
                  shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'install_pb', typeOrder)} />}
                />
                <Bar
                  yAxisId="left"
                  dataKey="event_pb"
                  stackId="type"
                  fill="var(--color-event_pb)"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={380}
                  animationEasing="ease-out"
                  animationBegin={0}
                  activeBar={false}
                  shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'event_pb', typeOrder)} />}
                />
                <Bar
                  yAxisId="left"
                  dataKey="install_rtpb"
                  stackId="type"
                  fill="var(--color-install_rtpb)"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={380}
                  animationEasing="ease-out"
                  animationBegin={0}
                  activeBar={false}
                  shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'install_rtpb', typeOrder)} />}
                />
                <Bar
                  yAxisId="left"
                  dataKey="event_rtpb"
                  stackId="type"
                  fill="var(--color-event_rtpb)"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={380}
                  animationEasing="ease-out"
                  animationBegin={0}
                  activeBar={false}
                  shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'event_rtpb', typeOrder)} />}
                />
                    </>
                  );
                })()}
              </>
            ) : (
              <>
                {/* dimension：logic*/}
                {(() => {
                  const fallbackOrder = ['running', 'paused', 'warning', 'completed'];
                  return (
                    <>
                <Bar
                  yAxisId="left"
                  dataKey="running"
                  stackId="a"
                  fill="var(--color-running)"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={380}
                  animationEasing="ease-out"
                  animationBegin={0}
                  activeBar={false}
                  shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'running', fallbackOrder)} />}
                />
                <Bar
                  yAxisId="left"
                  dataKey="paused"
                  stackId="a"
                  fill="var(--color-paused)"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={380}
                  animationEasing="ease-out"
                  animationBegin={0}
                  activeBar={false}
                  shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'paused', fallbackOrder)} />}
                />
                <Bar
                  yAxisId="left"
                  dataKey="warning"
                  stackId="a"
                  fill="var(--color-warning)"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={380}
                  animationEasing="ease-out"
                  animationBegin={0}
                  activeBar={false}
                  shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'warning', fallbackOrder)} />}
                />
                <Bar
                  yAxisId="left"
                  dataKey="completed"
                  stackId="a"
                  fill="var(--color-completed)"
                  radius={[0, 0, 0, 0]}
                  isAnimationActive={true}
                  animationDuration={380}
                  animationEasing="ease-out"
                  animationBegin={0}
                  activeBar={false}
                  shape={(props: any) => <Rectangle {...props} radius={getStackedBarRadius(props.payload as ChartDataPoint, 'completed', fallbackOrder)} />}
                />
                    </>
                  );
                })()}
              </>
            )}
          </ComposedChart>
        </ChartContainer>
      </div>
    </div>
  );
};

// use React. memo optimize performance，Avoidnotre-render
export default React.memo(TaskStatisticsChart);
