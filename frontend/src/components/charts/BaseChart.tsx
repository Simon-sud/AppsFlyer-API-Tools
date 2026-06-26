import React, { useRef } from 'react';
// Removed unused imports: useEffect, useState
import * as d3 from 'd3';

export interface ChartDimensions {
  width: number;
  height: number;
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface BaseChartProps {
  width?: number;
  height?: number;
  margin?: Partial<ChartDimensions['margin']>;
  className?: string;
  children?: React.ReactNode;
}

export const useChartDimensions = (
  width: number = 800,
  height: number = 400,
  margin: Partial<ChartDimensions['margin']> = {}
): ChartDimensions => {
  const defaultMargin = {
    top: 20,
    right: 30,
    bottom: 40,
    left: 40,
  };

  return {
    width,
    height,
    margin: { ...defaultMargin, ...margin },
  };
};

export const BaseChart: React.FC<BaseChartProps> = ({
  width = 800,
  height = 400,
  margin = {},
  className = '',
  children,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dimensions = useChartDimensions(width, height, margin);

  return (
    <div className={`chart-container ${className}`} style={{ width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block', margin: '0 auto' }}
      >
        <g transform={`translate(${dimensions.margin.left},${dimensions.margin.top})`}>
          {children}
        </g>
      </svg>
    </div>
  );
};

// Utilities
export const createTooltip = (container: HTMLElement) => {
  return d3
    .select(container)
    .append('div')
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
};

export const formatNumber = (value: number | undefined | null): string => {
  // Handle undefined, null, or non-numeric values
  if (value === undefined || value === null || isNaN(Number(value))) {
    return '0';
  }
  const numValue = Number(value);
  if (numValue >= 1000000) {
    return (numValue / 1000000).toFixed(1) + 'M';
  } else if (numValue >= 1000) {
    return (numValue / 1000).toFixed(1) + 'K';
  }
  return numValue.toString();
};

export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
