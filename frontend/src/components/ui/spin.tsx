import React from 'react';
import { cn } from '../../lib/utils';
import { LoadingIcon } from './icons';

interface SpinProps {
  spinning?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export const Spin: React.FC<SpinProps> = ({ spinning = false, children, className }) => {
  if (!spinning) {
    return <>{children}</>;
  }

  return (
    <div className={cn("relative", className)}>
      {children}
      <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
        <div className="flex flex-col items-center gap-2">
          <LoadingIcon className="w-6 h-6 animate-spin text-gray-600" />
        </div>
      </div>
    </div>
  );
};

