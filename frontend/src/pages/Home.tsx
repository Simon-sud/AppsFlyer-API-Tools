import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
// Removed unused icon imports: DownloadIcon, FileTextIcon, DeleteIcon, CloseCircleIcon, QuestionCircleIcon
import { LoadingIcon } from '../components/ui/icons';
import { RiTable3, RiFileDownloadLine, RiDeleteBin7Line } from 'react-icons/ri';
import { Copy, CheckCircle2, Inbox } from 'lucide-react';
// Removed unused import: AppsFlyerTextField
import DataFetchSearchBar from '../components/DataFetchSearchBar';
import moment from 'moment';
// Removed unused imports: fetchData, FetchDataParams
import { getAccountInfo, getAccountToken, axiosInstance, TEAM_SCOPE_STORAGE_NAME } from '../services/api';
import { useUser } from '../contexts/UserContext';
import { DATA_TYPES, ACCOUNT_TYPES, DATE_FORMAT, DataType, AccountType, isEventType } from '../utils/constants';
import {
  useReactTable,
  getCoreRowModel,
  // Removed unused import: getSortedRowModel
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  ColumnFiltersState,
} from '@tanstack/react-table';
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '../components/ui/table';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import weekday from 'dayjs/plugin/weekday';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { io } from 'socket.io-client'; // io is used in code (Line 1877), but may not be detected by the linter
import { useAccount } from '../contexts/AccountContext';
import '../styles/preview-datagrid.css';

/** Preview pop-up window header can filter columns (consistent with table header rendering)*/
const PREVIEW_FILTERABLE_COLUMNS = new Set([
  'APP ID', 'Campaign', 'Campaign ID', 'Channel', 'Country Code', 'Event Name',
  'Media Source', 'Postback http response Code', 'Site ID', 'Attributed Touch Type',
  'Ad', 'Carrier', 'Event Source', 'OS Version',
]);

function orderPreviewTableColumns(sampleRow: Record<string, unknown>): string[] {
  const allColumns = Object.keys(sampleRow);
  const appIdColumn = ['APP ID', 'App ID', 'app_id'].find((col) => allColumns.includes(col));
  const appNameColumn = ['APP Name', 'App Name', 'app_name'].find((col) => allColumns.includes(col));
  const pinned = [appIdColumn, appNameColumn].filter(Boolean) as string[];
  return [...pinned, ...allColumns.filter((col) => !pinned.includes(col))];
}

/** Estimate column width based on header + sample data to avoid header cells being left with large blanks by data columns*/
function getPreviewColumnWidthPx(columnKey: string, rows: Record<string, unknown>[]): number {
  const filterExtra = PREVIEW_FILTERABLE_COLUMNS.has(columnKey) ? 28 : 0;
  const headerPx = columnKey.length * 7.5 + 20 + filterExtra;
  let dataPx = 0;
  const sampleCount = Math.min(rows.length, 80);
  for (let i = 0; i < sampleCount; i++) {
    const raw = rows[i]?.[columnKey];
    let text = '';
    if (raw !== null && raw !== undefined) {
      text = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
    }
    dataPx = Math.max(dataPx, Math.min(text.length, 36) * 7 + 20);
  }
  return Math.min(240, Math.max(48, Math.ceil(Math.max(headerPx, dataPx))));
}

dayjs.extend(isBetween);
dayjs.extend(weekday);

