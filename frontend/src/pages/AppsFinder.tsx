import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { FileSearch, Upload, ChevronDown, Loader2 } from 'lucide-react';
import { RiFolderDownloadLine } from 'react-icons/ri';
import { TbHttpDelete } from 'react-icons/tb';
import { VscMenu } from 'react-icons/vsc';

import { GooglePlayApiService } from '../services/googlePlayApi';
import { useUser } from '../contexts/UserContext';
import { message } from '../components/ui/toast';

// Unified notification system: all use global ToastContainer
const showNotification = {
  success: (text: string) => {
    message.success(text);
  },
  error: (text: string) => {
    message.error(text);
  },
  warning: (text: string) => {
    message.warning(text);
  },
  info: (text: string) => {
    message.info(text);
  }
};

const DASHBOARD_FORCE_REFRESH_KEY = 'dashboard_force_refresh_ts';
const DASHBOARD_FORCE_REFRESH_WINDOW_MS = 15000;

const shouldForceAppsFinderNoCache = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const raw = sessionStorage.getItem(DASHBOARD_FORCE_REFRESH_KEY);
    if (!raw) {
      return false;
    }
    const ts = Number(raw);
    if (!Number.isFinite(ts)) {
      sessionStorage.removeItem(DASHBOARD_FORCE_REFRESH_KEY);
      return false;
    }
    if (Date.now() - ts > DASHBOARD_FORCE_REFRESH_WINDOW_MS) {
      sessionStorage.removeItem(DASHBOARD_FORCE_REFRESH_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const COUNTRY_OPTIONS = [
  // Top Markets
  { value: 'us', label: 'US' },
  { value: 'cn', label: 'CN' },
  { value: 'jp', label: 'JP' },
  { value: 'kr', label: 'KR' },
  { value: 'gb', label: 'GB' },
  { value: 'de', label: 'DE' },
  { value: 'fr', label: 'FR' },
  { value: 'ca', label: 'CA' },
  { value: 'au', label: 'AU' },
  { value: 'br', label: 'BR' },
  { value: 'in', label: 'IN' },
  { value: 'ru', label: 'RU' },
  { value: 'it', label: 'IT' },
  { value: 'es', label: 'ES' },
  { value: 'mx', label: 'MX' },
  { value: 'nl', label: 'NL' },
  { value: 'se', label: 'SE' },
  { value: 'ch', label: 'CH' },
  { value: 'sg', label: 'SG' },
  { value: 'hk', label: 'HK' },
  { value: 'tw', label: 'TW' },
  { value: 'th', label: 'TH' },
  { value: 'vn', label: 'VN' },
  { value: 'id', label: 'ID' },
  { value: 'my', label: 'MY' },
  { value: 'ph', label: 'PH' },
  { value: 'tr', label: 'TR' },
  { value: 'pl', label: 'PL' },
  { value: 'no', label: 'NO' },
  { value: 'dk', label: 'DK' },
  { value: 'fi', label: 'FI' },
  { value: 'at', label: 'AT' },
  { value: 'be', label: 'BE' },
  { value: 'ie', label: 'IE' },
  { value: 'nz', label: 'NZ' },
  { value: 'za', label: 'ZA' },
  { value: 'ar', label: 'AR' },
  { value: 'cl', label: 'CL' },
  { value: 'co', label: 'CO' },
  { value: 'pe', label: 'PE' },
  { value: 've', label: 'VE' },
  { value: 'eg', label: 'EG' },
  { value: 'sa', label: 'SA' },
  { value: 'ae', label: 'AE' },
  { value: 'il', label: 'IL' },
  { value: 'ua', label: 'UA' },
  { value: 'cz', label: 'CZ' },
  { value: 'hu', label: 'HU' },
  { value: 'ro', label: 'RO' },
  { value: 'bg', label: 'BG' },
  { value: 'hr', label: 'HR' },
  { value: 'sk', label: 'SK' },
  { value: 'si', label: 'SI' },
  { value: 'ee', label: 'EE' },
  { value: 'lv', label: 'LV' },
  { value: 'lt', label: 'LT' },
  { value: 'lu', label: 'LU' },
  { value: 'pt', label: 'PT' },
  { value: 'gr', label: 'GR' },
  { value: 'cy', label: 'CY' },
  { value: 'mt', label: 'MT' },
  { value: 'dz', label: 'DZ' },
  { value: 'ao', label: 'AO' },
  { value: 'ai', label: 'AI' },
  { value: 'am', label: 'AM' },
  { value: 'az', label: 'AZ' },
  { value: 'bh', label: 'BH' },
  { value: 'bb', label: 'BB' },
  { value: 'by', label: 'BY' },
  { value: 'bz', label: 'BZ' },
  { value: 'bm', label: 'BM' },
  { value: 'bo', label: 'BO' },
  { value: 'bw', label: 'BW' },
  { value: 'vg', label: 'VG' },
  { value: 'bn', label: 'BN' },
  { value: 'ky', label: 'KY' },
  { value: 'cr', label: 'CR' },
  { value: 'dm', label: 'DM' },
  { value: 'ec', label: 'EC' },
  { value: 'sv', label: 'SV' },
  { value: 'gh', label: 'GH' },
  { value: 'gd', label: 'GD' },
  { value: 'gt', label: 'GT' },
  { value: 'gy', label: 'GY' },
  { value: 'hn', label: 'HN' },
  { value: 'jm', label: 'JM' },
  { value: 'jo', label: 'JO' },
  { value: 'ke', label: 'KE' },
  { value: 'kw', label: 'KW' },
  { value: 'lb', label: 'LB' },
  { value: 'mo', label: 'MO' },
  { value: 'mk', label: 'MK' },
  { value: 'mg', label: 'MG' },
  { value: 'ml', label: 'ML' },
  { value: 'mu', label: 'MU' },
  { value: 'ms', label: 'MS' },
  { value: 'np', label: 'NP' },
  { value: 'ni', label: 'NI' },
  { value: 'ne', label: 'NE' },
  { value: 'ng', label: 'NG' },
  { value: 'om', label: 'OM' },
  { value: 'pk', label: 'PK' },
  { value: 'pa', label: 'PA' },
  { value: 'py', label: 'PY' },
  { value: 'qa', label: 'QA' },
  { value: 'sn', label: 'SN' },
  { value: 'lk', label: 'LK' },
  { value: 'sr', label: 'SR' },
  { value: 'tz', label: 'TZ' },
  { value: 'tn', label: 'TN' },
  { value: 'ug', label: 'UG' },
  { value: 'uy', label: 'UY' },
  { value: 'uz', label: 'UZ' },
  { value: 'ye', label: 'YE' },
  { value: 'kz', label: 'KZ' },
  { value: 'kg', label: 'KG' },
  { value: 'tj', label: 'TJ' },
  { value: 'tm', label: 'TM' },
  { value: 'ge', label: 'GE' },
  { value: 'md', label: 'MD' },
  { value: 'ba', label: 'BA' },
  { value: 'me', label: 'ME' },
  { value: 'rs', label: 'RS' },
  { value: 'xk', label: 'XK' },
  { value: 'al', label: 'AL' },
  { value: 'is', label: 'IS' },
  { value: 'ad', label: 'AD' },
  { value: 'mc', label: 'MC' },
  { value: 'li', label: 'LI' },
  { value: 'sm', label: 'SM' },
  { value: 'va', label: 'VA' },
  { value: 'gi', label: 'GI' },
  { value: 'fo', label: 'FO' },
  { value: 'gl', label: 'GL' },
  { value: 'ax', label: 'AX' },
  { value: 'je', label: 'JE' },
  { value: 'gg', label: 'GG' },
  { value: 'im', label: 'IM' },
  { value: 'bl', label: 'BL' },
  { value: 'mf', label: 'MF' },
  { value: 'gp', label: 'GP' },
  { value: 'mq', label: 'MQ' },
  { value: 're', label: 'RE' },
  { value: 'yt', label: 'YT' },
  { value: 'nc', label: 'NC' },
  { value: 'pf', label: 'PF' },
  { value: 'wf', label: 'WF' },
  { value: 'pm', label: 'PM' },
  { value: 'tf', label: 'TF' },
  { value: 'aw', label: 'AW' },
  { value: 'cw', label: 'CW' },
  { value: 'sx', label: 'SX' },
  { value: 'bq', label: 'BQ' },
  { value: 'fk', label: 'FK' },
  { value: 'gf', label: 'GF' },
  { value: 'cu', label: 'CU' },
  { value: 'ht', label: 'HT' },
  { value: 'do', label: 'DO' },
  { value: 'pr', label: 'PR' },
  { value: 'tt', label: 'TT' },
  { value: 'lc', label: 'LC' },
  { value: 'vc', label: 'VC' },
  { value: 'ag', label: 'AG' },
  { value: 'kn', label: 'KN' },
  { value: 'tc', label: 'TC' },
  { value: 'vi', label: 'VI' },
  // Additional long-tail markets
  { value: 'af', label: 'AF' },
  { value: 'as', label: 'AS' },
  { value: 'bd', label: 'BD' },
  { value: 'bf', label: 'BF' },
  { value: 'bi', label: 'BI' },
  { value: 'bj', label: 'BJ' },
  { value: 'bt', label: 'BT' },
  { value: 'cd', label: 'CD' },
  { value: 'cf', label: 'CF' },
  { value: 'cg', label: 'CG' },
  { value: 'ci', label: 'CI' },
  { value: 'ck', label: 'CK' },
  { value: 'cm', label: 'CM' },
  { value: 'cv', label: 'CV' },
  { value: 'dj', label: 'DJ' },
  { value: 'er', label: 'ER' },
  { value: 'et', label: 'ET' },
  { value: 'fm', label: 'FM' },
  { value: 'ga', label: 'GA' },
  { value: 'gm', label: 'GM' },
  { value: 'gn', label: 'GN' },
  { value: 'gq', label: 'GQ' },
  { value: 'gw', label: 'GW' },
  { value: 'iq', label: 'IQ' },
  { value: 'ir', label: 'IR' },
  { value: 'kh', label: 'KH' },
  { value: 'km', label: 'KM' },
  { value: 'la', label: 'LA' },
  { value: 'lr', label: 'LR' },
  { value: 'ls', label: 'LS' },
  { value: 'ly', label: 'LY' },
  { value: 'ma', label: 'MA' },
  { value: 'mh', label: 'MH' },
  { value: 'mm', label: 'MM' },
  { value: 'mn', label: 'MN' },
  { value: 'mr', label: 'MR' },
  { value: 'mw', label: 'MW' },
  { value: 'mz', label: 'MZ' },
  { value: 'na', label: 'NA' },
  { value: 'pg', label: 'PG' },
  { value: 'ps', label: 'PS' },
  { value: 'rw', label: 'RW' },
  { value: 'sb', label: 'SB' },
  { value: 'sc', label: 'SC' },
  { value: 'sd', label: 'SD' },
  { value: 'sl', label: 'SL' },
  { value: 'so', label: 'SO' },
  { value: 'ss', label: 'SS' },
  { value: 'st', label: 'ST' },
  { value: 'sy', label: 'SY' },
  { value: 'td', label: 'TD' },
  { value: 'tg', label: 'TG' },
  { value: 'tl', label: 'TL' },
  { value: 'to', label: 'TO' },
  { value: 'vu', label: 'VU' },
  { value: 'ws', label: 'WS' },
  { value: 'zm', label: 'ZM' },
  { value: 'zw', label: 'ZW' },
];

const SCRAPER_BASE_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '';

interface LoadMoreControlProps {
  loadedCount: number;
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

const LoadMoreControl: React.FC<LoadMoreControlProps> = ({
  loadedCount,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
}) => {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-sm select-none" style={{ fontFamily: '"Museo Sans", sans-serif' }}>
      <div className="flex items-center gap-2 text-[11px] text-gray-500">
        <span>{loadedCount} / {total}</span>
        <button
          type="button"
          onClick={onLoadMore}
          disabled={!hasMore || loadingMore}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border bg-white p-0 leading-none transition-all duration-200 ${
            !hasMore
              ? 'cursor-not-allowed border-gray-200 text-gray-300'
              : loadingMore
                ? 'cursor-wait border-gray-300 text-gray-600'
                : 'cursor-pointer border-gray-300 text-gray-600 hover:-translate-y-0.5 hover:border-gray-400 hover:text-gray-900'
          }`}
          aria-label={loadingMore ? 'Loading more' : hasMore ? 'Load more' : 'All loaded'}
          title={loadingMore ? 'Loading more...' : hasMore ? 'Load more' : 'All loaded'}
        >
          <span className="inline-flex h-full w-full items-center justify-center">
            {loadingMore ? (
              <Loader2 className="block h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronDown className="block h-3.5 w-3.5" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
};

const AppsFinder: React.FC = () => {
  const { userProfile } = useUser();
  const isSuperAdmin = userProfile?.role === 'Super Admin';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(true); // The initial state is set to true and Loading is displayed
  const [dataSource, setDataSource] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const APPS_FINDER_SKELETON_SLOT_HEIGHT = 86;
  const APPS_FINDER_SKELETON_MIN = 4;
  const APPS_FINDER_SKELETON_MAX = 12;
  const [appsFinderSkeletonCount, setAppsFinderSkeletonCount] = useState(pageSize);
  const appsFinderCardsContainerRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const autoLoadTriggerRef = useRef(false);
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [appNameOptions, setAppNameOptions] = useState<string[]>([]);
  const [platformOptions, setPlatformOptions] = useState<string[]>([]);
  const [countryOptions, setCountryOptions] = useState<string[]>([]);
  
  // Icon preload status - removed, use inline icon component, no preloading required

  const [filterValues, setFilterValues] = useState({
    os: '',
    appId: '',
    appName: '',
    category: '',
    country: ''
  });
  
  // iOS App Store Check related status
  const [iosSearchTerm, setIosSearchTerm] = useState('');
  const [iosCountry, setIosCountry] = useState('us');
  const [iosSearchLoading, setIosSearchLoading] = useState(false);
  const [iosAppInfo, setIosAppInfo] = useState<import('../services/appStoreApi').AppStoreAppInfo | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [platformType, setPlatformType] = useState<'ios' | 'google'>('ios');
  const [searchMode, setSearchMode] = useState<'normal' | 'survey'>('normal');
  const [countrySelectorVisible, setCountrySelectorVisible] = useState(false);
  const [countrySearchText, setCountrySearchText] = useState<string>('');
  const [surveyAvailableCountries, setSurveyAvailableCountries] = useState<string[]>([]);
  
  // Google Play query related status
  const [googleSearchTerm, setGoogleSearchTerm] = useState('');
  const [googleCountry, setGoogleCountry] = useState('us');
  const [googleSearchLoading, setGoogleSearchLoading] = useState(false);
  const [googleAppInfo, setGoogleAppInfo] = useState<any>(null);
  const [googleHasSearched, setGoogleHasSearched] = useState(false);
  const [showGoogleMoreDetails, setShowGoogleMoreDetails] = useState(false);
  
  // Icon preload status
  const [preloadedIcons, setPreloadedIcons] = useState<Set<string>>(new Set());
  
  // App details popup status
  const [appDetailModalVisible, setAppDetailModalVisible] = useState(false);
  const [selectedAppDetail, setSelectedAppDetail] = useState<any>(null);
  
  // Add ref related to data persistence
  // Check if the current App is already stored in the database
  const isAppAlreadyStored = (currentAppId: string, currentCountry: string): boolean => {
    return dataSource.some(item => 
      item.appId === currentAppId && 
      item.country === currentCountry
    );
  };

  // Cache of loaded images to avoid resetting when re-rendering
  const loadedImagesCache = useRef<Set<string>>(new Set());

  // Lazy loading of image components
  const LazyImage: React.FC<{
    src: string;
    alt: string;
    className?: string;
    style?: React.CSSProperties;
    onLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
    onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
    eager?: boolean; // If true, load immediately (for pop-ups, etc.)
  }> = ({ src, alt, className, style, onLoad, onError, eager = false }) => {
    // If the image is already in the cache, display it directly
    const isCached = useMemo(() => loadedImagesCache.current.has(src), [src]);
    const [isInView, setIsInView] = useState(() => eager || isCached);
    const [isLoaded, setIsLoaded] = useState(isCached);
    const imgRef = useRef<HTMLImageElement>(null);

    // When src changes, check if cached
    useEffect(() => {
      if (isCached && !isInView) {
        setIsInView(true);
      }
      if (isCached && !isLoaded) {
        setIsLoaded(true);
      }
    }, [src, isCached, isInView, isLoaded]);

    useEffect(() => {
      // If cached or in eager mode, return directly
      if (eager || isCached || !imgRef.current) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setIsInView(true);
              observer.disconnect();
            }
          });
        },
        {
          rootMargin: '50px', // Start loading 50px in advance
          threshold: 0.01
        }
      );

      observer.observe(imgRef.current);

      return () => {
        observer.disconnect();
      };
    }, [eager, isCached, src]);

    const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
      // Mark as loaded and add to cache
      setIsLoaded(true);
      if (src) {
        loadedImagesCache.current.add(src);
      }
      onLoad?.(e);
    };

    // Calculate final opacity: if loaded or cached, use the passed opacity or default to 1
    const finalOpacity = isLoaded || isCached 
      ? (style?.opacity !== undefined ? style.opacity : 1)
      : (style?.opacity !== undefined ? style.opacity : 0);

    return (
      <img
        ref={imgRef}
        src={isInView ? src : undefined}
        alt={alt}
        className={className}
        style={{
          ...style,
          opacity: finalOpacity
        }}
        loading={eager ? "eager" : undefined}
        onLoad={handleLoad}
        onError={onError}
      />
    );
  };

  // Optimized preloaded app icons - only the first 20 visible areas are preloaded
  const preloadAppIcons = async (apps: any[], limit: number = 20) => {
    const iconUrls = apps
      .slice(0, limit) // Only preload the first N
      .map(app => app.iconUrl)
      .filter(url => url && typeof url === 'string')
      .filter((url, index, arr) => arr.indexOf(url) === index); // Remove duplicates

    // Load in batches, 5 per batch
    const batchSize = 5;
    for (let i = 0; i < iconUrls.length; i += batchSize) {
      const batch = iconUrls.slice(i, i + batchSize);
      const preloadPromises = batch.map(url => {
      return new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve(url);
        };
        img.onerror = () => {
          resolve(url); // Mark as handled even if it fails
        };
        img.src = url;
      });
    });

    try {
      const loadedUrls = await Promise.all(preloadPromises);
      setPreloadedIcons(prev => {
        const newSet = new Set(prev);
          loadedUrls.forEach(url => {
            newSet.add(url);
            // Also add cache to avoid flickering when re-rendering
            loadedImagesCache.current.add(url);
          });
        return newSet;
      });
        // A slight delay between batches to avoid blocking the main thread
        if (i + batchSize < iconUrls.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
    } catch (error) {
        console.error('Failed to preload app icons batch:', error);
      }
    }
  };

  // Get the App ID and Country of the current query
  const getCurrentApp = (): { appId: string; country: string } => {
    const surveyCountry = surveyAvailableCountries[0] || '';
    if (platformType === 'ios' && iosAppInfo) {
      return {
        appId: iosSearchTerm.trim(),
        country: searchMode === 'survey' ? surveyCountry : iosCountry
      };
    } else if (platformType === 'google' && googleAppInfo) {
      return {
        appId: googleSearchTerm.trim(),
        country: searchMode === 'survey' ? surveyCountry : googleCountry
      };
    }
    return { appId: '', country: '' };
  };

  // Check if the current App has been stored
  const currentApp = getCurrentApp();
  const isAlreadyStored = currentApp.appId && currentApp.country ? 
    isAppAlreadyStored(currentApp.appId, currentApp.country) : false;
  
  // Add ref related to data persistence
  const hasRestoredDataRef = useRef(false);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<{ file_type: string; sheets: { name: string; index: number; valid: boolean; row_count: number; missing?: string[] }[]; file_name: string } | null>(null);
  const [uploadSheetIndex, setUploadSheetIndex] = useState<number>(0);
  const [uploadPreviewLoading, setUploadPreviewLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Add state to store app information
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_storedApps, setStoredApps] = useState<any[]>([]);
  const [storingApp, setStoringApp] = useState(false);
  const [deletingApps, setDeletingApps] = useState<Set<string>>(new Set()); // Change to manage deletion status by app ID
  const [copyingDescription, setCopyingDescription] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  
  // Add CSS animation style
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes copySpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes fadeIn {
        0% { opacity: 0; transform: scale(0.8); }
        100% { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
  // Functions that store App information into the database
  const storeAppInfo = async (appInfo: any, platform: 'ios' | 'google', forcedCountry?: string) => {
    if (storingApp) return; // Prevent duplicate clicks
    
    const MIN_LOADING_MS = 1000;
    const startAt = Date.now();
    setStoringApp(true);
    
        // Prepare stored data - moved outside try for access in catch
    const resolvedIosAppId = (() => {
      const storeId = appInfo?.id || appInfo?.trackId;
      if (storeId !== undefined && storeId !== null && String(storeId).trim() !== '') {
        return String(storeId).trim();
      }
      const bundleId = appInfo?.bundleId || appInfo?.appId;
      if (bundleId && String(bundleId).trim() !== '') {
        return String(bundleId).trim();
      }
      return iosSearchTerm.trim();
    })();

    const resolvedGoogleAppId = (() => {
      if (appInfo?.appId && String(appInfo.appId).trim() !== '') {
        return String(appInfo.appId).trim();
      }
      return googleSearchTerm.trim();
    })();

    const appData = {
      app_id: platform === 'ios' ? resolvedIosAppId : resolvedGoogleAppId,
      country: forcedCountry || (platform === 'ios' ? iosCountry : googleCountry),
      os: platform === 'ios' ? 'IOS' : 'Android',
      app_name: platform === 'ios' ? (appInfo.trackName || appInfo.title) : appInfo.title,
      developer: platform === 'ios' ? (appInfo.artistName || appInfo.developer) : appInfo.developer,
      developer_url: platform === 'ios' ? appInfo.developerWebsite : appInfo.developerWebsite,
      category: platform === 'ios' ? (appInfo.primaryGenreName || appInfo.primaryGenre) : appInfo.genre,
      description: platform === 'ios' ? appInfo.description : appInfo.description,
      url: platform === 'ios' ? (appInfo.trackViewUrl || appInfo.url) : appInfo.url,
      icon_url: platform === 'ios' ? (appInfo.artworkUrl512 || appInfo.artworkUrl100 || appInfo.icon) : appInfo.icon,
      rating: platform === 'ios' ? 
        (appInfo.averageUserRating ? Math.round(appInfo.averageUserRating * 10) / 10 : 
         appInfo.score ? Math.round(appInfo.score * 10) / 10 : null) : 
        (appInfo.score ? Math.round(appInfo.score * 10) / 10 : null),
      rating_count: platform === 'ios' ? (appInfo.userRatingCount || appInfo.reviews) : appInfo.reviews,
      keywords: platform === 'ios' ? 
        (() => {
          const tags: string[] = [];
          // Content rating
          if (appInfo.contentRating) tags.push(appInfo.contentRating);
          // price tag
          if (appInfo.free !== undefined) {
            tags.push(appInfo.free ? 'Free' : 'Paid');
          }
          // Secondary categories: add from genres, exclude main categories, remove duplicates
          const mainGenre = String(appInfo.primaryGenreName || appInfo.primaryGenre || '').trim().toLowerCase();
          if (Array.isArray(appInfo.genres)) {
            const seen = new Set(tags.map(t => t.toLowerCase()));
            appInfo.genres.forEach((g: string) => {
              const trimmed = String(g || '').trim();
              if (!trimmed) return;
              const norm = trimmed.toLowerCase();
              if (norm && norm !== mainGenre && !seen.has(norm)) {
                seen.add(norm);
                tags.push(trimmed);
              }
            });
          }
          // Version number label
          if (appInfo.version) {
            const v = String(appInfo.version).trim();
            if (v) tags.push(`v${v}`);
          }
          return tags.length > 0 ? tags.join(',') : null;
        })() : 
        (() => {
          const generated = GooglePlayApiService.generateTagsFromCategories(appInfo) || [];
          const seen = new Set<string>();
          const mainGenre = String(appInfo.genre || '').trim().toLowerCase();
          const cleaned = generated.filter((t: string) => {
            const trimmed = String(t || '').trim();
            if (!trimmed) return false;
            const norm = trimmed.toLowerCase();
            if (norm === mainGenre) return false; // Filter duplicates with main category
            if (seen.has(norm)) return false; // Remove duplicates
            seen.add(norm);
            return true;
          });
          return cleaned.length > 0 ? cleaned.join(',') : null;
        })()
    };

    // Validate required fields and provide default values
    if (!appData.app_name) appData.app_name = 'Unknown App';
    if (!appData.developer) appData.developer = 'Unknown Developer';
    if (!appData.category) appData.category = 'Utilities';
    
    try {
      
      // Call the backend API to store data
      const response = await fetch('/api/apps-finder/store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(appData)
      });
      
      const result = await response.json();
      
      // If the HTTP status is not 200, throw an error
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${result.message || response.statusText}`);
      }
      
      if (result.success) {
        // Check if it already exists
        if (result.already_exists) {
          // Application information already exists: silently process it as required, without popping up the front-end notification
        } else {
          // Storage successful, added to local status
          const newStoredApp = {
            ...appData,
            id: Date.now(), // Temporary ID
            storedAt: new Date().toISOString()
          };
          
          setStoredApps(prev => [newStoredApp, ...prev]);

          // Refresh the data displayed at the bottom: Force back to the first page to ensure that newly saved records appear at the top in real time
          setCurrentPage(1);
          fetchData(1, pageSize, filters, false);
        }
      } else {
        // Storage failure: silently handle as required, no front-end notification
      }
    } catch (error: any) {
      console.error('Failed to store app info:', error);
      // Process silently as required without popping up front-end notifications
    } finally {
      const elapsed = Date.now() - startAt;
      const remain = Math.max(0, MIN_LOADING_MS - elapsed);
      if (remain > 0) {
        setTimeout(() => setStoringApp(false), remain);
      } else {
        setStoringApp(false);
      }
    }
  };

  // Delete app information
  const deleteAppInfo = async (appId: string, country: string) => {
    const uniqueKey = `${appId}_${country}`; // Use composite keys
    if (deletingApps.has(uniqueKey)) return; // Check if the app is being deleted
    
    setDeletingApps(prev => new Set(prev).add(uniqueKey)); // Collection added to delete
    try {
      const response = await fetch(`/api/apps-finder/delete/${appId}?country=${country}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Deletion successful, removed from local state (using composite key matching)
        setStoredApps(prev => prev.filter(app => !(app.app_id === appId && app.country === country)));
        
        // Show success message
        showNotification.success(
          'App information deleted successfully'
        );
        
        // Intelligent adjustment of paging: If the current page is the last page and there is only one piece of data, return to the previous page
        const newTotal = total - 1;
        const maxPage = Math.ceil(newTotal / pageSize);
        const targetPage = currentPage > maxPage ? Math.max(1, maxPage) : currentPage;
        
        // If the target page is different from the current page, update the page first
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
        
        // Refresh the data displayed at the bottom
        fetchData(targetPage, pageSize, filters);
      } else {
        // Delete failed
        showNotification.error(
          `Delete failed: ${result.message}`
        );
      }
    } catch (error) {
      console.error('Failed to delete app info:', error);
      showNotification.error(
        'Delete failed, please check network connection'
      );
    } finally {
      setDeletingApps(prev => {
        const newSet = new Set(prev);
        newSet.delete(uniqueKey); // Remove from collection in delete
        return newSet;
      });
    }
  };

  // Copy app description
  const copyAppDescription = async (description: string) => {
    if (copyingDescription || !description) return;
    
    setCopyingDescription(true);
    setCopySuccess(false);
    
    // Immediately clear the background color of all copy buttons
    const copyButtons = document.querySelectorAll('[data-copy-button="true"]');
    copyButtons.forEach(button => {
      if (button instanceof HTMLElement) {
        button.style.backgroundColor = 'transparent';
      }
    });

    const legacyCopyText = (text: string) => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      textarea.style.left = '-1000px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    };
    
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(description);
      } else {
        const copied = legacyCopyText(description);
        if (!copied) {
          throw new Error('Clipboard API unavailable and legacy copy failed');
        }
      }
      
      // Ensure that the copying status is displayed for at least 500ms to provide a silky animation experience
      setTimeout(() => {
        setCopyingDescription(false);
        setCopySuccess(true);
        showNotification.success(
          'App description copied to clipboard'
        );
        
        // Reset success status after 5 seconds
        setTimeout(() => {
          setCopySuccess(false);
        }, 5000);
      }, 500);
      
    } catch (error) {
      console.error('Failed to copy:', error);
      setCopyingDescription(false);
      showNotification.error(
        'Copy failed, please copy manually'
      );
    }
  }; // Track whether data has been recovered
  

  
  // Control whether more app details are shown
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  
  // Controls whether all labels are displayed
  const [showAllTags, setShowAllTags] = useState(false);
  
  // Device type selector status
  const [selectedDeviceType, setSelectedDeviceType] = useState<'iphone' | 'ipad'>('iphone');
  
  // Platform options data - dynamically generated
  const osOptions = useMemo(() => {
    return platformOptions.map(platform => ({
      label: platform === 'IOS' ? 'App Store' : 'Google Play',
      value: platform
    }));
  }, [platformOptions]);
  
  // Drop-down menu status management
  const [osSelectorVisible, setOsSelectorVisible] = useState(false);
  
  // App Name Filter status management
  const [appNameSelectorVisible, setAppNameSelectorVisible] = useState(false);
  const [appNameSearchText, setAppNameSearchText] = useState<string>('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [appNameSearchMode, _setAppNameSearchMode] = useState<boolean>(false);
  
  // App ID Filter status management
  const [appIdSelectorVisible, setAppIdSelectorVisible] = useState(false);
  const [appIdSearchText, setAppIdSearchText] = useState<string>('');
  
  // Select Category Status Management
  const [categorySelectorVisible, setCategorySelectorVisible] = useState(false);

  // Select Geo (country) state management - radio selection, style logic inheritance Select Category
  const [geoSelectorVisible, setGeoSelectorVisible] = useState(false);
  const [geoSearchText, setGeoSearchText] = useState<string>('');
  
  // X Apps button state management
  const [xAppsSelectorVisible, setXAppsSelectorVisible] = useState(false);
  
  // Delete confirmation pop-up window status management
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Single app deletion confirmation bubble state management (use appId_country as key)
  const [deleteConfirmBubble, setDeleteConfirmBubble] = useState<string | null>(null);
  const [bubblePosition, setBubblePosition] = useState<{ top: number; right: number } | null>(null);
  
  // Icon preloading logic has been removed - use lucide-react inline icon component, no preloading required
  
  // Update confirmation bubble position
  useEffect(() => {
    if (!deleteConfirmBubble) {
      setBubblePosition(null);
      return;
    }
    
    const updatePosition = () => {
      const button = document.querySelector(`[data-delete-button="${deleteConfirmBubble}"]`) as HTMLElement;
      if (button) {
        const rect = button.getBoundingClientRect();
        setBubblePosition({
          top: rect.bottom + 4,
          right: window.innerWidth - rect.right
        });
      }
    };
    
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [deleteConfirmBubble]);
  
  
  // Set button state management
  const [settingsVisible, setSettingsVisible] = useState(false);
  
  // Set cache key name
  const SETTINGS_STORAGE_KEY = 'appsFinder_settings';
  
  // Default setting
  const defaultSettings = {
    autoAddApps: false,
    waitTime: '5',
    retrySet: '3'
  };
  
  // Load settings from local storage
  const loadSettings = () => {
    try {
      const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (savedSettings) {
        return { ...defaultSettings, ...JSON.parse(savedSettings) };
      }
    } catch (error) {
      console.error('Failed to load settings from localStorage:', error);
    }
    return defaultSettings;
  };
  
  // Save settings to local storage
  const saveSettings = (settings: typeof defaultSettings) => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings to localStorage:', error);
    }
  };
  
  // Auto Add Apps settings status
  const [autoAddApps, setAutoAddApps] = useState(() => loadSettings().autoAddApps);
  
  // Wait set status
  const [waitTime, setWaitTime] = useState(() => loadSettings().waitTime);
  
  // Retry Set set status
  const [retrySet, setRetrySet] = useState(() => loadSettings().retrySet);
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _language = 'en'; // Default to English

  // Monitor settings changes and automatically save to local storage
  useEffect(() => {
    const currentSettings = {
      autoAddApps,
      waitTime,
      retrySet
    };
    saveSettings(currentSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAddApps, waitTime, retrySet]); // saveSettings is a stable function and does not need to be a dependency

  // Formatted download display
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatDownloadCount = (count: number): string => {
    if (count >= 1000000000) {
      return (count / 1000000000).toFixed(1) + 'B';
    } else if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K';
    } else {
      return count.toString();
    }
  };

  // Filter App Name option
  const filteredAppNameOptions = appNameOptions.filter(name => 
    name.toLowerCase().includes(appNameSearchText.toLowerCase())
  );

  // Filter App ID options
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _filteredAppIdOptions = dataSource
    .map(item => item.appId)
    .filter((appId, index, arr) => appId && arr.indexOf(appId) === index) // Remove duplicates
    .filter(appId => 
      appId.toLowerCase().includes(appIdSearchText.toLowerCase())
    );

  // Full library App ID option (for App ID Filter drop-down menu)
  const [allAppIdOptions, setAllAppIdOptions] = useState<string[]>([]);
  
  // Filter the entire library App ID option
  const filteredAllAppIdOptions = allAppIdOptions.filter(appId => 
    appId.toLowerCase().includes(appIdSearchText.toLowerCase())
  );

  // Filter Geo options (Select Geo filter)
  const filteredGeoOptions = useMemo(() => {
    const search = geoSearchText.toLowerCase().trim();
    if (!search) return countryOptions;

    return countryOptions.filter((country) => {
      const code = country.toLowerCase();
      const label =
        COUNTRY_OPTIONS.find((option) => option.value === code)?.label?.toLowerCase() ?? code;
      return code.includes(search) || label.includes(search);
    });
  }, [countryOptions, geoSearchText]);
  
  // Filter country options - based on country codes supported by app-store-scraper
  const filteredCountryOptions = useMemo(() => {
    const searchText = countrySearchText.toLowerCase().trim();
    if (!searchText) return COUNTRY_OPTIONS;

    return COUNTRY_OPTIONS.filter(option =>
      option.value.toLowerCase().includes(searchText) || 
      option.label.toLowerCase().includes(searchText)
    );
  }, [countrySearchText]);

  useEffect(() => {
    if (searchMode === 'survey') {
      setCountrySelectorVisible(false);
      setCountrySearchText('');
    }
  }, [searchMode]);




  
  // Handling country selector dropdown menu animation and scroll events
  useEffect(() => {
    if (countrySelectorVisible) {
      const timer = setTimeout(() => {
        const dropdown = document.querySelector('[data-country-selector-dropdown]') as HTMLElement;
        if (dropdown) {
          dropdown.style.transform = 'translateY(0) scale(1)';
          dropdown.style.opacity = '1';
        }
      }, 10);

      // Add a scroll event listener to close the drop-down menu when the page scrolls
      const handleScroll = () => {
        setCountrySelectorVisible(false);
      };

      // Add click external event listener
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const countrySelector = document.querySelector('[data-country-selector]');
        const dropdown = document.querySelector('[data-country-selector-dropdown]');
        
        if (countrySelector && dropdown && 
            !countrySelector.contains(target) && 
            !dropdown.contains(target)) {
          setCountrySelectorVisible(false);
        }
      };

      window.addEventListener('scroll', handleScroll, { passive: true });
      document.addEventListener('click', handleClickOutside);

      return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', handleScroll);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [countrySelectorVisible]);
  
  // Handling scroll and click external close events for AppsFinder Storage filters
  useEffect(() => {
    // Check if any filter dropdowns are open
    const hasOpenDropdown = osSelectorVisible || categorySelectorVisible || geoSelectorVisible || appIdSelectorVisible || appNameSelectorVisible || xAppsSelectorVisible || settingsVisible;
    
    if (hasOpenDropdown) {
      // Add a scroll event listener to close all drop-down menus when the page scrolls
      const handleScroll = () => {
        setOsSelectorVisible(false);
        setCategorySelectorVisible(false);
        setGeoSelectorVisible(false);
        setAppIdSelectorVisible(false);
        setAppNameSelectorVisible(false);
        setXAppsSelectorVisible(false);
        setSettingsVisible(false);
      };

      // Add click external event listener
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        
        // Check all filter selectors and drop-down menus
        const osSelector = document.querySelector('[data-os-selector]');
        const osDropdown = document.querySelector('[data-os-selector-dropdown]');
        const categorySelector = document.querySelector('[data-category-selector]');
        const categoryDropdown = document.querySelector('[data-category-selector-dropdown]');
        const geoSelector = document.querySelector('[data-geo-selector]');
        const geoDropdown = document.querySelector('[data-geo-selector-dropdown]');
        const appIdSelector = document.querySelector('[data-appid-selector]');
        const appIdDropdown = document.querySelector('[data-appid-selector-dropdown]');
        const appNameSelector = document.querySelector('[data-appname-selector]');
        const appNameDropdown = document.querySelector('[data-appname-selector-dropdown]');
        
        // Check if the click is inside any selector or dropdown menu
        const isInsideOs = osSelector && osDropdown && 
          (osSelector.contains(target) || osDropdown.contains(target));
        const isInsideCategory = categorySelector && categoryDropdown && 
          (categorySelector.contains(target) || categoryDropdown.contains(target));
        const isInsideGeo = geoSelector && geoDropdown &&
          (geoSelector.contains(target) || geoDropdown.contains(target));
        const isInsideAppId = appIdSelector && appIdDropdown && 
          (appIdSelector.contains(target) || appIdDropdown.contains(target));
        const isInsideAppName = appNameSelector && appNameDropdown && 
          (appNameSelector.contains(target) || appNameDropdown.contains(target));
        const xAppsSelector = document.querySelector('[data-xapps-selector]') as HTMLElement;
        const xAppsDropdown = document.querySelector('[data-xapps-selector-dropdown]') as HTMLElement;
        const isInsideXApps = xAppsSelector && xAppsDropdown && 
          (xAppsSelector.contains(target) || xAppsDropdown.contains(target));
        const settingsSelector = document.querySelector('[data-settings-selector]') as HTMLElement;
        const settingsDropdown = document.querySelector('[data-settings-selector-dropdown]') as HTMLElement;
        const isInsideSettings = settingsSelector && settingsDropdown && 
          (settingsSelector.contains(target) || settingsDropdown.contains(target));
        
        // Close all dropdown menus if click is not inside any filter
        if (!isInsideOs && !isInsideCategory && !isInsideGeo && !isInsideAppId && !isInsideAppName && !isInsideXApps && !isInsideSettings) {
          setOsSelectorVisible(false);
          setCategorySelectorVisible(false);
          setGeoSelectorVisible(false);
          setAppIdSelectorVisible(false);
          setAppNameSelectorVisible(false);
          setXAppsSelectorVisible(false);
          setSettingsVisible(false);
        }
      };

      window.addEventListener('scroll', handleScroll, { passive: true });
      document.addEventListener('click', handleClickOutside);

      return () => {
        window.removeEventListener('scroll', handleScroll);
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [osSelectorVisible, categorySelectorVisible, geoSelectorVisible, appIdSelectorVisible, appNameSelectorVisible, xAppsSelectorVisible, settingsVisible]);
  
  // Add CSS animation style
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes countryDropdownFadeIn {
        from {
          transform: translateY(-10px) scale(0.95);
          opacity: 0;
        }
        to {
          transform: translateY(0) scale(1);
          opacity: 1;
        }
      }
      
      [data-country-selector-dropdown] {
        animation: countryDropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      
      [data-os-selector-dropdown],
      [data-category-selector-dropdown],
      [data-appid-selector-dropdown],
      [data-appname-selector-dropdown] {
        animation: countryDropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      }
      
      /*Unify scroll bar styles to avoid style conflicts*/
      ::-webkit-scrollbar {
        width: 8px;
        background-color: transparent;
      }
      
      ::-webkit-scrollbar-track {
        background-color: transparent;
        border-radius: 4px;
      }
      
      ::-webkit-scrollbar-thumb {
        background-color: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
        border: 1px solid transparent;
        background-clip: content-box;
      }
      
      ::-webkit-scrollbar-thumb:hover {
        background-color: rgba(0, 0, 0, 0.3);
      }
      
      ::-webkit-scrollbar-thumb:active {
        background-color: rgba(0, 0, 0, 0.4);
      }
      
      /*Firefox scroll bar styles*/
      * {
        scrollbar-width: thin;
        scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  // iOS App Store query processing function
  const handleIosSearch = async () => {
    if (!iosSearchTerm.trim()) {
      return;
    }

    setIosSearchLoading(true);
    setIosAppInfo(null);
    setHasSearched(true);
    setShowMoreDetails(false);
    setSelectedDeviceType('iphone'); // Reset the device type selector to iPhone
    setSurveyAvailableCountries([]);
    
    try {
      const timeoutMs = parseInt(waitTime) * 1000;
      const retryCount = parseInt(retrySet);
      let app: any = null;
      let countries: string[] = [];

      if (searchMode === 'survey') {
        const response = await fetch(`${SCRAPER_BASE_URL}/api/survey/availability`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'ios',
            appId: iosSearchTerm.trim(),
            countries: COUNTRY_OPTIONS.map(item => item.value),
          }),
        });

        if (response.ok) {
          const result = await response.json();
          app = result?.data?.app || null;
          countries = Array.isArray(result?.data?.availableCountries) ? result.data.availableCountries : [];
        } else if (response.status !== 404) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error || `Survey search failed with status ${response.status}`);
        }
      } else {
        // Import App Store API service
        const { appStoreApiService } = await import('../services/appStoreApi');
        // Use smart search: first search by Bundle ID, if failed, search by name
        app = await appStoreApiService.findApp(iosSearchTerm.trim(), iosCountry, timeoutMs, retryCount);
      }
      
      if (app) {
        setIosAppInfo(app);
        if (searchMode === 'survey') {
          setSurveyAvailableCountries(countries);
        }
        
        // Auto Add Apps function: If the switch is turned on, automatically add to the database
        if (autoAddApps) {
          const surveyCountry = searchMode === 'survey' ? countries[0] : undefined;
          await storeAppInfo(app, 'ios', surveyCountry);
        }
      }
    } catch (error) {
      console.error('Failed to query iOS app:', error);
    } finally {
      setIosSearchLoading(false);
    }
  };

  // Google Play query handler
  const handleGoogleSearch = async () => {
    if (!googleSearchTerm.trim()) {
      return;
    }

    setGoogleSearchLoading(true);
    setGoogleAppInfo(null);
    setGoogleHasSearched(true);
    setSurveyAvailableCountries([]);
    
    try {
      const timeoutMs = parseInt(waitTime) * 1000;
      const retryCount = parseInt(retrySet);
      let app: any = null;
      let countries: string[] = [];
      const GooglePlayApiService = await import('../services/googlePlayApi');

      if (searchMode === 'survey') {
        const response = await fetch(`${SCRAPER_BASE_URL}/api/survey/availability`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform: 'google',
            appId: googleSearchTerm.trim(),
            countries: COUNTRY_OPTIONS.map(item => item.value),
          }),
        });

        if (response.ok) {
          const result = await response.json();
          app = result?.data?.app || null;
          countries = Array.isArray(result?.data?.availableCountries) ? result.data.availableCountries : [];
        } else if (response.status !== 404) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.error || `Survey search failed with status ${response.status}`);
        }
      } else {
        // Note: The parameter order of the findApp method is (searchTerm, lang, country, timeout, retryCount)
        app = await GooglePlayApiService.default.findApp(googleSearchTerm.trim(), 'en', googleCountry, timeoutMs, retryCount);
      }
      
      if (app) {
        // Generate tags data
        const generatedTags = GooglePlayApiService.default.generateTagsFromCategories(app);
        const appWithTags = {
          ...app,
          tags: generatedTags
        };
        
        setGoogleAppInfo(appWithTags);
        if (searchMode === 'survey') {
          setSurveyAvailableCountries(countries);
        }
        
        // Auto Add Apps function: If the switch is turned on, automatically add to the database
        if (autoAddApps) {
          const surveyCountry = searchMode === 'survey' ? countries[0] : undefined;
          await storeAppInfo(appWithTags, 'google', surveyCountry);
        }
      }
    } catch (error) {
      console.error('Failed to query Google Play app:', error);
    } finally {
      setGoogleSearchLoading(false);
    }
  };





  const fetchData = async (
    page = 1,
    pageSize = 10,
    filters: Record<string, any> = {},
    append = false
  ) => {
    setLoading(true);
    if (append) {
      setIsLoadingMore(true);
    } else {
      setTableLoading(true); // Full screen loading is displayed only when full replacement is performed
    }
    
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filters.os) params.append('os', filters.os);
      if (filters.category) params.append('category', filters.category);
      if (filters.appId) params.append('appId', filters.appId);
      if (filters.appName) params.append('appName', filters.appName);
      if (filters.country) params.append('country', filters.country);

      const forceNoCache = shouldForceAppsFinderNoCache();
      if (forceNoCache) {
        params.set('nocache', '1');
      }

      const requestHeaders: HeadersInit = forceNoCache
        ? { 'X-AppsFinder-Force-Refresh': '1' }
        : {};
      const res = await fetch(`/api/apps-finder?${params.toString()}`, {
        headers: requestHeaders
      });
      const result = await res.json();
      
      // Make sure the data is in array format
      const appsData = Array.isArray(result.data) ? result.data : [];
      const newTotal = result.total || 0;
      
      // If the data is empty and the current page is not the first page, automatically roll back to the first page (only in non-append scenarios)
      if (!append && appsData.length === 0 && newTotal === 0 && page > 1) {
        setCurrentPage(1);
        setTimeout(() => {
          fetchData(1, pageSize, filters, false);
        }, 0);
        return;
      }

      // Set data (append mode is used for "slide to load more")
      setDataSource(prev => {
        if (!append) return appsData;
        const merged = [...prev, ...appsData];
        const deduped = merged.filter((item, idx, arr) => {
          const key = `${item.appId}_${item.country}`;
          return arr.findIndex(x => `${x.appId}_${x.country}` === key) === idx;
        });
        return deduped;
      });
      setTotal(newTotal);
      setHasMore((append ? (page - 1) * pageSize + appsData.length : appsData.length) < newTotal && appsData.length > 0);
      
      // Preload app icon
      if (appsData.length > 0) {
        preloadAppIcons(appsData, 20);
      }
    } catch (e) {
      console.error('Fetch data error:', e);
      if (!append) {
        setDataSource([]);
        setTotal(0);
      }
      setHasMore(false);
      showNotification.error('Query failed');
    } finally {
      setLoading(false);
      setTableLoading(false);
      setIsLoadingMore(false);
      autoLoadTriggerRef.current = false;
    }
  };

  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  const updateAppsFinderSkeletonCount = React.useCallback(() => {
    const containerHeight = appsFinderCardsContainerRef.current?.clientHeight || 0;
    const rowsByContainer = Math.ceil(
      Math.max(pageSize * APPS_FINDER_SKELETON_SLOT_HEIGHT, containerHeight) / APPS_FINDER_SKELETON_SLOT_HEIGHT
    );
    const rowsByData = dataSource.length > 0
      ? Math.min(APPS_FINDER_SKELETON_MAX, dataSource.length)
      : 0;
    const next = Math.min(
      APPS_FINDER_SKELETON_MAX,
      Math.max(APPS_FINDER_SKELETON_MIN, rowsByContainer, rowsByData)
    );
    setAppsFinderSkeletonCount((prev) => (prev === next ? prev : next));
  }, [dataSource.length, pageSize]);

  useEffect(() => {
    updateAppsFinderSkeletonCount();
  }, [updateAppsFinderSkeletonCount]);

  useEffect(() => {
    if (!tableLoading) {
      return;
    }
    updateAppsFinderSkeletonCount();
    const container = appsFinderCardsContainerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(() => {
      updateAppsFinderSkeletonCount();
    });
    observer.observe(container);
    const handleResize = () => updateAppsFinderSkeletonCount();
    window.addEventListener('resize', handleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [tableLoading, updateAppsFinderSkeletonCount]);

  // Restore app data on page load and page visibility change
  useEffect(() => {
    const restoreAppsData = () => {
      // Skip if data has been recovered and currently has data
      if (hasRestoredDataRef.current && dataSource.length > 0) {
        return;
      }

      try {
        const savedData = localStorage.getItem('allAppsFinderData');
        if (savedData) {
          const parsedData = JSON.parse(savedData);
          if (parsedData.data && Array.isArray(parsedData.data) && parsedData.data.length > 0) {
            setDataSource(parsedData.data);
            setTotal(parsedData.total || 0);
            setCurrentPage(parsedData.page || 1);
            setHasMore((parsedData.data?.length || 0) < (parsedData.total || 0));
            // Note: Filter status remains unchanged during data recovery and is only reset during user active operation or global refresh
            hasRestoredDataRef.current = true; // Flag restored
            setTableLoading(false); // Stop loading after restoring data
            
            // Preload restored app icons
            if (parsedData.data.length > 0) {
              preloadAppIcons(parsedData.data, 20);
            }
          }
        }
      } catch (error) {
        console.error('Failed to restore apps data from localStorage:', error);
      }
    };

    // Restore on page load
    restoreAppsData();

    // Monitor page visibility changes (page switching, tab switching, etc.)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Delay for a while to ensure that the component status is stable
        setTimeout(() => {
          restoreAppsData();
        }, 100);
      }
    };

    // Listen to page focus changes (returning from other pages)
    const handleFocus = () => {
      // Delay for a while to ensure that the component status is stable
      setTimeout(() => {
        restoreAppsData();
      }, 100);
    };

    // Monitor browser history changes (page switching)
    const handlePopState = () => {
      // Delay for a while to ensure that the component status is stable
      setTimeout(() => {
        restoreAppsData();
      }, 100);
    };

    // Monitor page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Monitor page focus changes
    window.addEventListener('focus', handleFocus);
    
    // Monitor browser history changes
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [dataSource.length]); // Rely on dataSource.length to detect state changes

  // Additional data recovery mechanism: regularly checks and recovers data
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Restore if there is currently no data but there is data in localStorage
      if (dataSource.length === 0) {
        try {
          const savedData = localStorage.getItem('allAppsFinderData');
          if (savedData) {
            const parsedData = JSON.parse(savedData);
            if (parsedData.data && Array.isArray(parsedData.data) && parsedData.data.length > 0) {
              setDataSource(parsedData.data);
              setTotal(parsedData.total || 0);
              setCurrentPage(parsedData.page || 1);
              setHasMore((parsedData.data?.length || 0) < (parsedData.total || 0));
              // Note: Filter status remains unchanged during data recovery and is only reset during user active operation or global refresh
              hasRestoredDataRef.current = true;
              setTableLoading(false);
              
              // Preload restored app icons
              if (parsedData.data.length > 0) {
                preloadAppIcons(parsedData.data, 20);
              }
            }
          }
        } catch (error) {
          console.error('Failed to restore apps data from localStorage during interval check:', error);
        }
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(intervalId);
  }, [dataSource.length]);

  // Filter state is only reset on global refresh (component remounted, useState initialized to default value);
  // Stable when switching tabs, windows out of focus/focus, browser forward/backward, loading more, etc.

  // Country selector sync logic: ensure the country setting for the current platform is displayed correctly
  useEffect(() => {
    // Make sure the country selector shows the correct country when the platform type changes
    if (platformType === 'ios') {
      // iOS platform: Make sure iosCountry has a value
      if (!iosCountry) {
        setIosCountry('us');
      }
    } else {
      // Google Play Platform: Make sure googleCountry has a value
      if (!googleCountry) {
        setGoogleCountry('us');
      }
    }
  }, [platformType, iosCountry, googleCountry]);

  // Get option data based on current filter criteria
  const fetchFilterOptions = async (currentFilters: Record<string, any> = {}) => {
    try {
      const params = new URLSearchParams();
      if (currentFilters.os) params.append('os', currentFilters.os);
      if (currentFilters.category) params.append('category', currentFilters.category);
      if (currentFilters.appId) params.append('appId', currentFilters.appId);
      if (currentFilters.appName) params.append('appName', currentFilters.appName);
      if (currentFilters.country) params.append('country', currentFilters.country);

      const forceNoCache = shouldForceAppsFinderNoCache();
      if (forceNoCache) {
        params.set('nocache', '1');
      }
      
      const queryString = params.toString();
      const baseUrl = '/api/apps-finder';
      const requestHeaders: HeadersInit = forceNoCache
        ? { 'X-AppsFinder-Force-Refresh': '1' }
        : {};
      
      const [categoryRes, appNameRes, appIdRes, platformRes, countryRes] = await Promise.all([
        fetch(`${baseUrl}/categories${queryString ? '?' + queryString : ''}`, { headers: requestHeaders }),
        fetch(`${baseUrl}/app-names${queryString ? '?' + queryString : ''}`, { headers: requestHeaders }),
        fetch(`${baseUrl}/app-ids${queryString ? '?' + queryString : ''}`, { headers: requestHeaders }),
        fetch(`${baseUrl}/platforms${queryString ? '?' + queryString : ''}`, { headers: requestHeaders }),
        fetch(`${baseUrl}/countries${queryString ? '?' + queryString : ''}`, { headers: requestHeaders })
      ]);
      
      const [categoryData, appNameData, appIdData, platformData, countryData] = await Promise.all([
        categoryRes.json(),
        appNameRes.json(),
        appIdRes.json(),
        platformRes.json(),
        countryRes.json()
      ]);
      
      setCategoryOptions(Array.isArray(categoryData) ? categoryData : []);
      setAppNameOptions(Array.isArray(appNameData) ? appNameData : []);
      setAllAppIdOptions(Array.isArray(appIdData) ? appIdData : []);
      setPlatformOptions(Array.isArray(platformData) ? platformData : []);
      setCountryOptions(Array.isArray(countryData) ? countryData : []);
    } catch (error) {
      console.error('Failed to fetch filter options:', error);
      setCategoryOptions([]);
      setAppNameOptions([]);
      setAllAppIdOptions([]);
      setPlatformOptions([]);
      setCountryOptions([]);
    }
  };

  // Load all options on initialization
  useEffect(() => {
    // Set default platform options first, then get all options
    setPlatformOptions(['IOS', 'Android']);
    fetchFilterOptions();
  }, []);

  // Update options for other filters when filter conditions change
  useEffect(() => {
    fetchFilterOptions(filters);
  }, [filters]);

  // Automatically close all drop-down menus when the page scrolls (but allow sliding within the drop-down content area)
  useEffect(() => {
    const handleScroll = (_e: Event) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // const target = e.target as HTMLElement;
      // There is no need to close the dropdown anymore as we now use custom buttons
      // There is no need to close the dropdown anymore as we now use custom buttons
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

  const handleQuery = (values: any) => {
    setFilters(values);
    setCurrentPage(1);
    setHasMore(true);
    
    // Filter items are no longer saved to localStorage and are only valid within the page.
    // Execute filter query immediately
    fetchData(1, pageSize, values, false);
  };

  // Initialize data when page loads
  useEffect(() => {
    // Only get data when the page first loads
    if (dataSource.length === 0) {
      fetchData(1, pageSize, filters, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array, only executed once when the component is mounted (fetchData, currentPage, pageSize, filters, dataSource.length do not need to be used as dependencies)

  const handleLoadMore = () => {
    if (tableLoading || isLoadingMore || !hasMore) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    fetchData(nextPage, pageSize, filters, true);
  };

  useEffect(() => {
    const onScroll = () => {
      if (tableLoading || isLoadingMore || !hasMore || autoLoadTriggerRef.current) return;
      const viewportBottom = window.scrollY + window.innerHeight;
      const pageBottom = document.documentElement.scrollHeight - 80;
      if (viewportBottom >= pageBottom) {
        autoLoadTriggerRef.current = true;
        const nextPage = currentPage + 1;
        setCurrentPage(nextPage);
        fetchDataRef.current(nextPage, pageSize, filters, true);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [tableLoading, isLoadingMore, hasMore, currentPage, pageSize, filters]);





  return (
    <div style={{ 
      maxWidth: '1800px', 
      margin: '0 auto', 
      padding: '24px',
      fontFamily: '"Museo Sans", sans-serif',
      fontWeight: 300,
      fontSize: 13,
      lineHeight: '20px',
      letterSpacing: '0.0025em',
      userSelect: 'none'
    }}>
      {/* Function switching component - Firecrawl style */}
      <div style={{ marginBottom: '24px' }}>
        <div 
          style={{
            maxWidth: '452px',
            padding: '30px 0',
            display: 'flex',
            justifyContent: 'center',
            margin: '0 auto',
            position: 'relative'
          }}
        >
          {/* Function toggle button container */}
          <div 
            className="flex items-center rounded p-2 relative bg-black/5 shadow-[0px_6px_12px_0px_rgba(0,0,0,0.02)_inset,0px_0.75px_0.75px_0px_rgba(0,0,0,0.02)_inset,0px_0.25px_0.25px_0px_rgba(0,0,0,0.04)_inset]"
          >
            {/* Current selection indicator slider */}
            <div 
              className={`absolute top-2 h-8 rounded w-[120px] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
                platformType === 'ios' 
                  ? 'bg-gradient-to-br from-blue-500 to-blue-700 translate-x-0' 
                  : 'bg-gradient-to-br from-green-500 to-green-700 translate-x-[140px]'
              }`}
            />
            
            {/* App Store Button */}
            <button 
              className={`text-sm py-2 px-4 relative transition-colors duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] flex items-center justify-center cursor-pointer border-none bg-transparent w-[120px] h-8 select-none font-semibold ${
                platformType === 'ios' 
                  ? 'text-white' 
                  : 'text-gray-600/90'
              }`}
              onClick={() => {
                setPlatformType('ios');
                setSurveyAvailableCountries([]);
                // Clean up Google Play related status
                setGoogleAppInfo(null);
                setGoogleHasSearched(false);
                setGoogleSearchTerm('');
                setShowGoogleMoreDetails(false);
              }}
            >
              <span className="tracking-[0.005em] transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]">
                App Store
              </span>
            </button>
            
            {/* divider */}
            <div className="px-2">
              <div className="w-1 h-8 bg-black/5"></div>
            </div>
            
            {/* Google Play button */}
            <button 
              className={`text-sm py-2 px-4 relative transition-colors duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] flex items-center justify-center cursor-pointer border-none bg-transparent w-[120px] h-8 select-none font-semibold ${
                platformType === 'ios' 
                  ? 'text-gray-600/90' 
                  : 'text-white'
              }`}
              onClick={() => {
                setPlatformType('google');
                setSurveyAvailableCountries([]);
                // Clean up iOS related status
                setIosAppInfo(null);
                setHasSearched(false);
                setIosSearchTerm('');
                setShowMoreDetails(false);
              }}
            >
              <span className="tracking-[0.005em] transition-opacity duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]">
                Google Play
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* iOS App Store Info Container Block - Firecrawl Style Design - Move to Top */}
      <div style={{ marginBottom: '24px' }}>
        <div 
          className="bg-accent-white w-full rounded-20"
          style={{
            boxShadow: '0px 40px 48px -20px rgba(0, 0, 0, 0.02), 0px 32px 32px -20px rgba(0, 0, 0, 0.03), 0px 16px 24px -12px rgba(0, 0, 0, 0.03), 0px 0px 0px 1px rgba(0, 0, 0, 0.03)',
            borderRadius: '2px',
            background: '#ffffff'
          }}
        >


          {/* input area */}
          <label className="block overflow-hidden cursor-text h-16 p-4">
            <div className="flex items-center h-full transition-all duration-400">
              <input 
                className="w-full bg-transparent text-base text-gray-800 placeholder:text-gray-400 border-none outline-none py-3 px-4 h-fit focus:outline-none focus:ring-0"
                placeholder={
                  searchMode === 'survey'
                    ? (
                      platformType === 'ios'
                        ? 'Enter App ID, Example 1294998195'
                        : 'Enter Package Name, Example com.binance.dev'
                    )
                    : platformType === 'ios'
                    ? ('Enter App ID, Example 1294998195')
                    : platformType === 'google'
                    ? ('Enter Package Name, Example com.binance.dev')
                    : ('Enter APP ID, Bundle ID or app name')
                }
                value={platformType === 'ios' ? iosSearchTerm : googleSearchTerm}
                onChange={(e) => {
                  const value = e.target.value;
                  // Free input is allowed, and the specific format is parsed and verified by the backend.
                  if (platformType === 'ios') {
                    setIosSearchTerm(value);
                  } else {
                    setGoogleSearchTerm(value);
                  }
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    if (platformType === 'ios') {
                    handleIosSearch();
                    } else {
                      handleGoogleSearch();
                    }
                  }
                }}
                // Set different input properties based on search mode
                autoComplete={((platformType === 'ios' || platformType === 'google') && appNameSearchMode) ? 'on' : 'off'}
                autoCorrect={((platformType === 'ios' || platformType === 'google') && appNameSearchMode) ? 'on' : 'off'}
                autoCapitalize={((platformType === 'ios' || platformType === 'google') && appNameSearchMode) ? 'sentences' : 'off'}
                spellCheck={((platformType === 'ios' || platformType === 'google') && appNameSearchMode)}
              />
            </div>
          </label>

          {/* Dividers and control areas */}
          <div className="border-t border-black-alpha-5 lg:flex lg:flex-wrap lg:items-start justify-between" style={{ borderTop: '1px solid rgba(0, 0, 0, 0.05)', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', minHeight: '64px' }}>
            {/* Left control button */}
            <div className="flex flex-wrap p-12 lg:flex-1 lg:min-w-0 lg-max:gap-8 gap-y-8 border-black-alpha-5 lg-max:border-b" style={{ display: 'flex', flexWrap: 'wrap', padding: '16px', flex: '1', minWidth: '0', gap: '8px', alignItems: 'center', minHeight: '64px' }}>
              {/* Country Selector - Forked Select Platform style */}
              <div className="relative" style={{ zIndex: 9999 }} data-country-selector>
                <button
                  onClick={() => {
                    if (searchMode === 'survey') return;
                    setCountrySelectorVisible(!countrySelectorVisible);
                  }}
                  disabled={searchMode === 'survey'}
                  className={`flex items-center gap-2 px-3 py-2 border border-gray-200 rounded bg-white text-sm font-medium text-gray-800 min-w-[120px] justify-between transition-all duration-200 h-9 select-none ${
                    searchMode === 'survey'
                      ? 'cursor-not-allowed opacity-60'
                      : 'cursor-pointer hover:bg-gray-50 hover:border-gray-300'
                  }`}
                  style={{
                    fontFamily: '"Museo Sans", sans-serif'
                  }}
                >
                  <span>
                    {searchMode === 'survey'
                      ? 'Poll'
                      : platformType === 'ios' 
                      ? (filteredCountryOptions?.find(option => option.value === iosCountry)?.label || 'US')
                      : (filteredCountryOptions?.find(option => option.value === googleCountry)?.label || 'US')
                    }
                  </span>
                  <svg 
                    width="12" 
                    height="12" 
                    viewBox="0 0 12 12" 
                    fill="none"
                    className={`transition-transform duration-200 ${countrySelectorVisible ? 'rotate-180' : 'rotate-0'}`}
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                
                {/* Country selector dropdown menu */}
                {countrySelectorVisible && searchMode !== 'survey' && (
                  <div
                    data-country-selector-dropdown
                    className="absolute top-full left-0 z-[99999] bg-white text-gray-800 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] rounded border border-gray-200 w-[120px] max-h-[280px] overflow-y-auto text-sm leading-5 opacity-0 translate-y-[-10px] scale-95 transition-all duration-300 origin-top"
                    style={{
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 300,
                      letterSpacing: '0.0025em',
                      WebkitFontSmoothing: 'antialiased',
                      textSizeAdjust: '100%',
                      WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                      opacity: countrySelectorVisible ? 1 : 0,
                      transform: countrySelectorVisible ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.95)'
                    }}
                  >
                    {/* search box */}
                    <div className="px-3 py-2 border-b border-gray-200">
                      <input
                        type="text"
                        placeholder="Enter"
                        value={countrySearchText}
                        onChange={(e) => {
                          const value = e.target.value;
                          // Only letters are allowed, up to 2 characters, automatically converted to uppercase
                          const filteredValue = value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
                          setCountrySearchText(filteredValue);
                        }}
                        onCompositionStart={(e) => {
                          // Block Chinese input method
                          e.preventDefault();
                        }}
                        onCompositionUpdate={(e) => {
                          // Block Chinese input method
                          e.preventDefault();
                        }}
                        onCompositionEnd={(e) => {
                          // Block Chinese input method
                          e.preventDefault();
                        }}
                        onKeyDown={(e) => {
                          // Block input of non-English characters
                          const key = e.key;
                          if (key.length === 1 && !/[a-zA-Z]/.test(key)) {
                            e.preventDefault();
                          }
                        }}
                        onInput={(e) => {
                          // Make sure the input content meets the requirements
                          const value = e.currentTarget.value;
                          const filteredValue = value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2);
                          if (value !== filteredValue) {
                            e.currentTarget.value = filteredValue;
                            setCountrySearchText(filteredValue);
                          }
                        }}
                        maxLength={2}
                        className="w-full outline-none border-0 bg-transparent text-sm text-gray-800 uppercase"
                        style={{
                          fontFamily: '"Museo Sans", sans-serif',
                          fontWeight: 300,
                          letterSpacing: '0.0025em'
                        }}
                      />
                    </div>
                    
                    <div className="max-h-[200px] overflow-y-auto">
                      {/* Country options list */}
                      {filteredCountryOptions?.map((option, index) => {
                        const isSelected = platformType === 'ios' ? iosCountry === option.value : googleCountry === option.value;
                        return (
                        <div
                          key={option.value}
                          onClick={() => {
                            if (platformType === 'ios') {
                              setIosCountry(option.value);
                            } else {
                              setGoogleCountry(option.value);
                            }
                            setCountrySelectorVisible(false);
                            setCountrySearchText(''); // Clear search text
                          }}
                            className={`px-3 py-2.5 cursor-pointer flex items-center gap-3 transition-colors duration-200 ${
                              index < (filteredCountryOptions?.length || 0) - 1 ? 'border-b border-gray-100' : ''
                            } ${
                              isSelected ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-normal text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis select-none">
                              {option.label}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right operation button */}
            <div className="flex gap-8 p-12" style={{ display: 'flex', gap: '8px', padding: '16px', alignItems: 'center', minHeight: '64px' }}>
              <div className="flex items-center text-sm text-gray-600 px-1 whitespace-nowrap select-none">
                Current Mode:&nbsp;
                <span className="font-semibold text-gray-800">{searchMode === 'survey' ? 'Survey' : 'Normal'}</span>
              </div>

              {/* settings button */}
              <div 
                className="relative inline-block" 
                data-settings-selector
              >
                <button 
                  type="button"
                  onClick={() => {
                    // Close the additional filters drop-down menu
                    setOsSelectorVisible(false);
                    setCategorySelectorVisible(false);
                    setGeoSelectorVisible(false);
                    setAppIdSelectorVisible(false);
                    setAppNameSelectorVisible(false);
                    setXAppsSelectorVisible(false);
                    // Switch current filter
                    setSettingsVisible(!settingsVisible);
                  }}
                  className={`flex items-center justify-center text-sm font-medium rounded px-4 py-2 gap-1 text-gray-800 border border-gray-200 cursor-pointer transition-colors duration-200 h-9 ${
                    settingsVisible ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11.4583 5.83333H3.125M11.4583 5.83333C11.4583 4.33697 12.6703 3.125 14.1667 3.125C15.663 3.125 16.875 4.33697 16.875 5.83333C16.875 7.32969 15.663 8.54167 14.1667 8.54167C12.6703 8.54167 11.4583 7.32969 11.4583 5.83333Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.72" strokeWidth="1.25"></path>
                    <path d="M16.875 14.1666H10.2083M10.2083 14.1666C10.2083 15.6629 8.99633 16.8749 7.5 16.8749C6.00365 16.8749 4.79167 15.6629 4.79167 14.1666M10.2083 14.1666C10.2083 12.6703 8.99633 11.4583 7.5 11.4583C6.00365 11.4583 4.79167 12.6703 4.79167 14.1666M4.79167 14.1666H3.125" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.72" strokeWidth="1.25"></path>
                  </svg>
                </button>
                
                {/* Set up pop-up cards */}
                {settingsVisible && (
                  <div
                    data-settings-selector-dropdown
                    className="absolute bottom-full left-0 mb-1 z-[9999] bg-white rounded border border-gray-200 shadow-lg w-[280px] min-h-[120px] origin-bottom-left"
                  >
                    {/* card header */}
                    <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
                      <div className="text-xs text-gray-500 font-medium" style={{ fontFamily: '"Museo Sans", sans-serif' }}>
                        Options
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettingsVisible(false)}
                        className="flex items-center justify-center w-8 h-8 border-none bg-transparent cursor-pointer rounded transition-colors duration-200 hover:bg-gray-100"
                      >
                        <svg fill="none" height="24" viewBox="0 0 20 20" width="24" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6.45801 6.45837L13.5413 13.5417M13.5413 6.45837L6.45801 13.5417" stroke="currentColor" strokeLinecap="round" strokeOpacity="0.48" strokeWidth="1.5"></path>
                        </svg>
                      </button>
                    </div>
                    
                    {/* Card content area */}
                    <div className="px-5 pb-5">
                      {/* Auto Add Apps option */}
                      <div 
                        className="grid grid-cols-[1fr_auto] items-center gap-3 py-3.5 px-2.5 cursor-pointer"
                        onClick={() => setAutoAddApps(!autoAddApps)}
                      >
                        {/* Left icon and title */}
                        <div className="flex items-center">
                          <div className="w-6 h-6 flex items-center justify-center mr-3 opacity-60">
                            <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                              <path d="M16.0416 12.9976V3.95829C16.0416 3.03782 15.2954 2.29163 14.3749 2.29163H5.62492C4.70444 2.29163 3.95825 3.03782 3.95825 3.95829V16.0416C3.95825 16.9621 4.70444 17.7083 5.62492 17.7083H5.83325M16.0416 12.9976V13.3035C16.0416 13.9389 15.8348 14.5571 15.4523 15.0655C14.2003 16.7291 12.2354 17.7083 10.1488 17.7083H5.83325M16.0416 12.9976C16.0416 15.1389 13.0338 15.1389 11.7448 14.2824L10.8243 15.1997C9.21258 16.806 8.11246 17.7083 5.83325 17.7083" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25"></path>
                              <path d="M7.29175 5.625H12.7084M7.29175 8.95833H12.7084M7.29175 12.2917H9.37508" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25"></path>
                            </svg>
                          </div>
                          <div className="text-sm font-medium text-gray-700" style={{ fontFamily: '"Museo Sans", sans-serif' }}>
                            Auto Add Apps
                          </div>
                        </div>
                        
                        {/* Right switch control */}
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAutoAddApps(!autoAddApps);
                            }}
                            className={`relative w-[50px] h-5 rounded border-none cursor-pointer transition-all duration-200 shadow-inner ${
                              autoAddApps ? 'bg-orange-500' : 'bg-gray-300'
                            }`}
                          >
                            <div
                              className={`absolute top-0.5 w-4 h-4 rounded bg-white transition-all duration-200 shadow-md ${
                                autoAddApps ? 'left-8' : 'left-0.5'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                      
                      {/* Wait option */}
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-3.5 px-2.5 border-t border-gray-100">
                        {/* Left icon and title */}
                        <div className="flex items-center">
                          <div className="w-6 h-6 flex items-center justify-center mr-3 opacity-60">
                            <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                              <path d="M15.6251 0.833374C15.2799 0.833374 15.0001 1.1132 15.0001 1.45837C15.0001 1.80355 15.2799 2.08337 15.6251 2.08337V0.833374ZM18.5417 1.45837L19.0351 1.84209C19.1816 1.65366 19.2081 1.39821 19.1032 1.18378C18.9983 0.969344 18.7805 0.833374 18.5417 0.833374V1.45837ZM15.6251 5.20837L15.1317 4.82466C14.9852 5.01309 14.9588 5.26853 15.0636 5.48297C15.1685 5.6974 15.3864 5.83337 15.6251 5.83337V5.20837ZM18.5417 5.83337C18.8869 5.83337 19.1667 5.55355 19.1667 5.20837C19.1667 4.8632 18.8869 4.58337 18.5417 4.58337V5.83337ZM10.6251 6.45837C10.6251 6.1132 10.3453 5.83337 10.0001 5.83337C9.6549 5.83337 9.37508 6.1132 9.37508 6.45837H10.6251ZM10.0001 10H9.37508C9.37508 10.1658 9.44093 10.3248 9.55814 10.442L10.0001 10ZM11.6415 12.5253C11.8856 12.7694 12.2813 12.7694 12.5254 12.5253C12.7694 12.2812 12.7694 11.8855 12.5254 11.6414L11.6415 12.5253ZM12.6801 3.44109C12.9996 3.57178 13.3645 3.41874 13.4952 3.09926C13.6259 2.77977 13.4729 2.41484 13.1534 2.28415L12.6801 3.44109ZM18.0254 7.74815C17.9323 7.41577 17.5874 7.22178 17.255 7.31486C16.9226 7.40795 16.7287 7.75287 16.8217 8.08526L18.0254 7.74815ZM15.6251 1.45837V2.08337H18.5417V1.45837V0.833374H15.6251V1.45837ZM18.5417 1.45837L18.0484 1.07466L15.1317 4.82466L15.6251 5.20837L16.1184 5.59209L19.0351 1.84209L18.5417 1.45837ZM15.6251 5.20837V5.83337H18.5417V5.20837V4.58337H15.6251V5.20837ZM10.0001 6.45837H9.37508V10H10.0001H10.6251V6.45837H10.0001ZM10.0001 10L9.55814 10.442L11.6415 12.5253L12.0834 12.0834L12.5254 11.6414L10.442 9.5581L10.0001 10ZM17.7084 10H17.0834C17.0834 13.9121 13.9121 17.0834 10.0001 17.0834V17.7084V18.3334C14.6025 18.3334 18.3334 14.6024 18.3334 10H17.7084ZM10.0001 17.7084V17.0834C6.08806 17.0834 2.91675 13.9121 2.91675 10H2.29175H1.66675C1.66675 14.6024 5.39771 18.3334 10.0001 18.3334V17.7084ZM2.29175 10H2.91675C2.91675 6.08802 6.08806 2.91671 10.0001 2.91671V2.29171V1.66671C5.39771 1.66671 1.66675 5.39767 1.66675 10H2.29175ZM10.0001 2.29171V2.91671C10.9497 2.91671 11.8542 3.10324 12.6801 3.44109L12.9167 2.86262L13.1534 2.28415C12.1799 1.88591 11.1148 1.66671 10.0001 1.66671V2.29171ZM17.4236 7.91671L16.8217 8.08526C16.9921 8.69359 17.0834 9.33564 17.0834 10H17.7084H18.3334C18.3334 9.22059 18.2262 8.46516 18.0254 7.74815L17.4236 7.91671Z" fill="currentColor"></path>
                            </svg>
                          </div>
                          <div className="text-sm font-medium text-gray-700" style={{ fontFamily: '"Museo Sans", sans-serif' }}>
                            Timeout
                          </div>
                        </div>
                        
                        {/* Right input box */}
                        <div className="flex justify-end">
                          <label className="px-2 py-1.5 rounded flex items-center gap-1 cursor-text bg-white border border-gray-200 transition-all duration-200 w-20 max-w-20 h-7 min-h-7 box-border hover:border-gray-300 hover:bg-gray-50 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500">
                            <input
                              type="text"
                              value={waitTime}
                              onChange={(e) => setWaitTime(e.target.value)}
                              placeholder="5"
                              className="outline-none flex-grow h-auto bg-transparent border-none text-xs text-gray-500 w-[30px] min-w-[20px]"
                              style={{
                                fontFamily: '"Museo Sans", sans-serif'
                              }}
                            />
                            <div className="cursor-default ml-0.5 px-1 text-[10px] text-gray-500 relative border border-gray-100 rounded bg-gray-50 whitespace-nowrap">
                              SEC
                            </div>
                          </label>
                        </div>
                      </div>
                      
                      {/* Retry Set Options */}
                      <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-3.5 px-2.5 border-t border-gray-100">
                        {/* Left icon and title */}
                        <div className="flex items-center">
                          <div className="w-6 h-6 flex items-center justify-center mr-3 opacity-60">
                            <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                              <path d="M10 9.99996L5.94403 7.40414C5.22603 6.94462 4.79167 6.15092 4.79167 5.29846V2.29163H15.2083V5.29846C15.2083 6.15092 14.774 6.94462 14.056 7.40414L10 9.99996ZM10 9.99996L14.056 12.5958C14.774 13.0553 15.2083 13.849 15.2083 14.7015V17.7083H4.79167V14.7015C4.79167 13.849 5.22603 13.0553 5.94403 12.5958L10 9.99996ZM16.875 17.7083H3.125M16.875 2.29163H3.125" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25"></path>
                            </svg>
                          </div>
                          <div className="text-sm font-medium text-gray-700" style={{ fontFamily: '"Museo Sans", sans-serif' }}>
                            Retry Set
                          </div>
                        </div>
                        
                        {/* Right input box */}
                        <div className="flex justify-end">
                          <label className="px-2 py-1.5 rounded flex items-center gap-1 cursor-text bg-white border border-gray-200 transition-all duration-200 w-20 max-w-20 h-7 min-h-7 box-border hover:border-gray-300 hover:bg-gray-50 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500">
                            <input
                              type="text"
                              value={retrySet}
                              onChange={(e) => setRetrySet(e.target.value)}
                              placeholder="3"
                              className="outline-none flex-grow h-auto bg-transparent border-none text-xs text-gray-500 w-[30px] min-w-[20px]"
                              style={{
                                fontFamily: '"Museo Sans", sans-serif'
                              }}
                            />
                            <div className="cursor-default ml-0.5 px-1 text-[10px] text-gray-500 relative border border-gray-100 rounded bg-gray-50 whitespace-nowrap">
                              TIM
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Mode switch button */}
              <div className="contents" tabIndex={-1}>
                <button 
                  type="button"
                  onClick={() => {
                    setSearchMode(prev => (prev === 'normal' ? 'survey' : 'normal'));
                    setCountrySelectorVisible(false);
                    setCountrySearchText('');
                    setSurveyAvailableCountries([]);
                  }}
                  className="inline-flex items-center justify-center text-sm font-medium rounded px-4 py-2 gap-1 text-gray-800 border border-gray-200 bg-transparent cursor-pointer transition-colors duration-200 h-9 min-w-fit hover:bg-gray-50"
                >
                  <svg className="w-5 h-5" fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8.54167 7.5L6.63092 9.41075C6.30548 9.73617 6.30548 10.2638 6.63092 10.5892L8.54167 12.5M11.4583 7.5L13.3691 9.41075C13.6945 9.73617 13.6945 10.2638 13.3691 10.5892L11.4583 12.5M4.79167 16.875H15.2083C16.1288 16.875 16.875 16.1288 16.875 15.2083V4.79167C16.875 3.87119 16.1288 3.125 15.2083 3.125H4.79167C3.87119 3.125 3.125 3.87119 3.125 4.79167V15.2083C3.125 16.1288 3.87119 16.875 4.79167 16.875Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.72" strokeWidth="1.25"></path>
                  </svg>
                  Switch Mode
                </button>
              </div>

              {/* Start query button */}
              <button 
                type="button"
                onClick={platformType === 'ios' ? handleIosSearch : handleGoogleSearch}
                disabled={
                  platformType === 'ios' 
                    ? (iosSearchLoading || !iosSearchTerm.trim())
                    : (googleSearchLoading || !googleSearchTerm.trim())
                }
                className={`flex items-center justify-center text-sm font-bold rounded px-4 py-2 text-white border-none transition-all duration-200 h-9 min-w-[120px] ${
                  platformType === 'ios'
                    ? (iosSearchLoading || !iosSearchTerm.trim() ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 cursor-pointer')
                    : (googleSearchLoading || !googleSearchTerm.trim() ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600 cursor-pointer')
                }`}
              >
                <div style={{ transition: 'all 0.2s ease', textAlign: 'center', overflow: 'hidden', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {platformType === 'ios' ? (
                        // iOS search status
                        iosSearchLoading ? (
                        <>
                          <div style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            border: '2px solid rgba(255, 255, 255, 0.3)',
                            borderTop: '2px solid white',
                            animation: 'spin 1s linear infinite',
                            marginRight: '8px'
                          }} />
                          {'Searching...'}
                        </>
                      ) : (
                        <>
                          {'Start Search'}
                        </>
                        )
                      ) : (
                        // Google Play search status
                        googleSearchLoading ? (
                          <>
                            <div style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              border: '2px solid rgba(255, 255, 255, 0.3)',
                              borderTop: '2px solid white',
                              animation: 'spin 1s linear infinite',
                              marginRight: '8px'
                            }} />
                            {'Searching...'}
                          </>
                        ) : (
                          <>
                            {'Start Search'}
                          </>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Application information display area */}
      {(iosSearchLoading || googleSearchLoading) && (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px',
          color: 'rgb(34, 13, 78)',
          marginBottom: '24px',
          userSelect: 'none'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '3px solid rgba(114, 46, 209, 0.2)',
            borderTop: '3px solid #722ED1',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }} />
          <div style={{ fontSize: '14px', fontWeight: '500', userSelect: 'none' }}>
            {'Searching Apps'}
          </div>
        </div>
      )}

      {/* iOS application information display area */}
      {!iosSearchLoading && iosAppInfo && platformType === 'ios' && (
        <div className="border border-gray-200 rounded p-6 bg-gray-50 mb-6 select-none shadow-md">
          <div className="flex gap-6 flex-wrap">
            {/* App icon and basic information */}
            <div className="flex-none w-[120px]">
              <img 
                src={iosAppInfo.icon || iosAppInfo.artworkUrl100 || ''}  
                alt={iosAppInfo.title || iosAppInfo.trackName || 'Unknown App'}
                className="w-[120px] h-[120px] rounded object-cover border border-gray-200"
                onError={(e) => {
                  e.currentTarget.src = 'https://via.placeholder.com/120x120?text=App';
                }}
              />
            </div>
            
            {/* Application details */}
            <div className="flex-1 min-w-[300px]">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h3 className="m-0 text-xl font-semibold text-[#220D4E] select-none">
                  {iosAppInfo.title || iosAppInfo.trackName || 'Unknown App'}
                </h3>
                
                {/* Content Rating Badge */}
                {iosAppInfo.contentRating && (
                  <span
                  className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium border border-gray-200 leading-tight inline-flex items-center justify-center min-w-6 h-5 select-none"
                >
                    {iosAppInfo.contentRating}
                  </span>
                )}
              </div>
              
              {/* Bundle ID information - Use App Store official style, compact layout */}
              <div className="text-gray-600 text-sm leading-tight font-normal font-sans mb-2 antialiased">
                {iosAppInfo.appId || iosAppInfo.bundleId || 'N/A'}
              </div>
              {searchMode === 'survey' && surveyAvailableCountries.length > 0 && (
                <div className="text-xs text-gray-500 mb-2">
                  Poll: {surveyAvailableCountries.map(code => code.toUpperCase()).join(', ')}
                </div>
              )}
              
              <div className="mb-2">
                {/* The developer name is always displayed as a hyperlink, and the URL priority is: developerWebsite > developerUrl */}
                {(iosAppInfo.developerWebsite || iosAppInfo.developerUrl) ? (
                  <a
                  href={iosAppInfo.developerWebsite || iosAppInfo.developerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-lg text-blue-600 hover:underline font-normal font-sans antialiased"
                >
                    {iosAppInfo.developer || iosAppInfo.artistName || 'Unknown Developer'}
                  </a>
                ) : (
                  <span className="text-lg text-gray-800 font-normal font-sans antialiased">
                    {iosAppInfo.developer || iosAppInfo.artistName || 'Unknown Developer'}
                  </span>
                )}
              </div>
              
              <div className="mb-2 flex flex-wrap items-baseline">

                {/* Category tag - displays all categories, represented by purple blocks */}
                {iosAppInfo.genres && iosAppInfo.genres.length > 0 ? (
                  [...new Set(iosAppInfo.genres)].map((genre, index) => (
                    <span 
                      key={index}
                      className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded text-xs font-medium mr-2 mb-1 inline-flex items-center justify-center h-6 leading-none w-fit"
                    >
                      {genre}
                    </span>
                  ))
                ) : (
                  <span className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded text-xs font-medium mr-2 inline-flex items-center justify-center h-6 leading-none w-fit">
                  {iosAppInfo.primaryGenre || iosAppInfo.primaryGenreName || 'Unknown Category'}
                  </span>
                )}
                
                {/* price tag */}
                <span 
                  className={`px-3 py-1.5 rounded text-xs font-medium mr-2 inline-flex items-center justify-center h-6 leading-none w-fit ${iosAppInfo.price === 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}
                >
                  {iosAppInfo.price === 0 ? ('Free') : `$${iosAppInfo.price || 0}`}
                </span>
                
                {/* version label */}
                <span className="bg-amber-100 text-amber-800 px-3 py-1.5 rounded text-xs font-medium inline-flex items-center justify-center h-6 leading-none w-fit">
                  v{iosAppInfo.version || 'Unknown'}
                </span>
              </div>

              {/* Ratings, number of ratings, number of comments, downloads information */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '16px',
                marginBottom: '16px',
                flexWrap: 'wrap'
              }}>
                {/* Rating information */}
                <div className="flex items-center gap-1">
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-gray-600 select-none"
                  >
                    <path 
                      d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" 
                      fill="currentColor"
                    />
                  </svg>
                  <span className="font-semibold">
                    {(iosAppInfo.score || iosAppInfo.averageUserRating) ? (iosAppInfo.score || iosAppInfo.averageUserRating || 0).toFixed(1) : 'N/A'}
                  </span>
                  <span className="text-gray-600 text-sm select-none">
                    Score
                  </span>
                </div>
                
                {/* Score quantity information */}
                <div className="flex items-center gap-1">
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-gray-600 select-none"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="font-semibold">
                    {(iosAppInfo.reviews || iosAppInfo.userRatingCount) ? (iosAppInfo.reviews || iosAppInfo.userRatingCount || 0).toLocaleString() : '0'}
                  </span>
                  <span className="text-gray-600 text-sm select-none">
                    {'Ratings'}
                  </span>
                </div>
                
                {/* Comment count information */}
                <div className="flex items-center gap-1">
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-gray-600 select-none"
                  >
                    <path 
                      d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="font-semibold">
                    {(iosAppInfo.reviews || iosAppInfo.userRatingCount) ? (iosAppInfo.reviews || iosAppInfo.userRatingCount || 0).toLocaleString() : '0'}
                  </span>
                  <span className="text-gray-600 text-sm select-none">
                    {'Comments'}
                  </span>
                </div>
                
                {/* File size information */}
                {iosAppInfo.size ? (
                   <div className="flex items-center gap-1">
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-gray-600 select-none"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span style={{ fontWeight: '600', color: 'rgb(34, 13, 78)', userSelect: 'none' }}>
                      {(parseInt(iosAppInfo.size) / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <span style={{ color: '#666', fontSize: '14px', userSelect: 'none' }}>
                      {'Downloads'}
                    </span>
                  </div>
                ) : (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px' 
                  }}>
                    <svg 
                      width="16" 
                      height="16" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      className="text-gray-600 select-none"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-gray-400 text-sm select-none">
                      {'Downloads N/A'}
                    </span>
                  </div>
                )}
              </div>



              {/* technical information */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginTop: '16px'
              }}>
                {/* The Content Rating information block has been moved to the right of the App name and displayed as a Badge */}
                  </div>
                  </div>
                </div>
                


          {/* Application description */}
          
          {/* Action button */}

          
          {/* App screenshots - support device switching */}
          {(iosAppInfo.screenshots && iosAppInfo.screenshots.length > 0) || 
           (iosAppInfo.ipadScreenshots && iosAppInfo.ipadScreenshots.length > 0) ? (
            <div style={{ marginTop: '24px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '12px'
              }}>
                <h4 style={{ 
                  margin: '0',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'rgb(34, 13, 78)'
                }}>
                  {'App Screenshots'}
                </h4>
                
                {/* Device type switcher */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: '#f5f5f7',
                  borderRadius: '8px',
                  padding: '2px'
                }}>
                  {/* iPhone options */}
                  <button
                    onClick={() => setSelectedDeviceType('iphone')}
                    style={{
                      padding: '6px 12px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: selectedDeviceType === 'iphone' ? '#007aff' : '#666',
                      backgroundColor: selectedDeviceType === 'iphone' ? 'white' : 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: selectedDeviceType === 'iphone' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    iPhone
                  </button>
                  
                  {/* iPad options */}
                  <button
                    onClick={() => setSelectedDeviceType('ipad')}
                    style={{
                      padding: '6px 12px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: selectedDeviceType === 'ipad' ? '#007aff' : '#666',
                      backgroundColor: selectedDeviceType === 'ipad' ? 'white' : 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: selectedDeviceType === 'ipad' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                    }}
                  >
                    iPad
                  </button>
                </div>
              </div>
              
              {/* Screenshot display area */}
              <div style={{ 
                display: 'flex', 
                gap: '12px',
                overflowX: 'auto',
                padding: '8px 0'
              }}>
                {/* iPhone screenshot */}
                {selectedDeviceType === 'iphone' && iosAppInfo.screenshots && iosAppInfo.screenshots.length > 0 && (
                  iosAppInfo.screenshots.map((screenshot, index) => (
                    <img 
                      key={`iphone-${index}`}
                      src={screenshot}
                      alt={`${iosAppInfo.title || 'App'} iPhone screenshot ${index + 1}`}
                      style={{
                        width: '200px',
                        height: 'auto',
                        borderRadius: '8px',
                        border: '1px solid #e9ecef',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      onClick={() => window.open(screenshot, '_blank')}
                    />
                  ))
                )}
                
                {/* iPad screenshot */}
                {selectedDeviceType === 'ipad' && iosAppInfo.ipadScreenshots && iosAppInfo.ipadScreenshots.length > 0 && (
                  iosAppInfo.ipadScreenshots.map((screenshot, index) => (
                    <img 
                      key={`ipad-${index}`}
                      src={screenshot}
                      alt={`${iosAppInfo.title || 'App'} iPad screenshot ${index + 1}`}
                      style={{
                        width: '180px',
                        height: 'auto',
                        borderRadius: '8px',
                        border: '1px solid #e9ecef',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      onClick={() => window.open(screenshot, '_blank')}
                    />
                  ))
                )}
                
                {/* No screenshot prompt */}
                {((selectedDeviceType === 'iphone' && (!iosAppInfo.screenshots || iosAppInfo.screenshots.length === 0)) ||
                  (selectedDeviceType === 'ipad' && (!iosAppInfo.ipadScreenshots || iosAppInfo.ipadScreenshots.length === 0))) && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    padding: '40px 20px',
                    color: '#999',
                    fontSize: '14px'
                  }}>
                    {'No screenshots available'}
                  </div>
                )}
              </div>
            </div>
          ) : null}

                {/* Apple TV screenshot */}
                {iosAppInfo.appletvScreenshots && iosAppInfo.appletvScreenshots.length > 0 && (
                  <div style={{ marginTop: '24px' }}>
                    <h4 style={{ 
                      margin: '0 0 12px 0',
                      fontSize: '16px',
                      fontWeight: '600',
                      color: 'rgb(34, 13, 78)'
                    }}>
                      {'Apple TV Screenshots'}
                    </h4>
                    <div style={{ 
                      display: 'flex', 
                      gap: '12px',
                      overflowX: 'auto',
                      padding: '8px 0'
                    }}>
                      {iosAppInfo.appletvScreenshots.map((screenshot, index) => (
                        <img 
                          key={index}
                          src={screenshot}
                          alt={`${iosAppInfo.title || 'App'} Apple TV screenshot ${index + 1}`}
                          style={{
                            width: '200px',
                            height: 'auto',
                            borderRadius: '8px',
                            border: '1px solid #e9ecef',
                            cursor: 'pointer',
                            transition: 'transform 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                          onClick={() => window.open(screenshot, '_blank')}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Language support information */}
                {iosAppInfo.languages && iosAppInfo.languages.length > 0 && (
                  <div className="mt-6">
                    <h4 className="m-0 mb-3 text-base font-semibold text-[#220D4E]">
                      {'Supported Languages'}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {iosAppInfo.languages.map((lang, index) => (
                        <span 
                          key={index}
                          className="px-3 py-1.5 bg-gray-100 rounded text-xs font-medium text-gray-600 inline-flex items-center justify-center h-6 leading-none"
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* App description - only shown when expanded */}
                {showMoreDetails && iosAppInfo.description && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="m-0 text-base font-semibold text-[#220D4E]">
                        {'App Description'}
                      </h4>
                      <button
                        onClick={() => {
                          if (iosAppInfo.description) {
                            copyAppDescription(iosAppInfo.description);
                          }
                        }}
                        disabled={copyingDescription || !iosAppInfo.description}
                        data-copy-button="true"
                        className={`p-1.5 bg-transparent border-none rounded cursor-pointer transition-colors duration-200 flex items-center justify-center ${
                          copyingDescription || !iosAppInfo.description 
                            ? 'cursor-not-allowed opacity-50' 
                            : 'hover:bg-gray-100'
                        }`}
                        title={'Copy App Description'}
                      >
                        {copyingDescription ? (
                          <div className="w-[18px] h-[18px] border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                        ) : copySuccess ? (
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-green-500 animate-fadeIn">
                            <path d="M6.75 9L8.25 10.5L11.25 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M9 16.5C13.1421 16.5 16.5 13.1421 16.5 9C16.5 4.85786 13.1421 1.5 9 1.5C4.85786 1.5 1.5 4.85786 1.5 9C1.5 13.1421 4.85786 16.5 9 16.5Z" stroke="currentColor" strokeWidth="1.5"/>
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-gray-700">
                            <path d="M14.25 5.25H7.25C6.14543 5.25 5.25 6.14543 5.25 7.25V14.25C5.25 15.3546 6.14543 16.25 7.25 16.25H14.25C15.3546 16.25 16.25 15.3546 16.25 14.25V7.25C16.25 6.14543 15.3546 5.25 14.25 5.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M2.80103 11.998L1.77203 5.07397C1.61003 3.98097 2.36403 2.96397 3.45603 2.80197L10.38 1.77297C11.313 1.63397 12.19 2.16297 12.528 3.00097" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="text-gray-800 leading-relaxed text-sm">
                      {iosAppInfo.description || 'No description available'}
                    </div>
                  </div>
                )}

                {/* Release notes - only shown when expanded */}
                {showMoreDetails && iosAppInfo.releaseNotes && (
                  <div className="mt-6">
                    <h4 className="m-0 mb-3 text-base font-semibold text-[#220D4E]">
                      {'Release Notes'}
                    </h4>
                    <div className="text-gray-800 leading-relaxed text-sm">
                      {iosAppInfo.releaseNotes ? (
                        <div dangerouslySetInnerHTML={{
                          __html: iosAppInfo.releaseNotes
                            .split(/(\d+\.)/)
                            .map((part, index) => {
                              if (/^\d+\.$/.test(part)) {
                                // Add a period to the number and add a newline in front of it
                                return `<br/>${part}`;
                              }
                              return part;
                            })
                            .join('')
                        }} />
                      ) : 'No release notes available'}
                    </div>
                  </div>
                )}



          {/* More details - only shown when expanded */}
          {showMoreDetails && (
            <div className="mt-6">
              <h4 className="m-0 mb-4 text-base font-semibold text-[#220D4E]">
                {'Detailed Information'}
              </h4>
              
              {/* Extended technical information */}
              <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="p-4 bg-white rounded border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1 select-none">
                    {'Minimum OS Version'}
                  </div>
                  <div className="text-sm font-medium text-[#220D4E] select-none">
                    {iosAppInfo.requiredOsVersion || iosAppInfo.minimumOsVersion || 'N/A'}
                  </div>
                </div>
                

                
                <div className="p-4 bg-white rounded border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1 select-none">
                    {'Release Date'}
                  </div>
                  <div className="text-sm font-medium text-[#220D4E] select-none">
                    {iosAppInfo.released ? new Date(iosAppInfo.released).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
                
                <div className="p-4 bg-white rounded border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1 select-none">
                    {'Update Date'}
                  </div>
                  <div className="text-sm font-medium text-[#220D4E] select-none">
                    {iosAppInfo.updated || iosAppInfo.currentVersionReleaseDate ? new Date(iosAppInfo.updated || iosAppInfo.currentVersionReleaseDate || '').toLocaleDateString() : 'N/A'}
                  </div>
                </div>
                

              </div>

              {/* In-app purchase and subscription information - always shown */}
              

              {/* The Developer Information information block has been removed and the developer name is now displayed as a hyperlink */}


            </div>
          )}

          {/* User rating details - App Store mode - only shown when expanded */}
          {showMoreDetails && (iosAppInfo.score || iosAppInfo.averageUserRating) && (iosAppInfo.reviews || iosAppInfo.userRatingCount) && (
            <div className="mt-6">
              <h4 className="m-0 mb-4 text-base font-semibold text-[#220D4E]">
                {'User Rating Details'}
              </h4>
                
              {/* Rating distribution chart */}
              {iosAppInfo.ratingHistogram && (
                <div className="flex flex-col gap-3">
                  <div className="text-sm text-gray-600 font-medium text-center">
                    {'Rating Distribution'}
                  </div>
                  
                  {/* 1-5 star rating distribution */}
                  {[5, 4, 3, 2, 1].map((rating) => {
                    const count = iosAppInfo.ratingHistogram?.[rating] || 0;
                    const total = iosAppInfo.ratingHistogram ? Object.values(iosAppInfo.ratingHistogram).reduce((sum, val) => (sum as number) + (val as number), 0) as number : 0;
                    const percentage = total > 0 ? (count / total) * 100 : 0;
                    const barWidth = percentage > 0 ? Math.max(percentage, 5) : 0;
                    
                    return (
                      <div key={rating} className="flex items-center gap-3 text-xs">
                        {/* star rating */}
                        <div className="flex items-center gap-1 min-w-[60px] justify-end">
                          <span className="text-gray-600 font-bold text-sm min-w-[16px] text-center">{rating}</span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24" 
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                            className="text-gray-900"
                          >
                            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                          </svg>
                        </div>
                        
                        {/* Progress Bar - Use Blue */}
                        <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 rounded transition-all duration-300"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                  
                        {/* quantity and percentage */}
                        <div className="min-w-[80px] text-right text-gray-600">
                          {count.toLocaleString()} ({percentage.toFixed(1)}%)
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
                   
              {/* If there is no rating distribution data, display basic rating information */}
              {!iosAppInfo.ratingHistogram && (
                <div className="bg-gray-50 rounded-xl p-5 mb-5">
                  <div className="flex flex-col gap-3 items-center">
                    <div className="text-sm text-gray-600 font-medium">
                      {'Rating distribution data not available'}
                    </div>
                    <div className="flex items-center gap-2 text-gray-500">
                      <span>平均评分: {(iosAppInfo.score || iosAppInfo.averageUserRating || 0).toFixed(1)}</span>
                      <span>•</span>
                      <span>总评分数: {(iosAppInfo.reviews || iosAppInfo.userRatingCount || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action button */}
          <div style={{ 
            marginTop: '24px', 
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            borderTop: '1px solid rgb(230, 233, 240)',
            paddingTop: '24px'
          }}>
            <button
                                    onClick={() => window.open(iosAppInfo.url || iosAppInfo.trackViewUrl || '#', '_blank')}
              style={{
                padding: '8px 24px',
                backgroundColor: '#1e40af',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#1e3a8a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#1e40af';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.01 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              {'App Store'}
            </button>
            
            <button
              onClick={() => {
                // Toggle showing more details
                setShowMoreDetails(!showMoreDetails);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#666',
                border: '1px solid rgb(230, 233, 240)',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                minWidth: 'fit-content'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(250, 250, 250)';
                e.currentTarget.style.borderColor = '#d9d9d9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'rgb(230, 233, 240)';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <rect x="2" y="6" width="2" height="2" fill="currentColor"/>
                <rect x="6" y="6" width="2" height="2" fill="currentColor"/>
                <rect x="10" y="6" width="2" height="2" fill="currentColor"/>
              </svg>
              <span style={{ whiteSpace: 'nowrap' }}>
                {showMoreDetails 
                  ? ('Show Less')
                  : ('Show More')
                }
              </span>
            </button>
            
            {/* Plus Icon - used to store App information - only displayed when Auto Add Apps is closed */}
            {!autoAddApps && (
              <button
                onClick={() => {
                  const surveyCountry = searchMode === 'survey' ? surveyAvailableCountries[0] : undefined;
                  storeAppInfo(iosAppInfo, 'ios', surveyCountry);
                }}
                disabled={storingApp || isAlreadyStored}
                style={{
                  padding: '8px 16px',
                  backgroundColor: storingApp || isAlreadyStored ? '#d9d9d9' : '#722ED1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: storingApp || isAlreadyStored ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: storingApp || isAlreadyStored ? 'none' : '0 2px 8px rgba(114, 46, 209, 0.3)',
                  flexShrink: 0,
                  minWidth: 'fit-content'
                }}
                onMouseEnter={(e) => {
                  if (!storingApp && !isAlreadyStored) {
                    e.currentTarget.style.backgroundColor = '#5B25A8';
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(114, 46, 209, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!storingApp && !isAlreadyStored) {
                    e.currentTarget.style.backgroundColor = '#722ED1';
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(114, 46, 209, 0.3)';
                  }
                }}
                title={isAlreadyStored ? ('Already Stored') : ('Store to Database')}
              >
                {storingApp ? (
                  <div style={{ 
                    width: '16px', 
                    height: '16px', 
                    border: '2px solid #e0e0e0',
                    borderTop: '2px solid #ffffff',
                    borderRadius: '50%',
                    animation: 'copySpin 0.8s linear infinite'
                  }} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Google Play application information display area */}
      {!googleSearchLoading && googleAppInfo && platformType === 'google' && (
        <div className="border border-gray-200 rounded p-6 bg-gray-50 mb-6">
          <div className="flex gap-6 flex-wrap">
            {/* App icon and basic information */}
            <div className="flex-none w-[120px]">
              <img 
                src={googleAppInfo.icon || 'https://via.placeholder.com/120x120?text=App'} 
                alt={googleAppInfo.title || 'App Icon'}
                className="w-[120px] h-[120px] rounded object-cover border border-gray-200"
                onError={(e) => {
                  e.currentTarget.src = 'https://via.placeholder.com/120x120?text=App';
                }}
              />
            </div>
            
            {/* Application details */}
            <div className="flex-1 min-w-[300px]">
              <h3 className="m-0 mb-2 text-xl font-semibold text-[#220D4E]">
                {googleAppInfo.title || 'N/A'}
              </h3>
              
              <div className="text-gray-600 text-base mb-2 flex items-center gap-3">
                {/* The developer name is always displayed as a hyperlink, and the URL priority is: developerWebsite > developerUrl */}
                {(googleAppInfo.developerWebsite || googleAppInfo.developerUrl) ? (
                  <a
                    href={googleAppInfo.developerWebsite || googleAppInfo.developerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-semibold transition-colors duration-200"
                  >
                    {googleAppInfo.developer || 'N/A'}
                  </a>
                ) : (
                  <span className="font-semibold">{googleAppInfo.developer || 'N/A'}</span>
                )}
                
                {/* Pipe separator and developer email */}
                {googleAppInfo.developerEmail && (
                  <>
                    <span className="text-gray-300 text-sm font-light select-none">
                      |
                    </span>
                    <div className="flex items-center gap-1.5">
                      <svg 
                        width="14" 
                        height="14" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        xmlns="http://www.w3.org/2000/svg"
                        className="text-cyan-500 select-none flex-shrink-0"
                      >
                        <path 
                          d="M20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6C22 4.9 21.1 4 20 4ZM20 8L12 13L4 8V6L12 11L20 6V8Z" 
                          fill="currentColor"
                        />
                      </svg>
                      <span className="text-sm text-gray-600 font-normal">
                        {googleAppInfo.developerEmail}
                      </span>
                    </div>
                  </>
                )}
              </div>
              {searchMode === 'survey' && surveyAvailableCountries.length > 0 && (
                <div className="text-xs text-gray-500 mb-2">
                  Poll: {surveyAvailableCountries.map(code => code.toUpperCase()).join(', ')}
                </div>
              )}
              
              <div className="mb-2 flex flex-wrap items-baseline">
                <span className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded text-xs font-medium mr-2 mb-1 inline-flex items-center justify-center h-6 leading-none w-fit">
                  {googleAppInfo.genre || 'N/A'}
                </span>
                <span className={`px-3 py-1.5 rounded text-xs font-medium mr-2 mb-1 inline-flex items-center justify-center h-6 leading-none w-fit ${
                  googleAppInfo.free ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {googleAppInfo.free ? ('Free') : (googleAppInfo.priceText || 'N/A')}
                </span>
                <span className="bg-amber-100 text-amber-800 px-3 py-1.5 rounded text-xs font-medium mr-2 mb-1 inline-flex items-center justify-center h-6 leading-none w-fit">
                  v{googleAppInfo.version || 'N/A'}
                </span>
                {googleAppInfo.contentRating && (
                  <span className="bg-orange-100 text-orange-800 px-3 py-1.5 rounded text-xs font-medium mb-1 inline-flex items-center justify-center h-6 leading-none w-fit">
                    {googleAppInfo.contentRatingDescription 
                      ? `${googleAppInfo.contentRating} (${googleAppInfo.contentRatingDescription})`
                      : googleAppInfo.contentRating
                    }
                  </span>
                )}
              </div>

              {/* Ratings, number of ratings, number of reviews, and downloads information */}
              <div className="flex items-center gap-4 mb-2 flex-wrap">
                {/* Rating information */}
                <div className="flex items-center gap-1">
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-gray-600 select-none"
                  >
                    <path 
                      d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" 
                      fill="currentColor"
                    />
                  </svg>
                  <span className="font-semibold">
                    {googleAppInfo.score ? googleAppInfo.score.toFixed(2) : 'N/A'}
                  </span>
                  <span className="text-gray-600 text-sm select-none">
                    Score
                  </span>
                </div>
                
                {/* Score quantity information */}
                <div className="flex items-center gap-1">
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-gray-600 select-none"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="font-semibold">
                    {googleAppInfo.ratings ? googleAppInfo.ratings.toLocaleString() : '0'}
                  </span>
                  <span className="text-gray-600 text-sm select-none">
                    {'Ratings'}
                  </span>
                </div>
                
                {/* Comment count information */}
                <div className="flex items-center gap-1">
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-gray-600 select-none"
                  >
                    <path 
                      d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="font-semibold">
                    {googleAppInfo.reviews ? googleAppInfo.reviews.toLocaleString() : '0'}
                  </span>
                  <span className="text-gray-600 text-sm select-none">
                    {'Comments'}
                  </span>
                </div>
                
                {/* Download information */}
                <div className="flex items-center gap-1">
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-gray-600 select-none"
                  >
                    <path 
                      d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="font-semibold">
                    {googleAppInfo.installs || 'N/A'}
                  </span>
                  <span className="text-gray-600 text-sm select-none">
                    {'Downloads'}
                  </span>
                </div>
              </div>

              {/* Application description - summary is displayed first, if not, description is displayed. */}
              {(googleAppInfo.summary || googleAppInfo.description) && (
                <div className="mb-4">
                  <p className="m-0 text-gray-600 text-sm leading-relaxed">
                    {googleAppInfo.summary 
                      ? googleAppInfo.summary
                      : (googleAppInfo.description && googleAppInfo.description.length > 200 
                          ? `${googleAppInfo.description.substring(0, 200)}...` 
                          : googleAppInfo.description || ('No description')
                        )
                    }
                  </p>
                </div>
              )}


            </div>
          </div>
          
          {/* Action button */}
          <div style={{ 
            marginTop: '24px', 
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            borderTop: '1px solid rgb(230, 233, 240)',
            paddingTop: '24px'
          }}>
            {/* Google Play button */}
            <button
              onClick={() => {
                if (googleAppInfo?.url) {
                  window.open(googleAppInfo.url, '_blank');
                }
              }}
              style={{
                padding: '8px 24px',
                backgroundColor: '#52c41a',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#389e0d';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#52c41a';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
              </svg>
              Google Play
            </button>
            
            {/* View More button */}
            <button
              onClick={() => {
                // Toggle showing more details
                setShowGoogleMoreDetails(!showGoogleMoreDetails);
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#666',
                border: '1px solid rgb(230, 233, 240)',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                minWidth: 'fit-content'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgb(250, 250, 250)';
                e.currentTarget.style.borderColor = '#d9d9d9';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.borderColor = 'rgb(230, 233, 240)';
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                <rect x="2" y="6" width="2" height="2" fill="currentColor"/>
                <rect x="6" y="6" width="2" height="2" fill="currentColor"/>
                <rect x="10" y="6" width="2" height="2" fill="currentColor"/>
              </svg>
              <span style={{ whiteSpace: 'nowrap' }}>
                {showGoogleMoreDetails 
                  ? ('Show Less')
                  : ('View More')
                }
              </span>
            </button>
            
            {/* Plus Icon - used to store App information - only displayed when Auto Add Apps is closed */}
            {!autoAddApps && (
              <button
                onClick={() => {
                  const surveyCountry = searchMode === 'survey' ? surveyAvailableCountries[0] : undefined;
                  storeAppInfo(googleAppInfo, 'google', surveyCountry);
                }}
                disabled={storingApp || isAlreadyStored}
                style={{
                  padding: '8px 16px',
                  backgroundColor: storingApp || isAlreadyStored ? '#d9d9d9' : '#722ED1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: storingApp || isAlreadyStored ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: storingApp || isAlreadyStored ? 'none' : '0 2px 8px rgba(114, 46, 209, 0.3)',
                  flexShrink: 0,
                  minWidth: 'fit-content'
                }}
                onMouseEnter={(e) => {
                  if (!storingApp && !isAlreadyStored) {
                    e.currentTarget.style.backgroundColor = '#5B25A8';
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(114, 46, 209, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!storingApp && !isAlreadyStored) {
                    e.currentTarget.style.backgroundColor = '#722ED1';
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(114, 46, 209, 0.3)';
                  }
                }}
                title={isAlreadyStored ? ('Already Stored') : ('Store to Database')}
              >
                {storingApp ? (
                  <div style={{ 
                    width: '16px', 
                    height: '16px', 
                    border: '2px solid #e0e0e0',
                    borderTop: '2px solid #ffffff',
                    borderRadius: '50%',
                    animation: 'copySpin 0.8s linear infinite'
                  }} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                )}
              </button>
            )}
          </div>
          
          {/* More details - only shown when expanded */}
          {showGoogleMoreDetails && (
            <div className="mt-6">
              <h4 className="m-0 mb-4 text-base font-semibold text-[#220D4E]">
                {'Detailed Information'}
              </h4>
              
              {/* Extended technical information */}
              <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: '0.8fr 0.8fr 1fr 1fr 2fr' }}>
                {/* Current version */}
                <div className="p-4 bg-white rounded border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1 select-none">
                    {'Current Version'}
                  </div>
                  <div className="text-sm font-medium text-[#220D4E] select-none">
                    {googleAppInfo.version || 'N/A'}
                  </div>
                </div>
                
                {/* Minimum system version */}
                <div className="p-4 bg-white rounded border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1 select-none">
                    {'Min OS Version'}
                  </div>
                  <div className="text-sm font-medium text-[#220D4E] select-none">
                    {googleAppInfo.androidVersionText || googleAppInfo.androidVersion || 'N/A'}
                  </div>
                </div>

                {/* Release date */}
                <div className="p-4 bg-white rounded border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1 select-none">
                    {'Release Date'}
                  </div>
                  <div className="text-sm font-medium text-[#220D4E] select-none">
                    {(googleAppInfo.released || googleAppInfo.updated)
                      ? new Date(googleAppInfo.released || googleAppInfo.updated).toLocaleDateString()
                      : 'N/A'}
                  </div>
                </div>

                {/* Update date */}
                <div className="p-4 bg-white rounded border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1 select-none">
                    {'Update Date'}
                  </div>
                  <div className="text-sm font-medium text-[#220D4E] select-none">
                    {googleAppInfo.updated ? new Date(googleAppInfo.updated).toLocaleDateString() : 'N/A'}
                  </div>
                </div>

                {/* Apply tags */}
                <div className="p-4 bg-white rounded border border-gray-200">
                  <div className="text-xs text-gray-600 mb-1 select-none">
                    {'App Tags'}
                  </div>
                  <div className="text-sm font-medium text-[#220D4E] select-none">
                    {googleAppInfo.tags && googleAppInfo.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(showAllTags ? googleAppInfo.tags : googleAppInfo.tags.slice(0, 4)).map((tag: string, index: number) => (
                          <span
                            key={index}
                            className="px-2 py-0.5 bg-gray-100 rounded-full text-[11px] text-gray-600 border border-gray-200"
                          >
                            {tag}
                          </span>
                        ))}
                        {googleAppInfo.tags.length > 4 && (
                          <button
                            onClick={() => setShowAllTags(!showAllTags)}
                            className="text-[11px] text-gray-500 bg-transparent border-none rounded-full px-2 py-0.5 cursor-pointer transition-colors duration-200 self-center hover:bg-gray-100"
                          >
                            {showAllTags 
                              ? ('Close')
                              : `+${googleAppInfo.tags.length - 4}`
                            }
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 select-none">N/A</span>
                    )}
                  </div>
                </div>
                
                </div>
                




              {/* Full application description */}
              {googleAppInfo.description && (
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="m-0 text-base font-semibold text-[#220D4E]">
                      {'Full App Description'}
                    </h4>
                    <button
                      onClick={() => {
                        if (googleAppInfo.description) {
                          copyAppDescription(googleAppInfo.description);
                        }
                      }}
                      disabled={copyingDescription || !googleAppInfo.description}
                      data-copy-button="true"
                      className={`p-1.5 bg-transparent border-none rounded cursor-pointer transition-colors duration-200 flex items-center justify-center ${
                        copyingDescription || !googleAppInfo.description 
                          ? 'cursor-not-allowed opacity-50' 
                          : 'hover:bg-gray-100'
                      }`}
                      title={'Copy App Description'}
                    >
                      {copyingDescription ? (
                        <div className="w-[18px] h-[18px] border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                      ) : copySuccess ? (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-green-500 animate-fadeIn">
                          <path d="M6.75 9L8.25 10.5L11.25 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M9 16.5C13.1421 16.5 16.5 13.1421 16.5 9C16.5 4.85786 13.1421 1.5 9 1.5C4.85786 1.5 1.5 4.85786 1.5 9C1.5 13.1421 4.85786 16.5 9 16.5Z" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-gray-700">
                          <path d="M14.25 5.25H7.25C6.14543 5.25 5.25 6.14543 5.25 7.25V14.25C5.25 15.3546 6.14543 16.25 7.25 16.25H14.25C15.3546 16.25 16.25 15.3546 16.25 14.25V7.25C16.25 6.14543 15.3546 5.25 14.25 5.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M2.80103 11.998L1.77203 5.07397C1.61003 3.98097 2.36403 2.96397 3.45603 2.80197L10.38 1.77297C11.313 1.63397 12.19 2.16297 12.528 3.00097" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="text-gray-800 leading-relaxed text-sm">
                    {googleAppInfo.description}
                  </div>
                </div>
              )}

              {/* Recent updates */}
              {googleAppInfo.recentChanges && (
                <div className="mt-6">
                  <h4 className="m-0 mb-3 text-base font-semibold text-[#220D4E]">
                    {'Recent Changes'}
                  </h4>
                  <div className="text-gray-800 leading-relaxed text-sm whitespace-pre-line">
                    {googleAppInfo.recentChanges}
                  </div>
                </div>
              )}

              {/* App permissions */}
              {googleAppInfo.permissions && googleAppInfo.permissions.length > 0 && (
                <div className="mt-6">
                  <h4 className="m-0 mb-3 text-base font-semibold text-[#220D4E]">
                    {'App Permissions'}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {googleAppInfo.permissions.slice(0, 12).map((permission: string, index: number) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 border border-gray-200"
                      >
                        {permission}
                      </span>
                    ))}
                    {googleAppInfo.permissions.length > 12 && (
                      <span className="text-xs text-gray-500 self-center select-none">
                        +{googleAppInfo.permissions.length - 12} {'more'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* App screenshots */}
              {googleAppInfo.screenshots && googleAppInfo.screenshots.length > 0 && (
                <div className="mt-6">
                  <h4 className="m-0 mb-3 text-base font-semibold text-[#220D4E]">
                    {'App Screenshots'}
                  </h4>
                  <div 
                    className="grid gap-3 max-w-full justify-center"
                    style={{ gridTemplateColumns: `repeat(${Math.min(googleAppInfo.screenshots.length, 6)}, 1fr)` }}
                  >
                    {googleAppInfo.screenshots.slice(0, 6).map((screenshot: string, index: number) => (
                      <div
                        key={index}
                        className="relative w-full max-w-[120px] aspect-[9/16] rounded-lg border border-gray-200 overflow-hidden bg-gray-100 flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-gray-200/80 hover:border-gray-400 hover:shadow-lg"
                        title={`Screenshot ${index + 1} - Click to view full size`}
                        onClick={() => window.open(screenshot, '_blank')}
                      >
                        <img
                          src={screenshot}
                          alt={`Screenshot ${index + 1}`}
                          className="w-full h-full object-cover rounded-lg transition-opacity duration-200 opacity-90"
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                          onLoad={(e) => {
                            e.currentTarget.style.opacity = '1';
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.innerHTML = `
                                <div class="flex flex-col items-center justify-center text-gray-400 text-xs text-center p-2 h-full">
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="mb-1 text-gray-300">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                                    <polyline points="21,15 16,10 5,21" stroke="currentColor" stroke-width="2"/>
                                  </svg>
                                  <div class="mb-1">
                                    Failed to load
                                  </div>
                                  <div class="text-[10px] text-gray-300">
                                    Click to view original
                                  </div>
                                </div>
                              `;
                            }
                          }}
                        />
                        {/* Screenshot serial number */}
                        <div className="absolute top-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">
                          {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Screenshot description */}
                  <div className="mt-3 text-xs text-gray-600 text-center">
                    Screenshots Preview
                  </div>
                </div>
              )}





              {/* User rating details */}
              {googleAppInfo.histogram && (
                <div className="mt-6">
                  <h4 className="m-0 mb-4 text-base font-semibold text-[#220D4E]">
                    {'User Rating Details'}
                  </h4>
                  {/* Rating distribution chart */}
                  <div className="flex flex-col gap-3">
                    <div className="text-sm text-gray-600 font-medium text-center">
                      {'Rating Distribution'}
                    </div>
                    
                    {/* 1-5 star rating distribution */}
                    {[5, 4, 3, 2, 1].map((rating) => {
                      const count = googleAppInfo.histogram[rating] || 0;
                      const total = Object.values(googleAppInfo.histogram).reduce((sum, val) => (sum as number) + (val as number), 0) as number;
                      const percentage = total > 0 ? (count / total) * 100 : 0;
                      const barWidth = percentage > 0 ? Math.max(percentage, 5) : 0;
                      
                      return (
                        <div key={rating} className="flex items-center gap-3 text-xs">
                          {/* star rating */}
                          <div className="flex items-center gap-1 min-w-[60px] justify-end">
                            <span className="text-gray-600 font-bold text-sm min-w-[16px] text-center">{rating}</span>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24" 
                              fill="currentColor"
                              xmlns="http://www.w3.org/2000/svg"
                              className="text-gray-900"
                            >
                              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                            </svg>
                          </div>

                          {/* progress bar */}
                          <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                            <div 
                              className="h-full rounded transition-all duration-300 bg-green-500"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>

                          {/* quantity and percentage */}
                          <div className="min-w-[80px] text-right text-gray-600">
                            {count.toLocaleString()} ({percentage.toFixed(1)}%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* iOS app not found prompt */}
      {!iosSearchLoading && !iosAppInfo && iosSearchTerm && hasSearched && platformType === 'ios' && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-lg mb-6 bg-gray-50/50 dark:bg-gray-900/50">
          {/* Use Tailwind style icons */}
          <div className="mb-4 flex items-center justify-center">
            <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-3">
              <FileSearch className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
          </div>
          <div className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100 select-none">
            Not Found
          </div>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 select-none">
            Please Check Your App ID Or Geo App Supporting!
          </div>
        </div>
      )}

      {/* Google Play not found app prompt */}
      {!googleSearchLoading && !googleAppInfo && googleSearchTerm && googleHasSearched && platformType === 'google' && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-lg mb-6 bg-gray-50/50 dark:bg-gray-900/50">
          {/* Use Tailwind style icons */}
          <div className="mb-4 flex items-center justify-center">
            <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-3">
              <FileSearch className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
          </div>
          <div className="text-lg font-bold mb-2 text-gray-900 dark:text-gray-100 select-none">
            Not Found
          </div>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400 select-none">
            Please Check Your Package Name Or App Name!
          </div>
        </div>
      )}

      {/* Filters - displayed directly on the page */}
      <div className="flex gap-3 items-center justify-end mb-6">
        {/* List Button - Contains X Apps Count */}
        <div className="relative" style={{ zIndex: 9999 }} data-xapps-selector>
          <button
            onClick={() => {
              // Close the additional filters drop-down menu
              setOsSelectorVisible(false);
              setCategorySelectorVisible(false);
              setGeoSelectorVisible(false);
              setAppIdSelectorVisible(false);
              setAppNameSelectorVisible(false);
              // Switch current filter
              setXAppsSelectorVisible(!xAppsSelectorVisible);
            }}
            className="flex items-center justify-start p-2.5 border border-gray-300 rounded bg-white cursor-pointer text-sm text-gray-800 min-w-[80px] transition-all duration-200 gap-1.5 hover:bg-gray-50 hover:border-gray-400"
            style={{
              fontFamily: '"Museo Sans", sans-serif',
              fontWeight: 300
            }}
            title={'List View'}
          >
          <VscMenu className="w-4 h-4 text-gray-600 flex-shrink-0" />
            <span className="font-mono font-medium text-[0.875em] whitespace-nowrap leading-none">
              {total} Apps
            </span>
          </button>
          
          {/* X Apps drop-down menu */}
          {xAppsSelectorVisible && (
            <div
              data-xapps-selector-dropdown
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-[1000] min-w-[200px] max-h-[300px] overflow-y-auto origin-top"
            >
              <div className="py-2">
                {/* Download Selected option - interactive for all logged in users */}
                <div
                  onClick={async () => {
                    try {
                      setXAppsSelectorVisible(false);
                      
                      // Show download prompt
                      showNotification.success('Preparing download...');
                      
                      // Get current filter status
                      const currentFilters = {
                        os: filterValues.os || '',
                        appId: filterValues.appId || '',
                        appName: filterValues.appName || '',
                        category: filterValues.category || '',
                        country: filterValues.country || ''
                      };
                      
                      // Call the backend download interface
                      const response = await fetch('/api/apps-finder/download-filtered', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${localStorage.getItem('token')}`
                        },
                        body: JSON.stringify({
                          filters: currentFilters
                        })
                      });
                      
                      if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.message || 'Download failed');
                      }
                      
                      // Get file name
                      const contentDisposition = response.headers.get('Content-Disposition');
                      let filename = 'Apps_Finder_Export.xlsx';
                      if (contentDisposition) {
                        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                        if (filenameMatch) {
                          filename = filenameMatch[1];
                        }
                      }
                      
                      // Create download link
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = filename;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      window.URL.revokeObjectURL(url);
                      
                      showNotification.success('Download completed!');
                      
                    } catch (error: any) {
                      console.error('Download failed:', error);
                      showNotification.error(`Download failed: ${error.message}`);
                    }
                  }}
                  className="flex items-center px-4 py-2 text-sm text-gray-800 transition-colors duration-200 gap-2 cursor-pointer hover:bg-gray-50"
                  style={{
                    fontFamily: '"Museo Sans", sans-serif'
                  }}
                >
                  <RiFolderDownloadLine className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <span>{'Download Selected'}</span>
                </div>
                
                {/* Delete Selected option - only Super Admin can interact */}
                <div
                  onClick={() => {
                    if (!isSuperAdmin) return;
                    setXAppsSelectorVisible(false);
                    setDeleteConfirmVisible(true);
                  }}
                  className={`flex items-center px-4 py-2 text-sm text-gray-800 transition-colors duration-200 gap-2 ${isSuperAdmin ? 'cursor-pointer hover:bg-gray-50' : 'cursor-not-allowed opacity-50 pointer-events-none'}`}
                  style={{
                    fontFamily: '"Museo Sans", sans-serif'
                  }}
                >
                  <TbHttpDelete className="w-4 h-4 text-gray-600 flex-shrink-0" />
                  <span>{'Delete Selected'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Platform selector - using custom button styles */}
        <div className="relative" style={{ zIndex: 9999 }} data-os-selector>
          <button
            onClick={() => {
              // Close the additional filters drop-down menu
              setCategorySelectorVisible(false);
              setGeoSelectorVisible(false);
              setAppIdSelectorVisible(false);
              setAppNameSelectorVisible(false);
              setXAppsSelectorVisible(false);
              // Switch current filter
              setOsSelectorVisible(!osSelectorVisible);
            }}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded bg-white cursor-pointer text-sm text-gray-800 min-w-[150px] justify-between transition-all duration-200 hover:bg-gray-50 hover:border-gray-400"
            style={{
              fontFamily: '"Museo Sans", sans-serif',
              fontWeight: 300
            }}
          >
            <span>
              {filterValues.os || ('Select Platform')}
            </span>
            <svg 
              width="12" 
              height="12" 
              viewBox="0 0 12 12" 
              fill="none"
              className={`transition-transform duration-200 ${osSelectorVisible ? 'rotate-180' : 'rotate-0'}`}
            >
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          
          {/* Platform selector dropdown menu */}
          {osSelectorVisible && (
            <div
              data-os-selector-dropdown
              className="absolute top-full left-0 z-[99999] bg-white text-gray-800 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] rounded border border-gray-200 w-[150px] max-h-[280px] overflow-y-auto text-sm leading-5 opacity-0 translate-y-[-10px] scale-95 transition-all duration-300 origin-top"
            style={{
                        fontFamily: '"Museo Sans", sans-serif',
                        fontWeight: 300,
                        letterSpacing: '0.0025em',
                        WebkitFontSmoothing: 'antialiased',
                        textSizeAdjust: '100%',
                        WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                opacity: osSelectorVisible ? 1 : 0,
                transform: osSelectorVisible ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.95)'
              }}
            >
              <div className="max-h-[200px] overflow-y-auto">
                        {/* Add "Select Platform" option */}
                        <div
                          onClick={() => {
                            setFilterValues({ ...filterValues, os: '' });
                            setOsSelectorVisible(false);
                            handleQuery({ ...filterValues, os: '' });
                          }}
                  className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 border-b border-gray-100 transition-colors duration-200 ${
                    filterValues.os === '' ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Select Platform'}
                            </div>
                    <div className="text-[11px] text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Show all platforms'}
                            </div>
                          </div>
                        </div>
                        
                        {/* Platform options list */}
                        {osOptions.map((option, index) => (
                          <div
                            key={option.value}
                            onClick={() => {
                              setFilterValues({ ...filterValues, os: option.value });
                              setOsSelectorVisible(false);
                              handleQuery({ ...filterValues, os: option.value });
                            }}
                    className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors duration-200 ${
                      index < osOptions.length - 1 ? 'border-b border-gray-100' : ''
                    } ${
                      filterValues.os === option.value ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                {option.label}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Category Selector - Use Custom Button Style */}
                <div className="relative" style={{ zIndex: 9999 }} data-category-selector>
                  <button
                    onClick={() => {
                      // Close the additional filters drop-down menu
                      setOsSelectorVisible(false);
                      setGeoSelectorVisible(false);
                      setAppIdSelectorVisible(false);
                      setAppNameSelectorVisible(false);
                      setXAppsSelectorVisible(false);
                      // Switch current filter
                      setCategorySelectorVisible(!categorySelectorVisible);
                    }}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded bg-white cursor-pointer text-sm text-gray-800 min-w-[150px] justify-between transition-all duration-200 hover:bg-gray-50 hover:border-gray-400"
                    style={{
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 300
                    }}
                  >
                    <span>
                      {filterValues.category || ('Select Category')}
                    </span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      className={`transition-transform duration-200 ${categorySelectorVisible ? 'rotate-180' : 'rotate-0'}`}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  
                  {/* Category selector drop-down menu */}
                  {categorySelectorVisible && (
                    <div
                      data-category-selector-dropdown
                      className="absolute top-full left-0 z-[99999] bg-white text-gray-800 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] rounded border border-gray-200 w-[150px] max-h-[280px] overflow-y-auto text-sm leading-5 opacity-0 translate-y-[-10px] scale-95 transition-all duration-300 origin-top"
                      style={{
                        fontFamily: '"Museo Sans", sans-serif',
                        fontWeight: 300,
                        letterSpacing: '0.0025em',
                        WebkitFontSmoothing: 'antialiased',
                        textSizeAdjust: '100%',
                        WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                        opacity: categorySelectorVisible ? 1 : 0,
                        transform: categorySelectorVisible ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.95)'
                      }}
                    >
                      <div className="max-h-[200px] overflow-y-auto">
                        {/* Add "Select Category" option */}
                        <div
                          onClick={() => {
                            setFilterValues({ ...filterValues, category: '' });
                            setCategorySelectorVisible(false);
                            handleQuery({ ...filterValues, category: '' });
                          }}
                          className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 border-b border-gray-100 transition-colors duration-200 ${
                            filterValues.category === '' ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Select Category'}
                            </div>
                            <div className="text-[11px] text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Show all categories'}
                            </div>
                          </div>
                        </div>
                        
                        {/* Category option list */}
                        {categoryOptions.map((category, index) => (
                          <div
                            key={category}
                            onClick={() => {
                              setFilterValues({ ...filterValues, category: category });
                              setCategorySelectorVisible(false);
                              handleQuery({ ...filterValues, category: category });
                            }}
                            className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors duration-200 ${
                              index < categoryOptions.length - 1 ? 'border-b border-gray-100' : ''
                            } ${
                              filterValues.category === category ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                {category}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Geo (country) selector - single selection, style logic inheritance Select Category */}
                <div className="relative" style={{ zIndex: 9999 }} data-geo-selector>
                  <button
                    onClick={() => {
                      // Close the additional filters drop-down menu
                      setOsSelectorVisible(false);
                      setCategorySelectorVisible(false);
                      setAppIdSelectorVisible(false);
                      setAppNameSelectorVisible(false);
                      setXAppsSelectorVisible(false);
                      // Clear search text when opening
                      if (!geoSelectorVisible) {
                        setGeoSearchText('');
                      }
                      // Switch current filter
                      setGeoSelectorVisible(!geoSelectorVisible);
                    }}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded bg-white cursor-pointer text-sm text-gray-800 min-w-[150px] justify-between transition-all duration-200 hover:bg-gray-50 hover:border-gray-400"
                    style={{
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 300
                    }}
                  >
                    <span>
                      {filterValues.country ? filterValues.country.toUpperCase() : ('Select Geo')}
                    </span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      className={`transition-transform duration-200 ${geoSelectorVisible ? 'rotate-180' : 'rotate-0'}`}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {/* Geo selector dropdown menu */}
                  {geoSelectorVisible && (
                    <div
                      data-geo-selector-dropdown
                      className="absolute top-full left-0 z-[99999] bg-white text-gray-800 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] rounded border border-gray-200 w-[200px] max-h-[380px] overflow-y-auto text-sm leading-5 opacity-0 translate-y-[-10px] scale-95 transition-all duration-300 origin-top"
                      style={{
                        fontFamily: '"Museo Sans", sans-serif',
                        fontWeight: 300,
                        letterSpacing: '0.0025em',
                        WebkitFontSmoothing: 'antialiased',
                        textSizeAdjust: '100%',
                        WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                        opacity: geoSelectorVisible ? 1 : 0,
                        transform: geoSelectorVisible ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.95)'
                      }}
                    >
                      {/* search box */}
                      <div className="px-4 py-2 border-b border-gray-200">
                        <input
                          type="text"
                          placeholder={'Enter Geo...'}
                          value={geoSearchText}
                          onChange={(e) => setGeoSearchText(e.target.value)}
                          className="w-full outline-none border-0 bg-transparent text-sm text-gray-800 placeholder:text-gray-400"
                          style={{
                            fontFamily: '"Museo Sans", sans-serif',
                            fontWeight: 300,
                            letterSpacing: '0.005em'
                          }}
                        />
                      </div>

                      <div className="max-h-[300px] overflow-y-auto">
                        {/* Added "Select Geo" option */}
                        <div
                          onClick={() => {
                            setFilterValues({ ...filterValues, country: '' });
                            setGeoSelectorVisible(false);
                            handleQuery({ ...filterValues, country: '' });
                          }}
                          className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 border-b border-gray-100 transition-colors duration-200 ${
                            filterValues.country === '' ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Select Geo'}
                            </div>
                            <div className="text-[11px] text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Show all geos'}
                            </div>
                          </div>
                        </div>

                        {/* Geo option list */}
                        {filteredGeoOptions.map((country, index) => (
                          <div
                            key={country}
                            onClick={() => {
                              setFilterValues({ ...filterValues, country: country });
                              setGeoSelectorVisible(false);
                              handleQuery({ ...filterValues, country: country });
                            }}
                            className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors duration-200 ${
                              index < filteredGeoOptions.length - 1 ? 'border-b border-gray-100' : ''
                            } ${
                              filterValues.country === country ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                {country.toUpperCase()}
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* No search result prompt */}
                        {filteredGeoOptions.length === 0 && geoSearchText && (
                          <div className="py-4 text-center text-gray-600 text-sm">
                            {'No matching geos found'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* App ID input box - use custom button style */}
                <div className="relative" style={{ zIndex: 9999 }} data-appid-selector>
                  <button
                    onClick={() => {
                      // Close the additional filters drop-down menu
                      setOsSelectorVisible(false);
                      setCategorySelectorVisible(false);
                      setGeoSelectorVisible(false);
                      setAppNameSelectorVisible(false);
                      setXAppsSelectorVisible(false);
                      // Clear search text when opening
                      if (!appIdSelectorVisible) {
                        setAppIdSearchText('');
                      }
                      // Switch current filter
                      setAppIdSelectorVisible(!appIdSelectorVisible);
                    }}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded bg-white cursor-pointer text-sm text-gray-800 min-w-[150px] justify-between transition-all duration-200 hover:bg-gray-50 hover:border-gray-400"
                    style={{
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 300
                    }}
                  >
                    <span>
                      {filterValues.appId || ('App ID Filter')}
                    </span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      className={`transition-transform duration-200 ${appIdSelectorVisible ? 'rotate-180' : 'rotate-0'}`}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  
                  {/* App ID Filter drop-down menu */}
                  {appIdSelectorVisible && (
                    <div
                      data-appid-selector-dropdown
                      className="absolute top-full left-0 z-[99999] bg-white text-gray-800 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] rounded border border-gray-200 w-[200px] max-h-[380px] overflow-y-auto text-sm leading-5 opacity-0 translate-y-[-10px] scale-95 transition-all duration-300 origin-top"
                      style={{
                        fontFamily: '"Museo Sans", sans-serif',
                        fontWeight: 300,
                        letterSpacing: '0.0025em',
                        WebkitFontSmoothing: 'antialiased',
                        textSizeAdjust: '100%',
                        WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                        opacity: appIdSelectorVisible ? 1 : 0,
                        transform: appIdSelectorVisible ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.95)'
                      }}
                    >
                      {/* search box */}
                      <div className="px-4 py-2 border-b border-gray-200">
                        <input
                          type="text"
                          placeholder={'Enter App ID...'}
                          value={appIdSearchText}
                          onChange={(e) => setAppIdSearchText(e.target.value)}
                          className="w-full outline-none border-0 bg-transparent text-sm text-gray-800 placeholder:text-gray-400"
                          style={{
                            fontFamily: '"Museo Sans", sans-serif',
                            fontWeight: 300,
                            letterSpacing: '0.005em'
                          }}
                        />
                      </div>
                      
                      <div className="max-h-[300px] overflow-y-auto">
                        {/* Added "Select App ID" option */}
                        <div
                          onClick={() => {
                            setFilterValues({ ...filterValues, appId: '' });
                            setAppIdSelectorVisible(false);
                            handleQuery({ ...filterValues, appId: '' });
                          }}
                          className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 border-b border-gray-100 transition-colors duration-200 ${
                            filterValues.appId === '' ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Select App ID'}
                            </div>
                            <div className="text-[11px] text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Show all app IDs'}
                            </div>
                          </div>
                        </div>
                        
                        {/* List of App ID options */}
                        {filteredAllAppIdOptions.map((appId, index) => (
                          <div
                            key={appId}
                            onClick={() => {
                              setFilterValues({ ...filterValues, appId: appId });
                              setAppIdSelectorVisible(false);
                              handleQuery({ ...filterValues, appId: appId });
                            }}
                            className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors duration-200 ${
                              index < filteredAllAppIdOptions.length - 1 ? 'border-b border-gray-100' : ''
                            } ${
                              filterValues.appId === appId ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                {appId}
                              </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* No search result prompt */}
                        {filteredAllAppIdOptions.length === 0 && appIdSearchText && (
                          <div className="py-4 text-center text-gray-600 text-sm">
                            {'No matching app IDs found'}
                          </div>
                        )}
                        
                      </div>
                    </div>
                  )}
                </div>
                
                {/* App name picker - use custom button style */}
                <div className="relative" style={{ zIndex: 9999 }} data-appname-selector>
                  <button
                    onClick={() => {
                      // Close the additional filters drop-down menu
                      setOsSelectorVisible(false);
                      setCategorySelectorVisible(false);
                      setGeoSelectorVisible(false);
                      setAppIdSelectorVisible(false);
                      setXAppsSelectorVisible(false);
                      // Clear search text when opening
                      if (!appNameSelectorVisible) {
                        setAppNameSearchText('');
                      }
                      // Switch current filter
                      setAppNameSelectorVisible(!appNameSelectorVisible);
                    }}
                    className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded bg-white cursor-pointer text-sm text-gray-800 min-w-[150px] justify-between transition-all duration-200 hover:bg-gray-50 hover:border-gray-400"
                style={{
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 300
                    }}
                  >
                    <span>
                      {filterValues.appName || ('App Name Filter')}
                    </span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      className={`transition-transform duration-200 ${appNameSelectorVisible ? 'rotate-180' : 'rotate-0'}`}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  
                  {/* App Name Filter drop-down menu */}
                  {appNameSelectorVisible && (
                    <div
                      data-appname-selector-dropdown
                      className="absolute top-full left-0 z-[99999] bg-white text-gray-800 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] rounded border border-gray-200 w-[200px] max-h-[380px] overflow-y-auto text-sm leading-5 opacity-0 translate-y-[-10px] scale-95 transition-all duration-300 origin-top"
                      style={{
                        fontFamily: '"Museo Sans", sans-serif',
                        fontWeight: 300,
                        letterSpacing: '0.0025em',
                        WebkitFontSmoothing: 'antialiased',
                        textSizeAdjust: '100%',
                        WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                        opacity: appNameSelectorVisible ? 1 : 0,
                        transform: appNameSelectorVisible ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.95)'
                      }}
                    >
                      {/* search box */}
                      <div className="px-4 py-2 border-b border-gray-200">
                        <input
                          type="text"
                          placeholder={'Enter App Name...'}
                          value={appNameSearchText}
                          onChange={(e) => setAppNameSearchText(e.target.value)}
                          className="w-full outline-none border-0 bg-transparent text-sm text-gray-800 placeholder:text-gray-400"
                          style={{
                            fontFamily: '"Museo Sans", sans-serif',
                            fontWeight: 300,
                            letterSpacing: '0.005em'
                          }}
                        />
                      </div>
                      
                      <div className="max-h-[300px] overflow-y-auto">
                        {/* Added "Select App Name" option */}
                        <div
                          onClick={() => {
                            setFilterValues({ ...filterValues, appName: '' });
                            setAppNameSelectorVisible(false);
                            handleQuery({ ...filterValues, appName: '' });
                          }}
                          className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 border-b border-gray-100 transition-colors duration-200 ${
                            filterValues.appName === '' ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Select App Name'}
                            </div>
                            <div className="text-[11px] text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis">
                              {'Show all apps'}
                            </div>
                          </div>
                        </div>
                        
                        {/* App Name option list */}
                        {filteredAppNameOptions.map((appName, index) => (
                          <div
                            key={appName}
                            onClick={() => {
                              setFilterValues({ ...filterValues, appName: appName });
                              setAppNameSelectorVisible(false);
                              handleQuery({ ...filterValues, appName: appName });
                            }}
                            className={`px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors duration-200 ${
                              index < filteredAppNameOptions.length - 1 ? 'border-b border-gray-100' : ''
                            } ${
                              filterValues.appName === appName ? 'bg-gray-100' : 'bg-transparent hover:bg-gray-50'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-normal text-gray-800 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
                                {appName}
          </div>
                            </div>
                          </div>
                        ))}
                        
                        {/* No search result prompt */}
                        {filteredAppNameOptions.length === 0 && appNameSearchText && (
                          <div className="py-4 text-center text-gray-600 text-sm">
                            {'No matching app names found'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
        </div>
      </div>
      
        {/* Data card area */}
        <div style={{ 
          padding: '0',
          background: 'transparent',
          marginBottom: '24px'
        }}>
        <div
          ref={appsFinderCardsContainerRef}
          style={{
            position: 'relative',
            minHeight: tableLoading ? `${appsFinderSkeletonCount * APPS_FINDER_SKELETON_SLOT_HEIGHT}px` : undefined
          }}
        >
          {tableLoading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 2,
                pointerEvents: 'none'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {Array.from({ length: appsFinderSkeletonCount }).map((_, index) => (
                  <div
                    key={`appsfinder-skeleton-${index}`}
                    className="animate-pulse"
                    style={{
                      height: '70px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '4px',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '12px'
                    }}
                  >
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: '#f1f5f9',
                        marginRight: '12px',
                        flexShrink: 0
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ width: '45%', height: '12px', borderRadius: '4px', backgroundColor: '#f1f5f9', marginBottom: '8px' }} />
                      <div style={{ width: '62%', height: '10px', borderRadius: '4px', backgroundColor: '#f8fafc', marginBottom: '6px' }} />
                      <div style={{ width: '34%', height: '10px', borderRadius: '4px', backgroundColor: '#f8fafc' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* card list */}
                <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            opacity: tableLoading ? 0 : 1,
            transition: 'opacity 260ms ease',
            transform: 'none'
          }}>
            {dataSource.length > 0 ? (
              dataSource.map((item, index) => (
                <div
                  key={`${item.appId}_${item.country}_${index}`}
                  onClick={() => {
                    setSelectedAppDetail(item);
                    setAppDetailModalVisible(true);
                  }}
                  className="flex items-center p-3 bg-white border border-gray-200 rounded transition-all duration-200 cursor-pointer relative hover:border-gray-300 hover:shadow-md hover:-translate-y-0.5"
                  style={{
                    animation: 'fadeInRow 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
                    animationDelay: `${index * 0.1}s`,
                    opacity: 0,
                    transform: 'translateY(20px) scale(0.95)',
                    animationFillMode: 'forwards'
                  }}
                >
                  {/* Button area in the upper right corner */}
                  <div className="absolute top-0 right-0 flex items-center gap-1 z-10">
                    {/* URL jump button */}
                    {item.url && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(item.url, '_blank');
                        }}
                        className="p-1.5 bg-transparent border-none rounded cursor-pointer transition-all duration-200 flex items-center justify-center hover:bg-gray-100"
                        title={'Open App URL'}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-gray-900">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <polyline points="15,3 21,3 21,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                    
                    {/* Delete button - only Super Admin interactive */}
                    <div className="relative" data-delete-confirm-bubble>
                    <button
                        data-delete-button={`${item.appId}_${item.country}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isSuperAdmin) return;
                          const uniqueKey = `${item.appId}_${item.country}`;
                          setDeleteConfirmBubble(deleteConfirmBubble === uniqueKey ? null : uniqueKey);
                      }}
                      disabled={deletingApps.has(`${item.appId}_${item.country}`) || !isSuperAdmin}
                        className={`p-1.5 bg-transparent border-none rounded transition-all duration-200 flex items-center justify-center ${
                          deletingApps.has(`${item.appId}_${item.country}`) || !isSuperAdmin
                            ? 'cursor-default pointer-events-none opacity-50' 
                            : 'cursor-pointer hover:bg-gray-100'
                        }`}
                        title={!isSuperAdmin ? ('Permission not supported') : deletingApps.has(`${item.appId}_${item.country}`) ? 
                        ('Deleting...') : 
                        ('Delete App Info')
                      }
                    >
                        {deletingApps.has(`${item.appId}_${item.country}`) ? (
                          <div className="w-3.5 h-3.5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-gray-900">
                          <path d="M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                      
                      {/* Delete confirmation bubble */}
                      {deleteConfirmBubble === `${item.appId}_${item.country}` && bubblePosition && createPortal(
                        <>
                          {/* Mask layer for clicking outside to close */}
                          <div
                            className="fixed inset-0 z-[9998]"
                            onClick={() => setDeleteConfirmBubble(null)}
                          />
                          {/* Bubble content */}
                          <div 
                            className="fixed z-[9999] bg-white border border-gray-200 rounded shadow-lg min-w-[200px] animate-[fadeIn_0.15s_ease-out]"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              top: `${bubblePosition.top}px`,
                              right: `${bubblePosition.right}px`
                            }}
                          >
                            {/* bubble arrow */}
                            <div 
                              className="absolute -top-1.5 right-4 w-3 h-3 bg-white border-l border-t border-gray-200 rotate-45"
                            ></div>
                            
                            {/* Bubble content */}
                            <div className="p-3">
                              <div className="text-sm text-gray-800 mb-3 font-medium">
                                {'Delete this app?'}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmBubble(null);
                                  }}
                                  className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors duration-200"
                                >
                                  {'Cancel'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmBubble(null);
                                    deleteAppInfo(item.appId, item.country);
                                  }}
                                  className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 border border-red-600 rounded hover:bg-red-700 transition-colors duration-200"
                                >
                                  {'Delete'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                  </div>
                  {/* application icon */}
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-gray-100 overflow-hidden flex-shrink-0 mr-2.5 relative">
                    {item.iconUrl ? (
                      <LazyImage
                        src={item.iconUrl} 
                        alt={item.appName || 'App Icon'}
                        className="w-full h-full object-cover absolute top-0 left-0 transition-opacity duration-300"
                        style={{
                          opacity: preloadedIcons.has(item.iconUrl) || loadedImagesCache.current.has(item.iconUrl) ? 1 : 0
                        }}
                        onLoad={(e) => {
                          // Displayed after the icon is loaded
                          e.currentTarget.style.opacity = '1';
                        }}
                        onError={(e) => {
                          // If the image fails to load, hide the image and show the default icon
                          e.currentTarget.style.display = 'none';
                          const defaultIcon = e.currentTarget.parentElement?.querySelector('.default-app-icon') as HTMLElement;
                          if (defaultIcon) {
                            defaultIcon.style.display = 'flex';
                          }
                        }}
                      />
                    ) : null}
                    <div 
                      className="default-app-icon"
                      style={{ 
                        display: item.iconUrl ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                        top: 0,
                        left: 0
                      }}
                    >
                      <svg 
                        width="20" 
                        height="20" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        className="text-gray-400"
                      >
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>

                  {/* Application details */}
                  <div className="flex-1 flex flex-col gap-px">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="m-0 text-sm font-semibold text-gray-800 leading-tight" style={{
                        fontFamily: '"Museo Sans", sans-serif'
                      }}>
                        {item.appName || 'Unknown App'}
                      </h3>
                      <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-gray-100 rounded text-[10px] text-gray-500 font-medium whitespace-nowrap leading-none">
                        {item.os || 'Unknown Platform'}
                      </span>
                      {item.category && (
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-purple-50 rounded text-[10px] text-purple-600 font-medium whitespace-nowrap leading-none">
                          {item.category}
                        </span>
                      )}
                      {item.keywords && item.keywords.split(',').slice(0, 6).map((keyword: string, index: number) => (
                        <span key={index} className="inline-flex items-center justify-center px-1.5 py-0.5 bg-green-50 rounded text-[10px] text-green-600 font-medium whitespace-nowrap leading-none">
                          {keyword.trim()}
                        </span>
                      ))}
                    </div>
                    
                    {/* Developer Information Line */}
                    <div className="text-xs text-gray-500 font-normal leading-tight" style={{
                      fontFamily: '"Museo Sans", sans-serif'
                    }}>
                      {item.developerUrl ? (
                        <a 
                          href={item.developerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 no-underline cursor-pointer hover:underline"
                        >
                          {item.developer || 'Unknown Developer'}
                        </a>
                      ) : (
                        <span>{item.developer || 'Unknown Developer'}</span>
                      )}
                    </div>
                    
                    <div className="text-xs text-gray-600 font-normal leading-tight" style={{
                      fontFamily: '"Museo Sans", sans-serif'
                    }}>
                      {item.appId || 'No App ID'}
                      {item.country && (
                        <span className="text-gray-400 ml-2">
                          | {item.country.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div
                className="flex flex-col items-center justify-center cursor-pointer rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/80 hover:border-gray-400 hover:bg-gray-100/80 transition-all duration-200"
                style={{
                  minHeight: '280px',
                  fontFamily: '"Museo Sans", sans-serif',
                  padding: '32px 24px'
                }}
                onClick={() => {
                  if (userProfile?.role !== 'Super Admin') {
                    message.warning('Permission not supported');
                    return;
                  }
                  uploadFileInputRef.current?.click();
                }}
              >
                <input
                  ref={uploadFileInputRef}
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    const isCsv = /\.csv$/i.test(file.name);
                    const isXlsx = /\.xlsx$/i.test(file.name);
                    if (!isCsv && !isXlsx) {
                      message.error('Invalid file type. Only CSV and XLSX are allowed.');
                      return;
                    }
                    setUploadFile(file);
                    setUploadPreview(null);
                    setUploadPreviewLoading(true);
                    try {
                      const form = new FormData();
                      form.append('file', file);
                      const token = localStorage.getItem('token');
                      const res = await fetch('/api/apps-finder/upload-preview', {
                        method: 'POST',
                        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                        body: form
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok && data.success && data.sheets && data.sheets.length) {
                        setUploadPreview({ file_type: data.file_type || 'xlsx', sheets: data.sheets, file_name: data.file_name || file.name });
                        const firstValid = data.sheets.find((s: { valid: boolean }) => s.valid);
                        setUploadSheetIndex(firstValid ? firstValid.index : data.sheets[0].index);
                      } else {
                        message.error((data && data.message) || 'Preview failed. Check file format.');
                        setUploadFile(null);
                      }
                    } catch (err) {
                      message.error('Preview request failed. Please try again.');
                      setUploadFile(null);
                    } finally {
                      setUploadPreviewLoading(false);
                    }
                  }}
                />
                <Upload size={48} className="text-gray-400 mb-4" strokeWidth={1.2} />
                <div className="text-gray-600 text-sm font-medium mb-1" style={{ fontFamily: '"Museo Sans", sans-serif' }}>
                  {uploadPreviewLoading ? 'Parsing file...' : 'Upload CSV or XLSX'}
                </div>
                <div className="text-gray-500 text-xs font-light" style={{ fontFamily: '"Museo Sans", sans-serif' }}>
                  {uploadPreviewLoading ? 'Detecting sheets...' : 'Click to select a file from your device'}
                </div>
              </div>
            )}
            {/* Select the data sheet page number: After previewing, select the sheet to upload, and then click Upload */}
            {uploadPreview && uploadFile && (
              <div className="mt-4 p-4 rounded-lg border border-gray-200 bg-white shadow-sm" style={{ fontFamily: '"Museo Sans", sans-serif' }}>
                <div className="text-sm font-medium text-gray-800 mb-2">Select data sheet to upload</div>
                <div className="text-xs text-gray-700 mb-3"><span className="font-semibold">File:</span> {uploadPreview.file_name}</div>
                <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                  {uploadPreview.sheets.map((sheet) => (
                    <label
                      key={sheet.index}
                      className={`flex items-start gap-3 p-2 rounded border cursor-pointer ${uploadSheetIndex === sheet.index ? 'border-gray-700 bg-gray-100' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <input
                        type="radio"
                        name="uploadSheet"
                        checked={uploadSheetIndex === sheet.index}
                        onChange={() => setUploadSheetIndex(sheet.index)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-800">{sheet.name}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${sheet.valid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {sheet.valid ? 'Valid' : 'Invalid'}
                        </span>
                        <span className="ml-2 text-xs text-gray-500">{sheet.row_count} row(s)</span>
                        {!sheet.valid && sheet.missing && sheet.missing.length > 0 && (
                          <div className="text-xs text-amber-600 mt-1">Missing: {sheet.missing.slice(0, 5).join(', ')}{sheet.missing.length > 5 ? '...' : ''}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setUploadPreview(null); setUploadFile(null); }}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={uploading || !uploadPreview.sheets.find((s) => s.index === uploadSheetIndex)?.valid}
                    onClick={async () => {
                      if (!uploadFile || uploading) return;
                      setUploading(true);
                      try {
                        const form = new FormData();
                        form.append('file', uploadFile);
                        form.append('sheet_index', String(uploadSheetIndex));
                        const token = localStorage.getItem('token');
                        const res = await fetch('/api/apps-finder/upload', {
                          method: 'POST',
                          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                          body: form
                        });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok && data.success) {
                          message.success(data.message || 'Upload completed.');
                          setUploadPreview(null);
                          setUploadFile(null);
                          fetchData(1, pageSize, filters);
                        } else {
                          message.error((data && data.message) || 'Upload failed.');
                        }
                      } catch (err) {
                        message.error('Upload request failed. Please try again.');
                      } finally {
                        setUploading(false);
                      }
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-gray-800 rounded hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
          
        {/* Slide Up & Load More component (replaces page switching) */}
        {!tableLoading && dataSource.length > 0 && (
          <div className="mt-6 mb-2 flex flex-col items-center">
            <LoadMoreControl
              loadedCount={dataSource.length}
              total={total}
              hasMore={hasMore}
              loadingMore={isLoadingMore}
              onLoadMore={handleLoadMore}
            />
          </div>
        )}
      </div>



      {/* Custom style */}
      <style>{`
        /*Drop-down menu animation effect*/
        [data-os-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        [data-appname-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        [data-appid-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        [data-category-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        [data-xapps-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        [data-settings-selector-dropdown] {
          animation: dropdownFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        
        @keyframes dropdownFadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        /*App Store style developer link style*/
        .developer-link {
          color: #0070c9 !important;
          text-decoration: none !important;
          transition: all 0.2s ease !important;
          cursor: pointer !important;
        }
        
        .developer-link:hover {
          color: #0071e3 !important;
          text-decoration: underline !important;
          text-underline-offset: 2px !important;
          text-decoration-thickness: 1px !important;
          text-decoration-color: #0071e3 !important;
        }
        
        .developer-link:active {
          color: #0056b3 !important;
          text-decoration: underline !important;
          text-underline-offset: 2px !important;
          text-decoration-thickness: 1px !important;
          text-decoration-color: #0056b3 !important;
        }
        
        @keyframes fadeInRow {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        /*Pop up card animation*/
        @keyframes popupSlideIn {
          0% {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
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

        /*App details pop-up window: avoid scale animation causing text resampling jitter*/
        @keyframes appDetailModalIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .app-detail-modal-panel {
          animation: appDetailModalIn 0.18s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: opacity, transform;
          backface-visibility: hidden;
          transform: translateZ(0);
        }
      `}</style>
      
      {/* Delete confirmation popup */}
      {deleteConfirmVisible && createPortal(
        <div 
          className="custom-modal-overlay"
          onClick={() => setDeleteConfirmVisible(false)}
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
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              animation: 'slideInBubble 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center'
        }}>
          {/* Warning icon - plain icon, no background */}
          <div style={{
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <svg 
              className="h-6 w-6 bg-primary dark:bg-primary-light !m-0 shrink-0" 
              style={{
                maskImage: 'url("https://d3gk2c5xim1je2.cloudfront.net/v6.6.0/regular/map.svg")',
                maskRepeat: 'no-repeat',
                maskPosition: 'center center',
                backgroundColor: 'rgb(255, 113, 60)'
              }}
            />
          </div>
          
          {/* Title */}
          <h3 style={{
            margin: '0 0 8px 0',
            fontSize: '16px',
            fontWeight: '600',
            color: 'rgb(34, 13, 78)',
            fontFamily: '"Museo Sans", sans-serif'
          }}>
            {'Confirm Delete'}
          </h3>
          
          {/* description text */}
          <p style={{
            margin: '0 0 24px 0',
            fontSize: '14px',
            color: '#666',
            lineHeight: '1.5',
            fontFamily: '"Museo Sans", sans-serif'
          }}>
            {`Are you sure you want to delete ${total} apps under current filter conditions? This action cannot be undone.`}
          
          </p>
          
          {/* button group */}
          <div style={{
            display: 'flex',
            gap: '12px',
            width: '100%'
          }}>
            <button
              onClick={() => setDeleteConfirmVisible(false)}
              disabled={deleteLoading}
              style={{
                flex: 1,
                padding: '8px 16px',
                border: '1px solid #d9d9d9',
                borderRadius: '2px',
                background: '#fff',
                color: 'rgb(34, 13, 78)',
                fontSize: '14px',
                fontFamily: '"Museo Sans", sans-serif',
                fontWeight: '400',
                cursor: deleteLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: deleteLoading ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!deleteLoading) {
                  e.currentTarget.style.backgroundColor = '#f5f5f5';
                  e.currentTarget.style.borderColor = '#bfbfbf';
                }
              }}
              onMouseLeave={(e) => {
                if (!deleteLoading) {
                  e.currentTarget.style.backgroundColor = '#fff';
                  e.currentTarget.style.borderColor = '#d9d9d9';
                }
              }}
            >
              {'Cancel'}
            </button>
            
            <button
              onClick={async () => {
                try {
                  setDeleteLoading(true);
                  
                  // Get current filter status
                  const currentFilters = {
                    os: filterValues.os || '',
                    appId: filterValues.appId || '',
                    appName: filterValues.appName || '',
                    category: filterValues.category || '',
                    country: filterValues.country || ''
                  };
                  
                  // Call the backend deletion interface
                  const response = await fetch('/api/apps-finder/delete-filtered', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({
                      filters: currentFilters
                    })
                  });
                  
                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.message || 'Delete failed');
                  }
                  
                  const result = await response.json();
                  
                  // Close pop-up window
                  setDeleteConfirmVisible(false);
                  
                  // Show success message
                  showNotification.success(
                    `Successfully deleted ${result.deletedCount || 0} apps`
                  );
                  
                  // Refresh data
                  handleQuery(filterValues);
                  
                } catch (error: any) {
                  console.error('Delete failed:', error);
                  showNotification.error(
                    `Delete failed: ${error.message}`
                  );
                } finally {
                  setDeleteLoading(false);
                }
              }}
              disabled={deleteLoading}
              style={{
                flex: 1,
                padding: '8px 16px',
                border: '1px solid #ff4d4f',
                borderRadius: '2px',
                background: deleteLoading ? '#ffccc7' : '#ff4d4f',
                color: '#fff',
                fontSize: '14px',
                fontFamily: '"Museo Sans", sans-serif',
                fontWeight: '400',
                cursor: deleteLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: deleteLoading ? 0.8 : 1
              }}
              onMouseEnter={(e) => {
                if (!deleteLoading) {
                  e.currentTarget.style.backgroundColor = '#ff7875';
                  e.currentTarget.style.borderColor = '#ff7875';
                }
              }}
              onMouseLeave={(e) => {
                if (!deleteLoading) {
                  e.currentTarget.style.backgroundColor = '#ff4d4f';
                  e.currentTarget.style.borderColor = '#ff4d4f';
                }
              }}
            >
              {deleteLoading 
                ? ('Deleting...') 
                : ('Confirm Delete')
              }
            </button>
          </div>
        </div>
          </div>
        </div>
        , document.body
      )}

      {/* Application details pop-up window */}
      {appDetailModalVisible && createPortal(
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[1500] animate-[fadeIn_0.15s_cubic-bezier(0.4,0,0.2,1)]"
          onClick={() => setAppDetailModalVisible(false)}
        >
          <div 
            className="app-detail-modal-panel bg-white rounded-lg p-0 w-[900px] max-w-[90vw] max-h-[90vh] shadow-[0_8px_24px_rgba(0,0,0,0.15),0_0_0_1px_rgba(0,0,0,0.05)] relative flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pop-up header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0">
              <h2 className="m-0 text-xl font-semibold text-gray-800" style={{
                fontFamily: '"Museo Sans", sans-serif'
              }}>
                {'App Details'}
              </h2>
              <button
                onClick={() => setAppDetailModalVisible(false)}
                className="bg-transparent border-none cursor-pointer p-2 rounded flex items-center justify-center transition-colors duration-200 text-gray-800 hover:bg-gray-100"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            
            {/* Pop-up content */}
            <div className="p-4 overflow-auto flex-1 max-h-[calc(90vh-64px)]">
        {selectedAppDetail && (
          <>
            <div className="flex gap-4 flex-wrap">
              {/* App icon and basic information */}
              <div className="flex-shrink-0">
                <LazyImage
                  src={selectedAppDetail.iconUrl || 'https://via.placeholder.com/100x100?text=App'} 
                  alt={selectedAppDetail.appName || 'App Icon'}
                  className="w-[100px] h-[100px] rounded object-cover"
                  eager={true}
                  onError={(e) => {
                    e.currentTarget.src = 'https://via.placeholder.com/100x100?text=App';
                  }}
                />
              </div>
              
              {/* Application details */}
              <div className="flex-1 min-w-0">
                <div className="mb-3">
                  <h3 className="m-0 mb-1.5 text-lg font-semibold text-gray-800 select-text">
                    {selectedAppDetail.appName || 'Unknown App'}
                  </h3>
                  
                  {/* App ID */}
                  <div className="text-xs text-gray-600 mb-1.5" style={{
                    fontFamily: '"SF Pro Display","SF Pro Icons","Apple WebExp Icons Custom","Helvetica Neue",Helvetica,Arial,sans-serif',
                    letterSpacing: '0.027em',
                    WebkitFontSmoothing: 'antialiased'
                  }}>
                    {selectedAppDetail.appId || 'N/A'}
                  </div>
                  
                  {/* Developer information */}
                  <div className="text-sm text-gray-600 mb-2">
                    <span>{selectedAppDetail.developer || 'Unknown Developer'}</span>
                  </div>
                  
                  {/* Label information */}
                  <div className="mb-2 flex gap-1.5 flex-wrap items-center">
                    {/* platform tag */}
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[11px] font-medium inline-flex items-center justify-center leading-tight">
                      {selectedAppDetail.os || 'Unknown Platform'}
                    </span>
                    
                    {/* Classification tags */}
                    {selectedAppDetail.category && (
                      <span className="px-2 py-0.5 bg-gray-700 text-white rounded text-[11px] font-medium inline-flex items-center justify-center leading-tight">
                        {selectedAppDetail.category}
                      </span>
                    )}
                    
                    {/* country label */}
                    {selectedAppDetail.country && (
                      <span className="px-2 py-0.5 bg-gray-600 text-white rounded text-[11px] font-medium inline-flex items-center justify-center leading-tight">
                        {selectedAppDetail.country.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Rating information */}
                  <div className="flex gap-3 flex-wrap items-baseline mb-3">
                    {/* Rating */}
                    <div className="flex items-baseline gap-1">
                      <span className="text-yellow-500 text-xs leading-none">★</span>
                      <span className="font-semibold text-xs text-gray-800 leading-none">
                        {selectedAppDetail.rating !== undefined && selectedAppDetail.rating !== null ? Number(selectedAppDetail.rating).toFixed(1) : 'N/A'}
                      </span>
                      <span className="text-xs text-gray-600 select-none leading-none">
                        {' Score'}
                      </span>
                    </div>
                    
                    {/* Number of ratings */}
                    <div className="flex items-baseline gap-1">
                      <span className="text-gray-600 text-xs leading-none">★</span>
                      <span className="font-semibold text-xs text-gray-800 leading-none">
                        {selectedAppDetail.ratingCount && typeof selectedAppDetail.ratingCount === 'number' ? selectedAppDetail.ratingCount.toLocaleString() : '0'}
                      </span>
                      <span className="text-xs text-gray-600 select-none leading-none">
                        {' Comments'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Details grid - more compact layout */}
            <div className="mt-3">
              <h4 className="m-0 mb-2 text-[13px] font-semibold text-gray-800">
                {'Detailed Information'}
              </h4>
              
              {/* Details grid */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 mb-3">
                {/* Version information */}
                {selectedAppDetail.version && (
                  <div className="p-1.5 bg-gray-50 rounded border border-gray-200">
                    <div className="text-[11px] text-gray-500 mb-0.5">
                      {'Version'}
                    </div>
                    <div className="text-xs font-medium text-gray-800">
                      {selectedAppDetail.version}
                    </div>
                  </div>
                )}
                
                {/* file size */}
                {selectedAppDetail.size && (
                  <div className="p-1.5 bg-gray-50 rounded border border-gray-200">
                    <div className="text-[11px] text-gray-500 mb-0.5">
                      {'File Size'}
                    </div>
                    <div className="text-xs font-medium text-gray-800">
                      {typeof selectedAppDetail.size === 'number' 
                        ? `${(selectedAppDetail.size / (1024 * 1024)).toFixed(1)} MB`
                        : selectedAppDetail.size
                      }
                    </div>
                  </div>
                )}
                
                {/* price information */}
                {selectedAppDetail.price !== undefined && (
                  <div className="p-1.5 bg-gray-50 rounded border border-gray-200">
                    <div className="text-[11px] text-gray-500 mb-0.5">
                      {'Price'}
                    </div>
                    <div className="text-xs font-medium text-gray-800">
                      {selectedAppDetail.price === 0 
                        ? ('Free')
                        : `$${selectedAppDetail.price}`
                      }
                    </div>
                  </div>
                )}
                
                {/* Content rating */}
                {selectedAppDetail.contentRating && (
                  <div className="p-1.5 bg-gray-50 rounded border border-gray-200">
                    <div className="text-[11px] text-gray-500 mb-0.5">
                      {'Content Rating'}
                    </div>
                    <div className="text-xs font-medium text-gray-800">
                      {selectedAppDetail.contentRating}
                    </div>
                  </div>
                )}
                
                {/* Developer website */}
                {selectedAppDetail.developerUrl && (
                  <div className="p-1.5 bg-gray-50 rounded border border-gray-200">
                    <div className="text-[11px] text-gray-500 mb-0.5">
                      {'Developer Website'}
                    </div>
                    <div className="text-xs font-medium">
                      <a 
                        href={selectedAppDetail.developerUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-500 no-underline break-all hover:underline"
                      >
                        {selectedAppDetail.developerUrl}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* keyword tag */}
              {selectedAppDetail.keywords && (
                <div className="p-1.5 bg-gray-50 rounded border border-gray-200 mb-3">
                  <div className="text-[11px] text-gray-500 mb-1.5">
                    {'Keywords & Tags'}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedAppDetail.keywords.split(',').map((keyword: string, index: number) => (
                      <span 
                        key={index}
                        className="px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded-full text-[11px] font-medium"
                      >
                        {keyword.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Application description */}
              {selectedAppDetail.description && (
                <div className="mt-2">
                  <h4 className="m-0 mb-1.5 text-[13px] font-semibold text-gray-800">
                    {'Description'}
                  </h4>
                  <div className="text-xs text-gray-600 leading-snug max-h-20 overflow-auto p-1.5 bg-gray-50 rounded border border-gray-100">
                    {selectedAppDetail.description}
                  </div>
                </div>
              )}

              {/* Action button */}
              {selectedAppDetail.url && (
                <div className="mt-3">
                  <button
                    onClick={() => window.open(selectedAppDetail.url, '_blank')}
                    className="px-3 py-1.5 bg-gray-700 text-white border-none rounded cursor-pointer transition-all duration-200 flex items-center gap-1 text-xs hover:bg-gray-800"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-white">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="15,3 21,3 21,9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {'Open App URL'}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
            </div>
          </div>
        </div>
        , document.body
      )}
    </div>
  );
};

export default AppsFinder; 