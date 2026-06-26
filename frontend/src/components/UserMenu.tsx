import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BsPerson, BsPersonGear, BsBoxArrowInRight } from 'react-icons/bs';
import { LogoutConfirmModal } from './LogoutConfirmModal';

export interface UserMenuProps {
  collapsed: boolean;
  userProfile: { username?: string; role?: string; avatar?: string } | null;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = React.memo(({ collapsed, userProfile, onNavigate, onLogout }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleCloseLogoutConfirm = useCallback(() => setLogoutConfirmOpen(false), []);
  const handleConfirmLogout = useCallback(() => {
    setLogoutConfirmOpen(false);
    setTimeout(() => onLogout(), 200);
  }, [onLogout]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && logoutConfirmOpen) setLogoutConfirmOpen(false);
    };
    if (logoutConfirmOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [logoutConfirmOpen]);

  return (
    <div className="user-menu-container" ref={menuRef}>
      <div
        className={`user-menu-trigger ${menuOpen ? 'active' : ''}`}
        onClick={() => setMenuOpen(!menuOpen)}
        title={collapsed ? (userProfile?.username || 'User') : undefined}
      >
        <div className="user-avatar">
          {userProfile?.avatar ? (
            <img src={userProfile.avatar} alt="Avatar" />
          ) : (
            <BsPerson className="default-avatar-icon" />
          )}
        </div>
        {!collapsed && (
          <div className="user-info">
            <span className="user-name">{userProfile?.username || 'User'}</span>
            <span className="user-role">{userProfile?.role || 'Authenticated User'}</span>
          </div>
        )}
      </div>

      {menuOpen && (
        <div className={`user-menu-dropdown ${collapsed ? 'collapsed' : ''}`}>
          <div
            className="user-menu-item account-item"
            onClick={() => {
              onNavigate('/account');
              setMenuOpen(false);
            }}
            title={collapsed ? 'Account' : undefined}
          >
            <BsPersonGear className="menu-item-icon" />
            {!collapsed && <span>Account</span>}
          </div>
          <div className="user-menu-divider" />
          <div
            className="user-menu-item logout"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              setTimeout(() => setLogoutConfirmOpen(true), 100);
            }}
            title={collapsed ? 'Logout' : undefined}
          >
            <BsBoxArrowInRight className="menu-item-icon" />
            {!collapsed && <span>Logout</span>}
          </div>
        </div>
      )}

      <LogoutConfirmModal
        open={logoutConfirmOpen}
        onClose={handleCloseLogoutConfirm}
        onConfirm={handleConfirmLogout}
      />
    </div>
  );
});

UserMenu.displayName = 'UserMenu';
