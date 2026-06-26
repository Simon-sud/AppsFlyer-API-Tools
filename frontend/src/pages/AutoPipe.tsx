import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAccount } from '../contexts/AccountContext';
import { useUser } from '../contexts/UserContext';
// Removed unused icon imports: PlayCircle, PauseCircle, AlertTriangle, Plus, Pause, Play, RotateCcw, Eye, Settings, Trash2, Clock, Filter
import { 
  RefreshCw,
  Search,
  HelpCircle,
  X,
} from 'lucide-react';
// Removed unused icon import: VscWarning
import { VscPulse, VscRunErrors, VscListSelection, VscListFlat, VscTarget, VscSymbolKeyword, VscCloseAll, VscAccount, VscDiffAdded, VscRunAllCoverage } from 'react-icons/vsc';
import { BsApple, BsAndroid2, BsCardChecklist, BsRepeat1, Bs1Square } from 'react-icons/bs';
import { RiArtboard2Line, RiArrowDownSLine, RiArrowUpSLine, RiDownloadLine } from 'react-icons/ri';
import { MdDownloading, MdDataSaverOn, MdDonutLarge, MdWarningAmber } from 'react-icons/md';
import { GoVersions, GoIssueClosed, GoColumns, GoFlame } from 'react-icons/go';
import { autopipeAxiosInstance, TEAM_SCOPE_STORAGE_NAME } from '../services/api';
import { message as toastMessage } from '../components/ui/toast';
import { LoadingIcon } from '../components/ui/icons';
import TaskStatisticsChart from '../components/charts/TaskStatisticsChart';
import './AutoPipe.css';

interface AppInfo {
  app_id: string;
  app_name: string;
  icon_url: string;
  os: 'IOS' | 'Android';
  country?: string;
  category?: string;
  developer?: string;
  rating?: number;
  progress?: number; // Independent progress for each app
}

// API Response Types
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    total: number;
  };
  task_id?: string;
  data_deleted?: number;
  message?: string;
  processed?: number;
}

// API service function
const fetchAppsFromDatabase = async (): Promise<AppInfo[]> => {
  try {
    const response = await fetch('/api/apps-finder?page=1&pageSize=20');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    
    if (result.data && Array.isArray(result.data)) {
      return result.data.map((app: any) => ({
        app_id: app.appId,
        app_name: app.appName,
        icon_url: app.iconUrl || '',
        os: app.os === 'IOS' ? 'IOS' : 'Android',
        country: app.country,
        category: app.category,
        developer: app.developer,
        rating: app.rating
      }));
    }
    return [];
  } catch (error) {
    // Error handled silently
    return [];
  }
};

