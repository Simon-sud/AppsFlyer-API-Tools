import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount } from '../contexts/AccountContext';
import { axiosInstance, autopipeAxiosInstance } from '../services/api';
import { message } from '../components/ui/toast';
import { HelpCircle } from 'lucide-react';
import { VscSymbolKeyword } from 'react-icons/vsc';
import { MdDownloading, MdDataSaverOn, MdDonutLarge } from 'react-icons/md';
import { BsRepeat1, Bs1Square, BsKeyFill } from 'react-icons/bs';
import { RiFileCopyLine, RiCheckLine, RiRefreshLine } from 'react-icons/ri';
import './DispatchAccess.css';

interface AutoPipeTaskItem {
  id: string;
  task_id: string;
  account_id: string;
  type?: string;
  status?: string;
  execution_date?: string;
  execution_time?: string;
  data_pointer?: string;
  progress?: number;
  create_time?: string;
  start_time?: string;
  latest_update_time?: string;
  api_token?: string | null;
  token_request_count?: number;
  token_last_used_at?: string | null;
  token_created_at?: string | null;
  apps?: Array<{
    app_id: string;
    app_name: string;
    icon_url?: string;
  os?: string;
  }>;
}

/** The same time description as the AutoPipe task card Duration&Mode bubble */
function getTaskTimeInfo(task: AutoPipeTaskItem): {
  type: 'Daily Execution' | 'Single Execution';
  date: string;
} {
  const dataPointer = task.data_pointer || 'Daily Execution';
  if (dataPointer === 'Daily Execution') {
    if (task.execution_time) {
      return { type: 'Daily Execution', date: task.execution_time };
    }
    const createTime = task.create_time ? new Date(task.create_time.replace(' ', 'T')) : new Date();
    const timeString = createTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return { type: 'Daily Execution', date: timeString };
  }
  if (task.execution_date) {
    return { type: 'Single Execution', date: task.execution_date };
  }
  const taskStartDate = task.start_time ? new Date(task.start_time.replace(' ', 'T')) : new Date();
  const formattedDate = taskStartDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return { type: 'Single Execution', date: formattedDate };
}

function shanghaiYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function shanghaiStartOfTodayMs(): number {
  const ymd = shanghaiYmd();
  return Date.parse(`${ymd}T00:00:00+08:00`);
}

function shanghaiTodayScheduledMs(executionTime: string): number | null {
  const parts = executionTime.trim().split(':').map((x) => parseInt(x, 10));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  const h = parts[0];
  const m = parts[1];
  const s = parts[2] ?? 0;
  const ymd = shanghaiYmd();
  return Date.parse(
    `${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}+08:00`,
  );
}

/** Daily has not been completed on the same day: based on the progress ratio from 0:00 Beijing time on the day to the planned execution time */
function dailyScheduleWidthPct(executionTime?: string | null): number {
  if (!executionTime) return 36;
  const start = shanghaiStartOfTodayMs();
  const sched = shanghaiTodayScheduledMs(executionTime);
  if (sched == null || sched <= start) return 44;
  const now = Date.now();
  if (now >= sched) return 92;
  const pct = ((now - start) / (sched - start)) * 100;
  return Math.min(91, Math.max(10, pct));
}

function getExecutionBar(task: AutoPipeTaskItem): { width: number; variant: 'green' | 'blue' | 'red' } {
  const s = (task.status || '').toLowerCase();
  if (s === 'warning' || s === 'paused') {
    return { width: 50, variant: 'red' };
  }
  const dp = task.data_pointer || 'Daily Execution';
  const p = Number(task.progress ?? 0);

  if (p >= 100 || s === 'completed') {
    return { width: 100, variant: 'green' };
  }

  if (s === 'running' && p > 0 && p < 100) {
    return { width: Math.min(98, Math.max(6, p)), variant: 'blue' };
  }

  if (dp === 'Daily Execution') {
    return { width: dailyScheduleWidthPct(task.execution_time), variant: 'blue' };
  }

  return { width: Math.min(95, Math.max(8, p || 12)), variant: 'blue' };
}

const writeClipboardSilently = async (text: string): Promise<boolean> => {
  try {
    if (!text || !text.trim()) return false;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
    } catch {
    return false;
  }
};

