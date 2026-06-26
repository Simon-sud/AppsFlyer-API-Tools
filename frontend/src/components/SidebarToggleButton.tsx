import React, { useState, useEffect } from 'react';

/** Initial toggle position (below last menu item) */
function calculateInitialPosition(): number {
  const sidebar = document.querySelector('.custom-sidebar');
  const menuItems = document.querySelectorAll('.sidebar-menu-item');

  if (!sidebar || menuItems.length === 0) {
    return 50;
  }

  const sidebarRect = sidebar.getBoundingClientRect();
  const sidebarHeight = sidebarRect.height;
  const lastItem = menuItems[menuItems.length - 1] as HTMLElement | undefined;
  if (!lastItem) return 50;

  const lastItemRect = lastItem.getBoundingClientRect();
  const lastItemBottom = lastItemRect.bottom - sidebarRect.top;
  const targetPositionPx = lastItemBottom + 55;
  const targetPositionPercent = (targetPositionPx / sidebarHeight) * 100;

  return Math.max(2, Math.min(80, targetPositionPercent));
}

export interface SidebarToggleButtonProps {
  collapsed: boolean;
  onToggle: () => void;
}

export const SidebarToggleButton: React.FC<SidebarToggleButtonProps> = ({ collapsed, onToggle }) => {
  const [buttonPosition, setButtonPosition] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartPosition, setDragStartPosition] = useState(0);

  useEffect(() => {
    const initializePosition = () => {
      const saved = localStorage.getItem('sidebarTogglePosition');

      if (saved) {
        const position = parseFloat(saved);
        setButtonPosition(Math.max(2, Math.min(80, position)));
      } else {
        const initialPos = calculateInitialPosition();
        setButtonPosition(initialPos);
      }
    };

    const timer = setTimeout(initializePosition, 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (buttonPosition === null) return;

    const validatePosition = () => {
      const sidebar = document.querySelector('.custom-sidebar');
      const footer = document.querySelector('.sidebar-footer');
      const menuItems = document.querySelectorAll('.sidebar-menu-item');
      if (!sidebar || !footer) return;

      const sidebarRect = sidebar.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const sidebarHeight = sidebarRect.height;
      const footerTopRelativeToSidebar = footerRect.top - sidebarRect.top;

      const buttonRadius = 18;
      const verticalOffset = 35;
      let minPositionPx = buttonRadius + verticalOffset;
      if (menuItems.length > 0) {
        const lastItem = menuItems[menuItems.length - 1] as HTMLElement;
        if (lastItem) {
          const lastItemRect = lastItem.getBoundingClientRect();
          const lastItemBottom = lastItemRect.bottom - sidebarRect.top;
          const maxCenterPosition = lastItemBottom - buttonRadius + verticalOffset;
          minPositionPx = Math.max(buttonRadius + verticalOffset, maxCenterPosition);
        }
      }

      const safetyMargin = 56 + 80 + 8 + 18;
      const maxPositionPx = footerTopRelativeToSidebar - safetyMargin;
      const minPositionPercent = (minPositionPx / sidebarHeight) * 100;
      const maxPositionPercent = (maxPositionPx / sidebarHeight) * 100;

      setButtonPosition((currentPos) => {
        if (currentPos === null) return null;
        if (currentPos < minPositionPercent) {
          const safePosition = Math.max(minPositionPercent, 2);
          localStorage.setItem('sidebarTogglePosition', safePosition.toString());
          return safePosition;
        }
        if (currentPos > maxPositionPercent) {
          const safePosition = Math.max(2, Math.min(maxPositionPercent, 50));
          localStorage.setItem('sidebarTogglePosition', safePosition.toString());
          return safePosition;
        }
        return currentPos;
      });
    };

    const timer = setTimeout(validatePosition, 100);
    return () => clearTimeout(timer);
  }, [collapsed, buttonPosition]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || buttonPosition === null) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setHasMoved(false);
    setDragStartY(e.clientY);
    setDragStartPosition(buttonPosition);
  };

  useEffect(() => {
    if (!isDragging || buttonPosition === null) return;

    const handleMouseMove = (e: MouseEvent) => {
      const sidebar = document.querySelector('.custom-sidebar');
      const footer = document.querySelector('.sidebar-footer');
      const menuItems = document.querySelectorAll('.sidebar-menu-item');
      if (!sidebar) return;

      const deltaY = Math.abs(e.clientY - dragStartY);
      if (deltaY > 5) {
        setHasMoved(true);
      }

      const sidebarRect = sidebar.getBoundingClientRect();
      const sidebarHeight = sidebarRect.height;
      const deltaYActual = e.clientY - dragStartY;
      const deltaPercent = (deltaYActual / sidebarHeight) * 100;

      const buttonRadius = 18;
      const verticalOffset = 35;
      let minPositionPx = buttonRadius + verticalOffset;
      if (menuItems.length > 0) {
        const lastItem = menuItems[menuItems.length - 1] as HTMLElement;
        if (lastItem) {
          const lastItemRect = lastItem.getBoundingClientRect();
          const lastItemBottom = lastItemRect.bottom - sidebarRect.top;
          const maxCenterPosition = lastItemBottom - buttonRadius + verticalOffset;
          minPositionPx = Math.max(buttonRadius + verticalOffset, maxCenterPosition);
        }
      }

      let maxPositionPx = sidebarHeight - buttonRadius;
      if (footer) {
        const footerRect = footer.getBoundingClientRect();
        const footerTopRelativeToSidebar = footerRect.top - sidebarRect.top;
        const safetyMargin = 56 + 80 + 8 + 18;
        maxPositionPx = Math.min(maxPositionPx, footerTopRelativeToSidebar - safetyMargin);
      }

      const minPositionPercent = (minPositionPx / sidebarHeight) * 100;
      const maxPositionPercent = (maxPositionPx / sidebarHeight) * 100;
      const newPosition = Math.max(minPositionPercent, Math.min(maxPositionPercent, dragStartPosition + deltaPercent));
      setButtonPosition(newPosition);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      if (buttonPosition !== null) {
        localStorage.setItem('sidebarTogglePosition', buttonPosition.toString());
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartY, dragStartPosition, buttonPosition]);

  const handleClick = (e: React.MouseEvent) => {
    if (!hasMoved) {
      onToggle();
    }
  };

  if (buttonPosition === null) {
    return null;
  }

  return (
    <div
      className={`sidebar-edge-toggle ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        top: `${buttonPosition}%`,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          transform: collapsed ? 'translate(-50%, -50%) rotate(180deg)' : 'translate(-50%, -50%) rotate(0deg)',
          transition: 'transform 0.2s ease',
          display: 'block',
          pointerEvents: 'none',
        }}
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 8 8 12 12 16" />
        <line x1="16" y1="12" x2="8" y2="12" />
      </svg>
    </div>
  );
};

SidebarToggleButton.displayName = 'SidebarToggleButton';
