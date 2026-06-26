import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BsBoxFill, BsChevronDown } from 'react-icons/bs';
import { useUser } from '../contexts/UserContext';
import {
  getOrganizations,
  Organization,
  setSelectedTeamIdForScope,
  TEAM_SCOPE_STORAGE_ID,
  TEAM_SCOPE_STORAGE_NAME,
  clearTeamScopeStorage,
} from '../services/api';

const extractOrganizationName = (email: string): string => {
  if (!email || !email.includes('@')) return 'Unknown';
  const domain = email.split('@')[1];
  const domainParts = domain.split('.');
  if (domainParts.length > 0) {
    const mainPart = domainParts[0];
    return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
  }
  return domain;
};

const getTeamType = (role: string): string => {
  if (role === 'Pro User' || role === 'Super Admin') return 'Authenticated Team';
  return 'None Team';
};

export const TeamSwitcher: React.FC<{
  collapsed: boolean;
  onExpandSidebar: () => void;
  /** Docs header: show Team, hide chevron; whole block exits docs */
  docsHeaderExitMode?: boolean;
  onDocsHeaderExit?: () => void;
}> = React.memo(({ collapsed, onExpandSidebar, docsHeaderExitMode, onDocsHeaderExit }) => {
  const { userProfile } = useUser();
  const [open, setOpen] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<string | null>(null);
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isSuperAdmin = userProfile?.role === 'Super Admin';

  const organizationName = isSuperAdmin
    ? 'Super Admin'
    : (userProfile?.primary_team?.name || (userProfile?.email ? extractOrganizationName(userProfile.email) : 'Unknown'));
  const teamType = isSuperAdmin
    ? 'None Team'
    : (userProfile?.primary_team?.teamType || (userProfile?.role ? getTeamType(userProfile.role) : 'None Team'));

  const currentOrgName = selectedOrganization || organizationName;

  const getCurrentOrgTeamType = () => {
    if (isSuperAdmin && selectedOrganization) {
      const org = allOrganizations.find(o => o.name === selectedOrganization);
      return org?.teamType || 'None Team';
    }
    if (isSuperAdmin) return 'None Team';
    return teamType;
  };
  const currentSubtitle = getCurrentOrgTeamType();

  const dropdownOrganizations = useMemo(() => {
    if (!isSuperAdmin || !open) return allOrganizations;
    const current = selectedOrganization || organizationName;
    const hasSuperAdmin = allOrganizations.some((o) => o.name === 'Super Admin');
    const currentInList = allOrganizations.some((o) => o.name === current);
    const prepend: Organization[] = [];
    if (!hasSuperAdmin) {
      prepend.push({ id: 'fallback-super-admin', name: 'Super Admin', teamType: 'None Team' });
    }
    if (!currentInList && current && current !== 'Super Admin') {
      prepend.push({
        id: 'current-selection',
        name: current,
        teamType: current === 'Super Admin' ? 'None Team' : 'Authenticated Team'
      });
    }
    if (prepend.length === 0) return allOrganizations;
    return [...prepend, ...allOrganizations];
    // Avoid allOrganizations dep to prevent rebuild OOM from setAllOrganizations
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, open, selectedOrganization, organizationName]);

  const organizationsLoadedRef = useRef(false);
  const lastIsSuperAdminRef = useRef<boolean>(false);
  const organizationsRequestLockRef = useRef(false);

  useEffect(() => {
    if (isSuperAdmin === lastIsSuperAdminRef.current && organizationsLoadedRef.current) return;
    if (organizationsRequestLockRef.current) return;
    lastIsSuperAdminRef.current = isSuperAdmin;

    if (!isSuperAdmin) {
      if (userProfile != null && userProfile.role !== 'Super Admin') {
        setAllOrganizations([]);
        clearTeamScopeStorage();
        organizationsLoadedRef.current = false;
      }
      return;
    }
    if (organizationsLoadedRef.current && allOrganizations.length > 0) return;
    if (loadingOrganizations) return;

    organizationsRequestLockRef.current = true;
    setLoadingOrganizations(true);
    getOrganizations()
      .then(orgs => {
        setAllOrganizations(orgs);
        organizationsLoadedRef.current = true;
        // Restore pre-refresh Team selection over default org
        let restored = false;
        if (typeof sessionStorage !== 'undefined') {
          try {
            const savedId = sessionStorage.getItem(TEAM_SCOPE_STORAGE_ID);
            const savedName = sessionStorage.getItem(TEAM_SCOPE_STORAGE_NAME);
            if (savedId && orgs.some((o) => o.id === savedId)) {
              setSelectedOrganization(savedName || orgs.find((o) => o.id === savedId)?.name || organizationName);
              setSelectedTeamIdForScope(savedId);
              restored = true;
            }
          } catch {
            /* ignore */
          }
        }
        if (!restored && !selectedOrganization) {
          setSelectedOrganization(organizationName);
          const defaultOrg = orgs.find((o) => o.name === organizationName);
          setSelectedTeamIdForScope(defaultOrg?.id ?? null);
        }
      })
      .catch(() => { organizationsLoadedRef.current = false; })
      .finally(() => {
        setLoadingOrganizations(false);
        organizationsRequestLockRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, userProfile?.role]);

  // Restore sidebar Team name after refresh
  useEffect(() => {
    if (!isSuperAdmin || typeof sessionStorage === 'undefined') return;
    try {
      const name = sessionStorage.getItem(TEAM_SCOPE_STORAGE_NAME);
      const id = sessionStorage.getItem(TEAM_SCOPE_STORAGE_ID);
      if (name && id) setSelectedOrganization(name);
    } catch {
      /* ignore */
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin || selectedOrganization || allOrganizations.length === 0) return;
    setSelectedOrganization('Super Admin');
    const superAdminOrg = allOrganizations.find((o) => o.name === 'Super Admin');
    setSelectedTeamIdForScope(superAdminOrg?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, selectedOrganization, allOrganizations.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (collapsed && open) setOpen(false);
  }, [collapsed, open]);

  useEffect(() => {
    if (!open || !isSuperAdmin || organizationsRequestLockRef.current) return;
    if (allOrganizations.length > 0) return;
    organizationsRequestLockRef.current = true;
    getOrganizations()
      .then(orgs => {
        setAllOrganizations(orgs);
        organizationsLoadedRef.current = true;
      })
      .catch(() => { organizationsLoadedRef.current = false; })
      .finally(() => { organizationsRequestLockRef.current = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isSuperAdmin]);

  const handleClick = () => {
    if (docsHeaderExitMode) {
      onDocsHeaderExit?.();
      return;
    }
    if (collapsed) {
      onExpandSidebar();
      setTimeout(() => setOpen(true), 300);
    } else {
      setOpen(!open);
    }
  };

  return (
    <div className="team-switcher-container" ref={dropdownRef}>
      <div
        className={`team-switcher-trigger ${open ? 'active' : ''} ${collapsed ? 'collapsed' : ''} ${docsHeaderExitMode ? 'team-switcher-trigger--docs-exit' : ''}`}
        onClick={handleClick}
        role={docsHeaderExitMode ? 'button' : undefined}
        title={docsHeaderExitMode ? '返回应用' : undefined}
        aria-label={docsHeaderExitMode ? '返回应用' : undefined}
      >
        <div className="team-icon">
          <BsBoxFill />
        </div>
        {!collapsed && (
          <>
            <div className="team-info">
              <span className="team-name">{currentOrgName}</span>
              <span className="team-type">{currentSubtitle}</span>
            </div>
            {!docsHeaderExitMode ? (
              <BsChevronDown className={`team-arrow ${open ? 'open' : ''}`} />
            ) : null}
          </>
        )}
      </div>

      {open && !docsHeaderExitMode && (
        <div className={`team-switcher-dropdown ${collapsed ? 'collapsed' : ''}`}>
          <div className="team-dropdown-header">
            <span>Team</span>
          </div>
          {isSuperAdmin ? (
            <>
              {loadingOrganizations ? (
                <div className="team-dropdown-item">
                  <span>Loading...</span>
                </div>
              ) : (
                dropdownOrganizations.map((org) => {
                  const isSelected = (selectedOrganization || organizationName) === org.name;
                  return (
                    <div
                      key={org.id}
                      className={`team-dropdown-item ${isSelected ? 'active current-no-action' : ''}`}
                      onClick={() => {
                        if (isSelected) {
                          setOpen(false);
                          return;
                        }
                        setSelectedOrganization(org.name);
                        const isPlaceholder = org.id === 'fallback-super-admin' || org.id === 'current-selection';
                        if (isPlaceholder) {
                          try {
                            sessionStorage.removeItem(TEAM_SCOPE_STORAGE_ID);
                            sessionStorage.removeItem(TEAM_SCOPE_STORAGE_NAME);
                          } catch {
                            /* ignore */
                          }
                          setSelectedTeamIdForScope(null);
                        } else {
                          try {
                            sessionStorage.setItem(TEAM_SCOPE_STORAGE_ID, org.id);
                            sessionStorage.setItem(TEAM_SCOPE_STORAGE_NAME, org.name);
                          } catch {
                            /* ignore */
                          }
                          setSelectedTeamIdForScope(org.id);
                        }
                        setOpen(false);
                        if (typeof window !== 'undefined') {
                          try {
                            sessionStorage.setItem('dashboard_force_refresh_ts', String(Date.now()));
                          } catch {
                            /* ignore */
                          }
                          window.location.reload();
                        }
                      }}
                    >
                      <div className="team-item-icon">
                        <BsBoxFill />
                      </div>
                      {!collapsed && (
                        <>
                          <div className="team-item-info">
                            <span className="team-item-name">{org.name}</span>
                            <span className="team-item-type">{org.teamType}</span>
                          </div>
                          {isSelected && (
                            <div className="team-item-check">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </>
          ) : (
            <div className="team-dropdown-item active" onClick={() => setOpen(false)}>
              <div className="team-item-icon">
                <BsBoxFill />
              </div>
              {!collapsed && (
                <>
                  <div className="team-item-info">
                    <span className="team-item-name">{organizationName}</span>
                    <span className="team-item-type">{teamType}</span>
                  </div>
                  <div className="team-item-check">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

TeamSwitcher.displayName = 'TeamSwitcher';