// Retry function, supports delay and retry count configuration
const retryWithDelay = async <T,>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // If it is the last attempt, throw an error directly
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait for the specified time and try again
      console.log(`请求失败，${delayMs}ms 后进行第 ${attempt + 1} 次重试...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
};

const waitForNextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const waitForMs = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// Client-side URL decoding function (for fast processing, no API calls required)

interface FormValues {
  accountType: AccountType;
  accountId: string;
  appIds: string;
  dataType: DataType | string; // Support dataType in Aggregate mode
  dateRange: [moment.Moment, moment.Moment];
  eventFilter?: string;
  mediaSource?: string; // New: Used to store authorization channels
}

// Removed unused interfaces: AccountConfig, DataQueryParams

interface QueryResult {
  key: string;
  appId: string;
  dataType: string;
  dateRange: string;
  status: 'success' | 'error' | 'processing' | 'failed';
  message: string;
  downloadUrl?: string;
  apiResponse?: any;  // Store the full response of the API
  errorDetails?: any; // Store error details
  appName?: string;
  primaryAttributionCount?: number;
  accountType: string;
  accountId: string;
  event_filter?: string; // Add event filter field
  afidDeduplicationCount?: number;
  mediaSource?: string; // New: Authorized Channel/Media Source
  mode?: string; // Add schema field
  createTime?: string; // creation time
}

interface ApiResponse {
  status: 'success' | 'error' | 'duplicate';
  message: string;
  downloadUrl?: string;
  details?: any;
  queryId?: string;  // Add queryId field
  duplicate?: boolean;
  existingStatus?: 'success' | 'error' | 'processing' | 'failed' | 'pending';
  apiResponse?: any;
}

interface CheckDuplicateResponse {
  status: string;
  isDuplicate: boolean;
  record?: {
    id: string;
    status: 'success' | 'error' | 'processing' | 'failed';
    message: string;
    createdAt: string;
  };
}

// Simple icon preview button component
const IconPreviewButton: React.FC<{ 
  disabled?: boolean; 
  onClick: () => void;
  loading?: boolean;
}> = ({ disabled = false, onClick, loading = false }) => (
      <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled || loading}
      style={{
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        background: 'transparent',
        border: 'none',
        padding: '4px',
        borderRadius: '4px',
        transition: 'all 0.2s ease',
        opacity: disabled || loading ? 0.5 : 1,
        outline: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        pointerEvents: 'auto',
        position: 'relative',
        zIndex: 1201,
        isolation: 'isolate'
      }}
      onMouseEnter={(e) => {
        e.stopPropagation();
        if (!disabled && !loading) {
          e.currentTarget.style.backgroundColor = '#f0f0f0';
        }
      }}
      onMouseLeave={(e) => {
        e.stopPropagation();
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {loading ? (
        <LoadingIcon style={{ fontSize: 18, color: '#999', animation: 'spin 0.9s linear infinite' }} />
      ) : (
        <RiTable3 size={18} color={disabled ? "#999" : "#220D4E"} />
      )}
    </button>
);

// AppsFlyer style download button component
const AppsFlyerDownloadButton: React.FC<{ 
  disabled?: boolean; 
  onClick: () => void;
  loading?: boolean;
}> = ({ disabled = false, onClick, loading = false }) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    disabled={disabled || loading}
    style={{
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      background: 'transparent',
      border: 'none',
      padding: '4px',
      borderRadius: '4px',
      transition: 'all 0.2s ease',
      opacity: disabled || loading ? 0.5 : 1,
      outline: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      pointerEvents: 'auto',
      position: 'relative',
      zIndex: 1201,
      isolation: 'isolate'
    }}
    onMouseEnter={(e) => {
      e.stopPropagation();
      if (!disabled && !loading) {
        e.currentTarget.style.backgroundColor = '#f0f0f0';
      }
    }}
    onMouseLeave={(e) => {
      e.stopPropagation();
      e.currentTarget.style.backgroundColor = 'transparent';
    }}
  >
    {loading ? (
      <LoadingIcon style={{ fontSize: 18, color: '#999', animation: 'spin 0.9s linear infinite' }} />
    ) : (
      <RiFileDownloadLine size={18} color={disabled ? "#999" : "#220D4E"} />
    )}
  </button>
);


 


// AppsFlyer style delete button component
const AppsFlyerDeleteButton: React.FC<{ 
  disabled?: boolean; 
  onClick: () => void;
  loading?: boolean;
}> = ({ disabled = false, onClick, loading = false }) => (
  <button
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    disabled={disabled || loading}
    style={{
      cursor: disabled || loading ? 'not-allowed' : 'pointer',
      userSelect: 'none',
      WebkitTapHighlightColor: 'transparent',
      background: 'transparent',
      border: 'none',
      padding: '4px',
      borderRadius: '4px',
      transition: 'all 0.2s ease',
      opacity: disabled || loading ? 0.5 : 1,
      outline: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      pointerEvents: 'auto',
      position: 'relative',
      zIndex: 1201,
      isolation: 'isolate'
    }}
    onMouseEnter={(e) => {
      e.stopPropagation();
      if (!disabled && !loading) {
        e.currentTarget.style.backgroundColor = '#f0f0f0';
      }
    }}
    onMouseLeave={(e) => {
      e.stopPropagation();
      e.currentTarget.style.backgroundColor = 'transparent';
    }}
  >
    {loading ? (
      <LoadingIcon style={{ fontSize: 18, color: '#999', animation: 'spin 0.9s linear infinite' }} />
    ) : (
      <RiDeleteBin7Line size={18} color={disabled ? "#999" : "#220D4E"} />
    )}
  </button>
);

// Removed unused component: AppsFlyerSearchIcon

// Unified log link component (for Log column) - pure click hyperlink, disable text selection, use Tailwind style
const LogLink: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => {
  const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    console.log('LogLink clicked!', e); // Debugging: Confirm that the click event is triggered
    e.preventDefault(); // Prevent default behavior (if any)
    e.stopPropagation(); // Prevent events from bubbling up to table rows
    onClick(); // Execute callback function
  };

  // Remove onMouseDown as it may interfere with click event
  // CSS has disabled text selection via user-select: none

  return (
  <span
    role="button"
    tabIndex={0}
      onClick={handleClick}
    onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      className="appsflyer-log-link inline-block text-center whitespace-nowrap py-0.5 px-2 rounded font-medium select-none cursor-pointer relative z-[1001] isolate no-underline text-blue-600 hover:text-blue-700 hover:underline active:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 dark:active:text-blue-500 transition-none"
    style={{
        // Make sure it's interactive
      pointerEvents: 'auto',
        transform: 'none',
        animation: 'none',
        willChange: 'auto',
        backfaceVisibility: 'visible'
    }}
  >
    {children}
  </span>
);
};

// Removed unused component: PageChip

// Add data type mapping
const DATA_TYPE_MAP: Record<DataType | string, (accountType: AccountType) => string> = {
  event: (accountType) => accountType === 'PID' ? 'In-App-Event-Postbacks' : 'In-App-Event-Non-Organic',
  install: (accountType) => accountType === 'PID' ? 'Install-Postbacks' : 'Install-Non-Organic',
  retarget_event: (accountType) => accountType === 'PID' ? 'Retargeting-In-App-Event-Postbacks' : 'Retargeting-In-App-Event-Non-Organic',
  retarget_install: (accountType) => accountType === 'PID' ? 'Retargeting-Install-Postbacks' : 'Retargeting-Install-Non-Organic',
  // Data type mapping in Aggregate mode - returning raw values for API consumption
  daily: () => 'daily',
  partner_daily: () => 'partner_daily',
  geo_daily: () => 'geo_daily'
};

// Mode switching animation component has been removed

const Home: React.FC = () => {
  // Define a simple translations object for English
  const translations = {
    dataFetch: {
      accountInfo: 'Account Info',
      appId: 'APP ID',
      appName: 'App Name',
      dateRange: 'Date Range',
      eventFilter: 'Event Filter',
      dataType: 'Data Type',
      status: 'Status',
      statusSuccess: 'Success',
      statusError: 'Error',
      statusProcessing: 'Processing',
      log: 'Log',
      noAuthorized: 'No Authorized Data',
      requestLimit: 'Request Limit Exceeded',
      noDataAvailable: 'No Data Available',
      actions: 'Actions',
      errorMessages: {
        getAccountInfoFailed: 'Failed to get account info',
        fetchFailed: 'Fetch failed'
      },
      successMessages: {
        fetchSuccess: 'Fetch successful'
      },
      deleteSuccess: 'Deleted Successfully',
      noDownloadUrl: 'No Download URL Available',
      downloadSuccess: 'Downloaded Successfully',
      downloadError: 'Download Failed',
      noData: 'No Data',
      confirmDelete: 'Confirm Delete',
      confirmDeleteContent: 'Are you sure you want to delete this record?',
      cancel: 'Cancel',
      confirm: 'Confirm',
      logDetail: 'Log Detail',
      apiResponse: 'API Response'
    }
  };
  const language = 'en'; // Default to English

  // Using React state instead of Form instance
  const [formValues, setFormValues] = useState<FormValues>({
    accountType: ACCOUNT_TYPES.PID,
    accountId: '',
    appIds: '',
    dataType: DATA_TYPES.INSTALL,
    dateRange: [moment().subtract(1, 'day'), moment().subtract(1, 'day')],
    eventFilter: '',
    mediaSource: ''
  });

  // Auxiliary function to replace getFieldValue
  const getFieldValue = useCallback((fieldName: keyof FormValues) => {
    return formValues[fieldName];
  }, [formValues]);

  // Helper function to replace setFieldsValue
  const setFieldsValue = (values: Partial<FormValues>) => {
    setFormValues(prev => ({ ...prev, ...values }));
  };

  // Auxiliary function to replace form.resetFields
  const resetFields = () => {
    setFormValues({
      accountType: ACCOUNT_TYPES.PID,
      accountId: '',
      appIds: '',
      dataType: DATA_TYPES.INSTALL,
      dateRange: [moment().subtract(1, 'day'), moment().subtract(1, 'day')],
      eventFilter: '',
      mediaSource: ''
    });
  };
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(true);
  const loadingTokenRef = useRef(0); // Prevent jitter caused by concurrency
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Mark whether it is loaded for the first time
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false); // First load completion mark to avoid No Data flashing
  const isLoadingRef = useRef(false); // Prevent repeated loading
  const lastLoadTimeRef = useRef(0); // Record the last loading time to prevent frequent calls
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_accountInfo, setAccountInfo] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  
  // Handle notifications silently - don't show any UI
  const showToast = useCallback((type: 'success' | 'error' | 'warning', message: string, duration = 3000) => {
    // Process silently without displaying any notifications
    console.log(`[${type.toUpperCase()}] ${message}`);
  }, []);
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType | undefined>(undefined);
  const { accountConfigs: cachedConfigs, loading: cacheLoading } = useAccount();
  const { userProfile } = useUser();
  const isSuperAdmin = userProfile?.role === 'Super Admin';
  const selectedTeamName =
    typeof window !== 'undefined' && window.sessionStorage
      ? window.sessionStorage.getItem(TEAM_SCOPE_STORAGE_NAME)
      : null;
  const dataFetchDisabled =
    isSuperAdmin && selectedTeamName != null && selectedTeamName !== 'Super Admin';
  
  // Add ref of DataFetchSearchBar
  const dataFetchSearchBarRef = useRef<any>(null);
  
  // New: Aggregate Mode setting status (read from Settings page)
  const [aggregateModeEnabled, setAggregateModeEnabled] = useState(() => {
    const fraudModeSetting = localStorage.getItem('appsflyerTokenValidate');
    return fraudModeSetting === 'ON';
  });
  
  // New: Aggregate mode status (forced to start from Normal mode)
  const [isAggregateMode, setIsAggregateMode] = useState(() => {
    const fraudModeSetting = localStorage.getItem('appsflyerTokenValidate');
    
    // If Aggregate Mode is set to OFF, force returns false
    if (fraudModeSetting !== 'ON') {
      return false;
    }
    
    // Force starting from Normal mode and do not read the saved mode
    // Aggregate mode can only be entered after the user manually switches
    return false;
  });

  // Mode switching state (remove animation related state)

  // Remove useEffect of forced reset mode, allowing users to switch modes normally
  // Mode switching is now controlled by the handleAggregateModeToggle function

  // Automatically perform the Reset operation when the page is refreshed
  useEffect(() => {
    // Detect whether the page is refreshed (via performance.navigation.type or performance.getEntriesByType)
    const isPageRefresh = () => {
      // Method 1: Use performance.navigation (deprecated but still available)
      if (performance.navigation && performance.navigation.type === 1) {
        return true;
      }
      
      // Method 2: Use performance.getEntriesByType
      const navigationEntries = performance.getEntriesByType('navigation');
      if (navigationEntries.length > 0) {
        const navEntry = navigationEntries[0] as PerformanceNavigationTiming;
        return navEntry.type === 'reload';
      }
      
      // Method 3: Use sessionStorage tag
      const refreshFlag = sessionStorage.getItem('pageRefreshed');
      if (refreshFlag === 'true') {
        sessionStorage.removeItem('pageRefreshed');
        return true;
      }
      
      return false;
    };

    // Set page refresh flag
    sessionStorage.setItem('pageRefreshed', 'true');

    // If the page is refreshed, delay the execution of the Reset operation
    if (isPageRefresh()) {
      const timer = setTimeout(() => {
        if (dataFetchSearchBarRef.current && dataFetchSearchBarRef.current.clearAll) {
          dataFetchSearchBarRef.current.clearAll();
        }
      }, 100); // Delay 100ms to ensure component is fully loaded

      return () => clearTimeout(timer);
    }
  }, []); // Only executed once when the component is mounted

  // Remove all duplicate mode reset listeners to avoid triggering status updates multiple times

  // Monitor Aggregate Mode setting changes and update status immediately
  useEffect(() => {
    const handleAggregateModeChange = () => {
      const fraudModeSetting = localStorage.getItem('appsflyerTokenValidate');
      setAggregateModeEnabled(fraudModeSetting === 'ON');
    };

    // Listen to storage events (synchronize across tabs)
    window.addEventListener('storage', handleAggregateModeChange);
    
    // Listen to custom events (synchronized within the same tab)
    window.addEventListener('aggregateModeChanged', handleAggregateModeChange);

    return () => {
      window.removeEventListener('storage', handleAggregateModeChange);
      window.removeEventListener('aggregateModeChanged', handleAggregateModeChange);
    };
  }, []);

  // Remove the independent accountConfigs state and uniformly use the accountConfigs provided by Context
  // const [accountConfigs, setAccountConfigs] = useState<AccountConfig[]>([]);
  const accountConfigs = cachedConfigs; // Use accountConfigs provided by Context
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  // When the user initiates a query on the first screen, it is used to prevent the initial loading results from overwriting the user's new records.
  const userInteractedRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_selectedAccount, setSelectedAccount] = useState<any>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentDetail, setCurrentDetail] = useState<QueryResult | null>(null);
  const [copied, setCopied] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_queriedAppName, setQueriedAppName] = useState<string | null>(null);
  const [deleteConfirmModalVisible, setDeleteConfirmModalVisible] = useState(false);
  
  // React Table state
  // Remove sort status - header is plain text
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [customColumnFilters, setCustomColumnFilters] = useState<Record<string, string[]>>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [recordToDelete, setRecordToDelete] = useState<QueryResult | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [selectedPreviewRecord, setSelectedPreviewRecord] = useState<QueryResult | null>(null);
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});
  const [previewCurrentPage, setPreviewCurrentPage] = useState(0);
  const PREVIEW_PAGE_SIZE = 50;
  
  // operating status
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  
  // Table column display control
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    accountId: true,
    appId: true,
    appName: true,
    dataType: true,
    dateRange: true,
    event_filter: true,
    primaryAttributionCount: false,
    afidDeduplicationCount: false,
    mediaSource: false,
    mode: false,
    createTime: false,
    // status, log, actions are not included in the selector
  });

  // Load column selection preferences from localStorage
  const loadColumnPreferences = useCallback(() => {
    try {
      const saved = localStorage.getItem('queryTableColumnPreferences');
      if (saved) {
        const preferences = JSON.parse(saved);
        // Filter out downloadUrl and imported fields
        const { downloadUrl, imported, ...filteredPreferences } = preferences;
        setVisibleColumns(prev => ({
          ...prev,
          ...filteredPreferences
        }));
      }
    } catch (error) {
      console.error('Failed to load column preferences:', error);
    }
  }, []);

  // Save column selection preferences to localStorage
  const saveColumnPreferences = useCallback((columns: Record<string, boolean>) => {
    try {
      // Filter out downloadUrl and imported fields
      const { downloadUrl, imported, ...filteredColumns } = columns;
      localStorage.setItem('queryTableColumnPreferences', JSON.stringify(filteredColumns));
    } catch (error) {
      console.error('Failed to save column preferences:', error);
    }
  }, []);

  // Load column selection preferences on component initialization
  useEffect(() => {
    loadColumnPreferences();
  }, [loadColumnPreferences]);
  
  // Filter related status
  const [previewColumnFilters, setPreviewColumnFilters] = useState<Record<string, string[]>>({});
  const [filteredPreviewData, setFilteredPreviewData] = useState<any[]>([]);
  const [previewFilterMenu, setPreviewFilterMenu] = useState<{
    columnKey: string;
    top: number;
    left: number;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [highlightType, setHighlightType] = useState<'success' | 'processing' | 'failed' | 'error' | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _tableBodyRef = useRef<HTMLDivElement>(null);
  const queryInProgressRef = useRef(false);
  const queryResultsContainerRef = useRef<HTMLDivElement>(null);
  const previewFilterPanelRef = useRef<HTMLDivElement | null>(null);

  // Pagination related
  const [, setCurrentPage] = useState(1);
  const PAGE_SIZE = 9;
  const QUERY_RESULTS_HEADER_HEIGHT = 56;
  const QUERY_RESULTS_ROW_HEIGHT = 52;
  const MIN_SKELETON_ROWS = 6;
  const MAX_SKELETON_ROWS = 18;
  const [skeletonRowCount, setSkeletonRowCount] = useState(PAGE_SIZE);
  // Remove the upper limit of recording and allow unlimited recording

  // Monitor sidebar status changes
  useEffect(() => {
    const checkSidebarState = () => {
      // Check if the sidebar is expanded (by checking the left margin)
      const contentElement = document.querySelector('.main-content');
      if (contentElement) {
        const computedStyle = window.getComputedStyle(contentElement);
        const marginLeft = computedStyle.marginLeft;
        // If the left margin is greater than 64px, the sidebar is expanded
        setSidebarCollapsed(marginLeft === '64px');
      }
    };

    // Initial inspection
    checkSidebarState();

    // Listen for window size changes
    const resizeObserver = new ResizeObserver(checkSidebarState);
    const contentElement = document.querySelector('.main-content');
    if (contentElement) {
      resizeObserver.observe(contentElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  
  // Reset preview filter status
  const resetPreviewFilters = useCallback(() => {
    setPreviewFilterMenu(null);
    setCustomColumnFilters({});
    setPreviewColumnFilters({});
    // Reset filtered data to original preview data
    setFilteredPreviewData(previewData);
    setPreviewCurrentPage(0);
  }, [previewData]);

  const togglePreviewColumnFilter = useCallback(
    (columnKey: string, event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      if (previewFilterMenu?.columnKey === columnKey) {
        setPreviewFilterMenu(null);
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const panelWidth = 300;
      let left = rect.left;
      if (left + panelWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - panelWidth - 12);
      }
      setPreviewFilterMenu({
        columnKey,
        top: rect.bottom + 6,
        left,
      });
    },
    [previewFilterMenu]
  );

  const previewTableColumns = useMemo(() => {
    if (filteredPreviewData.length === 0) return [] as string[];
    return orderPreviewTableColumns(filteredPreviewData[0] as Record<string, unknown>);
  }, [filteredPreviewData]);

  const previewColumnWidths = useMemo(() => {
    const rows = filteredPreviewData as Record<string, unknown>[];
    return previewTableColumns.map((col) => getPreviewColumnWidthPx(col, rows));
  }, [previewTableColumns, filteredPreviewData]);
  
  // The filter float is only turned off when scrolling externally (list scrolling inside the float is not closed)
  useEffect(() => {
    if (!previewFilterMenu) return;

    const closeOnOutsideScroll = (event: Event) => {
      const target = event.target as Node | null;
      const panel = previewFilterPanelRef.current;
      if (panel && target && (panel === target || panel.contains(target))) {
        return;
      }
      setPreviewFilterMenu(null);
    };

    const closeOnResize = () => setPreviewFilterMenu(null);

    window.addEventListener('scroll', closeOnOutsideScroll, true);
    window.addEventListener('resize', closeOnResize);
    return () => {
      window.removeEventListener('scroll', closeOnOutsideScroll, true);
      window.removeEventListener('resize', closeOnResize);
    };
  }, [previewFilterMenu]);

  // Monitor the keyboard events of the preview pop-up window and support the ESC key to close it
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && previewModalVisible) {
        if (previewFilterMenu) {
          setPreviewFilterMenu(null);
          return;
        }
        setPreviewModalVisible(false);
        resetPreviewFilters();
      }
    };
    
    if (previewModalVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [previewModalVisible, previewFilterMenu, resetPreviewFilters]);

  // Removed unused function: getAccountRecordKey
  // const getAccountRecordKey = (accountId: string, accountType: string) => `queryResults_${accountType}_${accountId}`;
  
  // Get the unique value of a column
  const getColumnUniqueValues = useCallback((data: any[], column: string) => {
    const values = new Set<string>();
    data.forEach(row => {
      const value = row[column];
      if (value !== null && value !== undefined) {
        values.add(String(value));
      }
    });
    return Array.from(values).sort();
  }, []);

  const renderPreviewColumnFilterPanel = useCallback(
    (columnKey: string) => {
      const uniqueValues = getColumnUniqueValues(previewData, columnKey);
      const selected = customColumnFilters[columnKey] ?? [];
      const allSelected =
        selected.length > 0 && selected.length === uniqueValues.length;

      return (
        <>
          <div className="preview-col-filter__panel-header">{columnKey}</div>
          <div
            className="preview-col-filter__panel-list"
            onWheel={(e) => e.stopPropagation()}
          >
            <label
              className={`preview-col-filter__option preview-col-filter__option--all${allSelected ? ' is-selected' : ''}`}
            >
              <input
                type="checkbox"
                className="preview-col-filter__checkbox"
                checked={allSelected}
                onChange={(e) => {
                  const newFilters = { ...customColumnFilters };
                  if (e.target.checked) {
                    newFilters[columnKey] = uniqueValues;
                  } else {
                    delete newFilters[columnKey];
                  }
                  setCustomColumnFilters(newFilters);
                }}
              />
              <span className="preview-col-filter__option-label">Select All</span>
            </label>
            {uniqueValues.map((value) => {
              const isSelected = selected.includes(value);
              return (
                <label
                  key={value}
                  className={`preview-col-filter__option${isSelected ? ' is-selected' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="preview-col-filter__checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      const newFilters = { ...customColumnFilters };
                      if (!newFilters[columnKey]) {
                        newFilters[columnKey] = [];
                      }
                      if (e.target.checked) {
                        newFilters[columnKey] = [...newFilters[columnKey], value];
                      } else {
                        newFilters[columnKey] = newFilters[columnKey].filter((v) => v !== value);
                        if (newFilters[columnKey].length === 0) {
                          delete newFilters[columnKey];
                        }
                      }
                      setCustomColumnFilters(newFilters);
                    }}
                  />
                  <span className="preview-col-filter__option-label">{value}</span>
                </label>
              );
            })}
          </div>
        </>
      );
    },
    [previewData, customColumnFilters, getColumnUniqueValues]
  );
  
  // Filter logic - based on checked value
  const applyColumnFilters = useCallback((data: any[], filters: Record<string, string[]>) => {
    if (Object.keys(filters).length === 0) {
      return data;
    }
    
    return data.filter(row => {
      return Object.entries(filters).every(([column, selectedValues]) => {
        if (!selectedValues || selectedValues.length === 0) return true;
        
        const cellValue = row[column];
        if (cellValue === null || cellValue === undefined) return false;
        
        return selectedValues.includes(String(cellValue));
      });
    });
  }, []);
  
  // Synchronize customColumnFilters to previewColumnFilters
  useEffect(() => {
    setPreviewColumnFilters(customColumnFilters);
  }, [customColumnFilters]);
  
  // Update filtered data
  useEffect(() => {
    // Reset filter if preview data changes but filter still points to non-existent column
    if (previewData.length > 0 && previewFilterMenu) {
      const sampleRow = previewData[0];
      if (!sampleRow.hasOwnProperty(previewFilterMenu.columnKey)) {
        resetPreviewFilters();
        return;
      }
    }
    
    const filtered = applyColumnFilters(previewData, previewColumnFilters);
    setFilteredPreviewData(filtered);
    setPreviewCurrentPage(0);
  }, [previewData, previewColumnFilters, applyColumnFilters, previewFilterMenu, resetPreviewFilters]);
  
  // Click outside the floating layer to close column filtering
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!previewFilterMenu) return;
      const target = event.target as Element;
      if (
        !target.closest('.preview-col-filter__trigger') &&
        !target.closest('.preview-col-filter__panel')
      ) {
        setPreviewFilterMenu(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [previewFilterMenu]);
  
  // Get all query results (no longer filter by pattern)
  const getAllQueryResults = useCallback(() => {
    try {
      if (!Array.isArray(queryResults)) {
        console.warn('queryResults is not an array:', queryResults);
        return [];
      }
      return queryResults; // Return all results without pattern filtering
    } catch (error) {
      console.error('Error in getAllQueryResults:', error);
      return [];
    }
  }, [queryResults]);

  // Get all downloadable query results
  const getDownloadableResults = useCallback(() => {
    return getAllQueryResults().filter(result => 
      result.status === 'success' && result.downloadUrl
    );
  }, [getAllQueryResults]);

  // Create column definition
  const columnHelper = createColumnHelper<QueryResult>();
  
  // Note: handleDownload and handlePreview are defined after useMemo, but need to be referenced in the dependency array
  // Since they use useCallback, they can be safely added to the dependency array
  const columns = useMemo(() => {
    const baseColumns: any[] = [
      // Account Info - always shown
    columnHelper.accessor('accountId', {
      id: 'accountId',
      header: () => 'Account Info',
      cell: (info) => info.getValue(),
      enableSorting: false,
      enableColumnFilter: true,
    }),
    ];

    // Dynamically add columns based on visibleColumns state
    if (visibleColumns.appId) {
      baseColumns.push(columnHelper.accessor('appId', {
      id: 'appId',
      header: () => 'APP ID',
      cell: (info) => (
        <span>
          {info.getValue()}
        </span>
      ),
      enableSorting: false,
      enableColumnFilter: true,
      }));
    }

    if (visibleColumns.appName) {
      baseColumns.push(columnHelper.accessor('appName', {
      id: 'appName',
      header: () => 'App Name',
      cell: (info) => info.getValue() || '-',
      enableSorting: false,
      enableColumnFilter: true,
      }));
    }

    if (visibleColumns.dataType) {
      baseColumns.push(columnHelper.accessor('dataType', {
      id: 'dataType',
      header: () => 'Data Type',
      cell: (info) => (
        <span style={{ textTransform: 'uppercase', fontWeight: 500, fontSize: '12px' }}>
          {info.getValue()}
        </span>
      ),
      enableSorting: false,
      enableColumnFilter: true,
      }));
    }

    if (visibleColumns.dateRange) {
      baseColumns.push(columnHelper.accessor('dateRange', {
      id: 'dateRange',
      header: () => 'Date Range',
      cell: (info) => {
        const dateRange = info.getValue();
        const sep = ' TO ';
        if (dateRange.includes('至') || dateRange.includes('TO') || dateRange.includes('To')) {
          const [start, end] = dateRange.split(/至|TO|To/);
          return `${start.trim()}${sep}${end.trim()}`;
        }
        return dateRange;
      },
      enableSorting: false,
      enableColumnFilter: true,
      }));
    }

    // Event Filter - only shown in non-aggregated mode and selected
    if (!isAggregateMode && visibleColumns.event_filter) {
      baseColumns.push(columnHelper.accessor('event_filter', {
        id: 'event_filter',
        header: () => 'Event Filter',
        cell: (info) => info.getValue() || '-',
        enableSorting: false,
        enableColumnFilter: true,
      }));
    }

    // Primary Attribution Count
    if (visibleColumns.primaryAttributionCount) {
      baseColumns.push(columnHelper.accessor('primaryAttributionCount', {
        id: 'primaryAttributionCount',
        header: () => 'Primary Attribution',
        cell: (info) => {
          const count = info.getValue();
          return count ? `${count}` : '-';
        },
        enableSorting: false,
        enableColumnFilter: true,
      }));
    }

    // AFID Deduplication Count
    if (visibleColumns.afidDeduplicationCount) {
      baseColumns.push(columnHelper.accessor('afidDeduplicationCount', {
        id: 'afidDeduplicationCount',
        header: () => 'AFID Deduplication',
        cell: (info) => {
          const count = info.getValue();
          return count ? `${count}` : '-';
        },
        enableSorting: false,
        enableColumnFilter: true,
      }));
    }

    // Media Source
    if (visibleColumns.mediaSource) {
      baseColumns.push(columnHelper.accessor('mediaSource', {
        id: 'mediaSource',
        header: () => 'Media Source',
        cell: (info) => info.getValue() || '-',
        enableSorting: false,
        enableColumnFilter: true,
      }));
    }

    // Mode
    if (visibleColumns.mode) {
      baseColumns.push(columnHelper.accessor('mode', {
        id: 'mode',
        header: () => 'Mode',
        cell: (info) => {
          const mode = info.getValue();
          return mode ? (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 select-none">
              {mode === 'aggregate' ? ('Aggregate') : ('Normal')}
            </span>
          ) : '-';
        },
        enableSorting: false,
        enableColumnFilter: true,
      }));
    }



    // Created At
    if (visibleColumns.createTime) {
      baseColumns.push(columnHelper.accessor('createTime', {
        id: 'createTime',
        header: () => 'Created At',
        cell: (info) => {
          const date = info.getValue();
          return date ? new Date(date).toLocaleString() : '-';
        },
        enableSorting: false,
        enableColumnFilter: true,
      }));
    }


    // Add fixed columns: Status, Log, Actions
    baseColumns.push(columnHelper.accessor('status', {
      id: 'status',
      header: () => 'Status',
      cell: (info) => {
        const record = info.row.original;
        const hasError = record.apiResponse?.status === 'error' || 
                        (record.apiResponse?.details?.error_type && record.apiResponse?.details?.error_code);
        
        let statusClass = 'appsflyer-status-default';
        let statusText = '';
        if (record.status === 'success' && !hasError) {
          statusClass = 'appsflyer-status-success';
          statusText = 'Success';
        } else if (record.status === 'error' || hasError) {
          statusClass = 'appsflyer-status-error';
          statusText = 'Error';
        } else if (record.status === 'processing') {
          statusClass = 'appsflyer-status-processing';
          statusText = 'Processing';
        }
        
        return (
          <div className={`appsflyer-status-tag ${statusClass}`}>
            {statusText}
          </div>
        );
      },
      enableSorting: false,
      enableColumnFilter: true,
    }));

    baseColumns.push(columnHelper.accessor('apiResponse', {
      id: 'log',
      header: () => 'Log',
      cell: (info) => {
        const record = info.row.original;
        let logText = '';
        
        if (record.status === 'processing') {
          logText = '';
        } else if (record.status === 'success') {
          const hasError = record.apiResponse?.status === 'error' || 
                          (record.apiResponse?.details?.error_type && record.apiResponse?.details?.error_code);
          if (hasError) {
            let showMsg = record.apiResponse?.message || record.message;
            if (record.apiResponse?.details?.error_type === 'authorization' && 
                record.apiResponse?.details?.error_code === '404') {
              showMsg = 'No Authorization';
            }
            logText = showMsg;
          } else {
            const rowCount = (record.apiResponse as any)?.details?.rowCount || 0;
            if (rowCount === 0) {
              logText = 'No Records';
            } else {
              logText = `${rowCount} ${rowCount > 1 ? 'Records' : 'Record'}`;
            }
          }
        } else {
          let showMsg = record.message;
          
          // Handle network errors
          if (record.apiResponse?.details?.error_type === 'network_error' && 
              record.apiResponse?.details?.error_code === 'NET_001') {
            showMsg = 'Network Error: SSL Handshake Failed';
          } else if (record.apiResponse?.details?.error_type === 'system_error' && 
                     record.apiResponse?.details?.error_code === 'SYS_001') {
            // System error
            showMsg = 'System Error';
          } else if (record.apiResponse?.details?.error_type === 'authorization' && 
                     record.apiResponse?.details?.error_code === '404') {
            // Authorization error
            showMsg = 'No Authorization';
          } else if (record.apiResponse?.details?.error_type === 'range_error' && 
                     record.apiResponse?.details?.error_code === '416') {
            // Range error
            showMsg = 'Data Range Error';
          } else if (showMsg === '请求上限' || showMsg === 'Request limit' || showMsg === 'Request Limit' ||
              showMsg === 'Request Limit') {
            showMsg = 'Request Limit';
          } else if (showMsg === '没有可用数据' || showMsg === 'No data available' ||
                     showMsg === 'No Data Available') {
            showMsg = 'No Data Available';
          } else if (showMsg === '无授权关系' || showMsg === 'No Authorized' ||
                     showMsg === '请检查授权关系' || showMsg === 'Please check authorization' ||
                     showMsg === 'No Authorization') {
            showMsg = 'No Authorization';
          }
          logText = showMsg;
        }
        
        return logText ? (
          <LogLink onClick={() => {
            setCurrentDetail(record);
            setDetailModalVisible(true);
          }}>
            {logText}
          </LogLink>
        ) : null;
      },
      enableSorting: false,
      enableColumnFilter: false,
    }));

    baseColumns.push(columnHelper.display({
      id: 'actions',
      header: () => 'Actions',
      cell: (info) => {
        const record = info.row.original;
        const rowCount = (record.apiResponse as any)?.details?.rowCount || 0;
        const hasNoData = rowCount === 0;
        
        return (
          <div 
            className="appsflyer-actions-container"
            style={{
              pointerEvents: 'auto',
              position: 'relative',
              zIndex: 1200,
              isolation: 'isolate',
              width: '100%',
              height: '52px',
              padding: '0 16px'
            }}
            onMouseEnter={(e) => e.stopPropagation()}
            onMouseLeave={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <IconPreviewButton
              disabled={record.status !== 'success'}
              onClick={() => handlePreview(record)}
              loading={previewing[record.key]}
            />
            <AppsFlyerDownloadButton
              disabled={record.status !== 'success' || hasNoData}
              onClick={() => handleDownload(record)}
              loading={downloading[record.key]}
            />
            <AppsFlyerDeleteButton
              onClick={() => {
                setRecordToDelete(record);
                setDeleteConfirmModalVisible(true);
              }}
              loading={deleting[record.key]}
            />
          </div>
        );
      },
      enableSorting: false,
      enableColumnFilter: false,
    }));

    return baseColumns;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleColumns, language, translations, previewing, downloading, deleting, columnHelper]);

  // Create a React Table instance - use synchronized data to avoid delayed rendering
  const allQueryResults = useMemo(() => getAllQueryResults(), [getAllQueryResults]);
  const table = useReactTable({
    data: allQueryResults,
    columns,
    state: {
      columnFilters,
      globalFilter,
    },
    // Remove sorting functionality
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    // Remove sorting model
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: PAGE_SIZE,
      },
    },
  });

  // Unified Query Results loading state:
  // 1) Only bind the bottom table loading to avoid the top query loading from accidentally triggering the skeleton
  // 2) The skeleton is also displayed in the first screen stage when accountConfigs is still loading.
  const queryResultsLoading = tableLoading || (isInitialLoad && (cacheLoading || !hasLoadedOnce));
  const queryResultsSkeletonMinHeight = QUERY_RESULTS_HEADER_HEIGHT + skeletonRowCount * QUERY_RESULTS_ROW_HEIGHT;

  const updateSkeletonRowCount = useCallback(() => {
    const containerHeight = queryResultsContainerRef.current?.clientHeight || 0;
    const bodyHeight = Math.max(
      PAGE_SIZE * QUERY_RESULTS_ROW_HEIGHT,
      containerHeight > QUERY_RESULTS_HEADER_HEIGHT
        ? containerHeight - QUERY_RESULTS_HEADER_HEIGHT
        : 0
    );
    const rowsByContainer = Math.ceil(bodyHeight / QUERY_RESULTS_ROW_HEIGHT);
    const rowsByData = allQueryResults.length > 0
      ? Math.min(MAX_SKELETON_ROWS, allQueryResults.length)
      : 0;
    const next = Math.min(
      MAX_SKELETON_ROWS,
      Math.max(MIN_SKELETON_ROWS, rowsByContainer, rowsByData, PAGE_SIZE)
    );
    setSkeletonRowCount((prev) => (prev === next ? prev : next));
  }, [PAGE_SIZE, allQueryResults.length]);

  useEffect(() => {
    updateSkeletonRowCount();
  }, [updateSkeletonRowCount]);

  useEffect(() => {
    if (!queryResultsLoading) {
      return;
    }

    updateSkeletonRowCount();

    const container = queryResultsContainerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateSkeletonRowCount();
    });
    observer.observe(container);

    const handleResize = () => updateSkeletonRowCount();
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [queryResultsLoading, updateSkeletonRowCount]);

  // Unified data loading entrance (aligned with AutoPipe loading method)
  const loadData = useCallback(async () => {
    // Prevent duplicate loading - strict inspection
    if (isLoadingRef.current) {
      return; // Return silently, do not print logs to avoid console noise
    }
    
    // Use timestamps to prevent repeated calls within a short period of time
    const now = Date.now();
    const MIN_LOAD_INTERVAL = 1000; // Minimum loading interval 1 second
    
    if (now - lastLoadTimeRef.current < MIN_LOAD_INTERVAL) {
      return; // If it is less than 1 second since the last load, return directly
    }
    lastLoadTimeRef.current = now;
    
    isLoadingRef.current = true;
    const token = ++loadingTokenRef.current;
    const loadStartedAt = Date.now();
    const MIN_LOADING_MS = 320;
    setTableLoading(true);
    
    try {
      
      // Remove mode filtering, load all data, and do no data filtering
      // The difference is that the Mode field is used to distinguish the execution mode of the records.
      const response = await axiosInstance.get<{
        status: string;
        data: QueryResult[];
      }>('/api/query-results');

      if (response.data.status === 'success') {
        const formattedResults = response.data.data.map(record => {
          const newRecord: QueryResult = { ...record };
          const details = record.apiResponse?.details;
          if (details) {
            if (details.appName) newRecord.appName = details.appName;
            if (typeof details.afidDeduplicationCount === 'number') newRecord.afidDeduplicationCount = details.afidDeduplicationCount;
            if (typeof details.primaryAttributionCount === 'number') newRecord.primaryAttributionCount = details.primaryAttributionCount;
          }
          // Make sure the mode field is set correctly (obtained from the data returned by the backend, without filtering)
          // newRecord.mode is already set by the backend and does not need to be overridden
          // Make sure the createTime field is mapped correctly
          if (record.createTime) newRecord.createTime = record.createTime;
          return newRecord;
        });
        
        // Deduplication has been migrated to the backend for unified judgment (including the user_id dimension), and the frontend directly uses the returned results.
        setQueryResults(formattedResults);
        
        // Save to localStorage
        localStorage.setItem('allQueryResults', JSON.stringify(formattedResults));
      } else {
        setQueryResults([]);
        localStorage.setItem('allQueryResults', JSON.stringify([]));
      }
    } catch (error) {
      console.error('Failed to load query results:', error);
      // No longer restore from localStorage: avoid showing "ghost" records (which were never obtained in this session and the backend no longer exists, so they cannot be deleted)
      setQueryResults([]);
      try {
        localStorage.removeItem('allQueryResults');
      } catch (_) { /* ignore */ }
    } finally {
      const elapsed = Date.now() - loadStartedAt;
      if (elapsed < MIN_LOADING_MS) {
        await waitForMs(MIN_LOADING_MS - elapsed);
      }
      if (loadingTokenRef.current === token) {
        setTableLoading(false);
      }
      // Use functional updates without relying on isInitialLoad
      setIsInitialLoad(prev => {
        if (prev) return false;
        return prev;
      });
      setHasLoadedOnce(true);
      isLoadingRef.current = false; // Reset loading status
    }
  }, []);
  
  // Use ref to store the loadData function to avoid infinite loops caused by dependencies
  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);
  
  // Remove independent account configuration loading logic and uniformly use accountConfigs provided by Context
  // Context is already responsible for loading and caching account configuration, no need to load it again
  
  // Use ref to track whether the account configuration has been initialized to avoid repeated execution
  const accountConfigsInitializedRef = useRef(false);
  
  // When the accountConfigs provided by Context is loaded, the first account type is automatically selected.
  useEffect(() => {
    // Only executed when the account configuration is loaded, has data, and has not yet been initialized.
    if (!cacheLoading && accountConfigs.length > 0 && !selectedAccountType && !accountConfigsInitializedRef.current) {
      const firstConfig = accountConfigs[0];
      accountConfigsInitializedRef.current = true; // Tag is initialized
      setSelectedAccountType(firstConfig.account_type as AccountType);
      setFieldsValue({
        accountType: firstConfig.account_type,
        accountId: firstConfig.account_name
      });
    }
    // If accountConfigs becomes empty, reset the initialization flag
    if (accountConfigs.length === 0) {
      accountConfigsInitializedRef.current = false;
    }
  }, [accountConfigs, cacheLoading, selectedAccountType]); // Add accountConfigs dependency

  const loadAccountInfo = useCallback((accountType: AccountType) => {
    // Optimization: Only search accountConfigs when they have been loaded and have data to avoid repeated API requests
    if (!accountConfigs || accountConfigs.length === 0) {
      return;
    }
    
    try {
      // Find from accountConfigs provided by AccountContext (synchronous operation, no longer making API requests)
      const info = getAccountInfo(accountType, accountConfigs);
      setAccountInfo(info || null);
    } catch (error) {
      showToast('error', 'Failed to get account info');
    }
  }, [showToast, accountConfigs]); // Add accountConfigs dependency and use the data provided by Context

  // Use ref to track the last loaded accountType to avoid repeated calls
  const lastLoadedAccountTypeRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Optimization: Only try to load account information when accountConfigs has been loaded and has data
    if (!accountConfigs || accountConfigs.length === 0) {
      return;
    }
    
    const accountType = getFieldValue('accountType');
    // Load only if accountType exists, is a string, and is different from the last loaded
    if (accountType && typeof accountType === 'string' && accountType !== lastLoadedAccountTypeRef.current) {
      lastLoadedAccountTypeRef.current = accountType;
      loadAccountInfo(accountType as AccountType);
    }
  }, [formValues.accountType, loadAccountInfo, getFieldValue, accountConfigs]); // Add accountConfigs dependency to ensure data is loaded

  // Use ref to track whether it has been initially loaded to avoid repeated calls
  const dataInitializedRef = useRef(false);
  const lastAggregateModeRef = useRef<boolean>(isAggregateMode);

  // Initial loading of data (when the page is mounted, it enters the skeleton state and pulls Query Results)
  useEffect(() => {
    if (dataInitializedRef.current) {
      return;
    }
    dataInitializedRef.current = true;
    setTableLoading(true);
    loadDataRef.current();
  }, []);

  // Removed data reloading logic when schema changes
  // Mode switching does not affect the data loading logic at the bottom. All data is loaded universally without data filtering.
  // The difference is that the Mode field is used to distinguish the execution mode of the records.
  useEffect(() => {
    // Only update ref, do not reload data
    lastAggregateModeRef.current = isAggregateMode;
  }, [isAggregateMode]);

  // Turn off "Auto-refresh on visibility/focus recovery" to avoid unexpected secondary skeleton loading after initialization
  // Refresh data is uniformly triggered by: first screen initialization, query execution, deletion operation, global refresh/page switching.

  // Team switching is triggered by TeamSwitcher. Full page reload, no need to listen here anymore

  // Save query results
  const saveQueryResults = async (results: QueryResult[]) => {
    try {
      const accountType = getFieldValue('accountType');
      const accountId = getFieldValue('accountId');
      const mediaSource = getFieldValue('mediaSource'); // Get media source
      
      if (!accountType || !accountId) {
        throw new Error('Missing account information');
      }
      
      // Create or update query logs in batches
      await Promise.all(results.map(async (result) => {
        if (result.key) {
          // Update existing record
          const [fromDate, toDate] = result.dateRange.split(/至|TO|To/).map(date => date.trim());
          await axiosInstance.put(`/api/query-logs/${result.key}`, {
            ...result,
            accountType,
            accountId,
            mediaSource, // Save media source
            fromDate,
            toDate
          });
        } else {
          // Create new record
          const [fromDate, toDate] = result.dateRange.split(/至|TO|To/).map(date => date.trim());
          await axiosInstance.post('/api/query-logs', {
            ...result,
            accountType,
            accountId,
            mediaSource, // Save media source
            fromDate,
            toDate
          });
        }
      }));
    } catch (error) {
      console.error('Failed to save query results:', error);
      showToast('error', '保存查询结果失败');
    }
  };

  // Delete query results
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleDelete = async (record: QueryResult) => {
    try {
      setDeleting(prev => ({ ...prev, [record.key]: true }));
      await waitForNextFrame();
      const accountType = getFieldValue('accountType');
      const accountId = getFieldValue('accountId');
      const mediaSource = getFieldValue('mediaSource'); // Get media source
      if (!accountType || !accountId) {
        throw new Error('Missing account information');
      }
      if (record.status === 'error' || record.status === 'failed') {
        const [fromDate, toDate] = record.dateRange.split(/至|TO|To/).map(date => date.trim());
        await axiosInstance.delete(`/api/query-logs/${record.key}`, {
          params: {
            accountType: record.accountType,
            accountId: record.accountId,
            dataType: record.dataType,
            fromDate,
            toDate,
            mediaSource: mediaSource // Deliver media source
          }
        });
        // Unified server-side refresh is used to prevent local deletion and then overwriting by recovery/refresh, causing sequence problems.
        await loadData();
        showToast('success', 'Deleted successfully');
      } else {
        setRecordToDelete(record);
        setDeleteConfirmModalVisible(true);
      }
    } catch (error) {
      console.error('删除查询结果失败:', error);
      showToast('error', '删除查询结果失败');
    } finally {
      setDeleting(prev => ({ ...prev, [record.key]: false }));
    }
  };

  // Confirm deletion
  const confirmDelete = async () => {
    if (recordToDelete) {
      const startedAt = Date.now();
      const MIN_ACTION_LOADING_MS = 300;
      try {
        setDeleting(prev => ({ ...prev, [recordToDelete.key]: true }));
        await waitForNextFrame();
        const accountType = getFieldValue('accountType');
        const accountId = getFieldValue('accountId');
        const mediaSource = getFieldValue('mediaSource'); // Get media source
        if (!accountType || !accountId) {
          throw new Error('Missing account information');
        }
        const [fromDate, toDate] = recordToDelete.dateRange.split(/至|TO|To/).map(date => date.trim());
        await axiosInstance.delete(`/api/query-logs/${recordToDelete.key}`, {
          params: {
            accountType: recordToDelete.accountType,
            accountId: recordToDelete.accountId,
            dataType: recordToDelete.dataType,
            fromDate,
            toDate,
            mediaSource: mediaSource // Deliver media source
          }
        });
        // Unified server-side refresh
        await loadData();
        showToast('success', 'Deleted successfully');
        setDeleteConfirmModalVisible(false);
        setRecordToDelete(null);
      } catch (error) {
        console.error('Failed to delete query result:', error);
        showToast('error', '删除查询结果失败');
      } finally {
        const elapsed = Date.now() - startedAt;
        if (elapsed < MIN_ACTION_LOADING_MS) {
          await waitForMs(MIN_ACTION_LOADING_MS - elapsed);
        }
        if (recordToDelete) {
          setDeleting(prev => ({ ...prev, [recordToDelete.key]: false }));
        }
      }
    }
  };

  // Undelete
  const cancelDelete = () => {
    setDeleteConfirmModalVisible(false);
    setRecordToDelete(null);
  };

  // If you need to update the status after downloading, you must also save it
  const handleDownload = async (record: QueryResult) => {
    const startedAt = Date.now();
    const MIN_ACTION_LOADING_MS = 300;
    try {
      if (!record.downloadUrl) {
        showToast('error', 'No download URL');
        return;
      }
      setDownloading(prev => ({ ...prev, [record.key]: true }));
      await waitForNextFrame();
      
      // Use a more reliable download method
      const response = await axiosInstance.get(record.downloadUrl, {
        responseType: 'blob',
        timeout: 30000, // 30 seconds timeout
      });
      
      // Download the file directly, the backend has already processed the Postback URL field
      const blob = new Blob([response.data as Blob], { 
        type: 'text/csv;charset=utf-8;' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const filename = record.downloadUrl.split('/').pop() || 'download.csv';
      link.download = filename;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
      
      showToast('success', 'Download successful');
    } catch (error) {
      console.error('Download error:', error);
      showToast('error', 'Download failed');
      // Update record status failed
      setQueryResults(prev => {
        const updated = prev.map(item => {
          if (item.key === record.key) {
            return { ...item, status: 'error' as const, message: 'Download failed' };
          }
          return item;
        });
        saveQueryResults(updated);
        
        // Save to localStorage
        localStorage.setItem('allQueryResults', JSON.stringify(updated));
        
        return updated;
      });
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_ACTION_LOADING_MS) {
        await waitForMs(MIN_ACTION_LOADING_MS - elapsed);
      }
      setDownloading(prev => ({ ...prev, [record.key]: false }));
    }
  };

  // Table highlight animation style
  const style = document.createElement('style');
  style.innerHTML = `
  .highlight-row {
    animation: highlight-fade 2s;
    background: #ffe58f !important;
  }
  .highlight-row-processing {
    animation: highlight-fade-processing 2s;
    background: #e6fffb !important;
  }
  @keyframes highlight-fade {
    0% { background: #ffe58f; }
    100% { background: transparent; }
  }
  @keyframes highlight-fade-processing {
    0% { background: #e6fffb; }
    100% { background: transparent; }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideInBubble {
    from {
      opacity: 0;
      transform: translateY(-10px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }`;
  document.head.appendChild(style);


  // Add import status











  // WebSocket connections - temporarily disabled to avoid connection warnings
  useEffect(() => {
    // If your app really requires WebSocket functionality, uncomment the following code
    // and make sure the backend WebSocket service is running
    
    /*
    let socket: any = null;
    
    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port ? `:${window.location.port}` : '';
        
        socket = io(`${protocol}//${host}${port}`, {
          path: '/socket.io',
          transports: ['polling'], // Only use polling to avoid WebSocket connection issues
          reconnection: false,
          timeout: 5000,
          autoConnect: false
        });

        socket.on('connect', () => {
          console.log('Socket connected via polling');
        });

        socket.on('connect_error', (error: any) => {
          console.warn('Socket connection failed:', error.message);
        });

        socket.connect();
      } catch (error) {
        console.error('Error creating socket connection:', error);
      }
    };

    // Delayed connection
    const timer = setTimeout(connectWebSocket, 500);

    return () => {
      clearTimeout(timer);
      if (socket) {
        socket.disconnect();
        socket.removeAllListeners();
      }
    };
    */
  }, []);

  // Additional cleanup when page is unloaded
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Make sure WebSocket is closed correctly before unloading the page
      try {
        const sockets = document.querySelectorAll('script[src*="socket.io"]');
        if (sockets.length > 0) {
          console.log('Cleaning up WebSocket connections before page unload');
        }
      } catch (error) {
        console.warn('Error during page unload cleanup:', error);
      }
    };

    const handlePageHide = () => {
      // Cleanup when page is hidden
      console.log('Page hidden, cleaning up WebSocket connections');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  // Handle queries
  const handleQuery = async (values: FormValues) => {
    // Mark the user's active trigger to avoid first screen restoration coverage
    userInteractedRef.current = true;
    // Prevent duplicate requests
    if (queryInProgressRef.current) {
      showToast('warning', '查询正在进行中，请勿重复操作');
      return;
    }
    
          // Prevent unexpected commits when switching modes
      if (!values.appIds || !values.appIds.trim()) {
        console.log('Preventing accidental submission during mode switch: missing APP ID');
        queryInProgressRef.current = false;
        return;
      }
    
    queryInProgressRef.current = true;
    try {
      setLoading(true);
      const [startDate, endDate] = values.dateRange;
      
      
      const appIds = values.appIds.split(',').map(id => id.trim());
      const selectedAccount = accountConfigs.find(
        config => config.account_name === values.accountId && config.account_type === values.accountType
      );
      if (!selectedAccount) throw new Error('Account configuration not found');
      
      // Get token on demand, not exposed in list API
      let apiToken = '';
      try {
        apiToken = await getAccountToken(selectedAccount.id);
      } catch (error) {
        throw new Error('Failed to get API token for account');
      }

      // Check for duplicate records in batches - optimize performance
      try {
        const checkResponse = await axiosInstance.post<CheckDuplicateResponse>('/api/check-duplicate-query', {
          accountType: values.accountType,
          accountId: values.accountId,
          dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
          fromDate: startDate.local().format('YYYY-MM-DD'),
          toDate: endDate.local().format('YYYY-MM-DD'),
          appIds: appIds, // Check all appIds in batch
          eventFilter: values.eventFilter || '',
          mode: isAggregateMode ? 'aggregate' : 'normal'
        });

        if (checkResponse.data.isDuplicate && checkResponse.data.record) {
          const existingRecord = checkResponse.data.record;
          
          // Sets the highlight state immediately - without waiting for any asynchronous operations
          setHighlightKey(existingRecord.id);
          setHighlightType(existingRecord.status);

          // Promote duplicate records to the first item on the first page to prevent users from manually turning pages for positioning.
          setQueryResults(prev => {
            const index = prev.findIndex(result => result.key === existingRecord.id);
            if (index <= 0) {
              return prev;
            }
            const target = prev[index];
            const reordered = [target, ...prev.slice(0, index), ...prev.slice(index + 1)];
            localStorage.setItem('allQueryResults', JSON.stringify(reordered));
            return reordered;
          });
          setCurrentPage(1);
          
          // Clear highlight after 3 seconds
          setTimeout(() => {
            setHighlightKey(null);
            setHighlightType(null);
          }, 3000);

          let messageText = '';
          switch (existingRecord.status) {
            case 'processing':
              messageText = '该条件下的数据正在请求中，请勿重复操作！';
              break;
            case 'success':
              messageText = '已存在相同条件的成功记录，无需重复获取！';
              break;
            case 'failed':
            case 'error':
              messageText = '该条件下的查询已失败，请先删除失败记录后再重试！';
              break;
            default:
              messageText = '已存在相同条件的查询记录，请勿重复操作！';
          }
          showToast('warning', messageText);
          setLoading(false);
          queryInProgressRef.current = false;
          return;
        }
      } catch (error: unknown) {
        console.error('检查重复查询失败:', error);
        const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
        showToast('error', msg && String(msg).trim() ? msg : '检查重复查询失败');
        setLoading(false);
        queryInProgressRef.current = false;
        return;
      }

      // Insert the processing record first
      const processingRecords = appIds.map(appId => {
        const timestamp = Math.floor(Date.now() / 1000);  // Remove milliseconds
        const now = new Date();
        return {
          key: `${timestamp}_${appId}`,  // Temporary key, will be updated after query
          appId,
          dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
          dateRange: `${startDate.local().format('YYYY-MM-DD')} To ${endDate.local().format('YYYY-MM-DD')}`,
          status: 'processing' as const,
          message: 'Processing',
          downloadUrl: '',
          apiResponse: {},
          accountType: values.accountType,
          accountId: values.accountId,
          mediaSource: values.mediaSource || '', // Add media source, empty value instead of 'All Media Source'
          mode: isAggregateMode ? 'aggregate' : 'normal', // Add schema information
          createTime: now.toISOString() // Add creation time
        };
      });

      // Only update front-end status: insert processing records directly to the top of the table
      setQueryResults(prev => [...processingRecords, ...prev]);
      setCurrentPage(1);

      // Record the mapping between key and appId to facilitate subsequent updates
      const keyMap = processingRecords.reduce((acc, rec) => { acc[rec.appId] = rec.key; return acc; }, {} as Record<string, string>);
      
      // real query
      const queryPromises = appIds.map(async (appId) => {
        const queryParams = {
          accountName: values.accountId,
          accountType: values.accountType,
                      dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
          fromDate: startDate.local().format('YYYY-MM-DD'),
          toDate: endDate.local().format('YYYY-MM-DD'),
          appId: appId,
          apiToken: apiToken,
          eventFilter: values.eventFilter || '',  // Add event_filter field
          mediaSource: values.mediaSource || '', // Add media source, empty value instead of 'All Media Source'
          mode: isAggregateMode ? 'aggregate' : 'normal' // Add mode parameters
        };
        
        try {
          const response = await retryWithDelay(
            async () => {
              const result = await axiosInstance.post<ApiResponse>('/api/query-data', queryParams);
              return result;
            },
            2, // Retry up to 2 times
            1000 // 1 second delay
          );
          // Make sure to use the queryId returned by the backend as the key
          const queryId = response.data.queryId;
          if (!queryId) {
            throw new Error('后端未返回queryId');
          }
          
          const result: QueryResult = {
            key: queryId,  // Use the queryId returned by the backend
            appId,
            dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
            dateRange: `${startDate.local().format('YYYY-MM-DD')} To ${endDate.local().format('YYYY-MM-DD')}`,
            status: response.data.status === 'duplicate'
              ? ((response.data.existingStatus as QueryResult['status']) || 'processing')
              : ('success' as const),
            message: response.data.status === 'duplicate'
              ? (response.data.message || 'Duplicate query skipped')
              : '',
            downloadUrl: response.data.downloadUrl,
            apiResponse: response.data.apiResponse || response.data,
            appName: response.data.details?.appName || '',
            accountType: values.accountType,
            accountId: values.accountId,
            event_filter: values.eventFilter || '',  // Add event_filter field
            mediaSource: values.mediaSource || '', // Add media source, empty value instead of 'All Media Source'
            mode: isAggregateMode ? 'aggregate' : 'normal' // Add schema information
          };

          if (typeof response.data.details?.afidDeduplicationCount === 'number') {
            result.afidDeduplicationCount = response.data.details.afidDeduplicationCount;
          }
          if (typeof response.data.details?.primaryAttributionCount === 'number') {
            result.primaryAttributionCount = response.data.details.primaryAttributionCount;
          }
          
          return result;
        } catch (error: any) {
          // Handling 404 errors
          if (error.response?.status === 404) {
            // Get queryId from error response
            const queryId = error.response.data?.queryId;
            if (!queryId) {
              throw new Error('后端未返回queryId');
            }
            
            return {
              key: queryId,  // Use the queryId returned by the backend
              appId,
              dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
              dateRange: `${startDate.local().format('YYYY-MM-DD')} To ${endDate.local().format('YYYY-MM-DD')}`,
              status: 'error' as const,
              message: 'No Authorization',
              downloadUrl: '',
              apiResponse: error.response?.data,
              appName: '',
              afidDeduplicationCount: 0,
              primaryAttributionCount: 0,
              accountType: values.accountType,
              accountId: values.accountId,
              event_filter: values.eventFilter || '',  // Add event_filter field
              mediaSource: values.mediaSource || '', // Add media source, empty value instead of 'All Media Source'
              mode: isAggregateMode ? 'aggregate' : 'normal' // Add schema information
            };
          }
          
          // Handle other errors
          // Get queryId from error response
          const queryId = error.response?.data?.queryId;
          if (!queryId) {
            throw new Error('后端未返回queryId');
          }
          
          return {
            key: queryId,  // Use the queryId returned by the backend
            appId,
            dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
            dateRange: `${startDate.local().format('YYYY-MM-DD')} To ${endDate.local().format('YYYY-MM-DD')}`,
            status: 'error' as const,
            message: error.message || 'Data fetch failed',
            downloadUrl: '',
            apiResponse: error.response?.data,
            appName: '',
            afidDeduplicationCount: 0,
            primaryAttributionCount: 0,
            accountType: values.accountType,
            accountId: values.accountId,
            event_filter: values.eventFilter || '',  // Add event_filter field
            mediaSource: values.mediaSource || '', // Add media source, empty value instead of 'All Media Source'
            mode: isAggregateMode ? 'aggregate' : 'normal' // Add schema information
          };
        }
      });

      const results = await Promise.all(queryPromises);
      
      // Update the query results and replace the temporary key with the queryId returned by the backend
      const updatedResults = results.map(result => {
        const tempKey = keyMap[result.appId];
        return {
          ...result,
          tempKey, // Save temporary key for updating UI
        };
      });
      
      // Update query results
      await saveQueryResults(updatedResults);
      setQueryResults(prev => {
        const updated = prev.map(item => {
          const found = updatedResults.find(r => r.tempKey === item.key);
          if (found) {
            const { tempKey, ...rest } = found;
            // Make sure the createTime field is preserved correctly
            const createTime = (rest as any).createTime || item.createTime;
            return { ...rest, createTime };
          }
          return item;
        });
        
        // Save to localStorage
        localStorage.setItem('allQueryResults', JSON.stringify(updated));
        
        return updated;
      });
      // New: Automatically set basic log information to the latest one
      if (updatedResults && updatedResults.length > 0) {
        const { tempKey, ...firstResult } = updatedResults[0];
        setCurrentDetail(firstResult);
      }

      // Success/failure prompt
      const hasSuccess = results.some(result => result.status === 'success');
      if (hasSuccess) {
        showToast('success', 'Data fetched successfully');
      } else {
        showToast('error', 'Data fetch failed');
      }
    } catch (error: any) {
      showToast('error', error.message || 'Data fetch failed');
    } finally {
      setLoading(false);
      queryInProgressRef.current = false;
    }
  };

  // Handle account type changes
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleAccountTypeChange = useCallback((value: string) => {
    setSelectedAccountType(value as AccountType);
    const matched = accountConfigs.find(cfg => cfg.account_type === value);
    setFieldsValue({ accountId: matched ? matched.account_name : '' });
    if (value === ACCOUNT_TYPES.PRT) {
      setFieldsValue({ mediaSource: '' }); // Empty value instead of 'All Media Source'
    } else {
      setFieldsValue({ mediaSource: undefined });
    }
    setAccountInfo(null);

  }, [accountConfigs]);

  // Handle account ID changes
  const handleAccountIdChange = useCallback((value: string) => {
    setFieldsValue({ accountId: value });

  }, []);

  // Process APP ID input - only numbers, English letters, periods, dashes, and underscores are allowed
  const handleAppIdsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only numbers, English letters, periods, dashes, and underlines are retained, and other characters are automatically filtered
    const filteredValue = value.replace(/[^a-zA-Z0-9.\-_]/g, '');
    setFieldsValue({ appIds: filteredValue });
  }, []);

  // Handling Media Source changes
  const handleMediaSourceChange = useCallback((value: string) => {
    setFieldsValue({ mediaSource: value });
  }, []);

  // Handle event filter changes
  const handleEventFilterChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFieldsValue({ eventFilter: e.target.value });
  }, []);

  // Handle date range changes
  const handleDateRangeChange = useCallback((dates: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    if (dates) {
      setDateRange(dates);
      // Create a date object using moment's native mode, ensuring no time zone conversion
      setFieldsValue({ 
        dateRange: dates ? [
          moment(dates[0].format('YYYY-MM-DD'), 'YYYY-MM-DD', true), 
          moment(dates[1].format('YYYY-MM-DD'), 'YYYY-MM-DD', true)
        ] as [moment.Moment, moment.Moment] : [
          moment().subtract(1, 'day'), 
          moment().subtract(1, 'day')
        ] as [moment.Moment, moment.Moment] 
      });
    }
  }, []);

  // Adapter function: Convert disabledDate of dayjs to moment
  const disabledDateAdapter = (current: dayjs.Dayjs) => {
    return current && current > dayjs().endOf('day');
  };


  // Show detailed log
  const handlePreview = async (record: QueryResult) => {
    const startedAt = Date.now();
    const MIN_ACTION_LOADING_MS = 300;
    try {
      setPreviewing(prev => ({ ...prev, [record.key]: true }));
      await waitForNextFrame();
      
      // Reset filter status before opening a new preview
      resetPreviewFilters();
      
      const response = await axiosInstance.get(`/api/query-logs/${record.key}/preview`, {
        params: {
          accountType: record.accountType,
          accountId: record.accountId,
          limit: 1000  // Increase preview data limit to 1000 items
        }
      });
      
      // Make sure the response data is an array
      const previewData = Array.isArray(response.data) ? response.data : [];
      setPreviewData(previewData);
      setSelectedPreviewRecord(record);
      setPreviewCurrentPage(0); // Reset pagination to first page
      setPreviewModalVisible(true);
    } catch (error) {
      console.error('获取预览数据失败:', error);
      showToast('error', 'Failed to get preview data');
      // Reset preview state even if it fails
      setPreviewData([]);
      setSelectedPreviewRecord(null);
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_ACTION_LOADING_MS) {
        await waitForMs(MIN_ACTION_LOADING_MS - elapsed);
      }
      setPreviewing(prev => ({ ...prev, [record.key]: false }));
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _showDetail = async (record: QueryResult) => {
    console.log('显示详情:', record);
    setCurrentDetail(record);
    setDetailModalVisible(true);
    
    // If there is no appName and there is an appId, query the AppsFinder database
    if (!record.appName && record.appId) {
      try {
        const response = await axiosInstance.get<{appName: string | null}>(`/api/apps-finder/app-name/${record.appId}`);
        if (response.data.appName) {
          setQueriedAppName(response.data.appName);
        } else {
          setQueriedAppName(null);
        }
      } catch (error) {
        console.error('查询App Name失败:', error);
        setQueriedAppName(null);
      }
    } else {
      setQueriedAppName(null);
    }
  };


  // Date shortcut options (moved inside useMemo to avoid dependency changes)
  const quickRangesAdapter = useMemo(() => {
    const today = dayjs().endOf('day');
    const getMonday = (d: dayjs.Dayjs) => d.day() === 0 ? d.subtract(6, 'day') : d.day(1);
    const getSunday = (d: dayjs.Dayjs) => d.day() === 0 ? d : d.day(7);
    const min = (a: dayjs.Dayjs, b: dayjs.Dayjs) => (a.isBefore(b) ? a : b);
    
    const quickRanges = [
      { label: 'This Week', value: [getMonday(dayjs()), min(getSunday(dayjs()), today)] },
      { label: 'Last Week', value: [getMonday(dayjs().subtract(1, 'week')), getSunday(dayjs().subtract(1, 'week'))] },
      { label: 'This Month', value: [dayjs().startOf('month'), min(dayjs().endOf('month'), today)] },
      { label: 'Last Month', value: [dayjs().subtract(1, 'month').startOf('month'), min(dayjs().subtract(1, 'month').endOf('month'), today)] },
    ];
    
    return quickRanges.map(range => ({
      label: range.label,
      value: range.value as [dayjs.Dayjs, dayjs.Dayjs]
    }));
  }, []); // Empty dependency array since all calculations are done inside useMemo

  // Add new state on top of component
  const [downloadAllModalVisible, setDownloadAllModalVisible] = useState(false);
  const [deleteAllModalVisible, setDeleteAllModalVisible] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [editTableModalVisible, setEditTableModalVisible] = useState(false);

  // Add the ability to click outside to close the drop-down menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.widget-dropdown-button') && !target.closest('.dropdown-menu')) {
        setDropdownVisible(false);
      }
    };

    if (dropdownVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [dropdownVisible]);

  // Add new handler function
  const handleDownloadAll = async () => {
    try {
      setIsDownloadingAll(true);
      setDownloadAllModalVisible(false);  // Close confirmation popup
      
      // Get downloadable query results in the current mode
      const downloadableResults = getDownloadableResults();
      if (downloadableResults.length === 0) {
        showToast('warning', 'No data to download');
        return;
      }
      

      
      // Download files one by one
      for (let i = 0; i < downloadableResults.length; i++) {
        const record = downloadableResults[i];
        try {
          // Use the same logic as a single download
          const response = await axiosInstance.get(record.downloadUrl!, {
            responseType: 'blob',
            timeout: 30000, // 30 seconds timeout
          });
          
          // Create download link
          const blob = new Blob([response.data as Blob], { 
            type: 'text/csv;charset=utf-8;' 
          });
          const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
          // Extract filename from downloadUrl
          const filename = record.downloadUrl!.split('/').pop() || 'download.csv';
          link.download = filename;
          
          // trigger download
      document.body.appendChild(link);
      link.click();
          document.body.removeChild(link);
          
          // Clean up URL objects
      window.URL.revokeObjectURL(url);
      
          // Add a small delay to avoid browser blocking multiple downloads
          if (i < downloadableResults.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
    } catch (error) {
          console.error(`下载文件失败 ${record.key}:`, error);
          // Continue downloading other files without interrupting the entire process
        }
      }
      
      showToast('success', `Successfully downloaded ${downloadableResults.length} files`);
    } catch (error) {
      console.error('批量下载失败:', error);
      showToast('error', 'Download failed');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      setDeletingAll(true);
      setTableLoading(true);
      setDeleteAllModalVisible(false);
      
      // Get all current query results
      const currentResults = getAllQueryResults();
      if (currentResults.length === 0) {
        showToast('warning', 'No data to delete');
        return;
      }
      
      // Delete all records without limiting the status (including processing, failed, success, etc.)
      const deletedRecords: QueryResult[] = [];
      const failedRecords: QueryResult[] = [];
      
      // Use Promise.allSettled to delete in parallel to improve speed
      const deletePromises = currentResults.map(async (record) => {
        try {
          const response = await axiosInstance.delete(`/api/query-results/${record.key}`, {
            params: {
              accountType: record.accountType,
              accountId: record.accountId
            }
          });
          
          if (response.data && (response.data as any).success) {
            return { success: true, record };
          } else {
            return { success: false, record, error: 'Backend returned failure' };
          }
        } catch (error: unknown) {
          // When the backend returns 404 (record does not exist), it is still removed from the list to avoid "ghost" records remaining
          const status = (error as { response?: { status?: number } })?.response?.status;
          if (status === 404) return { success: true, record };
          return { success: false, record, error: error };
        }
      });
      
      // Wait for all deletions to complete
      const results = await Promise.allSettled(deletePromises);
      
      // Processing results
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            deletedRecords.push(result.value.record);
          } else {
            failedRecords.push(result.value.record);
            console.error(`删除记录失败 ${result.value.record.key}:`, result.value.error);
          }
        } else {
          // The situation when Promise is rejected
          console.error('删除操作被拒绝:', result.reason);
        }
      });
      
      // Update local state and cache
      if (deletedRecords.length > 0) {
        // Remove successfully deleted records from local status
        setQueryResults(prev => prev.filter(result => 
          !deletedRecords.some(deleted => deleted.key === result.key)
        ));
        
        // Update localStorage cache
        const remainingResults = currentResults.filter(result => 
          !deletedRecords.some(deleted => deleted.key === result.key)
        );
        localStorage.setItem('allQueryResults', JSON.stringify(remainingResults));
      }
      
      // Reset pagination to first page
      setCurrentPage(1);
      
      // Show result message
      if (failedRecords.length === 0) {
        showToast('success', `Successfully deleted ${deletedRecords.length} records`);
      } else if (deletedRecords.length > 0) {
        showToast('warning', `Deleted ${deletedRecords.length} records, ${failedRecords.length} failed`);
      } else {
        showToast('error', `Failed to delete all ${failedRecords.length} records`);
      }
    } catch (error) {
      console.error('批量删除失败:', error);
      showToast('error', 'Delete failed');
    } finally {
      setDeletingAll(false);
      setTableLoading(false);
    }
  };

  // Add state to component
  const [showEventFilter, setShowEventFilter] = useState(false);

  // Update display state when data type selection changes
  const handleDataTypeChange = useCallback((value: DataType | string) => {
    // Only dataType in Normal mode needs to check the event type
    if (Object.values(DATA_TYPES).includes(value as DataType)) {
      setShowEventFilter(isEventType(value as DataType));
    } else {
      // Event filtering is not required in Aggregate mode
      setShowEventFilter(false);
    }
    setFieldsValue({ 
      dataType: value,
      eventFilter: undefined 
    }); // Clear event filtering and set new data type when switching data types
  }, []);

  // New: Aggregate mode switching processing function
  const handleAggregateModeToggle = async () => {
    const newMode = !isAggregateMode;
    
    // Update modal state immediately to ensure top controls respond immediately
    setIsAggregateMode(newMode);
    
    // Save schema to localStorage (optional, for persistence)
    localStorage.setItem('aggregateMode', newMode ? 'true' : 'false');
    
    // Clear key fields immediately to prevent accidental submissions
    setFieldsValue({
      appIds: '',
      dataType: undefined,
      dateRange: undefined
    });
    
    // Delay form reset to avoid triggering unexpected submissions
    setTimeout(() => {
      // Completely reset all form fields
      resetFields();
      
      // Set default values based on new mode
      if (newMode) {
        // Aggregate mode: set to PRT account type
        setFieldsValue({
          accountType: ACCOUNT_TYPES.PRT,
          mediaSource: undefined,
          eventFilter: undefined,
          appIds: undefined,
          dataType: undefined,
          dateRange: undefined
        });
        
        // If there is a PRT account, the first one will be automatically selected
        const prtAccounts = accountConfigs.filter(config => config.account_type === ACCOUNT_TYPES.PRT);
        if (prtAccounts.length > 0) {
          setFieldsValue({ accountId: prtAccounts[0].account_name });
        }
      } else {
        // Normal mode: set to PID account type
        setFieldsValue({
          accountType: ACCOUNT_TYPES.PID,
          mediaSource: '', // Empty value instead of 'All Media Source'
          eventFilter: undefined,
          appIds: undefined,
          dataType: undefined,
          dateRange: undefined
        });
        
        // If there is a PID account, the first one is automatically selected
        const pidAccounts = accountConfigs.filter(config => config.account_type === ACCOUNT_TYPES.PID);
        if (pidAccounts.length > 0) {
          setFieldsValue({ accountId: pidAccounts[0].account_name });
        }
      }
      
      // Reset event filter display status
      setShowEventFilter(false);
      
      // Automatically perform the Reset operation of DataFetchSearchBar
      if (dataFetchSearchBarRef.current && dataFetchSearchBarRef.current.clearAll) {
        dataFetchSearchBarRef.current.clearAll();
      }
    }, 100); // Delay execution by 100ms to ensure status update is completed
    
    // Note: Mode switching does not affect the data loading logic at the bottom. All data is loaded universally without data filtering.
    // The difference is that the Mode field is used to distinguish the execution mode of the records.
  };



  // New: Monitor Aggregate Mode setting changes (only listen to storage events to avoid repeated updates caused by regular checks)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'appsflyerTokenValidate') {
        const newFraudModeEnabled = e.newValue === 'ON';
        setAggregateModeEnabled(newFraudModeEnabled);
        
        // If Aggregate Mode is set to OFF and is currently in Aggregate mode, force the switch to Normal mode.
        if (!newFraudModeEnabled && isAggregateMode) {
          setIsAggregateMode(false);
          localStorage.setItem('aggregateMode', 'false');
        }
      }
    };

    // Only listen to storage events (synchronize across tabs)
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isAggregateMode]);

  // Force table border redraw - solve the problem of incomplete border rendering
  useEffect(() => {
    if (allQueryResults.length > 0 && !tableLoading) {
      // Delay execution to ensure DOM is updated
      const timer = setTimeout(() => {
        const tableElement = document.querySelector('.appsflyer-datagrid-table') as HTMLTableElement;
        if (tableElement) {
          // Add the loaded class to ensure that the border is displayed correctly
          tableElement.classList.add('loaded');
          
          // Force table redraw
          tableElement.style.display = 'none';
          // Trigger a reflow to force a rerender
          void tableElement.offsetHeight;
          tableElement.style.display = 'table';
          
          // Again make sure the borders show
          const cells = tableElement.querySelectorAll('th, td');
          cells.forEach(cell => {
            (cell as HTMLElement).style.border = '1px solid var(--DataGrid-rowBorderColor)';
          });
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [allQueryResults.length, tableLoading]);

  // New: Form initialization in Aggregate mode (simplified version) - use ref to avoid repeated execution
  const formInitializedRef = useRef(false);
  
  useEffect(() => {
    // The default value is only set when the component is initially loaded, and mode switching is handled by handleAggregateModeToggle
    // Only executed when the account configuration exists, the form is not initialized, and accountConfigsInitializedRef has been initialized.
    if (accountConfigs.length > 0 && !getFieldValue('accountType') && !formInitializedRef.current && accountConfigsInitializedRef.current) {
      formInitializedRef.current = true; // Tag is initialized
      
      if (isAggregateMode) {
        // Aggregate mode: set to PRT account type
        const prtAccounts = accountConfigs.filter(config => config.account_type === ACCOUNT_TYPES.PRT);
        if (prtAccounts.length > 0) {
          setFieldsValue({ 
            accountType: ACCOUNT_TYPES.PRT,
            accountId: prtAccounts[0].account_name
          });
        }
      } else {
        // Normal mode: set to PID account type
        const pidAccounts = accountConfigs.filter(config => config.account_type === ACCOUNT_TYPES.PID);
        if (pidAccounts.length > 0) {
          setFieldsValue({ 
            accountType: ACCOUNT_TYPES.PID,
            accountId: pidAccounts[0].account_name,
            mediaSource: '' // Empty value instead of 'All Media Source'
          });
        }
      }
    }
    // If accountConfigs becomes empty, reset the initialization flag
    if (accountConfigs.length === 0) {
      formInitializedRef.current = false;
    }
  }, [accountConfigs, isAggregateMode, getFieldValue]); // Add accountConfigs and getFieldValue dependencies

  // Memoize transformed accountConfigs to prevent unnecessary re-renders
  const transformedAccountConfigs = useMemo(() => {
    return accountConfigs.map(config => ({
      id: config.id,
      accountName: config.account_name,
      accountType: config.account_type,
      apiToken: '', // Token is no longer included in the configuration list and can be obtained on demand
      customIcon: config.custom_icon
    }));
  }, [accountConfigs]);

  return (
    <div style={{ 
      maxWidth: '1800px', 
      margin: '0 auto', 
      padding: '24px'
    }}>
              <style>{`
          /*Rotation animation*/
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          /*Make sure the Loading overlay is completely opaque*/
          .table-loading-overlay {
            background: #ffffff !important;
            background-color: #ffffff !important;
            background-image: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            /*Force full opacity*/
            opacity: 1 !important;
            /*Make sure everything is covered*/
            z-index: 100 !important;
            /*Force background color*/
            background: #ffffff !important;
            background-color: #ffffff !important;
            /*disable any transparency*/
            filter: none !important;
            -webkit-filter: none !important;
          }
          
          /*Pure CSS table fade-in animation optimization*/
          .pure-css-table-container {
            will-change: opacity, transform; /*Optimize animation performance*/
          }
          
          /*Table row progressive display animation*/
          .table-row.fade-in-row {
            animation: fadeInRow 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
            animation-delay: calc(var(--row-index, 0) * 0.1s);
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          
          @keyframes fadeInRow {
            0% {
              opacity: 0;
              transform: translateY(20px) scale(0.95);
            }
            50% {
              opacity: 0.7;
              transform: translateY(10px) scale(0.98);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          
        
        /*Preview Data table column header filter style*/
        .preview-table-th {
          position: relative;
          padding: 12px 8px !important;
          background: #fafafa;
          border-bottom: 1px solid #e8e8e8;
          font-weight: 600;
          color: #262626;
          text-align: left;
          vertical-align: middle;
        }
        
        .column-header {
          display: inline-flex;
          align-items: center;
          justify-content: flex-start;
          gap: 6px;
          max-width: 100%;
        }
        
        .column-title {
          flex: 0 1 auto;
          font-weight: 600;
          color: #262626;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .column-filter {
          display: flex;
          align-items: center;
        }
        
        .filter-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s ease;
          color: #8c8c8c;
        }
        
        .filter-button:hover {
          background: #f0f0f0;
          color: #1890ff;
        }
        
        .filter-button:active {
          background: #e6f7ff;
          color: #1890ff;
        }
        
        .filter-button svg {
          width: 12px;
          height: 12px;
        }
        
        .filter-button.active {
          background: #e6f7ff;
          color: #1890ff;
        }
        
        .filter-button.has-filters {
          color: #1890ff;
        }
        
        .filter-count-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: #1890ff;
          color: white;
          font-size: 10px;
          font-weight: 600;
          min-width: 16px;
          height: 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          line-height: 1;
        }
        
        .column-filter-container {
          position: relative;
        }
        
        /*Smart targeting styles for filter dropdown menus*/
        .column-filter-dropdown {
          position: absolute !important;
          top: 100% !important;
          margin-top: 4px !important;
          z-index: 50 !important;
          background: rgb(255, 255, 255) !important;
          color: rgb(34, 13, 78) !important;
          box-shadow: rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px !important;
          border-radius: 4px !important;
          width: 280px !important;
          max-height: 400px !important;
          overflow-y: auto !important;
          font-family: "Museo Sans", sans-serif !important;
          font-weight: 300 !important;
          font-size: 13px !important;
          line-height: 20px !important;
          letter-spacing: 0.0025em !important;
          -webkit-font-smoothing: antialiased !important;
          text-size-adjust: 100% !important;
          -webkit-tap-highlight-color: rgba(0, 0, 0, 0) !important;
          outline: 0 !important;
          border: 1px solid #f0f0f0 !important;
          transform: translateY(0) scale(1) !important;
          opacity: 1 !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important; /*Smoother transitions*/
          transform-origin: top center !important;
          /*Ensure filters are not clipped by containers*/
          overflow: visible !important;
          white-space: nowrap !important;
          /*Prevent jitter*/
          will-change: transform !important;
          backface-visibility: hidden !important;
        }
        
        /*Make sure the filter displays correctly within the container*/
        .preview-table-wrapper {
          position: relative;
          overflow: visible !important;
        }
        
        .preview-table-wrapper .column-filter-container {
          overflow: visible !important;
        }
        
        /*Positioning optimization of filter containers*/
        .column-filter-container {
          position: relative !important;
          z-index: 1;
        }
        
        /*Boundary detection optimization for filter dropdown menu*/
        .column-filter-dropdown {
          /*Use absolute positioning, relative to the filter button positioning*/
          position: absolute !important;
          z-index: 50 !important;
          /*Other styles remain unchanged*/
        }
        
        /*Align left when filter is on right side of table*/
        .column-filter-dropdown.right-aligned {
          right: 0 !important;
          left: auto !important;
          transform: translateY(0) scale(1) !important;
        }
        
        /*Align right when filter is on left side of table*/
        .column-filter-dropdown.left-aligned {
          left: 0 !important;
          right: auto !important;
          transform: translateY(0) scale(1) !important;
        }
        
        /*Center alignment when filter is in the middle of table*/
        .column-filter-dropdown.center-aligned {
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%) translateY(0) scale(1) !important;
        }
        
        /*Prevent filter thrashing*/
        .column-filter-dropdown {
          /*Make sure all positioning classes have the same transition effect*/
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        /*Optimize filter container positioning*/
        .preview-modal .column-filter-container {
          position: relative !important;
          z-index: 1;
        }
        
        /*Make sure filters display correctly also in scroll containers*/
        .preview-table-wrapper {
          overflow: auto !important;
        }
        
        .preview-table-wrapper .column-filter-container {
          overflow: visible !important;
        }
        
        /*Positioning optimization of filter buttons*/
        .column-filter {
          position: relative;
          z-index: 2;
        }
        
        /*Minimum and maximum width controls for filter dropdown menus*/
        .column-filter-dropdown {
          min-width: 200px !important;
          max-width: 350px !important;
          width: auto !important;
        }
        
        /*Responsive resizing: adjust filter width on small screens*/
        @media (max-width: 768px) {
          .column-filter-dropdown {
            min-width: 180px !important;
            max-width: 280px !important;
          }
        }
        
        /*Table row and cell fixed height styles*/
        .preview-table {
          border-collapse: collapse;
          width: 100%;
        }
        
        .preview-table-tr {
          height: 40px !important;
          min-height: 40px !important;
          max-height: 40px !important;
        }
        
        .preview-table-td {
          height: 40px !important;
          min-height: 40px !important;
          max-height: 40px !important;
          padding: 8px 12px;
          border-bottom: 1px solid #f0f0f0;
          border-right: 1px solid #f0f0f0;
          vertical-align: middle;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 200px;
          box-sizing: border-box;
          line-height: 1.4;
          font-size: 13px;
        }
        
        /*Prevent cell content from affecting row height*/
        .preview-table-td > * {
          max-height: 24px !important;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        /*Special handling of JSON value display*/
        .preview-table-td pre.preview-json-value {
          max-height: 24px !important;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          margin: 0;
          padding: 0;
          background: none;
          border: none;
          font-family: inherit;
          font-size: inherit;
        }
        
        .preview-table-wrapper {
          overflow: auto;
          max-height: 400px;
          border: 1px solid #f0f0f0;
          border-radius: 4px;
        }
        

          border: 1px solid rgb(230, 233, 240) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important; /*AppsFlyer style shadows*/
          overflow: hidden !important;           /*Internal fillets take effect*/
          /*AppsFlyer Fonts and Typography*/
          -webkit-font-smoothing: antialiased !important;
          text-size-adjust: 100% !important;
          -webkit-tap-highlight-color: rgba(0,0,0,0) !important;
          font-family: "Museo Sans", sans-serif !important;
          font-weight: 300 !important;
          font-size: 13px !important;
          line-height: 20px !important;
          letter-spacing: 0.0025em !important;
          color: rgb(34, 13, 78) !important;
          padding-top: 4px !important;          /*Reduce top spacing, sharper*/
          padding-bottom: 4px !important;        /*Reduce bottom spacing, sharper*/
          box-sizing: border-box !important;
          max-height: 380px !important;
          overflow-y: overlay !important;
          position: relative !important;
          background: rgb(255, 255, 255) !important; /*Make sure the background color*/
        }
        


        
        /*Pure CSS table style - completely separated from Ant Design*/
        .pure-css-table-container {
          width: 100%;
          overflow-x: auto; /*Enable horizontal scrolling*/
          overflow-y: hidden; /*Disable vertical scrolling*/
          border-radius: 8px;
          border: 1px solid #f0f0f0;
          background: #ffffff;
          /*Make sure scrollbars are visible*/
          scrollbar-width: thin;
          scrollbar-color: rgb(55, 65, 81) transparent; /*gray-700 - dark black gray*/
        }
        
        .pure-css-table {
          width: max-content; /*Let table width automatically expand based on content*/
          min-width: 100%; /*The minimum width is no less than the container*/
          border-collapse: collapse;
          display: table; /*Use true table layout*/
          table-layout: auto; /*Let column widths automatically adjust based on content*/
          white-space: nowrap; /*Prevent content from wrapping and force column width expansion*/
        }
        
        /*Table header - aggregation mode (8 columns)*/
        .table-header.aggregate-mode {
          display: table-row;
          background: #fafafa;
          border-bottom: 1px solid #f0f0f0;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        
        /*Table header - normal mode (9 columns)*/
        .table-header.normal-mode {
          display: table-row;
          background: #fafafa;
          border-bottom: 1px solid #f0f0f0;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        
        .header-cell {
          display: table-cell;
          padding: 16px 12px;
          text-align: center;
          font-weight: 600;
          font-size: 14px;
          color: #262626;
          border-right: 1px solid #f0f0f0;
          vertical-align: middle;
          min-height: 48px;
          background: #fafafa;
          white-space: nowrap; /*Prevent header line breaks*/
          overflow: visible; /*Allow content to overflow, not hide*/
          text-overflow: clip; /*Do not display ellipses*/
        }
        
        .header-cell:last-child {
          border-right: none;
        }
        
        /*Table content*/
        .table-body {
          display: table-row-group;
          background: #ffffff;
        }
        
        /*Table Row - Aggregation Mode (8 columns)*/
        .table-row.aggregate-mode {
          display: table-row;
          border-bottom: 1px solid #f0f0f0;
          transition: background-color 0.2s;
        }
        
        /*Table rows - normal mode (9 columns)*/
        .table-row.normal-mode {
          display: table-row;
          border-bottom: 1px solid #f0f0f0;
          transition: background-color 0.2s;
        }
        
        .table-row:hover {
          background-color: #fafafa;
        }
        
        .table-row:last-child {
          border-bottom: none;
        }
        
        .table-cell {
          display: table-cell;
          padding: 16px 12px;
          text-align: center;
          border-right: 1px solid #f0f0f0;
          vertical-align: middle;
          min-height: 48px;
          background: #ffffff;
          white-space: nowrap; /*Force no line wrapping and allow column width to expand*/
          overflow: visible; /*Allow content to overflow*/
          word-wrap: normal; /*Disable word wrapping*/
          word-break: normal; /*Disable forced line breaks*/
        }
        
        .table-row:hover .table-cell {
          background-color: #fafafa;
        }
        
        .table-cell:last-child {
          border-right: none;
        }
        
        .cell-text {
          font-weight: 600;
          color: #262626;
          font-size: 14px;
          white-space: nowrap; /*Text does not wrap*/
          overflow: visible; /*Allow overflow*/
          max-width: none; /*No limit on maximum width*/
        }
        
        /*Specific column styles - remove minimum width constraint and let content decide*/
        .account-cell {
          /*Remove minimum width and let content decide*/
        }
        
        .app-id-cell {
          /*Remove minimum width and let content decide*/
        }
        
        .app-name-cell {
          /*Remove minimum width and let content decide*/
        }
        
        .data-type-cell {
          /*Remove minimum width and let content decide*/
        }
        
        .date-range-cell {
          /*Remove minimum width and let content decide*/
        }
        
        .event-filter-cell {
          /*Remove minimum width and let content decide*/
        }
        
        .status-cell {
          /*Remove minimum width and let content decide*/
        }
        
        .log-cell {
          /*Remove minimum width and let content decide*/
        }
        
        .actions-cell {
          /*Remove minimum width and let content decide*/
        }
        
        /*status label style*/
        .status-tag {
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          color: #ffffff;
          min-width: 60px;
          text-align: center;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        
        .status-success {
          background-color: #52c41a;
        }
        
        .status-error {
          background-color: #ff4d4f;
        }
        
        .status-processing {
          background-color: #1677ff;
        }
        
        .status-default {
          background-color: #d9d9d9;
          color: #595959;
        }
        
        /*action button container*/
        .actions-container {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: center;
        }
        
        /*Empty data prompt*/
        .table-empty {
          padding: 32px 16px;
          text-align: center;
          color: #8c8c8c;
          font-size: 14px;
        }
        
        /*Responsive design*/
        @media (max-width: 1200px) {
          .header-cell,
          .table-cell {
            padding: 12px 8px;
            font-size: 13px;
          }
        }
        
        @media (max-width: 768px) {
          .header-cell,
          .table-cell {
            padding: 10px 6px;
            font-size: 12px;
          }
        }
        
        /*Make sure column widths truly adapt to content*/
        .pure-css-table-container {
          overflow-x: auto; /*Horizontal scrolling*/
          overflow-y: visible;
          width: 100%;
        }
        
        .pure-css-table {
          width: auto; /*Let the table width automatically adjust according to the content*/
          min-width: 100%; /*The minimum width is no less than the container*/
          white-space: nowrap; /*Prevent content from wrapping*/
        }
        
        /*Table column width automatically adjusted*/
        .pure-css-table {
          table-layout: auto; /*Let the browser automatically calculate column widths*/
        }
        
        /*Text processing for specific columns - force no line wrapping*/
        .app-id-cell .cell-text,
        .data-type-cell .cell-text,
        .app-name-cell .cell-text,
        .date-range-cell .cell-text,
        .event-filter-cell .cell-text {
          white-space: nowrap; /*Force no line breaks*/
          overflow: visible; /*Allow content to overflow*/
          max-width: none; /*No limit on maximum width*/
        }
        
        /*Status and action columns stay compact*/
        .status-cell,
        .actions-cell {
          width: auto;
          min-width: fit-content;
          white-space: nowrap; /*Status and action columns also do not wrap*/
        }
        
        /*Make sure the table displays correctly in the container*/
        .pure-css-table-container {
          position: relative;
        }
        
        /*Table header fixed*/
        .table-header {
          position: sticky;
          top: 0;
          z-index: 10;
        }
        
        /*Force all column contents not to wrap*/
        .pure-css-table * {
          white-space: nowrap !important;
        }
        
        /*Table row content is forced not to wrap*/
        .table-row {
          white-space: nowrap;
        }
        
        /*All cells are forced to not wrap*/
        .table-cell,
        .header-cell {
          white-space: nowrap !important;
          overflow: visible !important;
        }
        
        /*Key: Make sure the table column width is truly adaptive*/
        .pure-css-table {
          width: max-content !important; /*Force table width to expand based on content*/
          min-width: 100%; /*The minimum width is no less than the container*/
        }
        
        /*Table container supports horizontal scrolling*/
        .pure-css-table-container {
          overflow-x: auto;
          overflow-y: visible;
        }
        
        /*Make sure each column expands based on content*/
        .table-cell,
        .header-cell {
          width: auto !important; /*Column width automatic*/
          min-width: 0 !important; /*Remove minimum width restriction*/
          max-width: none !important; /*Remove maximum width limit*/
        }
        
        /*Special handling: some columns may require fixed width*/
        .status-cell,
        .actions-cell {
          width: fit-content !important; /*Status and action columns adjust based on content*/
        }
        
        /*Animation effects*/
        .fade-in-row {
          animation: fadeInRow 0.5s ease-out forwards;
          animation-delay: calc(var(--row-index, 0) * 0.1s);
        }
        
        @keyframes fadeInRow {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        /*Highlight row style*/
        .highlight-row-success {
          background-color: #f6ffed !important;
          border-left: 4px solid #52c41a;
        }
        
        .highlight-row-processing {
          background-color: #e6f7ff !important;
          border-left: 4px solid #1677ff;
        }
      `}</style>
      {/* Custom Card component - a complete replacement for Ant Design Card */}
      <div 
        className="custom-card"
        style={{
          WebkitFontSmoothing: 'antialiased',
          textSizeAdjust: '100%',
          color: 'rgb(34, 13, 78)',
          fontFamily: '"Museo Sans", sans-serif',
          fontWeight: 300,
          fontSize: 13,
          lineHeight: '20px',
          letterSpacing: '0.0025em',
          boxSizing: 'inherit',
          margin: '0 0 24px 0',
          borderRadius: 4,
          border: 'none',
          background: 'rgb(255, 255, 255)',
          position: 'relative',
          boxShadow: 'none',
          overflow: 'visible'
        }}
      >
        {/* Card content area */}
        <div 
          className="custom-card-body"
        style={{
            padding: '0 24px 0 24px'
        }}
      >
        {/* Data Fetch Area - using the new search bar component */}
        <div className="no-select">
          <DataFetchSearchBar
            ref={dataFetchSearchBarRef}
            formValues={{
              accountId: formValues.accountId || '',
              appIds: formValues.appIds || '',
              dataType: formValues.dataType || (isAggregateMode ? 'daily' : DATA_TYPES.INSTALL),
              dateRange: formValues.dateRange || [moment().subtract(1, 'day'), moment().subtract(1, 'day')],
              eventFilter: formValues.eventFilter || '',
              mediaSource: formValues.mediaSource || '',
            }}
            onAccountIdChange={handleAccountIdChange}
            onAppIdsChange={handleAppIdsChange}
            onDataTypeChange={handleDataTypeChange}
            onDateRangeChange={handleDateRangeChange}
            onEventFilterChange={handleEventFilterChange}
            onMediaSourceChange={handleMediaSourceChange}
            onFetchData={(searchBarValues) => {
              // Automatically determine accountType based on the selected account
              const selectedAccount = accountConfigs.find(config => config.account_name === searchBarValues.accountId);
              const accountType = selectedAccount?.account_type || formValues.accountType;
              
              // Use the state value inside the DataFetchSearchBar component
              const queryValues = {
                accountType: accountType,
                accountId: searchBarValues.accountId,
                appIds: searchBarValues.appIds,
                dataType: searchBarValues.dataType,
                dateRange: searchBarValues.dateRange ? [
                  moment(searchBarValues.dateRange[0].format('YYYY-MM-DD'), 'YYYY-MM-DD', true), 
                  moment(searchBarValues.dateRange[1].format('YYYY-MM-DD'), 'YYYY-MM-DD', true)
                ] as [moment.Moment, moment.Moment] : [
                  moment().subtract(1, 'day'), 
                  moment().subtract(1, 'day')
                ] as [moment.Moment, moment.Moment],
                eventFilter: searchBarValues.eventFilter,
                mediaSource: searchBarValues.mediaSource,
              };
              handleQuery(queryValues);
            }}
            accountConfigs={transformedAccountConfigs}
            selectedAccountType={selectedAccountType || ''}
            isAggregateMode={isAggregateMode}
            showEventFilter={showEventFilter}
            disabledDate={disabledDateAdapter}
            isFetching={loading}
            quickRanges={quickRangesAdapter}
            ACCOUNT_TYPES={ACCOUNT_TYPES}
            DATA_TYPES={DATA_TYPES}
            DATE_FORMAT={DATE_FORMAT}
            aggregateModeEnabled={aggregateModeEnabled}
            onAggregateModeToggle={handleAggregateModeToggle}
            dataFetchDisabled={dataFetchDisabled}
          />
        </div>
        </div>
      </div>

      {/* Table top module - 1:1 replica screenshot style */}
      <div 
        className="table-header-module rounded-md"
        style={{
          margin: '24px 0 0 0',
          backgroundColor: 'white',
          borderRadius: '6px', /*rounded-md = 6px, refer to AppsFinder’s rounded corner style*/
          border: '1px solid #d1d5db', /*Use a darker border color to make rounded corners clearer*/
          overflow: 'hidden', /*Use hidden to crop content beyond the rounded corners to avoid white edges*/
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          zIndex: 1,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' /*Add a slight shadow to enhance the visual effect of rounded corners*/
        }}
      >
        {/* main title bar */}
        <div 
          className="table-header-main"
          style={{
            padding: '16px 20px',
            backgroundColor: 'white',
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
            overflow: 'visible'
          }}
        >
          {/* Left title area */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* main title */}
            <div 
              className="widget-title"
              style={{
          fontSize: '16px',
                fontWeight: '600',
                color: '#000000',
                lineHeight: '1.4',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}
            >
              Query Results
            </div>
          </div>

          {/* Right operation button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
            {/* Edit Table button */}
            <button
              className="table-settings-button"
            style={{
                padding: '6px 12px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#666666',
                cursor: 'pointer',
                fontSize: '14px',
          fontWeight: '500',
                display: 'flex',
        alignItems: 'center',
                gap: '6px',
                borderRadius: '4px',
                transition: 'all 0.2s',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
            }}
            onClick={() => setEditTableModalVisible(true)}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.color = '#333333';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#666666';
              }}
            >
              <svg 
                style={{ 
                  width: '18px', 
                  height: '18px',
                  shapeRendering: 'geometricPrecision',
                  textRendering: 'geometricPrecision'
                }}
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="m14.06 9.02.92.92L5.92 19H5v-.92zM17.66 3c-.25 0-.51.1-.7.29l-1.83 1.83 3.75 3.75 1.83-1.83c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.2-.2-.45-.29-.71-.29m-3.6 3.19L3 17.25V21h3.75L17.81 9.94z" fill="currentColor"/>
              </svg>
              Edit Table
            </button>

            {/* More action buttons */}
            <button
              className="widget-dropdown-button"
            style={{
                padding: '6px',
                border: 'none',
              backgroundColor: 'transparent',
                color: '#666666',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.2s',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px'
              }}
              onClick={() => setDropdownVisible(!dropdownVisible)}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.color = '#333333';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#666666';
              }}
            >
              <svg 
                style={{ 
                  width: '20px', 
                  height: '20px',
                  shapeRendering: 'geometricPrecision',
                  textRendering: 'geometricPrecision'
                }}
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle cx="12" cy="6" r="2" fill="currentColor"/>
                <circle cx="12" cy="12" r="2" fill="currentColor"/>
                <circle cx="12" cy="18" r="2" fill="currentColor"/>
              </svg>
            </button>

            {/* drop down menu */}
            {dropdownVisible && (
              <div 
                className="dropdown-menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: '0',
                  marginTop: '4px',
                  backgroundColor: 'white',
                  border: '1px solid #e0e0e0',
                  borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  zIndex: 1000,
                  minWidth: '150px',
                  overflow: 'hidden'
                }}
              >
                {/* Export All Records option */}
                <div
                  className="dropdown-item"
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background-color 0.2s',
                    borderBottom: '1px solid #f0f0f0',
                    opacity: (isDownloadingAll || getDownloadableResults().length === 0) ? 0.6 : 1
                  }}
                  onClick={() => {
                    setDropdownVisible(false);
                    if (!isDownloadingAll && getDownloadableResults().length > 0) {
                      setDownloadAllModalVisible(true);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!isDownloadingAll && getDownloadableResults().length > 0) {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  <svg 
                    style={{ 
                      width: '18px', 
                      height: '18px', 
                      color: '#666666',
                      shapeRendering: 'geometricPrecision',
                      textRendering: 'geometricPrecision'
                    }}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" fill="currentColor"/>
                  </svg>
                   <span style={{
                     fontSize: '14px',
                     color: '#333',
                     fontWeight: '400'
                   }}>
                     {isDownloadingAll ? 'Exporting...' : 'Export All'}
                   </span>
                </div>

                {/* Delete All Records option */}
                <div
                  className="dropdown-item"
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'background-color 0.2s',
                    opacity: (deletingAll || allQueryResults.length === 0) ? 0.6 : 1
                  }}
                  onClick={() => {
                    setDropdownVisible(false);
                    if (!deletingAll && allQueryResults.length > 0) {
                      setDeleteAllModalVisible(true);
                    }
                  }}
                  onMouseEnter={(e) => {
                    if (!deletingAll && allQueryResults.length > 0) {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                  }}
                >
                  <svg 
                    style={{ 
                      width: '18px', 
                      height: '18px', 
                      color: '#666666',
                      shapeRendering: 'geometricPrecision',
                      textRendering: 'geometricPrecision'
                    }}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/>
                  </svg>
                   <span style={{
                     fontSize: '14px',
                     color: '#333',
                     fontWeight: '400'
                   }}>
                     {deletingAll ? 'Deleting...' : 'Delete All'}
                   </span>
                </div>
              </div>
            )}
      </div>
        </div>

        {/* data table area */}
        <div className="m-0">
        {/* AppsFlyer DataGrid style table styles - fully migrated to datagrid.css and Tailwind */}
        <style>
          {`
          /*Keep only necessary special styles and column width definitions*/
          .appsflyer-datagrid {
            -webkit-tap-highlight-color: rgba(0,0,0,0) !important;
          }
          
          /*Column width definitions - only column widths and responsive styles remain, other styles have been migrated to datagrid.css*/
          
          /*Column width definition - adaptive width*/
          .appsflyer-datagrid-table th.status-cell,
          .appsflyer-datagrid-table td.status-cell {
            width: 8%;
          }

          .appsflyer-datagrid-table th.log-cell,
          .appsflyer-datagrid-table td.log-cell {
            width: 10%;
          }

          .appsflyer-datagrid-table th.actions-cell,
          .appsflyer-datagrid-table td.actions-cell {
            width: 12%;
          }

          /*Responsive column width adjustment - retain necessary column width definitions*/
          @media (max-width: 1200px) {
            .appsflyer-datagrid-table th.account-cell,
            .appsflyer-datagrid-table td.account-cell {
              width: 10%;
            }
            
            .appsflyer-datagrid-table th.app-id-cell,
            .appsflyer-datagrid-table td.app-id-cell {
              width: 12%;
            }
            
            .appsflyer-datagrid-table th.app-name-cell,
            .appsflyer-datagrid-table td.app-name-cell {
              width: 15%;
            }
            
            .appsflyer-datagrid-table th.data-type-cell,
            .appsflyer-datagrid-table td.data-type-cell {
              width: 10%;
            }
            
            .appsflyer-datagrid-table th.date-range-cell,
            .appsflyer-datagrid-table td.date-range-cell {
              width: 12%;
            }
            
            .appsflyer-datagrid-table th.event-filter-cell,
            .appsflyer-datagrid-table td.event-filter-cell {
              width: 10%;
            }
            
            .appsflyer-datagrid-table th.log-cell,
            .appsflyer-datagrid-table td.log-cell {
              width: 8%;
            }
            
            .appsflyer-datagrid-table th.actions-cell,
            .appsflyer-datagrid-table td.actions-cell {
              width: 10%;
            }
          }

          @media (max-width: 768px) {
            .appsflyer-datagrid-table th.account-cell,
            .appsflyer-datagrid-table td.account-cell {
              width: 8%;
            }
            
            .appsflyer-datagrid-table th.app-id-cell,
            .appsflyer-datagrid-table td.app-id-cell {
              width: 10%;
            }
            
            .appsflyer-datagrid-table th.app-name-cell,
            .appsflyer-datagrid-table td.app-name-cell {
              width: 12%;
            }
            
            .appsflyer-datagrid-table th.data-type-cell,
            .appsflyer-datagrid-table td.data-type-cell {
              width: 8%;
            }
            
            .appsflyer-datagrid-table th.date-range-cell,
            .appsflyer-datagrid-table td.date-range-cell {
              width: 10%;
            }
            
            .appsflyer-datagrid-table th.event-filter-cell,
            .appsflyer-datagrid-table td.event-filter-cell {
              width: 8%;
            }
            
            .appsflyer-datagrid-table th.status-cell,
            .appsflyer-datagrid-table td.status-cell {
              width: 6%;
            }
            
            .appsflyer-datagrid-table th.log-cell,
            .appsflyer-datagrid-table td.log-cell {
              width: 6%;
            }
            
            .appsflyer-datagrid-table th.actions-cell,
            .appsflyer-datagrid-table td.actions-cell {
              width: 8%;
            }
          }

          @media (max-width: 480px) {
            .appsflyer-datagrid-table th.account-cell,
            .appsflyer-datagrid-table td.account-cell {
              width: 6%;
            }
            
            .appsflyer-datagrid-table th.app-id-cell,
            .appsflyer-datagrid-table td.app-id-cell {
              width: 8%;
            }
            
            .appsflyer-datagrid-table th.app-name-cell,
            .appsflyer-datagrid-table td.app-name-cell {
              width: 10%;
            }
            
            .appsflyer-datagrid-table th.data-type-cell,
            .appsflyer-datagrid-table td.data-type-cell {
              width: 6%;
            }
            
            .appsflyer-datagrid-table th.date-range-cell,
            .appsflyer-datagrid-table td.date-range-cell {
              width: 8%;
            }
            
            .appsflyer-datagrid-table th.event-filter-cell,
            .appsflyer-datagrid-table td.event-filter-cell {
              width: 6%;
            }
            
            .appsflyer-datagrid-table th.status-cell,
            .appsflyer-datagrid-table td.status-cell {
              width: 5%;
            }
            
            .appsflyer-datagrid-table th.log-cell,
            .appsflyer-datagrid-table td.log-cell {
              width: 5%;
            }
            
            .appsflyer-datagrid-table th.actions-cell,
            .appsflyer-datagrid-table td.actions-cell {
              width: 6%;
            }
          }
           `}
         </style>
        <div className="relative z-[1]">
          {/* AppsFlyer DataGrid style table */}
          <div className="appsflyer-datagrid antialiased select-text text-datagrid text-datagrid-text font-light leading-5 tracking-[0.0025em] flex-1 overflow-auto scrollbar-none">
            <div 
              ref={queryResultsContainerRef}
              className="appsflyer-datagrid-container bg-datagrid-container overflow-x-auto overflow-y-auto relative w-full h-auto max-h-[600px] m-0 p-0 box-border opacity-100"
              style={{
                borderTop: '1px solid #e5e7eb', /*Use a softer border color to coordinate with the outer container*/
                borderBottom: 'none', /*Remove the bottom border and manage it uniformly by the outer container*/
                // When first screen/refreshing, give the container a stable height first to prevent the skeleton layer from having no visible area (it will not appear until the data is stretched)
                minHeight: queryResultsLoading ? `${queryResultsSkeletonMinHeight}px` : undefined
              }}
            >
              {/* React Table Rendering - Integrating AppsFlyer styles using the shadcn/ui Table component */}
              <Table 
                className="appsflyer-datagrid-table" 
                key={`table-${allQueryResults.length}`}
                noWrapper={true}
              >
                <TableHeader className="appsflyer-datagrid-header">
                  {table.getHeaderGroups().map(headerGroup => (
                    <TableRow key={headerGroup.id} className="pointer-events-none select-none">
                      {headerGroup.headers.map(header => (
                        <TableHead 
                          key={header.id}
                          className={`appsflyer-datagrid-header-cell ${header.column.id}-cell pointer-events-none select-none cursor-default`}
                        >
                          {header.isPlaceholder ? null : (
                            <div className="appsflyer-datagrid-header-content pointer-events-none select-none">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                            </div>
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody className="appsflyer-datagrid-body">
                  {(() => {
                    const rows = table.getRowModel().rows;
                    const columnCount = table.getHeaderGroups()[0]?.headers?.length ?? 1;
                    // Display Icon + No Data when there is no data and is not loading; rely on hasLoadedOnce to avoid memory pressure/OOM caused by empty state paths when the first screen is not loaded.
                    if (rows.length === 0 && !queryResultsLoading && hasLoadedOnce) {
                      return (
                        <TableRow>
                          <TableCell
                            colSpan={columnCount}
                            className="appsflyer-datagrid-cell text-center"
                            style={{
                              padding: '48px 20px',
                              verticalAlign: 'middle',
                              borderBottom: '1px solid #e5e7eb',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '12px',
                                color: '#8c8c8c',
                                userSelect: 'none',
                              }}
                            >
                              <Inbox className="opacity-60" style={{ width: 48, height: 48 }} strokeWidth={1.2} />
                              <span style={{ fontSize: '14px', fontWeight: 500 }}>No Data</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    }
                    try {
                      return rows.map((row, index) => (
                        <TableRow 
                          key={`${row.id}-${row.original.key}`}
                          className={`appsflyer-datagrid-row select-none ${
                            highlightKey === row.original.key ? `appsflyer-highlight-${highlightType || 'success'}` : ''
                          }`}
                          id={`row-${row.original.key}`}
                        >
                          {(() => {
                            try {
                              return row.getVisibleCells().map((cell, cellIndex) => {
                                // Interaction is enabled for Log and Actions columns, disabled for other columns
                                const isInteractiveColumn = cell.column.id === 'log' || cell.column.id === 'actions';
                                const interactionClass = isInteractiveColumn 
                                  ? 'pointer-events-auto' 
                                  : 'pointer-events-none select-none cursor-default';
                                
                                return (
                                  <TableCell 
                                    key={`${cell.id}-${row.original.key}`}
                                    className={`appsflyer-datagrid-cell ${cell.column.id}-cell ${interactionClass}`}
                                  >
                                    {(() => {
                                      try {
                                        return flexRender(cell.column.columnDef.cell, cell.getContext());
                                      } catch (error) {
                                        console.error('Error rendering cell:', error, cell);
                                        return <span style={{ color: 'red' }}>Error</span>;
                                      }
                                    })()}
                                  </TableCell>
                                );
                              });
                            } catch (error) {
                              console.error('Error rendering cells for row:', error, row);
                              return <TableCell colSpan={100} style={{ color: 'red' }}>Error rendering row</TableCell>;
                            }
                          })()}
                        </TableRow>
                      ));
                    } catch (error) {
                      console.error('Error rendering table rows:', error);
                      return (
                        <TableRow>
                          <TableCell colSpan={100} style={{ color: 'red', textAlign: 'center', padding: '20px' }}>
                            Error rendering table data
                          </TableCell>
                        </TableRow>
                      );
                    }
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
          
          {/* AppsFlyer style loading overlay - skeleton screen */}
          {queryResultsLoading && (
            <div className="appsflyer-datagrid-loading">
              <div className="skeleton-row-container">
                {/* Render a skeleton screen, dynamically matching the number of table columns and the number of rows per page */}
                {Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
                  <div key={rowIndex} className="skeleton-row">
                    {table.getAllColumns().map((column) => {
                      // Determine skeleton style based on column ID
                      let cellClass = 'skeleton-cell ';
                      if (column.id === 'accountId') cellClass += 'skeleton-cell-short';
                      else if (column.id === 'appName' || column.id === 'dateRange') cellClass += 'skeleton-cell-extra-long';
                      else if (column.id === 'actions') cellClass += 'skeleton-cell-long';
                      else if (column.id === 'status') cellClass += 'skeleton-cell-short';
                      else cellClass += 'skeleton-cell-medium';
                      
                      return (
                        <div key={column.id} className={cellClass}></div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            )}
        </div>
        </div>
        </div>
        
        {/* React Table pagination component */}
        <div className="flex justify-end mt-3 w-full">
          {!queryResultsLoading && table.getRowModel().rows.length > 0 && (
            (() => {
              const totalPages = table.getPageCount();
              const currentPageIndex = table.getState().pagination.pageIndex;
              const pageSize = table.getState().pagination.pageSize;
              const totalRows = table.getFilteredRowModel().rows.length;

              const getPageNumbers = () => {
                const pageNumbers: number[] = [];
                const maxVisiblePages = 5;
                if (totalPages <= maxVisiblePages) {
                  for (let i = 0; i < totalPages; i += 1) pageNumbers.push(i);
                } else {
                  let start = Math.max(0, currentPageIndex - Math.floor(maxVisiblePages / 2));
                  let end = Math.min(totalPages - 1, start + maxVisiblePages - 1);
                  if (end - start + 1 < maxVisiblePages) {
                    start = Math.max(0, end - maxVisiblePages + 1);
                  }
                  for (let i = start; i <= end; i += 1) pageNumbers.push(i);
                }
                return pageNumbers;
              };

              const pageNumbers = getPageNumbers();
              const start = totalRows === 0 ? 0 : currentPageIndex * pageSize + 1;
              const end = Math.min((currentPageIndex + 1) * pageSize, totalRows);

              return (
                <div className="flex items-center justify-center gap-2 text-sm select-none" style={{
                  fontFamily: '"Museo Sans", sans-serif'
                }}>
                  <div className="text-gray-500 text-[11px] text-center whitespace-nowrap mr-1">
                    {`${start}-${end} / ${totalRows}`}
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                      className={`inline-flex h-8 w-8 items-center justify-center border border-transparent bg-transparent p-0 leading-none rounded-sm transition-all duration-200 ${
                        !table.getCanPreviousPage()
                          ? 'cursor-not-allowed text-gray-300'
                          : 'cursor-pointer text-gray-600 hover:border-gray-300 hover:text-gray-900'
                      }`}
                      aria-label="Previous page"
                    >
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                        <path d="M7.5 3L4.5 6L7.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {pageNumbers.map((pageIndex) => (
                      <button
                        key={pageIndex}
                        type="button"
                        onClick={() => table.setPageIndex(pageIndex)}
                        className={`inline-flex h-8 w-8 items-center justify-center border bg-transparent p-0 leading-none rounded-sm text-sm transition-all duration-200 ${
                          currentPageIndex === pageIndex
                            ? 'border-gray-500 text-gray-900 font-semibold'
                            : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                        }`}
                        aria-label={`Go to page ${pageIndex + 1}`}
                      >
                        {pageIndex + 1}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                      className={`inline-flex h-8 w-8 items-center justify-center border border-transparent bg-transparent p-0 leading-none rounded-sm transition-all duration-200 ${
                        !table.getCanNextPage()
                          ? 'cursor-not-allowed text-gray-300'
                          : 'cursor-pointer text-gray-600 hover:border-gray-300 hover:text-gray-900'
                      }`}
                      aria-label="Next page"
                    >
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                        <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })()
          )}
        </div>

      {/* Delete confirmation dialog */}
      {deleteConfirmModalVisible && createPortal(
        <div 
          className="custom-modal-overlay"
          onClick={cancelDelete}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            animation: 'fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <div 
            className="custom-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              minWidth: '400px',
              maxWidth: '500px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              animation: 'slideInBubble 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {/* Pop-up header */}
            <div style={{
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid #f0f0f0'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: '600',
                color: '#262626'
              }}>
                {'Confirm Delete'}
              </h3>
            </div>

            {/* Pop-up content */}
            <div style={{ marginBottom: '24px' }}>
        <p style={{ 
                fontSize: '12px', 
                lineHeight: '1.5', 
                margin: 0,
          color: '#666'
        }}>
          {'Are you sure you want to delete this record? This operation cannot be undone.'}
        </p>
            </div>

            {/* Pop-up window bottom button */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px'
            }}>
              <button
                onClick={cancelDelete}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '2px',
                  backgroundColor: 'white',
                  color: '#262626',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#40a9ff';
                  e.currentTarget.style.color = '#40a9ff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#d9d9d9';
                  e.currentTarget.style.color = '#262626';
                }}
              >
                {'Cancel'}
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '2px',
                  backgroundColor: '#ff4d4f',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#ff7875';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#ff4d4f';
                }}
              >
                {'Confirm'}
              </button>
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* Details display pop-up window */}
      {detailModalVisible && createPortal(
        <div 
          className="custom-modal-overlay home-api-response-overlay"
          onClick={() => {
            setDetailModalVisible(false);
            setCopied(false);
          }}
          style={{
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
          }}
        >
          <div 
            className="custom-modal home-api-response-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              borderRadius: '8px',
              padding: '20px',
              width: 'auto',
              minWidth: '900px',
              maxWidth: '96vw',
              height: '72vh',
              maxHeight: '86vh',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Pop-up header */}
            <div style={{
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: '700',
                letterSpacing: '1px',
                color: '#262626'
              }}>
            {'API Response'}
              </h3>
              <button
                onClick={() => {
                  setDetailModalVisible(false);
                  setCopied(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Pop-up content - the scroll bar is on this layer, outside the code block */}
            <div className="detail-modal-content">
        {currentDetail && (() => {
          const jsonContent = JSON.stringify(currentDetail.apiResponse || currentDetail.errorDetails || {}, null, 2);
          
          const handleCopy = async () => {
            try {
              if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(jsonContent);
              } else {
                const textarea = document.createElement('textarea');
                textarea.value = jsonContent;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.focus();
                textarea.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(textarea);
                if (!ok) throw new Error('execCommand copy failed');
              }
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch (err) {
              console.error('Failed to copy:', err);
            }
          };
          
          return (
            <div className="home-api-response-panel">
              <button
                type="button"
                onClick={handleCopy}
                className={`home-api-response-copy-btn${copied ? ' is-copied' : ''}`}
              >
                {copied ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>Copy</span>
                  </>
                )}
              </button>
              <pre className="home-api-response-pre">{jsonContent}</pre>
            </div>
          );
        })()}
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* Modern preview data pop-up window */}
      {previewModalVisible && createPortal(
        <>
        <div 
          className="preview-modal-overlay"
          onClick={() => {
            setPreviewModalVisible(false);
            resetPreviewFilters(); // Reset filter state when closing popup
          }}
          style={{
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            animation: 'fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <div 
            className="preview-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              WebkitFontSmoothing: 'antialiased',
              textSizeAdjust: '100%',
              WebkitTapHighlightColor: 'rgba(0,0,0,0)',
              fontFamily: '"Museo Sans", sans-serif',
              fontWeight: 300,
              fontSize: '13px',
              lineHeight: '20px',
              letterSpacing: '0.0025em',
              boxSizing: 'inherit',
              backgroundColor: 'rgb(255, 255, 255)',
              color: 'rgb(34, 13, 78)',
              position: 'relative',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'calc(100% - 64px)',
              width: 'calc(100% - 64px)',
              transition: 'box-shadow 300ms cubic-bezier(0.4, 0, 0.2, 1)',
              borderRadius: '8px',
              margin: '32px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              maxWidth: '1500px',
              border: 'none',
              animation: 'none',
              transform: 'none'
            }}
          >
            {/* Pop-up header */}
            <div style={{
              padding: '24px 24px 16px 24px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0
            }}>
              <h2 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: '600',
                color: 'rgb(34, 13, 78)',
                fontFamily: '"Museo Sans", sans-serif'
              }}>
            {'Data Preview'}
              </h2>
              <button 
                onClick={() => {
                  setPreviewModalVisible(false);
                  resetPreviewFilters(); // Reset filter state when closing popup
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background-color 0.2s',
                  color: 'rgb(34, 13, 78)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Pop-up content */}
            <div style={{ 
              flex: 1,
              padding: '24px',
              overflow: 'auto'
            }}>
        {selectedPreviewRecord && (
          <div>
                  {/* Record information summary */}
                  <div className="preview-record-summary">
                    {/* First line: basic information */}
                    <div className="summary-item">
                      <span className="summary-label">{'App ID'}:</span>
                      <span className="summary-value">{selectedPreviewRecord.appId}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">{'App Name'}:</span>
                      <span className="summary-value">{selectedPreviewRecord.appName || 'N/A'}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">{'Data Type'}:</span>
                      <span className="summary-value">{selectedPreviewRecord.dataType}</span>
                    </div>
                    
                                        {/* Second line: Account information */}
                    <div className="summary-item">
                      <span className="summary-label">{'Account Type'}:</span>
                      <span className="summary-value">{selectedPreviewRecord.accountType}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">{'Account ID'}:</span>
                      <span className="summary-value">{selectedPreviewRecord.accountId}</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">{'Date Range'}:</span>
                      <span className="summary-value">{selectedPreviewRecord.dateRange}</span>
                    </div>
                    
                                        {/* The fourth line: filter conditions and statistical information */}
                    {selectedPreviewRecord.event_filter && (
                      <div className="summary-item">
                        <span className="summary-label">{'Event Filter'}:</span>
                        <span className="summary-value">{selectedPreviewRecord.event_filter}</span>
                      </div>
                    )}
                    {selectedPreviewRecord.mediaSource && (
                      <div className="summary-item">
                        <span className="summary-label">{'Media Source'}:</span>
                        <span className="summary-value">{selectedPreviewRecord.mediaSource}</span>
                      </div>
                    )}
                    {typeof selectedPreviewRecord.afidDeduplicationCount === 'number' && (
                      <div className="summary-item">
                        <span className="summary-label">{'AFID Count'}:</span>
                        <span className="summary-value">{selectedPreviewRecord.afidDeduplicationCount}</span>
                      </div>
                    )}
                    {typeof selectedPreviewRecord.primaryAttributionCount === 'number' && (
                      <div className="summary-item">
                        <span className="summary-label">{'Primary Attribution'}:</span>
                        <span className="summary-value">{selectedPreviewRecord.primaryAttributionCount}</span>
                      </div>
                    )}
                    
                  </div>

                  {/* Data preview table */}
            {previewData.length > 0 ? (
                    <div style={{ marginTop: '24px' }}>
                      {/* Preview table titles and statistics */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '16px',
                        padding: '0 4px'
                      }}>
                        <h3 style={{
                          margin: 0,
                          fontSize: '16px',
                          fontWeight: '600',
                          color: 'rgb(34, 13, 78)',
                          fontFamily: '"Museo Sans", sans-serif'
                        }}>
                          {'Preview Data'}
                        </h3>
                        <span style={{
                          fontSize: '14px',
                          color: '#666',
                          fontFamily: '"Museo Sans", sans-serif'
                        }}>
                          {'Total'} {filteredPreviewData.length} {'records'}
                        </span>
                      </div>
                      
                      {/* Preview Data table (independent style to avoid appsflyer-datagrid conflict) */}
                      <div className="preview-datagrid-scroll">
                        <table className="preview-datagrid-table">
                          <colgroup>
                            {previewTableColumns.map((colKey, colIndex) => (
                              <col
                                key={colKey}
                                style={{ width: `${previewColumnWidths[colIndex]}px` }}
                              />
                            ))}
                          </colgroup>
                          <thead className="preview-datagrid-head">
                            <tr>
                              {previewTableColumns.map((key) => (
                                <th key={key} className="preview-datagrid-th">
                                  <div className="preview-datagrid-th-inner">
                                    <span className="preview-datagrid-th-label">{key}</span>
                                    {PREVIEW_FILTERABLE_COLUMNS.has(key) && (
                                      <span className="preview-col-filter">
                                        <button
                                          type="button"
                                          className={`preview-col-filter__trigger${
                                            previewFilterMenu?.columnKey === key ? ' is-open' : ''
                                          }${
                                            customColumnFilters[key]?.length ? ' has-selection' : ''
                                          }`}
                                          onClick={(e) => togglePreviewColumnFilter(key, e)}
                                          title="Filter column"
                                          aria-expanded={previewFilterMenu?.columnKey === key}
                                          aria-haspopup="dialog"
                                        >
                                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                                            <path d="M3 4C3 3.44772 3.44772 3 4 3H20C20.5523 3 21 3.44772 21 4V6.58579C21 6.851 20.8946 7.10536 20.7071 7.29289L14.2929 13.7071C14.1054 13.8946 14 14.149 14 14.4142V17L10 21V14.4142C10 14.149 9.89464 13.8946 9.70711 13.7071L3.29289 7.29289C3.10536 7.10536 3 6.851 3 6.58579V4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                          </svg>
                                          {customColumnFilters[key]?.length ? (
                                            <span className="preview-col-filter__badge">
                                              {customColumnFilters[key].length}
                                            </span>
                                          ) : null}
                                        </button>
                                      </span>
                                    )}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {filteredPreviewData.slice(previewCurrentPage * PREVIEW_PAGE_SIZE, (previewCurrentPage + 1) * PREVIEW_PAGE_SIZE).map((row, rowIndex) => (
                              <tr key={rowIndex} className="preview-datagrid-row">
                                {previewTableColumns.map((key) => {
                                  const value = (row as Record<string, unknown>)[key];
                                  return (
                                    <td key={key} className="preview-datagrid-td">
                                      {typeof value === 'object' && value !== null ? (
                                        <pre className="preview-json-value">
                                          {JSON.stringify(value, null, 2)}
                                        </pre>
                                      ) : (
                                        String(value ?? '')
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Pagination component */}
                      {filteredPreviewData.length > 0 && (
                        (() => {
                          const totalRows = filteredPreviewData.length;
                          const totalPages = Math.ceil(totalRows / PREVIEW_PAGE_SIZE);
                          const currentPageIndex = previewCurrentPage;
                          const start = totalRows === 0 ? 0 : currentPageIndex * PREVIEW_PAGE_SIZE + 1;
                          const end = Math.min((currentPageIndex + 1) * PREVIEW_PAGE_SIZE, totalRows);

                          const getPageNumbers = () => {
                            const pageNumbers: number[] = [];
                            const maxVisiblePages = 5;
                            if (totalPages <= maxVisiblePages) {
                              for (let i = 0; i < totalPages; i += 1) pageNumbers.push(i);
                            } else {
                              let startPage = Math.max(0, currentPageIndex - Math.floor(maxVisiblePages / 2));
                              let endPage = Math.min(totalPages - 1, startPage + maxVisiblePages - 1);
                              if (endPage - startPage + 1 < maxVisiblePages) {
                                startPage = Math.max(0, endPage - maxVisiblePages + 1);
                              }
                              for (let i = startPage; i <= endPage; i += 1) pageNumbers.push(i);
                            }
                            return pageNumbers;
                          };

                          const pageNumbers = getPageNumbers();
                          const canPrev = currentPageIndex > 0;
                          const canNext = currentPageIndex < totalPages - 1;

                          return (
                            <div className="flex justify-end mt-3 w-full">
                              <div className="flex items-center justify-center gap-2 text-sm select-none" style={{
                                fontFamily: '"Museo Sans", sans-serif'
                              }}>
                                <div className="text-gray-500 text-[11px] text-center whitespace-nowrap mr-1">
                                  {`${start}-${end} / ${totalRows}`}
                                </div>
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setPreviewCurrentPage(prev => Math.max(0, prev - 1))}
                                    disabled={!canPrev}
                                    className={`inline-flex h-8 w-8 items-center justify-center border border-transparent bg-transparent p-0 leading-none rounded-sm transition-all duration-200 ${
                                      !canPrev
                                        ? 'cursor-not-allowed text-gray-300'
                                        : 'cursor-pointer text-gray-600 hover:border-gray-300 hover:text-gray-900'
                                    }`}
                                    aria-label="Previous page"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                                      <path d="M7.5 3L4.5 6L7.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </button>

                                  {pageNumbers.map((pageIndex) => (
                                    <button
                                      key={pageIndex}
                                      type="button"
                                      onClick={() => setPreviewCurrentPage(pageIndex)}
                                      className={`inline-flex h-8 w-8 items-center justify-center border bg-transparent p-0 leading-none rounded-sm text-sm transition-all duration-200 ${
                                        currentPageIndex === pageIndex
                                          ? 'border-gray-500 text-gray-900 font-semibold'
                                          : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                                      }`}
                                      aria-label={`Go to page ${pageIndex + 1}`}
                                    >
                                      {pageIndex + 1}
                                    </button>
                                  ))}

                                  <button
                                    type="button"
                                    onClick={() => setPreviewCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                                    disabled={!canNext}
                                    className={`inline-flex h-8 w-8 items-center justify-center border border-transparent bg-transparent p-0 leading-none rounded-sm transition-all duration-200 ${
                                      !canNext
                                        ? 'cursor-not-allowed text-gray-300'
                                        : 'cursor-pointer text-gray-600 hover:border-gray-300 hover:text-gray-900'
                                    }`}
                                    aria-label="Next page"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                                      <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      )}
              </div>
            ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '40px 20px',
                      backgroundColor: 'transparent',
                      marginTop: '24px'
                    }}>
                      <div style={{ marginBottom: '16px' }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#D9D9D9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <p style={{
                        fontSize: '14px',
                        color: '#8c8c8c',
                        textAlign: 'center',
                        fontFamily: '"Museo Sans", sans-serif',
                        margin: 0
                      }}>
                {'No preview data available'}
              </p>
                    </div>
            )}
          </div>
        )}
            </div>
          </div>
        </div>
        {previewFilterMenu ? (
          <div
            ref={previewFilterPanelRef}
            className="preview-col-filter__panel"
            style={{
              top: previewFilterMenu.top,
              left: previewFilterMenu.left,
            }}
            role="dialog"
            aria-label={`Filter: ${previewFilterMenu.columnKey}`}
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            {renderPreviewColumnFilterPanel(previewFilterMenu.columnKey)}
          </div>
        ) : null}
        </>
        , document.body
      )}

      {/* Download all confirmation dialog */}
      {downloadAllModalVisible && createPortal(
        <div 
          className="custom-modal-overlay"
          onClick={() => setDownloadAllModalVisible(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            animation: 'fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <div 
            className="custom-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              minWidth: '400px',
              maxWidth: '500px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              animation: 'slideInBubble 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {/* Pop-up header */}
            <div style={{
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid #f0f0f0'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: '600',
                color: '#262626',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                {'Confirm Download All'}
              </h3>
            </div>

            {/* Pop-up content */}
            <div style={{ marginBottom: '24px' }}>
        <p style={{ 
                fontSize: '12px', 
                lineHeight: '1.5', 
                margin: 0,
          color: '#666',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}>
          Are you sure you want to download all successful query results? This will download multiple CSV files one by one.
        </p>
            </div>

            {/* Pop-up window bottom button */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px'
            }}>
              <button
                onClick={() => setDownloadAllModalVisible(false)}
                disabled={isDownloadingAll}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '2px',
                  backgroundColor: 'white',
                  color: '#262626',
                  cursor: isDownloadingAll ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s',
                  opacity: isDownloadingAll ? 0.6 : 1,
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isDownloadingAll) {
                    e.currentTarget.style.borderColor = '#40a9ff';
                    e.currentTarget.style.color = '#40a9ff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isDownloadingAll) {
                    e.currentTarget.style.borderColor = '#d9d9d9';
                    e.currentTarget.style.color = '#262626';
                  }
                }}
              >
                {'Cancel'}
              </button>
              <button
                onClick={handleDownloadAll}
                disabled={isDownloadingAll}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '2px',
                  backgroundColor: isDownloadingAll ? '#d9d9d9' : '#1890ff',
                  color: 'white',
                  cursor: isDownloadingAll ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!isDownloadingAll) {
                    e.currentTarget.style.backgroundColor = '#40a9ff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isDownloadingAll) {
                    e.currentTarget.style.backgroundColor = '#1890ff';
                  }
                }}
              >
                {isDownloadingAll && <LoadingIcon />}
                {'Confirm'}
              </button>
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* Delete all confirmation dialog boxes */}
      {deleteAllModalVisible && createPortal(
        <div 
          className="custom-modal-overlay"
          onClick={() => setDeleteAllModalVisible(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500,
            animation: 'fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          <div 
            className="custom-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '20px',
              minWidth: '400px',
              maxWidth: '500px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              animation: 'slideInBubble 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            {/* Pop-up header */}
            <div style={{
              marginBottom: '16px',
              paddingBottom: '12px',
              borderBottom: '1px solid #f0f0f0'
            }}>
              <h3 style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: '600',
                color: '#262626',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                {'Confirm Delete All'}
              </h3>
            </div>

            {/* Pop-up content */}
            <div style={{ marginBottom: '24px' }}>
        <p style={{ 
                fontSize: '12px', 
                lineHeight: '1.5', 
                margin: 0,
          color: '#666',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}>
          Are you sure you want to delete all successful query results? This will delete both database records and physical files. This action cannot be undone.
        </p>
            </div>

            {/* Pop-up window bottom button */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px'
            }}>
              <button
                onClick={() => setDeleteAllModalVisible(false)}
                disabled={deletingAll}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '2px',
                  backgroundColor: 'white',
                  color: '#262626',
                  cursor: deletingAll ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s',
                  opacity: deletingAll ? 0.6 : 1,
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!deletingAll) {
                    e.currentTarget.style.borderColor = '#40a9ff';
                    e.currentTarget.style.color = '#40a9ff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!deletingAll) {
                    e.currentTarget.style.borderColor = '#d9d9d9';
                    e.currentTarget.style.color = '#262626';
                  }
                }}
              >
                {'Cancel'}
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={deletingAll}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderRadius: '2px',
                  backgroundColor: deletingAll ? '#d9d9d9' : '#ff4d4f',
                  color: 'white',
                  cursor: deletingAll ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}
                onMouseEnter={(e) => {
                  if (!deletingAll) {
                    e.currentTarget.style.backgroundColor = '#ff7875';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!deletingAll) {
                    e.currentTarget.style.backgroundColor = '#ff4d4f';
                  }
                }}
              >
                {deletingAll && <LoadingIcon />}
                {'Confirm'}
              </button>
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* Edit Table pop-up window */}
      {editTableModalVisible && createPortal(
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[1500] animate-in fade-in duration-150"
          onClick={() => setEditTableModalVisible(false)}
        >
          <div 
            className="relative bg-white text-gray-800 flex flex-col max-h-[calc(100%-64px)] w-[calc(100%-64px)] max-w-[1500px] rounded-lg shadow-lg border border-gray-200 m-8 animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontFamily: '"Museo Sans", sans-serif'
            }}
          >
            {/* Pop-up header */}
            <div className="px-6 py-4 pb-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h2 className="m-0 text-xl font-semibold text-gray-800 select-none">
                {'Edit Table & Custom Fields'}
              </h2>
              <button
                onClick={() => setEditTableModalVisible(false)}
                className="bg-transparent border-none cursor-pointer p-2 rounded flex items-center justify-center transition-colors hover:bg-gray-100 text-gray-600 hover:text-gray-800"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Pop-up content */}
            <div className="flex-1 p-6 overflow-auto">
              <div className="mb-6">
                <h3 className="m-0 mb-4 text-base font-semibold text-gray-800 select-none">
                  {'Select Columns to Display'}
                </h3>
              </div>

              {/* Field selector */}
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                {Object.entries(visibleColumns).map(([columnKey, isVisible]) => {
                  const getColumnLabel = (key: string) => {
                    const labels: Record<string, { en: string; zh: string }> = {
                      accountId: { en: 'Account Info', zh: '账户信息' },
                      appId: { en: 'APP ID', zh: '应用ID' },
                      appName: { en: 'App Name', zh: '应用名称' },
                      dataType: { en: 'Data Type', zh: '数据类型' },
                      dateRange: { en: 'Date Range', zh: '日期范围' },
                      event_filter: { en: 'Event Filter', zh: '事件过滤' },
                      primaryAttributionCount: { en: 'Primary Attribution', zh: '主要归因' },
                      afidDeduplicationCount: { en: 'AFID Deduplication', zh: 'AFID去重' },
                      mediaSource: { en: 'Media Source', zh: '媒体来源' },
                      mode: { en: 'Mode', zh: '模式' },
                      createTime: { en: 'Created At', zh: '创建时间' }
                    };
                    return labels[key] || { en: key, zh: key };
                  };

                  const label = getColumnLabel(columnKey);
                  const displayLabel = label.en;

                  return (
                    <div
                      key={columnKey}
                      className={`flex items-center px-4 py-3 rounded-md cursor-pointer transition-all duration-200 select-none ${
                        isVisible
                          ? 'bg-gray-100 border-2 border-gray-400 hover:bg-gray-200'
                          : 'bg-gray-50 border-2 border-gray-200 hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        setVisibleColumns(prev => ({
                          ...prev,
                          [columnKey]: !prev[columnKey]
                        }));
                      }}
                    >
                      <div className={`w-4 h-4 border-2 rounded mr-3 flex items-center justify-center transition-all duration-200 ${
                        isVisible
                          ? 'border-gray-600 bg-gray-600'
                          : 'border-gray-300 bg-transparent'
                      }`}>
                        {isVisible && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8.5 1L3.5 6L1.5 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm ${
                        isVisible
                          ? 'font-medium text-gray-700'
                          : 'font-normal text-gray-600'
                      }`}>
                        {displayLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Action button */}
              <div className="mt-8 pt-5 border-t border-gray-200 flex justify-end gap-3">
                <button
                  onClick={() => setEditTableModalVisible(false)}
                  className="px-4 py-2 border border-gray-300 rounded bg-white text-gray-700 cursor-pointer text-sm font-semibold transition-all duration-200 select-none hover:bg-gray-50 hover:border-gray-400"
                >
                  {'Cancel'}
                </button>
                <button
                  onClick={() => {
                    // Save column selection preferences to localStorage
                    saveColumnPreferences(visibleColumns);
                    // Close pop-up window
                    setEditTableModalVisible(false);
                  }}
                  className="px-4 py-2 border-none rounded bg-gray-700 text-white cursor-pointer text-sm font-semibold transition-all duration-200 select-none hover:bg-gray-800"
                >
                  {'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* Mode switching animation overlay has been removed */}
    </div>
  );
};

export default Home;
