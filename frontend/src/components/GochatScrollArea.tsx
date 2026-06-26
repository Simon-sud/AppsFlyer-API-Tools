import React from 'react';
import { cn } from '../lib/utils';

type GochatScrollAreaProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  maxHeight?: string;
  direction?: 'y' | 'x' | 'both';
};

/**
 * Scroll region with reserved gutter so the scrollbar never overlaps text.
 */
export const GochatScrollArea: React.FC<GochatScrollAreaProps> = ({
  children,
  className,
  contentClassName,
  maxHeight,
  direction = 'y',
}) => {
  const overflow =
    direction === 'x'
      ? 'overflow-x-auto overflow-y-hidden'
      : direction === 'both'
        ? 'overflow-auto'
        : 'overflow-y-auto overflow-x-hidden';

  return (
    <div
      className={cn('gochat-scroll-rail benchmark-scrollable', overflow, className)}
      style={{ maxHeight, scrollbarGutter: 'stable' }}
    >
      <div className={cn('gochat-scroll-content', contentClassName)}>{children}</div>
    </div>
  );
};

export default GochatScrollArea;