interface AutoPipeTasksResponse {
  data?: AutoPipeTaskItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface TokenStatsResponse {
  data?: {
    task_id?: string;
    api_token?: string | null;
    has_token?: boolean;
    token_request_count?: number;
    token_last_used_at?: string | null;
    token_created_at?: string | null;
  };
}

/** POST /api/autopipe/tasks/:id/token response body (consistent with Go generateTaskTokenHandler) */
interface GenerateTaskTokenResponse {
  success?: boolean;
  data?: {
    task_id?: string;
    api_token?: string;
    token_request_count?: number;
    token_last_used_at?: string | null;
    token_created_at?: string | null;
  };
}

/** A shimmer consistent with the Home / datagrid skeleton screen (the animation name skeleton-shimmer comes from the global datagrid.css) */
const DISPATCH_TABLE_SKELETON_ROWS = 8;

const DispatchAccess: React.FC = () => {
  const { accountConfigs } = useAccount();
  const [autopipeLoading, setAutopipeLoading] = useState(false);
  const [createByAutoPipeLoadingId, setCreateByAutoPipeLoadingId] = useState<string | null>(null);
  const [autopipeTasks, setAutopipeTasks] = useState<AutoPipeTaskItem[]>([]);
  const [filterOptionTasks, setFilterOptionTasks] = useState<AutoPipeTaskItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearchText, setDebouncedSearchText] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [groupByAccountId, setGroupByAccountId] = useState('all');
  const [groupByType, setGroupByType] = useState('all');
  const [activeHeaderFilter, setActiveHeaderFilter] = useState<'account' | 'type' | null>(null);
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);
  const [tokenBubbleTaskId, setTokenBubbleTaskId] = useState<string | null>(null);
  const [copyingTokenTaskId, setCopyingTokenTaskId] = useState<string | null>(null);
  const [copiedTokenTaskId, setCopiedTokenTaskId] = useState<string | null>(null);
  const [searchAllTasksLoading, setSearchAllTasksLoading] = useState(false);
  const [searchAllTasks, setSearchAllTasks] = useState<AutoPipeTaskItem[]>([]);
  const [regenerateConfirmTaskId, setRegenerateConfirmTaskId] = useState<string | null>(null);
  const [regenerateLoadingId, setRegenerateLoadingId] = useState<string | null>(null);

  const accountMetaMap = useMemo(() => {
    const m: Record<string, { name: string; type: string; icon?: string }> = {};
    accountConfigs.forEach((a) => {
      m[a.id] = { name: a.account_name, type: a.account_type, icon: a.custom_icon };
    });
    return m;
  }, [accountConfigs]);

  const refreshAutoPipeTasks = useCallback(async () => {
    setAutopipeLoading(true);
    try {
      const query = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
      });
      if (groupByAccountId !== 'all') query.set('accountId', groupByAccountId);
      if (groupByType !== 'all') query.set('type', groupByType);
      const resp = await autopipeAxiosInstance.get<AutoPipeTasksResponse>(`/api/autopipe/tasks?${query.toString()}`);
      setAutopipeTasks(Array.isArray(resp.data?.data) ? resp.data.data : []);
      const nextTotalPages = Math.max(1, Number(resp.data?.pagination?.totalPages || 1));
      const nextTotal = Number(resp.data?.pagination?.total || 0);
      setTotalPages(nextTotalPages);
      setTotalItems(nextTotal);
      if (currentPage > nextTotalPages) {
        setCurrentPage(nextTotalPages);
      }
    } catch {
      setAutopipeTasks([]);
      setTotalPages(1);
      setTotalItems(0);
      message.warning('Failed to load AutoPipe tasks.');
    } finally {
      setAutopipeLoading(false);
    }
  }, [currentPage, pageSize, groupByAccountId, groupByType]);

  const fetchAllAutoPipeTasksForSearch = useCallback(async (): Promise<AutoPipeTaskItem[]> => {
    const optionPageSize = 100;
    const query = new URLSearchParams({
      page: '1',
      pageSize: String(optionPageSize),
    });
    if (groupByAccountId !== 'all') query.set('accountId', groupByAccountId);
    if (groupByType !== 'all') query.set('type', groupByType);

    const firstResp = await autopipeAxiosInstance.get<AutoPipeTasksResponse>(`/api/autopipe/tasks?${query.toString()}`);
    const firstData = Array.isArray(firstResp.data?.data) ? firstResp.data.data : [];
    const totalPagesForSearch = Math.max(1, Number(firstResp.data?.pagination?.totalPages || 1));

    if (totalPagesForSearch <= 1) return firstData;

    const restPageIndexes = Array.from({ length: totalPagesForSearch - 1 }, (_, i) => i + 2);
    const merged: AutoPipeTaskItem[] = [...firstData];

    for (const p of restPageIndexes) {
      const qp = new URLSearchParams(query.toString());
      qp.set('page', String(p));
      const resp = await autopipeAxiosInstance.get<AutoPipeTasksResponse>(`/api/autopipe/tasks?${qp.toString()}`);
      const rows = Array.isArray(resp.data?.data) ? resp.data.data : [];
      merged.push(...rows);
    }

    return merged;
  }, [groupByAccountId, groupByType]);

  // Search input anti-shake: prevent every character from triggering full pull and re-pagination
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearchText(searchText), 300);
    return () => window.clearTimeout(t);
  }, [searchText]);

  const refreshFilterOptionTasks = useCallback(async () => {
    try {
      const optionPageSize = 100;
      const firstResp = await autopipeAxiosInstance.get<AutoPipeTasksResponse>(
        `/api/autopipe/tasks?page=1&pageSize=${optionPageSize}`,
      );
      const firstPageData = Array.isArray(firstResp.data?.data) ? firstResp.data.data : [];
      const totalPagesForOptions = Math.max(1, Number(firstResp.data?.pagination?.totalPages || 1));

      if (totalPagesForOptions <= 1) {
        setFilterOptionTasks(firstPageData);
        return;
      }

      const restPageIndexes = Array.from({ length: totalPagesForOptions - 1 }, (_, i) => i + 2);
      const restResponses = await Promise.all(
        restPageIndexes.map((p) =>
          autopipeAxiosInstance.get<AutoPipeTasksResponse>(`/api/autopipe/tasks?page=${p}&pageSize=${optionPageSize}`),
        ),
      );
      const merged = [...firstPageData];
      restResponses.forEach((resp) => {
        const rows = Array.isArray(resp.data?.data) ? resp.data.data : [];
        merged.push(...rows);
      });
      setFilterOptionTasks(merged);
    } catch {
      // It only affects the source of filter items and does not affect the rendering of the main table.
      setFilterOptionTasks([]);
    }
  }, []);

  const applyImportedTokenToLists = (
    taskId: string,
    tokenFields: {
      api_token: string;
      token_request_count: number;
      token_last_used_at: string | null;
      token_created_at: string | null;
    },
  ) => {
    const mapRow = (prev: AutoPipeTaskItem[]) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              api_token: tokenFields.api_token,
              token_request_count: tokenFields.token_request_count,
              token_last_used_at: tokenFields.token_last_used_at,
              token_created_at: tokenFields.token_created_at,
            }
          : t,
      );
    setAutopipeTasks(mapRow);
    setSearchAllTasks(mapRow);
  };

  const executeRegenerateToken = async (task: AutoPipeTaskItem) => {
    setRegenerateLoadingId(task.id);
    try {
      const tokenResp = await autopipeAxiosInstance.post<GenerateTaskTokenResponse>(
        `/api/autopipe/tasks/${task.id}/token`,
      );
      const td = tokenResp.data?.data;
      if (td?.api_token) {
        applyImportedTokenToLists(task.id, {
          api_token: td.api_token,
          token_request_count: Number(td.token_request_count ?? 0),
          token_last_used_at: (td.token_last_used_at as string | null) ?? null,
          token_created_at: (td.token_created_at as string | null) ?? null,
        });
      }
      setRegenerateConfirmTaskId(null);
      setTokenBubbleTaskId((prev) => (prev === task.id ? null : prev));
      message.success('Token regenerated. The previous token is no longer valid.');
      await refreshAutoPipeTasks();
    } catch {
      message.error('Failed to regenerate token.');
    } finally {
      setRegenerateLoadingId(null);
    }
  };

  const createTaskFromAutoPipe = async (task: AutoPipeTaskItem) => {
    setCreateByAutoPipeLoadingId(task.id);
    try {
      await axiosInstance.post('/api/dispatch/tasks', {
        source: 'autopipe',
        autopipe_task_id: task.id,
      });
      const tokenResp = await autopipeAxiosInstance.post<GenerateTaskTokenResponse>(
        `/api/autopipe/tasks/${task.id}/token`,
      );
      const td = tokenResp.data?.data;
      if (td?.api_token) {
        applyImportedTokenToLists(task.id, {
          api_token: td.api_token,
          token_request_count: Number(td.token_request_count ?? 0),
          token_last_used_at: (td.token_last_used_at as string | null) ?? null,
          token_created_at: (td.token_created_at as string | null) ?? null,
        });
      }
      message.success('Dispatch task created from AutoPipe.');
      await refreshAutoPipeTasks();
    } catch {
      message.error('Create by AutoPipe failed. Please connect backend dispatch API.');
    } finally {
      setCreateByAutoPipeLoadingId(null);
    }
  };

  const openTokenBubble = async (task: AutoPipeTaskItem) => {
    setTokenBubbleTaskId(task.id);
    try {
      const resp = await autopipeAxiosInstance.get<TokenStatsResponse>(`/api/autopipe/tasks/${task.id}/token/stats`);
      const stats = resp.data?.data || {};
      setAutopipeTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                api_token: stats.api_token ?? t.api_token ?? null,
                token_request_count: Number(stats.token_request_count ?? t.token_request_count ?? 0),
                token_last_used_at: stats.token_last_used_at ?? t.token_last_used_at ?? null,
                token_created_at: stats.token_created_at ?? t.token_created_at ?? null,
              }
            : t,
        ),
      );
    } catch {
      // keep bubble open with current cached values
    }
  };

  const copyToken = async (task: AutoPipeTaskItem) => {
    if (!task.api_token) return;
    setCopyingTokenTaskId(task.id);
    try {
      const ok = await writeClipboardSilently(task.api_token);
      if (ok) {
        setCopiedTokenTaskId(task.id);
        setTimeout(() => {
          setCopiedTokenTaskId((prev) => (prev === task.id ? null : prev));
        }, 1200);
      } else {
        setCopiedTokenTaskId(null);
      }
    } catch {
      setCopiedTokenTaskId(null);
    } finally {
      setTimeout(() => setCopyingTokenTaskId((prev) => (prev === task.id ? null : prev)), 350);
    }
  };

  const searchKeyword = useMemo(() => debouncedSearchText.trim().toLowerCase(), [debouncedSearchText]);
  const isSearchMode = searchKeyword.length > 0;
  const isAnyLoading = autopipeLoading || searchAllTasksLoading;

  const searchFilteredTasks = useMemo(() => {
    if (!isSearchMode) return [];
    const keyword = searchKeyword;
    return searchAllTasks.filter((task) => {
      const accountName = accountMetaMap[task.account_id]?.name || '';
      const execution = task.execution_date || task.execution_time || '';
      const mode = (task.data_pointer || '').toLowerCase();
      const appText = (task.apps || [])
        .map((a) => `${a.app_name || ''} ${a.app_id || ''}`)
        .join(' ')
        .toLowerCase();
      return (
        (task.task_id || task.id || '').toLowerCase().includes(keyword) ||
        (task.account_id || '').toLowerCase().includes(keyword) ||
        accountName.toLowerCase().includes(keyword) ||
        appText.includes(keyword) ||
        (task.type || '').toLowerCase().includes(keyword) ||
        (task.status || '').toLowerCase().includes(keyword) ||
        execution.toLowerCase().includes(keyword) ||
        mode.includes(keyword)
      );
    });
  }, [isSearchMode, searchKeyword, searchAllTasks, accountMetaMap]);

  const displaySourceTasks = isSearchMode ? searchFilteredTasks : autopipeTasks;
  const displayTotalItems = isSearchMode ? searchFilteredTasks.length : totalItems;
  const displayTotalPages = isSearchMode ? Math.max(1, Math.ceil(displayTotalItems / pageSize)) : totalPages;

  const pagedDisplayTasks = useMemo(() => {
    if (!isSearchMode) return autopipeTasks;
    const start = (currentPage - 1) * pageSize;
    return displaySourceTasks.slice(start, start + pageSize);
  }, [isSearchMode, autopipeTasks, displaySourceTasks, currentPage, pageSize]);

  // After re-pagination, prevent currentPage from falling into an empty page range, causing "the search results are clearly there but the page displays No Matched"
  useEffect(() => {
    setCurrentPage((p) => {
      const safeTotalPages = Math.max(1, displayTotalPages);
      const safePage = Math.min(safeTotalPages, Math.max(1, p));
      return safePage === p ? p : safePage;
    });
  }, [displayTotalPages]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'install_pb':
        return <MdDownloading size={12} />;
      case 'event_pb':
        return <MdDataSaverOn size={12} />;
      case 'install_rtpb':
        return <MdDownloading size={12} />;
      case 'event_rtpb':
        return <MdDonutLarge size={12} />;
      default:
        return <VscSymbolKeyword size={12} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'install_pb':
        return 'Install-PB';
      case 'event_pb':
        return 'Event-PB';
      case 'install_rtpb':
        return 'Install-RTPB';
      case 'event_rtpb':
        return 'Event-RTPB';
      default:
        return 'All Type';
    }
  };

  useEffect(() => {
    // Search mode does not rely on server-side paging to avoid "semi-silent loading" caused by every page turn/paging switch.
    if (debouncedSearchText.trim()) return;
    refreshAutoPipeTasks();
  }, [refreshAutoPipeTasks, debouncedSearchText]);

  useEffect(() => {
    refreshFilterOptionTasks();
  }, [refreshFilterOptionTasks]);

  // Global search: Pull all tasks under the current groupBy condition at once, then filter locally and re-paginate
  useEffect(() => {
    const keyword = debouncedSearchText.trim();
    setCurrentPage(1);
    if (!keyword) {
      setSearchAllTasks([]);
      setSearchAllTasksLoading(false);
      return;
    }

    let cancelled = false;
    setSearchAllTasksLoading(true);
    fetchAllAutoPipeTasksForSearch()
      .then((rows) => {
        if (cancelled) return;
        setSearchAllTasks(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setSearchAllTasks([]);
      })
      .finally(() => {
        if (cancelled) return;
        setSearchAllTasksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearchText, fetchAllAutoPipeTasksForSearch]);

  // After the search or grouping conditions change, reset the paging to the first page first (ensure that the paging will not fall into the empty interval)
  useEffect(() => {
    setCurrentPage(1);
  }, [groupByAccountId, groupByType]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        target instanceof Element &&
        (
          target.closest('[data-header-filter-area]') ||
          target.closest('[data-display-menu-area]') ||
          target.closest('[data-token-bubble-area]') ||
          target.closest('[data-regenerate-confirm-area]')
        )
      ) {
        return;
      }
      setActiveHeaderFilter(null);
      setShowDisplayMenu(false);
      setTokenBubbleTaskId(null);
      setRegenerateConfirmTaskId(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const accountFilterOptions = useMemo(() => {
    const dedup = new Map<string, { value: string; label: string; icon?: string }>();
    const baseTasks = filterOptionTasks.length > 0 ? filterOptionTasks : autopipeTasks;
    baseTasks.forEach((task) => {
      if (!task.account_id) return;
      const meta = accountMetaMap[task.account_id];
      dedup.set(task.account_id, {
        value: task.account_id,
        label: meta?.name || task.account_id,
        icon: meta?.icon,
      });
    });
    const rows = Array.from(dedup.values()).sort((a, b) => a.label.localeCompare(b.label));
    if (groupByAccountId !== 'all' && !rows.some((r) => r.value === groupByAccountId)) {
      const selectedMeta = accountMetaMap[groupByAccountId];
      rows.unshift({
        value: groupByAccountId,
        label: selectedMeta?.name || groupByAccountId,
        icon: selectedMeta?.icon,
      });
    }
    return [{ value: 'all', label: 'All Account' }, ...rows];
  }, [filterOptionTasks, autopipeTasks, accountMetaMap, groupByAccountId]);

  const typeFilterOptions = useMemo(() => {
    const dedup = new Set<string>();
    const baseTasks = filterOptionTasks.length > 0 ? filterOptionTasks : autopipeTasks;
    baseTasks.forEach((task) => {
      if (task.type) dedup.add(task.type);
    });
    const rows = Array.from(dedup.values()).sort().map((value) => ({
      value,
      label: getTypeLabel(value),
    }));
    if (groupByType !== 'all' && !rows.some((r) => r.value === groupByType)) {
      rows.unshift({ value: groupByType, label: getTypeLabel(groupByType) });
    }
    return [{ value: 'all', label: 'All Data Type' }, ...rows];
  }, [filterOptionTasks, autopipeTasks, groupByType]);

  return (
    <div className="dispatch-access max-w-[1800px] mx-auto p-6 select-none">
      <div className="dispatch-access__header">
        <div className="dispatch-access__header-row">
          <div className="relative min-w-0">
            <h1 className="dispatch-access__title">Dispatch Access</h1>
            <div className="dispatch-access__subtitle-row">
              <span className="dispatch-access__subtitle-text">
                Secure dispatch orchestration for autopipe data warehouse workflows
              </span>
              <div
                className="dispatch-access__help-anchor"
                onMouseEnter={() => setShowHint(true)}
                onMouseLeave={() => setShowHint(false)}
              >
                <HelpCircle className="dispatch-access__help-icon" />
                {showHint && (
                  <div className="dispatch-access__help-popover" role="tooltip">
                    AutoPipe mode imports scheduled tasks and wraps them as dispatch tokens for
                    controlled execution.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="dispatch-access__search-wrap">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search task through app or taskid..."
              className="dispatch-access__search-input"
            />
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              className="dispatch-access__search-icon"
            >
              <path
                d="M21 21l-4.35-4.35M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>

      <div className="dispatch-access__card">
        <table className="dispatch-access__table">
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '27%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead className="dispatch-access__thead">
              <tr>
                <th className="dispatch-access__th">Task ID</th>
                <th className="dispatch-access__th">
                  <div className="relative inline-flex items-center gap-1" data-header-filter-area>
                    <span>Account</span>
                <button
                  type="button"
                      className="dispatch-access__filter-trigger"
                      onClick={() => setActiveHeaderFilter(activeHeaderFilter === 'account' ? null : 'account')}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        {activeHeaderFilter === 'account' ? (
                          <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        ) : (
                          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        )}
                      </svg>
                    </button>
                    <div
                      className={`dispatch-access-scrollable dispatch-access__filter-menu ${
                        activeHeaderFilter === 'account' ? 'is-open' : 'is-closed'
                      }`}
                    >
                      {accountFilterOptions.map((opt) => (
                  <button
                          key={opt.value}
                    type="button"
                    onClick={() => {
                            setGroupByAccountId(opt.value);
                            setCurrentPage(1);
                            setActiveHeaderFilter(null);
                          }}
                          className={`dispatch-access__filter-option ${
                            groupByAccountId === opt.value ? 'is-selected' : ''
                          }`}
                        >
                          {opt.value === 'all' ? (
                            <span className="dispatch-access__filter-badge">A</span>
                          ) : opt.icon ? (
                            <img src={opt.icon} alt={opt.label} className="w-4 h-4 rounded object-cover shrink-0" />
                          ) : (
                            <span className="dispatch-access__filter-badge">
                              {opt.label.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="dispatch-access__filter-option-label truncate">
                            {opt.label}
                          </span>
                  </button>
                      ))}
                      {accountFilterOptions.length === 1 && (
                        <div className="px-2 py-2 text-xs text-gray-400">No loaded account options</div>
              )}
            </div>
          </div>
                </th>
                <th className="dispatch-access__th">App/Bundle</th>
                <th className="dispatch-access__th">
                  <div className="relative inline-flex items-center gap-1" data-header-filter-area>
                    <span>Data Type</span>
                    <button
                      type="button"
                      className="dispatch-access__filter-trigger"
                      onClick={() => setActiveHeaderFilter(activeHeaderFilter === 'type' ? null : 'type')}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                        {activeHeaderFilter === 'type' ? (
                          <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        ) : (
                          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        )}
                      </svg>
                    </button>
                    <div
                      className={`dispatch-access-scrollable dispatch-access__filter-menu ${
                        activeHeaderFilter === 'type' ? 'is-open' : 'is-closed'
                      }`}
                    >
                      {typeFilterOptions.map((opt) => (
                              <button
                          key={opt.value}
                                type="button"
                                onClick={() => {
                            setGroupByType(opt.value);
                            setCurrentPage(1);
                            setActiveHeaderFilter(null);
                          }}
                          className={`dispatch-access__filter-option ${
                            groupByType === opt.value ? 'is-selected' : ''
                          }`}
                        >
                          {opt.value === 'all' ? (
                            <span className="dispatch-access__filter-badge">A</span>
                          ) : (
                            <span className="shrink-0 text-gray-600">{getTypeIcon(opt.value)}</span>
                          )}
                          <span className="dispatch-access__filter-option-label truncate">
                            {opt.label}
                          </span>
                              </button>
                      ))}
                      {typeFilterOptions.length === 1 && (
                        <div className="px-2 py-2 text-xs text-gray-400">No loaded type options</div>
                      )}
                                    </div>
                                    </div>
                </th>
                <th className="dispatch-access__th">Execution</th>
                <th className="dispatch-access__th">Status</th>
                <th className="dispatch-access__th">Actions</th>
              </tr>
            </thead>
            <tbody
              aria-busy={isAnyLoading}
              aria-label={isAnyLoading ? 'Loading tasks' : undefined}
            >
              {isAnyLoading ? (
                Array.from({ length: DISPATCH_TABLE_SKELETON_ROWS }, (_, rowIndex) => (
                  <tr key={`dispatch-skeleton-${rowIndex}`} className="dispatch-access__row">
                    <td className="dispatch-access__td text-center">
                      <div className="dispatch-access-sk dispatch-access-sk-line w-[68%] max-w-[132px]" />
                    </td>
                    <td className="dispatch-access__td">
                      <div className="flex w-full items-center justify-center gap-2">
                        <div className="dispatch-access-sk dispatch-access-sk-icon" />
                        <div className="dispatch-access-sk dispatch-access-sk-line dispatch-access-sk-line-m0 w-[120px] max-w-[55%]" />
                              </div>
                    </td>
                    <td className="dispatch-access__td">
                      <div className="flex w-full flex-col items-center justify-center gap-1.5">
                        <div className="flex items-center gap-2 w-[230px] max-w-[95%]">
                          <div className="dispatch-access-sk dispatch-access-sk-app" />
                          <div className="min-w-0 flex-1">
                            <div className="dispatch-access-sk dispatch-access-sk-line dispatch-access-sk-line-m0 w-[80%] mb-1" />
                            <div className="dispatch-access-sk dispatch-access-sk-line dispatch-access-sk-line-m0 h-[10px] w-[95%]" />
                        </div>
                      </div>
                        <div className="flex items-center gap-2 w-[230px] max-w-[95%]">
                          <div className="dispatch-access-sk dispatch-access-sk-app" />
                          <div className="min-w-0 flex-1">
                            <div className="dispatch-access-sk dispatch-access-sk-line dispatch-access-sk-line-m0 w-[75%] mb-1" />
                            <div className="dispatch-access-sk dispatch-access-sk-line dispatch-access-sk-line-m0 h-[10px] w-[90%]" />
                        </div>
                            </div>
                          </div>
                    </td>
                    <td className="dispatch-access__td text-center">
                      <div className="inline-flex items-center justify-center gap-2">
                        <div className="dispatch-access-sk w-3 h-3 shrink-0" style={{ borderRadius: 'var(--da-radius-sm)' }} />
                        <div className="dispatch-access-sk dispatch-access-sk-line w-[88px] max-w-[70%]" />
                        </div>
                    </td>
                    <td className="dispatch-access__td text-center">
                      <div className="inline-flex items-center justify-center gap-2 min-w-[120px]">
                        <div className="dispatch-access-sk w-[18px] h-[18px] shrink-0" style={{ borderRadius: 'var(--da-radius-sm)' }} />
                        <div className="dispatch-access-sk dispatch-access-sk-progress" />
                            </div>
                    </td>
                    <td className="dispatch-access__td text-center">
                      <div className="dispatch-access-sk dispatch-access-sk-pill" />
                    </td>
                    <td className="dispatch-access__td text-center">
                      <div className="dispatch-access-sk dispatch-access-sk-btn" />
                    </td>
                  </tr>
                ))
              ) : pagedDisplayTasks.length === 0 ? (
                <tr className="dispatch-access__row dispatch-access__row--empty">
                  <td className="dispatch-access__empty" colSpan={7}>
                    No Matched Task
                  </td>
                </tr>
              ) : (
                pagedDisplayTasks.map((task) => (
                  <tr key={task.id} className="dispatch-access__row">
                    <td className="dispatch-access__td font-mono text-xs text-center">{task.task_id || task.id}</td>
                    <td className="dispatch-access__td">
                          {(() => {
                        const meta = accountMetaMap[task.account_id];
                        const name = meta?.name || task.account_id;
                        const icon = meta?.icon;
                              return (
                          <div className="flex w-full items-center justify-center gap-2 min-w-0">
                            <div className="dispatch-access__account-icon">
                              {icon ? (
                                    <img
                                  src={icon}
                                  alt={name}
                                  className="w-full h-full object-contain object-center select-none"
                                        draggable={false}
                                        onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="text-[11px] font-semibold text-gray-500 select-none leading-none">
                                  {(name || 'A').charAt(0).toUpperCase()}
                                    </div>
                              )}
                                  </div>
                            <div className="min-w-0 max-w-[180px] text-center">
                              <div className="text-xs font-medium text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis">
                                {name}
                                    </div>
                                    </div>
                                  </div>
                        );
                      })()}
                    </td>
                    <td className="dispatch-access__td">
                      <div className="flex w-full flex-col items-center justify-center gap-1.5">
                        {(task.apps && task.apps.length > 0 ? task.apps.slice(0, 2) : []).map((app) => (
                          <div key={`${task.id}-${app.app_id}`} className="flex items-center gap-2 w-full max-w-[260px]">
                            <div className="dispatch-access__app-icon">
                              {app.icon_url ? (
                                <img
                                  src={app.icon_url}
                                  alt={app.app_name || app.app_id}
                                  className="w-full h-full object-cover object-center select-none"
                                        draggable={false}
                                        onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="dispatch-access__app-fallback">
                                  {(app.app_name || 'A').charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                                {app.app_name || 'Unknown App'}
                        </div>
                              <div className="text-[10px] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis leading-tight">
                                {app.app_id}
                      </div>
                                  </div>
                                    </div>
                        ))}
                        {(!task.apps || task.apps.length === 0) && (
                          <div className="text-xs text-gray-400">-</div>
                    )}
                  </div>
                    </td>
                    <td className="dispatch-access__td text-center">
                      <div className="inline-flex items-center justify-center gap-2">
                        {getTypeIcon(task.type || '')}
                        <span className="text-xs">{getTypeLabel(task.type || '')}</span>
                </div>
                    </td>
                    <td className="dispatch-access__td text-center">
                      {(() => {
                        const dp = task.data_pointer || 'Daily Execution';
                        const isDaily = dp === 'Daily Execution';
                        const bar = getExecutionBar(task);
                        const timeInfo = getTaskTimeInfo(task);
                        const track =
                          bar.variant === 'green'
                            ? 'bg-emerald-100'
                            : bar.variant === 'red'
                              ? 'bg-rose-100'
                              : 'bg-sky-100';
                        const fill =
                          bar.variant === 'green'
                            ? 'bg-emerald-300/90'
                            : bar.variant === 'red'
                              ? 'bg-rose-300/90'
                              : 'bg-sky-300/90';
                        return (
                          <div className="inline-flex items-center justify-center gap-2 min-w-[120px]">
                            <div className="relative flex items-center shrink-0 group">
                    <button
                      type="button"
                                title="查看执行时间信息"
                                className="dispatch-access__exec-btn"
                              >
                                {isDaily ? <BsRepeat1 size={14} /> : <Bs1Square size={14} />}
                              </button>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-[1000] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                                <div className="dispatch-access__time-tip inline-flex w-max max-w-none text-left">
                                  <div className="text-gray-700 whitespace-nowrap">
                                    {timeInfo.type === 'Daily Execution'
                                      ? `Daily Execution Time: ${timeInfo.date}`
                                      : `Start Date: ${timeInfo.date}`}
                      </div>
                  </div>
                </div>
                            </div>
                            <div
                              className={`dispatch-access__progress-track ${track}`}
                              title={`${bar.variant} ${Math.round(bar.width)}%`}
                      >
                        <div
                                className={`dispatch-access__progress-fill ${fill}`}
                                style={{ width: `${bar.width}%` }}
                    />
                                  </div>
                              </div>
                            );
                          })()}
                      </td>
                    <td className="dispatch-access__td text-center">
                          <span className="dispatch-access__status">
                            <span className="dispatch-access__status-text">
                              {task.status || 'unknown'}
                            </span>
                          </span>
                        </td>
                    <td className="dispatch-access__td text-center">
                      {task.api_token ? (
                        <div className="inline-flex items-center justify-center gap-0.5">
                          <div className="relative inline-flex items-center justify-center" data-token-bubble-area>
                            <button
                              type="button"
                              onClick={() => {
                                if (tokenBubbleTaskId === task.id) {
                                  setTokenBubbleTaskId(null);
                                } else {
                                  setRegenerateConfirmTaskId(null);
                                  void openTokenBubble(task);
                                }
                              }}
                              className="dispatch-access__icon-btn"
                              title="View token details"
                            >
                              <BsKeyFill size={14} className="shrink-0" />
                            </button>
                            <div
                              className={`dispatch-access__popover dispatch-access__popover--wide ${
                                tokenBubbleTaskId === task.id ? 'is-open' : 'is-closed'
                              }`}
                            >
                              <div className="dispatch-access__popover-caption">Token</div>
                              <div className="dispatch-access__code-box dispatch-access__code-box--row">
                                <span className="dispatch-access__code-box-token">{task.api_token}</span>
                                <button
                                  type="button"
                                  onClick={() => void copyToken(task)}
                                  disabled={copyingTokenTaskId === task.id}
                                  className="dispatch-access__copy-btn"
                                  title="Copy token"
                                  aria-label="Copy token"
                                >
                                  {copyingTokenTaskId === task.id ? (
                                    <span className="inline-block w-3.5 h-3.5 rounded-full border border-gray-400 border-t-transparent animate-spin" />
                                  ) : copiedTokenTaskId === task.id ? (
                                    <RiCheckLine className="h-3.5 w-3.5 text-green-600" />
                                  ) : (
                                    <RiFileCopyLine className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                              <div className="dispatch-access__popover-caption dispatch-access__popover-caption--spaced">
                                Request Method
                              </div>
                              <div className="dispatch-access__code-box break-all">
                                POST /api/autopipe/token/track
                                {"\n"}
                                Body: {"{ \"token\": \"<api_token>\" }"}
                              </div>
                              <div className="dispatch-access__stat-grid">
                                <div className="dispatch-access__stat-cell">
                                  <div className="dispatch-access__stat-label">Request Count</div>
                                  <div className="dispatch-access__stat-value">{task.token_request_count ?? 0}</div>
                                </div>
                                <div className="dispatch-access__stat-cell">
                                  <div className="dispatch-access__stat-label">Last Used</div>
                                  <div className="dispatch-access__stat-value">{task.token_last_used_at || 'N/A'}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="relative inline-flex items-center justify-center" data-regenerate-confirm-area>
                            <button
                              type="button"
                              onClick={() => {
                                setTokenBubbleTaskId(null);
                                setRegenerateConfirmTaskId((id) => (id === task.id ? null : task.id));
                              }}
                              disabled={regenerateLoadingId === task.id}
                              className="dispatch-access__icon-btn text-gray-600"
                              title="Regenerate token"
                              aria-label="Regenerate token"
                            >
                              {regenerateLoadingId === task.id ? (
                                <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
                              ) : (
                                <RiRefreshLine size={15} className="shrink-0" />
                              )}
                            </button>
                            <div
                              className={`dispatch-access__popover dispatch-access__popover--confirm ${
                                regenerateConfirmTaskId === task.id ? 'is-open' : 'is-closed'
                              }`}
                              aria-hidden={regenerateConfirmTaskId !== task.id}
                            >
                              <p className="dispatch-access__popover-message">
                                This will revoke the current token, issue a new one, and clear request count and last-used
                                history for this task. Continue?
                              </p>
                              <div className="dispatch-access__popover-actions">
                                <button
                                  type="button"
                                  onClick={() => setRegenerateConfirmTaskId(null)}
                                  className="dispatch-access__btn"
                                >
                                  <span className="dispatch-access__btn__label">Cancel</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void executeRegenerateToken(task)}
                                  disabled={regenerateLoadingId === task.id}
                                  className="dispatch-access__btn dispatch-access__btn--primary"
                                >
                                  <span className="dispatch-access__btn__label">Confirm</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        createByAutoPipeLoadingId === task.id ? (
                          <div className="inline-flex items-center justify-center h-8 w-8">
                            <span className="inline-block w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />
            </div>
                        ) : (
                            <button
                              type="button"
                              onClick={() => createTaskFromAutoPipe(task)}
                            disabled={['warning', 'paused'].includes((task.status || '').toLowerCase())}
                            className="dispatch-access__btn"
                            >
                            <span className="dispatch-access__btn__label">Import</span>
                            </button>
                        )
                      )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
      </div>

      <div className="dispatch-access__footer">
        <span className="dispatch-access__footer-label text-gray-500">TOTAL {displayTotalItems}</span>
        <div className="relative flex items-center gap-1" data-display-menu-area>
          <span className="dispatch-access__footer-label">Display</span>
          <button
            type="button"
            onClick={() => setShowDisplayMenu((v) => !v)}
            className="dispatch-access__page-size-btn"
          >
            <span className="dispatch-access__page-size-value">{pageSize}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
              {showDisplayMenu ? (
                <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
          <div
            className={`dispatch-access__page-size-menu ${
              showDisplayMenu ? 'is-open' : 'is-closed'
            }`}
          >
            {[20, 30, 50].map((size) => (
                          <button
                key={size}
                type="button"
                onClick={() => {
                  if (size !== pageSize) {
                    setPageSize(size);
                    setCurrentPage(1);
                  }
                  setShowDisplayMenu(false);
                }}
                className={`dispatch-access__filter-option ${
                  pageSize === size ? 'is-selected' : ''
                }`}
              >
                <span className="dispatch-access__filter-option-label">{size}</span>
                          </button>
            ))}
                        </div>
          </div>
        <span className="dispatch-access__footer-label">
          {currentPage} OF {displayTotalPages} PAGES
        </span>
        <button
          type="button"
          onClick={() =>
            setCurrentPage((p) => {
              setActiveHeaderFilter(null);
              setShowDisplayMenu(false);
              return Math.max(1, p - 1);
            })
          }
          disabled={isAnyLoading || currentPage <= 1}
          className="dispatch-access__page-nav-btn"
          title="Previous page"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mx-auto">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() =>
            setCurrentPage((p) => {
              setActiveHeaderFilter(null);
              setShowDisplayMenu(false);
              return Math.min(displayTotalPages, p + 1);
            })
          }
          disabled={isAnyLoading || currentPage >= displayTotalPages}
          className="dispatch-access__page-nav-btn"
          title="Next page"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mx-auto">
            <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default DispatchAccess;
