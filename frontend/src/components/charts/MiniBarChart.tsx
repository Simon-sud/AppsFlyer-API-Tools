import React, { useRef, useEffect, useMemo } from 'react';
import * as d3 from 'd3';
import { formatNumber } from './BaseChart';

export interface MiniBarChartData {
  date: string;
  value: number;
}

export interface MiniBarChartProps {
  data: MiniBarChartData[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export const MiniBarChart: React.FC<MiniBarChartProps> = ({
  data,
  width = 120,
  height = 60,
  color = '#374151', // gray-700 dark theme
  className = '',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dataSignatureRef = useRef<string>('');
  // Unique instance id to avoid collisions
  const instanceId = useMemo(() => `mini-bar-chart-${Math.random().toString(36).substr(2, 9)}`, []);

  useEffect(() => {
    if (!data || data.length === 0 || !svgRef.current) {
      dataSignatureRef.current = '';
      return;
    }

    const signature = JSON.stringify({
      w: width,
      h: height,
      c: color,
      s: data.map(d => [d.date, d.value])
    });

    // Skip redraw when data/size unchanged (avoids post-pop flash)
    if (signature === dataSignatureRef.current && dataSignatureRef.current !== '') {
      return;
    }

    dataSignatureRef.current = signature;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Margins
    const margin = { top: 4, right: 4, bottom: 4, left: 4 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3
      .scaleBand()
      .domain(data.map(d => d.date))
      .range([0, innerWidth])
      .padding(0.2);

    const maxValue = d3.max(data, d => d.value) || 0;
    // y from zero; baseline at innerHeight
    // No nice() — consistent y(0) across charts
    const yScale = d3
      .scaleLinear()
      .domain([0, maxValue || 1]) // Use 1 when max is 0
      .range([innerHeight, 0]); // No nice(); aligned baseline

    // Color gradient (unique id)
    const defs = svg.append('defs');
    const gradient = defs
      .append('linearGradient')
      .attr('id', `miniBarGradient-${instanceId}`)
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', innerHeight);

    gradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.8);

    gradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.4);

    // Min height for zero values
    const minHeight = 1.5;
    
    // Bars
    const bars = g
      .selectAll('.mini-bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'mini-bar')
      .attr('x', d => xScale(d.date) || 0)
      .attr('y', innerHeight)
      .attr('width', xScale.bandwidth())
      .attr('height', 0)
      .attr('fill', `url(#miniBarGradient-${instanceId})`)
      .attr('rx', 2) // rounded corners
      .style('cursor', 'pointer')
      .style('transition', 'opacity 0.2s ease');

    const barY = (d: MiniBarChartData) => {
      if (d.value === 0) {
        return innerHeight - minHeight;
      }
      const topY = yScale(d.value);
      return Math.min(topY, innerHeight);
    };

    const barHeight = (d: MiniBarChartData) => {
      if (d.value === 0) {
        return minHeight;
      }
      const topY = yScale(d.value);
      const calculatedHeight = innerHeight - topY;
      return Math.max(Math.min(calculatedHeight, innerHeight), minHeight);
    };

    bars
      .transition()
      .duration(600)
      .ease(d3.easeCubicOut)
      .attr('y', d => barY(d))
      .attr('height', d => barHeight(d));

    // Per-instance tooltip
    const tooltipId = `chart-tooltip-${instanceId}`;
    // Remove any existing tooltip
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
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000')
      .style('box-shadow', '0 2px 8px rgba(0, 0, 0, 0.2)');

    const handleMouseOver = (event: MouseEvent, d: MiniBarChartData) => {
      // Format date
      const date = new Date(d.date);
      const dateStr = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      tooltip
        .style('visibility', 'visible')
        .html(`
          <div class="text-xs">
            <div class="font-semibold mb-1">${dateStr}</div>
            <div class="text-gray-200">${formatNumber(d.value)}</div>
          </div>
        `);
    };

    const handleMouseMove = (event: MouseEvent) => {
      tooltip
        .style('top', event.pageY - 10 + 'px')
        .style('left', event.pageX + 10 + 'px');
    };

    const handleMouseOut = () => {
      tooltip.style('visibility', 'hidden');
    };

    bars
      .on('mouseover', handleMouseOver)
      .on('mousemove', handleMouseMove)
      .on('mouseout', handleMouseOut)
      .on('mouseenter', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('opacity', 0.7);
      })
      .on('mouseleave', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('opacity', 1);
      });

    // Cleanup this instance's tooltip
    return () => {
      d3.select(`#${tooltipId}`).remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, height, color, instanceId]);

  return (
    <div 
      className={`mini-bar-chart ${className}`} 
      style={{ 
        width, 
        height, 
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end', // Bottom-align bar baselines
        justifyContent: 'center'
      }}
    >
      <svg 
        ref={svgRef} 
        width={width} 
        height={height} 
        style={{ display: 'block', flexShrink: 0 }}
        className="overflow-visible"
      />
    </div>
  );
};