// Get application data for a specified platform
const fetchAppsByPlatform = async (platform: 'IOS' | 'Android', searchTerm?: string): Promise<AppInfo[]> => {
  try {
    let url = `/api/apps-finder?page=1&pageSize=10&os=${platform}`;
    
    if (searchTerm && searchTerm.trim()) {
      // Unified keyword fuzzy search: supports English, numbers, and Chinese (the backend is app_id/app_name/developer multi-field LIKE)
      url += `&keyword=${encodeURIComponent(searchTerm.trim())}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    
    if (result.data && Array.isArray(result.data)) {
      return result.data.map((app: any) => ({
        app_id: app.appId,
        app_name: app.appName,
        icon_url: app.iconUrl || '',
        os: app.os === 'IOS' ? 'IOS' : 'Android',
        country: app.country,
        category: app.category,
        developer: app.developer,
        rating: app.rating
      }));
    }
    return [];
  } catch (error) {
    // Error handled silently
    return [];
  }
};

// URL decoding and Postback URL handling functions
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _decodePostbackUrl = async (postbackUrl: string): Promise<{
  attributed_touch_time: string;
  install_time: string;
  event_time: string;
}> => {
  try {
    const response = await fetch('/api/decode-postback-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ postback_url: postbackUrl })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    
    if (result.success) {
      return result.data;
    } else {
      throw new Error(result.error || 'Decode failed');
    }
  } catch (error) {
    // Error handled silently
    return {
      attributed_touch_time: '',
      install_time: '',
      event_time: ''
    };
  }
};

// Batch processing Postback URLs from CSV data
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _processCsvPostbackUrls = async (csvData: any[]): Promise<any[]> => {
  try {
    const response = await fetch('/api/process-csv-postback-urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ csv_data: csvData })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    
    if (result.success) {
      return result.data;
    } else {
      throw new Error(result.error || 'Process failed');
    }
  } catch (error) {
    // Error handled silently
    return csvData; // If processing fails, return the original data
  }
};

// Client-side URL decoding function (for fast processing, no API calls required)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _decodePostbackUrlClient = (postbackUrl: string): {
  attributed_touch_time: string;
  install_time: string;
  event_time: string;
} => {
  try {
    const url = new URL(postbackUrl);
    const params = new URLSearchParams(url.search);
    
    return {
      attributed_touch_time: params.get('CLICK_TIMESTAMP') ? decodeURIComponent(params.get('CLICK_TIMESTAMP')!) : '',
      install_time: params.get('INSTALL_TIMESTAMP') ? decodeURIComponent(params.get('INSTALL_TIMESTAMP')!) : '',
      event_time: params.get('TIMESTAMP') ? decodeURIComponent(params.get('TIMESTAMP')!) : ''
    };
  } catch (error) {
    // Error handled silently
    return {
      attributed_touch_time: '',
      install_time: '',
      event_time: ''
    };
  }
};

// ========================================
// AutoPipe task management API service function
// AutoPipe API has been moved to a standalone Go service (port 5001)
// ========================================

// Get task list
const fetchTasks = async (params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  accountId?: string;
  type?: string;
  search?: string;
}): Promise<{ tasks: any[]; total: number }> => {
  try {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
    if (params?.status && params.status !== 'all') queryParams.append('status', params.status);
    if (params?.accountId && params.accountId !== 'all') queryParams.append('accountId', params.accountId);
    if (params?.type && params.type !== 'all') queryParams.append('type', params.type);
    if (params?.search) queryParams.append('search', params.search);

    const response = await autopipeAxiosInstance.get(`/api/autopipe/tasks?${queryParams.toString()}`);
    const result = response.data as ApiResponse<any[]>;

    if (result.success) {
      return {
        tasks: result.data || [],
        total: result.pagination?.total || 0
      };
    } else {
      throw new Error(result.error || 'Failed to fetch tasks');
    }
  } catch (error) {
    // Error handled silently
    return { tasks: [], total: 0 };
  }
};

// Create task
const createTask = async (taskData: {
  task_id: string;
  type: string;
  account_id: string;
  data_pointer: string;
  app_type: string;
  apps: AppInfo[];
  status?: string;
  description?: string;
  priority?: string;
  schedule?: any;
}): Promise<{ success: boolean; task_id?: string; error?: string }> => {
  try {
    const response = await autopipeAxiosInstance.post('/api/autopipe/tasks', taskData);
    const result = response.data as ApiResponse;

    if (result.success) {
      return { success: true, task_id: result.task_id };
    } else {
      return { success: false, error: result.error || 'Failed to create task' };
    }
  } catch (error) {
    // Error handled silently
    return { success: false, error: (error as Error).message };
  }
};

// update task
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _updateTask = async (taskId: string, updates: {
  type?: string;
  status?: string;
  description?: string;
  priority?: string;
  account_id?: string;
  data_pointer?: string;
  app_type?: string;
  apps?: AppInfo[];
}): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await autopipeAxiosInstance.put(`/api/autopipe/tasks/${taskId}`, updates);
    const result = response.data as ApiResponse;

    if (result.success) {
      return { success: true };
    } else {
      return { success: false, error: result.error || 'Failed to update task' };
    }
  } catch (error) {
    console.error('Failed to update task:', error);
    return { success: false, error: (error as Error).message };
  }
};

// Delete task
const deleteTask = async (taskId: string): Promise<{ success: boolean; error?: string; dataDeleted?: number; message?: string }> => {
  try {
    const response = await autopipeAxiosInstance.delete(`/api/autopipe/tasks/${taskId}`);

    const result = response.data as ApiResponse;

    if (result.success) {
      return { 
        success: true, 
        dataDeleted: result.data_deleted || 0,
        message: result.message 
      };
    } else {
      return { success: false, error: result.error || 'Failed to delete task' };
    }
  } catch (error: any) {
    // Idempotent deletion: When the task has been deleted (404), the front end will process it successfully to avoid false positives caused by continuous clicks/concurrent deletions.
    if (error?.response?.status === 404) {
      return { success: true, dataDeleted: 0, message: 'Task already deleted' };
    }
    return { success: false, error: (error as Error).message };
  }
};

// Update task status
const updateTaskStatus = async (taskId: string, status: 'running' | 'paused' | 'completed'): Promise<{ success: boolean; error?: string }> => {
  try {
    const response = await autopipeAxiosInstance.patch(`/api/autopipe/tasks/${taskId}/status`, { status });
    const result = response.data as ApiResponse;

    if (result.success) {
      return { success: true };
    } else {
      return { success: false, error: result.error || 'Failed to update task status' };
    }
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};

// Download task data
const downloadTaskData = async (taskId: string, taskType: string): Promise<void> => {
  try {
    const response = await autopipeAxiosInstance.get(`/api/autopipe/tasks/${taskId}/download`, {
      responseType: 'blob',
    });

    // Create blob URL
    const blob = new Blob([response.data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement('a');
    link.href = url;

    // Reuse AutoPipe export naming rules (consistent with token/report CSV): Task_{taskid}_{data_type}_{download_time}.xlsx
    const titleCaseUnderscore = (s: string) =>
      s
        .split('_')
        .map((p) => {
          const x = p.trim().toLowerCase();
          if (!x) return '';
          return x.slice(0, 1).toUpperCase() + x.slice(1);
        })
        .filter(Boolean)
        .join('_');

    const downloadDate = new Date().toISOString().slice(0, 10).replaceAll('-', ''); // YYYYMMDD
    link.download = `Task_${taskId}_${titleCaseUnderscore(taskType)}_${downloadDate}.xlsx`;
    document.body.appendChild(link);
    link.click();
    
    // clean up
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    // Error handled silently
    alert('下载失败: ' + ((error as Error).message || 'Unknown error'));
  }
};

// Custom paginator component
interface CustomPaginationProps {
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

const CustomPagination: React.FC<CustomPaginationProps> = ({
  current,
  pageSize,
  total,
  onChange
}) => {
  const totalPages = Math.ceil(total / pageSize);
  
  // Calculate the displayed page range
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // If the total number of pages is less than or equal to the maximum number of displayed pages, display all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Otherwise, show pages near the current page
      let start = Math.max(1, current - Math.floor(maxVisiblePages / 2));
      let end = Math.min(totalPages, start + maxVisiblePages - 1);
      
      // Adjust the starting position to ensure that enough pages are displayed
      if (end - start + 1 < maxVisiblePages) {
        start = Math.max(1, end - maxVisiblePages + 1);
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  };

  const pageNumbers = getPageNumbers();

  if (totalPages <= 1) {
    return null; // If there is only one page or no data, do not show the pager
  }

  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-center gap-2 text-sm select-none" style={{
      fontFamily: '"Museo Sans", sans-serif'
    }}>
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, current - 1))}
          disabled={current === 1}
          className={`inline-flex h-8 w-8 items-center justify-center border border-transparent bg-transparent p-0 leading-none rounded-sm transition-all duration-200 ${
            current === 1
              ? 'cursor-not-allowed text-gray-300'
              : 'cursor-pointer text-gray-600 hover:border-gray-300 hover:text-gray-900'
          }`}
          aria-label="Previous page"
        >
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
            <path d="M7.5 3L4.5 6L7.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {pageNumbers.map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => onChange(page)}
            className={`inline-flex h-8 w-8 items-center justify-center border bg-transparent p-0 leading-none rounded-sm text-sm transition-all duration-200 ${
              page === current
                ? 'border-gray-500 text-gray-900 font-semibold'
                : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
            }`}
            aria-label={`Go to page ${page}`}
          >
            {page}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, current + 1))}
          disabled={current === totalPages}
          className={`inline-flex h-8 w-8 items-center justify-center border border-transparent bg-transparent p-0 leading-none rounded-sm transition-all duration-200 ${
            current === totalPages
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

      <div className="text-gray-500 text-[11px] text-center">
        {`${start}-${end} / ${total}`}
      </div>
    </div>
  );
};

// Parse the error message and extract the error type (such as "TLS handshake timeout")
const parseErrorMessage = (errorMessage: string): string => {
  if (!errorMessage) return '';
  
  // Remove URL and request header information, leaving only error type
  // The error message format is usually: "fetch CSV: API request failed: Get "https://...": net/http: TLS handshake timeout"
  // Or: "API request failed: ...: TLS handshake timeout"
  
  // First remove the full URL within quotes
  let cleaned = errorMessage.replace(/"[^"]*https?:\/\/[^"]*"/g, '');
  
  // Try to match "net/http: error_type" pattern (match to end of line)
  const netHttpMatch = cleaned.match(/net\/http:\s*(.+?)$/);
  if (netHttpMatch) {
    const errorType = netHttpMatch[1].trim();
    if (errorType && errorType.length < 80) {
      return errorType;
    }
  }
  
  // Try to match whatever comes after the last colon (usually the error type)
  const lastColonIndex = cleaned.lastIndexOf(':');
  if (lastColonIndex > 0) {
    const afterLastColon = cleaned.substring(lastColonIndex + 1).trim();
    // Remove possible quotes, brackets, etc
    const errorType = afterLastColon.replace(/^["'()]|["'()]$/g, '').trim();
    // Remove possible URL fragments
    const finalErrorType = errorType.replace(/https?:\/\/[^\s]+/g, '').trim();
    if (finalErrorType && finalErrorType.length < 80 && !finalErrorType.includes('http')) {
      return finalErrorType;
    }
  }
  
  // If no match is found, return the first 80 characters of the original message (to avoid overflow)
  return errorMessage.length > 80 ? errorMessage.substring(0, 80) + '...' : errorMessage;
};

const isRetryableTimeoutError = (errorText?: string | null): boolean => {
  if (!errorText) return false;
  const text = String(errorText).toLowerCase();
  return (
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('deadline exceeded') ||
    text.includes('tls handshake timeout') ||
    text.includes('context deadline exceeded')
  );
};

// Dynamic circular progress bar component
const AppProgressComponent: React.FC<{
  app: AppInfo;
  progress: number;
  status: 'running' | 'paused' | 'completed' | 'warning';
  index: number;
  taskId: string;
  dataPointer: string;
  startDate?: string;
  taskType?: 'daily' | 'single'; // Add task type parameter
}> = React.memo(({ app, progress, status, index, taskId, dataPointer, startDate, taskType }) => {
  const [showBubble, setShowBubble] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [bubbleData, setBubbleData] = useState<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // ========== Simplified progress display logic ==========
  // Fix: directly use the progress value returned by the backend, based on the actual value of the database
  // The backend has been fixed to calculate progress based on the database. The frontend should be used directly without complex simulation logic.
  const [displayProgress, setDisplayProgress] = useState(progress);
  
  // Synchronize when the backend progress or task display status changes (the ring must be reset when Warning→Running to avoid getting stuck in the old display during batch updates)
  useEffect(() => {
    setDisplayProgress(progress);
  }, [progress, status]);

  // Click outside to close the bubble
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showBubble && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowBubble(false);
      }
    };

    if (showBubble) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showBubble]);

  const getStatusColor = () => {
    // Determine platform type based on AppID
    const isIOSApp = !app.app_id.startsWith('com.') && !app.app_id.includes('.');
    const isGooglePlayApp = app.app_id.startsWith('com.') || app.app_id.includes('.');
    
    // iOS uses blue, Android uses dark green (unified for all states)
    return isIOSApp ? '#007AFF' : isGooglePlayApp ? '#34A853' : '#34A853';
  };

  const circumference = 2 * Math.PI * 16;
  const strokeDashoffset = circumference * (1 - displayProgress / 100);

  //Click to process
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // If the bubble is displayed, close it directly
    if (showBubble) {
      setShowBubble(false);
      return;
    }
    
    // Display the bubble immediately (display loading status first)
    setShowBubble(true);
    setBubbleData({
      status: 'loading',
      statusCode: 0,
      dataFetched: 0,
      dataDeduplicated: 0,
      dataWritten: 0,
      executionTime: 'Loading...',
      timeInfo: 'Loading...',
      errorMessage: null
    });
    
    // Asynchronously get the latest execution logs from the backend (filtered by app_id)
    try {
      const response = await autopipeAxiosInstance.get(`/api/autopipe/tasks/${taskId}/logs?page=1&pageSize=10`);
      const result = response.data as ApiResponse<any[]>;
        if (result.success && result.data && result.data.length > 0) {
          // Find the latest log corresponding to the app_id
          const appLogs = result.data.filter((log: any) => log.app_id === app.app_id);
          const latestLog = appLogs.length > 0 ? appLogs[0] : result.data[0];
          
          // Determine time display based on mission mode
          let timeInfo = '';
          if (dataPointer === 'Single Execution' && startDate) {
            // Single mode: display date range
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const toDate = yesterday.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
            
            // Parse start date (supports multiple formats)
            const fromDateObj = new Date(startDate);
            if (!isNaN(fromDateObj.getTime())) {
              const fromDate = fromDateObj.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
              timeInfo = `From ${fromDate} To ${toDate}`;
            } else {
              // If date parsing fails, try using the string directly
              console.warn('Failed to parse startDate:', startDate);
              timeInfo = `From ${startDate} To ${toDate}`;
            }
          } else {
            // Daily mode: displays the last execution time
            timeInfo = `Last: ${new Date(latestLog.execution_time).toLocaleString()}`;
          }
          
          setBubbleData({
            status: latestLog.status,
            statusCode: latestLog.status === 'success' ? 200 : 400,
            dataFetched: latestLog.data_fetched || 0,
            dataDeduplicated: latestLog.data_deduplicated || 0,
            dataWritten: latestLog.data_processed || 0,
            executionTime: formatExecutionTime(latestLog.execution_duration),
            timeInfo: timeInfo,
            errorMessage: latestLog.error_message
          });
        } else {
          // There is no execution log, and different information is displayed according to the task status.
          let timeInfo = '';
          if (dataPointer === 'Single Execution' && startDate) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const toDate = yesterday.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
            
            // parse start date
            const fromDateObj = new Date(startDate);
            if (!isNaN(fromDateObj.getTime())) {
              const fromDate = fromDateObj.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
              timeInfo = `From ${fromDate} To ${toDate}`;
            } else {
              console.warn('Failed to parse startDate:', startDate);
              timeInfo = `From ${startDate} To ${toDate}`;
            }
          } else {
            timeInfo = status === 'running' ? 'Executing...' : 'No execution yet';
          }
          
          setBubbleData({
            status: status === 'running' ? 'executing' : 'pending',
            statusCode: null,
            dataFetched: 0,
            dataDeduplicated: 0,
            dataWritten: 0,
            executionTime: status === 'running' ? 'In Progress...' : 'N/A',
            timeInfo: timeInfo,
            errorMessage: null
          });
      }
    } catch (error) {
      // Error handled silently
      // Display error message when an error occurs
      setBubbleData({
        status: 'error',
        statusCode: null,
        dataFetched: 0,
        dataDeduplicated: 0,
        dataWritten: 0,
        executionTime: 'N/A',
        timeInfo: 'Failed to load',
        errorMessage: 'Failed to fetch logs'
      });
    }
  };
  
  // Format execution time
  const formatExecutionTime = (seconds: number): string => {
    if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${minutes}m ${secs}s`;
  };

  return (
    <div 
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        backgroundColor: isHovered ? '#e9ecef' : '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        // Text content uses internal overflow/ellipsis control; bubbles are absolutely positioned and need to allow overflow display
        overflow: 'visible',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      {/* App Icon */}
      <div style={{
        width: '28px',
        height: '28px',
        borderRadius: '6px',
        overflow: 'hidden',
        flexShrink: 0,
        background: 'rgba(0, 0, 0, 0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        {app.icon_url ? (
          <img
            src={app.icon_url}
            alt={app.app_name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              position: 'absolute',
              top: 0,
              left: 0
            }}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // When the icon loading fails, hide the img and display the default icon
              const img = e.target as HTMLImageElement;
              img.style.display = 'none';
              const container = img.parentElement;
              if (container) {
                const defaultIcon = container.querySelector('.default-app-icon') as HTMLElement;
                if (defaultIcon) {
                  defaultIcon.style.display = 'flex';
                }
              }
            }}
          />
        ) : null}
        <div 
          className="default-app-icon"
          style={{
            display: app.icon_url ? 'none' : 'flex',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(to bottom right, #60a5fa, #a78bfa)',
            borderRadius: '6px',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: '600',
            color: '#ffffff',
            position: 'absolute',
            top: 0,
            left: 0
          }}
        >
          {app.app_name ? app.app_name.charAt(0).toUpperCase() : 'A'}
        </div>
      </div>
      
      {/* App information */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontSize: '12px',
          fontWeight: '500',
          color: 'rgba(0, 0, 0, 0.72)',
          marginBottom: '1px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}>
          {app.app_name || 'Unknown App'}
        </div>
        <div style={{
          fontSize: '10px',
          color: 'rgba(0, 0, 0, 0.48)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}>
          {app.app_id} • {app.os === 'IOS' ? 'IOS' : 'Android'}
        </div>
      </div>
      
      {/* Dynamic circular progress bar - merged into the container and displayed to the right */}
      <div className="relative inline-flex items-center justify-center w-10 h-10 flex-shrink-0">
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          className="absolute top-0 left-0 -rotate-90"
          style={{
            shapeRendering: 'geometricPrecision',
            textRendering: 'geometricPrecision'
          }}
        >
          {/* Dynamic progress ring - black and gray simple tones */}
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="stroke-gray-600 transition-[stroke-dashoffset] duration-300 ease-out"
            style={{
              shapeRendering: 'geometricPrecision',
              filter: 'blur(0.2px)'
            }}
          />
        </svg>
        
        {/* Dynamic percentage text - black and gray simple tones */}
        <div 
          className="absolute top-5 left-5 -translate-x-1/2 -translate-y-1/2 text-[8px] font-semibold text-gray-600 leading-none text-center whitespace-nowrap select-none pointer-events-none antialiased transition-colors duration-300"
          style={{
            textRendering: 'geometricPrecision',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
            fontSmooth: 'always',
            filter: 'blur(0.1px)'
          }}
        >
          {Math.round(displayProgress)}%
        </div>
      </div>
      
      {/* bubble tip */}
      {showBubble && bubbleData && (
        <div
          className="app-progress-bubble"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            width: '320px', // Fixed width to avoid width changes caused by content changes
            backgroundColor: 'white',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '12px 14px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            animation: 'bubbleSlideUp 0.2s ease-out forwards',
            fontSize: '11px',
            lineHeight: '1.5',
            willChange: 'transform, opacity',
            backfaceVisibility: 'hidden',
            perspective: '1000px',
            transformStyle: 'preserve-3d',
            transformOrigin: 'center bottom', // Set the transformation origin to ensure stable centering
            boxSizing: 'border-box' // Make sure the padding is included within the width
          }}
          onAnimationStart={(e) => {
            // Set the initial transform immediately when the animation starts to ensure a stable position
            const target = e.currentTarget;
            target.style.transform = 'translate3d(-50%, 10px, 0)';
          }}
          onAnimationEnd={(e) => {
            // After the animation ends, make sure the final state is stable
            const target = e.currentTarget;
            // Set the final state immediately, using translate3d to maintain hardware acceleration
            target.style.transform = 'translate3d(-50%, 0, 0)';
            // Force the browser to redraw, ensuring state is applied
            void target.offsetHeight; // trigger reflow
            // Delayed cleanup will-change to ensure the browser completes rendering optimization
            requestAnimationFrame(() => {
              target.style.willChange = 'auto';
              // Again make sure the transform state is stable
              target.style.transform = 'translate3d(-50%, 0, 0)';
            });
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* content */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* title bar */}
            <div style={{ 
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px'
            }}>
              <div style={{ 
                fontWeight: '600', 
                color: '#333', 
                fontSize: '12px',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {app.app_name}
              </div>
              {bubbleData.status === 'executing' || bubbleData.status === 'loading' ? (
                <div style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: '#e6f7ff',
                  color: '#1890ff',
                  marginLeft: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    border: '2px solid #1890ff',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }} />
                  {bubbleData.status === 'loading' ? 'Loading...' : 'Executing...'}
                </div>
              ) : bubbleData.status === 'pending' ? (
                <div style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: '#f5f5f5',
                  color: '#999',
                  marginLeft: '8px'
                }}>
                  Not Started
                </div>
              ) : bubbleData.statusCode !== null ? (
                <div style={{
                  fontSize: '10px',
                  fontWeight: '600',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  backgroundColor: bubbleData.status === 'success' ? '#d4edda' : '#f8d7da',
                  color: bubbleData.status === 'success' ? '#155724' : '#721c24',
                  marginLeft: '8px'
                }}>
                  {bubbleData.statusCode}
                </div>
              ) : null}
            </div>
            
            {/* Statistics - four columns compact layout */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              gap: '0px',
              paddingTop: '8px',
              borderTop: '1px solid #f0f0f0',
              alignItems: 'center',
              justifyItems: 'center'
            }}>
              <div style={{ 
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                padding: '4px 0'
              }}>
                <div style={{ color: '#999', fontSize: '9px', marginBottom: '3px', lineHeight: '1' }}>Fetched</div>
                <div style={{ 
                  fontWeight: '600', 
                  color: '#007AFF',
                  fontSize: '11px',
                  lineHeight: '1'
                }}>
                  {bubbleData.dataFetched.toLocaleString()}
                </div>
              </div>
              
              <div style={{ 
                textAlign: 'center', 
                borderLeft: '1px solid #f0f0f0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                padding: '4px 0'
              }}>
                <div style={{ color: '#999', fontSize: '9px', marginBottom: '3px', lineHeight: '1' }}>Deduped</div>
                <div style={{ 
                  fontWeight: '600', 
                  color: '#FF6B6B',
                  fontSize: '11px',
                  lineHeight: '1'
                }}>
                  {bubbleData.dataDeduplicated.toLocaleString()}
                </div>
              </div>
              
              <div style={{ 
                textAlign: 'center', 
                borderLeft: '1px solid #f0f0f0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                padding: '4px 0'
              }}>
                <div style={{ color: '#999', fontSize: '9px', marginBottom: '3px', lineHeight: '1' }}>Written</div>
                <div style={{ 
                  fontWeight: '600', 
                  color: getStatusColor(),
                  fontSize: '11px',
                  lineHeight: '1'
                }}>
                  {bubbleData.dataWritten.toLocaleString()}
                </div>
              </div>
              
              <div style={{ 
                textAlign: 'center', 
                borderLeft: '1px solid #f0f0f0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                padding: '4px 0'
              }}>
                <div style={{ color: '#999', fontSize: '9px', marginBottom: '3px', lineHeight: '1' }}>Duration</div>
                <div style={{ 
                  fontWeight: '600', 
                  color: '#333',
                  fontSize: '11px',
                  lineHeight: '1'
                }}>
                  {bubbleData.executionTime}
                </div>
              </div>
            </div>
            
            {/* time information */}
            <div style={{ 
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid #f0f0f0',
              fontSize: '9px',
              color: '#999',
              textAlign: 'center'
            }}>
              {bubbleData.timeInfo}
            </div>
            
            {/* Error message (if any) */}
            {bubbleData.errorMessage && (
              <div style={{ 
                marginTop: '8px',
                padding: '6px 8px',
                backgroundColor: '#fff3cd',
                borderRadius: '4px',
                fontSize: '9px',
                color: '#856404',
                border: '1px solid #ffeaa7',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                maxWidth: '100%',
                overflow: 'hidden'
              }}>
                ⚠️ {parseErrorMessage(bubbleData.errorMessage)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function: Return true to indicate that the props are equal (no re-rendering), false to indicate that re-rendering is required
  // Fix: Ensure re-rendering is triggered when progress changes
  // Note: progress prop and app.progress should be the same value, but to be safe both are checked
  
  // If key attributes change, re-rendering is required
  if (prevProps.app.app_id !== nextProps.app.app_id ||
      prevProps.progress !== nextProps.progress ||
      prevProps.status !== nextProps.status ||
      prevProps.taskType !== nextProps.taskType ||
      prevProps.app.progress !== nextProps.app.progress ||
      prevProps.app.app_name !== nextProps.app.app_name) {
    return false; // Need to re-render
  }
  
  // All key properties are equal and no re-rendering is required
  return true;
});

interface Task {
  id: string;
  type: 'install_pb' | 'event_pb' | 'install_rtpb' | 'event_rtpb';
  status: 'running' | 'paused' | 'completed' | 'warning';
  progress: number;
  startTime: string;
  endTime?: string;
  duration?: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  accountId: string; // Bind to account ID
  taskId: string; // Encrypted task ID
  apps: AppInfo[]; // Associated App information, up to 2
  createTime: string; // Task creation time, unique
  latestUpdateTime: string; // The latest update time of the task will change as the status changes
  dataPointer: 'Daily Execution' | 'Single Execution'; // Duration&Mode settings
  appType?: 'ios' | 'android' | 'both'; // App type
  executionTime?: string; // Daily mode execution time (HH:MM)
  executionDate?: string; // Single mode execution date (YYYY-MM-DD)
}

// Special for polling merge: Warning is only displayed on the front end, and running in the library; if you use status=warning to request, you will not be able to find the data, and running cannot be eliminated as not meeting the filter when merging.
function taskMatchesPollingStatusFilter(task: Task, statusFilter: string): boolean {
  if (!statusFilter || statusFilter === 'all') return true;
  if (statusFilter === 'warning') {
    return task.status === 'warning' || task.status === 'running';
  }
  return task.status === statusFilter;
}

// Anti-shake function
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

const AutoPipe: React.FC = () => {
  const { accountConfigs, loading: accountLoading, error: accountError, refreshAccountConfigs } = useAccount();
  const { userProfile } = useUser();
  const isSuperAdmin = userProfile?.role === 'Super Admin';
  const selectedTeamName = typeof window !== 'undefined' ? window.sessionStorage.getItem(TEAM_SCOPE_STORAGE_NAME) : null;
  const newTaskDisabled = isSuperAdmin && selectedTeamName != null && selectedTeamName !== 'Super Admin';
  const [searchText, setSearchText] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_priorityFilter, setPriorityFilter] = useState<string>('all');
  
  // Real application data status
  const [realApps, setRealApps] = useState<AppInfo[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_appsLoading, setAppsLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const tasksLoadingTokenRef = React.useRef(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Mark whether it is loaded for the first time
  const [tasks, setTasks] = useState<Task[]>([]);
  const tasksLengthRef = React.useRef(0);
  tasksLengthRef.current = tasks.length;
  
  // Use ref to store the latest filter conditions to ensure that the latest values are used when polling for updates
  const filtersRef = React.useRef({
    statusFilter,
    typeFilter,
    accountFilter,
    searchText
  });
  
  // Filter change flag to prevent polling from interfering during filter changes
  // Using state instead of ref ensures that React can immediately respond to changes and re-render
  const [isFilterChanging, setIsFilterChanging] = React.useState(false);
  const isFilterChangingRef = React.useRef(false); // Reserve ref for polling checks
  const [allTasksForChart, setAllTasksForChart] = useState<Task[]>([]); // All task data for chart display (not affected by filters)
  const [hasLoadedTasksOnce, setHasLoadedTasksOnce] = useState(false); // First load completion mark to avoid No Task flashing
  // Data Tag slider fixed configuration - no dynamic calculation required
  // Fixed width: TASK=58px, ACCOUNT=78px, TYPE=58px (including padding)
  // Fixed position: TASK=0px, ACCOUNT=58px, TYPE=136px (relative to the left side of the track, minus 2px padding)
  const DATA_TAG_CONFIG = {
    TASK: { position: 0, width: 58 },
    ACCOUNT: { position: 58, width: 78 },
    TYPE: { position: 136, width: 58 }
  };
  // Chart control state
  const [timeRange, setTimeRange] = useState<3 | 7 | 15 | 30>(3);
  const [dataTag, setDataTag] = useState<'TASK' | 'ACCOUNT' | 'TYPE'>('TASK');
  const [chartMode, setChartMode] = useState<'STACKED' | 'DIVERT'>('STACKED');
  const [timeRangeDropdownOpen, setTimeRangeDropdownOpen] = useState(false);
  const timeRangeDropdownRef = useRef<HTMLDivElement>(null);
  // Slider position state - use fixed value directly
  const [sliderPosition, setSliderPosition] = useState(DATA_TAG_CONFIG.TASK.position);
  const [sliderWidth, setSliderWidth] = useState(DATA_TAG_CONFIG.TASK.width);
  const isFirstRenderRef = useRef(true); // First render markup, control animation, use ref to avoid re-rendering
  const [pollingTrigger, setPollingTrigger] = useState(0); // Force triggering of progress polling recheck
  const [shouldAnimate, setShouldAnimate] = useState(false); // Control animation status to avoid animation inconsistency caused by ref changes
  const [refreshButtonAnimate, setRefreshButtonAnimate] = useState(false); // Control the Refresh button animation state
  const tasksCacheRef = useRef<Map<string, Task>>(new Map()); // Task caching to avoid frequent refreshes
  const deletedTaskIdsRef = useRef<Set<string>>(new Set()); // Delete tombstones to prevent polling from adding deleted tasks back to the page
  const lastFullRefreshRef = useRef<number>(0); // The timestamp of the last complete refresh
  const originalTaskStatusRef = useRef<Map<string, 'running' | 'paused' | 'completed'>>(new Map()); // Save the original state of the task (used to restore the warning state)
  const warningRetryableRef = useRef<Map<string, boolean>>(new Map()); // Warning Whether to allow polling to continue (only timeout type errors)
  const lastFiltersRef = useRef<{ statusFilter: string; accountFilter: string; typeFilter: string; searchText: string } | null>(null); // Filter conditions when the task was last loaded, used to avoid repeated requests during global refresh

  // Auxiliary function to check task warning status (reusable, promoted to component level)
  const checkTaskWarningStatus = React.useCallback(async (task: Task): Promise<Task> => {
    try {
      // Get the task's execution log - use task.id (internal ID), not task.taskId (encrypted task ID)
      const response = await autopipeAxiosInstance.get(`/api/autopipe/tasks/${task.id}/logs?page=1&pageSize=100`);
      const result = response.data as ApiResponse<any[]>;
      
      if (result.success && result.data && result.data.length > 0) {
        // Get all app_ids of tasks
        const appIds = task.apps.map(app => app.app_id);
        
        // Check the latest execution log of each app (sorted by execution_time, take the latest)
        const latestLogsByApp = new Map<string, any>();
        result.data.forEach((log: any) => {
          if (appIds.includes(log.app_id)) {
            const existing = latestLogsByApp.get(log.app_id);
            if (!existing || new Date(log.execution_time) > new Date(existing.execution_time)) {
              latestLogsByApp.set(log.app_id, log);
            }
          }
        });
        
        // Check if any app's latest execution log has a non-200 status
        let hasNon200Status = false;
        let hasRetryableTimeout = false;
        const latestStatuses: string[] = [];
        latestLogsByApp.forEach((log, appId) => {
          latestStatuses.push(`${appId}:${log.status}`);
          if (log.status !== 'success') {
            hasNon200Status = true;
            const parsedError = parseErrorMessage(log.error_message || log.message || '');
            if (isRetryableTimeoutError(parsedError || log.error_message || log.message || '')) {
              hasRetryableTimeout = true;
            }
          }
        });
        
        // If some apps do not have execution logs, they are also considered to have non-200 status (conservative treatment)
        if (latestLogsByApp.size < appIds.length) {
          // No status rollback is performed when the log is incomplete to avoid Warning <-> Running jitter.
          return task;
        }
        
        if (hasNon200Status) {
          // If there is a non-200 status code, set it to warning; only timeout type errors are allowed to continue to retry polling.
          warningRetryableRef.current.set(task.id, hasRetryableTimeout);
          return { ...task, status: 'warning' as const };
        } else {
          // The latest execution of all apps is in status 200, and the original status is restored.
          warningRetryableRef.current.delete(task.id);
          const originalStatus = originalTaskStatusRef.current.get(task.id) || (task.dataPointer === 'Daily Execution' ? 'running' : 'completed');
          return { ...task, status: originalStatus };
        }
      } else {
        // The warning will not be rolled back when there is no execution log to avoid status jitter caused by misjudgment.
        if (task.status === 'warning') return task;
      }
    } catch (error) {
      // Maintain the status quo when obtaining logs fails to prevent warning from being mistakenly restored to running/paused
      if (task.status === 'warning') return task;
    }
    return task;
  }, []);

  // Unified task loading entrance (aligned with the loading method of Apps Finder)
  const loadTasks = React.useCallback(async (query: {
    page?: number;
    pageSize?: number;
    status?: string;
    accountId?: string;
    type?: string;
    search?: string;
  }) => {
    const token = ++tasksLoadingTokenRef.current;
    setTasksLoading(true);
    try {
      // Before starting the load, if this is a load triggered by a filter change, make sure to clear the old data
      // This avoids showing old data that doesn't match the new filter criteria during loading
      const { tasks: loadedTasks } = await fetchTasks(query);

      const formattedTasks: Task[] = (loadedTasks || []).map((task: any) => ({
        id: task.id,
        type: task.type,
        status: task.status,
        progress: (task.progress !== undefined && task.progress !== null) ? task.progress : 0,
        startTime: task.execution_date || task.start_time || task.create_time,
        endTime: task.end_time,
        duration: task.duration,
        description: task.description || '',
        priority: task.priority || 'medium',
        accountId: task.account_id,
        taskId: task.task_id,
        apps: (task.apps || []).map((app: any) => ({
          app_id: app.app_id,
          app_name: app.app_name,
          icon_url: app.icon_url || '',
          os: app.os as 'IOS' | 'Android',
          country: app.country,
          category: app.category,
          developer: app.developer,
          rating: app.rating,
          // Make sure progress is a valid number and newly created tasks (status is running but progress may not be initialized) should start from 0
          progress: (app.progress !== undefined && app.progress !== null && typeof app.progress === 'number' && app.progress >= 0 && app.progress <= 100) 
            ? app.progress 
            : 0
        })),
        createTime: task.create_time,
        latestUpdateTime: task.latest_update_time,
        dataPointer: task.data_pointer || 'Daily Execution',
        appType: task.app_type,
        executionTime: task.execution_time || undefined, // Daily mode execution time
        executionDate: task.execution_date || undefined  // Single mode execution date
      })).filter((task) => !deletedTaskIdsRef.current.has(task.id));

      // Update cache
      formattedTasks.forEach(task => {
        tasksCacheRef.current.set(task.id, task);
      });
      lastFullRefreshRef.current = Date.now();

      // Save the original task state (the state returned from the backend, for recovery)
      formattedTasks.forEach(task => {
        if (task.status !== 'warning') {
          originalTaskStatusRef.current.set(task.id, task.status as 'running' | 'paused' | 'completed');
        }
      });

      setTasks(formattedTasks);
      

      // Check whether each task has a non-200 status code, if so, set it to warning, otherwise restore the original state
      const checkTasksForWarning = async () => {
        const updatedTasks = await Promise.all(
          formattedTasks.map(async (task) => {
            return await checkTaskWarningStatus(task);
          })
        );
        
        // Update task status (use functional update to ensure it is based on the latest status)
        setTasks(prevTasks => {
          const taskMap = new Map(prevTasks.map(t => [t.id, t]));
          updatedTasks.forEach(updatedTask => {
            // Update all status change tasks (including warning and recovery)
            taskMap.set(updatedTask.id, updatedTask);
          });
          return Array.from(taskMap.values());
        });
        
        // Update cache
        updatedTasks.forEach(task => {
          tasksCacheRef.current.set(task.id, task);
        });
      };
      
      // Check task status asynchronously without blocking the main process
      checkTasksForWarning();
      
      setHasLoadedTasksOnce(true);
      
      // If this is the first load and there are tasks, enable animation immediately
      if (isInitialLoad && formattedTasks.length > 0) {
        setShouldAnimate(true);
        // Also enable Refresh button animation on first load
        setRefreshButtonAnimate(true);
        setTimeout(() => {
          setRefreshButtonAnimate(false);
        }, 600);
      }
      
      // Do not clear local state cache to avoid re-rendering jitter
      // Let the status returned by the backend overwrite the local status
    } catch (error) {
      // Error handled silently
      // Try loading from localStorage as fallback on failure (consistent with existing logic)
      try {
        // @ts-ignore local method has been defined in the file
        const savedTasks = typeof loadTasksFromStorage === 'function' ? loadTasksFromStorage() : [];
        if (Array.isArray(savedTasks) && savedTasks.length > 0) {
          setTasks(savedTasks);
          setHasLoadedTasksOnce(true);
        } else {
          setTasks([]);
        }
      } catch (e) {
        setTasks([]);
      }
    } finally {
      if (tasksLoadingTokenRef.current === token) {
        setTasksLoading(false);
      }
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    }
  }, [isInitialLoad, checkTaskWarningStatus]);

  // Load all task data for chart display (not affected by filters)
  const refreshAllTasksForChart = React.useCallback(async () => {
    try {
      const { tasks: allTasks } = await fetchTasks({
        page: 1,
        pageSize: 1000, // Get enough tasks for statistics
      });
      
      // Format task data
      const formattedTasks = allTasks.map((task: any): Task => ({
        id: task.id,
        type: task.type,
        status: task.status,
        progress: (task.progress !== undefined && task.progress !== null) ? task.progress : 0,
        startTime: task.execution_date || task.start_time || task.create_time,
        endTime: task.end_time,
        duration: task.duration,
        description: task.description || '',
        priority: task.priority || 'medium',
        accountId: task.account_id,
        taskId: task.task_id,
        apps: (task.apps || []).map((app: any) => ({
          app_id: app.app_id,
          app_name: app.app_name,
          icon_url: app.icon_url || '',
          os: app.os as 'IOS' | 'Android',
          country: app.country,
          category: app.category,
          developer: app.developer,
          rating: app.rating,
          progress: (app.progress !== undefined && app.progress !== null && typeof app.progress === 'number' && app.progress >= 0 && app.progress <= 100) 
            ? app.progress 
            : 0
        })),
        createTime: task.create_time,
        latestUpdateTime: task.latest_update_time,
        dataPointer: task.data_pointer || 'Daily Execution',
        appType: task.app_type,
        executionTime: task.execution_time || undefined,
        executionDate: task.execution_date || undefined
      })).filter((task) => !deletedTaskIdsRef.current.has(task.id));
      
      setAllTasksForChart(formattedTasks);
    } catch (error) {
      // Error handled silently
      setAllTasksForChart([]);
    }
  }, []);

  useEffect(() => {
    refreshAllTasksForChart();
    // Refresh chart data every 30 seconds
    const interval = setInterval(refreshAllTasksForChart, 30000);
    return () => clearInterval(interval);
  }, [refreshAllTasksForChart]); // Mounting and 30s polling; Team switching relies on global refresh and is filtered by the backend according to X-Selected-Team-Id


  // Update filter ref
  useEffect(() => {
    filtersRef.current = {
      statusFilter,
      typeFilter,
      accountFilter,
      searchText
    };
  }, [statusFilter, typeFilter, accountFilter, searchText]);

  // Monitor filter status changes and reload tasks (requested only when the user actually modifies the filter conditions to avoid repeated requests caused by changes such as hasLoadedTasksOnce)
  useEffect(() => {
    if (isInitialLoad || !hasLoadedTasksOnce) {
      return;
    }

    const currentFilters = { statusFilter, accountFilter, typeFilter, searchText };
    const last = lastFiltersRef.current;
    if (last && last.statusFilter === currentFilters.statusFilter && last.accountFilter === currentFilters.accountFilter && last.typeFilter === currentFilters.typeFilter && last.searchText === currentFilters.searchText) {
      return; // The filter conditions have not changed (for example, only hasLoadedTasksOnce changed from false to true), and the request is not repeated
    }
    lastFiltersRef.current = currentFilters;

    isFilterChangingRef.current = true;
    
    requestAnimationFrame(() => {
      setIsFilterChanging(true);
      
      setTasksLoading(true);
      setTasks([]);
      setCurrentPage(1);

      loadTasks({
        page: 1,
        pageSize: 1000,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        accountId: accountFilter !== 'all' ? accountFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        search: searchText || undefined
      }).finally(() => {
        // After loading is completed, wait for setTasksLoading(false) inside loadTasks to complete.
        // Then clear the filter change flag to ensure that the status updates are in the correct order.
        // This can avoid "No Task" flashing when switching statuses
        setTimeout(() => {
          // Delay again to ensure that setTasksLoading(false) in finally of loadTasks has been executed
          // And React has finished updating the state and re-rendering
          setTimeout(() => {
            setIsFilterChanging(false);
            isFilterChangingRef.current = false;
          }, 150);
        }, 0);
      });
    });
  }, [accountFilter, statusFilter, typeFilter, searchText, loadTasks, isInitialLoad, hasLoadedTasksOnce]);

  // When dataTag changes, directly use fixed values to update the slider position and width (DATA_TAG_CONFIG is a constant in the component and is not included in dependencies)
  useEffect(() => {
    const config = DATA_TAG_CONFIG[dataTag];
    setSliderPosition(config.position);
    setSliderWidth(config.width);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataTag]);
  
  // Calculate the list of tasks that need to be polled (use useMemo optimization to avoid unnecessary recalculation)
  const tasksNeedPolling = useMemo(() => {
    // Polling only:
    // 1) running tasks
    // 2) Warning and errors can be retried (timeout class) tasks
    return tasks.filter((t: Task) => {
      const shouldPollByStatus =
        t.status === 'running' ||
        (t.status === 'warning' && warningRetryableRef.current.get(t.id) === true);
      if (!shouldPollByStatus) {
        return false;
      }

      const taskCompleted = (t.progress || 0) >= 100;
      const allAppsCompleted = !!(t.apps && t.apps.length > 0 && t.apps.every((app: AppInfo) => (app.progress || 0) >= 100));
      return !(taskCompleted && allAppsCompleted);
    });
  }, [tasks]);
  
  // Poll the progress of running tasks (silent updates to avoid flashing)
  useEffect(() => {
    // Pause polling during first render to avoid re-rendering during animation
    if (isFirstRenderRef.current || isAnimating) {
      return;
    }
    
    // If the task is being loaded (the filter conditions have just changed), pause polling and wait for the loading to complete.
    if (tasksLoading) {
      return;
    }
    
    // If filter conditions are changing, pause polling to avoid interference
    if (isFilterChangingRef.current) {
      return;
    }
    
    // Even if there are no locally running tasks, polling is performed to detect newly created tasks.
    // This ensures that newly created tasks start progress updates immediately
    const shouldPoll = tasksNeedPolling.length > 0 || pollingTrigger > 0;
    
    if (!shouldPoll) {
      return; // There is neither a task to poll nor a signal to trigger polling
    }
    
    // Auxiliary function for formatting task data (consistent with the logic in loadTasks)
    const formatTask = (task: any): Task => ({
              id: task.id,
              type: task.type,
              status: task.status,
              progress: (task.progress !== undefined && task.progress !== null) ? task.progress : 0,
              startTime: task.execution_date || task.start_time || task.create_time,
              endTime: task.end_time,
              duration: task.duration,
              description: task.description || '',
              priority: task.priority || 'medium',
              accountId: task.account_id,
              taskId: task.task_id,
              apps: (task.apps || []).map((app: any) => ({
                app_id: app.app_id,
                app_name: app.app_name,
                icon_url: app.icon_url || '',
                os: app.os as 'IOS' | 'Android',
                country: app.country,
                category: app.category,
                developer: app.developer,
                rating: app.rating,
                // Make sure progress is a valid number and newly created tasks should start from 0
                progress: (app.progress !== undefined && app.progress !== null && typeof app.progress === 'number' && app.progress >= 0 && app.progress <= 100) 
                  ? app.progress 
                  : 0
              })),
              createTime: task.create_time,
              latestUpdateTime: task.latest_update_time,
              dataPointer: task.data_pointer || 'Daily Execution',
              appType: task.app_type,
              executionTime: task.execution_time || undefined,
              executionDate: task.execution_date || undefined
            });
    
    // Functions that handle polling results (avoid code duplication, use cache optimization)
    const processPollingResult = (result: ApiResponse<any[]>) => {
      // If filter conditions are changing, ignore polling results to avoid interference
      if (isFilterChangingRef.current) {
        return;
      }
      
      if (result.success && result.data) {
        // Auxiliary function: Check whether the task meets the current filter conditions
        // Use the latest filter in ref instead of the old value in the closure
        const matchesFilters = (task: Task): boolean => {
          const currentFilters = filtersRef.current;
          
          // Status filter (polling: Warning ↔ running compatible)
          if (!taskMatchesPollingStatusFilter(task, currentFilters.statusFilter)) {
            return false;
          }
          
          // DataType (type) filter
          if (currentFilters.typeFilter !== 'all' && task.type !== currentFilters.typeFilter) {
            return false;
          }
          
          // Account filter
          if (currentFilters.accountFilter !== 'all' && task.accountId !== currentFilters.accountFilter) {
            return false;
          }
          
          // Search text filter
          if (currentFilters.searchText && currentFilters.searchText.trim()) {
            const searchLower = currentFilters.searchText.toLowerCase().trim();
            const matchesSearch = 
              task.taskId?.toLowerCase().includes(searchLower) ||
              task.description?.toLowerCase().includes(searchLower) ||
              task.apps?.some(app => 
                app.app_name?.toLowerCase().includes(searchLower) ||
                app.app_id?.toLowerCase().includes(searchLower)
              );
            if (!matchesSearch) {
              return false;
            }
          }
          
          return true;
        };
        
        // Silently update task progress and status to avoid re-rendering the entire list
        setTasks(prevTasks => {
              const newTasksMap = new Map(
                result.data!
                  .map((t: any) => formatTask(t))
                  .filter((task: Task) => !deletedTaskIdsRef.current.has(task.id))
                  .map((task: Task) => [task.id, task])
              );
              let hasChanges = false;
              
              // Update existing tasks (use the cache first and only update the changed parts)
              const updatedTasks = prevTasks
                .map(task => {
                  const newTask = newTasksMap.get(task.id);
                  if (newTask) {
                    // Check if the task still meets the filter criteria
                    const stillMatches = matchesFilters(newTask);
                    
                    // If the task no longer meets the filter criteria, remove it
                    if (!stillMatches) {
                      hasChanges = true;
                      return null; // Mark for removal
                    }
                    
                    // Check if anything has changed (progress, status, app progress)
                    const progressChanged = newTask.progress !== task.progress;
                    const statusChanged = newTask.status !== task.status;
                    
                    // Check if the app progress has changed
                    let appsChanged = false;
                    const updatedApps = task.apps.map(app => {
                      const newApp = newTask.apps?.find((a: any) => a.app_id === app.app_id);
                      if (newApp) {
                        const rawProgress = newApp.progress;
                        const newProgress = (rawProgress !== undefined && rawProgress !== null && typeof rawProgress === 'number' && rawProgress >= 0 && rawProgress <= 100)
                          ? rawProgress
                          : 0;
                        if (newProgress !== app.progress) {
                          appsChanged = true;
                          return { ...app, progress: newProgress };
                        }
                      }
                      return app;
                    });
                    
                    if (progressChanged || statusChanged || appsChanged) {
                      hasChanges = true;
                      
                      // Only display 100% when the backend clearly gives proof of completion to avoid mistakenly displaying 100% when Create&Active is just created.
                      const hasCompletionEvidence =
                        (newTask.progress || 0) >= 100 ||
                        ((newTask.apps || []).length > 0 && (newTask.apps || []).every((app: any) => (app.progress || 0) >= 100));
                      const finalProgress = (newTask.status === 'completed' && hasCompletionEvidence)
                        ? 100
                        : (newTask.progress || 0);
                      
                      if (statusChanged) {
                        // If the state changes and it is not a warning, save the original state
                        if (newTask.status !== 'warning') {
                          originalTaskStatusRef.current.set(task.id, newTask.status as 'running' | 'paused' | 'completed');
                        }
                      }
                      
                      // Update cache
                      // Fixed display of non-timeout type Warning to avoid polling and writing back running, causing Warning↔Running jitter.
                      const keepWarning =
                        task.status === 'warning' &&
                        warningRetryableRef.current.get(task.id) !== true;
                      const mergedStatus = keepWarning ? 'warning' : newTask.status;

                      const updatedTask = {
                        ...task,
                        progress: finalProgress,
                        status: mergedStatus,
                        apps: updatedApps
                      };
                      tasksCacheRef.current.set(task.id, updatedTask);
                      
                      return updatedTask;
                    }
                  }
                  // Check if existing tasks still meet filter criteria
                  if (!matchesFilters(task)) {
                    hasChanges = true;
                    return null; // Mark for removal
                  }
                  return task;
                })
                .filter((task): task is Task => task !== null); // Remove tasks that do not meet the filter criteria
              
              // Add a new task (if the backend returns a new task but does not exist locally and meets the filter conditions)
              const existingTaskIds = new Set(prevTasks.map(t => t.id));
              const newTasks: Task[] = [];
              newTasksMap.forEach((newTask, taskId) => {
                if (!existingTaskIds.has(taskId)) {
                  // Check if new tasks meet filter criteria
                  if (matchesFilters(newTask)) {
                    // New task, added to list
                    // 100% will only be displayed when the backend clearly provides evidence of completion to avoid instantaneous misjudgment of new tasks as 100%.
                    const hasCompletionEvidence =
                      (newTask.progress || 0) >= 100 ||
                      ((newTask.apps || []).length > 0 && (newTask.apps || []).every((app: any) => (app.progress || 0) >= 100));
                    const finalProgress = (newTask.status === 'completed' && hasCompletionEvidence)
                      ? 100
                      : (newTask.progress || 0);
                    // Make sure that the progress of each app in the new task is a valid number between 0-100
                    const appsWithValidProgress = (newTask.apps || []).map((app: any) => ({
                      ...app,
                      progress: (app.progress !== undefined && app.progress !== null && typeof app.progress === 'number' && app.progress >= 0 && app.progress <= 100)
                        ? app.progress
                        : 0
                    }));
                    const taskToAdd = {
                      ...newTask,
                      progress: finalProgress,
                      apps: appsWithValidProgress
                    };
                    newTasks.push(taskToAdd);
                    // Update cache
                    tasksCacheRef.current.set(taskId, taskToAdd);
                    hasChanges = true;
                  }
                }
              });
              
              // Only return the new array when there are actual changes, otherwise return the original array to avoid re-rendering
              const finalTasks = hasChanges ? [...updatedTasks, ...newTasks] : prevTasks;
              
              // Update cachedTasksRef synchronously to ensure that the UI immediately reflects progress changes
              if (hasChanges) {
                cachedTasksRef.current = finalTasks.map((t) => ({
                  ...t,
                  status: t.status as 'running' | 'paused' | 'completed' | 'warning'
                }));
              }
              
              // After polling for updates, check the warning status asynchronously (without blocking the main process)
              // Specially check the tasks whose progress reaches 100% to ensure that the warning status can be restored in time
              if (hasChanges && finalTasks.length > 0) {
                // Delay checking to avoid frequent requests
                setTimeout(async () => {
                  // Check all tasks, especially those with 100% progress
                  const tasksToCheck = finalTasks.filter(t => {
                    if (t.status === 'warning') {
                      return warningRetryableRef.current.get(t.id) === true;
                    }
                    if (t.progress >= 100) {
                      return true;
                    }
                    return t.status === 'running' && originalTaskStatusRef.current.has(t.id);
                  });
                  
                  if (tasksToCheck.length > 0) {
                    const updatedWarningTasks = await Promise.all(
                      tasksToCheck.map(async (task: Task) => {
                        return await checkTaskWarningStatus(task);
                      })
                    );
                    
                    // Update task status
                    setTasks(prevTasks => {
                      const taskMap = new Map(prevTasks.map(t => [t.id, t]));
                      updatedWarningTasks.forEach((updatedTask: Task) => {
                        if (updatedTask.status !== taskMap.get(updatedTask.id)?.status) {
                          taskMap.set(updatedTask.id, updatedTask);
                        }
                      });
                      return Array.from(taskMap.values());
                    });
                    
                    // Update cache
                    updatedWarningTasks.forEach(task => {
                      tasksCacheRef.current.set(task.id, task);
                    });
                  }
                }, 500); // Delay checking by 500ms to avoid conflict with polling
              }
              
              return finalTasks;
            });
      }
    };
    
    // Construct the query parameters of the polling request, including the current filter conditions
    // Use the latest filter in ref to ensure the latest value is used when polling
    const buildPollingQueryParams = () => {
      const currentFilters = filtersRef.current;
      const params = new URLSearchParams();
      params.append('page', '1');
      // Align with loadTasks: If it is too small, the batch tasks will not be on the first page, polling will not be able to merge progress, and the ring bar will get stuck after Warning→Running.
      const pollSize = Math.min(2000, Math.max(120, tasksLengthRef.current || 120));
      params.append('pageSize', String(pollSize));
      // Fix: The current filtering conditions must also be carried when polling to avoid overwriting the search results.
      if (currentFilters.statusFilter && currentFilters.statusFilter !== 'all') {
        const pollStatus = currentFilters.statusFilter === 'warning' ? 'running' : currentFilters.statusFilter;
        params.append('status', pollStatus);
      }
      if (currentFilters.accountFilter && currentFilters.accountFilter !== 'all') {
        params.append('accountId', currentFilters.accountFilter);
      }
      if (currentFilters.typeFilter && currentFilters.typeFilter !== 'all') {
        params.append('type', currentFilters.typeFilter);
      }
      if (currentFilters.searchText && currentFilters.searchText.trim()) {
        params.append('search', currentFilters.searchText.trim());
      }
      return params.toString();
    };
    
    // Intelligent real-time progress updates: dynamically adjust polling frequency based on task status
    // Note: In some scenarios, the progress/stream of the front end may be out of sync. The complete task interface is temporarily unified to ensure stability.
    const hasRunningTasks = tasksNeedPolling.length > 0;
    const basePollInterval = hasRunningTasks ? 800 : 1000; // 0.8 seconds when running the task, 1 second otherwise
    const useProgressStream = false;
    
    // Use recursive asynchronous functions to implement smart polling instead of fixed intervals
    // This ensures that each request is completed before the next request is initiated to avoid a pile-up of requests.
    // At the same time, the interval is dynamically adjusted according to the request time to achieve a true streaming update effect.
    let isPolling = true;
    let pollTimeout: NodeJS.Timeout | null = null;
    let lastProgressUpdate = new Map<string, number>(); // Track the last progress of each app to detect progress changes
    let isPollingInProgress = false; // Track whether there are ongoing polling requests to avoid concurrent requests
    
    const performPoll = async () => {
      if (!isPolling) return;
      
      // If there is already an ongoing polling request, skip this request to avoid concurrency.
      if (isPollingInProgress) {
        return;
      }
      
      // Stop polling if filter criteria are changing
      if (isFilterChangingRef.current) {
        return;
      }
      
      // Flag polling in progress
      isPollingInProgress = true;
      
      try {
        // Prioritize the use of lightweight progress interfaces (only obtain progress data and reduce data transmission)
        // If there is a running task, use the lightweight interface; otherwise, use the complete interface (used to detect new tasks)
        let response;
        let result: ApiResponse<any[]>;
        
        if (useProgressStream && hasRunningTasks && tasksNeedPolling.length > 0) {
          // Use the long polling progress stream interface to obtain progress updates in real time
          const taskIds = tasksNeedPolling.map(t => t.id);
          
          // Build last progress status string (used to detect changes)
          const lastProgressStr = Array.from(lastProgressUpdate.entries())
            .map(([key, progress]) => {
              const [taskId, appId] = key.split(':');
              return `${taskId}:${appId}:${progress}`;
            })
            .join(',');
          
          const taskIdParams = taskIds.map(id => `taskId=${encodeURIComponent(id)}`).join('&');
          const url = `/api/autopipe/progress/stream?${taskIdParams}${lastProgressStr ? `&lastProgress=${encodeURIComponent(lastProgressStr)}` : ''}`;
          
          try {
            // Using the long polling interface, the backend will return immediately when there is a progress change, otherwise it will wait up to 5 seconds.
            response = await autopipeAxiosInstance.get(url, {
              timeout: 6000 // Set a 6 second timeout, slightly longer than the backend’s 5 second wait time
            });
            result = response.data as ApiResponse<any[]>;
            
            // The data format returned by the lightweight interface is different and needs to be converted into the complete task format.
            if (result.success && result.data) {
              // If filter conditions are changing, ignore lightweight update results to avoid interference
              if (isFilterChangingRef.current) {
                return;
              }
              
              // Auxiliary function: Check whether the task meets the current filter conditions
              // Use the latest filter in ref instead of the old value in the closure
              const matchesFilters = (task: Task): boolean => {
                const currentFilters = filtersRef.current;
                
                if (!taskMatchesPollingStatusFilter(task, currentFilters.statusFilter)) {
                  return false;
                }
                
                // DataType (type) filter
                if (currentFilters.typeFilter !== 'all' && task.type !== currentFilters.typeFilter) {
                  return false;
                }
                
                // Account filter
                if (currentFilters.accountFilter !== 'all' && task.accountId !== currentFilters.accountFilter) {
                  return false;
                }
                
                // Search text filter
                if (currentFilters.searchText && currentFilters.searchText.trim()) {
                  const searchLower = currentFilters.searchText.toLowerCase().trim();
                  const matchesSearch = 
                    task.taskId?.toLowerCase().includes(searchLower) ||
                    task.description?.toLowerCase().includes(searchLower) ||
                    task.apps?.some(app => 
                      app.app_name?.toLowerCase().includes(searchLower) ||
                      app.app_id?.toLowerCase().includes(searchLower)
                    );
                  if (!matchesSearch) {
                    return false;
                  }
                }
                
                return true;
              };
              
              // Directly update the progress of local tasks instead of re-fetching the full task list
              setTasks(prevTasks => {
                // If prevTasks is empty (the filter conditions have just changed), skip the lightweight update and wait for the complete interface to return
                if (prevTasks.length === 0) {
                  return prevTasks;
                }
                
                // Check again whether the filters are changing (double insurance)
                if (isFilterChangingRef.current) {
                  return prevTasks;
                }
                
                const progressMap = new Map((result.data as any[]).map((p: any) => [p.id, p]));
                let hasChanges = false;
                
                const updatedTasks: Task[] = prevTasks
                  .map(task => {
                    const progress = progressMap.get(task.id);
                    if (progress) {
                      // Check if the task still meets the filter criteria
                      const updatedTaskForCheck = {
                        ...task,
                        status: (progress.status === 'running' || progress.status === 'paused' || progress.status === 'completed' || progress.status === 'warning')
                          ? progress.status
                          : task.status
                      };
                      
                      // If the task no longer meets the filter criteria, remove it
                      if (!matchesFilters(updatedTaskForCheck)) {
                        hasChanges = true;
                        return null; // Mark for removal
                      }
                      
                      // Check if progress has changed
                      const newProgress = (progress.progress !== undefined && progress.progress !== null && typeof progress.progress === 'number' && progress.progress >= 0 && progress.progress <= 100)
                        ? progress.progress
                        : task.progress;
                      const newStatus = (progress.status === 'running' || progress.status === 'paused' || progress.status === 'completed' || progress.status === 'warning')
                        ? progress.status
                        : task.status;
                      const progressChanged = newProgress !== task.progress || newStatus !== task.status;
                      
                      // Check whether the app progress has changed (even if the task progress has not changed, the app progress may have changed)
                      const appProgressMap = new Map<string, number>((progress.apps || []).map((a: any) => {
                        const progressValue = (a.progress !== undefined && a.progress !== null && typeof a.progress === 'number' && a.progress >= 0 && a.progress <= 100)
                          ? a.progress
                          : 0;
                        return [a.app_id, progressValue] as [string, number];
                      }));
                      
                      let appsChanged = false;
                      const updatedApps: AppInfo[] = task.apps.map(app => {
                        const newAppProgress = appProgressMap.get(app.app_id);
                        if (newAppProgress !== undefined && newAppProgress !== app.progress) {
                          appsChanged = true;
                          return { ...app, progress: newAppProgress };
                        }
                        return app;
                      });
                      
                      // If the task progress or status changes, or the app progress changes, it needs to be updated.
                      if (progressChanged || appsChanged) {
                        hasChanges = true;
                        
                        const updatedTask = {
                          ...task,
                          progress: newProgress,
                          status: newStatus,
                          apps: updatedApps
                        };
                        
                        // Update cache
                        tasksCacheRef.current.set(task.id, updatedTask);
                        
                        return updatedTask;
                      }
                    }
                    // Check if existing tasks still meet filter criteria
                    if (!matchesFilters(task)) {
                      hasChanges = true;
                      return null; // Mark for removal
                    }
                    return task;
                  })
                  .filter((task): task is Task => task !== null); // Remove tasks that do not meet the filter criteria
                
                if (hasChanges) {
                  // Synchronously update cachedTasksRef
                  cachedTasksRef.current = updatedTasks.map((t) => ({
                    ...t,
                    status: t.status as 'running' | 'paused' | 'completed' | 'warning'
                  }));
                }
                
                return hasChanges ? updatedTasks : prevTasks;
              });
              
              // In order to be compatible with subsequent progress change detection logic, construct a result object
              result = {
                success: true,
                data: (result.data as any[]).map((p: any) => ({
                  id: p.id,
                  task_id: p.task_id,
                  status: p.status,
                  progress: p.progress,
                  apps: (p.apps || []).map((a: any) => ({
                    app_id: a.app_id,
                    progress: a.progress
                  }))
                }))
              } as any;
            }
          } catch (progressError) {
            // If the lightweight interface fails, fall back to the full interface
            const queryParams = buildPollingQueryParams();
            response = await autopipeAxiosInstance.get(`/api/autopipe/tasks?${queryParams}`);
            result = response.data as ApiResponse<any[]>;
            processPollingResult(result);
          }
        } else {
          // If there are no running tasks or new tasks need to be detected, use the complete interface.
          const queryParams = buildPollingQueryParams();
          response = await autopipeAxiosInstance.get(`/api/autopipe/tasks?${queryParams}`);
          result = response.data as ApiResponse<any[]>;
          processPollingResult(result);
        }
        
        // Update last progress status (for next long poll)
        if (result.success && result.data) {
          result.data.forEach((task: any) => {
            if (task.apps) {
              task.apps.forEach((app: any) => {
                const key = `${task.id}:${app.app_id}`;
                const currentProgress = app.progress || 0;
                lastProgressUpdate.set(key, currentProgress);
              });
            }
          });
        }
        
        // Long polling: If there is a change, the next request will be initiated immediately; if there is no change (timeout return), the next request will be initiated immediately
        // This allows for true real-time progress synchronization
        // Mark polling completed
        isPollingInProgress = false;
        
        if (hasRunningTasks) {
          // Initiate the next long polling request immediately without waiting
          requestAnimationFrame(() => {
            if (isPolling) {
              performPoll();
            }
          });
        } else {
          // Non-running tasks, use normal polling, 1 second interval
          if (isPolling) {
            pollTimeout = setTimeout(performPoll, basePollInterval);
          }
        }
      } catch (error) {
        // Mark polling completed (even with errors)
        isPollingInProgress = false;
        
        // When an error occurs, use a longer interval to retry to avoid frequent failed requests.
        if (isPolling) {
          pollTimeout = setTimeout(performPoll, hasRunningTasks ? 500 : 2000);
        }
      }
    };
    
    // If it is because pollingTrigger is triggered but there is no running task, perform an immediate check.
    // This is especially important for tasks that complete quickly, ensuring that even if the task completes before the loadTasks complete, it can still be detected.
    // Fix: Only execute when there are no polling requests in progress, to avoid concurrent requests
    if (tasksNeedPolling.length === 0 && pollingTrigger > 0 && !isPollingInProgress) {
      // Perform a polling check immediately without waiting for the polling interval
      (async () => {
        try {
          isPollingInProgress = true;
          const queryParams = buildPollingQueryParams();
          const response = await autopipeAxiosInstance.get(`/api/autopipe/tasks?${queryParams}`);
          const result = response.data as ApiResponse<any[]>;
          processPollingResult(result);
        } catch (error) {
          // Error handled silently
        } finally {
          isPollingInProgress = false;
        }
      })();
    }
    
    // Start the first poll immediately
    performPoll();
    
    // Cleanup function
    return () => {
      isPolling = false;
      isPollingInProgress = false; // Reset polling status
      if (pollTimeout) {
        clearTimeout(pollTimeout);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasksNeedPolling.length, pollingTrigger, statusFilter, accountFilter, typeFilter, searchText]); // Optimize dependencies: only rely on tasksNeedPolling.length instead of the entire tasks array to reduce unnecessary re-executions
  
  // Drop-down menu status management
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [closingDropdowns, setClosingDropdowns] = useState<Set<string>>(new Set());
  const dropdownCloseTimersRef = useRef<Map<string, number>>(new Map());
  
  // Edit task modal box drop-down menu status management
  const [editActiveDropdown, setEditActiveDropdown] = useState<string | null>(null);
  
  // Copy function status
  const [copyingTaskId, setCopyingTaskId] = useState<string | null>(null);
  
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  
  // Task card expansion status management
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  
  // Pop-up card status management
  const [popupTaskId, setPopupTaskId] = useState<string | null>(null);
  
  // Log pop-up status management
  const [logDetailsTaskId, setLogDetailsTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  
  // Duration&Mode bubble status management
  const [durationBubbleTaskId, setDurationBubbleTaskId] = useState<string | null>(null);
  
  // Task creation process status management
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  
  // Time picker state - used in New Task form
  // Note: newTaskForm.selectedTime is actually used to store data
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  
  // Task editing status management
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({
    appType: '',
    type: '' as 'install_pb' | 'event_pb' | 'install_rtpb' | 'event_rtpb' | '',
    accountId: '',
    dataPointer: 'Daily Execution',
    apps: [] as AppInfo[],
    selectedApps: [] as AppInfo[],
    iosApp: null as AppInfo | null,
    androidApp: null as AppInfo | null,
    selectedTime: {
      hours: new Date().getHours(),
      minutes: new Date().getMinutes(),
      seconds: new Date().getSeconds()
    },
    selectedDate: (() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    })()
  });
  
  // Task creation form status
  const [newTaskForm, setNewTaskForm] = useState({
    appType: 'both' as 'ios' | 'android' | 'both',
    type: '' as 'install_pb' | 'event_pb' | 'install_rtpb' | 'event_rtpb' | '',
    accountId: '',
    dataPointer: 'Daily Execution',
    iosApp: null as AppInfo | null,
    androidApp: null as AppInfo | null,
    selectedTime: {
      hours: 0,
      minutes: 0,
      seconds: 0
    },
    selectedDate: (() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    })()
  });

  // Button Loading state - only Create&Active remains
  const [isCreatingActiveLoading, setIsCreatingActiveLoading] = useState(false);

  // Pagination status
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8); // The number of task cards displayed on each page, dynamically calculated
  const tasksGridRef = useRef<HTMLDivElement>(null); // Used to monitor task grid container width changes

  // Delete confirmation bubble status
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  // Notifications are unified through the global ToastContainer to avoid dual-channel conflicts between custom toasts in the page and global toasts.

  // App select pop-up window status
  const [appSelectorVisible, setAppSelectorVisible] = useState(false);
  const [appSelectorPlatform, setAppSelectorPlatform] = useState<'IOS' | 'Android'>('IOS');
  const [appSelectorApps, setAppSelectorApps] = useState<AppInfo[]>([]);
  const [appSelectorLoading, setAppSelectorLoading] = useState(false);
  const [appSelectorInput, setAppSelectorInput] = useState(''); // local value for input box
  const [appSelectorSelectedApp, setAppSelectorSelectedApp] = useState<AppInfo | null>(null);
  const [appSelectorMode, setAppSelectorMode] = useState<'new' | 'edit'>('new');

  // Handle App selection pop-up window
  const handleAppSelectorOpen = async (platform: 'IOS' | 'Android') => {
    setAppSelectorPlatform(platform);
    setAppSelectorLoading(true); // *** Set the loading status to true first ***
    setAppSelectorApps([]); // Clear the previous apps list
    setAppSelectorInput(''); // Clear the input box content
    setAppSelectorSelectedApp(null); // Clear selected apps
    setAppSelectorMode('new'); // Setup mode
    setAppSelectorVisible(true); // ***Redisplay pop-up window***
    
    try {
      const apps = await fetchAppsByPlatform(platform);
      setAppSelectorApps(apps);
    } catch (error) {
      console.error('Failed to load apps:', error);
      setAppSelectorApps([]);
    } finally {
      setAppSelectorLoading(false);
    }
  };

  // Handling App Search - Adding Anti-Shake
  const debouncedFetchApps = useMemo(
    () => debounce(async (searchTerm: string) => {
      // Remove loading state to avoid content area and button flashing
      // When searching, only the list content is updated and the overall layout is not changed.
      try {
        const apps = await fetchAppsByPlatform(appSelectorPlatform, searchTerm);
        // Deduplicate the obtained apps and keep only the first 10
        const uniqueApps = Array.from(new Map(apps.map(app => [app.app_id, app])).values());
        setAppSelectorApps(uniqueApps.slice(0, 10)); // Forced restriction to display only the first 10
      } catch (error) {
        // Error handled silently
        setAppSelectorApps([]);
      }
    }, 300),
    [appSelectorPlatform]
  );

  // Handle input box changes
  const handleAppInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value;
    setAppSelectorInput(searchTerm); // Immediately update the displayed value of the input box
    debouncedFetchApps(searchTerm); // Trigger anti-shake search
  };

  // Handling App Selection
  const handleAppSelect = (app: AppInfo) => {
    setAppSelectorSelectedApp(app);
  };

  // Confirm App selection
  const handleConfirmAppSelection = () => {
    if (appSelectorSelectedApp) {
      if (appSelectorPlatform === 'IOS') {
        setNewTaskForm(prev => ({ ...prev, iosApp: appSelectorSelectedApp }));
      } else {
        setNewTaskForm(prev => ({ ...prev, androidApp: appSelectorSelectedApp }));
      }
    }
    setAppSelectorVisible(false);
  };

  // Handle the App selection pop-up window in the editing task modal box
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleEditAppSelectorOpen = async (platform: 'IOS' | 'Android') => {
    setAppSelectorPlatform(platform);
    setAppSelectorLoading(true); // *** Set the loading status to true first ***
    setAppSelectorApps([]); // Clear the previous apps list
    setAppSelectorInput(''); // Clear the input box content
    setAppSelectorSelectedApp(null); // Clear selected apps
    setAppSelectorMode('edit'); // Setup mode
    setAppSelectorVisible(true); // ***Redisplay pop-up window***
    
    try {
      const apps = await fetchAppsByPlatform(platform);
      setAppSelectorApps(apps);
    } catch (error) {
      console.error('Failed to load apps:', error);
      setAppSelectorApps([]);
    } finally {
      setAppSelectorLoading(false);
    }
  };

  // Confirm the App selection in the edit task modal box
  const handleConfirmEditAppSelection = () => {
    if (appSelectorSelectedApp) {
      if (appSelectorPlatform === 'IOS') {
        setEditTaskForm(prev => ({ ...prev, iosApp: appSelectorSelectedApp }));
      } else {
        setEditTaskForm(prev => ({ ...prev, androidApp: appSelectorSelectedApp }));
      }
      setAppSelectorVisible(false);
      setAppSelectorSelectedApp(null);
    }
  };
  
  // Task status management - loading initial status from localStorage
  // Completely remove local state management and no longer use taskStatuses
  // All status and progress directly use the data returned by the backend
  
  // Task data persistence management
  const saveTasksToStorage = (tasksToSave: Task[]) => {
    try {
      localStorage.setItem('autopipe-tasks', JSON.stringify(tasksToSave));
    } catch (error) {
      // Error handled silently
    }
  };

  const loadTasksFromStorage = (): Task[] => {
    try {
      const saved = localStorage.getItem('autopipe-tasks');
      if (saved) {
        const parsedTasks = JSON.parse(saved);
        return parsedTasks;
      }
    } catch (error) {
      // Error handled silently
    }
    return [];
  };
  
  // Helper function to generate current time string
  const getCurrentTimeString = () => {
    return new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/, '$3-$1-$2 $4:$5:$6');
  };

  // Unified function for formatting time display
  const formatTimeDisplay = (timeString: string): string => {
    if (!timeString) return 'N/A';
    
    try {
      // If it is already in the front-end format (YYYY-MM-DD HH:MM:SS), return directly
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timeString)) {
        return timeString;
      }
      
      // If it is another format, convert it to front-end format
      const date = new Date(timeString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/, '$3-$1-$2 $4:$5:$6');
    } catch (error) {
      // Error handled silently
      return 'Invalid Date';
    }
  };

  // Generic function for update task latestUpdateTime
  const updateTaskLatestTime = (taskId: string) => {
    const currentTime = getCurrentTimeString();
    setTasks(prevTasks => {
      const updatedTasks = prevTasks.map(task => 
        task.id === taskId 
          ? { ...task, latestUpdateTime: currentTime }
          : task
      );
      // Save to localStorage
      saveTasksToStorage(updatedTasks);
      return updatedTasks;
    });
  };
  
  // Completely remove local task status management
  // All status and progress directly use the data returned by the backend, without any local state intervention.
  
  // Keep the updateLocalTaskStatus function signature (to avoid errors at the call site), but do nothing
  // All status updates are done via backend API and polling
  const updateLocalTaskStatus = (taskId: string, newStatus: 'running' | 'paused' | 'completed' | 'warning') => {
    // Completely removes local state intervention and does nothing more
    // Status updates completely rely on backend API and polling mechanism
    updateTaskLatestTime(taskId);
  };

  // Stabilize task card rendering function to avoid unnecessary re-rendering
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _renderTaskCard = React.useCallback((task: Task, index: number) => {
    return (
      <div key={task.id} className="task-card"
         style={{
           userSelect: 'none',
           WebkitUserSelect: 'none',
           MozUserSelect: 'none',
           msUserSelect: 'none'
         }}>
        {/* Task card content will be added later */}
      </div>
    );
  }, []);

  
  // Toggle task card expansion state
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };
  
  // Toggle pop-up card display
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _togglePopup = (taskId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setPopupTaskId(popupTaskId === taskId ? null : taskId);
  };
  
  // Close popup card
  const closePopup = () => {
    setPopupTaskId(null);
    // At the same time, close the corresponding task card
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (popupTaskId) {
        newSet.delete(popupTaskId);
      }
      return newSet;
    });
  };

  // Show delete confirmation bubble
  const showDeleteConfirm = (taskId: string) => {
    setDeleteConfirmTaskId(taskId);
    closePopup(); // Close drop-down menu
  };

  // Cancel delete confirmation
  const cancelDeleteConfirm = () => {
    if (isDeletingTask) return;
    setDeleteConfirmTaskId(null);
  };

  // Display notification (unify global ToastContainer)
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (type === 'success') {
      toastMessage.success(message);
    } else if (type === 'error') {
      toastMessage.error(message);
    } else {
      toastMessage.info(message);
    }
  };

  // Show delete notification bubble
  const showDeleteNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    // Unified notification channel: automatically overwrite old notifications when new notifications appear
    showNotification(message, type);
  };

  // Confirm deletion task
  const confirmDeleteTask = async (taskId: string) => {
    if (isDeletingTask) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setIsDeletingTask(true);
    try {
      // Call API to delete task
      const result = await deleteTask(task.id);
      
      if (result.success) {
        deletedTaskIdsRef.current.add(task.id);
        tasksCacheRef.current.delete(task.id);
        originalTaskStatusRef.current.delete(task.id);
        setTasks(prev => prev.filter(t => t.id !== task.id));
        setAllTasksForChart(prev => prev.filter(t => t.id !== task.id));

        // Delete task ID and status
        removeTaskId(task.id);
        // Completely remove local state management and no longer delete task state from localStorage

        // Unified server-side refresh is used to avoid visual misordering of local files being deleted first and then being overwritten.
        await loadTasks({
          page: 1,
          pageSize: 1000,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          accountId: accountFilter !== 'all' ? accountFilter : undefined,
          type: typeFilter !== 'all' ? typeFilter : undefined,
          search: searchText || undefined
        });

        
        // Display a successful deletion notification, including information on the amount of deleted data
        const deleteMsg = result.dataDeleted && result.dataDeleted > 0 
          ? `${"Task deleted successfully".replace('{taskId}', task.taskId)}\n${result.dataDeleted.toLocaleString()} Records Deleted`
          : "Task deleted successfully".replace('{taskId}', task.taskId);
        showDeleteNotification(deleteMsg, 'success');
      } else {
        // Deletion failed, error notification displayed
        showDeleteNotification(`删除任务失败: ${result.error}`, 'error');
      }
    } catch (error) {
      // Error handled silently
      showDeleteNotification('删除任务时发生错误', 'error');
    } finally {
      setIsDeletingTask(false);
      // Close confirmation bubble
      setDeleteConfirmTaskId(null);
    }
  };
  
  // Filter container reference
  const accountFilterRef = useRef<HTMLDivElement>(null);
  const statusFilterRef = useRef<HTMLDivElement>(null);
  const typeFilterRef = useRef<HTMLDivElement>(null);
  
  // Toggle drop-down menu
  const markDropdownClosing = React.useCallback((dropdownName: string) => {
    setClosingDropdowns(prev => {
      const next = new Set(prev);
      next.add(dropdownName);
      return next;
    });
    const existingTimer = dropdownCloseTimersRef.current.get(dropdownName);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }
    const timerId = window.setTimeout(() => {
      setClosingDropdowns(prev => {
        const next = new Set(prev);
        next.delete(dropdownName);
        return next;
      });
      dropdownCloseTimersRef.current.delete(dropdownName);
    }, 240);
    dropdownCloseTimersRef.current.set(dropdownName, timerId);
  }, []);

  const isTopFilterDropdownVisible = React.useCallback((dropdownName: string) => {
    return activeDropdown === dropdownName || closingDropdowns.has(dropdownName);
  }, [activeDropdown, closingDropdowns]);

  const toggleDropdown = (dropdownName: string) => {
    setActiveDropdown(prev => {
      if (prev === dropdownName) {
        markDropdownClosing(dropdownName);
        return null;
      }
      if (prev) {
        markDropdownClosing(prev);
      }
      return dropdownName;
    });
  };
  
  // Close all drop-down menus
  const closeAllDropdowns = React.useCallback(() => {
    setActiveDropdown(prev => {
      if (prev) {
        markDropdownClosing(prev);
      }
      return null;
    });
  }, [markDropdownClosing]);

  // Clicking outside the area closes drop-down menus and pop-up cards
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Check if the click is within the dropdown menu
      const isInDropdown = target.closest('.select-dropdown');
      
      // Check if the click is outside any filter container
      const isOutsideAccountFilter = accountFilterRef.current && !accountFilterRef.current.contains(target);
      const isOutsideStatusFilter = statusFilterRef.current && !statusFilterRef.current.contains(target);
      const isOutsideTypeFilter = typeFilterRef.current && !typeFilterRef.current.contains(target);
      
      // Check if the click is inside the filter of the task creation form but not the filter itself
      const isInCreateForm = searchContainerRef.current && searchContainerRef.current.contains(target);
      const isInCreateFormFilter = target.closest('.select-wrapper') || target.closest('.search-input-wrapper');
      const isInTimePicker = target.closest('[data-time-picker]');
      const isInDatePicker = target.closest('[data-date-picker]');
      
      // Check if click inside filter of edit task modal
      const isInEditForm = target.closest('.auto-pipe-search-container') && editingTaskId;
      const isInEditFormFilter = target.closest('.select-wrapper') && editingTaskId;
      
      // Check if the click is inside the Duration&Mode bubble
      const isInDurationBubble = target.closest('[data-duration-bubble]');
      
      // If clicked inside the drop-down menu, the drop-down menu will not be closed
      if (isInDropdown) {
        return;
      }
      
      // If clicked outside any filter, close all drop-down menus
      if (isOutsideAccountFilter && isOutsideStatusFilter && isOutsideTypeFilter) {
        closeAllDropdowns();
      }
      
      // Closes the create form's dropdown menu if clicked within a task creation form but not on a filter element
      if (isCreatingTask && isInCreateForm && !isInCreateFormFilter && !isInTimePicker && !isInDatePicker) {
        closeAllDropdowns();
        setDatePickerOpen(false);
      }
      
      // If clicked outside the task creation form, closes the create form's dropdown menu
      if (isCreatingTask && !isInCreateForm) {
        closeAllDropdowns();
        setDatePickerOpen(false);
      }
      
      // Closes the edit form's drop-down menu if clicked inside the edit task modal but not on the filter element
      if (editingTaskId && isInEditForm && !isInEditFormFilter && !isInTimePicker && !isInDatePicker) {
        setEditActiveDropdown(null);
      }
      
      // If clicked outside the edit task modal, close the edit form's drop-down menu
      if (editingTaskId && !isInEditForm) {
        setEditActiveDropdown(null);
      }
      
      // If clicked outside the Duration&Mode bubble, close the bubble
      if (!isInDurationBubble && !target.closest('[data-duration-trigger]')) {
        setDurationBubbleTaskId(null);
      }
      
      // Check if the click is outside the task card
      const isOutsideTaskCard = !target.closest('.task-card');
      if (isOutsideTaskCard) {
        // Collapse all expanded task cards
        setExpandedTasks(new Set());
        // Close popup card
        closePopup();
        // Close the Duration&Mode bubble
        setDurationBubbleTaskId(null);
      }
    };

    // Add event listener
    document.addEventListener('mousedown', handleClickOutside);
    
    // Cleanup function
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreatingTask, editingTaskId]); // closePopup is not required as a dependency since it is defined inside useEffect

  useEffect(() => {
    const dropdownTimers = dropdownCloseTimersRef.current;
    return () => {
      dropdownTimers.forEach((timerId) => window.clearTimeout(timerId));
      dropdownTimers.clear();
    };
  }, []);

  // Check that all required conditions are met - use useMemo to cache results to avoid double calculations causing button flashes
  const isFormComplete = useMemo(() => {
    // Check filter options
    const filtersComplete = newTaskForm.accountId && 
                           newTaskForm.appType && 
                           newTaskForm.type && 
                           newTaskForm.dataPointer;
    
    // Check App Selector
    let appComplete = false;
    if (newTaskForm.appType === 'both') {
      appComplete = !!(newTaskForm.iosApp && newTaskForm.androidApp);
    } else if (newTaskForm.appType === 'ios') {
      appComplete = !!newTaskForm.iosApp;
    } else if (newTaskForm.appType === 'android') {
      appComplete = !!newTaskForm.androidApp;
    }
    
    return filtersComplete && appComplete;
  }, [newTaskForm.accountId, newTaskForm.appType, newTaskForm.type, newTaskForm.dataPointer, newTaskForm.iosApp, newTaskForm.androidApp]);

  // Get the Data Pointer information of the task
  const getTaskDataPointer = (taskId: string): string => {
    const task = filteredTasks.find((t: any) => t.id === taskId);
    if (task && task.dataPointer) {
      return task.dataPointer;
    }
    return 'Daily Execution'; // Default value
  };

  // Get task time information
  const getTaskTimeInfo = (task: Task) => {
    const dataPointer = task.dataPointer || 'Daily Execution';
    if (dataPointer === 'Daily Execution') {
      // Daily mode: Use execution_time field if present, otherwise use creation time
      if (task.executionTime) {
        return {
          type: 'Daily Execution',
          date: task.executionTime,
          description: 'Daily Execution Time'
        };
      } else {
        // Downgrade: if there is no execution_time, use creation time
        const createTime = new Date(task.createTime);
        const timeString = createTime.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        return {
          type: 'Daily Execution',
          date: timeString,
          description: 'Daily Execution Time'
        };
      }
    } else {
      // Single mode: use execution_date field if present, otherwise use startTime
      if (task.executionDate) {
        return {
          type: 'Single Execution',
          date: task.executionDate,
          description: 'Single Execution Date'
        };
      } else {
        // Downgrade: If there is no execution_date, use startTime
        const taskStartDate = new Date(task.startTime);
        const formattedDate = taskStartDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        return {
          type: 'Single Execution',
          date: formattedDate,
          description: 'Single Execution Date'
        };
      }
    }
  };

  // Build time options
  const generateTimeOptions = (type: 'hours' | 'minutes' | 'seconds') => {
    const max = type === 'hours' ? 23 : 59;
    return Array.from({ length: max + 1 }, (_, i) => i);
  };

  // Month switching function
  const changeMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => {
      let newMonth = prev;
      if (direction === 'prev') {
        newMonth = prev === 0 ? 11 : prev - 1;
      } else {
        newMonth = prev === 11 ? 0 : prev + 1;
      }
      return newMonth;
    });
  };

  // Reset to current month when opening date picker
  const openDatePicker = () => {
    const now = new Date();
    setCurrentMonth(now.getMonth());
    setCurrentYear(now.getFullYear());
    setDatePickerOpen(true);
  };

  // Click outside to close the dropdown menu
  const searchContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        closeAllDropdowns();
      }
      // Close the Time Range drop-down menu
      if (timeRangeDropdownRef.current && !timeRangeDropdownRef.current.contains(event.target as Node)) {
        setTimeRangeDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [closeAllDropdowns]);

  // Generate unique and non-duplicate task IDs
  const generateUniqueTaskId = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const timestamp = Date.now().toString().slice(-6); // Get the last 6 digits of the timestamp
    
    // Get the Task IDs of all existing tasks
    const existingTaskIds = new Set(tasks.map(task => task.taskId));
    
    let attempts = 0;
    const maxAttempts = 100; // Prevent infinite loops
    
    while (attempts < maxAttempts) {
    // Generate random string
    let randomPart = '';
      for (let i = 0; i < 8; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
      const newTaskId = `${timestamp}${randomPart}`;
      
      // Check if it already exists
      if (!existingTaskIds.has(newTaskId)) {
        return newTaskId;
      }
      
      attempts++;
    }
    
    // If there are still duplicates after 100 attempts, use timestamp + random number + counter
    const fallbackId = `${timestamp}${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    return fallbackId;
  };

  // Simulate App Data
  const mockApps: AppInfo[] = [
    // GooglePlay application (package name starting with com.)
    {
      app_id: 'com.instagram.android',
      app_name: 'Instagram',
      icon_url: 'https://play-lh.googleusercontent.com/VRMWkE5p3CkWhJs6nv-9ZsLAs1QOg5ob1_3qg-rckwYW7yp1fMrYZqnEFpk0IoVP4LM=w240-h480-rw',
      os: 'Android'
    },
    {
      app_id: 'com.facebook.katana',
      app_name: 'Facebook',
      icon_url: 'https://play-lh.googleusercontent.com/ccWDU4A7fX1R24v-vvT480ySh26AYp97g1VrMB_FoJSW5YJ9e0ar3Mbkme5CLZa3w=w240-h480-rw',
      os: 'Android'
    },
    {
      app_id: 'com.twitter.android',
      app_name: 'Twitter',
      icon_url: 'https://play-lh.googleusercontent.com/wIf3HtczQDjHzHuu6vefq7AtvD0nWi3drHq_fvJaO0WAL2lqSJDRWJd1TPVvf0_2-0=w240-h480-rw',
      os: 'Android'
    },
    {
      app_id: 'com.whatsapp',
      app_name: 'WhatsApp',
      icon_url: 'https://play-lh.googleusercontent.com/bYtqbOcTYOlgc6gqZ2rwb8lptHuwlNE75zYJu6Bn076-hTmvd96HH-6v7S0YUAAJXoJN=w240-h480-rw',
      os: 'Android'
    },
    {
      app_id: 'com.spotify.music',
      app_name: 'Spotify',
      icon_url: 'https://play-lh.googleusercontent.com/P2VMEenhpIsubG2oWbvuLGrs0GyyzLiDosGTg8bi82htGAcq8bG5PBc86qX5S0-JjZ8=w240-h480-rw',
      os: 'Android'
    },
    {
      app_id: 'com.netflix.mediaclient',
      app_name: 'Netflix',
      icon_url: 'https://play-lh.googleusercontent.com/TBRwjS_qfJCSj1m7zZB93FnpJM5fSpMA_wUlFDLxW845M9DdOC7X7Sq59rZgCpTkceA=w240-h480-rw',
      os: 'Android'
    },
    // iOS App (AppID in numeric format)
    {
      app_id: '389801252',
      app_name: 'Instagram',
      icon_url: 'https://is1-ssl.mzstatic.com/image/thumb/Purple126/v4/05/97/4e/05974e98-1b29-2dd9-2e70-84742d9d3e08/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/120x120bb.jpg',
      os: 'IOS'
    },
    {
      app_id: '284882215',
      app_name: 'Facebook',
      icon_url: 'https://is1-ssl.mzstatic.com/image/thumb/Purple126/v4/9c/1a/8a/9c1a8a3a-7c8a-8b8a-8b8a-8b8a8b8a8b8a/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/120x120bb.jpg',
      os: 'IOS'
    },
    {
      app_id: '333903271',
      app_name: 'Twitter',
      icon_url: 'https://is1-ssl.mzstatic.com/image/thumb/Purple126/v4/9c/1a/8a/9c1a8a3a-7c8a-8b8a-8b8a-8b8a8b8a8b8a/AppIcon-0-0-1x_U007emarketing-0-0-0-7-0-0-sRGB-0-0-0-GLES2_U002c0-512MB-85-220-0-0.png/120x120bb.jpg',
      os: 'IOS'
    }
  ];

  // Task ID Management - Load saved task IDs from localStorage
  const [taskIds, setTaskIds] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('autopipe-task-ids');
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      // Error handled silently
      return {};
    }
  });

  // Delete task ID
  const removeTaskId = (taskId: string) => {
    const updatedTaskIds = { ...taskIds };
    delete updatedTaskIds[taskId];
    setTaskIds(updatedTaskIds);
    
    // Save to localStorage
    try {
      localStorage.setItem('autopipe-task-ids', JSON.stringify(updatedTaskIds));
    } catch (error) {
      // Error handled silently
    }
  };

  // Start the task creation process (Super Admin cannot create when switching to other Team)
  const startCreateTask = () => {
    if (newTaskDisabled) return;
    setIsCreatingTask(true);
    // Reset form
    setNewTaskForm({
      appType: 'both',
      type: '',
      accountId: '',
      dataPointer: 'Daily Execution',
      iosApp: null,
      androidApp: null,
      selectedTime: {
        hours: 0,
        minutes: 0,
        seconds: 0
      },
      selectedDate: (() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
      })()
    });
  };

  // Cancel task creation (return to Auto Pipe)
  const cancelCreateTask = () => {
    setIsCreatingTask(false);
  };

  // Create new task
  const createNewTask = async () => {
    if (!newTaskForm.type) {
      return;
    }

    // ========== Task duplication verification ==========
    // Check if there are tasks with the same account, Data Type, time mode (dataPointer) and App
    const selectedApps: AppInfo[] = [];
    
    // Decide which apps to choose based on appType
    if (newTaskForm.appType === 'ios' && newTaskForm.iosApp) {
      selectedApps.push(newTaskForm.iosApp);
    } else if (newTaskForm.appType === 'android' && newTaskForm.androidApp) {
      selectedApps.push(newTaskForm.androidApp);
    } else if (newTaskForm.appType === 'both') {
      if (newTaskForm.iosApp) {
        selectedApps.push(newTaskForm.iosApp);
      }
      if (newTaskForm.androidApp) {
        selectedApps.push(newTaskForm.androidApp);
      }
    }

    // If no application is selected, validation will be skipped (form validation will be handled)
    if (selectedApps.length === 0) {
      // Continue with the creation process and let form validation handle it
    } else {
      // Check existing task list for duplicates
      const duplicateTask = tasks.find(task => {
        // Check if account is the same
        if (task.accountId !== newTaskForm.accountId) {
          return false;
        }
        
        // Check if the Data Type is the same
        if (task.type !== newTaskForm.type) {
          return false;
        }
        
        // Check if the time patterns (dataPointer) are the same
        if (task.dataPointer !== newTaskForm.dataPointer) {
          return false;
        }
        
        // Check if there is the same app
        // Need to check whether all apps of the new task are in the existing task
        const taskAppIds = new Set(task.apps?.map(app => app.app_id) || []);
        const selectedAppIds = new Set(selectedApps.map(app => app.app_id));
        
        // Check if any selected apps are in existing tasks
        const hasCommonApp = Array.from(selectedAppIds).some(appId => taskAppIds.has(appId));
        
        return hasCommonApp;
      });

      if (duplicateTask) {
        // Find duplicate tasks, show error notifications and prevent creation
        const duplicateAppNames = selectedApps
          .filter(app => duplicateTask.apps?.some(t => t.app_id === app.app_id))
          .map(app => app.app_name || app.app_id)
          .join(', ');
        
        // Get the account name (if any)
        const accountName = accountConfigs.find(acc => acc.id === newTaskForm.accountId)?.account_name || newTaskForm.accountId;
        
        showNotification(
          `Task creation failed: A task with the same account (${accountName}), data type (${newTaskForm.type}), execution mode (${newTaskForm.dataPointer}), and app${selectedApps.length > 1 ? 's' : ''} (${duplicateAppNames}) already exists.`,
          'error'
        );
        
        // Reset Loading status
        setIsCreatingActiveLoading(false);
        
        return; // Prevent creation
      }
    }
    // ========== Task duplication verification ends ==========

    // Set Loading status (Create&Active only)
    setIsCreatingActiveLoading(true);

    try {
      // Generate unique and non-duplicate task IDs
      const generatedTaskId = generateUniqueTaskId();

      // Generate current time string
      const currentTime = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/, '$3-$1-$2 $4:$5:$6');

      // Collect selected applications - strictly according to user selection (already collected during the verification phase and used directly here)
      // selectedApps has been defined in the verification phase and is used directly here

      // If no app is selected, the default app is used (but this should not happen as form validation blocks it)
      const appsToUse = selectedApps.length > 0 ? selectedApps : (realApps.length > 0 ? realApps.slice(0, 1) : mockApps.slice(0, 1));

      // Make sure each app's progress is explicitly set to 0 (for newly created tasks, app progress should start from 0)
      const appsWithProgress = appsToUse.map(app => ({
        ...app,
        progress: 0 // Explicitly set the initial progress to 0 to ensure that incorrect progress is not displayed
      }));

      // Create new task object
      const newTask: Task = {
        id: generatedTaskId,
        type: newTaskForm.type,
        status: 'running', // Only keep Create&Active, create and run
        progress: 0,
        startTime: currentTime,
      description: 'New task created by user',
      priority: 'medium',
      accountId: newTaskForm.accountId,
        taskId: generatedTaskId,
        createTime: currentTime, // Task creation time, unique
        latestUpdateTime: currentTime, // The latest update time of the task, initially the creation time
        apps: appsWithProgress, // Use apps that explicitly set progress
        dataPointer: newTaskForm.dataPointer as 'Daily Execution' | 'Single Execution' // Save the Duration&Mode selected by the user
    };

      
      // Call the API to create tasks to the database
      const taskData: any = {
        task_id: generatedTaskId,
        type: newTask.type,
        account_id: newTask.accountId,
        data_pointer: newTask.dataPointer,
        app_type: newTaskForm.appType || 'both', // Use the form's appType, not newTask's
        apps: newTask.apps,
        status: newTask.status,
        description: newTask.description,
        priority: newTask.priority
      };

      // Add time configuration based on dataPointer type
      if (newTaskForm.dataPointer === 'Single Execution' && newTaskForm.selectedDate) {
        // Single mode: add execution date
        taskData.execution_date = newTaskForm.selectedDate.toISOString().split('T')[0];
      } else if (newTaskForm.dataPointer === 'Daily Execution' && newTaskForm.selectedTime) {
        // Daily mode: add execution time
        const hours = newTaskForm.selectedTime.hours.toString().padStart(2, '0');
        const minutes = newTaskForm.selectedTime.minutes.toString().padStart(2, '0');
        taskData.execution_time = `${hours}:${minutes}`;
      }

      const result = await createTask(taskData);
      
      if (result.success) {
        // Refresh the top chart immediately after successful creation to avoid waiting for 30 seconds for polling
        refreshAllTasksForChart().catch(() => {
          // Error handled silently
        });

        // Trigger polling checks immediately, without waiting for loadTasks to complete
        // This ensures that even if the task executes quickly, it will still be detected by polling
        setPollingTrigger(prev => prev + 1);
        
        // Refresh the task list after successful creation (asynchronous execution, no blocking)
        loadTasks({
          page: 1,
          pageSize: 1000,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          accountId: accountFilter !== 'all' ? accountFilter : undefined,
          type: typeFilter !== 'all' ? typeFilter : undefined,
          search: searchText || undefined
        }).catch(error => {
          // Error handled silently
        });

        // Show success notification immediately (before executing the task)
        showNotification("Task created successfully".replace('{taskId}', generatedTaskId), 'success');
    
    // End the creation process
    setIsCreatingTask(false);
    
      // Reset form
      setNewTaskForm({
        appType: 'both',
        type: '' as 'install_pb' | 'event_pb' | 'install_rtpb' | 'event_rtpb' | '',
        accountId: '',
        dataPointer: 'Daily Execution',
        iosApp: null,
        androidApp: null,
        selectedTime: {
          hours: new Date().getHours(),
          minutes: new Date().getMinutes(),
          seconds: new Date().getSeconds()
        },
        selectedDate: (() => {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          return yesterday;
        })()
      });

        const taskIdToExecute = result.task_id || generatedTaskId;
        
        // Only Create&Active is retained, and the task is executed immediately after creation (asynchronous, does not block the UI)
        (async () => {
          try {
            const executeResponse = await autopipeAxiosInstance.post(`/api/autopipe/tasks/${taskIdToExecute}/execute`, {});
            const executeResult = executeResponse.data as ApiResponse;
            
            if (executeResult.success) {
            } else {
            }
          } catch (error) {
            console.error(`[AutoPipe] Exception executing task:`, error);
          }
        })();
        
      } else {
        throw new Error(result.error || '创建任务失败');
      }
    } catch (error) {
      // Error handled silently
      showNotification("Failed to create task", 'error');
    } finally {
      // Clear Loading status (Create&Active button only)
      setIsCreatingActiveLoading(false);
    }
  };

  // Start editing task (reserved for later use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _startEditTask = (task: Task) => {
    setEditingTaskId(task.id);
    
    // Parse App information in tasks
    const iosApp = task.apps.find(app => app.os === 'IOS') || null;
    const androidApp = task.apps.find(app => app.os === 'Android') || null;
    
    // Infer appType from apps array
    let inferredAppType: 'ios' | 'android' | 'both' = 'both';
    if (task.apps.length === 1) {
      if (iosApp && !androidApp) {
        inferredAppType = 'ios';
      } else if (androidApp && !iosApp) {
        inferredAppType = 'android';
      }
    } else if (task.apps.length === 2) {
      inferredAppType = 'both';
    }
    
    // Parse time configuration
    let initialSelectedDate = new Date();
    let initialSelectedTime = {
      hours: new Date().getHours(),
      minutes: new Date().getMinutes(),
      seconds: new Date().getSeconds()
    };
    
    // Initialization time configuration based on execution mode
    if (task.dataPointer === 'Single Execution') {
      // Single mode: use execution_date or startTime
      if (task.executionDate) {
        try {
          const execDate = new Date(task.executionDate);
          if (!isNaN(execDate.getTime())) {
            initialSelectedDate = execDate;
          }
        } catch (error) {
          // Failed to parse executionDate, handled silently
        }
      } else if (task.startTime) {
        try {
          const startTime = new Date(task.startTime);
          if (!isNaN(startTime.getTime())) {
            initialSelectedDate = startTime;
          }
        } catch (error) {
          // Failed to parse startTime, handled silently
        }
      }
    } else {
      // Daily mode: use execution_time
      if (task.executionTime) {
        try {
          // Parse executionTime (HH:MM:SS or HH:MM format)
          const timeParts = task.executionTime.split(':');
          if (timeParts.length >= 2) {
            initialSelectedTime = {
              hours: parseInt(timeParts[0], 10),
              minutes: parseInt(timeParts[1], 10),
              seconds: timeParts.length > 2 ? parseInt(timeParts[2], 10) : 0
            };
          }
        } catch (error) {
          console.warn('Failed to parse executionTime:', task.executionTime, error);
        }
      }
    }
    
    setEditTaskForm({
      appType: inferredAppType, // Prioritize inferred types to ensure correct display
      type: task.type || '',
      accountId: task.accountId || '',
      dataPointer: task.dataPointer || 'Daily Execution',
      apps: task.apps || [],
      selectedApps: task.apps || [],
      iosApp: iosApp,
      androidApp: androidApp,
      selectedTime: initialSelectedTime,
      selectedDate: initialSelectedDate
    });
  };

  // Cancel editing task
  const cancelEditTask = () => {
    setEditingTaskId(null);
    setEditTaskForm({
      appType: '',
      type: '' as 'install_pb' | 'event_pb' | 'install_rtpb' | 'event_rtpb' | '',
      accountId: '',
      dataPointer: 'Daily Execution',
      apps: [],
      selectedApps: [],
      iosApp: null,
      androidApp: null,
      selectedTime: {
        hours: new Date().getHours(),
        minutes: new Date().getMinutes(),
        seconds: new Date().getSeconds()
      },
      selectedDate: (() => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday;
      })()
    });
  };

  // Save edited tasks
  const saveEditTask = async () => {
    if (!editingTaskId) return;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _currentTime = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).replace(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/, '$3-$1-$2 $4:$5:$6');

    // Collect selected apps - use editTaskForm.apps (edit the list of apps displayed in the pop-up window)
    const selectedApps: AppInfo[] = editTaskForm.apps || [];
    
    // If there are no apps, try using iosApp and androidApp (alternative)
    if (selectedApps.length === 0) {
      if (editTaskForm.appType === 'ios' && editTaskForm.iosApp) {
        selectedApps.push(editTaskForm.iosApp);
      } else if (editTaskForm.appType === 'android' && editTaskForm.androidApp) {
        selectedApps.push(editTaskForm.androidApp);
      } else if (editTaskForm.appType === 'both') {
        if (editTaskForm.iosApp) {
          selectedApps.push(editTaskForm.iosApp);
        }
        if (editTaskForm.androidApp) {
          selectedApps.push(editTaskForm.androidApp);
        }
      }
    }

    try {
      // Build API request data
      const updateData: any = {
        description: '', // It is temporarily empty and can be added later
        priority: 'medium', // Use medium instead of normal because the priority field in the database only allows high/medium/low
        app_type: editTaskForm.appType,
        type: editTaskForm.type,
        account_id: editTaskForm.accountId,
        schedule_type: editTaskForm.dataPointer === 'Single Execution' ? 'single' : 'daily',
        apps: selectedApps.map(app => ({
          app_id: app.app_id,
          app_name: app.app_name,
          icon_url: app.icon_url || '',
          os: app.os,
          country: app.country || '',
          category: app.category || '',
          developer: app.developer || '',
          rating: app.rating?.toString() || ''
        }))
      };

      // Add time configuration
      if (editTaskForm.dataPointer === 'Single Execution' && editTaskForm.selectedDate) {
        // Single mode: add start_date
        // Use local date formatting to avoid time zone issues
        const year = editTaskForm.selectedDate.getFullYear();
        const month = (editTaskForm.selectedDate.getMonth() + 1).toString().padStart(2, '0');
        const day = editTaskForm.selectedDate.getDate().toString().padStart(2, '0');
        const startDate = `${year}-${month}-${day}`; // YYYY-MM-DD format
        updateData.start_date = startDate;
      } else if (editTaskForm.dataPointer === 'Daily Execution' && editTaskForm.selectedTime) {
        // Daily mode: add execute_time
        const hours = editTaskForm.selectedTime.hours.toString().padStart(2, '0');
        const minutes = editTaskForm.selectedTime.minutes.toString().padStart(2, '0');
        updateData.execute_time = `${hours}:${minutes}`;
      }

      // Call the backend API update task
      const response = await autopipeAxiosInstance.put(`/api/autopipe/tasks/${editingTaskId}`, updateData);
      const result = response.data as ApiResponse;
      if (!result.success) {
        throw new Error(result.error || 'Failed to update task');
      }

      // After the API call is successful, reload the task data to ensure synchronization
      await loadTasks({
        page: currentPage,
        pageSize: pageSize,
        status: statusFilter !== 'all' ? statusFilter as 'running' | 'paused' | 'completed' | 'warning' : undefined,
        accountId: accountFilter !== 'all' ? accountFilter : undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        search: searchText || undefined
      });

      // Show success message
      showNotification("Task updated successfully".replace('{taskId}', editingTaskId), 'success');

    // Turn off edit mode
    setEditingTaskId(null);
      setEditTaskForm({
        appType: '',
        type: '' as 'install_pb' | 'event_pb' | 'install_rtpb' | 'event_rtpb' | '',
        accountId: '',
        dataPointer: 'Daily Execution',
        apps: [],
        selectedApps: [],
        iosApp: null,
        androidApp: null,
        selectedTime: {
          hours: new Date().getHours(),
          minutes: new Date().getMinutes(),
          seconds: new Date().getSeconds()
        },
        selectedDate: new Date()
      });

    } catch (error) {
      console.error('Failed to update task:', error);
      showNotification('Failed to update task, please try again', 'error');
    }
  };

  // Generate final task data - only load from localStorage, no default task is created
  // Initialization task list - loading from database (only executed once when mounting to avoid duplication with filtering effect)
  React.useEffect(() => {
    lastFiltersRef.current = { statusFilter, accountFilter, typeFilter, searchText };
    loadTasks({
      page: 1,
      pageSize: 1000,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      accountId: accountFilter !== 'all' ? accountFilter : undefined,
      type: typeFilter !== 'all' ? typeFilter : undefined,
      search: searchText || undefined
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array, only executed once when the component is mounted (functions such as loadTasks are defined inside the component and do not need to be used as dependencies)

  // Note: The monitoring of filter condition changes has been handled in useEffect (line 1463) above
  // This useEffect has been removed to avoid repeated calls and conflicts

  // Use useRef to cache task lists to avoid re-rendering during animations
  const cachedTasksRef = useRef<Task[]>([]);
  const lastTasksLengthRef = useRef(0);
  const lastTaskIdsRef = useRef<string>('');
  const lastTaskStatusesRef = useRef<string>(''); // Used to detect status changes
  const lastTaskProgressRef = useRef<string>(''); // Used to detect changes in the total progress of the task
  const lastAppProgressRef = useRef<string>(''); // Used to detect progress changes in sub-applications
  
  // Detect task list changes (including quantity, ID, status, task progress, app progress) - use useMemo to avoid executing side effects in the component body
  const stableTasks = useMemo(() => {
    // If tasks is an empty array, clear the cache immediately and return an empty array.
    // This ensures that when filter conditions change, old data is not retained
    if (tasks.length === 0) {
      cachedTasksRef.current = [];
      lastTasksLengthRef.current = 0;
      lastTaskIdsRef.current = '';
      lastTaskStatusesRef.current = '';
      lastTaskProgressRef.current = '';
      lastAppProgressRef.current = '';
      return [];
    }
    
    const currentTaskIds = tasks.map(t => t.id).join(',');
    const currentTaskStatuses = tasks.map(t => `${t.id}:${t.status}`).join(',');
    const currentTaskProgress = tasks.map(t => `${t.id}:${Math.round(t.progress || 0)}`).join(',');
    const currentAppProgress = tasks
      .map(t => `${t.id}:${(t.apps || []).map(app => `${app.app_id}:${Math.round(app.progress || 0)}`).join('|')}`)
      .join(',');
    const hasTasksChanged = tasks.length !== lastTasksLengthRef.current || 
                            currentTaskIds !== lastTaskIdsRef.current ||
                            currentTaskStatuses !== lastTaskStatusesRef.current ||
                            currentTaskProgress !== lastTaskProgressRef.current ||
                            currentAppProgress !== lastAppProgressRef.current;
    
    if (hasTasksChanged) {
      // Completely uses backend data without any local state overrides
      cachedTasksRef.current = tasks.map((task) => ({
        ...task,
        status: task.status  // Use the status returned by the backend directly without any local intervention
      }));
      lastTasksLengthRef.current = tasks.length;
      lastTaskIdsRef.current = currentTaskIds;
      lastTaskStatusesRef.current = currentTaskStatuses;
      lastTaskProgressRef.current = currentTaskProgress;
      lastAppProgressRef.current = currentAppProgress;
    }
    
    return cachedTasksRef.current;
  }, [tasks]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#6b46c1';
      case 'paused': return '#dc2626';
      case 'completed': return '#16a34a';
      case 'warning': return '#f59e0b'; // orange
      default: return '#666';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <VscPulse size={14} />;
      case 'paused': return <VscRunErrors size={14} />;
      case 'completed': return <VscRunAllCoverage size={14} />;
      case 'warning': return <MdWarningAmber size={14} />;
      default: return <VscSymbolKeyword size={14} />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running': return "Running";
      case 'paused': return "Paused";
      case 'completed': return "Completed";
      case 'warning': return "Warning";
      default: return "All Status";
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#ff4d4f';
      case 'medium': return '#faad14';
      case 'low': return '#52c41a';
      default: return '#d9d9d9';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'install_pb': return <MdDownloading size={12} />;
      case 'event_pb': return <MdDataSaverOn size={12} />;
      case 'install_rtpb': return <MdDownloading size={12} />;
      case 'event_rtpb': return <MdDonutLarge size={12} />;
      default: return <VscSymbolKeyword size={12} />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'install_pb': return 'Install-PB';
      case 'event_pb': return 'Event-PB';
      case 'install_rtpb': return 'Install-RTPB';
      case 'event_rtpb': return 'Event-RTPB';
      default: return 'All Type';
    }
  };

  const getAppTypeIcon = (appType: string) => {
    switch (appType.toLowerCase()) {
      case 'bundle': return <BsCardChecklist size={12} />;
      case 'ios': return <BsApple size={12} />;
      case 'android': return <BsAndroid2 size={12} />;
      default: return <BsCardChecklist size={12} />;
    }
  };

  const getAccountIcon = (accountId: string) => {
    if (accountId === 'all') return <VscSymbolKeyword size={12} />;
    
    const account = accountConfigs.find(config => config.id === accountId);
    if (!account) return <VscSymbolKeyword size={12} />;
    
    // If there is a custom icon, display the custom icon
    if (account.custom_icon) {
      return (
        <img 
          src={account.custom_icon} 
          alt={account.account_name}
          style={{ 
            width: '12px', 
            height: '12px', 
            objectFit: 'cover',
            borderRadius: '2px'
          }}
        />
      );
    }
    
    // Otherwise show default icon
    return (
      <div style={{
        width: '12px',
        height: '12px',
        background: 'linear-gradient(135deg, #722ed1, #531dab)',
        borderRadius: '2px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '6px',
        color: 'white',
        fontWeight: 'bold'
      }}>
        {account.account_type?.charAt(0) || 'A'}
      </div>
    );
  };

  const getAccountLabel = (accountId: string) => {
    if (accountId === 'all') return 'All Accounts';
    
    const account = accountConfigs.find(config => config.id === accountId);
    return account ? account.account_name : 'Unknown Account';
  };

  // Get the account information bound to the task
  const getTaskAccount = (task: Task) => {
    if (task.accountId === 'default') {
      return accountConfigs.length > 0 ? accountConfigs[0] : null;
    }
    return accountConfigs.find(config => config.id === task.accountId) || null;
  };

  // Get the list of accounts actually used in the task
  const getTaskAccountIds = () => {
    const accountIds = new Set<string>();
    allTasksForChart.forEach((task: Task) => {
      if (task.accountId && task.accountId !== 'default') {
        accountIds.add(task.accountId);
      }
    });
    return Array.from(accountIds);
  };

  // Get the account configuration used in the task
  const getTaskAccountConfigs = () => {
    const taskAccountIds = getTaskAccountIds();
    return accountConfigs.filter(account => taskAccountIds.includes(account.id));
  };

  // Format duration display
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatDuration = (duration: string | undefined): string => {
    if (!duration) return 'N/A';
    
    // If it is already a formatted string (such as "45m"), return it directly
    if (typeof duration === 'string' && /^\d+[smh]$/.test(duration)) {
      return duration;
    }
    
    // If numeric (seconds), convert to appropriate format
    const seconds = parseInt(duration);
    if (isNaN(seconds)) return 'N/A';
    
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const remainingMinutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;
      
      let result = `${hours}h`;
      if (remainingMinutes > 0) {
        result += ` ${remainingMinutes}m`;
      }
      if (remainingSeconds > 0 && hours < 24) { // Display seconds only if less than 24 hours
        result += ` ${remainingSeconds}s`;
      }
      return result;
    }
  };

  // Copy task ID to clipboard
  const copyTaskId = async (taskId: string) => {
    if (copyingTaskId || !taskId) return;
    
    setCopyingTaskId(taskId);
    setCopySuccess(null);
    
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(taskId);
      } else {
        // Fallback for non-secure context: keeps copy button interactive.
        const textArea = document.createElement('textarea');
        textArea.value = taskId;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        textArea.style.pointerEvents = 'none';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textArea);
        if (!copied) {
          throw new Error('copy_failed');
        }
      }
      
      // Ensure that the copying status is displayed for at least 500ms to provide a silky animation experience
      setTimeout(() => {
        setCopyingTaskId(null);
        setCopySuccess(taskId);
        
        // Reset success status after 3 seconds
        setTimeout(() => {
          setCopySuccess(null);
        }, 3000);
      }, 500);
      
    } catch (error) {
      console.error('Failed to copy:', error);
      setCopyingTaskId(null);
    }
  };

  // Add CSS animation style
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes copySpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes fadeIn {
        0% { opacity: 0; transform: scale(0.8); }
        100% { opacity: 1; transform: scale(1); }
      }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .animate-spin {
    animation: spin 1s linear infinite;
  }

  /*Bubble sliding up animation - optimized to prevent jitter, use transform3d to enable hardware acceleration*/
  @keyframes bubbleSlideUp {
    from { 
      opacity: 0; 
      transform: translate3d(-50%, 10px, 0); /*Enable hardware acceleration using translate3d*/
    }
    to { 
      opacity: 1; 
      transform: translate3d(-50%, 0, 0); /*Make sure the final state uses translate3d*/
    }
  }
  
  /*Bubble container style optimization - prevent jitter after animation ends*/
  .app-progress-bubble {
    will-change: transform, opacity;
    backface-visibility: hidden;
    perspective: 1000px; /*Enable 3D transformation optimization*/
    transform-style: preserve-3d; /*Keep 3D transformations*/
    animation-fill-mode: both; /*Apply initial and final states to ensure consistent states before and after the animation*/
    /*Do not set transform-origin to avoid positioning conflicts with translateX(-50%)*/
    /*transform is fully controlled by animation to ensure consistent state*/
  }

  /*Task card container fade-in animation - the entire container is displayed at once to avoid jitter caused by card-by-card animation*/
  @keyframes tasksGridFadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .tasks-grid-animate {
    animation: tasksGridFadeIn 0.3s ease-out forwards;
    will-change: opacity;
    animation-fill-mode: forwards;
  }
  
  /*Remove will-change after animation ends*/
  .tasks-grid:not(.tasks-grid-animate) {
    will-change: auto;
  }

  /*Refresh button animation effect*/
  @keyframes refreshButtonPulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
    }
    50% {
      transform: scale(1.02);
      box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.15);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
    }
  }

  .refresh-button-animate {
    animation: refreshButtonPulse 0.5s ease-out;
    will-change: transform, box-shadow;
    animation-fill-mode: both;
  }

    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // Get real application data
  const loadRealApps = async () => {
    setAppsLoading(true);
    try {
      const apps = await fetchAppsFromDatabase();
      setRealApps(apps);
      
      // Add minimum loading time to ensure users can see the Loading effect
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      console.error('Failed to load app data:', error);
      // Even if an error occurs, wait for the minimum time
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      setAppsLoading(false);
    }
  };

  // Refresh task list
  const refreshTasks = async () => {
    
    // Start Refresh button animation
    setRefreshButtonAnimate(true);
    
    try {
      await loadTasks({
        page: 1,
        pageSize: 1000,
        status: statusFilter,
        accountId: accountFilter,
        type: typeFilter,
        search: searchText
      });
    } finally {
      // Delay stopping animations to ensure users see feedback
      setTimeout(() => {
        setRefreshButtonAnimate(false);
      }, 600);
    }
  };

  // Refresh configuration data and application data when the page is initialized
  useEffect(() => {
    // When the page loads, if the configuration is empty, the data will be refreshed actively.
    if (!accountConfigs || accountConfigs.length === 0) {
      refreshAccountConfigs(true);
    }
    
    // Load real application data
    loadRealApps();

    // Initial loading of task data
    loadTasks({
      page: 1,
      pageSize: 1000,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      accountId: accountFilter !== 'all' ? accountFilter : undefined,
      type: typeFilter !== 'all' ? typeFilter : undefined,
      search: searchText || undefined
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // accountConfigs and refreshAccountConfigs are not required as dependencies as this is the initialization logic

  // After the first render is complete, disable animation to avoid animation issues on subsequent renders
  useEffect(() => {
    if (isFirstRenderRef.current && !tasksLoading && tasks.length > 0) {
      // Make sure the animation state is set
      if (!shouldAnimate) {
        setShouldAnimate(true);
      }
      
      const timer = setTimeout(() => {
        isFirstRenderRef.current = false; // Use ref without triggering re-rendering
        setShouldAnimate(false); // Disable animation
        // Delayed start polling to avoid triggering repeated renderings during animations
        setTimeout(() => {
          setPollingTrigger(prev => prev + 1);
        }, 200); // An additional delay of 200ms ensures that the animation ends completely
      }, 1200); // Increase the waiting time to 1200ms to ensure that all animations are completed (0.4s animation + 0.05s*maximum number of tasks)
      return () => clearTimeout(timer);
    }
  }, [tasksLoading, tasks.length, shouldAnimate]);

  // Reset animation state when page refreshes
  useEffect(() => {
    isFirstRenderRef.current = true;
    setShouldAnimate(false); // Reset animation state
    setRefreshButtonAnimate(false); // Reset Refresh button animation state
  }, []);

  // State update control during animation - avoid double counting using useMemo
  const isAnimating = useMemo(() => {
    return isFirstRenderRef.current && !tasksLoading && tasks.length > 0;
  }, [tasksLoading, tasks.length]);


  // Task list (server-side filtering + front-end secondary verification)
  // The backend has filtered according to accountFilter/statusFilter/typeFilter/searchText in fetchTasks
  // However, in order to ensure the accuracy of screening, the front end also needs to perform secondary screening to prevent polling or other operations from introducing tasks that do not meet the screening conditions.
  const filteredTasks = React.useMemo(() => {
    // If loading or filter conditions are changing, return an empty array to avoid triggering the "No Task" display
    // This ensures that when filtering switches, the skeleton screen is always displayed instead of "No Task"
    // Also check ref to ensure that an empty array is correctly returned even if the state has not been updated.
    if (tasksLoading || isFilterChanging || isFilterChangingRef.current) {
      return [];
    }
    
    return stableTasks.filter((task: Task) => {
      // Status filter
      if (statusFilter !== 'all' && task.status !== statusFilter) {
        return false;
      }
      
      // DataType (type) filter
      if (typeFilter !== 'all' && task.type !== typeFilter) {
        return false;
      }
      
      // Account filter
      if (accountFilter !== 'all' && task.accountId !== accountFilter) {
        return false;
      }
      
      // Search text filter
      if (searchText && searchText.trim()) {
        const searchLower = searchText.toLowerCase().trim();
        const matchesSearch = 
          task.taskId?.toLowerCase().includes(searchLower) ||
          task.description?.toLowerCase().includes(searchLower) ||
          task.apps?.some(app => 
            app.app_name?.toLowerCase().includes(searchLower) ||
            app.app_id?.toLowerCase().includes(searchLower)
          );
        if (!matchesSearch) {
          return false;
        }
      }
      
      return true;
    });
  }, [stableTasks, statusFilter, typeFilter, accountFilter, searchText, tasksLoading, isFilterChanging]);

  // Task data after pagination
  const paginatedTasks = React.useMemo(() => {
    return filteredTasks.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filteredTasks, currentPage, pageSize]);

  // Stabilize task card data to avoid unnecessary re-rendering during first render
  const stableTaskCards = React.useMemo(() => {
    if (shouldAnimate && tasks.length > 0) {
      // During animation, use stable task data to avoid re-rendering caused by polling updates
      return paginatedTasks.map((task, index) => ({
        ...task,
        // Lock progress and status during animation to avoid updates during animation
        progress: task.progress,
        status: task.status,
        apps: task.apps.map(app => ({
          ...app,
          progress: app.progress
        }))
      }));
    }
    return paginatedTasks;
  }, [paginatedTasks, shouldAnimate, tasks.length]);

  const [taskGridColumns, setTaskGridColumns] = useState<number>(4);
  // The number of skeleton screens should be consistent with the current paging capacity to avoid the misalignment of "actually two rows but three rows of skeletons are missing"
  const skeletonCardCount = useMemo(() => {
    const cols = Math.max(1, taskGridColumns || 1);
    if (Number.isFinite(pageSize) && pageSize > 0) return Math.max(cols, pageSize);
    return cols * 2;
  }, [pageSize, taskGridColumns]);

  // Dynamically calculate the number of task grid columns and the number of cards per page:
  // Taking the minimum available width of the card as a constraint, priority is given to descending the column to avoid the internal layout of the card from being crushed.
  useEffect(() => {
    const calculatePageSize = () => {
      if (!tasksGridRef.current) return;
      
      const container = tasksGridRef.current;
      const containerWidth = container.clientWidth;
      const CARD_MIN_WIDTH = 360; // Ensure that the layout of internal elements of the card is not squeezed
      const GAP = 16;
      const maxColumns = 4;
      const calculatedColumns = Math.floor((containerWidth + GAP) / (CARD_MIN_WIDTH + GAP));
      const columns = Math.max(1, Math.min(maxColumns, calculatedColumns));
      setTaskGridColumns(prev => (prev !== columns ? columns : prev));

      // Retain the original "widescreen maximum three lines" policy, but it will only take effect when the number of columns is sufficient.
      const rowsPerPage = columns >= 3 && containerWidth >= 1500 ? 3 : 2;
      const newPageSize = columns * rowsPerPage;
      
      setPageSize(prevPageSize => {
        if (newPageSize !== prevPageSize) {
          // Consistent with the interaction with AppsFinder: try to keep the "currently first visible task" from jumping after the size is changed.
          const firstVisibleTaskIndex = Math.max(0, (currentPage - 1) * prevPageSize);
          const candidatePage = Math.floor(firstVisibleTaskIndex / newPageSize) + 1;
          const totalPages = Math.max(1, Math.ceil(filteredTasks.length / newPageSize));
          const nextPage = Math.min(Math.max(1, candidatePage), totalPages);
          if (nextPage !== currentPage) {
            setCurrentPage(nextPage);
          }
          return newPageSize;
        }
        return prevPageSize;
      });
    };

    // Initial calculation
    calculatePageSize();

    // Use ResizeObserver to monitor container width changes
    const resizeObserver = new ResizeObserver(() => {
      // Use requestAnimationFrame to ensure it is calculated after layout is complete
      requestAnimationFrame(() => {
        calculatePageSize();
      });
    });

    if (tasksGridRef.current) {
      resizeObserver.observe(tasksGridRef.current);
    }

    // Also monitor window size changes (handling media query changes)
    const handleResize = () => {
      requestAnimationFrame(() => {
        calculatePageSize();
      });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [filteredTasks.length, currentPage]); // Remove pageSize dependency to avoid cyclic updates

  // Handle paging logic after deleting tasks
  useEffect(() => {
    const totalPages = Math.ceil(filteredTasks.length / pageSize);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filteredTasks.length, currentPage, pageSize]);

  const runningTasks = allTasksForChart.filter(task => task.status === 'running').length;
  const pausedTasks = allTasksForChart.filter(task => task.status === 'paused').length;
  const completedTasks = allTasksForChart.filter(task => task.status === 'completed').length;
  const warningTasks = allTasksForChart.filter(task => task.status === 'warning').length;

  const hasAnyTaskFilter =
    statusFilter !== 'all' ||
    accountFilter !== 'all' ||
    typeFilter !== 'all' ||
    !!searchText.trim();
  const showEmptyTaskHint =
    !tasksLoading &&
    !isCreatingTask &&
    !hasAnyTaskFilter &&
    stableTasks.length === 0;

  return (
    <div className="max-w-[1800px] mx-auto min-w-0 w-full p-6">
      {/* When there is no task: Toast is always displayed in the upper right corner, prompting you to create it through New Task */}
      {showEmptyTaskHint && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <div
            className="autopipe-empty-task-toast"
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.85)',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              fontSize: '14px',
              fontWeight: 500,
              color: '#374151',
              maxWidth: '350px',
            }}
          >
            {newTaskDisabled ? (
              <span>View only. Switch to <strong>Super Admin</strong> team to create tasks.</span>
            ) : (
              <span>Create your first task via the <strong>New Task</strong></span>
            )}
          </div>
        </div>
      )}
      {/* Page titles and filters */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            {!isCreatingTask ? (
              <>
                <h1 className="text-gray-900 dark:text-gray-900 m-0 text-2xl font-bold select-none">
                  {'Auto Pipe'}
                </h1>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-gray-700 dark:text-gray-700 mb-0 select-none">
                    {'Automation Data Pipeline Management'}
                  </p>
                  <div className="group relative flex-shrink-0">
                    <HelpCircle className="w-4 h-4 text-gray-400 dark:text-gray-500 cursor-help" />
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none absolute left-1/2 -translate-x-1/2 top-6 z-10 w-80 rounded-md bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-900 text-xs p-3 shadow-lg">
                      Auto Pipe is the automated execution center for scheduled raw-data pipelines. Create or activate tasks, monitor real-time progress per app, and review execution diagnostics from duration and mode details. Running tasks update continuously and can be paused, resumed, or restarted while keeping account-level filters and task scopes aligned with your selected team context.
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-6 min-w-0">
                <h1 
                  onClick={cancelCreateTask}
                  className="text-gray-700 dark:text-gray-700 m-0 text-2xl font-bold select-none cursor-pointer border-b-2 border-transparent pb-1 transition-all duration-200 hover:border-gray-500"
                >
                  Auto Pipe
                </h1>
                <div className="flex items-center gap-2 border-b-2 border-gray-500 pb-1 transition-colors duration-200 min-w-0">
                  <span className="text-2xl font-bold text-gray-700 select-none">
                    Create New Task
                  </span>
                </div>
                <div
                  className="overflow-hidden flex-shrink-0 transition-[width,opacity] duration-300 ease-out"
                  style={{
                    width: isFormComplete ? 40 : 0,
                    opacity: isFormComplete ? 1 : 0,
                    pointerEvents: isFormComplete ? 'auto' : 'none',
                  }}
                  aria-hidden={!isFormComplete}
                >
                  <button
                    type="button"
                    onClick={createNewTask}
                    disabled={!isFormComplete || isCreatingActiveLoading}
                    className="h-10 w-10 rounded-md bg-transparent border border-gray-900 text-gray-900 select-none flex items-center justify-center flex-shrink-0 transition-colors duration-200 hover:bg-gray-100 active:bg-gray-200/80 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Create&Active"
                  >
                    {isCreatingActiveLoading ? (
                      <div className="w-3 h-3 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <VscTarget size={16} />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
          {!isCreatingTask && (
            <div className="flex gap-3 items-center">
              {/* Account filter */}
              <div className="select-wrapper account-filter-wrapper" ref={accountFilterRef} style={{ width: '190px' }}>
                <button
                  className={`select-button ${activeDropdown === 'account' ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown('account');
                  }}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {accountFilter === 'all' ? (
                      'Account Filter'
                    ) : (
                      <>
                        {getAccountIcon(accountFilter)}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>
                          {getAccountLabel(accountFilter)}
                        </span>
                      </>
                    )}
                  </span>
                  {activeDropdown === 'account' ? (
                    <VscListFlat size={12} className="select-arrow open" />
                  ) : (
                    <VscListSelection size={12} className="select-arrow" />
                  )}
                </button>
                {isTopFilterDropdownVisible('account') && (
                  <div className={`select-dropdown ${activeDropdown === 'account' ? 'show' : ''}`}>
                    <div 
                      className={`select-option ${accountFilter === 'all' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAccountFilter('all');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <VscSymbolKeyword size={14} className="option-icon" />
                      All Accounts
                    </div>
                    {accountLoading ? (
                      <div 
                        className="select-option" 
                        style={{ 
                          color: '#999', 
                          fontStyle: 'italic',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}
                      >
                        正在加载账户数据...
                      </div>
                    ) : accountError ? (
                      <div 
                        className="select-option" 
                        style={{ 
                          color: '#ff4d4f', 
                          fontStyle: 'italic',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}
                      >
                        加载账户数据失败: {accountError}
                      </div>
                    ) : getTaskAccountConfigs().length > 0 ? getTaskAccountConfigs().map(account => (
                      <div 
                        key={account.id}
                        className={`select-option ${accountFilter === account.id ? 'selected' : ''}`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setAccountFilter(account.id);
                          closeAllDropdowns();
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}
                      >
                        <div className="account-option-content">
                          {account.custom_icon ? (
                            <img 
                              src={account.custom_icon} 
                              alt={account.account_name}
                              className="account-option-logo"
                            />
                          ) : (
                            <div className="account-option-logo-placeholder">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" fill="rgba(114, 46, 209, 0.1)" stroke="rgba(114, 46, 209, 0.3)" strokeWidth="1"/>
                                <text x="12" y="16" textAnchor="middle" fontSize="10" fill="rgba(114, 46, 209, 0.6)" fontFamily="Arial, sans-serif">
                                  {account.account_type?.charAt(0) || 'A'}
                                </text>
                              </svg>
                            </div>
                          )}
                          <div className="account-option-details">
                            <span className="account-option-name">{account.account_name}</span>
                            <span className="account-option-type">
                              {account.account_type === 'PID' ? 'Ad Network | PID' : 
                               account.account_type === 'PRT' ? 'Agency Account | PRT' : 
                               account.account_type}
                            </span>
                          </div>
                        </div>
                      </div>
                    )) : (
                      <div 
                        className="select-option" 
                        style={{ 
                          color: '#8c8c8c', 
                          fontStyle: 'italic',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}
                      >
                        No accounts with tasks
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* status filter */}
              <div className="select-wrapper" ref={statusFilterRef} style={{ width: '130px' }}>
                <button
                  className={`select-button ${activeDropdown === 'status' ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown('status');
                  }}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {statusFilter === 'all' ? (
                      'Status'
                    ) : (
                      <>
                        {getStatusIcon(statusFilter)}
                        {getStatusText(statusFilter)}
                      </>
                    )}
                  </span>
                  {activeDropdown === 'status' ? (
                    <VscListFlat size={12} className="select-arrow open" />
                  ) : (
                    <VscListSelection size={12} className="select-arrow" />
                  )}
                </button>
                {isTopFilterDropdownVisible('status') && (
                  <div className={`select-dropdown ${activeDropdown === 'status' ? 'show' : ''}`}>
                    <div 
                      className={`select-option ${statusFilter === 'all' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusFilter('all');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <VscSymbolKeyword size={14} className="option-icon" />
                      {'All Status'}
                    </div>
                    <div 
                      className={`select-option ${statusFilter === 'running' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusFilter('running');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <VscPulse size={14} className="option-icon" />
                      {'Running'}
                    </div>
                    <div 
                      className={`select-option ${statusFilter === 'paused' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusFilter('paused');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <VscRunErrors size={14} className="option-icon" />
                      {'Paused'}
                    </div>
                    <div 
                      className={`select-option ${statusFilter === 'warning' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusFilter('warning');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <MdWarningAmber size={14} className="option-icon" />
                      {'Warning'}
                    </div>
                    <div 
                      className={`select-option ${statusFilter === 'completed' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setStatusFilter('completed');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <VscRunAllCoverage size={14} className="option-icon" />
                      {'Completed'}
                    </div>
                  </div>
                )}
              </div>

              {/* Type filter */}
              <div className="select-wrapper" ref={typeFilterRef} style={{ width: '160px' }}>
                <button
                  className={`select-button ${activeDropdown === 'type' ? 'active' : ''}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDropdown('type');
                  }}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {typeFilter === 'all' ? (
                      'Data Type'
                    ) : (
                      <>
                        {getTypeIcon(typeFilter)}
                        {getTypeLabel(typeFilter)}
                      </>
                    )}
                  </span>
                  {activeDropdown === 'type' ? (
                    <VscListFlat size={12} className="select-arrow open" />
                  ) : (
                    <VscListSelection size={12} className="select-arrow" />
                  )}
                </button>
                {isTopFilterDropdownVisible('type') && (
                  <div className={`select-dropdown ${activeDropdown === 'type' ? 'show' : ''}`}>
                    <div 
                      className={`select-option ${typeFilter === 'all' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTypeFilter('all');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <VscSymbolKeyword size={14} className="option-icon" />
                      All Type
                    </div>
                    <div 
                      className={`select-option ${typeFilter === 'install_pb' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTypeFilter('install_pb');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <MdDownloading size={14} className="option-icon" />
                      Install-PB
                    </div>
                    <div 
                      className={`select-option ${typeFilter === 'event_pb' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTypeFilter('event_pb');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <MdDataSaverOn size={14} className="option-icon" />
                      Event-PB
                    </div>
                    <div 
                      className={`select-option ${typeFilter === 'install_rtpb' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTypeFilter('install_rtpb');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <MdDownloading size={14} className="option-icon" />
                      Install-RTPB
                    </div>
                    <div 
                      className={`select-option ${typeFilter === 'event_rtpb' ? 'selected' : ''}`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setTypeFilter('event_rtpb');
                        closeAllDropdowns();
                      }}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <MdDonutLarge size={14} className="option-icon" />
                      Event-RTPB
                    </div>
                  </div>
                )}
              </div>

              {/* Action button group */}
              <div className="button-group">
                <button 
                  className={`action-button primary-button${showEmptyTaskHint && !newTaskDisabled ? ' new-task-empty-highlight' : ''}`}
                  onClick={startCreateTask}
                  disabled={newTaskDisabled}
                  title={newTaskDisabled ? 'Switch to Super Admin team to create tasks' : undefined}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    ...(newTaskDisabled ? { opacity: 0.7, cursor: 'not-allowed' } : {})
                  }}
                >
                  <VscTarget size={14} className="button-icon" />
                  {'New Task'}
                </button>
                <button 
                  className={`action-button secondary-button ${refreshButtonAnimate ? 'refresh-button-animate' : ''}`}
                  onClick={refreshTasks}
                  disabled={tasksLoading}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    opacity: tasksLoading ? 0.6 : 1
                  }}
                >
                  <RefreshCw size={14} className="button-icon" style={{ 
                    animation: tasksLoading ? 'spin 1s linear infinite' : 'none' 
                  }} />
                  {'Refresh'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Search and Filters - Custom CSS Styles */}
        {isCreatingTask ? (
          /*Task creation filter - no outer container wrapper*/
          <div ref={searchContainerRef} className="mb-6 min-w-0 max-w-full">
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              justifyContent: 'flex-start',
              flexWrap: 'nowrap',
              width: '100%',
              maxWidth: '100%',
              minWidth: 0,
            }}>
              {/* Account filter */}
              <div className="select-wrapper account-filter-wrapper" style={{ flex: '0 1 176px', minWidth: 0, width: '176px', maxWidth: '100%' }}>
                <button
                  className="select-button"
                  onClick={() => setActiveDropdown(activeDropdown === 'account' ? null : 'account')}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {!newTaskForm.accountId ? (
                      'Account'
                    ) : (
                      <>
                        {getAccountIcon(newTaskForm.accountId)}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '84px' }}>
                          {getAccountLabel(newTaskForm.accountId)}
                        </span>
                      </>
                    )}
                  </span>
                  {activeDropdown === 'account' ? (
                    <VscListFlat size={12} className="select-arrow open" />
                  ) : (
                    <VscListSelection size={12} className="select-arrow" />
                  )}
                </button>
                {activeDropdown === 'account' && (
                  <div className="select-dropdown show">
                    {accountConfigs.length > 0 ? (
                      accountConfigs.map(account => (
                        <div key={account.id} className="select-option" onClick={() => {
                          setNewTaskForm(prev => ({ ...prev, accountId: account.id }));
                          setActiveDropdown(null);
                        }}>
                          <div className="account-option-content">
                            {account.custom_icon ? (
                              <img 
                                src={account.custom_icon} 
                                alt={account.account_name}
                                className="account-option-logo"
                                style={{ pointerEvents: 'none' }}
                                draggable={false}
                              />
                            ) : (
                              <div className="account-option-logo-placeholder">
                                <VscAccount size={12} />
                              </div>
                            )}
                            <div className="account-option-details">
                              <div className="account-option-name">{account.account_name}</div>
                              <div className="account-option-type">{account.account_type}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div
                        className="select-option"
                        style={{
                          color: '#6b7280',
                          fontStyle: 'italic',
                          cursor: 'default',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none',
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        No accounts available
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* App filter */}
              <div className="select-wrapper" style={{ flex: '0 1 104px', minWidth: 0, width: '104px', maxWidth: '100%' }}>
                <button
                  className="select-button"
                  onClick={() => setActiveDropdown(activeDropdown === 'appType' ? null : 'appType')}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                    {newTaskForm.appType ? (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                          {getAppTypeIcon(newTaskForm.appType)}
                        </span>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {newTaskForm.appType === 'ios' ? 'IOS' : newTaskForm.appType === 'android' ? 'Android' : newTaskForm.appType === 'both' ? 'Bundle' : newTaskForm.appType}
                        </span>
                      </>
                    ) : (
                      'App Type'
                    )}
                  </span>
                  {activeDropdown === 'appType' ? (
                    <VscListFlat size={12} className="select-arrow open" />
                  ) : (
                    <VscListSelection size={12} className="select-arrow" />
                  )}
                </button>
                {activeDropdown === 'appType' && (
                  <div className="select-dropdown show">
                    <div className="select-option" onClick={() => {
                      setNewTaskForm(prev => ({ ...prev, appType: 'both' }));
                      setActiveDropdown(null);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getAppTypeIcon('both')}
                        <span>Bundle</span>
                      </div>
                    </div>
                    <div className="select-option" onClick={() => {
                      setNewTaskForm(prev => ({ ...prev, appType: 'ios' }));
                      setActiveDropdown(null);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getAppTypeIcon('ios')}
                        <span>IOS</span>
                      </div>
                    </div>
                    <div className="select-option" onClick={() => {
                      setNewTaskForm(prev => ({ ...prev, appType: 'android' }));
                      setActiveDropdown(null);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getAppTypeIcon('android')}
                        <span>Android</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Data Type filter */}
              <div className="select-wrapper" style={{ flex: '0 1 148px', minWidth: 0, width: '148px', maxWidth: '100%' }}>
                <button
                  className="select-button"
                  onClick={() => setActiveDropdown(activeDropdown === 'taskType' ? null : 'taskType')}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {newTaskForm.type ? (
                      <>
                        {getTypeIcon(newTaskForm.type)}
                        <span>{getTypeLabel(newTaskForm.type)}</span>
                      </>
                    ) : (
                      'Data Type'
                    )}
                  </span>
                  {activeDropdown === 'taskType' ? (
                    <VscListFlat size={12} className="select-arrow open" />
                  ) : (
                    <VscListSelection size={12} className="select-arrow" />
                  )}
                </button>
                {activeDropdown === 'taskType' && (
                  <div className="select-dropdown show">
                    <div className="select-option" onClick={() => {
                      setNewTaskForm(prev => ({ ...prev, type: 'install_pb' }));
                      setActiveDropdown(null);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getTypeIcon('install_pb')}
                        <span>Install-PB</span>
                      </div>
                    </div>
                    <div className="select-option" onClick={() => {
                      setNewTaskForm(prev => ({ ...prev, type: 'event_pb' }));
                      setActiveDropdown(null);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getTypeIcon('event_pb')}
                        <span>Event-PB</span>
                      </div>
                    </div>
                    <div className="select-option" onClick={() => {
                      setNewTaskForm(prev => ({ ...prev, type: 'install_rtpb' }));
                      setActiveDropdown(null);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getTypeIcon('install_rtpb')}
                        <span>Install-RTPB</span>
                      </div>
                    </div>
                    <div className="select-option" onClick={() => {
                      setNewTaskForm(prev => ({ ...prev, type: 'event_rtpb' }));
                      setActiveDropdown(null);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getTypeIcon('event_rtpb')}
                        <span>Event-RTPB</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Data Pointer filter */}
              <div className="select-wrapper" style={{ flex: '0 1 168px', minWidth: 0, width: '168px', maxWidth: '100%' }}>
                <button
                  className="select-button"
                  onClick={() => setActiveDropdown(activeDropdown === 'dataPointer' ? null : 'dataPointer')}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {newTaskForm.dataPointer ? (
                      <>
                        {newTaskForm.dataPointer === 'Daily Execution' ? <BsRepeat1 size={12} /> : <Bs1Square size={12} />}
                        <span>{newTaskForm.dataPointer}</span>
                      </>
                    ) : (
                      'Data Pointer'
                    )}
                  </span>
                  {activeDropdown === 'dataPointer' ? (
                    <VscListFlat size={12} className="select-arrow open" />
                  ) : (
                    <VscListSelection size={12} className="select-arrow" />
                  )}
                </button>
                {activeDropdown === 'dataPointer' && (
                  <div className="select-dropdown show">
                    <div className="select-option" onClick={() => {
                      setNewTaskForm(prev => ({ 
                        ...prev, 
                        dataPointer: 'Daily Execution',
                        selectedTime: {
                          hours: 0,
                          minutes: 0,
                          seconds: 0
                        }
                      }));
                      setActiveDropdown(null);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <BsRepeat1 size={12} />
                        <span>Daily Execution</span>
                      </div>
                    </div>
                    <div className="select-option" onClick={() => {
                      setNewTaskForm(prev => ({ ...prev, dataPointer: 'Single Execution' }));
                      setActiveDropdown(null);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bs1Square size={12} />
                        <span>Single Execution</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Time picker - only shown during Daily Execution */}
              {newTaskForm.dataPointer === 'Daily Execution' && (
                <div className="relative min-w-0 shrink" style={{ flex: '0 1 168px', maxWidth: '100%' }} data-time-picker>
                <div 
                  className="flex items-center gap-1.5 px-3 h-10 w-full min-w-0 bg-gray-100 border border-gray-200 rounded-md font-mono text-sm text-gray-700 select-none cursor-pointer transition-all duration-200 hover:bg-gray-50 hover:border-gray-400"
                  onClick={() => setActiveDropdown(activeDropdown === 'timePicker' ? null : 'timePicker')}
                >
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <span className="text-[10px] text-gray-500 leading-none">Hour</span>
                    <span className="text-xs font-bold leading-none">
                      {newTaskForm.selectedTime.hours.toString().padStart(2, '0')}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs flex-shrink-0">:</span>
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <span className="text-[10px] text-gray-500 leading-none">Minute</span>
                    <span className="text-xs font-bold leading-none">
                      {newTaskForm.selectedTime.minutes.toString().padStart(2, '0')}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs flex-shrink-0">:</span>
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <span className="text-[10px] text-gray-500 leading-none">Second</span>
                    <span className="text-xs font-bold leading-none">
                      {newTaskForm.selectedTime.seconds.toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
                
                  {activeDropdown === 'timePicker' && (
                    <div 
                      className="absolute top-full left-0 right-0 bg-white z-[1000] mt-1 p-2 rounded-md border border-gray-200 shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex">
                        {/* hour selection */}
                        <div className="flex-1 text-center">
                          <div className="text-[10px] text-gray-500 mb-1 select-none">Hours</div>
                          <div className="time-picker-scroll max-h-[120px] overflow-y-auto">
                            {generateTimeOptions('hours').map(hour => (
                              <div
                                key={hour}
                                className={`px-2 py-1 text-xs cursor-pointer rounded-sm select-none transition-colors ${
                                  newTaskForm.selectedTime.hours === hour 
                                    ? 'bg-gray-200 text-gray-900' 
                                    : 'text-gray-700 hover:bg-gray-100'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNewTaskForm(prev => ({ ...prev, selectedTime: { ...prev.selectedTime, hours: hour } }));
                                }}
                              >
                                {hour.toString().padStart(2, '0')}
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* minute selection */}
                        <div className="flex-1 text-center">
                          <div className="text-[10px] text-gray-500 mb-1 select-none">Minutes</div>
                          <div className="time-picker-scroll max-h-[120px] overflow-y-auto">
                            {generateTimeOptions('minutes').map(minute => (
                              <div
                                key={minute}
                                className={`px-2 py-1 text-xs cursor-pointer rounded-sm select-none transition-colors ${
                                  newTaskForm.selectedTime.minutes === minute 
                                    ? 'bg-gray-200 text-gray-900' 
                                    : 'text-gray-700 hover:bg-gray-100'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNewTaskForm(prev => ({ ...prev, selectedTime: { ...prev.selectedTime, minutes: minute } }));
                                }}
                              >
                                {minute.toString().padStart(2, '0')}
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {/* seconds to choose */}
                        <div className="flex-1 text-center">
                          <div className="text-[10px] text-gray-500 mb-1 select-none">Seconds</div>
                          <div className="time-picker-scroll max-h-[120px] overflow-y-auto">
                            {generateTimeOptions('seconds').map(second => (
                              <div
                                key={second}
                                className={`px-2 py-1 text-xs cursor-pointer rounded-sm select-none transition-colors ${
                                  newTaskForm.selectedTime.seconds === second 
                                    ? 'bg-gray-200 text-gray-900' 
                                    : 'text-gray-700 hover:bg-gray-100'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNewTaskForm(prev => ({ ...prev, selectedTime: { ...prev.selectedTime, seconds: second } }));
                                }}
                              >
                                {second.toString().padStart(2, '0')}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
              )}

              {/* Date picker - only displayed when Single Execution */}
              {newTaskForm.dataPointer === 'Single Execution' && (
                <div className="relative min-w-0 shrink" style={{ flex: '0 1 168px', maxWidth: '100%' }} data-date-picker>
                  <div 
                    className="flex items-center gap-1.5 px-3 h-10 w-full min-w-0 overflow-hidden bg-gray-100 border border-gray-200 rounded-md text-sm font-medium text-gray-700 select-none cursor-pointer transition-all duration-200 hover:bg-gray-50 hover:border-gray-400"
                    onClick={openDatePicker}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                      <span className="text-[10px] text-gray-500 flex-1 min-w-0 truncate" title="Start Date To Yesterday">
                        Start Date To Yesterday
                      </span>
                      <span className="text-xs font-bold shrink-0 tabular-nums">
                        {newTaskForm.selectedDate.toLocaleDateString('en-US', {
                          month: '2-digit',
                          day: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                  
                  {datePickerOpen && (
                    <div 
                      className="absolute top-full left-0 right-0 bg-white z-[1000] mt-1 p-2 rounded-md border border-gray-300 shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-xs text-gray-500 mb-2 text-center flex items-center justify-between">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            changeMonth('prev');
                          }}
                          className="bg-transparent border-none cursor-pointer p-1 rounded-sm flex items-center justify-center text-sm text-gray-500 hover:bg-gray-100 transition-colors"
                        >
                          ←
                        </button>
                        <span className="select-none">
                          {new Date(currentYear, currentMonth).toLocaleDateString('en-US', { 
                            month: 'long' 
                          })}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            changeMonth('next');
                          }}
                          className="bg-transparent border-none cursor-pointer p-1 rounded-sm flex items-center justify-center text-sm text-gray-500 hover:bg-gray-100 transition-colors"
                        >
                          →
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-0.5">
                        {/* week title */}
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                          <div key={day} className="text-center text-[10px] text-gray-500 p-1 select-none">
                            {day}
                          </div>
                        ))}
                        {/* date grid */}
                        {Array.from({ length: 35 }, (_, i) => {
                          const firstDay = new Date(currentYear, currentMonth, 1);
                          const startDate = new Date(firstDay);
                          startDate.setDate(startDate.getDate() - firstDay.getDay());
                          const currentDate = new Date(startDate);
                          currentDate.setDate(startDate.getDate() + i);
                          
                          const isCurrentMonth = currentDate.getMonth() === currentMonth;
                          const isSelected = currentDate.toDateString() === newTaskForm.selectedDate.toDateString();
                          const isToday = currentDate.toDateString() === new Date().toDateString();
                          
                          // Date restriction: You can only select yesterday and before, and within the range of 3 months
                          const yesterday = new Date();
                          yesterday.setDate(yesterday.getDate() - 1);
                          yesterday.setHours(23, 59, 59, 999); // Set to yesterday's end time
                          
                          const threeMonthsAgo = new Date();
                          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                          threeMonthsAgo.setHours(0, 0, 0, 0); // Set to start time 3 months ago
                          
                          const isDisabled = currentDate > yesterday || currentDate < threeMonthsAgo;
                          
                          return (
                            <div
                              key={i}
                              className={`text-center text-[11px] p-1 rounded-sm select-none transition-colors ${
                                isDisabled 
                                  ? 'cursor-not-allowed text-gray-300 opacity-50 line-through' 
                                  : isSelected
                                    ? 'cursor-pointer bg-gray-800 text-white'
                                    : isToday
                                      ? 'cursor-pointer border border-gray-700 font-bold text-gray-700 hover:bg-gray-100'
                                      : isCurrentMonth
                                        ? 'cursor-pointer text-gray-700 hover:bg-gray-100'
                                        : 'cursor-pointer text-gray-400 hover:bg-gray-100'
                              }`}
                              onClick={() => {
                                if (!isDisabled) {
                                setNewTaskForm(prev => ({ ...prev, selectedDate: currentDate }));
                                setDatePickerOpen(false);
                                }
                              }}
                            >
                              {currentDate.getDate()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* App selector - displayed based on App Type, placed between the time/date selector and the Create button */}
            {newTaskForm.appType && (
                <div className="flex items-center gap-1.5 min-w-0" style={{ flex: '1 1 0', flexWrap: 'nowrap' }}>
                  {/* iOS App selector - displayed when Bundle is displayed, or when appType is ios */}
                {(newTaskForm.appType === 'both' || newTaskForm.appType === 'ios') && (
                    <div
                      className="relative min-w-0"
                      style={{
                        minWidth: newTaskForm.appType === 'both' ? '100px' : '120px',
                        maxWidth: '100%',
                        flex: '1 1 0'
                      }}
                    >
                      <div 
                        className="flex items-center justify-center h-10 px-2 min-w-0 bg-white rounded-md cursor-pointer transition-all duration-200 select-none hover:bg-blue-50 app-selector-dotted-border"
                  onClick={() => handleAppSelectorOpen('IOS')}
                      >
                        <div className="flex items-center justify-center gap-1.5 min-w-0 w-full text-sm font-medium">
                    {newTaskForm.iosApp ? (
                      <>
                        <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                          {newTaskForm.iosApp.icon_url ? (
                            <img
                              src={newTaskForm.iosApp.icon_url}
                              alt={newTaskForm.iosApp.app_name}
                              className="w-full h-full object-cover absolute top-0 left-0"
                              onError={(e) => {
                                // When the icon loading fails, hide the img and display the default icon
                                const img = e.target as HTMLImageElement;
                                img.style.display = 'none';
                                const container = img.parentElement;
                                if (container) {
                                  const defaultIcon = container.querySelector('.default-app-icon') as HTMLElement;
                                  if (defaultIcon) {
                                    defaultIcon.style.display = 'flex';
                                  }
                                }
                              }}
                            />
                          ) : null}
                          <div 
                            className="default-app-icon w-full h-full flex items-center justify-center absolute top-0 left-0"
                            style={{
                              display: newTaskForm.iosApp.icon_url ? 'none' : 'flex',
                              background: 'linear-gradient(to bottom right, #60a5fa, #a78bfa)',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '600',
                              color: '#ffffff'
                            }}
                          >
                            {newTaskForm.iosApp.app_name ? newTaskForm.iosApp.app_name.charAt(0).toUpperCase() : 'A'}
                          </div>
                        </div>
                              <span
                                className="whitespace-nowrap overflow-hidden text-ellipsis text-gray-700 text-center block"
                                style={{
                                  maxWidth: 'calc(100% - 24px)',
                                  minWidth: 0
                                }}
                              >
                                {newTaskForm.iosApp.app_name}
                              </span>
                      </>
                    ) : (
                      <>
                              <VscDiffAdded size={16} className="text-gray-700 flex-shrink-0" />
                              <span className="text-gray-700">IOS App</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
                )}

                  {/* Android App selector - displayed when Bundle is displayed, or when appType is android */}
                {(newTaskForm.appType === 'both' || newTaskForm.appType === 'android') && (
                    <div
                      className="relative min-w-0"
                      style={{
                        minWidth: newTaskForm.appType === 'both' ? '100px' : '120px',
                        maxWidth: '100%',
                        flex: '1 1 0'
                      }}
                    >
                      <div 
                        className="flex items-center justify-center h-10 px-2 min-w-0 bg-white rounded-md cursor-pointer transition-all duration-200 select-none hover:bg-green-50 app-selector-dotted-border"
                  onClick={() => handleAppSelectorOpen('Android')}
                      >
                        <div className="flex items-center justify-center gap-1.5 min-w-0 w-full text-sm font-medium">
                    {newTaskForm.androidApp ? (
                      <>
                        <div className="w-5 h-5 rounded overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                          {newTaskForm.androidApp.icon_url ? (
                            <img
                              src={newTaskForm.androidApp.icon_url}
                              alt={newTaskForm.androidApp.app_name}
                              className="w-full h-full object-cover absolute top-0 left-0"
                              onError={(e) => {
                                // When the icon loading fails, hide the img and display the default icon
                                const img = e.target as HTMLImageElement;
                                img.style.display = 'none';
                                const container = img.parentElement;
                                if (container) {
                                  const defaultIcon = container.querySelector('.default-app-icon') as HTMLElement;
                                  if (defaultIcon) {
                                    defaultIcon.style.display = 'flex';
                                  }
                                }
                              }}
                            />
                          ) : null}
                          <div 
                            className="default-app-icon w-full h-full flex items-center justify-center absolute top-0 left-0"
                            style={{
                              display: newTaskForm.androidApp.icon_url ? 'none' : 'flex',
                              background: 'linear-gradient(to bottom right, #60a5fa, #a78bfa)',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '600',
                              color: '#ffffff'
                            }}
                          >
                            {newTaskForm.androidApp.app_name ? newTaskForm.androidApp.app_name.charAt(0).toUpperCase() : 'A'}
                          </div>
                        </div>
                              <span
                                className="whitespace-nowrap overflow-hidden text-ellipsis text-gray-700 text-center block"
                                style={{
                                  maxWidth: 'calc(100% - 24px)',
                                  minWidth: 0
                                }}
                              >
                                {newTaskForm.androidApp.app_name}
                              </span>
                      </>
                    ) : (
                      <>
                              <VscDiffAdded size={16} className="text-gray-700 flex-shrink-0" />
                              <span className="text-gray-700">Android App</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
                )}
              </div>
            )}

            </div>
          </div>
        ) : (
          /*Unified Containers: Search Controls, Counters, and Charts*/
          <div className="auto-pipe-search-container" ref={searchContainerRef}>
            {/* Search input box and chart control - same row layout */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              {/* Search input box - width limited to right edge of counter */}
              <div className="search-input-wrapper" style={{ width: '33.33%', maxWidth: '300px' }}>
              <Search className="search-input-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Focus on apps"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}
              />
            </div>

              {/* Chart control - upper right corner */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'nowrap' }}>
                {/* Time Range */}
                <div className="chart-control-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '70px' }}>
                  <div className="chart-control-label">Time Range</div>
                  <div className="chart-time-range-select-wrapper" ref={timeRangeDropdownRef} style={{ width: '70px' }}>
                    <button
                      className={`chart-time-range-select-button ${timeRangeDropdownOpen ? 'active' : ''}`}
                      onClick={() => setTimeRangeDropdownOpen(!timeRangeDropdownOpen)}
                      style={{ width: '100%' }}
                    >
                      <span>{timeRange === 3 ? '3D' : timeRange === 7 ? '7D' : timeRange === 15 ? '15D' : '30D'}</span>
                      <RiArrowDownSLine className={`chart-time-range-select-arrow ${timeRangeDropdownOpen ? 'open' : ''}`} />
                    </button>
                    <div className={`chart-time-range-select-dropdown ${timeRangeDropdownOpen ? 'show' : ''}`} style={{ width: '70px', minWidth: '70px' }}>
                      {[3, 7, 15, 30].map((value) => (
                        <div
                          key={value}
                          className={`chart-time-range-select-option ${timeRange === value ? 'selected' : ''}`}
                          onClick={() => {
                            setTimeRange(value as 3 | 7 | 15 | 30);
                            setTimeRangeDropdownOpen(false);
                          }}
                        >
                          {value}D
          </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Data Tag - Horizontal Slider */}
                <div className="chart-control-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '176px', alignItems: 'center' }}>
                  <div className="chart-control-label" style={{ textAlign: 'center', width: '100%' }}>Data Tag</div>
                  <div className="chart-data-tag-slider-horizontal" style={{ width: '176px' }}>
                    <div className="chart-data-tag-slider-track-horizontal">
                      {/* White slider - only responsible for the movement effect */}
                      <div 
                        className="chart-data-tag-slider-thumb-horizontal"
                        style={{
                          transform: `translateX(${sliderPosition}px)`,
                          width: `${sliderWidth}px`
                        }}
                      />
                      {/* Option button - fixed width, not visible but takes up space */}
                      <button
                        className={`chart-data-tag-option-horizontal ${dataTag === 'TASK' ? 'active' : ''}`}
                        onClick={() => setDataTag('TASK')}
                        style={{ width: '58px', flex: '0 0 58px' }}
                      >
                        TASK
                      </button>
                      <button
                        className={`chart-data-tag-option-horizontal ${dataTag === 'ACCOUNT' ? 'active' : ''}`}
                        onClick={() => setDataTag('ACCOUNT')}
                        style={{ width: '78px', flex: '0 0 78px' }}
                      >
                        ACCOUNT
                      </button>
                      <button
                        className={`chart-data-tag-option-horizontal ${dataTag === 'TYPE' ? 'active' : ''}`}
                        onClick={() => setDataTag('TYPE')}
                        style={{ width: '58px', flex: '0 0 58px' }}
                      >
                        TYPE
                      </button>
                    </div>
                  </div>
                </div>

                {/* Chart Mode */}
                <div className="chart-control-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '146px', alignItems: 'center' }}>
                  <div className="chart-control-label" style={{ textAlign: 'center', width: '100%' }}>Chart Mode</div>
                  <div className="chart-control-buttons" style={{ display: 'flex', flexDirection: 'row', gap: '4px' }}>
                    <button
                      className={`chart-control-button ${chartMode === 'STACKED' ? 'active' : ''}`}
                      onClick={() => setChartMode('STACKED')}
                      style={{ width: '70px' }}
                    >
                      Stacked
                    </button>
                    <button
                      className={`chart-control-button ${chartMode === 'DIVERT' ? 'active' : ''}`}
                      onClick={() => setChartMode('DIVERT')}
                      style={{ width: '70px' }}
                    >
                      Divert
                    </button>
                  </div>
                </div>
              </div>
            </div>

        {/* Statistics area - unified container, three-line layout */}
        <div className="stats-section">
          <div className="stats-unified-container">
            <div className="stat-row">
              <div className="stat-icon-simple running">
                <VscPulse size={16} />
              </div>
              <div className="stat-content">
                <div 
                  className="stat-title"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  Running Tasks
                </div>
              </div>
              <div 
                className="stat-value running"
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '24px',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: '1'
                }}
              >
                {runningTasks}
              </div>
            </div>
            <div className="stat-row">
              <div className="stat-icon-simple paused">
                <VscRunErrors size={16} />
              </div>
              <div className="stat-content">
                <div 
                  className="stat-title"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  Paused Tasks
                </div>
              </div>
              <div 
                className="stat-value paused"
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '24px',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: '1'
                }}
              >
                {pausedTasks}
              </div>
            </div>
            <div className="stat-row">
              <div className="stat-icon-simple warning">
                <MdWarningAmber size={16} />
              </div>
              <div className="stat-content">
                <div 
                  className="stat-title"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  Warning Tasks
                </div>
              </div>
              <div 
                className="stat-value warning"
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '24px',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: '1'
                }}
              >
                {warningTasks}
              </div>
            </div>
            <div className="stat-row">
              <div className="stat-icon-simple completed">
                <VscRunAllCoverage size={16} />
              </div>
              <div className="stat-content">
                <div 
                  className="stat-title"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  Completed Tasks
                </div>
              </div>
              <div 
                className="stat-value completed"
                style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '24px',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: '1'
                }}
              >
                {completedTasks}
              </div>
            </div>
          </div>
          
          {/* Task statistics chart - placed to the right of the task counter */}
              <TaskStatisticsChart 
                tasks={allTasksForChart} 
                timeRange={timeRange} 
                dataTag={dataTag}
                chartMode={chartMode}
                accountConfigs={accountConfigs}
              />
        </div>
          </div>
        )}
      {/* Task List - Custom CSS Design */}
      <div 
        ref={tasksGridRef}
        className={`tasks-grid ${shouldAnimate ? 'tasks-grid-animate' : ''}`}
        style={{ 
          position: 'relative',
          gridTemplateColumns: `repeat(${taskGridColumns}, minmax(0, 1fr))`
        }}
        onAnimationEnd={(e) => {
          // After the animation ends, clean up the optimization properties related to the animation
          const target = e.currentTarget;
          if (target.classList.contains('tasks-grid-animate')) {
            target.classList.remove('tasks-grid-animate');
            target.style.willChange = 'auto';
          }
        }}
      >
        {/* Show skeleton screen while loading - check both tasksLoading and isFilterChanging */}
        {/* Also check ref to ensure that the skeleton screen can be displayed correctly even if the state has not been updated. */}
        {(tasksLoading || isFilterChanging || isFilterChangingRef.current) && (
          <>
            {Array.from({ length: skeletonCardCount }).map((_, index) => (
              <div key={`skeleton-${index}`} className="task-card-skeleton">
                {/* Mission head skeleton */}
                <div className="skeleton-header">
                  <div className="skeleton-account-info">
                    <div className="skeleton skeleton-icon" />
                    <div className="skeleton skeleton-account-name" />
                  </div>
                  <div className="skeleton skeleton-status" />
                </div>

                {/* Task label skeleton */}
                <div className="skeleton-tags">
                  <div className="skeleton skeleton-tag" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div className="skeleton skeleton-task-id" />
                    <div style={{ width: '24px', height: '24px' }} />
                    <div style={{ width: '24px', height: '24px' }} />
                  </div>
                </div>

                {/* Progress bar skeleton */}
                <div className="skeleton-progress">
                  <div className="skeleton skeleton-progress-bar" />
                  <div className="skeleton skeleton-progress-text" />
                </div>

                {/* App list skeleton */}
                <div className="skeleton-apps">
                  {Array.from({ length: 2 }).map((_, appIndex) => (
                    <div key={appIndex} className="skeleton-app-item">
                      <div className="skeleton skeleton-app-icon" />
                      <div className="skeleton-app-info">
                        <div className="skeleton skeleton-app-name" />
                        <div className="skeleton skeleton-app-progress" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Only display task cards in non-Loading state and when filter conditions are not changing */}
        {/* Also check ref to ensure that even if the state has not been updated, it can be judged correctly. */}
          {!tasksLoading && !isFilterChanging && !isFilterChangingRef.current && stableTaskCards.map((task, index) => (
          <div 
            key={task.id} 
            className="task-card"
            style={{
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              cursor: 'pointer'
            }} 
             onClick={(e) => {
               // If the click is not the pop-up menu button, arrow button and Duration&Mode button, then the card is stored
               const target = e.target as HTMLElement;
               if (!target.closest('[data-popup-trigger]') && !target.closest('[data-arrow-trigger]') && !target.closest('[data-duration-trigger]')) {
                setExpandedTasks(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(task.id);
                  return newSet;
                });
                // Also close popup menu
                setPopupTaskId(null);
              }
            }}>
            {/* Task header */}
            <div className="task-header" style={{
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none'
            }}>
              <div className="task-account-info" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                <div className="task-account-icon" style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}>
                  {(() => {
                    const account = getTaskAccount(task);
                    if (account?.custom_icon) {
                      return (
                        <img 
                          src={account.custom_icon} 
                          alt={account.account_name}
                          draggable={false}
                          style={{ 
                            width: '16px', 
                            height: '16px', 
                            objectFit: 'cover',
                            borderRadius: '3px',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                            pointerEvents: 'none'
                          }}
                        />
                      );
                    } else {
                      return (
                        <div style={{
                          width: '16px',
                          height: '16px',
                          background: 'linear-gradient(135deg, #722ed1, #531dab)',
                          borderRadius: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '8px',
                          color: 'white',
                          fontWeight: 'bold',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none',
                          pointerEvents: 'none'
                        }}>
                          {account?.account_type?.charAt(0) || 'A'}
                        </div>
                      );
                    }
                  })()}
                </div>
                <span className="task-account-name" style={{ 
                  fontSize: '16px', 
                  fontWeight: 'bold', 
                  color: '#000000',
                  lineHeight: '20px',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}>
                  {getTaskAccount(task)?.account_name || 'Unknown Account'}
                </span>
              </div>
              <div className={`task-status ${task.status}`} style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                {getStatusIcon(task.status)}
                <span style={{
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}>
                  {getStatusText(task.status)}
                </span>
              </div>
            </div>

            {/* Task label and task ID */}
            <div className="task-tags" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              justifyContent: 'space-between',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none'
            }}>
              <span className="task-tag type" style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                {getTypeIcon(task.type)}
                {getTypeLabel(task.type)}
              </span>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px'
              }}>
                <p className="task-description" style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '12px', 
                  color: '#666',
                  letterSpacing: '1px',
                  fontWeight: '500',
                  margin: 0,
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}>
                  {task.taskId}
                </p>
                <button
                  data-popup-trigger
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.style.backgroundColor = 'transparent';
                    copyTaskId(task.taskId);
                  }}
                  disabled={copyingTaskId === task.taskId}
                  style={{
                    padding: '4px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: copyingTaskId === task.taskId ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: '24px',
                    height: '24px',
                    pointerEvents: 'auto',
                    position: 'relative',
                    zIndex: 2,
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (copyingTaskId !== task.taskId && copySuccess !== task.taskId) {
                      e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  title={copySuccess === task.taskId ? 'Copied' : 'Copy Task ID'}
                >
                  {copyingTaskId === task.taskId ? (
                    <div style={{ 
                      width: '14px', 
                      height: '14px', 
                      border: '2px solid #e0e0e0',
                      borderTop: '2px solid #999',
                      borderRadius: '50%',
                      animation: 'copySpin 0.8s linear infinite'
                    }} />
                  ) : copySuccess === task.taskId ? (
                    <GoIssueClosed size={14} style={{ color: '#666', animation: 'fadeIn 0.3s ease-in-out' }} />
                  ) : (
                    <GoVersions size={14} style={{ color: '#666' }} />
                  )}
                </button>
                <div style={{ position: 'relative' }}>
                  <div 
                    data-arrow-trigger
                    onClick={(e) => {
                      e.stopPropagation();
                      // Toggle expanded state
                      setExpandedTasks(prev => {
                        const newSet = new Set(prev);
                        if (newSet.has(task.id)) {
                          newSet.delete(task.id);
                          // Close popup menu when collapsed
                          setPopupTaskId(null);
                        } else {
                          newSet.add(task.id);
                          // Show popup menu when expanded
                          setPopupTaskId(task.id);
                        }
                        return newSet;
                      });
                    }}
                    className="flex items-center justify-center w-6 h-6 bg-transparent text-gray-500 cursor-pointer rounded transition-colors duration-200 hover:text-gray-700 hover:bg-gray-100 select-none"
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}
                  >
                    {expandedTasks.has(task.id) ? (
                      <RiArrowUpSLine size={18} />
                    ) : (
                      <RiArrowDownSLine size={18} />
                    )}
                  </div>
                  
                  {/* Pop up card */}
                  {popupTaskId === task.id && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '28px',
                        right: '0',
                        background: '#ffffff',
                        border: '1px solid #d9d9d9',
                        borderRadius: '6px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                        zIndex: 1000,
                        width: '80px',
                        overflow: 'hidden',
                        willChange: 'auto',
                        backfaceVisibility: 'hidden',
                        transform: 'translateZ(0)'
                      }}
                    >
                      {/* Active/Pause option */}
                      <div 
                        style={{
                          padding: '8px 10px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#333',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          borderBottom: '1px solid #f0f0f0',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none',
                          lineHeight: '14px',
                          height: '30px',
                          letterSpacing: '0',
                          textRendering: 'geometricPrecision',
                          fontVariantNumeric: 'normal',
                          willChange: 'auto',
                          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
                          fontFeatureSettings: 'normal',
                          fontKerning: 'normal',
                          WebkitFontSmoothing: 'antialiased',
                          MozOsxFontSmoothing: 'grayscale',
                          boxSizing: 'border-box'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f5f5f5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
                          try {
                          const currentStatus = task.status;
                            const isSingleMode = task.dataPointer === 'Single Execution';
                          
                            
                            if (isSingleMode) {
                              // Single mode: Click Active to directly execute the task (can be executed repeatedly)
                          if (currentStatus === 'running') {
                                // If it is running, click Pause
                                const result = await updateTaskStatus(task.id, 'paused');
                                
                                if (result?.success) {
                                  updateLocalTaskStatus(task.id, 'paused');
                                  // Update local state immediately, use cache to avoid full refresh
                                  setTasks(prevTasks => {
                                    const updated = prevTasks.map(t => 
                                      t.id === task.id ? { ...t, status: 'paused' as const } : t
                                    );
                                    // Update cache
                                    const updatedTask = updated.find(t => t.id === task.id);
                                    if (updatedTask) {
                                      tasksCacheRef.current.set(task.id, updatedTask);
                                    }
                                    // Update cachedTasksRef synchronously to ensure that the UI immediately reflects status changes
                                    cachedTasksRef.current = updated.map((t) => ({
                                      ...t,
                                      status: t.status
                                    }));
                                    return updated;
                                  });
                                  // Trigger polling checks to ensure backend status is synchronized
                                  setPollingTrigger(prev => prev + 1);
                          } else {
                                }
                              } else {
                              // Whether it is paused, completed or warning, it can be re-executed
                              
                              // If activated from the warning state, update the original state and save it
                              if (currentStatus === 'warning') {
                                originalTaskStatusRef.current.set(task.id, 'running');
                              }
                              
                              // First update the local status to running, but do not reset the progress (the progress is controlled by the back-end database)
                              updateLocalTaskStatus(task.id, 'running');
                              
                              // Immediately update the tasks status, only update the status to running, and the progress is returned by the backend
                              // Don't hardcode progress, wait for the backend to return actual progress (either via polling or API response)
                              setTasks(prevTasks => {
                                const updated = prevTasks.map(t => 
                                  t.id === task.id ? { 
                                    ...t, 
                                    // Do not reset progress, keep current progress or wait for backend update
                                    // The progress will be fetched the actual value from the database by polling mechanism
                                    status: 'running' as const
                                    // The progress of apps is also returned by the backend and is not hard-coded here.
                                  } : t
                                );
                                // Update cache
                                const updatedTask = updated.find(t => t.id === task.id);
                                if (updatedTask) {
                                  tasksCacheRef.current.set(task.id, updatedTask);
                                }
                                // Update cachedTasksRef synchronously to ensure that the UI immediately reflects status changes
                                cachedTasksRef.current = updated.map((t) => ({
                                  ...t,
                                  status: t.status
                                }));
                                return updated;
                              });
                              
                              // Trigger polling checks immediately to ensure status and progress are updated in real time (get actual progress from database)
                              setPollingTrigger(prev => prev + 1);
                              
                              // Execute tasks asynchronously (without blocking the UI, executing in the background)
                              autopipeAxiosInstance.post(`/api/autopipe/tasks/${task.id}/execute`, {})
                              .then(async (response) => {
                                const result = response.data as ApiResponse;
                                if (result.success) {
                                  
                                  // After execution is completed, use the polling mechanism to check the task completion status, and then check the warning status
                                  const checkTaskCompletionAndWarning = async (attempt: number = 0) => {
                                    if (attempt > 20) {
                                      // Check up to 20 times (about 20 seconds), check directly after timeout
                                      console.log(`[AutoPipe] Task ${task.id} completion check timeout, checking warning status directly`);
                                      setTasks(prevTasks => {
                                        const currentTask = prevTasks.find(t => t.id === task.id);
                                        if (currentTask) {
                                          checkTaskWarningStatus(currentTask).then(updatedTask => {
                                            if (updatedTask.status !== currentTask.status) {
                                              setTasks(prevTasks2 => {
                                                const taskMap = new Map(prevTasks2.map(t => [t.id, t]));
                                                taskMap.set(updatedTask.id, updatedTask);
                                                return Array.from(taskMap.values());
                                              });
                                              tasksCacheRef.current.set(updatedTask.id, updatedTask);
                                            }
                                            setPollingTrigger(prev => prev + 1);
                                          });
                                        }
                                        return prevTasks;
                                      });
                                      return;
                                    }
                                    
                                    // Check task progress and status
                                    try {
                                      const progressResponse = await autopipeAxiosInstance.get(`/api/autopipe/tasks?page=1&pageSize=1&search=${task.taskId}`);
                                      const progressResult = progressResponse.data as ApiResponse<any[]>;
                                      
                                      if (progressResult.success && progressResult.data && progressResult.data.length > 0) {
                                        const taskData = progressResult.data[0];
                                        const taskProgress = taskData.progress || 0;
                                        const taskStatus = taskData.status;
                                        
                                        // If the task progress reaches 100% or the task is completed, check the warning status
                                        if (taskProgress >= 100 || taskData.status === 'completed') {
                                          console.log(`[AutoPipe] Task ${task.id} completed (progress: ${taskProgress}%), checking warning status`);
                                          setTasks(prevTasks => {
                                            const currentTask = prevTasks.find(t => t.id === task.id);
                                            if (currentTask) {
                                              checkTaskWarningStatus(currentTask).then(updatedTask => {
                                                if (updatedTask.status !== currentTask.status) {
                                                  console.log(`[AutoPipe] Task ${task.id} warning status updated: ${currentTask.status} -> ${updatedTask.status}`);
                                                  setTasks(prevTasks2 => {
                                                    const taskMap = new Map(prevTasks2.map(t => [t.id, t]));
                                                    taskMap.set(updatedTask.id, updatedTask);
                                                    return Array.from(taskMap.values());
                                                  });
                                                  tasksCacheRef.current.set(updatedTask.id, updatedTask);
                                                }
                                                setPollingTrigger(prev => prev + 1);
                                              });
                                            }
                                            return prevTasks;
                                          });
                                          return;
                                        }

                                        // Non-timeout type Warning does not continue to retry polling and remains in Warning state.
                                        if (taskStatus === 'warning') {
                                          const latestTask = tasksCacheRef.current.get(task.id);
                                          const isRetryable = warningRetryableRef.current.get(task.id) === true
                                            || isRetryableTimeoutError(
                                              latestTask ? parseErrorMessage(String((latestTask as any).error_message || '')) : ''
                                            );
                                          if (!isRetryable) {
                                            return;
                                          }
                                        }
                                      }
                                      
                                      // If the task has not been completed, continue polling and checking
                                      setTimeout(() => checkTaskCompletionAndWarning(attempt + 1), 1000);
                                    } catch (error) {
                                      console.warn(`[AutoPipe] Failed to check task completion:`, error);
                                      const errorText = String((error as any)?.message || (error as any)?.response?.data?.error || '');
                                      if (isRetryableTimeoutError(errorText)) {
                                        setTimeout(() => checkTaskCompletionAndWarning(attempt + 1), 1000);
                                      }
                                    }
                                  };
                                  
                                  // Start checking after a 2 second delay (give the task some execution time)
                                  setTimeout(() => checkTaskCompletionAndWarning(), 2000);
                                  
                                  // Trigger the polling check immediately to ensure that the status is updated in real time (polling will automatically update the status and does not require a complete refresh)
                                  setPollingTrigger(prev => prev + 1);
                                } else {
                                  console.error(`[AutoPipe] Failed to execute task: ${result.error || 'Unknown error'}`);
                                  // Execution fails, restoring local state but not hardcoding progress (get actual progress from backend)
                                  updateLocalTaskStatus(task.id, currentStatus);
                                  // Trigger polling to get backend actual status and progress
                                  setPollingTrigger(prev => prev + 1);
                                  // Don't hardcode the progress here, wait for the poll to get the actual value from the database
                                }
                              })
                              .catch(error => {
                                console.error(`[AutoPipe] Exception executing task:`, error);
                                // Execution fails, restoring local state but not hardcoding progress (get actual progress from backend)
                                updateLocalTaskStatus(task.id, currentStatus);
                                // Trigger polling to get backend actual status and progress
                                setPollingTrigger(prev => prev + 1);
                                // Don't hardcode the progress here, wait for the poll to get the actual value from the database
                              });
                              }
                            } else {
                              // Daily mode: switch status switch
                              const newStatus = currentStatus === 'running' ? 'paused' : 'running';
                              
                              const result = await updateTaskStatus(task.id, newStatus);
                              
                              if (result?.success) {
                                updateLocalTaskStatus(task.id, newStatus);
                                
                                // If the status changes to running (from warning/paused/completed to running), the task needs to be executed
                                if (newStatus === 'running' && (currentStatus === 'warning' || currentStatus === 'paused' || currentStatus === 'completed')) {
                                  
                                  // Update original state save
                                  originalTaskStatusRef.current.set(task.id, 'running');
                                  
                                  // Update local state immediately, use cache to avoid full refresh
                                  setTasks(prevTasks => {
                                    const updated = prevTasks.map(t => 
                                      t.id === task.id ? { ...t, status: 'running' as const } : t
                                    );
                                    // Update cache
                                    const updatedTask = updated.find(t => t.id === task.id);
                                    if (updatedTask) {
                                      tasksCacheRef.current.set(task.id, updatedTask);
                                    }
                                    // Update cachedTasksRef synchronously to ensure that the UI immediately reflects status changes
                                    cachedTasksRef.current = updated.map((t) => ({
                                      ...t,
                                      status: t.status as 'running' | 'paused' | 'completed' | 'warning'
                                    }));
                                    return updated;
                                  });
                                  
                                  // Execute tasks asynchronously (without blocking the UI, executing in the background)
                                  autopipeAxiosInstance.post(`/api/autopipe/tasks/${task.id}/execute`, {})
                                  .then(async (response) => {
                                    const executeResult = response.data as ApiResponse;
                                    if (executeResult.success) {
                                      
                                      // After execution is completed, use the polling mechanism to check the task completion status, and then check the warning status
                                      const checkTaskCompletionAndWarning = async (attempt: number = 0) => {
                                        if (attempt > 20) {
                                          // Check up to 20 times (about 20 seconds), check directly after timeout
                                          console.log(`[AutoPipe] Task ${task.id} completion check timeout, checking warning status directly`);
                                          setTasks(prevTasks => {
                                            const currentTask = prevTasks.find(t => t.id === task.id);
                                            if (currentTask) {
                                              checkTaskWarningStatus(currentTask).then(updatedTask => {
                                                if (updatedTask.status !== currentTask.status) {
                                                  setTasks(prevTasks2 => {
                                                    const taskMap = new Map(prevTasks2.map(t => [t.id, t]));
                                                    taskMap.set(updatedTask.id, updatedTask);
                                                    return Array.from(taskMap.values());
                                                  });
                                                  tasksCacheRef.current.set(updatedTask.id, updatedTask);
                                                }
                                                setPollingTrigger(prev => prev + 1);
                                              });
                                            }
                                            return prevTasks;
                                          });
                                          return;
                                        }
                                        
                                        // Check task progress and status
                                        try {
                                          const progressResponse = await autopipeAxiosInstance.get(`/api/autopipe/tasks?page=1&pageSize=1&search=${task.taskId}`);
                                          const progressResult = progressResponse.data as ApiResponse<any[]>;
                                          
                                          if (progressResult.success && progressResult.data && progressResult.data.length > 0) {
                                            const taskData = progressResult.data[0];
                                            const taskProgress = taskData.progress || 0;
                                            const taskStatus = taskData.status;
                                            
                                            // If the task progress reaches 100% or the task is completed, check the warning status
                                            if (taskProgress >= 100 || taskData.status === 'completed') {
                                              console.log(`[AutoPipe] Task ${task.id} completed (progress: ${taskProgress}%), checking warning status`);
                                              setTasks(prevTasks => {
                                                const currentTask = prevTasks.find(t => t.id === task.id);
                                                if (currentTask) {
                                                  checkTaskWarningStatus(currentTask).then(updatedTask => {
                                                    if (updatedTask.status !== currentTask.status) {
                                                      console.log(`[AutoPipe] Task ${task.id} warning status updated: ${currentTask.status} -> ${updatedTask.status}`);
                                                      setTasks(prevTasks2 => {
                                                        const taskMap = new Map(prevTasks2.map(t => [t.id, t]));
                                                        taskMap.set(updatedTask.id, updatedTask);
                                                        return Array.from(taskMap.values());
                                                      });
                                                      tasksCacheRef.current.set(updatedTask.id, updatedTask);
                                                    }
                                                    setPollingTrigger(prev => prev + 1);
                                                  });
                                                }
                                                return prevTasks;
                                              });
                                              return;
                                            }

                                            // Non-timeout type Warning does not continue to retry polling and remains in Warning state.
                                            if (taskStatus === 'warning') {
                                              const latestTask = tasksCacheRef.current.get(task.id);
                                              const isRetryable = warningRetryableRef.current.get(task.id) === true
                                                || isRetryableTimeoutError(
                                                  latestTask ? parseErrorMessage(String((latestTask as any).error_message || '')) : ''
                                                );
                                              if (!isRetryable) {
                                                return;
                                              }
                                            }
                                          }
                                          
                                          // If the task has not been completed, continue polling and checking
                                          setTimeout(() => checkTaskCompletionAndWarning(attempt + 1), 1000);
                                        } catch (error) {
                                          console.warn(`[AutoPipe] Failed to check task completion:`, error);
                                          const errorText = String((error as any)?.message || (error as any)?.response?.data?.error || '');
                                          if (isRetryableTimeoutError(errorText)) {
                                            setTimeout(() => checkTaskCompletionAndWarning(attempt + 1), 1000);
                                          }
                                        }
                                      };
                                      
                                      // Start checking after a 2 second delay (give the task some execution time)
                                      setTimeout(() => checkTaskCompletionAndWarning(), 2000);
                                      
                                      // Trigger polling checks immediately to ensure status updates in real time
                                      setPollingTrigger(prev => prev + 1);
                                    } else {
                                      console.error(`[AutoPipe] Failed to execute task: ${executeResult.error || 'Unknown error'}`);
                                      // Execution failed, restore local state
                                      updateLocalTaskStatus(task.id, currentStatus);
                                      // Trigger polling to get the actual status of the backend
                                      setPollingTrigger(prev => prev + 1);
                                    }
                                  })
                                  .catch(error => {
                                    console.error(`[AutoPipe] Exception executing task:`, error);
                                    // Execution failed, restore local state
                                    updateLocalTaskStatus(task.id, currentStatus);
                                    // Trigger polling to get the actual status of the backend
                                    setPollingTrigger(prev => prev + 1);
                                  });
                                } else {
                                  // If it is just paused (running -> paused), there is no need to execute the task
                                  // Update local state immediately, use cache to avoid full refresh
                                  setTasks(prevTasks => {
                                    const updated = prevTasks.map(t => 
                                      t.id === task.id ? { ...t, status: newStatus as 'running' | 'paused' | 'completed' | 'warning' } : t
                                    );
                                    // Update cache
                                    const updatedTask = updated.find(t => t.id === task.id);
                                    if (updatedTask) {
                                      tasksCacheRef.current.set(task.id, updatedTask);
                                    }
                                    // Update cachedTasksRef synchronously to ensure that the UI immediately reflects status changes
                                    cachedTasksRef.current = updated.map((t) => ({
                                      ...t,
                                      status: t.status as 'running' | 'paused' | 'completed' | 'warning'
                                    }));
                                    return updated;
                                  });
                                  // Trigger polling checks to ensure backend status is synchronized
                                  setPollingTrigger(prev => prev + 1);
                                }
                              } else {
                              }
                            }
                          } catch (error) {
                          } finally {
                          closePopup();
                          }
                        }}
                      >
                        {task.status === 'running' ? (
                          <>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '14px', height: '14px' }}>
                              <GoColumns size={14} />
                            </span>
                            <span style={{ display: 'inline-block', lineHeight: '14px', height: '14px', verticalAlign: 'top' }}>
                              Pause
                            </span>
                          </>
                        ) : (
                          <>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '14px', height: '14px' }}>
                              <GoFlame size={14} />
                            </span>
                            <span style={{ display: 'inline-block', lineHeight: '14px', height: '14px', verticalAlign: 'top' }}>
                              Active
                            </span>
                          </>
                        )}
                      </div>
                      
                      {/* Delete option */}
                      <div 
                        style={{
                          padding: '8px 10px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s ease',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#ff4d4f',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none',
                          lineHeight: '14px',
                          height: '30px',
                          letterSpacing: '0',
                          textRendering: 'geometricPrecision',
                          fontVariantNumeric: 'normal',
                          willChange: 'auto',
                          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif',
                          fontFeatureSettings: 'normal',
                          fontKerning: 'normal',
                          WebkitFontSmoothing: 'antialiased',
                          MozOsxFontSmoothing: 'grayscale',
                          boxSizing: 'border-box'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#fff2f0';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
                          // Show delete confirmation bubble
                          showDeleteConfirm(task.id);
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: '14px', height: '14px' }}>
                          <VscCloseAll size={14} />
                        </span>
                        <span style={{ display: 'inline-block', lineHeight: '14px', height: '14px', verticalAlign: 'top' }}>
                          Delete
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* App information and dynamic circular progress bar */}
            {task.apps && task.apps.length > 0 && (
              <div className="task-apps" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginTop: '12px',
                marginBottom: '12px',
                alignItems: 'flex-start',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                {task.apps.slice(0, 2).map((app, index) => {
                  // Use the independent progress of each app instead of the progress of the entire task
                  return (
                    <AppProgressComponent 
                      key={`${task.id}-${app.app_id}-${task.status}`} 
                      app={app} 
                      progress={app.progress || 0} 
                      status={task.status}
                      index={index}
                      taskId={task.id}
                      dataPointer={task.dataPointer}
                      startDate={task.startTime}
                      taskType={task.dataPointer === 'Daily Execution' ? 'daily' : 'single'}
                    />
                  );
                })}
              </div>
            )}


            {/* dividing line */}
            <hr className="task-divider" />

            {/* Mission information */}
            <div className="task-info" style={{
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none'
            }}>
              <div className="task-time-info" style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}>
                <div 
                  className="task-duration"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    position: 'relative'
                  }}
                >
                  <strong>{'Duration&Mode'}: </strong>
                  <button
                    data-duration-trigger
                    onClick={(e) => {
                      e.stopPropagation();
                      setDurationBubbleTaskId(durationBubbleTaskId === task.id ? null : task.id);
                    }}
                    style={{
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none',
                      padding: '2px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '16px',
                      height: '16px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    title="查看时间信息"
                  >
                    {getTaskDataPointer(task.id) === 'Daily Execution' ? (
                      <BsRepeat1 size={12} style={{ color: '#666' }} />
                    ) : (
                      <Bs1Square size={12} style={{ color: '#666' }} />
                    )}
                  </button>
                  
                  {/* Duration&Mode bubble */}
                  {durationBubbleTaskId === task.id && (
                    <div 
                      data-duration-bubble
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginBottom: '4px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #d1d5db',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                        zIndex: 1000,
                        minWidth: '160px',
                        fontSize: '12px',
                        lineHeight: '1.4'
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(() => {
                        const timeInfo = getTaskTimeInfo(task);
                        return (
                          <div>
                            <div style={{ fontWeight: 'bold', color: '#333', marginBottom: '4px' }}>
                              {timeInfo.type}
                            </div>
                            <div style={{ color: '#666' }}>
                              {timeInfo.type === 'Daily Execution' ? (
                                <>
                                  <div>{'Daily Execution Time'}: {timeInfo.date}</div>
                                </>
                              ) : (
                                <>
                                  <div>{'Start Date'}: {timeInfo.date}</div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
                <p 
                  className="task-time"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  <strong>{'Create Time'}: </strong>{formatTimeDisplay(task.createTime)}
                </p>
                <p 
                  className="task-latest-update"
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none'
                  }}
                >
                  <strong>{'Latest Update'}: </strong>{formatTimeDisplay(task.latestUpdateTime)}
                </p>
              </div>
              <div className="task-actions" style={{
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                width: 'auto',
                minWidth: '0'
              }}>
                <button 
                  className="task-action-button"
                  data-popup-trigger
                  onClick={async (e) => {
                    e.stopPropagation();
                    setLogDetailsTaskId(task.id);
                    setLogsLoading(true);
                    try {
                      const response = await autopipeAxiosInstance.get(`/api/autopipe/tasks/${task.id}/logs?page=1&pageSize=100`);
                      const result = response.data as ApiResponse<any[]>;
                      if (result.success && result.data) {
                        setTaskLogs(result.data);
                      } else {
                        setTaskLogs([]);
                      }
                    } catch (error) {
                      console.error('Failed to fetch task logs:', error);
                      setTaskLogs([]);
                    } finally {
                      setLogsLoading(false);
                    }
                  }}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <RiArtboard2Line size={14} />
                  {'Log Details'}
                </button>
                <button 
                  className="task-action-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadTaskData(task.id, task.type);
                  }}
                  style={{
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    MozUserSelect: 'none',
                    msUserSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <RiDownloadLine size={14} />
                  {'Download'}
                </button>
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* Delete confirmation bubble */}
      {deleteConfirmTaskId && createPortal(
        <div style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          zIndex: 1500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        onClick={isDeletingTask ? undefined : cancelDeleteConfirm}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            marginLeft: '100px',
            marginTop: '32px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
            position: 'relative',
            overflow: 'hidden'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {isDeletingTask && (
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(255, 255, 255, 0.82)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                zIndex: 2
              }}>
                <LoadingIcon style={{ fontSize: 28, color: '#ff4d4f', animation: 'copySpin 0.8s linear infinite' }} />
                <span style={{ fontSize: '14px', color: '#666', fontWeight: 500 }}>Deleting task...</span>
              </div>
            )}
            {/* close button */}
            <button
              onClick={cancelDeleteConfirm}
              disabled={isDeletingTask}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: isDeletingTask ? 'not-allowed' : 'pointer',
                color: isDeletingTask ? '#ccc' : '#999',
                padding: '8px',
                borderRadius: '4px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.color = '#333';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#999';
              }}
            >
              ×
            </button>
            
            {/* Confirm content */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                marginBottom: '16px'
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#fff2f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px'
                }}>
                  <VscCloseAll size={20} color="#ff4d4f" />
          </div>
                <h3 style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#333'
                }}>
                  Confirm Delete
                </h3>
              </div>
              
              <p style={{
                margin: 0,
                fontSize: '14px',
                color: '#666',
                lineHeight: '1.5'
              }}>
                {`Delete task: ${tasks.find(t => t.id === deleteConfirmTaskId)?.taskId || ''}`}
              </p>
              <p style={{
                margin: '8px 0 0 0',
                fontSize: '12px',
                color: '#999'
              }}>
                This operation cannot be undone, the task and all its data will be permanently deleted.
              </p>
            </div>
            
            {/* Action button */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={cancelDeleteConfirm}
                disabled={isDeletingTask}
            style={{
                  padding: '8px 16px',
                  border: '1px solid #d9d9d9',
                  borderRadius: '4px',
                  background: 'white',
                  color: '#666',
                  cursor: isDeletingTask ? 'not-allowed' : 'pointer',
                  opacity: isDeletingTask ? 0.6 : 1,
                  fontSize: '14px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#999';
                  e.currentTarget.style.color = '#333';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#d9d9d9';
                  e.currentTarget.style.color = '#666';
                }}
              >
                Cancel
              </button>
              <button
                disabled={isDeletingTask}
                onClick={() => deleteConfirmTaskId && confirmDeleteTask(deleteConfirmTaskId)}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '4px',
                  background: isDeletingTask ? '#ffb3b4' : '#ff4d4f',
                  color: 'white',
                  cursor: isDeletingTask ? 'not-allowed' : 'pointer',
                  opacity: isDeletingTask ? 0.85 : 1,
                  fontSize: '14px',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                onMouseEnter={(e) => {
                  if (!isDeletingTask) {
                    e.currentTarget.style.backgroundColor = '#d9363e';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isDeletingTask ? '#ffb3b4' : '#ff4d4f';
                }}
              >
                {isDeletingTask && (
                  <LoadingIcon style={{ fontSize: 14, animation: 'copySpin 0.8s linear infinite' }} />
                )}
                {isDeletingTask ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* Task editing pop-up window */}
      {editingTaskId && (() => {
        const editingTask = tasks.find(t => t.id === editingTaskId);
        if (!editingTask) return null;
        
        return createPortal(
          <div style={{
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onClick={cancelEditTask}
          >
            <div style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '900px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none',
              animation: 'slideInBubble 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
            onClick={(e) => e.stopPropagation()}
            >
              {/* close button */}
              <button
                onClick={cancelEditTask}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#999',
                  padding: '8px',
                  borderRadius: '4px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                  e.currentTarget.style.color = '#333';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = '#999';
                }}
              >
                ×
              </button>
              
              {/* Title */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: '600',
                  color: '#333',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}>
                  {'Edit Task'} - {editingTask?.taskId || ''}
                </h3>
              </div>
              
              {/* Edit form - using styles from New Task */}
              <div className="auto-pipe-search-container">
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '16px',
                  justifyContent: 'flex-start',
                  flexWrap: 'wrap'
                }}>
                  {/* Account filter - disable editing */}
                  <div className="select-wrapper account-filter-wrapper" style={{ width: '180px' }}>
                    <button
                      className="select-button"
                      disabled
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none',
                        cursor: 'not-allowed',
                        opacity: 0.6,
                        backgroundColor: '#f5f5f5'
                      }}
          >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, lineHeight: '14px' }}>
                        {!editTaskForm.accountId ? (
                          <span style={{ lineHeight: '14px' }}>Account</span>
                        ) : (
                          <>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {getAccountIcon(editTaskForm.accountId)}
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, lineHeight: '14px' }}>
                              {getAccountLabel(editTaskForm.accountId)}
                            </span>
                          </>
                        )}
                      </span>
                      {editActiveDropdown === 'edit-account' ? (
                        <VscListFlat size={12} className="select-arrow open" />
                      ) : (
                        <VscListSelection size={12} className="select-arrow" />
                      )}
                    </button>
                    {editActiveDropdown === 'edit-account' && (
                      <div className="select-dropdown show">
                        {accountConfigs.map(account => (
                          <div key={account.id} className="select-option" onClick={() => {
                            setEditTaskForm(prev => ({ ...prev, accountId: account.id }));
                            setEditActiveDropdown(null);
                          }}>
                            <div className="account-option-content">
                              {account.custom_icon ? (
                                <img 
                                  src={account.custom_icon} 
                                  alt={account.account_name}
                                  className="account-option-logo"
                                  style={{ pointerEvents: 'none' }}
                                  draggable={false}
                                />
                              ) : (
                                <div className="account-option-logo-placeholder">
                                  <VscAccount size={12} />
                                </div>
                              )}
                              <div className="account-option-details">
                                <div className="account-option-name">{account.account_name}</div>
                                <div className="account-option-type">{account.account_type}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* App Filter - Disable Editing */}
                  <div className="select-wrapper" style={{ width: '120px' }}>
                    <button
                      className="select-button"
                      disabled
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none',
                        cursor: 'not-allowed',
                        opacity: 0.6,
                        backgroundColor: '#f5f5f5'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, lineHeight: '14px' }}>
                        {editTaskForm.appType ? (
                          <>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {getAppTypeIcon(editTaskForm.appType)}
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, lineHeight: '14px' }}>
                              {editTaskForm.appType === 'ios' ? 'IOS' : editTaskForm.appType === 'android' ? 'Android' : editTaskForm.appType === 'both' ? 'Bundle' : editTaskForm.appType}
                            </span>
                          </>
                        ) : (
                          <span style={{ lineHeight: '14px' }}>App Type</span>
                        )}
                      </span>
                      {editActiveDropdown === 'edit-appType' ? (
                        <VscListFlat size={12} className="select-arrow open" />
                      ) : (
                        <VscListSelection size={12} className="select-arrow" />
                      )}
                    </button>
                    {editActiveDropdown === 'edit-appType' && (
                      <div className="select-dropdown show">
                        <div className="select-option" onClick={() => {
                          setEditTaskForm(prev => ({ ...prev, appType: 'both' }));
                          setEditActiveDropdown(null);
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {getAppTypeIcon('both')}
                            <span>Bundle</span>
                          </div>
                        </div>
                        <div className="select-option" onClick={() => {
                          setEditTaskForm(prev => ({ ...prev, appType: 'ios' }));
                          setEditActiveDropdown(null);
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {getAppTypeIcon('ios')}
                            <span>IOS</span>
                          </div>
                        </div>
                        <div className="select-option" onClick={() => {
                          setEditTaskForm(prev => ({ ...prev, appType: 'android' }));
                          setEditActiveDropdown(null);
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {getAppTypeIcon('android')}
                            <span>Android</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Data Type filter */}
                  <div className="select-wrapper" style={{ width: '150px' }}>
                    <button
                      className="select-button"
                      onClick={() => setEditActiveDropdown(editActiveDropdown === 'edit-type' ? null : 'edit-type')}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, lineHeight: '14px' }}>
                        {editTaskForm.type ? (
                          <>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {getTypeIcon(editTaskForm.type)}
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, lineHeight: '14px' }}>
                              {getTypeLabel(editTaskForm.type)}
                            </span>
                          </>
                        ) : (
                          <span style={{ lineHeight: '14px' }}>Data Type</span>
                        )}
                      </span>
                      {editActiveDropdown === 'edit-type' ? (
                        <VscListFlat size={12} className="select-arrow open" />
                      ) : (
                        <VscListSelection size={12} className="select-arrow" />
                      )}
                    </button>
                    {editActiveDropdown === 'edit-type' && (
                      <div className="select-dropdown show">
                        <div className="select-option" onClick={() => {
                          setEditTaskForm(prev => ({ ...prev, type: 'install_pb' }));
                          setEditActiveDropdown(null);
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {getTypeIcon('install_pb')}
                            <span>Install-PB</span>
                          </div>
                        </div>
                        <div className="select-option" onClick={() => {
                          setEditTaskForm(prev => ({ ...prev, type: 'event_pb' }));
                          setEditActiveDropdown(null);
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {getTypeIcon('event_pb')}
                            <span>Event-PB</span>
                          </div>
                        </div>
                        <div className="select-option" onClick={() => {
                          setEditTaskForm(prev => ({ ...prev, type: 'install_rtpb' }));
                          setEditActiveDropdown(null);
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {getTypeIcon('install_rtpb')}
                            <span>Install-RTPB</span>
                          </div>
                        </div>
                        <div className="select-option" onClick={() => {
                          setEditTaskForm(prev => ({ ...prev, type: 'event_rtpb' }));
                          setEditActiveDropdown(null);
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {getTypeIcon('event_rtpb')}
                            <span>Event-RTPB</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Data Pointer filter */}
                  <div className="select-wrapper" style={{ width: '170px' }}>
                    <button
                      className="select-button"
                      onClick={() => setEditActiveDropdown(editActiveDropdown === 'edit-dataPointer' ? null : 'edit-dataPointer')}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, lineHeight: '14px' }}>
                        {editTaskForm.dataPointer ? (
                          <>
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {editTaskForm.dataPointer === 'Daily Execution' ? <BsRepeat1 size={12} /> : <Bs1Square size={12} />}
                            </span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0, lineHeight: '14px' }}>
                              {editTaskForm.dataPointer}
                            </span>
                          </>
                        ) : (
                          <span style={{ lineHeight: '14px' }}>Data Pointer</span>
                        )}
                      </span>
                      {editActiveDropdown === 'edit-dataPointer' ? (
                        <VscListFlat size={12} className="select-arrow open" />
                      ) : (
                        <VscListSelection size={12} className="select-arrow" />
                      )}
                    </button>
                    {editActiveDropdown === 'edit-dataPointer' && (
                      <div className="select-dropdown show">
                        <div className="select-option" onClick={() => {
                          setEditTaskForm(prev => ({ ...prev, dataPointer: 'Daily Execution' }));
                          setEditActiveDropdown(null);
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BsRepeat1 size={12} />
                            <span>Daily Execution</span>
                          </div>
                        </div>
                        <div className="select-option" onClick={() => {
                          setEditTaskForm(prev => ({ ...prev, dataPointer: 'Single Execution' }));
                          setEditActiveDropdown(null);
                        }}
                        style={{
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bs1Square size={12} />
                            <span>Single Execution</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Time picker - only displayed during Daily Execution, moved to the right of the first row */}
                  {editTaskForm.dataPointer === 'Daily Execution' && (
                    <div className="relative" data-time-picker>
                    <div 
                      className="flex items-center gap-2 px-3 h-10 bg-gray-100 border border-gray-200 rounded-md font-mono text-sm text-gray-700 select-none cursor-pointer transition-all duration-200 w-[120px] hover:bg-blue-50 hover:border-blue-400"
                      onClick={() => setEditActiveDropdown(editActiveDropdown === 'edit-timePicker' ? null : 'edit-timePicker')}
                    >
                      <div className="flex items-center justify-center gap-0.5 text-sm font-medium w-full">
                        <span>{editTaskForm.selectedTime.hours.toString().padStart(2, '0')}</span>
                        <span>:</span>
                        <span>{editTaskForm.selectedTime.minutes.toString().padStart(2, '0')}</span>
                        <span>:</span>
                        <span>{editTaskForm.selectedTime.seconds.toString().padStart(2, '0')}</span>
                      </div>
                    </div>
                    {editActiveDropdown === 'edit-timePicker' && (
                      <div 
                        className="absolute top-full left-0 right-0 bg-white z-[1000] mt-1 p-2 rounded-md border border-gray-200 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex">
                          {/* hour selection */}
                          <div className="flex-1 text-center">
                            <div className="text-[10px] text-gray-500 mb-1 select-none">H</div>
                            <div className="time-picker-scroll max-h-[120px] overflow-y-auto">
                              {generateTimeOptions('hours').map(hour => (
                                <div
                                  key={hour}
                                  className={`px-2 py-1 text-xs cursor-pointer rounded-sm select-none transition-colors ${
                                    editTaskForm.selectedTime.hours === hour 
                                      ? 'bg-gray-200 text-gray-900' 
                                      : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditTaskForm(prev => ({ ...prev, selectedTime: { ...prev.selectedTime, hours: hour } }));
                                  }}
                                >
                                  {hour.toString().padStart(2, '0')}
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* minute selection */}
                          <div className="flex-1 text-center">
                            <div className="text-[10px] text-gray-500 mb-1 select-none">M</div>
                            <div className="time-picker-scroll max-h-[120px] overflow-y-auto">
                              {generateTimeOptions('minutes').map(minute => (
                                <div
                                  key={minute}
                                  className={`px-2 py-1 text-xs cursor-pointer rounded-sm select-none transition-colors ${
                                    editTaskForm.selectedTime.minutes === minute 
                                      ? 'bg-gray-200 text-gray-900' 
                                      : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditTaskForm(prev => ({ ...prev, selectedTime: { ...prev.selectedTime, minutes: minute } }));
                                  }}
                                >
                                  {minute.toString().padStart(2, '0')}
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* seconds to choose */}
                          <div className="flex-1 text-center">
                            <div className="text-[10px] text-gray-500 mb-1 select-none">S</div>
                            <div className="time-picker-scroll max-h-[120px] overflow-y-auto">
                              {generateTimeOptions('seconds').map(second => (
                                <div
                                  key={second}
                                  className={`px-2 py-1 text-xs cursor-pointer rounded-sm select-none transition-colors ${
                                    editTaskForm.selectedTime.seconds === second 
                                      ? 'bg-gray-200 text-gray-900' 
                                      : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditTaskForm(prev => ({ ...prev, selectedTime: { ...prev.selectedTime, seconds: second } }));
                                  }}
                                >
                                  {second.toString().padStart(2, '0')}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Date picker - only displayed during Single Execution, moved to the right of the first row */}
                  {editTaskForm.dataPointer === 'Single Execution' && (
                    <div className="relative" data-date-picker>
                    <div 
                      className="flex items-center gap-2 px-3 h-10 bg-gray-100 border border-gray-200 rounded-md text-sm text-gray-700 select-none cursor-pointer transition-all duration-200 w-[120px] hover:bg-blue-50 hover:border-blue-400"
                      onClick={() => setEditActiveDropdown(editActiveDropdown === 'edit-datePicker' ? null : 'edit-datePicker')}
                    >
                      <div className="flex items-center justify-center gap-1 text-sm font-medium w-full">
                        <span>{editTaskForm.selectedDate.toLocaleDateString('en-US', {
                          month: '2-digit',
                          day: '2-digit'
                        })}</span>
                      </div>
                    </div>
                    {editActiveDropdown === 'edit-datePicker' && (
                      <div 
                        className="absolute top-full left-0 right-0 bg-white z-[1000] mt-1 p-2 rounded-md border border-gray-200 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex">
                          {/* Month selection */}
                          <div className="flex-1 text-center">
                            <div className="text-[10px] text-gray-500 mb-1 select-none">M</div>
                            <div className="time-picker-scroll max-h-[120px] overflow-y-auto">
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => {
                                // Date Limit: Check if the month leads to a future date or is outside the 3 month range
                                const testDate = new Date(editTaskForm.selectedDate.getFullYear(), month - 1, editTaskForm.selectedDate.getDate());
                                const yesterday = new Date();
                                yesterday.setDate(yesterday.getDate() - 1);
                                yesterday.setHours(23, 59, 59, 999);
                                
                                const threeMonthsAgo = new Date();
                                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                                threeMonthsAgo.setHours(0, 0, 0, 0);
                                
                                const isDisabled = testDate > yesterday || testDate < threeMonthsAgo;
                                
                                return (
                                <div
                                  key={month}
                                  className={`px-2 py-1 text-xs cursor-pointer rounded-sm select-none transition-colors ${
                                    isDisabled
                                      ? 'cursor-not-allowed text-gray-300 opacity-50 line-through'
                                      : (editTaskForm.selectedDate.getMonth() + 1) === month
                                        ? 'bg-blue-50 text-blue-600'
                                        : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                  onClick={(e) => {
                                      if (!isDisabled) {
                                    e.stopPropagation();
                                    setEditTaskForm(prev => ({
                                      ...prev,
                                      selectedDate: new Date(prev.selectedDate.getFullYear(), month - 1, prev.selectedDate.getDate())
                                    }));
                                    setEditActiveDropdown(null);
                                    }
                                  }}
                                >
                                  {month.toString().padStart(2, '0')}
                                </div>
                                );
                              })}
                            </div>
                          </div>
                          
                          {/* date selection */}
                          <div className="flex-1 text-center">
                            <div className="text-[10px] text-gray-500 mb-1 select-none">D</div>
                            <div className="time-picker-scroll max-h-[120px] overflow-y-auto">
                              {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                                // Date restriction: You can only select yesterday and before, and within the range of 3 months
                                const testDate = new Date(editTaskForm.selectedDate.getFullYear(), editTaskForm.selectedDate.getMonth(), day);
                                const yesterday = new Date();
                                yesterday.setDate(yesterday.getDate() - 1);
                                yesterday.setHours(23, 59, 59, 999);
                                
                                const threeMonthsAgo = new Date();
                                threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
                                threeMonthsAgo.setHours(0, 0, 0, 0);
                                
                                const isDisabled = testDate > yesterday || testDate < threeMonthsAgo;
                                
                                return (
                                <div
                                  key={day}
                                  className={`px-2 py-1 text-xs cursor-pointer rounded-sm select-none transition-colors ${
                                    isDisabled
                                      ? 'cursor-not-allowed text-gray-300 opacity-50 line-through'
                                      : editTaskForm.selectedDate.getDate() === day
                                        ? 'bg-gray-200 text-gray-800'
                                        : 'text-gray-700 hover:bg-gray-100'
                                  }`}
                                  onClick={(e) => {
                                      if (!isDisabled) {
                                    e.stopPropagation();
                                    setEditTaskForm(prev => ({
                                      ...prev,
                                      selectedDate: new Date(prev.selectedDate.getFullYear(), prev.selectedDate.getMonth(), day)
                                    }));
                                    setEditActiveDropdown(null);
                                    }
                                  }}
                                >
                                  {day.toString().padStart(2, '0')}
                                </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>

                {/* Second row: App selector - displayed based on App Type filter */}
                {editTaskForm.appType && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px',
                    justifyContent: 'space-between',
                    marginTop: '16px',
                    width: '100%'
                  }}>
                    {/* iOS App Selector - only displayed when in Bundle or IOS */}
                    {(editTaskForm.appType === 'both' || editTaskForm.appType === 'ios') && (
                      <div style={{ 
                        position: 'relative', 
                        flex: editTaskForm.appType === 'ios' ? '1' : '1'
                      }}>
                    <div 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '48px',
                        background: '#f5f5f5',
                        border: 'none',
                        outline: '2px dashed rgba(0, 0, 0, 0.1)',
                        outlineOffset: '0px',
                        borderRadius: '2px',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        width: '100%',
                        cursor: 'not-allowed',
                        color: editTaskForm.iosApp ? '#999' : '#999',
                        opacity: 0.6,
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none',
                        pointerEvents: 'none'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}>
                        {editTaskForm.iosApp ? (
                          <>
                            <span style={{
                              flex: 1,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              textAlign: 'left'
                            }}>
                              {editTaskForm.iosApp!.app_name}
                            </span>
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              flexShrink: 0,
                              position: 'relative',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {editTaskForm.iosApp!.icon_url ? (
                                <img
                                  src={editTaskForm.iosApp!.icon_url}
                                  alt={editTaskForm.iosApp!.app_name}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0
                                  }}
                                  onError={(e) => {
                                    // When the icon loading fails, hide the img and display the default icon
                                    const img = e.target as HTMLImageElement;
                                    img.style.display = 'none';
                                    const container = img.parentElement;
                                    if (container) {
                                      const defaultIcon = container.querySelector('.default-app-icon') as HTMLElement;
                                      if (defaultIcon) {
                                        defaultIcon.style.display = 'flex';
                                      }
                                    }
                                  }}
                                />
                              ) : null}
                              <div 
                                className="default-app-icon"
                                style={{
                                  display: editTaskForm.iosApp!.icon_url ? 'none' : 'flex',
                                  width: '100%',
                                  height: '100%',
                                  background: 'linear-gradient(to bottom right, #60a5fa, #a78bfa)',
                                  borderRadius: '4px',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '10px',
                                  fontWeight: '600',
                                  color: '#ffffff',
                                  position: 'absolute',
                                  top: 0,
                                  left: 0
                                }}
                              >
                                {editTaskForm.iosApp!.app_name ? editTaskForm.iosApp!.app_name.charAt(0).toUpperCase() : 'A'}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <VscDiffAdded size={16} />
                            <span>IOS App</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                    )}

                    {/* Android App Selector - Only shown when in Bundle or Android */}
                    {(editTaskForm.appType === 'both' || editTaskForm.appType === 'android') && (
                      <div style={{ 
                        position: 'relative', 
                        flex: editTaskForm.appType === 'android' ? '1' : '1'
                      }}>
                    <div 
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '48px',
                        background: '#f5f5f5',
                        border: 'none',
                        outline: '2px dashed rgba(0, 0, 0, 0.1)',
                        outlineOffset: '0px',
                        borderRadius: '2px',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        width: '100%',
                        cursor: 'not-allowed',
                        color: editTaskForm.androidApp ? '#999' : '#999',
                        opacity: 0.6,
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        MozUserSelect: 'none',
                        msUserSelect: 'none',
                        pointerEvents: 'none'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px',
                        fontWeight: '500'
                      }}>
                        {editTaskForm.androidApp ? (
                          <>
                            <span style={{
                              flex: 1,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              textAlign: 'left'
                            }}>
                              {editTaskForm.androidApp!.app_name}
                            </span>
                            <div style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              flexShrink: 0,
                              position: 'relative',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {editTaskForm.androidApp!.icon_url ? (
                                <img
                                  src={editTaskForm.androidApp!.icon_url}
                                  alt={editTaskForm.androidApp!.app_name}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0
                                  }}
                                  onError={(e) => {
                                    // When the icon loading fails, hide the img and display the default icon
                                    const img = e.target as HTMLImageElement;
                                    img.style.display = 'none';
                                    const container = img.parentElement;
                                    if (container) {
                                      const defaultIcon = container.querySelector('.default-app-icon') as HTMLElement;
                                      if (defaultIcon) {
                                        defaultIcon.style.display = 'flex';
                                      }
                                    }
                                  }}
                                />
                              ) : null}
                              <div 
                                className="default-app-icon"
                                style={{
                                  display: editTaskForm.androidApp!.icon_url ? 'none' : 'flex',
                                  width: '100%',
                                  height: '100%',
                                  background: 'linear-gradient(to bottom right, #60a5fa, #a78bfa)',
                                  borderRadius: '4px',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '10px',
                                  fontWeight: '600',
                                  color: '#ffffff',
                                  position: 'absolute',
                                  top: 0,
                                  left: 0
                                }}
                              >
                                {editTaskForm.androidApp!.app_name ? editTaskForm.androidApp!.app_name.charAt(0).toUpperCase() : 'A'}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <VscDiffAdded size={16} />
                            <span>Android App</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Action button */}
              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={cancelEditTask}
                  className="px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-600 cursor-pointer text-sm transition-all duration-200 select-none hover:border-gray-400 hover:text-gray-800"
                >
                  {'Cancel'}
                </button>
                <button
                  onClick={saveEditTask}
                  className="px-4 py-2 border-none rounded-md bg-purple-600 text-white cursor-pointer text-sm transition-all duration-200 select-none hover:bg-purple-700 hover:shadow-md"
                >
                  {'Save'}
                </button>
              </div>
            </div>
          </div>
          , document.body
        );
      })()}

      {/* Paginator */}
      {!tasksLoading && filteredTasks.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: '24px',
          marginBottom: '8px'
        }}>
          <CustomPagination 
            current={currentPage}
            pageSize={pageSize}
            total={filteredTasks.length}
            onChange={page => {
              setCurrentPage(page);
            }}
          />
        </div>
      )}

      {/* The No Task status has been removed and an empty status is displayed when there is no data. */}

      {/* App selection pop-up window */}
      {appSelectorVisible && createPortal(
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[1500] p-5 animate-[fadeIn_0.15s_cubic-bezier(0.4,0,0.2,1)]"
        onClick={() => setAppSelectorVisible(false)}
        >
          <div 
          className={`bg-white rounded-lg w-full max-w-[900px] overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] flex flex-col m-auto relative select-none animate-[slideInBubble_0.2s_cubic-bezier(0.4,0,0.2,1)] ${appSelectorLoading ? 'pointer-events-none' : ''}`}
          style={{ height: '680px' }}
          onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-0 flex flex-col flex-1 min-h-0 overflow-hidden">

            {/* search box */}
            <div className="flex items-center gap-3 mb-4 flex-shrink-0">
            <input
                type="text"
                placeholder={appSelectorPlatform === 'IOS' ? 'Search IOS Apps' : 'Search Android Apps'}
                value={appSelectorInput} // bind to local state
                onChange={handleAppInputChange} // Bind to new handler function
                onClick={(e) => e.stopPropagation()} // Prevent click events from bubbling up
                className="flex-1 py-3 pl-2 border-none border-b-2 border-gray-300 rounded-none text-sm outline-none bg-transparent transition-colors duration-200 select-text focus:border-blue-500"
              />
              <button
                onClick={() => setAppSelectorVisible(false)}
                className="bg-transparent border-none cursor-pointer text-gray-500 p-0 rounded-sm w-8 h-8 inline-flex items-center justify-center leading-none transition-colors duration-200 flex-shrink-0 select-none hover:bg-gray-100"
                aria-label="Close app selector"
              >
                <X size={16} strokeWidth={2.25} />
              </button>
            </div>

            {/* Application list */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 app-selector-scroll min-h-0 pb-0">
              {appSelectorLoading ? (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3 p-1">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <div key={index} className="py-5 px-4 rounded-md border border-gray-200 bg-white animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-gray-200" />
                        <div className="flex-1 min-w-0">
                          <div className="h-4 bg-gray-200 rounded mb-2 w-3/4" />
                          <div className="h-3 bg-gray-200 rounded mb-1 w-1/2" />
                          <div className="h-3 bg-gray-200 rounded w-2/3" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : appSelectorApps.length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[300px] text-gray-500 flex-col">
                  <Search size={32} className="mb-2" />
                  <span>No apps found</span>
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3 p-1 overflow-x-hidden">
                    {appSelectorApps.slice(0, 10).map((app) => (
                    <div
                      key={app.app_id}
                      onClick={() => handleAppSelect(app)}
                      className={`p-4 rounded-md cursor-pointer transition-all duration-200 select-none overflow-hidden ${
                        appSelectorSelectedApp?.app_id === app.app_id
                          ? 'border border-gray-700 bg-gray-100'
                          : 'border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center relative">
                          {app.icon_url ? (
                            <img
                              src={app.icon_url}
                              alt={app.app_name}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // When the icon loading fails, hide the img and display the default icon
                                const img = e.target as HTMLImageElement;
                                img.style.display = 'none';
                                const container = img.parentElement;
                                if (container) {
                                  const defaultIcon = container.querySelector('.default-app-icon') as HTMLElement;
                                  if (defaultIcon) {
                                    defaultIcon.style.display = 'flex';
                                  } else {
                                    const newDefaultIcon = document.createElement('div');
                                    newDefaultIcon.className = 'default-app-icon w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 text-white font-semibold text-lg absolute inset-0';
                                    newDefaultIcon.textContent = app.app_name ? app.app_name.charAt(0).toUpperCase() : 'A';
                                    container.appendChild(newDefaultIcon);
                                  }
                                }
                              }}
                            />
                          ) : null}
                          <div 
                            className="default-app-icon w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 text-white font-semibold text-lg absolute inset-0"
                            style={{ display: app.icon_url ? 'none' : 'flex' }}
                          >
                            {app.app_name ? app.app_name.charAt(0).toUpperCase() : 'A'}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="text-sm font-semibold text-gray-800 mb-1 whitespace-nowrap overflow-hidden text-ellipsis">
                            {app.app_name}
                          </div>
                          <div className="text-xs text-gray-500 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                            App ID: {app.app_id}
                          </div>
                          <div className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">
                            {app.category} • {app.developer}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </div>
            
            {/* bottom button */}
            <div className="flex justify-end gap-3 px-4 pt-2 pb-2 border-t border-gray-200 flex-shrink-0 bg-white">
              <button
                onClick={() => setAppSelectorVisible(false)}
                className="px-4 py-2 border border-gray-300 rounded-md bg-white text-gray-700 cursor-pointer text-sm font-semibold transition-all duration-200 select-none hover:bg-gray-50 hover:border-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={appSelectorMode === 'new' ? handleConfirmAppSelection : handleConfirmEditAppSelection}
                disabled={!appSelectorSelectedApp}
                className="app-selector-confirm-button px-4 py-2 border-none rounded-md text-white text-sm font-semibold select-none"
              >
                Confirm Selection
              </button>
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* Delete notification bubble */}
      {/* Log details pop-up window */}
      {logDetailsTaskId && createPortal(
        <div style={{
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          backdropFilter: 'blur(2px)',
          WebkitBackdropFilter: 'blur(2px)',
          zIndex: 1500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.15s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
        onClick={() => setLogDetailsTaskId(null)}
        >
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '900px',
            width: '90%',
            maxHeight: '90vh',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            position: 'relative',
            animation: 'slideInBubble 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            flexDirection: 'column'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* close button */}
            <button
              onClick={() => setLogDetailsTaskId(null)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: '#999',
                padding: '8px',
                borderRadius: '4px',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                zIndex: 1,
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f5f5f5';
                e.currentTarget.style.color = '#333';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#999';
              }}
            >
              ×
            </button>
            
            {/* Title */}
            <div style={{ marginBottom: '24px', flexShrink: 0, userSelect: 'text', WebkitUserSelect: 'text', MozUserSelect: 'text', msUserSelect: 'text' }}>
              <h3 style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: '600',
                color: '#333'
              }}>
                {'Log Details'} - {tasks.find(t => t.id === logDetailsTaskId)?.taskId || ''}
              </h3>
            </div>
            
            {/* Log content - scrollable area */}
            <div className="time-picker-scroll" style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: 'calc(90vh - 100px)',
              paddingRight: '4px',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              MozUserSelect: 'text',
              msUserSelect: 'text'
            }}>
              {logsLoading ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px',
                  color: '#999'
                }}>
                  Loading logs...
                </div>
              ) : taskLogs.length === 0 ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px',
                  color: '#999'
                }}>
                  No logs available
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {taskLogs.map((log, index) => (
                    <div
                      key={log.id || index}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        padding: '16px',
                        backgroundColor: log.status === 'error' || log.status === 'failed' ? '#fff2f0' : '#f9fafb'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '8px'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '4px'
                          }}>
                            <span style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#333',
                              lineHeight: '20px',
                              letterSpacing: '0',
                              textRendering: 'optimizeLegibility',
                              fontVariantNumeric: 'normal',
                              fontFeatureSettings: 'normal',
                              fontKerning: 'normal',
                              WebkitFontSmoothing: 'antialiased',
                              MozOsxFontSmoothing: 'grayscale',
                              boxSizing: 'border-box',
                              display: 'inline-block',
                              verticalAlign: 'top'
                            }}>
                              App ID: {log.app_id || 'N/A'}
                            </span>
                            <span style={{
                              fontSize: '12px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: log.status === 'success' || log.status === 'completed' ? '#d1fae5' : 
                                           log.status === 'error' || log.status === 'failed' ? '#fee2e2' : '#fef3c7',
                              color: log.status === 'success' || log.status === 'completed' ? '#065f46' : 
                                     log.status === 'error' || log.status === 'failed' ? '#991b1b' : '#92400e',
                              fontWeight: '500',
                              lineHeight: '16px',
                              letterSpacing: '0',
                              textRendering: 'optimizeLegibility',
                              fontVariantNumeric: 'normal',
                              fontFeatureSettings: 'normal',
                              fontKerning: 'normal',
                              WebkitFontSmoothing: 'antialiased',
                              MozOsxFontSmoothing: 'grayscale',
                              boxSizing: 'border-box',
                              display: 'inline-block',
                              verticalAlign: 'top'
                            }}>
                              {log.status || 'unknown'}
                            </span>
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#666',
                            marginTop: '4px',
                            lineHeight: '16px',
                            letterSpacing: '0',
                            textRendering: 'optimizeLegibility',
                            fontVariantNumeric: 'normal',
                            fontFeatureSettings: 'normal',
                            fontKerning: 'normal',
                            WebkitFontSmoothing: 'antialiased',
                            MozOsxFontSmoothing: 'grayscale',
                            boxSizing: 'border-box'
                          }}>
                            Execution Time: {log.execution_time || 'N/A'}
                          </div>
                        </div>
                      </div>
                      
                      {/* error message */}
                      {log.error_message && (
                        <div style={{
                          marginTop: '8px',
                          padding: '8px',
                          backgroundColor: '#fee2e2',
                          borderRadius: '4px',
                          fontSize: '12px',
                          color: '#991b1b',
                          fontFamily: 'monospace',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          lineHeight: '16px',
                          letterSpacing: '0',
                          textRendering: 'optimizeLegibility',
                          fontVariantNumeric: 'normal',
                          fontFeatureSettings: 'normal',
                          fontKerning: 'normal',
                          WebkitFontSmoothing: 'antialiased',
                          MozOsxFontSmoothing: 'grayscale',
                          boxSizing: 'border-box'
                        }}>
                          {log.error_message}
                        </div>
                      )}
                      
                      {/* Execution statistics */}
                      <div style={{
                        display: 'flex',
                        gap: '16px',
                        marginTop: '8px',
                        fontSize: '12px',
                        color: '#666',
                        lineHeight: '16px',
                        letterSpacing: '0',
                        textRendering: 'optimizeLegibility',
                        fontVariantNumeric: 'normal',
                        fontFeatureSettings: 'normal',
                        fontKerning: 'normal',
                        WebkitFontSmoothing: 'antialiased',
                        MozOsxFontSmoothing: 'grayscale',
                        boxSizing: 'border-box'
                      }}>
                        {log.execution_duration !== undefined && (
                          <span style={{
                            lineHeight: '16px',
                            display: 'inline-block',
                            verticalAlign: 'top'
                          }}>Duration: {log.execution_duration}s</span>
                        )}
                        {log.data_processed !== undefined && (
                          <span style={{
                            lineHeight: '16px',
                            display: 'inline-block',
                            verticalAlign: 'top'
                          }}>Processed: {log.data_processed.toLocaleString()}</span>
                        )}
                        {log.data_fetched !== undefined && (
                          <span style={{
                            lineHeight: '16px',
                            display: 'inline-block',
                            verticalAlign: 'top'
                          }}>Fetched: {log.data_fetched.toLocaleString()}</span>
                        )}
                        {log.data_deduplicated !== undefined && (
                          <span style={{
                            lineHeight: '16px',
                            display: 'inline-block',
                            verticalAlign: 'top'
                          }}>Deduplicated: {log.data_deduplicated.toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        , document.body
      )}

      {/* CSS animation styles */}
      <style>{`
        @keyframes slideInFromRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes slideOutToRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
        
        /*Pop-up animation*/
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
        }
      `}</style>
    </div>
  );
};

export default AutoPipe;
