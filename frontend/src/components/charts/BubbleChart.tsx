import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatNumber } from './BaseChart';

export interface BubbleChartData {
  id?: string;
  name: string;
  value: number;
  channel?: string;
  groupName?: string;
  eventData?: { [eventName: string]: number };
}

export interface BubbleChartProps {
  data: BubbleChartData[];
  className?: string;
  showTooltip?: boolean;
  enableAnimation?: boolean;
  statisticsType?: 'Install' | 'Event';
}

interface BubbleNode {
  key: string;
  x: number;
  y: number;
  r: number;
  label: string;
  data: BubbleChartData;
}

const MIN_RADIUS = 24;
const MAX_RADIUS = 58;
const H_GAP = 14;
const V_GAP = 16;
const PADDING = 12;
const LABEL_SPACE = 22;

const shortenLabel = (label: string, maxLength = 10) => {
  const clean = (label || '').trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1)}…`;
};

export const BubbleChart: React.FC<BubbleChartProps> = ({
  data,
  className = '',
  showTooltip = true,
  enableAnimation = true,
  statisticsType = 'Install',
}) => {
  const formatTooltipNumber = (value: number): string => {
    if (!Number.isFinite(value)) return '0';
    return value.toLocaleString('en-US');
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    item: BubbleChartData | null;
  }>({ visible: false, x: 0, y: 0, item: null });
  const [hoveredNodeKey, setHoveredNodeKey] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      setContainerSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };
    updateSize();

    const ro = new ResizeObserver(() => updateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { nodes, contentHeight } = useMemo(() => {
    const validData = (data || [])
      .filter(item => item && Number(item.value) > 0)
      .map(item => ({ ...item, value: Number(item.value) }))
      .sort((a, b) => b.value - a.value);

    if (validData.length === 0 || containerSize.width <= 0) {
      return { nodes: [] as BubbleNode[], contentHeight: 0 };
    }

    const maxValue = Math.max(...validData.map(d => d.value), 1);
    const minValue = Math.min(...validData.map(d => d.value), maxValue);
    const valueRange = Math.max(maxValue - minValue, 1);
    const safeWidth = Math.max(260, containerSize.width);
    const maxUsableWidth = safeWidth - PADDING * 2;

    const nodesWithRadius = validData.map((d, index) => {
      // Key optimization：
      // - Single bubble in filter: max radius to highlight sole result
      // - Multiple bubbles: scale by relative values in current view
      const r = validData.length === 1
        ? MAX_RADIUS
        : MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.sqrt((d.value - minValue) / valueRange);
      return {
        key: d.id || `${d.name}-${index}`,
        r,
        data: d,
        label: d.channel || d.name || 'Unknown',
      };
    });

    const rows: typeof nodesWithRadius[] = [];
    let currentRow: typeof nodesWithRadius = [];
    let currentRowWidth = 0;

    nodesWithRadius.forEach(item => {
      const diameter = item.r * 2;
      const itemWidth = diameter + (currentRow.length > 0 ? H_GAP : 0);
      if (currentRow.length > 0 && currentRowWidth + itemWidth > maxUsableWidth) {
        rows.push(currentRow);
        currentRow = [item];
        currentRowWidth = diameter;
      } else {
        currentRow.push(item);
        currentRowWidth += itemWidth;
      }
    });
    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    const nodes: BubbleNode[] = [];
    let yCursor = PADDING;

    rows.forEach(row => {
      const leftSide: typeof row = [];
      const rightSide: typeof row = [];
      for (let i = 1; i < row.length; i += 1) {
        if (i % 2 === 1) {
          leftSide.push(row[i]);
        } else {
          rightSide.push(row[i]);
        }
      }
      const displayOrder = [...leftSide.reverse(), row[0], ...rightSide];

      const rowWidth = displayOrder.reduce((sum, item, idx) => {
        const diameter = item.r * 2;
        return sum + diameter + (idx > 0 ? H_GAP : 0);
      }, 0);
      const rowMaxDiameter = displayOrder.reduce((max, item) => Math.max(max, item.r * 2), 0);
      const rowCenterY = yCursor + rowMaxDiameter / 2;
      let xCursor = Math.max(PADDING, (safeWidth - rowWidth) / 2);

      displayOrder.forEach(item => {
        nodes.push({
          key: item.key,
          x: xCursor + item.r,
          y: rowCenterY,
          r: item.r,
          label: item.label,
          data: item.data,
        });
        xCursor += item.r * 2 + H_GAP;
      });

      yCursor += rowMaxDiameter + LABEL_SPACE + V_GAP;
    });

    const totalContentHeight = Math.max(220, Math.ceil(yCursor - V_GAP + PADDING));
    return { nodes, contentHeight: totalContentHeight };
  }, [data, containerSize.width]);

  const svgHeight = Math.max(contentHeight || 220, containerSize.height || 220);
  const verticalOffset = Math.max(0, (svgHeight - (contentHeight || 220)) / 2);

  const hideTooltip = () => setTooltip({ visible: false, x: 0, y: 0, item: null });

  const handleMouseMove = (event: React.MouseEvent, item: BubbleChartData, nodeKey: string) => {
    if (!showTooltip || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setHoveredNodeKey(nodeKey);
    setTooltip({
      visible: true,
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top - 12,
      item,
    });
  };

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
      onMouseLeave={() => {
        setHoveredNodeKey(null);
        hideTooltip();
      }}
    >
      <svg width={containerSize.width || '100%'} height={svgHeight} style={{ display: 'block' }}>
        {nodes.map((node, index) => (
          <g
            key={node.key}
            transform={`translate(${node.x}, ${node.y + verticalOffset})`}
          >
            <circle
              r={node.r}
              fill="#111827"
              fillOpacity={hoveredNodeKey === node.key ? 0.95 : 0.88}
              stroke="#111827"
              strokeWidth={hoveredNodeKey === node.key ? 1.4 : 1}
              onMouseEnter={e => handleMouseMove(e, node.data, node.key)}
              onMouseMove={e => handleMouseMove(e, node.data, node.key)}
              onMouseLeave={() => {
                setHoveredNodeKey(null);
                hideTooltip();
              }}
              style={{
                cursor: showTooltip ? 'pointer' : 'default',
                transformOrigin: 'center',
                transformBox: 'fill-box',
                transition: 'fill-opacity 0.16s ease, stroke-width 0.16s ease, transform 0.16s ease',
                transform: hoveredNodeKey === node.key ? 'scale(1.025)' : 'scale(1)',
                animation: enableAnimation ? `bubble-circle-pop 360ms ease-out ${Math.min(index * 45, 500)}ms both` : undefined,
              }}
            />

            <text
              x={0}
              y={4}
              textAnchor="middle"
              fill="#F9FAFB"
              fontSize={Math.max(10, Math.min(14, node.r / 3))}
              fontWeight={700}
              style={{
                pointerEvents: 'none',
                animation: enableAnimation ? `bubble-text-fade 220ms ease-out ${Math.min(index * 45, 500) + 120}ms both` : undefined,
              }}
            >
              {formatNumber(node.data.value)}
            </text>

            <text
              x={0}
              y={node.r + 16}
              textAnchor="middle"
              fill="#374151"
              fontSize={11}
              fontWeight={500}
              style={{
                pointerEvents: 'none',
                animation: enableAnimation ? `bubble-text-fade 220ms ease-out ${Math.min(index * 45, 500) + 160}ms both` : undefined,
              }}
            >
              {shortenLabel(node.label)}
            </text>
          </g>
        ))}
      </svg>

      {showTooltip && tooltip.visible && tooltip.item && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            pointerEvents: 'none',
            background: 'rgba(17, 24, 39, 0.95)',
            color: '#F9FAFB',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            zIndex: 99999,
            whiteSpace: 'nowrap',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            {tooltip.item.channel || tooltip.item.name}
          </div>
          {statisticsType === 'Install' ? (
            <div style={{ color: '#D1D5DB' }}>
              Install: {formatTooltipNumber(Number(tooltip.item.value) || 0)}
            </div>
          ) : (
            <div style={{ color: '#D1D5DB', whiteSpace: 'normal' }}>
              {tooltip.item.eventData && Object.keys(tooltip.item.eventData).length > 0 ? (
                Object.entries(tooltip.item.eventData)
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .map(([eventName, eventCount]) => (
                    <div key={eventName}>
                      {eventName}: {formatTooltipNumber(Number(eventCount) || 0)}
                    </div>
                  ))
              ) : (
                <div>
                  Event: {formatTooltipNumber(Number(tooltip.item.value) || 0)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>
        {`
          @keyframes bubble-circle-pop {
            0% {
              opacity: 0;
              transform: scale(0.35);
            }
            100% {
              opacity: 1;
              transform: scale(1);
            }
          }
          @keyframes bubble-text-fade {
            0% {
              opacity: 0;
            }
            100% {
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
};
