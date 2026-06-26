import React from 'react';
import ReactDOM from 'react-dom';

/** Logout confirm: portal to body. Stable props avoid duplicate portals on parent re-render. */
export const LogoutConfirmModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}> = React.memo(({ open, onClose, onConfirm }) => {
  if (!open) return null;
  if (typeof document === 'undefined' || !document.body) return null;

  const content = (
    <div
      className="logout-confirm-bubble"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="logout-confirm-content" onClick={(e) => e.stopPropagation()}>
        <div className="logout-confirm-header">
          <h3>Confirm Logout</h3>
        </div>
        <div className="logout-confirm-body">
          <p>Are you sure you want to logout? You will need to login again to access your account.</p>
        </div>
        <div className="logout-confirm-footer">
          <button type="button" className="logout-confirm-btn cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="logout-confirm-btn logout-btn"
            onClick={onConfirm}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
});

LogoutConfirmModal.displayName = 'LogoutConfirmModal';
