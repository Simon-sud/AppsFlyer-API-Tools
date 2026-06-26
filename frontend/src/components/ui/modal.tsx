import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';

interface ModalProps {
  open: boolean;
  onCancel: () => void;
  title?: React.ReactNode;
  footer?: React.ReactNode | null;
  children: React.ReactNode;
  style?: React.CSSProperties;
  styles?: {
    body?: React.CSSProperties;
  };
  width?: number | string;
  className?: string;
  /** Legacy: submit via footer; do not pass to DOM */
  onOk?: () => void;
  [key: string]: any; // Other props e.g. data-* attributes
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onCancel,
  title,
  footer,
  children,
  style,
  styles,
  width = 520,
  className = '',
  onOk: _onOk,
  ...restProps
}) => {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return createPortal(
    <>
      <div
        className="modal-overlay"
        onClick={handleOverlayClick}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          zIndex: 1500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
      <div
        className={`modal-wrapper ${className}`}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1501,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          className="modal-content"
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            width: typeof width === 'number' ? `${width}px` : width,
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            pointerEvents: 'auto',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            animation: 'slideInBubble 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            /* GPU layer to reduce inner layout shift */
            transform: 'translateZ(0)',
            willChange: 'transform, opacity',
            ...style,
          }}
          onClick={(e) => e.stopPropagation()}
          {...restProps}
        >
          {title && (
            <div
              className="modal-header"
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
                fontSize: '16px',
                fontWeight: 500,
                color: 'rgba(0, 0, 0, 0.85)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
              }}
            >
              <span style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
              }}>{title}</span>
              <button
                type="button"
                className="modal-close-btn"
                onClick={onCancel}
                aria-label="Close"
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                }}
              >
                {/* SVG close icon: glyph metrics avoid hover box mis-centering */}
                <svg
                  className="modal-close-btn__icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                  focusable="false"
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </button>
            </div>
          )}
          <div
            className="modal-body"
            style={{
              padding: '24px',
              fontSize: '14px',
              lineHeight: '1.6',
              color: 'rgb(34, 13, 78)',
              ...styles?.body,
            }}
          >
            {children}
          </div>
          {footer !== null && (
            <div
              className="modal-footer"
              style={{
                padding: '10px 16px',
                borderTop: '1px solid rgba(0, 0, 0, 0.06)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
              }}
            >
              {footer || (
                <>
                  <Button variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <style>
        {`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
          
          @keyframes zoomIn {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          
          @keyframes slideInBubble {
            from {
              opacity: 0;
              transform: translateY(-10px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          .modal-close-btn {
            box-sizing: border-box;
            width: 32px;
            height: 32px;
            min-width: 32px;
            min-height: 32px;
            margin: 0;
            padding: 0;
            flex-shrink: 0;
            align-self: center;
            border: none;
            border-radius: 8px;
            background: transparent;
            cursor: pointer;
            color: rgba(0, 0, 0, 0.45);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            line-height: 0;
            font-size: 0;
            appearance: none;
            -webkit-appearance: none;
            transition: background-color 0.15s ease, color 0.15s ease;
          }

          .modal-close-btn__icon {
            display: block;
            flex-shrink: 0;
          }

          .modal-close-btn:hover {
            background-color: rgba(0, 0, 0, 0.06);
            color: rgba(0, 0, 0, 0.78);
          }
          
          /* Disable selection on modal header/footer */
          .modal-header,
          .modal-header *,
          .modal-footer,
          .modal-footer * {
            user-select: none !important;
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
          }
          
          /* Disable selection on body; inputs still selectable */
          .modal-body {
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
          }
          
          /* Inputs and textareas selectable */
          .modal-body input,
          .modal-body input[type="text"],
          .modal-body input[type="password"],
          .modal-body input[type="email"],
          .modal-body input[type="number"],
          .modal-body textarea,
          .modal-body [role="textbox"] {
            user-select: text !important;
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
          }
          
          /* Input selection styling (incl. custom components) */
          .modal-body input::selection,
          .modal-body textarea::selection {
            background-color: rgba(114, 46, 209, 0.2);
          }
          
          /* Custom Input / PasswordInput selectable */
          .modal-body [class*="input"],
          .modal-body [data-input],
          .modal-body input[readonly] {
            user-select: text !important;
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
          }
          
          /* Force light theme inside modal (reset CSS vars) */
          .modal-content,
          .modal-content * {
            --background: 0 0% 100% !important;
            --foreground: 240 10% 3.9% !important;
            --card: 0 0% 100% !important;
            --card-foreground: 240 10% 3.9% !important;
            --popover: 0 0% 100% !important;
            --popover-foreground: 240 10% 3.9% !important;
            --primary: 240 5.9% 10% !important;
            --primary-foreground: 0 0% 98% !important;
            --secondary: 240 4.8% 95.9% !important;
            --secondary-foreground: 240 5.9% 10% !important;
            --muted: 240 4.8% 95.9% !important;
            --muted-foreground: 240 3.8% 46.1% !important;
            --accent: 240 4.8% 95.9% !important;
            --accent-foreground: 240 5.9% 10% !important;
            --destructive: 0 84.2% 60.2% !important;
            --destructive-foreground: 0 0% 98% !important;
            --border: 240 5.9% 90% !important;
            --input: 240 5.9% 90% !important;
            --ring: 240 5.9% 10% !important;
          }
          
          /* Buttons use light theme */
          .modal-content button[class*="bg-primary"],
          .modal-content [class*="bg-primary"] {
            background-color: hsl(240 5.9% 10%) !important;
            color: hsl(0 0% 98%) !important;
          }
          
          .modal-content button[class*="bg-secondary"],
          .modal-content [class*="bg-secondary"] {
            background-color: hsl(240 4.8% 95.9%) !important;
            color: hsl(240 5.9% 10%) !important;
          }
          
          .modal-content button[class*="border-input"],
          .modal-content [class*="border-input"] {
            border-color: hsl(240 5.9% 90%) !important;
          }
          
          /* Text colors */
          .modal-content [class*="text-foreground"],
          .modal-content [class*="text-primary"] {
            color: hsl(240 10% 3.9%) !important;
          }
          
          .modal-content [class*="text-muted-foreground"] {
            color: hsl(240 3.8% 46.1%) !important;
          }
          
          /* Fix placeholder jump in modal inputs */
          .modal-content input::placeholder,
          .modal-content input::-webkit-input-placeholder,
          .modal-content input::-moz-placeholder,
          .modal-content input:-ms-input-placeholder {
            font-family: "Inter", "SF Pro Display", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif !important;
            font-weight: 400 !important;
            font-size: 14px !important;
            color: rgb(150, 150, 150) !important;
            opacity: 0.8 !important;
            line-height: 1.5 !important;
            -webkit-font-smoothing: antialiased !important;
            -moz-osx-font-smoothing: grayscale !important;
            text-rendering: optimizeLegibility !important;
            /* Avoid layout shift from font load */
            font-display: swap !important;
            /* Render placeholder when modal opens */
            will-change: auto !important;
            transform: translateZ(0) !important;
          }
          
          /* Input stable during modal animation */
          .modal-content input {
            /* Avoid animation affecting text render */
            transform: translateZ(0) !important;
            backface-visibility: hidden !important;
            -webkit-backface-visibility: hidden !important;
            /* Stable during modal animation */
            will-change: auto !important;
            /* Avoid font-load reflow */
            font-display: swap !important;
            /* Stable input content during animation */
            contain: layout style paint !important;
          }
          
          /* After animation: drop render-affecting props */
          .modal-content[style*="animation"] {
            /* Keep inner elements stable */
          }
          
          /* Placeholder styles apply immediately on open */
          .modal-content input::placeholder {
            /* Apply immediately */
            transition: none !important;
          }
          
          /* Switch light theme inside modal */
          /* Switch root — class and attribute selectors */
          .modal-content button[role="switch"],
          .modal-content [role="switch"],
          .modal-content button[class*="peer"][class*="inline-flex"],
          .modal-content [class*="peer"][class*="inline-flex"] {
            background-color: rgb(226, 232, 240) !important; /* slate-200 unchecked */
          }
          
          .modal-content button[role="switch"][data-state="checked"],
          .modal-content [role="switch"][data-state="checked"],
          .modal-content button[class*="peer"][class*="inline-flex"][data-state="checked"],
          .modal-content [class*="peer"][class*="inline-flex"][data-state="checked"] {
            background-color: rgb(15, 23, 42) !important; /* slate-900 checked */
          }
          
          .modal-content button[role="switch"][data-state="unchecked"],
          .modal-content [role="switch"][data-state="unchecked"],
          .modal-content button[class*="peer"][class*="inline-flex"][data-state="unchecked"],
          .modal-content [class*="peer"][class*="inline-flex"][data-state="unchecked"] {
            background-color: rgb(226, 232, 240) !important; /* slate-200 unchecked */
          }
          
          /* Switch thumb — round knob */
          .modal-content button[role="switch"] > span,
          .modal-content [role="switch"] > span,
          .modal-content button[role="switch"] span[class*="block"],
          .modal-content [role="switch"] span[class*="block"],
          .modal-content button[class*="peer"] > span,
          .modal-content [class*="peer"] > span {
            background-color: white !important;
          }
          
          /* Override dark mode classes */
          .modal-content button[role="switch"].dark:data-[state=checked]:bg-slate-50,
          .modal-content [role="switch"].dark:data-[state=checked]:bg-slate-50,
          .modal-content button[role="switch"].dark:data-[state=unchecked]:bg-slate-800,
          .modal-content [role="switch"].dark:data-[state=unchecked]:bg-slate-800 {
            /* Dark classes overridden above */
          }
          
          .modal-content button[role="switch"] span.dark:bg-slate-950,
          .modal-content [role="switch"] span.dark:bg-slate-950 {
            background-color: white !important;
          }
        `}
      </style>
    </>,
    document.body
  );
};

