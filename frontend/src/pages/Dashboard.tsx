import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LineChart, BarChart, PieChart, MiniBarChart, MiniBarChartData, FunnelChart, BubbleChart } from '../components/charts';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { SquareSwitch } from '../components/ui/square-switch';
import { TripleSwitch, TripleSwitchValue } from '../components/ui/triple-switch';
import { Spin } from '../components/ui/spin';
import { LoadingIcon } from '../components/ui/icons';
import { message } from '../components/ui/toast';
// Removed unused icon imports: ArrowUpIcon, ArrowDownIcon, UserIcon, DownloadIcon, EyeIcon, DollarIcon, MobileIcon, AppstoreIcon
import dayjs, { Dayjs } from 'dayjs';
// Removed unused import: axiosInstance
// Removed AccountContext import - now using API to fetch accounts from database
import { Calendar, Download, Activity, Repeat2, Inbox, ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { MdOutlineLocalOffer } from 'react-icons/md';
import '../components/DataFetchSearchBar.css';
import { ConversionSeriesPicker } from '../components/ConversionSeriesPicker';
import { autopipeAxiosInstance, getDashboardStatistics, getDashboardDailyStatistics, DashboardStatistics, getInstallConversionData, InstallConversionGroupedData, getEventConversionData, EventConversionGroupedData, getDistributionProportionData, DistributionProportionData, getEventNameStatisticsData, EventNameStatisticsData, getRegionalStatisticsData, RegionalStatisticsData, RegionalStatisticsGroupedData, getDashboardCampaignIds, getAffiliateChannelData, AffiliateChannelData } from '../services/api';

// Removed unused interface: AccountConfig

// App configuration interface
interface AppConfig {
  id: string;
  appName: string;
  appId: string;
  icon?: string;
}

interface AffiliateChannelGroupedData {
  seriesId: string;
  groupName: string;
  displayName: string;
  icon?: string;
  data: AffiliateChannelData[];
  total: number;
}

/**
 * On the right side of the statistics card: MiniBar + summary numbers in the same column and the same set of loading semantics.
 * - When there is no daily dimension data: the bar chart + number area is centered and only Spin is displayed (no additional number placeholders).
 * - If there are still old series during refresh: continue to display the old bar chart + old numbers.
 */
function DashboardStatMetricBlock({
  loading,
  series,
  value
}: {
  loading: boolean;
  series: MiniBarChartData[];
  value: number;
}) {
  const hasSeries = series.length > 0;
  const showUnifiedPlaceholder = loading;

  if (showUnifiedPlaceholder) {
    return (
      <div
        className="flex flex-shrink-0 items-center justify-center"
        style={{
          width: '120px',
          minHeight: '120px',
          pointerEvents: 'auto'
        }}
        aria-busy
        aria-label="Loading statistics"
      >
        <LoadingIcon className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-shrink-0 flex-col items-center"
      style={{ width: '120px', pointerEvents: 'auto' }}
    >
      <div className="flex items-end justify-center" style={{ height: '60px', width: '100%' }}>
        {hasSeries ? (
          <MiniBarChart data={series} width={120} height={60} color="#374151" />
        ) : (
          <div className="h-full w-full" />
        )}
      </div>
      <div
        className="mt-3 flex w-full items-center justify-center"
        style={{ height: '48px', minHeight: '48px' }}
      >
        <p
          className="text-3xl font-bold text-gray-900 tabular-nums"
          style={{ lineHeight: '1.2', fontVariantNumeric: 'tabular-nums' }}
        >
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

const Dashboard: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [loading, _setLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [timeRange, _setTimeRange] = useState('yesterday');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(() => {
    const y = dayjs().subtract(1, 'day');
    return [y, y];
  });
  const [isCustomRange, setIsCustomRange] = useState(false);
  
  // Account configuration related status (query from Dashboard data table)
  const [accountConfigs, setAccountConfigs] = useState<Array<{
    id: string;
    accountName: string;
    accountType: string;
    icon?: string;
  }>>([]);
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_selectedAccount, setSelectedAccount] = useState<string>('');
  
  // App configuration related status
  const [appConfigs, setAppConfigs] = useState<AppConfig[]>([]);
  const [accountConfigsReady, setAccountConfigsReady] = useState<boolean>(false);
  const [appConfigsReady, setAppConfigsReady] = useState<boolean>(false);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [appSelectorVisible, setAppSelectorVisible] = useState(false);
  
  // Other selector states
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountSelectorVisible, setAccountSelectorVisible] = useState(false);
  const [accountSearchText, setAccountSearchText] = useState<string>(''); // Account search text
  
  // Use ref to avoid circular dependencies and read the latest value inside the function
  const selectedAppsRef = useRef<string[]>([]);
  const selectedAccountsRef = useRef<string[]>([]);
  
  // Synchronize ref and state
  useEffect(() => {
    selectedAppsRef.current = selectedApps;
  }, [selectedApps]);
  
  useEffect(() => {
    selectedAccountsRef.current = selectedAccounts;
  }, [selectedAccounts]);
  
  // Initialization flag to avoid repeated loading during initialization
  const isInitializedRef = useRef<boolean>(false);
  // Used to track the last dateRange to avoid repeated calls (reserved)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _prevDateRangeRef = useRef<string>('');

  const [dateSelectorVisible, setDateSelectorVisible] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [tempDateRange, setTempDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [selectingStartDate, setSelectingStartDate] = useState<boolean>(true); // true means selecting the start date, false means selecting the end date
  const topHeaderRowRef = useRef<HTMLDivElement | null>(null);
  const topFiltersRef = useRef<HTMLDivElement | null>(null);
  const [isDashboardDateCompact, setIsDashboardDateCompact] = useState(false);
  const [appSearchText, setAppSearchText] = useState<string>(''); // App search text
  
  // New control status (label/offer related)
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [offerSelectorVisible, setOfferSelectorVisible] = useState(false);
  const [offerSearchText, setOfferSearchText] = useState<string>(''); // Offer search text
  const [offerOptions, setOfferOptions] = useState<Array<{
    id: string;
    name: string;
  }>>([]);

  // Statistics status
  const [statistics, setStatistics] = useState<DashboardStatistics>({
    installs: 0,
    events: 0,
    retarget_installs: 0,
    retarget_events: 0
  });
  const [statisticsLoading, setStatisticsLoading] = useState<boolean>(true);

  // Data status split by date
  const [dailyData, setDailyData] = useState<{
    installs: MiniBarChartData[];
    events: MiniBarChartData[];
    retarget_installs: MiniBarChartData[];
    retarget_events: MiniBarChartData[];
  }>({
    installs: [],
    events: [],
    retarget_installs: [],
    retarget_events: []
  });

  // Install Conversion Chart Data Status
  const [installConversionData, setInstallConversionData] = useState<InstallConversionGroupedData[]>([]);
  const [installConversionLoading, setInstallConversionLoading] = useState<boolean>(true); // Initially true to avoid showing empty when loading for the first time
  
  // Install Conversion Chart Independent ACC/APP slider status (only affects this chart)
  const [installConversionViewMode, setInstallConversionViewMode] = useState<'ACC' | 'APP'>('ACC');
  
  // Install Conversion Chart UA/RT Badge Status
  const [installConversionBadge, setInstallConversionBadge] = useState<'UA' | 'RT'>('UA');
  
  // Install Conversion Chart Currently selected series ID
  const [installConversionHighlightedSeriesId, setInstallConversionHighlightedSeriesId] = useState<string | null>(null);

  // Event Conversion Chart data status
  const [eventConversionData, setEventConversionData] = useState<EventConversionGroupedData[]>([]);
  const [eventConversionLoading, setEventConversionLoading] = useState<boolean>(true); // Initially true to avoid showing empty when loading for the first time
  
  // Event Conversion Chart Independent ACC/APP slider state (only affects this chart)
  const [eventConversionViewMode, setEventConversionViewMode] = useState<'ACC' | 'APP'>('ACC');
  
  // Event Conversion Chart UA/RT Badge Status
  const [eventConversionBadge, setEventConversionBadge] = useState<'UA' | 'RT'>('UA');
  
  // Event Conversion Chart currently selected series ID
  const [eventConversionHighlightedSeriesId, setEventConversionHighlightedSeriesId] = useState<string | null>(null);

  // Distribution Proportion Chart Status
  const [distributionProportionViewMode, setDistributionProportionViewMode] = useState<'ACC' | 'APP'>('ACC');
  const [distributionProportionBadge, setDistributionProportionBadge] = useState<'UA' | 'RT'>('UA');
  const [distributionProportionData, setDistributionProportionData] = useState<DistributionProportionData[]>([]);
  // Initially true, ensure that the loading animation is displayed on the first screen instead of Empty
  const [distributionProportionLoading, setDistributionProportionLoading] = useState<boolean>(true);
  // Used to maintain stable keys to avoid component re-creation when switching
  const [distributionProportionDataKey, setDistributionProportionDataKey] = useState<string>('');
  // Used to mark whether the chart should be rendered (rendered only after the container size is stable to avoid positioning errors)
  const [distributionProportionChartReady, setDistributionProportionChartReady] = useState<boolean>(true);

  // Event Name Statistics (Funnel Chart) Status - using distributionProportionViewMode and distributionProportionBadge
  const [eventNameStatisticsData, setEventNameStatisticsData] = useState<EventNameStatisticsData[]>([]);
  const [eventNameStatisticsLoading, setEventNameStatisticsLoading] = useState<boolean>(true);
  // Consistent with pie charts: use data keys to drive stable redrawing of funnel charts to avoid old chart residue when switching filters.
  const [eventNameStatisticsDataKey, setEventNameStatisticsDataKey] = useState<string>('');
  // Used to mark whether the chart should be rendered (rendered only after the container size is stable to avoid positioning errors)
  const [eventNameStatisticsChartReady, setEventNameStatisticsChartReady] = useState<boolean>(true);

  // Regional Statistics Chart Status
  const [regionalStatisticsTripleMode, setRegionalStatisticsTripleMode] = useState<TripleSwitchValue>('ALL');
  const [regionalStatisticsBadge, setRegionalStatisticsBadge] = useState<'UA' | 'RT'>('UA');
  const [regionalStatisticsDataType, setRegionalStatisticsDataType] = useState<'Install' | 'Event'>('Event');
  const [regionalStatisticsData, setRegionalStatisticsData] = useState<RegionalStatisticsData[]>([]);
  const [regionalStatisticsGroupedData, setRegionalStatisticsGroupedData] = useState<RegionalStatisticsGroupedData[]>([]);
  const [regionalStatisticsHighlightedSeriesId, setRegionalStatisticsHighlightedSeriesId] = useState<string | null>(null);
  // The initial value is true to avoid displaying Empty on the first screen before cutting the picture.
  const [regionalStatisticsLoading, setRegionalStatisticsLoading] = useState<boolean>(true);
  // Key used to force BarChart to re-render to ensure animation is executed when resuming from loading
  const [regionalStatisticsChartKey, setRegionalStatisticsChartKey] = useState<number>(0);
  // Used to mark whether the chart should be rendered (rendered only after the container size is stable to avoid positioning errors)
  const [regionalStatisticsChartReady, setRegionalStatisticsChartReady] = useState<boolean>(true);
  // Used to track the last request parameters to avoid calling the same API repeatedly
  const regionalStatisticsLastParamsRef = useRef<string>('');
  // loading flag to prevent concurrent requests
  const regionalStatisticsLoadingRef = useRef<boolean>(false);
  // Used to save the last valid chart data and display old data during loading to avoid flickering.
  const regionalStatisticsLastValidChartDataRef = useRef<
    { category: string; value: number; eventData?: { [eventName: string]: number } }[]
  >([]);

  // Affiliate Channel Chart state (control behaves consistent with Regional Statistics Chart)
  const [affiliateChannelTripleMode, setAffiliateChannelTripleMode] = useState<TripleSwitchValue>('ALL');
  const [affiliateChannelBadge, setAffiliateChannelBadge] = useState<'UA' | 'RT'>('UA');
  const [affiliateChannelDataType, setAffiliateChannelDataType] = useState<'Install' | 'Event'>('Event');
  const [affiliateChannelData, setAffiliateChannelData] = useState<AffiliateChannelData[]>([]);
  const [affiliateChannelHighlightedSeriesId, setAffiliateChannelHighlightedSeriesId] = useState<string | null>(null);
  const [affiliateChannelLoading, setAffiliateChannelLoading] = useState<boolean>(true);
  const [affiliateChannelChartReady, setAffiliateChannelChartReady] = useState<boolean>(true);
  const affiliateChannelLastParamsRef = useRef<string>('');
  const affiliateChannelLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const affiliateChannelRequestIdRef = useRef(0);
  
  // Save previous Campaign options and selection status to determine whether to select all
  const prevOfferOptionsRef = useRef<Array<{ id: string; name: string }>>([]);
  const prevSelectedOffersRef = useRef<string[]>([]);
  
  // Statistics loading anti-shake
  const statisticsLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const statisticsLoadingRef = useRef<boolean>(false);
  const statisticsRequestIdRef = useRef(0);
  /** Statistics request parameters that were successfully pulled last time, used to avoid filter cascading causing repeated requests and double loading with the same conditions*/
  const lastSuccessfulStatisticsKeyRef = useRef<string>('');

  const installConversionRequestIdRef = useRef(0);
  const eventConversionRequestIdRef = useRef(0);
  const lastInstallConversionParamsRef = useRef<string>('');
  /** Consistent with Install: write after successful pull to avoid repeated requests for the same parameters and multiple loading flashes*/
  const lastEventConversionParamsRef = useRef<string>('');
  const eventConversionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const distributionLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const distributionRequestIdRef = useRef(0);
  const lastDistributionProportionParamsRef = useRef<string>('');
  const distributionProportionCacheRef = useRef<Map<string, DistributionProportionData[]>>(new Map());
  const accountConfigsForChartsRef = useRef<typeof accountConfigs>([]);
  const appConfigsForChartsRef = useRef<AppConfig[]>([]);

  const eventNameStatisticsRequestIdRef = useRef(0);
  const regionalStatisticsRequestIdRef = useRef(0);
  const campaignIdsLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const campaignIdsRequestIdRef = useRef(0);

  useEffect(() => {
    accountConfigsForChartsRef.current = accountConfigs;
  }, [accountConfigs]);

  useEffect(() => {
    appConfigsForChartsRef.current = appConfigs;
  }, [appConfigs]);
  
  // Track whether an attempt has been made to load Install and Event Conversion data (used to display loading on first load)
  const installConversionHasLoadedRef = useRef<boolean>(false);
  const eventConversionHasLoadedRef = useRef<boolean>(false);

  // Unified Campaign semantics: None selected/all selected are treated as "ALL (campaignIds filtering is not delivered)".
  // This can avoid using [] to request once when filtering linkage, and then using "select all array" to request again, resulting in secondary loading.
  const getEffectiveCampaignIds = useCallback((campaignIds: string[]) => {
    if (campaignIds.length === 0 || offerOptions.length === 0) {
      return undefined as string[] | undefined;
    }
    const optionIds = new Set(offerOptions.map(o => o.id));
    const validSelected = campaignIds.filter(id => optionIds.has(id));
    if (validSelected.length === 0 || validSelected.length === optionIds.size) {
      return undefined;
    }
    return [...validSelected].sort();
  }, [offerOptions]);

  // Time range calculation function
  const getMonday = (d: dayjs.Dayjs) => d.day() === 0 ? d.subtract(6, 'day') : d.day(1);
  const getSunday = (d: dayjs.Dayjs) => d.day() === 0 ? d : d.day(7);
  const min = (a: dayjs.Dayjs, b: dayjs.Dayjs) => (a.isBefore(b) ? a : b);

  // Handling quick selection - adapted to dayjs
  const handleQuickSelect = (optionValue: string) => {
    try {
      let startDate: dayjs.Dayjs, endDate: dayjs.Dayjs;
      
      switch (optionValue) {
        case 'today':
          startDate = dayjs();
          endDate = dayjs();
          break;
        case 'yesterday':
          startDate = dayjs().subtract(1, 'day');
          endDate = dayjs().subtract(1, 'day');
          break;
        case 'last7days':
          startDate = dayjs().subtract(7, 'day');
          endDate = dayjs().subtract(1, 'day');
          break;
        case 'lastWeek':
          // Get the Monday of the current week, then subtract the week to get the Monday of the previous week
          const currentMonday = getMonday(dayjs());
          startDate = currentMonday.subtract(1, 'week');
          endDate = startDate.add(6, 'day'); // Add 6 days from Monday to get Sunday
          break;
        case 'last30days':
          startDate = dayjs().subtract(30, 'day');
          endDate = dayjs().subtract(1, 'day');
          break;
        case 'thisMonth':
          startDate = dayjs().startOf('month');
          endDate = dayjs().subtract(1, 'day');
          break;
        case 'lastMonth':
          startDate = dayjs().subtract(1, 'month').startOf('month');
          endDate = min(dayjs().subtract(1, 'month').endOf('month'), dayjs().subtract(1, 'day'));
          break;
        default:
          return;
      }
      
      setTempDateRange([startDate, endDate]);
    } catch (error) {
      // Error handled silently
    }
  };

  // Processing month navigation - adapting to dayjs
  const handleMonthChange = (direction: 'prev' | 'next') => {
    try {
      setCurrentMonth(prev => {
        const newMonth = direction === 'prev' 
          ? prev.subtract(1, 'month').startOf('month')
          : prev.add(1, 'month').startOf('month');
        return newMonth;
      });
    } catch (error) {
      // Error handled silently
    }
  };

  // Filter App List
  const filteredAppConfigs = appConfigs.filter(app => 
    app.appName.toLowerCase().includes(appSearchText.toLowerCase()) ||
    app.appId.toLowerCase().includes(appSearchText.toLowerCase())
  );

  // Filter the Account list
  const filteredAccountConfigs = accountConfigs.filter(account => 
    account.accountName.toLowerCase().includes(accountSearchText.toLowerCase()) ||
    account.accountType.toLowerCase().includes(accountSearchText.toLowerCase())
  );

  // Filter the offer list (the backend has already removed duplicates, and the frontend only performs search and filtering)
  // Consistent with how Apps and Accounts are handled
  const filteredOfferOptions = useMemo(() => {
    return offerOptions.filter(offer => 
      offer.name.toLowerCase().includes(offerSearchText.toLowerCase()) ||
      offer.id.toLowerCase().includes(offerSearchText.toLowerCase())
    );
  }, [offerOptions, offerSearchText]);

  // Calculate the number of valid selected apps (only the appIds that actually exist in the current appConfigs are calculated)
  const validSelectedAppsCount = useMemo(() => {
    return selectedApps.filter(appId => appConfigs.some(app => app.appId === appId)).length;
  }, [selectedApps, appConfigs]);

  // Calculate the number of valid selected apps after filtering (only the appIds that actually exist in the current filteredAppConfigs are calculated)
  const validFilteredSelectedAppsCount = useMemo(() => {
    return selectedApps.filter(appId => filteredAppConfigs.some(app => app.appId === appId)).length;
  }, [selectedApps, filteredAppConfigs]);

  // Calculate the number of valid selected Accounts (only accountNames that actually exist in the current accountConfigs are calculated)
  const validSelectedAccountsCount = useMemo(() => {
    return selectedAccounts.filter(accountName => accountConfigs.some(account => account.accountName === accountName)).length;
  }, [selectedAccounts, accountConfigs]);

  // Calculate the number of valid selected Accounts after filtering (only accountNames that actually exist in the current filteredAccountConfigs are calculated)
  const validFilteredSelectedAccountsCount = useMemo(() => {
    return selectedAccounts.filter(accountName => filteredAccountConfigs.some(account => account.accountName === accountName)).length;
  }, [selectedAccounts, filteredAccountConfigs]);

  // Calculate the number of valid selected offers
  const validSelectedOffersCount = useMemo(() => {
    return selectedOffers.filter(offerId => offerOptions.some(offer => offer.id === offerId)).length;
  }, [selectedOffers, offerOptions]);

  // Calculate the number of effective selected offers after filtering
  const validFilteredSelectedOffersCount = useMemo(() => {
    return selectedOffers.filter(offerId => filteredOfferOptions.some(offer => offer.id === offerId)).length;
  }, [selectedOffers, filteredOfferOptions]);

  // Get the display text of the App selector
  const getAppSelectorText = () => {
    if (appConfigs.length === 0) {
      return 'No Data';
    }
    
    if (validSelectedAppsCount === 0) {
      return 'APP';
    }
    
    if (validSelectedAppsCount === 1) {
      // Select only one App and display the App Name
      const selectedApp = appConfigs.find(app => app.appId === selectedApps[0]);
      if (selectedApp) {
        // If the App Name is too long, it will be truncated and displayed
        const appName = selectedApp.appName;
        return appName.length > 15 ? appName.substring(0, 15) + '...' : appName;
      }
      return 'APP';
    }
    
    // Select multiple Apps and display "+X APPS", where X is the total number of valid selections - 1 (because the Icon represents 1 App)
    return `+${validSelectedAppsCount - 1} APPS`;
  };

  // Get the display text of the Offer selector
  const getOfferSelectorText = () => {
    // If loading or no data yet, show "Campaigns"
    if (offerOptions.length === 0) {
      return 'Campaigns';
    }
    
    if (validSelectedOffersCount === 0) {
      return 'Campaigns';
    }
    
    if (validSelectedOffersCount === 1) {
      // Select only one Offer and display the Offer Name
      const selectedOffer = offerOptions.find(offer => offer.id === selectedOffers[0]);
      if (selectedOffer) {
        // If the Offer Name is too long, it will be truncated and displayed
        const offerName = selectedOffer.name;
        return offerName.length > 15 ? offerName.substring(0, 15) + '...' : offerName;
      }
      return 'Campaigns';
    }
    
    // Select multiple offers and display "+X Campaigns"
    return `+${validSelectedOffersCount - 1} Campaigns`;
  };

  // Automatically set dateRange based on timeRange
  useEffect(() => {
    // If it is a custom mode, the date range is not automatically set
    if (isCustomRange) {
      return;
    }
    
    const today = dayjs().endOf('day');
    const yesterday = today.subtract(1, 'day');
    
    let startDate: Dayjs;
    let endDate: Dayjs;
    
    switch (timeRange) {
      case 'yesterday':
        startDate = yesterday;
        endDate = yesterday;
        break;
      case 'thisWeek':
        startDate = getMonday(dayjs());
        endDate = min(getSunday(dayjs()), yesterday);
        break;
      case 'lastWeek':
        // Get the Monday of the current week, then subtract the week to get the Monday of the previous week
        const currentMonday = getMonday(dayjs());
        startDate = currentMonday.subtract(1, 'week');
        endDate = startDate.add(6, 'day'); // Add 6 days from Monday to get Sunday
        break;
      case 'thisMonth':
        startDate = dayjs().startOf('month');
        endDate = min(dayjs().endOf('month'), yesterday);
        break;
      case 'lastMonth':
        startDate = dayjs().subtract(1, 'month').startOf('month');
        endDate = min(dayjs().subtract(1, 'month').endOf('month'), yesterday);
        break;
      default:
        startDate = yesterday;
        endDate = yesterday;
    }
    
    setDateRange([startDate, endDate]);
  }, [timeRange, isCustomRange]);

  // Used to track ongoing requests (only for UI/diagnosis; no longer use "return while loading" to block new requests to avoid missing loads)
  const loadingAccountConfigsRef = useRef<boolean>(false);
  const loadingAppConfigsRef = useRef<boolean>(false);
  // Request algebra: only apply the response of the "latest" request to avoid staggered returns and write the list into an intermediate subset
  const accountConfigsLoadGenRef = useRef(0);
  const appConfigsLoadGenRef = useRef(0);
  // The date key when the list was last successfully written; if it is different from the date key of this request, it will be merged according to the "new date" (the old cycle option will not be retained)
  const lastAccountSuccessfulDateKeyRef = useRef<string | null>(null);
  const lastAppSuccessfulDateKeyRef = useRef<string | null>(null);
  /** Submitted date range key; when changed, it means Date / timeRange switching, the same set of cycle semantics as Account and App filters*/
  const dashboardCommittedDateKeyRef = useRef<string | null>(null);
  /** After the date is changed, you need to first pull all Account/App candidates "by date only", and then pull the cross-filtered results to avoid the denominator being squashed by the appIds/accountNames subset.*/
  const accountsPendingUnscopedBaselineRef = useRef<string | null>(null);
  const appsPendingUnscopedBaselineRef = useRef<string | null>(null);

  // Load Account configuration directly from Dashboard database table (does not rely on AutoPipe task)
  // Support date range filtering
  const loadAccountConfigs = useCallback(async (dateRange?: [Dayjs, Dayjs] | null) => {
    const dateRangeKey =
      dateRange && dateRange[0] && dateRange[1]
        ? `${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}`
        : '';
    const gen = ++accountConfigsLoadGenRef.current;

    type AccRow = {
      id: string;
      accountName: string;
      accountType: string;
      icon?: string;
    };

    const fetchAccountRows = async (omitAppIds: boolean): Promise<AccRow[] | null> => {
      let url = '/api/dashboard/accounts';
      const params = new URLSearchParams();
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.append('fromDate', dateRange[0].format('YYYY-MM-DD'));
        params.append('toDate', dateRange[1].format('YYYY-MM-DD'));
      }
      if (!omitAppIds) {
        const currentSelectedApps = selectedAppsRef.current;
        if (currentSelectedApps.length > 0) {
          currentSelectedApps.forEach(appId => {
            params.append('appIds', appId);
          });
        }
      }
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      const response = await autopipeAxiosInstance.get(url);
      if (gen !== accountConfigsLoadGenRef.current) {
        return null;
      }
      const result = response.data as { success: boolean; data?: any[] };
      if (!result.success || !Array.isArray(result.data)) {
        return null;
      }
      return result.data
        .map((account: any, index: number) => ({
          id: account.account_name || `account-${index}`,
          accountName: account.account_name,
          accountType: account.account_type || '',
          icon: account.icon || undefined
        }))
        .sort((a, b) => a.accountName.localeCompare(b.accountName));
    };

    const applyAccountsUnion = (accounts: AccRow[]) => {
      // When the interface explicitly returns an empty candidate, the local account and selection must be cleared.
      // Otherwise, the old configuration will be retained and the "accountConfigs.length > 0 but selectedAccounts is empty" branch will be triggered.
      // This causes subsequent chart requests to continue early-return, and the page remains at loading.
      if (accounts.length === 0) {
        setAccountConfigs([]);
        setSelectedAccounts([]);
        return;
      }
      setAccountConfigs(prevAccountConfigs => {
        const byName = new Map<string, AccRow>();
        for (const a of accounts) {
          byName.set(a.accountName, a);
        }
        for (const p of prevAccountConfigs) {
          if (!byName.has(p.accountName)) {
            byName.set(p.accountName, p);
          }
        }
        return [...byName.values()].sort((a, b) => a.accountName.localeCompare(b.accountName));
      });
      setSelectedAccounts(prevSelected =>
        prevSelected.filter(accountName => accounts.some(acc => acc.accountName === accountName))
      );
    };

    try {
      loadingAccountConfigsRef.current = true;

      const runBaseline = !!dateRangeKey && accountsPendingUnscopedBaselineRef.current === dateRangeKey;
      if (runBaseline) {
        accountsPendingUnscopedBaselineRef.current = null;
      }

      if (runBaseline) {
        const wide = await fetchAccountRows(true);
        if (gen !== accountConfigsLoadGenRef.current) {
          return;
        }
        if (wide !== null) {
          applyAccountsUnion(wide);
        }
        const narrow = await fetchAccountRows(false);
        if (gen !== accountConfigsLoadGenRef.current) {
          return;
        }
        if (narrow !== null) {
          applyAccountsUnion(narrow);
        }
        lastAccountSuccessfulDateKeyRef.current = dateRangeKey;
      } else {
        const narrow = await fetchAccountRows(false);
        if (gen !== accountConfigsLoadGenRef.current) {
          return;
        }
        if (narrow !== null) {
          applyAccountsUnion(narrow);
          lastAccountSuccessfulDateKeyRef.current = dateRangeKey;
        }
      }
    } catch {
      // Keep the current list to avoid interruptions
    } finally {
      if (gen === accountConfigsLoadGenRef.current) {
        loadingAccountConfigsRef.current = false;
        setAccountConfigsReady(true);
      }
    }
  }, []); // Remove selectedApps dependency and use ref to read the latest value

  // When accountConfigs is loaded, automatically select the first account (only executed once during initialization)
  const hasAutoSelectedAccountRef = useRef<boolean>(false);
  useEffect(() => {
    if (accountConfigs.length > 0 && selectedAccounts.length === 0 && !hasAutoSelectedAccountRef.current) {
      const firstConfig = accountConfigs[0];
      setSelectedAccounts([firstConfig.accountName]);
      hasAutoSelectedAccountRef.current = true;
    }
  }, [accountConfigs, selectedAccounts.length]);

  // Load App configuration directly from Dashboard database table (does not rely on AutoPipe task)
  // Supports date range, account and campaign filtering
  const loadAppConfigs = useCallback(async (dateRange?: [Dayjs, Dayjs] | null) => {
    const dateRangeKey =
      dateRange && dateRange[0] && dateRange[1]
        ? `${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}`
        : '';
    const gen = ++appConfigsLoadGenRef.current;

    const fetchAppRows = async (omitAccountNames: boolean): Promise<AppConfig[] | null> => {
      let url = '/api/dashboard/apps';
      const params = new URLSearchParams();
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.append('fromDate', dateRange[0].format('YYYY-MM-DD'));
        params.append('toDate', dateRange[1].format('YYYY-MM-DD'));
      }
      if (!omitAccountNames) {
        const currentSelectedAccounts = selectedAccountsRef.current;
        if (currentSelectedAccounts.length > 0) {
          currentSelectedAccounts.forEach(accountName => {
            params.append('accountNames', accountName);
          });
        }
      }
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      const response = await autopipeAxiosInstance.get(url);
      if (gen !== appConfigsLoadGenRef.current) {
        return null;
      }
      const result = response.data as { success: boolean; data?: any[] };
      if (!result.success || !Array.isArray(result.data)) {
        return null;
      }
      return result.data
        .map((app: any) => ({
          id: app.app_id,
          appName: app.app_name || app.app_id,
          appId: app.app_id,
          icon: app.icon_url || undefined
        }))
        .sort((a, b) => a.appName.localeCompare(b.appName));
    };

    const applyAppsUnion = (rows: AppConfig[]) => {
      // Consistent with the account logic: empty candidates should be cleared to avoid retaining the old app and causing chart loading to fail to converge.
      if (rows.length === 0) {
        setAppConfigs([]);
        setSelectedApps([]);
        return;
      }
      setAppConfigs(prevAppConfigs => {
        const byId = new Map<string, AppConfig>();
        for (const a of rows) {
          byId.set(a.appId, a);
        }
        for (const p of prevAppConfigs) {
          if (!byId.has(p.appId)) {
            byId.set(p.appId, p);
          }
        }
        return [...byId.values()].sort((a, b) => a.appName.localeCompare(b.appName));
      });
      setSelectedApps(prevSelected =>
        prevSelected.filter(appId => rows.some(app => app.appId === appId))
      );
    };

    try {
      loadingAppConfigsRef.current = true;

      const runBaseline = !!dateRangeKey && appsPendingUnscopedBaselineRef.current === dateRangeKey;
      if (runBaseline) {
        appsPendingUnscopedBaselineRef.current = null;
      }

      if (runBaseline) {
        const wide = await fetchAppRows(true);
        if (gen !== appConfigsLoadGenRef.current) {
          return;
        }
        if (wide !== null) {
          applyAppsUnion(wide);
        }
        const narrow = await fetchAppRows(false);
        if (gen !== appConfigsLoadGenRef.current) {
          return;
        }
        if (narrow !== null) {
          applyAppsUnion(narrow);
        }
        lastAppSuccessfulDateKeyRef.current = dateRangeKey;
      } else {
        const narrow = await fetchAppRows(false);
        if (gen !== appConfigsLoadGenRef.current) {
          return;
        }
        if (narrow !== null) {
          applyAppsUnion(narrow);
          lastAppSuccessfulDateKeyRef.current = dateRangeKey;
        }
      }
    } catch {
      // keep current list
    } finally {
      if (gen === appConfigsLoadGenRef.current) {
        loadingAppConfigsRef.current = false;
        setAppConfigsReady(true);
      }
    }
  }, []); // Remove selectedAccounts dependency and use ref to read the latest value

  // Load campaign ID list
  const loadCampaignIds = useCallback(async () => {
    const gen = ++campaignIdsRequestIdRef.current;
    // If no account or app is selected, or the date range is not set, clear the list
    if ((selectedAccounts.length === 0 && selectedApps.length === 0) || !dateRange || !dateRange[0] || !dateRange[1]) {
      if (gen === campaignIdsRequestIdRef.current) {
        setOfferOptions([]);
        setSelectedOffers([]);
      }
      return;
    }

    try {
      const campaignIds = await getDashboardCampaignIds({
        accountNames: selectedAccounts,
        appIds: selectedApps,
        fromDate: dateRange[0].format('YYYY-MM-DD'),
        toDate: dateRange[1].format('YYYY-MM-DD')
      });
      if (gen !== campaignIdsRequestIdRef.current) {
        return;
      }
      
      // Convert to options format, sort by name
      // Only remove duplicates according to campaign_id and keep the first encountered item.
      // Use a Map to ensure each campaign_id appears only once while retaining the first encountered name
      // Use normalized ID as key, ensuring that case and spaces are handled correctly
      const normalizeID = (id: string): string => {
        return String(id || '').trim().toLowerCase();
      };
      
      const campaignMap = new Map<string, { id: string; name: string }>();
      const seenNormalizedIDs = new Set<string>();
      
      campaignIds.forEach((campaign: { id: string; name: string }) => {
        const originalID = String(campaign.id || '').trim();
        // Filter out invalid ids
        if (!originalID || originalID.length === 0) {
          return;
        }
        
        const normalizedID = normalizeID(originalID);
        // If the normalized id does not exist yet, add it (only the first encountered item is kept)
        if (!seenNormalizedIDs.has(normalizedID)) {
          const name = String(campaign.name || campaign.id || '').trim() || originalID;
          campaignMap.set(originalID, { id: originalID, name });
          seenNormalizedIDs.add(normalizedID);
        }
      });
      
      // Convert to array and sort
      const options = Array.from(campaignMap.values())
        .sort((a: { id: string; name: string }, b: { id: string; name: string }) => {
          // Sort by name first, then sort by id if the names are the same
          const nameCompare = a.name.localeCompare(b.name);
          return nameCompare !== 0 ? nameCompare : a.id.localeCompare(b.id);
        });
      
      // Check whether the previous state was all selected (the previous state saved using ref)
      const prevOfferOptions = prevOfferOptionsRef.current;
      const prevSelectedOffers = prevSelectedOffersRef.current;
      const wasSelectAll = prevOfferOptions.length > 0 && 
        prevSelectedOffers.length === prevOfferOptions.length &&
        prevOfferOptions.every(offer => prevSelectedOffers.includes(offer.id));
      
      // Update Campaign options list
      setOfferOptions(options);
      
      // Update selection based on previous status
      let newSelectedOffers: string[];
      if (wasSelectAll && options.length > 0) {
        // If all was selected before, select all in the new data list
        newSelectedOffers = options.map(offer => offer.id);
      } else {
        // If it was previously a partial selection, keep the selected options (but only those in the new list)
        newSelectedOffers = prevSelectedOffers.filter(offerId => 
          options.some((opt: { id: string; name: string }) => opt.id === offerId)
        );
      }
      
      // Update status and ref
      setSelectedOffers(newSelectedOffers);
      prevOfferOptionsRef.current = options;
      prevSelectedOffersRef.current = newSelectedOffers;
    } catch {
      if (gen !== campaignIdsRequestIdRef.current) {
        return;
      }
      // Keep the current Campaign list to avoid clearing and flashing the entire section during filter linkage
    }
  }, [selectedAccounts, selectedApps, dateRange]);

  // Synchronously update the ref of Campaign selection status (when the user manually selects)
  useEffect(() => {
    prevSelectedOffersRef.current = selectedOffers;
  }, [selectedOffers]);
  
  // Synchronously update the ref of the Campaign option list (when the option list changes)
  useEffect(() => {
    prevOfferOptionsRef.current = offerOptions;
  }, [offerOptions]);

  // Reload Campaign ID list when date range, account or app changes (anti-shake, consistent with chart)
  useEffect(() => {
    if (campaignIdsLoadTimeoutRef.current) {
      clearTimeout(campaignIdsLoadTimeoutRef.current);
      campaignIdsLoadTimeoutRef.current = null;
    }
    campaignIdsLoadTimeoutRef.current = setTimeout(() => {
      loadCampaignIds();
    }, 200);
    return () => {
      if (campaignIdsLoadTimeoutRef.current) {
        clearTimeout(campaignIdsLoadTimeoutRef.current);
        campaignIdsLoadTimeoutRef.current = null;
      }
    };
  }, [loadCampaignIds]);

  // Used to track the parameters of the last call to avoid repeated calls
  const lastLoadAppConfigsParamsRef = useRef<string>('');
  const lastLoadAccountConfigsParamsRef = useRef<string>('');

  // Linked with the Date component and timeRange: invalidate Account/App requests in transit when the range changes, and force the filter list to be re-pulled
  useEffect(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return;
    const k = `${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}`;
    if (dashboardCommittedDateKeyRef.current === k) return;
    dashboardCommittedDateKeyRef.current = k;
    accountsPendingUnscopedBaselineRef.current = k;
    appsPendingUnscopedBaselineRef.current = k;
    accountConfigsLoadGenRef.current += 1;
    appConfigsLoadGenRef.current += 1;
    lastAccountSuccessfulDateKeyRef.current = null;
    lastAppSuccessfulDateKeyRef.current = null;
    lastLoadAppConfigsParamsRef.current = '';
    lastLoadAccountConfigsParamsRef.current = '';
    campaignIdsRequestIdRef.current += 1;
    statisticsRequestIdRef.current += 1;
    lastSuccessfulStatisticsKeyRef.current = '';
    lastInstallConversionParamsRef.current = '';
    lastEventConversionParamsRef.current = '';
    lastDistributionProportionParamsRef.current = '';
    lastEventNameStatisticsParamsRef.current = '';
    regionalStatisticsLastParamsRef.current = '';
    setStatisticsLoading(true);
    setInstallConversionLoading(true);
    setEventConversionLoading(true);
    setDistributionProportionLoading(true);
    setDistributionProportionChartReady(false);
    setEventNameStatisticsLoading(true);
    setEventNameStatisticsDataKey('');
    setEventNameStatisticsChartReady(false);
    setRegionalStatisticsLoading(true);
    setRegionalStatisticsChartReady(false);
    setAccountConfigsReady(false);
    setAppConfigsReady(false);
    installConversionRequestIdRef.current += 1;
    eventConversionRequestIdRef.current += 1;
    distributionRequestIdRef.current += 1;
    eventNameStatisticsRequestIdRef.current += 1;
    regionalStatisticsRequestIdRef.current += 1;
  }, [dateRange]);

  // Use ref to store functions and avoid including functions in useEffect dependencies
  const loadAppConfigsRef = useRef(loadAppConfigs);
  const loadAccountConfigsRef = useRef(loadAccountConfigs);
  
  // Synchronize refs and functions
  useEffect(() => {
    loadAppConfigsRef.current = loadAppConfigs;
  }, [loadAppConfigs]);
  
  useEffect(() => {
    loadAccountConfigsRef.current = loadAccountConfigs;
  }, [loadAccountConfigs]);
  
  // Reload App list when date range and account change
  // Campaign changes will not trigger App list reloading (the campaign component can only be affected one-way by the account and app components)
  useEffect(() => {
    // Load only if dateRange exists
    if (!dateRange) return;
    
    // Build parameter key, used to detect whether reloading is really needed
    const currentSelectedAccounts = selectedAccountsRef.current;
    const dateRangeKey = `${dateRange[0]?.format('YYYY-MM-DD')}_${dateRange[1]?.format('YYYY-MM-DD')}`;
    const paramsKey = `${dateRangeKey}_${currentSelectedAccounts.join(',')}`;
    
    // If the parameters have not changed, skip (avoid repeated calls)
    if (paramsKey === lastLoadAppConfigsParamsRef.current) {
      return;
    }
    
    // Update parameter ref
    lastLoadAppConfigsParamsRef.current = paramsKey;
    
    loadAppConfigsRef.current(dateRange);
  }, [dateRange, selectedAccounts]); // Remove the loadAppConfigs dependency and use ref to call it

  // Reload account list when date range, app changes
  // Campaign changes will not trigger a reload of the Account list (the campaign component can only be unidirectionally affected by the account and app components)
  useEffect(() => {
    // Load only if dateRange exists
    if (!dateRange) return;
    
    // Build parameter key, used to detect whether reloading is really needed
    const currentSelectedApps = selectedAppsRef.current;
    const dateRangeKey = `${dateRange[0]?.format('YYYY-MM-DD')}_${dateRange[1]?.format('YYYY-MM-DD')}`;
    const paramsKey = `${dateRangeKey}_${currentSelectedApps.join(',')}`;
    
    // If the parameters have not changed, skip (avoid repeated calls)
    if (paramsKey === lastLoadAccountConfigsParamsRef.current) {
      return;
    }
    
    // Update parameter ref
    lastLoadAccountConfigsParamsRef.current = paramsKey;
    
    loadAccountConfigsRef.current(dateRange);
    
    // Tag is initialized
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
    }
  }, [dateRange, selectedApps]); // Remove the loadAccountConfigs dependency and use ref to call it; Team switching depends on global refresh, which is filtered by the backend according to X-Selected-Team-Id

  // Animation effects - use CSS class control to avoid flickering caused by inline styles
  useEffect(() => {
    const element = document.querySelector('[data-offer-selector-dropdown]') as HTMLElement;
    if (element) {
      if (offerSelectorVisible) {
        // Use requestAnimationFrame to ensure the DOM is rendered
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.classList.remove('opacity-0', '-translate-y-2.5', 'scale-95');
            element.classList.add('opacity-100', 'translate-y-0', 'scale-100');
          });
        });
      }
    }
  }, [offerSelectorVisible]);

  useEffect(() => {
    const element = document.querySelector('[data-app-selector-dropdown]') as HTMLElement;
    if (element) {
      if (appSelectorVisible) {
        // Use requestAnimationFrame to ensure the DOM is rendered
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.classList.remove('opacity-0', '-translate-y-2.5', 'scale-95');
            element.classList.add('opacity-100', 'translate-y-0', 'scale-100');
          });
        });
      }
    }
  }, [appSelectorVisible]);

  useEffect(() => {
    const element = document.querySelector('[data-account-selector-dropdown]') as HTMLElement;
    if (element) {
      if (accountSelectorVisible) {
        // Use requestAnimationFrame to ensure the DOM is rendered
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.classList.remove('opacity-0', '-translate-y-2.5', 'scale-95');
            element.classList.add('opacity-100', 'translate-y-0', 'scale-100');
          });
        });
      }
    }
  }, [accountSelectorVisible]);

  useEffect(() => {
    const element = document.querySelector('[data-date-selector-dropdown]') as HTMLElement;
    if (element) {
      if (dateSelectorVisible) {
        // Use requestAnimationFrame to ensure the DOM is rendered
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            element.classList.remove('opacity-0', '-translate-y-2.5', 'scale-95');
            element.classList.add('opacity-100', 'translate-y-0', 'scale-100');
          });
        });
      }
    }
  }, [dateSelectorVisible]);

  // When there is insufficient space at the top, switch the date filter to an icon button, giving priority to ensuring that the title/subtitle on the left is readable
  // Note: You cannot just look at the overflow of the filter itself, because the right filter itself has a fixed width, and what is actually compressed is the left title area.
  useEffect(() => {
    const headerEl = topHeaderRowRef.current;
    const filtersEl = topFiltersRef.current;
    if (!headerEl || !filtersEl) return;

    const FILTERS_FULL_WIDTH = 200 + 200 + 200 + 240 + 24; // Three 200 + date 240 + gap(3*8)
    const TITLE_MIN_SAFE_WIDTH = 280;
    const COMPACT_ON_THRESHOLD = FILTERS_FULL_WIDTH + TITLE_MIN_SAFE_WIDTH;
    const COMPACT_OFF_THRESHOLD = COMPACT_ON_THRESHOLD + 28; // hysteresis to avoid critical jitter

    const checkCompact = () => {
      const rowWidth = headerEl.clientWidth;
      setIsDashboardDateCompact(prev =>
        prev ? rowWidth < COMPACT_OFF_THRESHOLD : rowWidth < COMPACT_ON_THRESHOLD
      );
    };
    checkCompact();
    const ro = new ResizeObserver(() => checkCompact());
    ro.observe(headerEl);
    ro.observe(filtersEl);
    window.addEventListener('resize', checkCompact);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', checkCompact);
    };
  }, []);

  // Click outside to close all selectors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-offer-selector]')) {
        setOfferSelectorVisible(false);
        setOfferSearchText(''); // Clear search text
      }
      if (!target.closest('[data-app-selector]')) {
        setAppSelectorVisible(false);
        setAppSearchText(''); // Clear search text
      }
      if (!target.closest('[data-account-selector]')) {
        setAccountSelectorVisible(false);
        setAccountSearchText(''); // Clear search text
      }

      if (!target.closest('[data-date-selector]')) {
        setDateSelectorVisible(false);
        setTempDateRange(null);
      }
    };

    if (offerSelectorVisible || appSelectorVisible || accountSelectorVisible || dateSelectorVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [offerSelectorVisible, appSelectorVisible, accountSelectorVisible, dateSelectorVisible]);

  // All apps are selected by default
  useEffect(() => {
    if (selectedApps.length === 0 && appConfigs.length > 0) {
      setSelectedApps(appConfigs.map(app => app.appId));
    }
  }, [selectedApps, appConfigs]);

  // All accounts are selected by default
  useEffect(() => {
    if (selectedAccounts.length === 0 && accountConfigs.length > 0) {
      setSelectedAccounts(accountConfigs.map(config => config.accountName));
    }
  }, [selectedAccounts, accountConfigs]);

  // Select all campaigns by default (when data loading is complete and no selections are made)
  useEffect(() => {
    if (selectedOffers.length === 0 && offerOptions.length > 0) {
      setSelectedOffers(offerOptions.map(offer => offer.id));
    }
  }, [selectedOffers, offerOptions]);

  // Load statistics (use anti-shake mechanism to avoid frequent triggering when clicking quickly)
  useEffect(() => {
    // Clear previous timer
    if (statisticsLoadTimeoutRef.current) {
      clearTimeout(statisticsLoadTimeoutRef.current);
      statisticsLoadTimeoutRef.current = null;
    }
    
    const loadStatistics = async () => {
      if (!dateRange?.[0] || !dateRange?.[1]) {
        const reqId = ++statisticsRequestIdRef.current;
        if (reqId === statisticsRequestIdRef.current) {
          lastSuccessfulStatisticsKeyRef.current = '';
          setStatistics({
            installs: 0,
            events: 0,
            retarget_installs: 0,
            retarget_events: 0
          });
          setDailyData({
            installs: [],
            events: [],
            retarget_installs: [],
            retarget_events: []
          });
          statisticsLoadingRef.current = false;
          setStatisticsLoading(false);
        }
        return;
      }

      if (!accountConfigsReady || !appConfigsReady) {
        setStatisticsLoading(true);
        return;
      }
      // ref changes will not trigger effect re-running, which may cause statisticsLoading to permanently stop at true.
      if (selectedAccounts.length === 0 && accountConfigs.length > 0) {
        return;
      }
      if (selectedApps.length === 0 && appConfigs.length > 0) {
        return;
      }

      if (selectedAccounts.length === 0 || selectedApps.length === 0) {
        const reqId = ++statisticsRequestIdRef.current;
        if (reqId === statisticsRequestIdRef.current) {
          lastSuccessfulStatisticsKeyRef.current = '';
          setStatistics({
            installs: 0,
            events: 0,
            retarget_installs: 0,
            retarget_events: 0
          });
          setDailyData({
            installs: [],
            events: [],
            retarget_installs: [],
            retarget_events: []
          });
          statisticsLoadingRef.current = false;
          setStatisticsLoading(false);
        }
        return;
      }

      const effectiveCampaignIds = getEffectiveCampaignIds(selectedOffers);
      const statsParamKey = JSON.stringify({
        accounts: [...selectedAccounts].sort(),
        apps: [...selectedApps].sort(),
        campaigns: effectiveCampaignIds ?? 'ALL',
        from: dateRange[0].format('YYYY-MM-DD'),
        to: dateRange[1].format('YYYY-MM-DD')
      });
      if (statsParamKey === lastSuccessfulStatisticsKeyRef.current) {
        setStatisticsLoading(false);
        return;
      }

      const reqId = ++statisticsRequestIdRef.current;
      statisticsLoadingRef.current = true;
      setStatisticsLoading(true);

      try {
        const [stats, dailyStats] = await Promise.all([
          getDashboardStatistics({
            accountNames: selectedAccounts,
            appIds: selectedApps,
            campaignIds: effectiveCampaignIds,
            fromDate: dateRange[0].format('YYYY-MM-DD'),
            toDate: dateRange[1].format('YYYY-MM-DD')
          }),
          getDashboardDailyStatistics({
            accountNames: selectedAccounts,
            appIds: selectedApps,
            campaignIds: effectiveCampaignIds,
            fromDate: dateRange[0].format('YYYY-MM-DD'),
            toDate: dateRange[1].format('YYYY-MM-DD')
          })
        ]);
        if (reqId !== statisticsRequestIdRef.current) {
          return;
        }
        lastSuccessfulStatisticsKeyRef.current = statsParamKey;
        setStatistics(stats);
        setDailyData({
          installs: dailyStats.map(d => ({ date: d.date, value: d.installs })),
          events: dailyStats.map(d => ({ date: d.date, value: d.events })),
          retarget_installs: dailyStats.map(d => ({ date: d.date, value: d.retarget_installs })),
          retarget_events: dailyStats.map(d => ({ date: d.date, value: d.retarget_events }))
        });
      } catch {
        if (reqId !== statisticsRequestIdRef.current) {
          return;
        }
        // Keep the current display when the latest request fails to avoid flickering caused by first resetting to zero and then restoring.
      } finally {
        if (reqId === statisticsRequestIdRef.current) {
          statisticsLoadingRef.current = false;
          setStatisticsLoading(false);
        }
      }
    };

    // Use anti-shake to delay execution to avoid frequent triggering when clicking quickly
    statisticsLoadTimeoutRef.current = setTimeout(() => {
      loadStatistics();
    }, 150); // Delay execution by 150ms

    // Cleanup function
    return () => {
      if (statisticsLoadTimeoutRef.current) {
        clearTimeout(statisticsLoadTimeoutRef.current);
      }
    };
  }, [selectedAccounts, selectedApps, selectedOffers, dateRange, accountConfigs, appConfigs, accountConfigsReady, appConfigsReady, getEffectiveCampaignIds]);

  // Used to track Install Conversion data loading to avoid repeated calls
  const loadingInstallConversionRef = useRef<boolean>(false);
  const installConversionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Install Conversion Chart independent data loading (only affected by installConversionViewMode)
  useEffect(() => {
    // Clear previous timeout
    if (installConversionTimeoutRef.current) {
      clearTimeout(installConversionTimeoutRef.current);
    }
    
    const loadInstallConversionData = async () => {
      if (!dateRange?.[0] || !dateRange?.[1]) {
        const rid = ++installConversionRequestIdRef.current;
        if (rid === installConversionRequestIdRef.current) {
          setInstallConversionData([]);
          setInstallConversionHighlightedSeriesId(null);
          lastInstallConversionParamsRef.current = '';
          setInstallConversionLoading(false);
        }
        return;
      }

      if (!accountConfigsReady || !appConfigsReady) {
        setInstallConversionLoading(true);
        return;
      }
      if (selectedAccounts.length === 0 && accountConfigs.length > 0) {
        return;
      }
      if (selectedApps.length === 0 && appConfigs.length > 0) {
        return;
      }

      if (selectedAccounts.length === 0 || selectedApps.length === 0) {
        const rid = ++installConversionRequestIdRef.current;
        if (rid === installConversionRequestIdRef.current) {
          setInstallConversionData([]);
          setInstallConversionHighlightedSeriesId(null);
          lastInstallConversionParamsRef.current = '';
          setInstallConversionLoading(false);
        }
        return;
      }

      const effectiveCampaignIds = getEffectiveCampaignIds(selectedOffers);
      const paramsKey = `${selectedAccounts.join(',')}_${selectedApps.join(',')}_${(effectiveCampaignIds || []).join(',') || 'ALL'}_${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}_${installConversionViewMode}_${installConversionBadge}`;
      if (paramsKey === lastInstallConversionParamsRef.current) {
        setInstallConversionLoading(false);
        return;
      }

      const reqId = ++installConversionRequestIdRef.current;
      installConversionHasLoadedRef.current = true;
      setInstallConversionLoading(true);

      try {
        loadingInstallConversionRef.current = true;

        const installConversion = await getInstallConversionData({
          accountNames: selectedAccounts,
          appIds: selectedApps,
          campaignIds: effectiveCampaignIds,
          fromDate: dateRange[0].format('YYYY-MM-DD'),
          toDate: dateRange[1].format('YYYY-MM-DD')
        }, installConversionViewMode, installConversionBadge);

        if (reqId !== installConversionRequestIdRef.current) {
          return;
        }
        lastInstallConversionParamsRef.current = paramsKey;

        // The upper limit of the number of series is 8: sorted by total installs in descending order, only the first 8 are retained
        const MAX_SERIES_COUNT = 8;
        const sortedAndLimited = installConversion
          .map(group => ({
            ...group,
            totalInstalls: group.data.reduce((sum, d) => sum + (d.installs || 0), 0)
          }))
          .sort((a, b) => b.totalInstalls - a.totalInstalls) // Sort by total installs in descending order
          .slice(0, MAX_SERIES_COUNT) // Only keep the first 8
          .map(({ totalInstalls, ...group }) => group); // Remove temporary calculated totalInstalls field
        
        setInstallConversionData(sortedAndLimited);
        
        // Initialize highlighted series ID: If no series is currently selected, or the selected series is not in the new data, select the first series
        if (sortedAndLimited.length > 0) {
          const firstSeriesId = sortedAndLimited[0].platform 
            ? `${sortedAndLimited[0].groupId}_${sortedAndLimited[0].platform}` 
            : sortedAndLimited[0].groupId;
          
          if (!installConversionHighlightedSeriesId || 
              !sortedAndLimited.some(g => {
                const id = g.platform ? `${g.groupId}_${g.platform}` : g.groupId;
                return id === installConversionHighlightedSeriesId;
              })) {
            setInstallConversionHighlightedSeriesId(firstSeriesId);
          }
        } else {
          setInstallConversionHighlightedSeriesId(null);
        }
      } catch {
        if (reqId !== installConversionRequestIdRef.current) {
          return;
        }
        lastInstallConversionParamsRef.current = '';
      } finally {
        if (reqId === installConversionRequestIdRef.current) {
          loadingInstallConversionRef.current = false;
          setInstallConversionLoading(false);
        }
      }
    };

    // Use anti-shake, delay execution
    installConversionTimeoutRef.current = setTimeout(() => {
      loadInstallConversionData();
    }, 150); // 150ms anti-shake delay, consistent with statistics
    
    // Cleanup function
    return () => {
      if (installConversionTimeoutRef.current) {
        clearTimeout(installConversionTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccounts, selectedApps, selectedOffers, dateRange, installConversionViewMode, installConversionBadge, accountConfigs, appConfigs, accountConfigsReady, appConfigsReady]);

  // Event Conversion Chart independent data loading (only affected by eventConversionViewMode)
  useEffect(() => {
    if (eventConversionTimeoutRef.current) {
      clearTimeout(eventConversionTimeoutRef.current);
      eventConversionTimeoutRef.current = null;
    }

    const loadEventConversionData = async () => {
      if (!dateRange?.[0] || !dateRange?.[1]) {
        const rid = ++eventConversionRequestIdRef.current;
        if (rid === eventConversionRequestIdRef.current) {
          setEventConversionData([]);
          setEventConversionHighlightedSeriesId(null);
          lastEventConversionParamsRef.current = '';
          setEventConversionLoading(false);
        }
        return;
      }

      if (!accountConfigsReady || !appConfigsReady) {
        setEventConversionLoading(true);
        return;
      }
      if (selectedAccounts.length === 0 && accountConfigs.length > 0) {
        return;
      }
      if (selectedApps.length === 0 && appConfigs.length > 0) {
        return;
      }

      if (selectedAccounts.length === 0 || selectedApps.length === 0) {
        const rid = ++eventConversionRequestIdRef.current;
        if (rid === eventConversionRequestIdRef.current) {
          setEventConversionData([]);
          setEventConversionHighlightedSeriesId(null);
          lastEventConversionParamsRef.current = '';
          setEventConversionLoading(false);
        }
        return;
      }

      const effectiveCampaignIds = getEffectiveCampaignIds(selectedOffers);
      const paramsKey = `${selectedAccounts.join(',')}_${selectedApps.join(',')}_${(effectiveCampaignIds || []).join(',') || 'ALL'}_${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}_${eventConversionViewMode}_${eventConversionBadge}`;
      if (paramsKey === lastEventConversionParamsRef.current) {
        setEventConversionLoading(false);
        return;
      }

      const reqId = ++eventConversionRequestIdRef.current;
      eventConversionHasLoadedRef.current = true;
      setEventConversionLoading(true);
      try {
        const eventConversion = await getEventConversionData({
          accountNames: selectedAccounts,
          appIds: selectedApps,
          campaignIds: effectiveCampaignIds,
          fromDate: dateRange[0].format('YYYY-MM-DD'),
          toDate: dateRange[1].format('YYYY-MM-DD')
        }, eventConversionViewMode, eventConversionBadge);

        if (reqId !== eventConversionRequestIdRef.current) {
          return;
        }
        lastEventConversionParamsRef.current = paramsKey;

        // The upper limit of the number of series is 8: sorted by total events in descending order, only the first 8 are retained
        const MAX_SERIES_COUNT = 8;
        const sortedAndLimited = eventConversion
          .map(group => ({
            ...group,
            totalEvents: group.data.reduce((sum, d) => sum + (d.events || 0), 0)
          }))
          .sort((a, b) => b.totalEvents - a.totalEvents) // Sort by total events in descending order
          .slice(0, MAX_SERIES_COUNT) // Only keep the first 8
          .map(({ totalEvents, ...group }) => group); // Remove temporary calculated totalEvents field
        
        setEventConversionData(sortedAndLimited);
        
        // Initialize highlighted series ID: If no series is currently selected, or the selected series is not in the new data, select the first series
        if (sortedAndLimited.length > 0) {
          const firstSeriesId = sortedAndLimited[0].platform 
            ? `${sortedAndLimited[0].groupId}_${sortedAndLimited[0].platform}` 
            : sortedAndLimited[0].groupId;
          
          if (!eventConversionHighlightedSeriesId || 
              !sortedAndLimited.some(g => {
                const id = g.platform ? `${g.groupId}_${g.platform}` : g.groupId;
                return id === eventConversionHighlightedSeriesId;
              })) {
            setEventConversionHighlightedSeriesId(firstSeriesId);
          }
        } else {
          setEventConversionHighlightedSeriesId(null);
        }
      } catch {
        if (reqId !== eventConversionRequestIdRef.current) {
          return;
        }
        lastEventConversionParamsRef.current = '';
      } finally {
        if (reqId === eventConversionRequestIdRef.current) {
          setEventConversionLoading(false);
        }
      }
    };

    eventConversionTimeoutRef.current = setTimeout(() => {
      loadEventConversionData();
    }, 150);

    return () => {
      if (eventConversionTimeoutRef.current) {
        clearTimeout(eventConversionTimeoutRef.current);
        eventConversionTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccounts, selectedApps, selectedOffers, dateRange, eventConversionViewMode, eventConversionBadge, accountConfigs, appConfigs, accountConfigsReady, appConfigsReady]);

  // Distribution Proportion Chart independent data loading (only affected by distributionProportionViewMode and distributionProportionBadge)
  useEffect(() => {
    if (distributionLoadTimeoutRef.current) {
      clearTimeout(distributionLoadTimeoutRef.current);
      distributionLoadTimeoutRef.current = null;
    }

    const loadDistributionProportionData = async () => {
      // The date is invalid: clear it directly, close loading and ready
      if (!dateRange?.[0] || !dateRange[1]) {
        const rid = ++distributionRequestIdRef.current;
        if (rid === distributionRequestIdRef.current) {
          setDistributionProportionData([]);
          setDistributionProportionLoading(false);
          setDistributionProportionChartReady(true);
          lastDistributionProportionParamsRef.current = '';
        }
        return;
      }

      if (!accountConfigsReady || !appConfigsReady) {
        setDistributionProportionLoading(true);
        setDistributionProportionChartReady(false);
        return;
      }
      if (selectedAccounts.length === 0 && accountConfigs.length > 0) {
        return;
      }
      if (selectedApps.length === 0 && appConfigs.length > 0) {
        return;
      }

      // No valid account or application: clear and close loading
      if (selectedAccounts.length === 0 || selectedApps.length === 0) {
        const rid = ++distributionRequestIdRef.current;
        if (rid === distributionRequestIdRef.current) {
          setDistributionProportionData([]);
          setDistributionProportionLoading(false);
          setDistributionProportionChartReady(true);
          lastDistributionProportionParamsRef.current = '';
        }
        return;
      }

      const effectiveCampaignIds = getEffectiveCampaignIds(selectedOffers);
      const paramsKey = `${selectedAccounts.join(',')}_${selectedApps.join(',')}_${(effectiveCampaignIds || []).join(',') || 'ALL'}_${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}_${distributionProportionViewMode}_${distributionProportionBadge}`;
      if (paramsKey === lastDistributionProportionParamsRef.current) {
        // Repeated request with the same parameters: close loading directly to avoid multiple flashes (ready must be restored, otherwise the pie chart will be permanently hidden and there will be no loading)
        setDistributionProportionLoading(false);
        setDistributionProportionChartReady(true);
        return;
      }

      // Hit cache: direct backfill to avoid repeated network requests causing secondary loading somatosensory
      const cached = distributionProportionCacheRef.current.get(paramsKey);
      if (cached) {
        lastDistributionProportionParamsRef.current = paramsKey;
        setDistributionProportionData(cached);
        setDistributionProportionDataKey(JSON.stringify(cached.map(d => ({ name: d.name, value: d.value }))));
        setDistributionProportionLoading(false);
        setDistributionProportionChartReady(true);
        return;
      }

      const reqId = ++distributionRequestIdRef.current;
      setDistributionProportionLoading(true);
      setDistributionProportionChartReady(false);
      try {
        const params = {
          accountNames: selectedAccounts,
          appIds: selectedApps,
          campaignIds: effectiveCampaignIds,
          fromDate: dateRange[0].format('YYYY-MM-DD'),
          toDate: dateRange[1].format('YYYY-MM-DD')
        };

        const distributionProportion = await getDistributionProportionData(
          params,
          distributionProportionViewMode,
          distributionProportionBadge
        );

        if (reqId !== distributionRequestIdRef.current) {
          return;
        }

        lastDistributionProportionParamsRef.current = paramsKey;

        const accList = accountConfigsForChartsRef.current;
        const appList = appConfigsForChartsRef.current;
        const distributionWithIcons = distributionProportion.map(item => {
          let icon: string | undefined;
          if (distributionProportionViewMode === 'ACC') {
            const acc = accList.find(a => a.accountName === item.name);
            icon = acc?.icon;
          } else {
            const app = appList.find(a => a.appName === item.name || a.appId === item.name);
            icon = app?.icon;
          }
          return { ...item, icon };
        });

        const MAX_SERIES_COUNT = 8;
        const sortedAndLimited = distributionWithIcons
          .sort((a, b) => b.value - a.value)
          .slice(0, MAX_SERIES_COUNT);

        distributionProportionCacheRef.current.set(paramsKey, sortedAndLimited);
        setDistributionProportionData(sortedAndLimited);
        setDistributionProportionDataKey(JSON.stringify(sortedAndLimited.map(d => ({ name: d.name, value: d.value }))));
        setDistributionProportionLoading(false);
        // chartReady is set to true by useEffect below after loading is completed, to avoid effect cleanup clearing setTimeout and causing the pie chart to be permanently invisible.
      } catch {
        if (reqId !== distributionRequestIdRef.current) {
          return;
        }
        setDistributionProportionLoading(false);
        setDistributionProportionChartReady(true);
      }
    };

    distributionLoadTimeoutRef.current = setTimeout(() => {
      loadDistributionProportionData();
    }, 90);

    return () => {
      if (distributionLoadTimeoutRef.current) {
        clearTimeout(distributionLoadTimeoutRef.current);
        distributionLoadTimeoutRef.current = null;
      }
    };
  }, [selectedAccounts, selectedApps, selectedOffers, dateRange, distributionProportionViewMode, distributionProportionBadge, accountConfigs, appConfigs, accountConfigsReady, appConfigsReady, getEffectiveCampaignIds]);

  // Pie chart: restore chartReady uniformly after loading to avoid debounce cleanup and setTimeout causing "no animation, no chart"
  useEffect(() => {
    if (distributionProportionLoading) {
      return;
    }
    if (distributionProportionData.length === 0) {
      setDistributionProportionChartReady(true);
      return;
    }
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          setDistributionProportionChartReady(true);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [distributionProportionLoading, distributionProportionData.length]);

  // Used to track Event Name Statistics data loading to avoid repeated calls
  const loadingEventNameStatisticsRef = useRef<boolean>(false);
  const lastEventNameStatisticsParamsRef = useRef<string>('');
  const eventNameStatisticsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Event Name Statistics Chart data loading (using distributionProportionViewMode and distributionProportionBadge)
  useEffect(() => {
    // Clear previous timeout
    if (eventNameStatisticsTimeoutRef.current) {
      clearTimeout(eventNameStatisticsTimeoutRef.current);
    }
    
    const loadEventNameStatisticsData = async () => {
      if (!dateRange?.[0] || !dateRange[1]) {
        const rid = ++eventNameStatisticsRequestIdRef.current;
        if (rid === eventNameStatisticsRequestIdRef.current) {
          setEventNameStatisticsData([]);
          setEventNameStatisticsDataKey('');
          setEventNameStatisticsLoading(false);
          setEventNameStatisticsChartReady(true);
          lastEventNameStatisticsParamsRef.current = '';
        }
        return;
      }

      if (!accountConfigsReady || !appConfigsReady) {
        setEventNameStatisticsLoading(true);
        setEventNameStatisticsChartReady(false);
        return;
      }
      if (selectedAccounts.length === 0 && accountConfigs.length > 0) {
        return;
      }
      if (selectedApps.length === 0 && appConfigs.length > 0) {
        return;
      }

      if (selectedAccounts.length === 0 || selectedApps.length === 0) {
        const rid = ++eventNameStatisticsRequestIdRef.current;
        if (rid === eventNameStatisticsRequestIdRef.current) {
          setEventNameStatisticsData([]);
          setEventNameStatisticsDataKey('');
          setEventNameStatisticsLoading(false);
          setEventNameStatisticsChartReady(true);
          lastEventNameStatisticsParamsRef.current = '';
        }
        return;
      }

      const effectiveCampaignIds = getEffectiveCampaignIds(selectedOffers);
      const paramsKey = `${selectedAccounts.join(',')}_${selectedApps.join(',')}_${(effectiveCampaignIds || []).join(',') || 'ALL'}_${dateRange[0].format('YYYY-MM-DD')}_${dateRange[1].format('YYYY-MM-DD')}_${distributionProportionViewMode}_${distributionProportionBadge}`;
      if (paramsKey === lastEventNameStatisticsParamsRef.current) {
        setEventNameStatisticsLoading(false);
        setEventNameStatisticsChartReady(true);
        return;
      }

      const reqId = ++eventNameStatisticsRequestIdRef.current;
      setEventNameStatisticsLoading(true);
      setEventNameStatisticsChartReady(false);

      try {
        loadingEventNameStatisticsRef.current = true;
        const params = {
          accountNames: selectedAccounts,
          appIds: selectedApps,
          campaignIds: effectiveCampaignIds,
          fromDate: dateRange[0].format('YYYY-MM-DD'),
          toDate: dateRange[1].format('YYYY-MM-DD')
        };

        const eventNameStatistics = await getEventNameStatisticsData(
          params,
          distributionProportionViewMode,
          distributionProportionBadge,
          false
        );

        if (reqId !== eventNameStatisticsRequestIdRef.current) {
          return;
        }
        lastEventNameStatisticsParamsRef.current = paramsKey;

        const MAX_EVENT_NAMES_COUNT = 8;
        const sortedAndLimited = eventNameStatistics
          .map(event => ({
            ...event,
            total: event.install + event.event + event.retargetingInstall + event.retargetingEvent
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, MAX_EVENT_NAMES_COUNT);

        setEventNameStatisticsData(sortedAndLimited);
        setEventNameStatisticsDataKey(JSON.stringify(sortedAndLimited.map(d => ({
          eventName: d.eventName,
          install: d.install,
          event: d.event,
          retargetingInstall: d.retargetingInstall,
          retargetingEvent: d.retargetingEvent
        }))));
      } catch {
        if (reqId !== eventNameStatisticsRequestIdRef.current) {
          return;
        }
        // The data must also be cleared when the request fails to prevent the funnel chart from retaining the previous round of results.
        setEventNameStatisticsData([]);
        setEventNameStatisticsDataKey('');
        setEventNameStatisticsChartReady(true);
        lastEventNameStatisticsParamsRef.current = '';
      } finally {
        if (reqId === eventNameStatisticsRequestIdRef.current) {
          loadingEventNameStatisticsRef.current = false;
          setEventNameStatisticsLoading(false);
        }
      }
    };

    // Use anti-shake, delay execution
    eventNameStatisticsTimeoutRef.current = setTimeout(() => {
      loadEventNameStatisticsData();
    }, 150); // 150ms anti-shake delay, consistent with other charts
    
    // Cleanup function
    return () => {
      if (eventNameStatisticsTimeoutRef.current) {
        clearTimeout(eventNameStatisticsTimeoutRef.current);
      }
    };
  }, [selectedAccounts, selectedApps, selectedOffers, dateRange, distributionProportionViewMode, distributionProportionBadge, accountConfigs, appConfigs, accountConfigsReady, appConfigsReady, getEffectiveCampaignIds]);

  // Funnel chart: chartReady is restored uniformly after loading (the same set as the pie chart, to avoid cleanup canceling the timer and causing the funnel not to be displayed)
  useEffect(() => {
    if (eventNameStatisticsLoading) {
      return;
    }
    if (eventNameStatisticsData.length === 0) {
      setEventNameStatisticsChartReady(true);
      return;
    }
    let cancelled = false;
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          setEventNameStatisticsChartReady(true);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
    };
  }, [eventNameStatisticsLoading, eventNameStatisticsData.length]);

  // Regional Statistics Chart series switching function
  const handleRegionalSeriesSwitch = (direction: 'prev' | 'next') => {
    if (regionalStatisticsGroupedData.length === 0) return;
    // Key fix: ChartKey is also updated when switching series to ensure animation execution
    setRegionalStatisticsChartKey(prev => prev + 1);
    
    const allSeriesIds = regionalStatisticsGroupedData.map(group => {
      // APP mode: use appId + platform as the unique identifier
      // ACC mode: use account as the unique identifier
      if (regionalStatisticsTripleMode === 'APP') {
        return group.appId && group.platform 
          ? `${group.appId}_${group.platform}` 
          : group.appId || '';
      } else {
        return group.account || '';
      }
    });
    
    if (allSeriesIds.length === 0) return;
    
    const currentIndex = regionalStatisticsHighlightedSeriesId 
      ? allSeriesIds.indexOf(regionalStatisticsHighlightedSeriesId)
      : -1;
    
    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = currentIndex < allSeriesIds.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : allSeriesIds.length - 1;
    }
    
    setRegionalStatisticsHighlightedSeriesId(allSeriesIds[nextIndex]);
  };

  // Regional Statistics Chart data acquisition
  // Use the debounce mechanism to avoid rapid consecutive calls
  const regionalStatisticsLoadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Clear previous timer
    if (regionalStatisticsLoadTimeoutRef.current) {
      clearTimeout(regionalStatisticsLoadTimeoutRef.current);
      regionalStatisticsLoadTimeoutRef.current = null;
    }
    
    // Check the conditions first, if the conditions are not met, return immediately
    if (!dateRange?.[0] || !dateRange?.[1]) {
      setRegionalStatisticsData([]);
      setRegionalStatisticsGroupedData([]);
      setRegionalStatisticsHighlightedSeriesId(null);
      setRegionalStatisticsLoading(false);
      setRegionalStatisticsChartReady(true);
      regionalStatisticsLastParamsRef.current = ''; // clear tracking
      return;
    }

    if (!accountConfigsReady || !appConfigsReady) {
      setRegionalStatisticsLoading(true);
      setRegionalStatisticsChartReady(false);
      return;
    }
    if (selectedAccounts.length === 0 && accountConfigs.length > 0) {
      // The configuration is ready but there is no valid account selection: avoid permanent loading and directly converge to an empty state
      setRegionalStatisticsData([]);
      setRegionalStatisticsGroupedData([]);
      setRegionalStatisticsHighlightedSeriesId(null);
      setRegionalStatisticsLoading(false);
      setRegionalStatisticsChartReady(true);
      regionalStatisticsLastParamsRef.current = '';
      return;
    }
    if (selectedApps.length === 0 && appConfigs.length > 0) {
      // The configuration is ready but there is no valid application selection: avoid permanent loading and directly converge to an empty state
      setRegionalStatisticsData([]);
      setRegionalStatisticsGroupedData([]);
      setRegionalStatisticsHighlightedSeriesId(null);
      setRegionalStatisticsLoading(false);
      setRegionalStatisticsChartReady(true);
      regionalStatisticsLastParamsRef.current = '';
      return;
    }
    if (selectedAccounts.length === 0 || selectedApps.length === 0) {
      setRegionalStatisticsData([]);
      setRegionalStatisticsGroupedData([]);
      setRegionalStatisticsHighlightedSeriesId(null);
      setRegionalStatisticsLoading(false);
      setRegionalStatisticsChartReady(true);
      regionalStatisticsLastParamsRef.current = '';
      return;
    }

    // Build a unique identifier for request parameters, used for deduplication (checked before debounce)
    const fromDate = dateRange[0].format('YYYY-MM-DD');
    const toDate = dateRange[1].format('YYYY-MM-DD');
    const groupBy = regionalStatisticsTripleMode === 'ALL' ? 'ALL' : 
                   regionalStatisticsTripleMode === 'ACC' ? 'ACC' : 'APP';
    
    const effectiveCampaignIds = getEffectiveCampaignIds(selectedOffers);
    // Create a unique identifier using the sorted array and all parameters (exactly the same as in loadRegionalStatisticsData)
    const paramsKey = JSON.stringify({
      accountNames: [...selectedAccounts].sort(),
      appIds: [...selectedApps].sort(),
      campaignIds: effectiveCampaignIds ?? 'ALL',
      fromDate,
      toDate,
      groupBy,
      badge: regionalStatisticsBadge,
      dataType: regionalStatisticsDataType
    });
    
    // If the parameters do not change, skip the request (avoid repeated calls)
    // But when loading for the first time (ref is an empty string), loading should be allowed
    // Note: ChartReady cannot be advanced when the data has been cleared, otherwise Empty will flash first and then enter loading.
    if (regionalStatisticsLastParamsRef.current && regionalStatisticsLastParamsRef.current === paramsKey) {
      const hasCachedRegionalData =
        regionalStatisticsData.length > 0 ||
        regionalStatisticsGroupedData.length > 0 ||
        regionalStatisticsLastValidChartDataRef.current.length > 0;
      if (hasCachedRegionalData) {
        setRegionalStatisticsLoading(false);
      }
      return;
    }

    const currentParamsKeyForCheck = paramsKey;

    const loadRegionalStatisticsData = async () => {
      const reqId = ++regionalStatisticsRequestIdRef.current;
      // Check the conditions again (maybe the conditions have changed during the delay)
      if ((selectedAccounts.length === 0 && selectedApps.length === 0) || !dateRange || !dateRange[0] || !dateRange[1]) {
        setRegionalStatisticsData([]);
        setRegionalStatisticsGroupedData([]);
        setRegionalStatisticsHighlightedSeriesId(null);
        setRegionalStatisticsLoading(false);
        setRegionalStatisticsChartReady(true);
        // Do not clear ref, keep current state
        return;
      }
      
      // Verify the parameters again (maybe the parameters have changed during the delay)
      const currentFromDate = dateRange[0].format('YYYY-MM-DD');
      const currentToDate = dateRange[1].format('YYYY-MM-DD');
      const currentGroupBy = regionalStatisticsTripleMode === 'ALL' ? 'ALL' : 
                            regionalStatisticsTripleMode === 'ACC' ? 'ACC' : 'APP';
      const currentParamsKey = JSON.stringify({
        accountNames: [...selectedAccounts].sort(),
        appIds: [...selectedApps].sort(),
        campaignIds: effectiveCampaignIds ?? 'ALL',
        fromDate: currentFromDate,
        toDate: currentToDate,
        groupBy: currentGroupBy,
        badge: regionalStatisticsBadge,
        dataType: regionalStatisticsDataType
      });
      
      if (currentParamsKey !== currentParamsKeyForCheck) {
        // Parameters change during debounce: the current request is invalid, but the UI must be converged to avoid getting stuck on loading
        if (reqId === regionalStatisticsRequestIdRef.current) {
          setRegionalStatisticsLoading(false);
          setRegionalStatisticsChartReady(true);
        }
        return;
      }

      if (regionalStatisticsLastParamsRef.current === currentParamsKey) {
        // When removing duplicate hits, it is also necessary to explicitly converge loading to avoid setting true externally first and then causing infinite circles due to skipping of the same parameters.
        if (reqId === regionalStatisticsRequestIdRef.current) {
          setRegionalStatisticsLoading(false);
          setRegionalStatisticsChartReady(true);
        }
        return;
      }

      regionalStatisticsLoadingRef.current = true;
      setRegionalStatisticsLoading(true);
      setRegionalStatisticsChartReady(false);
      try {
        const data = await getRegionalStatisticsData(
          {
            accountNames: selectedAccounts,
            appIds: selectedApps,
            campaignIds: effectiveCampaignIds,
            fromDate: currentFromDate,
            toDate: currentToDate,
          },
          currentGroupBy,
          regionalStatisticsBadge,
          regionalStatisticsDataType
        );

        if (reqId !== regionalStatisticsRequestIdRef.current) {
          return;
        }
        regionalStatisticsLastParamsRef.current = currentParamsKey;

        if (currentGroupBy === 'ALL') {
          // ALL mode: use data directly
          setRegionalStatisticsData(data as RegionalStatisticsData[]);
          setRegionalStatisticsGroupedData([]);
          setRegionalStatisticsHighlightedSeriesId(null);
          // Update the last valid chart data
          const chartData = (data as RegionalStatisticsData[])
            .filter(d => d.count !== undefined && d.count !== null && !isNaN(Number(d.count)))
            .map(d => ({
              category: d.country,
              value: Number(d.count),
              eventData: d.eventData,
            }));
          regionalStatisticsLastValidChartDataRef.current = chartData;
        } else {
          // ACC or APP mode: using packet data
          setRegionalStatisticsGroupedData(data as RegionalStatisticsGroupedData[]);
          setRegionalStatisticsData([]);
          // Automatically select the first series
          if ((data as RegionalStatisticsGroupedData[]).length > 0) {
            const firstSeries = (data as RegionalStatisticsGroupedData[])[0];
            let firstSeriesId: string;
            if (currentGroupBy === 'APP') {
              // APP mode: use appId + platform as the unique identifier
              firstSeriesId = firstSeries.appId && firstSeries.platform 
                ? `${firstSeries.appId}_${firstSeries.platform}` 
                : firstSeries.appId || '';
            } else {
              // ACC mode: use account as the unique identifier
              firstSeriesId = firstSeries.account || '';
            }
            setRegionalStatisticsHighlightedSeriesId(firstSeriesId);
            // Update the last valid chart data
            const chartData = firstSeries.data
              .filter(d => d.count !== undefined && d.count !== null && !isNaN(Number(d.count)))
              .map(d => ({
                category: d.country,
                value: Number(d.count),
                eventData: d.eventData,
              }));
            regionalStatisticsLastValidChartDataRef.current = chartData;
          } else {
            setRegionalStatisticsHighlightedSeriesId(null);
            regionalStatisticsLastValidChartDataRef.current = [];
          }
        }
      } catch (error: any) {
        if (reqId !== regionalStatisticsRequestIdRef.current) {
          return;
        }
        console.error('Failed to load regional statistics data:', error);
        const errorMessage = error.message || '';
        if (errorMessage.includes('Invalid response format')) {
          setRegionalStatisticsData([]);
          setRegionalStatisticsGroupedData([]);
        } else if (error.response?.status && error.response.status >= 500) {
          message.error(errorMessage || 'Failed to load regional statistics data');
          setRegionalStatisticsData([]);
          setRegionalStatisticsGroupedData([]);
        } else {
          setRegionalStatisticsData([]);
          setRegionalStatisticsGroupedData([]);
        }
        setRegionalStatisticsHighlightedSeriesId(null);
        regionalStatisticsLastParamsRef.current = '';
      } finally {
        if (reqId === regionalStatisticsRequestIdRef.current) {
          setRegionalStatisticsLoading(false);
          regionalStatisticsLoadingRef.current = false;
          setRegionalStatisticsChartKey(prev => prev + 1);
        }
      }
    };

    // Use debounce to delay execution to avoid multiple calls when dependencies change rapidly.
    regionalStatisticsLoadTimeoutRef.current = setTimeout(() => {
      loadRegionalStatisticsData();
    }, 100); // Delay execution by 100ms

    // Cleanup function
    return () => {
      if (regionalStatisticsLoadTimeoutRef.current) {
        clearTimeout(regionalStatisticsLoadTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccounts, selectedApps, selectedOffers, dateRange, regionalStatisticsTripleMode, regionalStatisticsBadge, regionalStatisticsDataType, accountConfigs, appConfigs, accountConfigsReady, appConfigsReady]);

  // Regional Statistics: Mark chartReady after loading is completed (consistent with Affiliate Channel to avoid Empty/loading disorder)
  useEffect(() => {
    if (regionalStatisticsLoading) {
      setRegionalStatisticsChartReady(false);
      return;
    }
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          setRegionalStatisticsChartReady(true);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [
    regionalStatisticsLoading,
    regionalStatisticsData.length,
    regionalStatisticsGroupedData.length,
    regionalStatisticsHighlightedSeriesId,
  ]);

  // Affiliate Channel Chart data acquisition (aggregation by Channel)
  useEffect(() => {
    if (affiliateChannelLoadTimeoutRef.current) {
      clearTimeout(affiliateChannelLoadTimeoutRef.current);
      affiliateChannelLoadTimeoutRef.current = null;
    }

    if (!dateRange?.[0] || !dateRange?.[1]) {
      setAffiliateChannelData([]);
      setAffiliateChannelHighlightedSeriesId(null);
      setAffiliateChannelLoading(false);
      setAffiliateChannelChartReady(true);
      affiliateChannelLastParamsRef.current = '';
      return;
    }

    if (!accountConfigsReady || !appConfigsReady) {
      setAffiliateChannelLoading(true);
      setAffiliateChannelChartReady(false);
      return;
    }

    if ((selectedAccounts.length === 0 && accountConfigs.length > 0) || (selectedApps.length === 0 && appConfigs.length > 0)) {
      setAffiliateChannelData([]);
      setAffiliateChannelHighlightedSeriesId(null);
      setAffiliateChannelLoading(false);
      setAffiliateChannelChartReady(true);
      affiliateChannelLastParamsRef.current = '';
      return;
    }

    if (selectedAccounts.length === 0 || selectedApps.length === 0) {
      setAffiliateChannelData([]);
      setAffiliateChannelHighlightedSeriesId(null);
      setAffiliateChannelLoading(false);
      setAffiliateChannelChartReady(true);
      affiliateChannelLastParamsRef.current = '';
      return;
    }

    const fromDate = dateRange[0].format('YYYY-MM-DD');
    const toDate = dateRange[1].format('YYYY-MM-DD');
    const effectiveCampaignIds = getEffectiveCampaignIds(selectedOffers);
    const groupBy = affiliateChannelTripleMode === 'ALL' ? 'ALL' : affiliateChannelTripleMode === 'ACC' ? 'ACC' : 'APP';
    const paramsKey = JSON.stringify({
      accountNames: [...selectedAccounts].sort(),
      appIds: [...selectedApps].sort(),
      campaignIds: effectiveCampaignIds ?? 'ALL',
      fromDate,
      toDate,
      groupBy,
      badge: affiliateChannelBadge,
      dataType: affiliateChannelDataType,
    });

    if (affiliateChannelLastParamsRef.current && affiliateChannelLastParamsRef.current === paramsKey) {
      setAffiliateChannelLoading(false);
      setAffiliateChannelChartReady(true);
      return;
    }

    affiliateChannelLoadTimeoutRef.current = setTimeout(async () => {
      const reqId = ++affiliateChannelRequestIdRef.current;
      setAffiliateChannelLoading(true);
      setAffiliateChannelChartReady(false);
      try {
        const data = await getAffiliateChannelData(
          {
            accountNames: selectedAccounts,
            appIds: selectedApps,
            campaignIds: effectiveCampaignIds,
            fromDate,
            toDate,
          },
          groupBy,
          affiliateChannelBadge,
          affiliateChannelDataType
        );
        if (reqId !== affiliateChannelRequestIdRef.current) {
          return;
        }
        affiliateChannelLastParamsRef.current = paramsKey;
        const filteredData = (data || []).filter(item => Number(item.count) > 0).slice(0, 80);
        setAffiliateChannelData(filteredData);
        if (groupBy === 'ALL' || filteredData.length === 0) {
          setAffiliateChannelHighlightedSeriesId(null);
        }
      } catch (error: any) {
        if (reqId !== affiliateChannelRequestIdRef.current) {
          return;
        }
        setAffiliateChannelData([]);
        setAffiliateChannelHighlightedSeriesId(null);
        affiliateChannelLastParamsRef.current = '';
        if (error?.response?.status && error.response.status >= 500) {
          message.error(error.message || 'Failed to load affiliate channel data');
        }
      } finally {
        if (reqId === affiliateChannelRequestIdRef.current) {
          setAffiliateChannelLoading(false);
        }
      }
    }, 100);

    return () => {
      if (affiliateChannelLoadTimeoutRef.current) {
        clearTimeout(affiliateChannelLoadTimeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedAccounts,
    selectedApps,
    selectedOffers,
    dateRange,
    affiliateChannelTripleMode,
    affiliateChannelBadge,
    affiliateChannelDataType,
    accountConfigs,
    appConfigs,
    accountConfigsReady,
    appConfigsReady,
  ]);

  const affiliateChannelGroupedData = useMemo<AffiliateChannelGroupedData[]>(() => {
    if (affiliateChannelTripleMode === 'ALL') {
      return [];
    }
    const accountIconMap = new Map<string, string>();
    accountConfigs.forEach(cfg => {
      const key = (cfg.accountName || '').trim().toLowerCase();
      if (key && cfg.icon) {
        accountIconMap.set(key, cfg.icon);
      }
    });
    const appConfigMap = new Map<string, AppConfig>();
    appConfigs.forEach(cfg => {
      const key = (cfg.appId || '').trim();
      if (key) {
        appConfigMap.set(key, cfg);
      }
    });
    const groupMap = new Map<string, AffiliateChannelGroupedData>();
    affiliateChannelData.forEach((item) => {
      const normalizedGroupName = (item.groupName || '').trim() || 'Unknown';
      const seriesId = normalizedGroupName;
      let displayName = normalizedGroupName;
      let icon: string | undefined;
      if (affiliateChannelTripleMode === 'ACC') {
        icon = accountIconMap.get(normalizedGroupName.toLowerCase());
      } else if (affiliateChannelTripleMode === 'APP') {
        const appCfg = appConfigMap.get(normalizedGroupName);
        if (appCfg) {
          displayName = appCfg.appName || normalizedGroupName;
          icon = appCfg.icon;
        }
      }
      const existing = groupMap.get(seriesId);
      if (existing) {
        existing.data.push(item);
        existing.total += Number(item.count) || 0;
      } else {
        groupMap.set(seriesId, {
          seriesId,
          groupName: normalizedGroupName,
          displayName,
          icon,
          data: [item],
          total: Number(item.count) || 0,
        });
      }
    });
    return Array.from(groupMap.values()).sort((a, b) => b.total - a.total);
  }, [affiliateChannelData, affiliateChannelTripleMode, accountConfigs, appConfigs]);

  useEffect(() => {
    if (affiliateChannelTripleMode === 'ALL') {
      if (affiliateChannelHighlightedSeriesId !== null) {
        setAffiliateChannelHighlightedSeriesId(null);
      }
      return;
    }
    if (affiliateChannelGroupedData.length === 0) {
      if (affiliateChannelHighlightedSeriesId !== null) {
        setAffiliateChannelHighlightedSeriesId(null);
      }
      return;
    }
    const hasCurrent = affiliateChannelGroupedData.some(group => group.seriesId === affiliateChannelHighlightedSeriesId);
    if (!hasCurrent) {
      setAffiliateChannelHighlightedSeriesId(affiliateChannelGroupedData[0].seriesId);
    }
  }, [affiliateChannelTripleMode, affiliateChannelGroupedData, affiliateChannelHighlightedSeriesId]);

  const handleAffiliateChannelSeriesSwitch = useCallback((direction: 'prev' | 'next') => {
    if (affiliateChannelGroupedData.length <= 1) {
      return;
    }
    const ids = affiliateChannelGroupedData.map(group => group.seriesId);
    const currentIndex = affiliateChannelHighlightedSeriesId ? ids.indexOf(affiliateChannelHighlightedSeriesId) : 0;
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = direction === 'next'
      ? (safeIndex + 1) % ids.length
      : (safeIndex - 1 + ids.length) % ids.length;
    setAffiliateChannelHighlightedSeriesId(ids[nextIndex]);
  }, [affiliateChannelGroupedData, affiliateChannelHighlightedSeriesId]);

  const affiliateChannelCurrentSeries = useMemo(() => {
    if (affiliateChannelTripleMode === 'ALL') {
      return null;
    }
    return affiliateChannelGroupedData.find(group => group.seriesId === affiliateChannelHighlightedSeriesId) || null;
  }, [affiliateChannelTripleMode, affiliateChannelGroupedData, affiliateChannelHighlightedSeriesId]);

  const affiliateChannelChartData = useMemo(() => {
    if (affiliateChannelTripleMode === 'ALL') {
      return affiliateChannelData;
    }
    return affiliateChannelCurrentSeries?.data || [];
  }, [affiliateChannelTripleMode, affiliateChannelData, affiliateChannelCurrentSeries]);

  // Affiliate Channel Chart loading -> ready transition to avoid container jitter
  useEffect(() => {
    if (affiliateChannelLoading) {
      setAffiliateChannelChartReady(false);
      return;
    }
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          setAffiliateChannelChartReady(true);
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [affiliateChannelLoading, affiliateChannelData.length]);

  // Install Conversion Chart data (obtained from API, processed by group)
  // Install Conversion Chart series switching functions
  const handleInstallSeriesSwitch = (direction: 'prev' | 'next') => {
    if (installConversionData.length === 0) return;
    
    const allSeriesIds = installConversionData.map(group => {
      return group.platform ? `${group.groupId}_${group.platform}` : group.groupId;
    });
    
    if (allSeriesIds.length === 0) return;
    
    const currentIndex = installConversionHighlightedSeriesId 
      ? allSeriesIds.indexOf(installConversionHighlightedSeriesId)
      : -1;
    
    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = currentIndex < allSeriesIds.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : allSeriesIds.length - 1;
    }
    
    setInstallConversionHighlightedSeriesId(allSeriesIds[nextIndex]);
  };
  
  // Event Conversion Chart series switching function
  const handleEventSeriesSwitch = (direction: 'prev' | 'next') => {
    if (eventConversionData.length === 0) return;
    
    const allSeriesIds = eventConversionData.map(group => {
      return group.platform ? `${group.groupId}_${group.platform}` : group.groupId;
    });
    
    if (allSeriesIds.length === 0) return;
    
    const currentIndex = eventConversionHighlightedSeriesId 
      ? allSeriesIds.indexOf(eventConversionHighlightedSeriesId)
      : -1;
    
    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = currentIndex < allSeriesIds.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : allSeriesIds.length - 1;
    }
    
    setEventConversionHighlightedSeriesId(allSeriesIds[nextIndex]);
  };

  const hasAnyInstallConversionPoints = useMemo(() =>
    installConversionData.some(g => g.data && g.data.length > 0),
  [installConversionData]);
  const hasAnyEventConversionPoints = useMemo(() =>
    eventConversionData.some(g => g.data && g.data.length > 0),
  [eventConversionData]);

  // installConversionData is already grouped data and does not need to be converted.

  const mediaSourceData = [
    { source: 'Facebook', installs: 3200, revenue: 45000 },
    { source: 'Google Ads', installs: 2800, revenue: 38000 },
    { source: 'TikTok', installs: 2100, revenue: 29000 },
    { source: 'Apple Search', installs: 1800, revenue: 25000 },
    { source: 'Others', installs: 1200, revenue: 15000 },
  ];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _countryData = [
    { country: 'US', installs: 45, revenue: 60 },
    { country: 'UK', installs: 15, revenue: 18 },
    { country: 'DE', installs: 12, revenue: 14 },
    { country: 'FR', installs: 10, revenue: 12 },
    { country: 'JP', installs: 8, revenue: 10 },
    { country: 'Others', installs: 10, revenue: 12 },
  ];

  const eventTypeData = [
    { type: 'Purchase', value: 35, color: '#52c41a' },
    { type: 'Registration', value: 25, color: '#1890ff' },
    { type: 'Level Complete', value: 20, color: '#faad14' },
    { type: 'Tutorial Complete', value: 15, color: '#f5222d' },
    { type: 'Others', value: 5, color: '#722ed1' },
  ];

  // Chart configuration
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _lineConfig = {
    data: installConversionData.length > 0 && installConversionData[0]?.data 
      ? installConversionData[0].data.map((d: any) => ({ date: d.date, installs: d.installs }))
      : [],
    xField: 'date',
    yField: 'installs',
    smooth: true,
    color: '#1890ff',
    point: {
      size: 5,
      shape: 'diamond',
    },
    tooltip: {
      showCrosshairs: true,
      shared: true,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _columnConfig = {
    data: mediaSourceData,
    xField: 'source',
    yField: 'installs',
    color: '#1890ff',
    label: {
      position: 'top',
      style: {
        fill: '#FFFFFF',
        opacity: 0.6,
      },
    },
    meta: {
      installs: {
        alias: 'Installs',
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _pieConfig = {
    data: eventTypeData,
    angleField: 'value',
    colorField: 'type',
    radius: 0.8,
    label: {
      type: 'outer',
      content: '{name} {percentage}',
    },
    interactions: [
      {
        type: 'element-active',
      },
    ],
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _dualAxesConfig = {
    data: [mediaSourceData, mediaSourceData],
    xField: 'source',
    yField: ['installs', 'revenue'],
    geometryOptions: [
      {
        geometry: 'column',
        color: '#1890ff',
      },
      {
        geometry: 'line',
        color: '#52c41a',
        lineStyle: {
          lineWidth: 2,
        },
      },
    ],
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _areaConfig = {
    data: dailyData.events.map(d => ({ date: d.date, events: d.value })),
    xField: 'date',
    yField: 'events',
    smooth: true,
    areaStyle: {
      fill: '#1890ff',
      fillOpacity: 0.6,
    },
  };

  return (
    <>
      <style>
        {`
          /*Dashboard page custom scroll bar style - thinner and no hover effect*/
          .dashboard-scrollable::-webkit-scrollbar {
            width: 4px;
          }
          
          .dashboard-scrollable::-webkit-scrollbar-track {
            background: transparent;
          }
          
          .dashboard-scrollable::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 2px;
          }
          
          .dashboard-scrollable::-webkit-scrollbar-thumb:hover {
            background: rgba(0, 0, 0, 0.2);
            width: 4px;
          }
          
          /*Disable text selection on Dashboard page*/
          .dashboard-container {
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
          }
          
          /*fade in animation*/
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
          
          .dashboard-container * {
            user-select: none;
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
          }
          
          /*Input boxes and text areas allow text selection*/
          .dashboard-container input,
          .dashboard-container textarea {
            user-select: text !important;
            -webkit-user-select: text !important;
            -moz-user-select: text !important;
            -ms-user-select: text !important;
          }
        `}
      </style>
      <div className="dashboard-container max-w-[1800px] mx-auto p-6">
      <Spin spinning={loading}>
        {/* Page titles and filters */}
        <div className="mb-6">
          <div ref={topHeaderRowRef} className="flex justify-between items-center gap-3 min-w-0">
            <div className="min-w-0 flex-1">
              <h1 className="text-gray-900 dark:text-gray-900 m-0 text-2xl font-bold select-none">
                {'Automated Data Dashboard'}
              </h1>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-gray-700 dark:text-gray-700 mb-0 select-none">
                {'Non-Real-Time Cold Data Analytics'}
              </p>
                <div className="group relative flex-shrink-0">
                  <HelpCircle className="w-4 h-4 text-gray-400 dark:text-gray-500 cursor-help" />
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none absolute left-1/2 -translate-x-1/2 top-6 z-10 w-80 rounded-md bg-slate-900 text-slate-50 dark:bg-slate-100 dark:text-slate-900 text-xs p-3 shadow-lg">
                    Data table sources come from AutoPipe automated task execution. All chart series are limited to 8 items maximum. Series exceeding this limit will be truncated to 8 items in descending order by data value. For data comparison and analysis, you can utilize the filter functionality located at the top right.
                  </div>
                </div>
              </div>
            </div>
            <div ref={topFiltersRef} className="flex gap-2 items-center min-w-0">
                {/* Account configuration selector */}
                <div className="relative" data-account-selector>
                  <button
                    onClick={() => {
                      // Close other selectors
                      setOfferSelectorVisible(false);
                      setAppSelectorVisible(false);
                      setDateSelectorVisible(false);
                      setAccountSelectorVisible(!accountSelectorVisible);
                    }}
                    className="flex items-center gap-2 border border-gray-300 rounded-md bg-white cursor-pointer font-light text-[rgb(34,13,78)] justify-between transition-all duration-200 select-none hover:bg-gray-50 hover:border-gray-400"
                    style={{
                      fontFamily: '"Museo Sans", sans-serif',
                      boxSizing: 'border-box',
                      fontSize: '0.8125rem', // 13px = 0.8125rem (as a baseline, all internal elements use em units)
                      lineHeight: '1.5', // Uniform row heights to ensure vertical alignment
                      width: '12.5rem', // Restore fixed width
                      minWidth: '12.5rem',
                      maxWidth: '12.5rem',
                      padding: '0.5em 0.75em', // Use em units, relative to fontSize
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      verticalAlign: 'middle'
                    }}
                  >
                    <div className="flex items-center" style={{ 
                      gap: '0.375em', 
                      flex: '1 1 auto', 
                      minWidth: 0,
                      alignItems: 'center',
                      lineHeight: '1.5'
                    }}>
                      <div className="rounded-sm flex items-center justify-center overflow-hidden bg-[rgba(0,0,0,0.04)]" style={{ 
                        flexShrink: 0,
                        width: '1.2308em', // 16px / 13px = 1.2308em (relative to the button’s fontSize)
                        height: '1.2308em',
                        minWidth: '1.2308em',
                        minHeight: '1.2308em',
                        maxWidth: '1.2308em',
                        maxHeight: '1.2308em',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        verticalAlign: 'middle',
                        lineHeight: '1'
                      }}>
                        {(() => {
                          if (validSelectedAccountsCount === 1) {
                            const validSelectedAccount = selectedAccounts.find(accountName => accountConfigs.some(account => account.accountName === accountName));
                            const selectedConfig = accountConfigs.find(config => config.accountName === validSelectedAccount);
                            if (selectedConfig?.icon) {
                              return (
                                <>
                                  <img 
                                    src={selectedConfig.icon} 
                                    alt={selectedConfig.accountName}
                                    draggable={false}
                                    className="w-full h-full object-cover rounded-sm select-none pointer-events-none"
                                    style={{ 
                                      WebkitUserSelect: 'none',
                                      MozUserSelect: 'none',
                                      msUserSelect: 'none',
                                      WebkitTouchCallout: 'none'
                                    }}
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                                      if (nextElement) {
                                        nextElement.style.display = 'flex';
                                      }
                                    }}
                                  />
                                  <div 
                                    className="flex items-center justify-center"
                                    style={{
                                      display: 'none',
                                      width: '1.0769em', // 14px / 13px = 1.0769em (relative to the button’s fontSize)
                                      height: '1.0769em',
                                      background: 'rgba(0, 0, 0, 0.1)',
                                      borderRadius: '0.2308em', // 3px / 13px = 0.2308em
                                      fontSize: '0.6154em', // 8px / 13px = 0.6154em
                                      color: 'rgba(0, 0, 0, 0.4)'
                                    }}
                                  >
                                    {selectedConfig.accountName ? selectedConfig.accountName.substring(0, 2).toUpperCase() : 'AC'}
                                  </div>
                                </>
                              );
                            }
                          } else if (validSelectedAccountsCount > 1) {
                            // When multiple selections are made, accounts with custom icons will be displayed first.
                            const selectedConfigs = accountConfigs.filter(config => selectedAccounts.includes(config.accountName));
                            const configWithIcon = selectedConfigs.find(config => config.icon);
                            
                            if (configWithIcon?.icon) {
                              return (
                                <>
                                  <img 
                                    src={configWithIcon.icon} 
                                    alt={configWithIcon.accountName}
                                    draggable={false}
                                    className="w-full h-full object-cover rounded-sm select-none pointer-events-none"
                                    style={{ 
                                      WebkitUserSelect: 'none',
                                      MozUserSelect: 'none',
                                      msUserSelect: 'none',
                                      WebkitTouchCallout: 'none'
                                    }}
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                                      if (nextElement) {
                                        nextElement.style.display = 'flex';
                                      }
                                    }}
                                  />
                                  <div 
                                    className="flex items-center justify-center"
                                    style={{
                                      display: 'none',
                                      width: '1.0769em', // 14px / 13px = 1.0769em (relative to the button’s fontSize)
                                      height: '1.0769em',
                                      background: 'rgba(0, 0, 0, 0.1)',
                                      borderRadius: '0.2308em', // 3px / 13px = 0.2308em
                                      fontSize: '0.6154em', // 8px / 13px = 0.6154em
                                      color: 'rgba(0, 0, 0, 0.4)'
                                    }}
                                  >
                                    {configWithIcon.accountName ? configWithIcon.accountName.substring(0, 2).toUpperCase() : 'AC'}
                                  </div>
                                </>
                              );
                            }
                          }
                          // Default icon (no data/unselected): only transparent + text, no middle dark gray layer; letters are completely centered relative to the outer frame (vertical fine-tuning to compensate for font measurement)
                          return (
                            <div 
                              className="flex items-center justify-center"
                              style={{
                                width: '1.0769em',
                                height: '1.0769em',
                                background: 'transparent',
                                borderRadius: '0.2308em',
                                fontSize: '0.6154em',
                                lineHeight: 1,
                                color: 'rgba(0, 0, 0, 0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                                padding: 0
                              }}
                            >
                              <span style={{ display: 'block', lineHeight: 1, transform: 'translateY(0.08em)' }}>AC</span>
                            </div>
                          );
                        })()}
                      </div>
                      <span style={{ 
                        fontSize: '1em', 
                        lineHeight: '1.5', 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        display: 'inline-flex',
                        alignItems: 'center',
                        verticalAlign: 'middle'
                      }}>
                        {(() => {
                          if (accountConfigs.length === 0) {
                            return 'No Data';
                          }
                          if (validSelectedAccountsCount === 0) {
                            return 'Select Account';
                          }
                          if (validSelectedAccountsCount === 1) {
                            const selectedAccount = accountConfigs.find(account => account.accountName === selectedAccounts[0]);
                            return selectedAccount ? selectedAccount.accountName : 'Select Account';
                          }
                          // Select multiple Accounts and display "+X Accounts", where X is the total number of valid selections - 1 (because Icon represents 1 Account)
                          return `+${validSelectedAccountsCount - 1} ${'Accounts'}`;
                        })()}
                      </span>
                    </div>
                    <span className="text-gray-500" style={{ 
                      flexShrink: 0, 
                      fontSize: '0.9231em', 
                      lineHeight: '1.5',
                      display: 'inline-flex',
                      alignItems: 'center',
                      verticalAlign: 'middle'
                    }}>
                      {validSelectedAccountsCount > 0 ? `${validSelectedAccountsCount}/${accountConfigs.length}` : '0/0'}
                    </span>
                  </button>
                  
                  {accountSelectorVisible && (
                    <div
                      data-account-selector-dropdown
                      className="dashboard-scrollable absolute top-full left-0 z-[1000] bg-white text-[rgb(34,13,78)] rounded-md overflow-y-auto border border-gray-100 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] transform -translate-y-2.5 scale-95 opacity-0 transition-all duration-300 origin-top will-change-transform font-light leading-5 tracking-[0.0025em]"
                      style={{
                        fontFamily: '"Museo Sans", sans-serif',
                        fontSize: '0.8125rem', // 13px = 0.8125rem (relative unit, will scale with the browser)
                        minWidth: '17.5rem', // 280px = 17.5rem (relative unit, will scale with the browser)
                        maxHeight: '26.25rem' // 420px = 26.25rem (relative unit, will scale with the browser)
                      }}
                    >
                      {/* search box */}
                      <div className="px-4 py-2 border-b border-gray-100">
                        <input
                          type="text"
                          placeholder={'Search Accounts...'}
                          value={accountSearchText}
                          onChange={(e) => setAccountSearchText(e.target.value)}
                          className="outline-0 border-0 bg-transparent m-0 block min-w-0 w-full h-auto py-1.5 pl-2 font-light text-sm leading-[18px] text-[rgb(34,13,78)] select-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                          style={{
                            fontFamily: '"Museo Sans", sans-serif',
                            letterSpacing: '0.005em',
                            fontWeight: 300
                          }}
                        />
                      </div>
                      
                      <div className="px-4 py-2 border-b border-gray-100">
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[rgb(34,13,78)] select-none" style={{ fontSize: '0.8125rem' }}>
                              {'Select Account'}
                            </span>
                            <button
                              onClick={() => {
                                if (validFilteredSelectedAccountsCount === filteredAccountConfigs.length) {
                                  // If all are selected, select the first option (at least one must be selected)
                                  setSelectedAccounts(filteredAccountConfigs.length > 0 ? [filteredAccountConfigs[0].accountName] : []);
                                } else {
                                  // Otherwise select all filtered list
                                  setSelectedAccounts(filteredAccountConfigs.map(config => config.accountName));
                                }
                              }}
                              className={`px-1.5 py-0.5 text-[10px] border border-gray-300 rounded-sm cursor-pointer transition-all duration-200 select-none font-medium flex items-center justify-center ${
                                validFilteredSelectedAccountsCount === filteredAccountConfigs.length
                                  ? 'bg-gray-600 text-white hover:bg-gray-700' 
                                  : 'bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-400'
                              }`}
                            >
                              {'Select All'}
                            </button>
                          </div>
                          <span className="text-xs text-gray-500 select-none">
                            {accountConfigs.length > 0 ? `${validSelectedAccountsCount}/${accountConfigs.length}` : '0/0'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="dashboard-scrollable max-h-[200px] overflow-y-auto px-2 py-2">
                        {filteredAccountConfigs.length === 0 ? (
                          <div className="py-8 px-4 text-center">
                            <div className="text-sm text-gray-400 font-light">
                              No Data
                            </div>
                          </div>
                        ) : (
                          filteredAccountConfigs.map((config, index) => (
                            <div
                              key={config.id}
                              onClick={() => {
                                // If the current item is selected and there is only one valid selection left, deselection is not allowed
                                const isCurrentlySelected = selectedAccounts.includes(config.accountName) && filteredAccountConfigs.some(acc => acc.accountName === config.accountName);
                                if (isCurrentlySelected && validFilteredSelectedAccountsCount === 1) {
                                  return;
                                }
                                
                                const newSelectedAccounts = selectedAccounts.includes(config.accountName)
                                  ? selectedAccounts.filter(name => name !== config.accountName)
                                  : [...selectedAccounts, config.accountName];
                                setSelectedAccounts(newSelectedAccounts);
                              }}
                              className={`my-1 mx-0 py-2.5 px-4 flex items-center gap-3 border border-white rounded-md transition-colors duration-200 select-none ${
                                (() => {
                                  const isCurrentlySelected = selectedAccounts.includes(config.accountName) && filteredAccountConfigs.some(acc => acc.accountName === config.accountName);
                                  return isCurrentlySelected && validFilteredSelectedAccountsCount === 1;
                                })()
                                  ? 'cursor-not-allowed opacity-70'
                                  : 'cursor-pointer'
                              } ${
                                selectedAccounts.includes(config.accountName)
                                  ? 'bg-gray-100 border-gray-200'
                                  : 'bg-white hover:bg-gray-50 hover:border-gray-200'
                              }`}
                            >
                              <div className="w-6 h-6 rounded-sm flex items-center justify-center overflow-hidden flex-shrink-0 bg-[rgba(0,0,0,0.04)]">
                                {config.icon ? (
                                  <img 
                                    src={config.icon} 
                                    alt={config.accountName}
                                    draggable={false}
                                    className="w-full h-full object-cover rounded-sm select-none pointer-events-none"
                                    style={{ 
                                      WebkitUserSelect: 'none',
                                      MozUserSelect: 'none',
                                      msUserSelect: 'none',
                                      WebkitTouchCallout: 'none'
                                    }}
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                                      if (nextElement) {
                                        nextElement.style.display = 'flex';
                                      }
                                    }}
                                  />
                                ) : null}
                                <div 
                                  className="flex items-center justify-center"
                                  style={{
                                    display: config.icon ? 'none' : 'flex',
                                    width: '1.125rem',
                                    height: '1.125rem',
                                    background: 'rgba(0, 0, 0, 0.1)',
                                    borderRadius: '0.1875rem',
                                    fontSize: '0.5625rem',
                                    color: 'rgba(0, 0, 0, 0.4)'
                                  }}
                                >
                                  {config.accountName ? config.accountName.substring(0, 2).toUpperCase() : 'AC'}
                                </div>
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="font-normal text-[rgb(34,13,78)] mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: '0.8125rem' }}>
                                  {config.accountName}
                                </div>
                                <div className="text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: '0.6875rem' }}>
                                  {config.accountType}
                                </div>
                              </div>
                              
                              {selectedAccounts.includes(config.accountName) && (
                                <div className="w-4 h-4 bg-gray-600 rounded-sm flex items-center justify-center flex-shrink-0">
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="text-white">
                                    <path d="M1 4L4 7L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* App selector */}
                <div className="relative" data-app-selector>
                  <button
                    onClick={() => {
                      // Close other selectors
                      setOfferSelectorVisible(false);
                      setAccountSelectorVisible(false);
                      setDateSelectorVisible(false);
                      setAppSelectorVisible(!appSelectorVisible);
                      if (!appSelectorVisible) {
                        setAppSearchText(''); // Clear search text when opening
                      }
                    }}
                    className="flex items-center gap-2 border border-gray-300 rounded-md bg-white cursor-pointer font-light text-[rgb(34,13,78)] justify-between transition-all duration-200 select-none hover:bg-gray-50 hover:border-gray-400"
                    style={{
                      fontFamily: '"Museo Sans", sans-serif',
                      boxSizing: 'border-box',
                      fontSize: '0.8125rem', // 13px = 0.8125rem (as a baseline, all internal elements use em units)
                      lineHeight: '1.5', // Uniform row heights to ensure vertical alignment
                      width: '12.5rem', // Restore fixed width
                      minWidth: '12.5rem',
                      maxWidth: '12.5rem',
                      padding: '0.5em 0.75em', // Use em units, relative to fontSize
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      verticalAlign: 'middle'
                    }}
                  >
                    <div className="flex items-center flex-1 min-w-0" style={{ 
                      gap: '0.375em',
                      alignItems: 'center',
                      lineHeight: '1.5'
                    }}>
                      <div className="rounded-sm flex items-center justify-center overflow-hidden flex-shrink-0 bg-[rgba(0,0,0,0.04)]" style={{
                        width: '1.2308em', // 16px / 13px = 1.2308em (relative to the button’s fontSize)
                        height: '1.2308em',
                        minWidth: '1.2308em',
                        minHeight: '1.2308em',
                        maxWidth: '1.2308em',
                        maxHeight: '1.2308em',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        verticalAlign: 'middle',
                        lineHeight: '1'
                      }}>
                        {(() => {
                          let displayApp: AppConfig | undefined;
                          if (selectedApps.length === 1) {
                            displayApp = appConfigs.find(app => app.appId === selectedApps[0]);
                          } else if (selectedApps.length > 1) {
                            // When multiple selections are made, Apps with custom icons will be displayed first.
                            const selectedAppConfigs = appConfigs.filter(app => selectedApps.includes(app.appId));
                            displayApp = selectedAppConfigs.find(app => app.icon) || selectedAppConfigs[0];
                          }
                          
                          if (displayApp) {
                            return (
                              <>
                                {displayApp.icon ? (
                                  <img 
                                    src={displayApp.icon} 
                                    alt={displayApp.appName}
                                    draggable={false}
                                    className="w-full h-full object-cover rounded-sm select-none pointer-events-none"
                                    style={{ 
                                      WebkitUserSelect: 'none',
                                      MozUserSelect: 'none',
                                      msUserSelect: 'none',
                                      WebkitTouchCallout: 'none'
                                    }}
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                                      if (nextElement) {
                                        nextElement.style.display = 'flex';
                                      }
                                    }}
                                  />
                                ) : null}
                                <div 
                                  className="flex items-center justify-center"
                                  style={{
                                    display: displayApp.icon ? 'none' : 'flex',
                                    width: '1.0769em',
                                    height: '1.0769em',
                                    background: 'rgba(0, 0, 0, 0.1)',
                                    borderRadius: '0.2308em',
                                    fontSize: '0.6154em',
                                    color: 'rgba(0, 0, 0, 0.4)'
                                  }}
                                >
                                  {displayApp.appName ? displayApp.appName.charAt(0).toUpperCase() : 'A'}
                                </div>
                              </>
                            );
                          }
                          // Default icon (when there is no data or no App is selected): only transparent + text, consistent AC/AP format, no middle dark gray layer; letters are completely centered relative to the outer frame (vertical fine-tuning to compensate for font measurement)
                          return (
                            <div 
                              className="flex items-center justify-center"
                              style={{
                                width: '1.0769em',
                                height: '1.0769em',
                                background: 'transparent',
                                borderRadius: '0.2308em',
                                fontSize: '0.6154em',
                                lineHeight: 1,
                                color: 'rgba(0, 0, 0, 0.4)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                textAlign: 'center',
                                padding: 0
                              }}
                            >
                              <span style={{ display: 'block', lineHeight: 1, transform: 'translateY(0.08em)' }}>AP</span>
                            </div>
                          );
                        })()}
                      </div>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap" style={{ 
                        fontSize: '1em', 
                        lineHeight: '1.5',
                        display: 'inline-flex',
                        alignItems: 'center',
                        verticalAlign: 'middle'
                      }}>
                        {getAppSelectorText()}
                      </span>
                    </div>
                    <span className="text-gray-500" style={{ 
                      flexShrink: 0, 
                      fontSize: '0.9231em', 
                      lineHeight: '1.5',
                      display: 'inline-flex',
                      alignItems: 'center',
                      verticalAlign: 'middle'
                    }}>
                      {validSelectedAppsCount > 0 ? `${validSelectedAppsCount}/${appConfigs.length}` : '0/0'}
                    </span>
                  </button>
                  
                  {appSelectorVisible && (
                    <div
                      data-app-selector-dropdown
                      className="dashboard-scrollable absolute top-full left-0 z-[1000] bg-white text-[rgb(34,13,78)] rounded-md overflow-y-auto border border-gray-100 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] transform -translate-y-2.5 scale-95 opacity-0 transition-all duration-300 origin-top will-change-transform font-light leading-5 tracking-[0.0025em]"
                      style={{
                        fontFamily: '"Museo Sans", sans-serif',
                        fontSize: '0.8125rem', // 13px = 0.8125rem (relative unit, will scale with the browser)
                        width: '17.5rem', // Fixed width to avoid the gradual narrowing of the drop-down due to content rearrangement during search filtering
                        minWidth: '17.5rem', // 280px = 17.5rem (relative unit, will scale with the browser)
                        maxWidth: 'calc(100vw - 6rem)', // Consistent with Campaign to avoid overflow on small screens
                        maxHeight: '26.25rem' // 420px = 26.25rem (relative unit, will scale with the browser)
                      }}
                    >
                      {/* search box */}
                      <div className="px-4 py-2 border-b border-gray-100">
                        <input
                          type="text"
                          placeholder={'Search Apps...'}
                          value={appSearchText}
                          onChange={(e) => setAppSearchText(e.target.value)}
                          className="outline-0 border-0 bg-transparent m-0 block min-w-0 w-full h-auto py-1.5 pl-2 font-light text-sm leading-[18px] text-[rgb(34,13,78)] select-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                          style={{
                            fontFamily: '"Museo Sans", sans-serif',
                            letterSpacing: '0.005em',
                            fontWeight: 300
                          }}
                        />
                      </div>
                      
                      <div className="px-4 py-2 border-b border-gray-100">
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[rgb(34,13,78)] select-none" style={{ fontSize: '0.8125rem' }}>
                              {'Select APP'}
                            </span>
                            <button
                              onClick={() => {
                                if (validFilteredSelectedAppsCount === filteredAppConfigs.length) {
                                  // If all are selected, select the first option (at least one must be selected)
                                  setSelectedApps(filteredAppConfigs.length > 0 ? [filteredAppConfigs[0].appId] : []);
                                } else {
                                  // Otherwise select all filtered list
                                  setSelectedApps(filteredAppConfigs.map(app => app.appId));
                                }
                              }}
                              className={`px-1.5 py-0.5 text-[10px] border border-gray-300 rounded-sm cursor-pointer transition-all duration-200 select-none font-medium flex items-center justify-center ${
                                validFilteredSelectedAppsCount === filteredAppConfigs.length
                                  ? 'bg-gray-600 text-white hover:bg-gray-700' 
                                  : 'bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-400'
                              }`}
                            >
                              {'Select All'}
                            </button>
                          </div>
                          <span className="text-xs text-gray-500 select-none">
                            {appConfigs.length > 0 ? `${validSelectedAppsCount}/${appConfigs.length}` : '0/0'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="dashboard-scrollable max-h-[200px] overflow-y-auto px-2 py-2">
                        {filteredAppConfigs.length === 0 ? (
                          <div className="py-8 px-4 text-center">
                            <div className="text-sm text-gray-400 font-light">
                              No Data
                            </div>
                          </div>
                        ) : (
                          filteredAppConfigs.map((app, index) => (
                            <div
                              key={app.id}
                              onClick={() => {
                                // If the current item is selected and there is only one selection left, deselection is not allowed
                                if (selectedApps.includes(app.appId) && selectedApps.length === 1) {
                                  return;
                                }
                                
                                const newSelectedApps = selectedApps.includes(app.appId)
                                  ? selectedApps.filter(id => id !== app.appId)
                                  : [...selectedApps, app.appId];
                                setSelectedApps(newSelectedApps);
                              }}
                              className={`my-1 mx-0 py-2.5 px-4 flex items-center gap-3 border border-white rounded-md transition-colors duration-200 select-none ${
                                selectedApps.includes(app.appId) && selectedApps.length === 1
                                  ? 'cursor-not-allowed opacity-70'
                                  : 'cursor-pointer'
                              } ${
                                selectedApps.includes(app.appId)
                                  ? 'bg-gray-100 border-gray-200'
                                  : 'bg-white hover:bg-gray-50 hover:border-gray-200'
                              }`}
                            >
                              <div className="w-6 h-6 rounded-sm flex items-center justify-center overflow-hidden flex-shrink-0 bg-[rgba(0,0,0,0.04)]">
                                {app.icon ? (
                                  <img 
                                    src={app.icon} 
                                    alt={app.appName}
                                    draggable={false}
                                    className="w-full h-full object-cover rounded-sm select-none pointer-events-none"
                                    style={{ 
                                      WebkitUserSelect: 'none',
                                      MozUserSelect: 'none',
                                      msUserSelect: 'none',
                                      WebkitTouchCallout: 'none'
                                    }}
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                                      if (nextElement) {
                                        nextElement.style.display = 'flex';
                                      }
                                    }}
                                  />
                                ) : null}
                                <div 
                                  className="flex items-center justify-center"
                                  style={{
                                    display: app.icon ? 'none' : 'flex',
                                    width: '1.125rem',
                                    height: '1.125rem',
                                    background: 'rgba(0, 0, 0, 0.1)',
                                    borderRadius: '0.1875rem',
                                    fontSize: '0.5625rem',
                                    color: 'rgba(0, 0, 0, 0.4)'
                                  }}
                                >
                                  {app.appName ? app.appName.charAt(0).toUpperCase() : 'A'}
                                </div>
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="font-normal text-[rgb(34,13,78)] mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: '0.8125rem' }}>
                                  {app.appName}
                                </div>
                                <div className="text-[11px] text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis">
                                  {app.appId}
                                </div>
                              </div>
                              
                              {selectedApps.includes(app.appId) && (
                                <div className="w-4 h-4 bg-gray-600 rounded-sm flex items-center justify-center flex-shrink-0">
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="text-white">
                                    <path d="M1 4L4 7L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Offer selector */}
                <div className="relative" data-offer-selector>
                  <button
                    onClick={() => {
                      const wasVisible = offerSelectorVisible;
                      setOfferSelectorVisible(!offerSelectorVisible);
                      if (!wasVisible) {
                        setOfferSearchText(''); // Clear search text when opening
                        // Note: The default selection-all logic has been processed in useEffect and does not need to be set again here.
                      }
                      // Close other selectors
                      setAppSelectorVisible(false);
                      setAccountSelectorVisible(false);
                      setDateSelectorVisible(false);
                    }}
                    className="flex items-center gap-2 border border-gray-300 rounded-md bg-white cursor-pointer font-light text-[rgb(34,13,78)] justify-between transition-all duration-200 select-none hover:bg-gray-50 hover:border-gray-400"
                    style={{
                      fontFamily: '"Museo Sans", sans-serif',
                      boxSizing: 'border-box',
                      fontSize: '0.8125rem', // 13px = 0.8125rem (as a baseline, all internal elements use em units)
                      lineHeight: '1.5', // Uniform row heights to ensure vertical alignment
                      width: '12.5rem', // 200px = 12.5rem (relative unit, will scale with the browser)
                      minWidth: '12.5rem',
                      maxWidth: '12.5rem',
                      padding: '0.5em 0.75em', // Use em units, relative to fontSize
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      verticalAlign: 'middle'
                    }}
                  >
                    <div className="flex items-center flex-1 min-w-0" style={{ 
                      gap: '0.375em',
                      alignItems: 'center',
                      lineHeight: '1.5'
                    }}>
                      <div className="rounded-sm flex items-center justify-center flex-shrink-0" style={{
                        width: '1.2308em', // 16px / 13px = 1.2308em (relative to the button’s fontSize)
                        height: '1.2308em',
                        minWidth: '1.2308em',
                        minHeight: '1.2308em',
                        maxWidth: '1.2308em',
                        maxHeight: '1.2308em',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        verticalAlign: 'middle',
                        lineHeight: '1'
                      }}>
                        <MdOutlineLocalOffer size={14} className="text-gray-600" style={{ width: '1.0769em', height: '1.0769em' }} />
                      </div>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap" style={{ 
                        fontSize: '1em', 
                        lineHeight: '1.5',
                        display: 'inline-flex',
                        alignItems: 'center',
                        verticalAlign: 'middle'
                      }}>
                        {getOfferSelectorText()}
                      </span>
                    </div>
                    <span className="text-gray-500" style={{ 
                      flexShrink: 0, 
                      fontSize: '0.9231em', 
                      lineHeight: '1.5',
                      display: 'inline-flex',
                      alignItems: 'center',
                      verticalAlign: 'middle'
                    }}>
                      {offerOptions.length > 0 ? `${validSelectedOffersCount}/${offerOptions.length}` : '0/0'}
                    </span>
                  </button>
                  
                  {offerSelectorVisible && (
                    <div
                      data-offer-selector-dropdown
                      className="dashboard-scrollable absolute top-full left-0 z-[1000] bg-white text-[rgb(34,13,78)] rounded-md overflow-y-auto border border-gray-100 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] transform -translate-y-2.5 scale-95 opacity-0 transition-all duration-300 origin-top will-change-transform font-light leading-5 tracking-[0.0025em]"
                      style={{
                        fontFamily: '"Museo Sans", sans-serif',
                        fontSize: '0.8125rem', // 13px = 0.8125rem (relative unit, will scale with the browser)
                        width: 'max-content',
                        maxWidth: 'calc(100vw - 6rem)', // Subtract the left and right padding of the container (3rem * 2)
                        minWidth: '16.6875rem', // 267px = 16.6875rem (relative unit, will scale with the browser)
                        maxHeight: '26.25rem' // 420px = 26.25rem (relative unit, will scale with the browser)
                      }}
                    >
                      {/* search box */}
                      <div className="px-4 py-2 border-b border-gray-100">
                        <input
                          type="text"
                          placeholder={'Search Campaigns...'}
                          value={offerSearchText}
                          onChange={(e) => setOfferSearchText(e.target.value)}
                          className="outline-0 border-0 bg-transparent m-0 block min-w-0 w-full h-auto py-1.5 pl-2 font-light text-sm leading-[18px] text-[rgb(34,13,78)] select-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                          style={{
                            fontFamily: '"Museo Sans", sans-serif',
                            letterSpacing: '0.005em',
                            fontWeight: 300
                          }}
                        />
                      </div>
                      
                      <div className="px-4 py-2 border-b border-gray-100">
                        <div className="flex justify-between items-center mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[rgb(34,13,78)] select-none" style={{ fontSize: '0.8125rem' }}>
                              {'Select Campaigns'}
                            </span>
                            <button
                              onClick={() => {
                                if (validFilteredSelectedOffersCount === filteredOfferOptions.length) {
                                  // If all are selected, select the first option (at least one must be selected)
                                  setSelectedOffers(filteredOfferOptions.length > 0 ? [filteredOfferOptions[0].id] : []);
                                } else {
                                  // Otherwise select all filtered list
                                  setSelectedOffers(filteredOfferOptions.map(offer => offer.id));
                                }
                              }}
                              className={`px-1.5 py-0.5 text-[10px] border border-gray-300 rounded-sm cursor-pointer transition-all duration-200 select-none font-medium flex items-center justify-center ${
                                validFilteredSelectedOffersCount === filteredOfferOptions.length
                                  ? 'bg-gray-600 text-white hover:bg-gray-700' 
                                  : 'bg-white text-gray-500 hover:bg-gray-50 hover:border-gray-400'
                              }`}
                            >
                              {'Select All'}
                            </button>
                          </div>
                          <span className="text-xs text-gray-500 select-none">
                            {offerOptions.length > 0 ? `${validSelectedOffersCount}/${offerOptions.length}` : '0/0'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="dashboard-scrollable max-h-[200px] overflow-y-auto px-2 py-2">
                        {filteredOfferOptions.length === 0 ? (
                          <div className="py-8 px-4 text-center">
                            <div className="text-sm text-gray-400 font-light">
                              No Data
                            </div>
                          </div>
                        ) : (
                          filteredOfferOptions.map((offer) => (
                            <div
                              key={offer.id}
                              onClick={() => {
                                // If the current item is selected and there is only one selection left, deselection is not allowed
                                if (selectedOffers.includes(offer.id) && selectedOffers.length === 1) {
                                  return;
                                }
                                
                                const newSelectedOffers = selectedOffers.includes(offer.id)
                                  ? selectedOffers.filter(id => id !== offer.id)
                                  : [...selectedOffers, offer.id];
                                setSelectedOffers(newSelectedOffers);
                              }}
                              className={`my-1 mx-0 py-2.5 px-4 flex items-center gap-3 border border-white rounded-md transition-colors duration-200 select-none ${
                                selectedOffers.includes(offer.id) && selectedOffers.length === 1
                                  ? 'cursor-not-allowed opacity-70'
                                  : 'cursor-pointer'
                              } ${
                                selectedOffers.includes(offer.id)
                                  ? 'bg-gray-100 border-gray-200'
                                  : 'bg-white hover:bg-gray-50 hover:border-gray-200'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-normal text-[rgb(34,13,78)] mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis" style={{ fontSize: '0.8125rem' }}>
                                  {offer.name}
                                </div>
                              </div>
                              
                              {selectedOffers.includes(offer.id) && (
                                <div className="w-4 h-4 bg-gray-600 rounded-sm flex items-center justify-center flex-shrink-0">
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="text-white">
                                    <path d="M1 4L4 7L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                {/* date picker */}
                <div className="relative" data-date-selector>
                  <button
                    onClick={() => {
                      // Close other selectors
                      setOfferSelectorVisible(false);
                      setAppSelectorVisible(false);
                      setAccountSelectorVisible(false);
                      setDateSelectorVisible(!dateSelectorVisible);
                      // Keeps the current date when opened and does not reset
                      if (!dateSelectorVisible) {
                        // Reset selection status to start date
                        setSelectingStartDate(true);
                        
                        // If there is no temporary date range currently, the current date range is used
                        if (!tempDateRange && dateRange) {
                          // Use the current date range, but make sure it doesn't include future dates
                          const today = dayjs().endOf('day');
                          let startDate = dateRange[0].isAfter(today) ? today.subtract(1, 'day') : dateRange[0];
                          let endDate = dateRange[1].isAfter(today) ? today.subtract(1, 'day') : dateRange[1];
                          
                          // Make sure the start date is not greater than the end date
                          if (startDate.isAfter(endDate)) {
                            [startDate, endDate] = [endDate, startDate];
                          }
                          
                          setTempDateRange([startDate, endDate]);
                          // Set the current month as the month of the starting date
                          setCurrentMonth(startDate.startOf('month'));
                        } else if (!tempDateRange) {
                          // If there is no dateRange, use yesterday as the default value
                          const yesterday = dayjs().subtract(1, 'day');
                          setTempDateRange([yesterday, yesterday]);
                          // Set the current month to yesterday's month
                          setCurrentMonth(yesterday.startOf('month'));
                        }
                      }
                    }}
                    className="flex items-center gap-2 border border-gray-300 rounded-md bg-white cursor-pointer font-light text-[rgb(34,13,78)] justify-between transition-all duration-200 select-none hover:bg-gray-50 hover:border-gray-400"
                    style={{
                      fontFamily: '"Museo Sans", sans-serif',
                      boxSizing: 'border-box',
                      fontSize: '0.8125rem', // 13px = 0.8125rem (as a baseline, all internal elements use em units)
                      lineHeight: '1.5', // Uniform row heights to ensure vertical alignment
                      width: isDashboardDateCompact ? '2.25rem' : undefined,
                      minWidth: isDashboardDateCompact ? '2.25rem' : '15rem', // 240px = 15rem
                      maxWidth: isDashboardDateCompact ? '2.25rem' : 'none',
                      padding: isDashboardDateCompact ? '0.5em' : '0.5em 0.75em',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      verticalAlign: 'middle'
                    }}
                  >
                    <div className="flex items-center flex-1 min-w-0" style={{ 
                      gap: '0.375em',
                      alignItems: 'center',
                      justifyContent: isDashboardDateCompact ? 'center' : 'flex-start',
                      lineHeight: '1.5'
                    }}>
                      <div className="rounded-sm flex items-center justify-center flex-shrink-0" style={{
                        width: '1.2308em', // 16px / 13px = 1.2308em (relative to the button’s fontSize)
                        height: '1.2308em',
                        minWidth: '1.2308em',
                        minHeight: '1.2308em',
                        maxWidth: '1.2308em',
                        maxHeight: '1.2308em',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        verticalAlign: 'middle',
                        lineHeight: '1'
                      }}>
                        <Calendar size={14} className="text-gray-600" style={{ width: '1.0769em', height: '1.0769em' }} />
                      </div>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap" style={{ 
                        fontSize: '1em', 
                        lineHeight: '1.5',
                        display: isDashboardDateCompact ? 'none' : 'inline-flex',
                        alignItems: 'center',
                        verticalAlign: 'middle'
                      }}>
                        {(() => {
                          const currentRange = tempDateRange || dateRange;
                          
                          if (currentRange) {
                            return `${currentRange[0].format('YYYY-MM-DD')} TO ${currentRange[1].format('YYYY-MM-DD')}`;
                          }
                          return 'Select Date Range';
                        })()}
                      </span>
                    </div>
                    {!isDashboardDateCompact && (
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      className="flex-shrink-0 text-gray-500"
                      style={{
                        transform: dateSelectorVisible ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                        width: '0.9231em', // 12px / 13px = 0.9231em (relative to the button’s fontSize)
                        height: '0.9231em',
                        minWidth: '0.9231em',
                        minHeight: '0.9231em',
                        maxWidth: '0.9231em',
                        maxHeight: '0.9231em',
                        display: 'inline-block',
                        verticalAlign: 'middle'
                      }}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
                    </svg>
                    )}
                  </button>
                  
                  {dateSelectorVisible && (
                    <div
                      data-date-selector-dropdown
                      className="absolute right-0 z-[1004] bg-white text-gray-800 rounded border border-gray-200 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] w-[560px] top-full mt-1 transform -translate-y-2.5 scale-95 opacity-0 transition-all duration-300 origin-top will-change-transform"
                      style={{
                        padding: '12px',
                        display: 'flex',
                        gap: '12px',
                        maxHeight: '400px',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Preset options on the left */}
                      <div className="quick-select-section">
                        <div className="quick-select-title">
                          Quick Select
                        </div>
                        <div className="quick-select-options">
                          {[
                            { value: 'today', label: 'Today' },
                            { value: 'yesterday', label: 'Yesterday' },
                            { value: 'last7days', label: 'Last 7 days' },
                            { value: 'lastWeek', label: 'Last week' },
                            { value: 'last30days', label: 'Last 30 days' },
                            { value: 'lastMonth', label: 'Last month' },
                            { value: 'thisMonth', label: 'This month' }
                          ].map((option) => (
                            <div
                              key={option.value}
                              className="quick-select-option"
                              onClick={() => handleQuickSelect(option.value)}
                            >
                              {option.label}
                            </div>
                          ))}
                        </div>
                        
                        {/* Apply and cancel buttons */}
                        <div className="flex gap-1.5 mt-3">
                          <button
                            onClick={() => {
                              if (tempDateRange) {
                                setDateRange(tempDateRange);
                                setIsCustomRange(true);
                                setDateSelectorVisible(false);
                                setTempDateRange(null);
                              } else if (dateRange) {
                                // If there is already a date range but no temporary range, apply it directly
                                setIsCustomRange(true);
                                setDateSelectorVisible(false);
                              } else {
                                // If there is no date range, set to Yesterday
                                const yesterday = dayjs().subtract(1, 'day');
                                setDateRange([yesterday, yesterday]);
                                setIsCustomRange(true);
                                setDateSelectorVisible(false);
                              }
                            }}
                            className="date-picker-apply-button"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => {
                              setDateSelectorVisible(false);
                              setTempDateRange(null);
                              // If no custom selection is made, reset to Yesterday
                              if (!isCustomRange) {
                                const yesterday = dayjs().subtract(1, 'day');
                                setDateRange([yesterday, yesterday]);
                              }
                            }}
                            className="date-picker-cancel-button"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                      
                      {/* Custom date input on the right */}
                      <div className="custom-date-section">
                        {/* Date range display */}
                        <div className="date-range-display">
                          {/* start date range */}
                          <div 
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              backgroundColor: selectingStartDate ? 'rgb(249, 250, 251)' : 'transparent',
                              border: selectingStartDate ? '2px solid rgb(55, 65, 81)' : '2px solid transparent',
                              transition: 'all 0.2s ease',
                              textAlign: 'center',
                              position: 'relative',
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                              MozUserSelect: 'none',
                              msUserSelect: 'none'
                            }}
                            onClick={() => {
                              setSelectingStartDate(true);
                              // If there is currently no temporary date range, initialize a default range
                              if (!tempDateRange) {
                                const today = dayjs();
                                setTempDateRange([today, today]);
                              }
                            }}
                            onMouseEnter={(e) => {
                              if (!selectingStartDate) {
                                e.currentTarget.style.backgroundColor = 'rgb(249, 250, 251)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!selectingStartDate) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                          >
                            <div style={{ 
                              fontSize: '10px', 
                              fontFamily: '"Museo Sans", sans-serif',
                              color: 'rgb(107, 114, 128)',
                              marginBottom: '2px',
                              fontWeight: selectingStartDate ? 'bold' : 'normal',
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                              MozUserSelect: 'none',
                              msUserSelect: 'none'
                            }}>
                              Start Date
                            </div>
                            <div style={{ 
                              fontFamily: '"Museo Sans", sans-serif',
                              fontWeight: selectingStartDate ? 'bold' : 'normal',
                              color: 'rgb(31, 41, 55)',
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                              MozUserSelect: 'none',
                              msUserSelect: 'none'
                            }}>
                              {(() => {
                                const currentRange = tempDateRange || dateRange;
                                return currentRange ? currentRange[0].format('YYYY-MM-DD') : 'YYYY-MM-DD';
                              })()}
                            </div>
                          </div>
                          
                          {/* delimiter */}
                          <div style={{ 
                            padding: '0 8px', 
                            color: 'rgb(156, 163, 175)',
                            fontSize: '16px',
                            fontFamily: '"Museo Sans", sans-serif',
                            fontWeight: 'bold',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none'
                          }}>
                            →
                          </div>
                          
                          {/* end date area */}
                          <div 
                            style={{
                              flex: 1,
                              padding: '6px 8px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              backgroundColor: !selectingStartDate ? 'rgb(249, 250, 251)' : 'transparent',
                              border: !selectingStartDate ? '2px solid rgb(55, 65, 81)' : '2px solid transparent',
                              transition: 'all 0.2s ease',
                              textAlign: 'center',
                              position: 'relative',
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                              MozUserSelect: 'none',
                              msUserSelect: 'none'
                            }}
                            onClick={() => {
                              setSelectingStartDate(false);
                              // If there is currently no temporary date range, initialize a default range
                              if (!tempDateRange) {
                                const today = dayjs();
                                setTempDateRange([today, today]);
                              }
                            }}
                            onMouseEnter={(e) => {
                              if (selectingStartDate) {
                                e.currentTarget.style.backgroundColor = 'rgb(249, 250, 251)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (selectingStartDate) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                          >
                            <div style={{ 
                              fontSize: '10px', 
                              fontFamily: '"Museo Sans", sans-serif',
                              color: 'rgb(107, 114, 128)',
                              marginBottom: '2px',
                              fontWeight: !selectingStartDate ? 'bold' : 'normal',
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                              MozUserSelect: 'none',
                              msUserSelect: 'none'
                            }}>
                              End Date
                            </div>
                            <div style={{ 
                              fontFamily: '"Museo Sans", sans-serif',
                              fontWeight: !selectingStartDate ? 'bold' : 'normal',
                              color: 'rgb(31, 41, 55)',
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                              MozUserSelect: 'none',
                              msUserSelect: 'none'
                            }}>
                              {(() => {
                                const currentRange = tempDateRange || dateRange;
                                return currentRange ? currentRange[1].format('YYYY-MM-DD') : 'YYYY-MM-DD';
                              })()}
                            </div>
                          </div>
                        </div>
                        
                        {/* month selector */}
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: '8px'
                          }}>
                            <button
                              onClick={() => handleMonthChange('prev')}
                              style={{
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: '16px',
                                color: 'rgb(107, 114, 128)',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                MozUserSelect: 'none',
                                msUserSelect: 'none',
                                transition: 'color 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'rgb(55, 65, 81)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'rgb(107, 114, 128)';
                              }}
                            >
                              ‹
                            </button>
                            <span style={{ 
                              fontSize: '14px', 
                              fontWeight: '500',
                              color: 'rgb(31, 41, 55)',
                              fontFamily: '"Museo Sans", sans-serif',
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                              MozUserSelect: 'none',
                              msUserSelect: 'none'
                            }}>
                              {currentMonth.startOf('month').format('MMMM YYYY')}
                            </span>
                            <button
                              onClick={() => handleMonthChange('next')}
                              style={{
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: '16px',
                                color: 'rgb(107, 114, 128)',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                MozUserSelect: 'none',
                                msUserSelect: 'none',
                                transition: 'color 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'rgb(55, 65, 81)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'rgb(107, 114, 128)';
                              }}
                            >
                              ›
                            </button>
                          </div>
                          
                          {/* calendar grid */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: '4px',
                            paddingBottom: '12px'
                          }}>
                            {/* week title */}
                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                              <div key={`weekday-${index}`} style={{
                                textAlign: 'center',
                                fontSize: '12px',
                                fontFamily: '"Museo Sans", sans-serif',
                                color: 'rgb(156, 163, 175)',
                                padding: '6px 4px',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                MozUserSelect: 'none',
                                msUserSelect: 'none'
                              }}>
                                {day}
                              </div>
                            ))}
                            
                            {/* date grid */}
                            {(() => {
                              try {
                                const displayMonth = currentMonth.startOf('month');
                                const startOfMonth = displayMonth.clone();
                                const endOfMonth = displayMonth.endOf('month');
                              const startOfWeek = startOfMonth.startOf('week');
                              const endOfWeek = endOfMonth.endOf('week');
                              
                              const days = [];
                              let day = startOfWeek;
                                let maxDays = 42; // Up to 6 weeks to prevent infinite loops
                                let dayCount = 0;
                              
                                while ((day.isBefore(endOfWeek) || day.isSame(endOfWeek, 'day')) && dayCount < maxDays) {
                                // Use local constants to prevent references in closures from being modified by subsequent loops
                                  const cellDate = day.clone();
                                  const isCurrentMonth = cellDate.isSame(displayMonth, 'month');
                                const isToday = cellDate.isSame(dayjs(), 'day');
                                // Temporary date ranges are used first, or the applied date range is used if there is no temporary range.
                                const currentDateRange = tempDateRange || dateRange;
                                const isStartDate = currentDateRange && currentDateRange[0] && cellDate.isSame(currentDateRange[0], 'day');
                                const isEndDate = currentDateRange && currentDateRange[1] && cellDate.isSame(currentDateRange[1], 'day');
                                const isSameDay = currentDateRange && currentDateRange[0] && currentDateRange[1] && 
                                  currentDateRange[0].isSame(currentDateRange[1], 'day') && cellDate.isSame(currentDateRange[0], 'day');
                                const isInRange = currentDateRange && currentDateRange[0] && currentDateRange[1] && 
                                  cellDate.isAfter(currentDateRange[0]) && cellDate.isBefore(currentDateRange[1]);
                                const isSelected = isStartDate || isEndDate || isSameDay;
                                  const isDisabled = cellDate.isAfter(dayjs().endOf('day'));
                                
                                days.push(
                                  <div
                                    key={cellDate.format('YYYY-MM-DD')}
                                      className="calendar-date-cell"
                                    onClick={() => {
                                        try {
                                      if (!isDisabled) {
                                            // Make sure tempDateRange exists, initialize if not
                                            if (!tempDateRange) {
                                              setTempDateRange([cellDate, cellDate]);
                                              // After initialization, switch to select end date state
                                              setSelectingStartDate(false);
                                              return;
                                            }
                                            
                                        // Set start or end date based on current selection status
                                        if (selectingStartDate) {
                                          // Select start date
                                          if (tempDateRange && tempDateRange[1]) {
                                            // If there is already an end date, check if the new start date is before the end date
                                            if (cellDate.isAfter(tempDateRange[1])) {
                                                  // If the new start date is after the end date, set the new date to the start date and the end date to the new date
                                                  setTempDateRange([cellDate, cellDate]);
                                            } else {
                                              setTempDateRange([cellDate, tempDateRange[1]]);
                                            }
                                          } else {
                                                // There is no end date, set to the start date, and set to the end date (same day)
                                            setTempDateRange([cellDate, cellDate]);
                                          }
                                              // Only updates the month if the selected date is not in the currently displayed month
                                              if (!cellDate.isSame(currentMonth, 'month')) {
                                                setCurrentMonth(cellDate.startOf('month'));
                                          }
                                          // After selecting the start date, it will automatically switch to selecting the end date.
                                          setSelectingStartDate(false);
                                        } else {
                                          // Select end date
                                          if (tempDateRange && tempDateRange[0]) {
                                            // If there is already a start date, check if the new end date is after the start date
                                            if (cellDate.isBefore(tempDateRange[0])) {
                                              // If the new end date is before the start date, swap places
                                              setTempDateRange([cellDate, tempDateRange[0]]);
                                                  // Only updates the month if the selected date is not in the currently displayed month
                                                  if (!cellDate.isSame(currentMonth, 'month')) {
                                                    setCurrentMonth(cellDate.startOf('month'));
                                                  }
                                                  // Switch to select start date state
                                                  setSelectingStartDate(true);
                                            } else {
                                              setTempDateRange([tempDateRange[0], cellDate]);
                                                  // Only updates the month if the selected date is not in the currently displayed month
                                                  if (!cellDate.isSame(currentMonth, 'month')) {
                                                    setCurrentMonth(cellDate.startOf('month'));
                                                  }
                                                  // After selecting the end date, it automatically switches to the state of selecting the start date.
                                                  setSelectingStartDate(true);
                                            }
                                          } else {
                                                // No start date, set to end date, and set to start date (same day)
                                            setTempDateRange([cellDate, cellDate]);
                                                // Only updates the month if the selected date is not in the currently displayed month
                                                if (!cellDate.isSame(currentMonth, 'month')) {
                                                  setCurrentMonth(cellDate.startOf('month'));
                                          }
                                                // After selecting the end date, it automatically switches to the state of selecting the start date.
                                          setSelectingStartDate(true);
                                        }
                                            }
                                          }
                                        } catch (error) {
                                          // Error handled silently
                                      }
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      textAlign: 'center',
                                        padding: '6px 4px',
                                      fontSize: '13px',
                                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                                      borderRadius: '4px',
                                      userSelect: 'none',
                                      WebkitUserSelect: 'none',
                                      MozUserSelect: 'none',
                                      msUserSelect: 'none',
                                        position: 'relative',
                                      backgroundColor: (() => {
                                          if (isSameDay) return 'rgb(55, 65, 81)';
                                          if (isStartDate) return 'rgb(75, 85, 99)';
                                          if (isEndDate) return 'rgb(75, 85, 99)';
                                          if (isInRange) return 'rgb(243, 244, 246)';
                                        return 'transparent';
                                      })(),
                                      color: (() => {
                                        if (isSelected) return 'white';
                                          if (isDisabled) return 'rgb(209, 213, 219)';
                                          if (isCurrentMonth) return 'rgb(31, 41, 55)';
                                          return 'rgb(209, 213, 219)';
                                      })(),
                                      fontWeight: isToday ? 'bold' : 'normal',
                                      border: (() => {
                                          if (isToday) return '1px solid rgb(55, 65, 81)';
                                          if (isSameDay) return '2px solid rgb(55, 65, 81)';
                                          if (isStartDate) return '2px solid rgb(55, 65, 81)';
                                          if (isEndDate) return '2px solid rgb(55, 65, 81)';
                                          return '2px solid transparent';
                                      })(),
                                      transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isDisabled) {
                                        if (isSameDay) {
                                            e.currentTarget.style.backgroundColor = 'rgb(31, 41, 55)';
                                        } else if (isStartDate) {
                                            e.currentTarget.style.backgroundColor = 'rgb(55, 65, 81)';
                                        } else if (isEndDate) {
                                            e.currentTarget.style.backgroundColor = 'rgb(55, 65, 81)';
                                        } else {
                                            e.currentTarget.style.backgroundColor = 'rgb(229, 231, 235)';
                                        }
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isDisabled) {
                                        if (isSameDay) {
                                            e.currentTarget.style.backgroundColor = 'rgb(55, 65, 81)';
                                        } else if (isStartDate) {
                                            e.currentTarget.style.backgroundColor = 'rgb(75, 85, 99)';
                                        } else if (isEndDate) {
                                            e.currentTarget.style.backgroundColor = 'rgb(75, 85, 99)';
                                        } else if (isInRange) {
                                            e.currentTarget.style.backgroundColor = 'rgb(243, 244, 246)';
                                        } else {
                                          e.currentTarget.style.backgroundColor = 'transparent';
                                        }
                                      }
                                    }}
                                  >
                                      <div className="calendar-date-text" style={{ position: 'relative', width: '100%', height: '100%' }}>
                                      {cellDate.format('D')}
                                      </div>
                                      {isStartDate && !isSameDay && (
                                        <div 
                                          className="date-marker date-marker-start"
                                          style={{
                                          position: 'absolute',
                                            top: '2px',
                                            right: '2px',
                                            fontSize: '9px',
                                          fontWeight: 'bold',
                                            color: 'rgb(255, 255, 255)',
                                            lineHeight: '1',
                                          userSelect: 'none',
                              WebkitUserSelect: 'none',
                              MozUserSelect: 'none',
                                            msUserSelect: 'none',
                                            pointerEvents: 'none',
                                            zIndex: 10
                                          }}
                                        >
                                          S
                                        </div>
                                      )}
                                      {isEndDate && !isSameDay && (
                                        <div 
                                          className="date-marker date-marker-end"
                                          style={{
                                          position: 'absolute',
                                            top: '2px',
                                            right: '2px',
                                            fontSize: '9px',
                                          fontWeight: 'bold',
                                            color: 'rgb(255, 255, 255)',
                                            lineHeight: '1',
                                          userSelect: 'none',
                              WebkitUserSelect: 'none',
                              MozUserSelect: 'none',
                                            msUserSelect: 'none',
                                            pointerEvents: 'none',
                                            zIndex: 10
                                          }}
                                        >
                                          E
                                        </div>
                                      )}
                                  </div>
                                );
                                
                                day = day.add(1, 'day');
                                  dayCount++;
                              }
                              
                              return days;
                              } catch (error) {
                                return [];
                              }
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
            </div>
          </div>
        </div>

        {/* Statistics cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* Installs Card */}
          <div className="relative overflow-hidden rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 opacity-30 pointer-events-none"></div>
            <div className="relative p-6">
              <div className="flex justify-between gap-3" style={{ minHeight: '108px' }}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-3" style={{ height: '60px' }}>
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 shadow-sm flex-shrink-0">
                      <Download className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-100 rounded-md border border-gray-200">
                      UA
                    </span>
                  </div>
                  <div className="mt-3 flex items-center" style={{ height: '48px', minHeight: '48px' }}>
                    <p className="text-sm font-medium text-gray-600">Installations</p>
                  </div>
                </div>
                <DashboardStatMetricBlock
                  loading={statisticsLoading}
                  series={dailyData.installs}
                  value={statistics.installs}
                />
              </div>
            </div>
          </div>

          {/* Events Card */}
          <div className="relative overflow-hidden rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 opacity-30 pointer-events-none"></div>
            <div className="relative p-6">
              <div className="flex justify-between gap-3" style={{ minHeight: '108px' }}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-3" style={{ height: '60px' }}>
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 shadow-sm flex-shrink-0">
                      <Activity className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-100 rounded-md border border-gray-200">
                      UA
                    </span>
                  </div>
                  <div className="mt-3 flex items-center" style={{ height: '48px', minHeight: '48px' }}>
                    <p className="text-sm font-medium text-gray-600">Events</p>
                  </div>
                </div>
                <DashboardStatMetricBlock
                  loading={statisticsLoading}
                  series={dailyData.events}
                  value={statistics.events}
                />
              </div>
            </div>
          </div>

          {/* Retarget Installs Card */}
          <div className="relative overflow-hidden rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 opacity-30 pointer-events-none"></div>
            <div className="relative p-6">
              <div className="flex justify-between gap-3" style={{ minHeight: '108px' }}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-3" style={{ height: '60px' }}>
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 shadow-sm flex-shrink-0">
                      <Download className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-100 rounded-md border border-gray-200">
                      RT
                    </span>
                  </div>
                  <div className="mt-3 flex items-center" style={{ height: '48px', minHeight: '48px' }}>
                    <p className="text-sm font-medium text-gray-600">Retarget Installations</p>
                  </div>
                </div>
                <DashboardStatMetricBlock
                  loading={statisticsLoading}
                  series={dailyData.retarget_installs}
                  value={statistics.retarget_installs}
                />
              </div>
            </div>
          </div>

          {/* Retarget Events Card */}
          <div className="relative overflow-hidden rounded-xl bg-white border border-gray-200 shadow-sm">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 opacity-30 pointer-events-none"></div>
            <div className="relative p-6">
              <div className="flex justify-between gap-3" style={{ minHeight: '108px' }}>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-3" style={{ height: '60px' }}>
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 shadow-sm flex-shrink-0">
                      <Repeat2 className="w-5 h-5 text-white" strokeWidth={2.5} />
                    </div>
                    <span className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-100 rounded-md border border-gray-200">
                      RT
                    </span>
                  </div>
                  <div className="mt-3 flex items-center" style={{ height: '48px', minHeight: '48px' }}>
                    <p className="text-sm font-medium text-gray-600">Retarget Events</p>
                  </div>
                </div>
                <DashboardStatMetricBlock
                  loading={statisticsLoading}
                  series={dailyData.retarget_events}
                  value={statistics.retarget_events}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Chart Area - Chart using D3.js */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Install Conversion Chart */}
          <div>
            <Card className="shadow-md rounded-lg h-[400px]">
              <CardHeader style={{ paddingTop: '1rem', paddingBottom: '1rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ minWidth: 0, gap: '16px' }}>
                  <div className="flex items-center gap-2" style={{ alignItems: 'center', height: '100%', minWidth: 0, flex: '1 1 0', overflow: 'hidden' }}>
                    <CardTitle className="m-0" style={{ lineHeight: '1.5', margin: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {'Install Conversion Chart'}
                    </CardTitle>
                    <button
                      onClick={() => {
                        // Immediately clears the data and selected series, ensuring the control is immediately hidden
                        setInstallConversionData([]);
                        setInstallConversionHighlightedSeriesId(null);
                        setInstallConversionBadge(installConversionBadge === 'UA' ? 'RT' : 'UA');
                      }}
                      className={`
                        px-2.5 py-0.5 rounded-full text-xs font-bold transition-all
                        cursor-pointer select-none
                        bg-gray-900 text-white hover:bg-gray-800 
                        dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200
                        shadow-sm hover:shadow-md
                        border-2 border-gray-700 dark:border-gray-300
                      `}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        lineHeight: '1.2',
                        height: 'fit-content',
                        flexShrink: 0
                      }}
                      title={`Click to switch to ${installConversionBadge === 'UA' ? 'RT' : 'UA'}`}
                    >
                      {installConversionBadge}
                    </button>
                    {/* Series switching control */}
                    {hasAnyInstallConversionPoints && installConversionData.length > 1 && (() => {
                      const currentSeries = installConversionData.find(group => {
                        const id = group.platform ? `${group.groupId}_${group.platform}` : group.groupId;
                        return id === installConversionHighlightedSeriesId;
                      });
                      if (!currentSeries) return null;
                      return (
                        <ConversionSeriesPicker
                          viewMode={installConversionViewMode}
                          currentSeries={{
                            groupName: currentSeries.groupName,
                            platform: currentSeries.platform,
                            icon: currentSeries.icon,
                          }}
                          onPrev={() => handleInstallSeriesSwitch('prev')}
                          onNext={() => handleInstallSeriesSwitch('next')}
                          onCycleNext={() => handleInstallSeriesSwitch('next')}
                        />
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0" style={{ alignItems: 'center', height: '100%', minWidth: '120px', justifyContent: 'flex-end' }}>
                    <span 
                      className={`text-sm font-medium transition-colors flex-shrink-0 ${installConversionViewMode === 'ACC' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        lineHeight: '1.5',
                        height: 'fit-content',
                        minWidth: '32px',
                        justifyContent: 'flex-end'
                      }}
                    >
                      ACC
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', height: 'fit-content', flexShrink: 0, position: 'relative' }}>
                      <SquareSwitch
                        checked={installConversionViewMode === 'APP'}
                        onCheckedChange={(checked) => {
                          // Consistent with Regional logic: immediately enter loading when switching, and cancel in-transit requests to avoid short-term Empty
                          installConversionRequestIdRef.current += 1;
                          lastInstallConversionParamsRef.current = '';
                          setInstallConversionLoading(true);
                          // Immediately clears the data and selected series, ensuring the control is immediately hidden
                          setInstallConversionData([]);
                          setInstallConversionHighlightedSeriesId(null);
                          setInstallConversionViewMode(checked ? 'APP' : 'ACC');
                        }}
                      />
                    </div>
                    <span 
                      className={`text-sm font-medium transition-colors flex-shrink-0 ${installConversionViewMode === 'APP' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        lineHeight: '1.5',
                        height: 'fit-content',
                        minWidth: '32px',
                        justifyContent: 'flex-start'
                      }}
                    >
                      APP
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent style={{ overflow: 'hidden', width: '100%' }}>
                {/* Fixed height placeholder container to avoid layout jitter when empty and chart switching */}
                <div style={{ width: '100%', height: '300px', position: 'relative', overflow: 'hidden' }}>
                  {/* Consistent with DashboardStatMetricBlock: the entire block is centered during loading LoadingIcon */}
                  {installConversionLoading ? (
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center"
                      aria-busy
                      aria-label="Loading install conversion chart"
                    >
                      <LoadingIcon className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                  ) : !hasAnyInstallConversionPoints ? (
                    <div className="flex flex-col items-center justify-center absolute inset-0 text-gray-400">
                      <Inbox className="w-12 h-12 mb-3 opacity-50" />
                      <span className="text-sm font-medium">Empty</span>
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                      <LineChart
                        key={`install-${installConversionViewMode}-${installConversionBadge}-${installConversionData.length}`}
                        data={[]}
                        series={installConversionData.map(group => {
                          const uniqueId = group.platform 
                            ? `${group.groupId}_${group.platform}` 
                            : group.groupId;
                          return {
                            id: uniqueId,
                            name: group.groupName,
                            icon: group.icon,
                            platform: group.platform,
                            data: group.data.map(d => ({ date: d.date, value: d.installs })),
                            color: '#000000'
                          };
                        })}
                        width={700}
                        height={300}
                        color="#000000"
                        showGrid={false}
                        showTooltip={true}
                        enableZoom={false}
                        enableAnimation={true}
                        xField="date"
                        yField="value"
                        hideYAxis={true}
                        showArea={true}
                        valueLabel="Install"
                        highlightedSeriesId={installConversionHighlightedSeriesId}
                        onHighlightChange={setInstallConversionHighlightedSeriesId}
                        fitContainerWidth
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Event Conversion Chart */}
          <div>
            <Card className="shadow-md rounded-lg h-[400px]">
              <CardHeader style={{ paddingTop: '1rem', paddingBottom: '1rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ minWidth: 0, gap: '16px' }}>
                  <div className="flex items-center gap-2" style={{ alignItems: 'center', height: '100%', minWidth: 0, flex: '1 1 0', overflow: 'hidden' }}>
                    <CardTitle className="m-0" style={{ lineHeight: '1.5', margin: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {'Event Conversion Chart'}
                    </CardTitle>
                    <button
                      onClick={() => {
                        // Immediately clears the data and selected series, ensuring the control is immediately hidden
                        setEventConversionData([]);
                        setEventConversionHighlightedSeriesId(null);
                        setEventConversionBadge(eventConversionBadge === 'UA' ? 'RT' : 'UA');
                      }}
                      className={`
                        px-2.5 py-0.5 rounded-full text-xs font-bold transition-all
                        cursor-pointer select-none
                        bg-gray-900 text-white hover:bg-gray-800 
                        dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200
                        shadow-sm hover:shadow-md
                        border-2 border-gray-700 dark:border-gray-300
                      `}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        lineHeight: '1.2',
                        height: 'fit-content',
                        flexShrink: 0
                      }}
                      title={`Click to switch to ${eventConversionBadge === 'UA' ? 'RT' : 'UA'}`}
                    >
                      {eventConversionBadge}
                    </button>
                    {/* Series switching control */}
                    {hasAnyEventConversionPoints && eventConversionData.length > 1 && (() => {
                      const currentSeries = eventConversionData.find(group => {
                        const id = group.platform ? `${group.groupId}_${group.platform}` : group.groupId;
                        return id === eventConversionHighlightedSeriesId;
                      });
                      if (!currentSeries) return null;
                      return (
                        <ConversionSeriesPicker
                          viewMode={eventConversionViewMode}
                          currentSeries={{
                            groupName: currentSeries.groupName,
                            platform: currentSeries.platform,
                            icon: currentSeries.icon,
                          }}
                          onPrev={() => handleEventSeriesSwitch('prev')}
                          onNext={() => handleEventSeriesSwitch('next')}
                          onCycleNext={() => handleEventSeriesSwitch('next')}
                        />
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0" style={{ alignItems: 'center', height: '100%', minWidth: '120px', justifyContent: 'flex-end' }}>
                    <span 
                      className={`text-sm font-medium transition-colors flex-shrink-0 ${eventConversionViewMode === 'ACC' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        lineHeight: '1.5',
                        height: 'fit-content',
                        minWidth: '32px',
                        justifyContent: 'flex-end'
                      }}
                    >
                      ACC
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', height: 'fit-content', flexShrink: 0, position: 'relative' }}>
                      <SquareSwitch
                        checked={eventConversionViewMode === 'APP'}
                        onCheckedChange={(checked) => {
                          // Consistent with Regional logic: immediately enter loading when switching, and cancel in-transit requests to avoid short-term Empty
                          eventConversionRequestIdRef.current += 1;
                          lastEventConversionParamsRef.current = '';
                          setEventConversionLoading(true);
                          // Immediately clears the data and selected series, ensuring the control is immediately hidden
                          setEventConversionData([]);
                          setEventConversionHighlightedSeriesId(null);
                          setEventConversionViewMode(checked ? 'APP' : 'ACC');
                        }}
                      />
                    </div>
                    <span 
                      className={`text-sm font-medium transition-colors flex-shrink-0 ${eventConversionViewMode === 'APP' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        lineHeight: '1.5',
                        height: 'fit-content',
                        minWidth: '32px',
                        justifyContent: 'flex-start'
                      }}
                    >
                      APP
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent style={{ overflow: 'hidden', width: '100%' }}>
                {/* Fixed height placeholder container to avoid layout jitter when empty and chart switching */}
                <div style={{ width: '100%', height: '300px', position: 'relative', overflow: 'hidden' }}>
                  {eventConversionLoading ? (
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center"
                      aria-busy
                      aria-label="Loading event conversion chart"
                    >
                      <LoadingIcon className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                  ) : !hasAnyEventConversionPoints ? (
                    <div className="flex flex-col items-center justify-center absolute inset-0 text-gray-400">
                      <Inbox className="w-12 h-12 mb-3 opacity-50" />
                      <span className="text-sm font-medium">Empty</span>
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                      <LineChart
                        key={`event-${eventConversionViewMode}-${eventConversionBadge}-${eventConversionData.length}`}
                        data={[]}
                        series={eventConversionData.map(group => {
                          const uniqueId = group.platform 
                            ? `${group.groupId}_${group.platform}` 
                            : group.groupId;
                          return {
                            id: uniqueId,
                            name: group.groupName,
                            icon: group.icon,
                            platform: group.platform,
                            data: group.data.map(d => ({ date: d.date, value: d.events })),
                            color: '#000000'
                          };
                        })}
                        width={700}
                        height={300}
                        color="#000000"
                        showGrid={false}
                        showTooltip={true}
                        enableZoom={false}
                        enableAnimation={true}
                        xField="date"
                        yField="value"
                        hideYAxis={true}
                        showArea={true}
                        useStraightLine={true}
                        areaGradientColor="red"
                        valueLabel="Event"
                        highlightedSeriesId={eventConversionHighlightedSeriesId}
                        onHighlightChange={setEventConversionHighlightedSeriesId}
                        fitContainerWidth
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Distribution Proportion Chart */}
          <div className="col-span-full">
            <Card 
              className="shadow-md rounded-lg flex flex-col h-[400px]"
              style={{ overflow: 'hidden' }}
            >
              <CardHeader className="flex-shrink-0" style={{ paddingTop: '1rem', paddingBottom: '1rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-2" style={{ alignItems: 'center', height: '100%', minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
                    <CardTitle className="m-0" style={{ lineHeight: '1.5', margin: 0, display: 'flex', alignItems: 'center' }}>
                      {'Distribution Proportion Chart'}
                    </CardTitle>
                    <button
                      onClick={() => {
                        // Immediately set the loading status and clear data, marking the chart as not ready to avoid jitter during switching
                        setDistributionProportionLoading(true);
                        setDistributionProportionChartReady(false);
                        // Also set the loading state of FunnelChart
                        setEventNameStatisticsLoading(true);
                        setEventNameStatisticsChartReady(false);
                        setDistributionProportionBadge(distributionProportionBadge === 'UA' ? 'RT' : 'UA');
                        // Data will be automatically reloaded in useEffect
                      }}
                      className={`
                        px-2.5 py-0.5 rounded-full text-xs font-bold transition-all
                        cursor-pointer select-none
                        bg-gray-900 text-white hover:bg-gray-800 
                        dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200
                        shadow-sm hover:shadow-md
                        border-2 border-gray-700 dark:border-gray-300
                      `}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        lineHeight: '1.2',
                        height: 'fit-content'
                      }}
                      title={`Click to switch to ${distributionProportionBadge === 'UA' ? 'RT' : 'UA'}`}
                    >
                      {distributionProportionBadge}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0" style={{ alignItems: 'center', height: '100%' }}>
                    <span 
                      className={`text-sm font-medium transition-colors ${distributionProportionViewMode === 'ACC' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        lineHeight: '1.5',
                        height: 'fit-content'
                      }}
                    >
                      ACC
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', height: 'fit-content', flexShrink: 0, position: 'relative' }}>
                      <SquareSwitch
                        checked={distributionProportionViewMode === 'APP'}
                        onCheckedChange={(checked) => {
                          // Immediately set the loading status and clear data, marking the chart as not ready to avoid jitter during switching
                          setDistributionProportionLoading(true);
                          setDistributionProportionChartReady(false);
                          // Also set the loading state of FunnelChart
                          setEventNameStatisticsLoading(true);
                          setEventNameStatisticsChartReady(false);
                          setDistributionProportionViewMode(checked ? 'APP' : 'ACC');
                          // Data will be automatically reloaded in useEffect
                        }}
                      />
                    </div>
                    <span 
                      className={`text-sm font-medium transition-colors ${distributionProportionViewMode === 'APP' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        lineHeight: '1.5',
                        height: 'fit-content'
                      }}
                    >
                      APP
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex items-center justify-between overflow-hidden p-4" style={{ overflow: 'hidden', width: '100%', boxSizing: 'border-box' }}>
                {/* Pie chart container: half width, left */}
                <div className="w-1/2 h-full flex items-center justify-start min-w-0" style={{ backgroundColor: 'transparent', overflow: 'hidden', position: 'relative' }}>
                  {distributionProportionLoading && (
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center"
                      aria-busy
                      aria-label="Loading distribution proportion pie chart"
                    >
                      <LoadingIcon className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                  )}
                  {distributionProportionData.length === 0 && !distributionProportionLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <Inbox className="w-12 h-12 mb-3 opacity-50" />
                      <span className="text-sm font-medium">Empty</span>
                    </div>
                  ) : (
                    <div style={{ 
                      width: '100%', 
                      height: '100%',
                      overflow: 'hidden', 
                      position: 'relative',
                      maxHeight: '100%',
                      boxSizing: 'border-box',
                      clipPath: 'inset(0)',
                      isolation: 'isolate'
                    }}>
                      {/* Charts are always rendered, but display and animation are controlled based on chartReady */}
                      {/* Key: The chart is hidden during loading, displayed and the original animation is executed after the data is ready */}
                      {distributionProportionData.length > 0 && (
                        <div style={{ 
                          width: '100%', 
                          height: '100%',
                          maxHeight: '100%',
                          overflow: 'hidden',
                          opacity: distributionProportionChartReady && !distributionProportionLoading ? 1 : 0,
                          visibility: distributionProportionChartReady && !distributionProportionLoading ? 'visible' : 'hidden',
                          transition: distributionProportionChartReady && !distributionProportionLoading ? 'opacity 0.2s ease-in-out' : 'none',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'transparent',
                          pointerEvents: distributionProportionChartReady && !distributionProportionLoading ? 'auto' : 'none',
                          zIndex: distributionProportionChartReady && !distributionProportionLoading ? 1 : 0,
                          boxSizing: 'border-box',
                          clipPath: 'inset(0)'
                        }}>
                      <PieChart
                            key={`pie-${distributionProportionDataKey || 'empty'}-${distributionProportionChartReady ? 'ready' : 'loading'}`}
                        data={distributionProportionData}
                        width={700}
                        height={320}
                        showLabels={true}
                            showTooltip={distributionProportionChartReady && !distributionProportionLoading}
                            enableAnimation={distributionProportionChartReady && !distributionProportionLoading}
                        enableLegend={true}
                        legendPosition="right"
                        nameField="name"
                        valueField="value"
                      />
                    </div>
                  )}
                </div>
                  )}
                    </div>
                {/* Funnel chart container: half width, fully centered on the right area */}
                <div className="w-1/2 h-full flex items-center justify-center min-w-0" style={{ backgroundColor: 'transparent', overflow: 'hidden', position: 'relative' }}>
                  {eventNameStatisticsLoading && (
                    <div
                      className="absolute inset-0 z-10 flex items-center justify-center"
                      aria-busy
                      aria-label="Loading distribution proportion funnel chart"
                    >
                      <LoadingIcon className="h-8 w-8 animate-spin text-gray-400" />
                    </div>
                  )}
                  {eventNameStatisticsData.length === 0 && !eventNameStatisticsLoading ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                      <Inbox className="w-12 h-12 mb-3 opacity-50" />
                      <span className="text-sm font-medium">Empty</span>
                    </div>
                  ) : (
                    <div style={{ 
                      marginLeft: '40px', 
                      width: '100%', 
                      height: '100%',
                      overflow: 'hidden',
                      position: 'relative',
                      maxHeight: '100%',
                      boxSizing: 'border-box',
                      clipPath: 'inset(0)',
                      isolation: 'isolate'
                    }}>
                      {/* Charts are always rendered, but display and animation are controlled based on chartReady */}
                      {/* Key: The chart is hidden during loading, displayed when the data is ready, and performs a pop-up animation to the right. */}
                      {eventNameStatisticsData.length > 0 && (
                        <div style={{ 
                          width: '100%', 
                          height: '100%',
                          maxHeight: '100%',
                          overflow: 'hidden',
                          opacity: eventNameStatisticsChartReady && !eventNameStatisticsLoading ? 1 : 0,
                          visibility: eventNameStatisticsChartReady && !eventNameStatisticsLoading ? 'visible' : 'hidden',
                          transition: eventNameStatisticsChartReady && !eventNameStatisticsLoading ? 'opacity 0.2s ease-in-out' : 'none',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'transparent',
                          pointerEvents: eventNameStatisticsChartReady && !eventNameStatisticsLoading ? 'auto' : 'none',
                          zIndex: eventNameStatisticsChartReady && !eventNameStatisticsLoading ? 1 : 0,
                          boxSizing: 'border-box',
                          clipPath: 'inset(0)'
                        }}>
                      <FunnelChart
                            key={`funnel-${eventNameStatisticsDataKey || 'empty'}-${eventNameStatisticsChartReady ? 'ready' : 'loading'}`}
                        data={eventNameStatisticsData}
                        width={750}
                        height={320}
                        margin={{
                          top: 20,
                          right: 100, // Reserve space for numeric labels on the right
                          bottom: 40,
                          left: 220, // Reserve space for the event name label on the left (increase the left spacing to move the whole thing closer to the right)
                        }}
                        showLabels={true}
                            showTooltip={eventNameStatisticsChartReady && !eventNameStatisticsLoading}
                            enableAnimation={eventNameStatisticsChartReady && !eventNameStatisticsLoading}
                        mode={distributionProportionViewMode}
                        badge={distributionProportionBadge}
                        fitContainerWidth
                      />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Regional Statistics Chart */}
          <div className="col-span-full">
            <Card 
              className="shadow-md rounded-lg h-[550px]"
              style={{ overflow: 'hidden' }}
            >
              <CardHeader style={{ paddingTop: '1rem', paddingBottom: '1rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ minWidth: 0, gap: '16px' }}>
                  <div className="flex items-center gap-2" style={{ alignItems: 'center', height: '100%', minWidth: 0, flex: '1 1 0', overflow: 'hidden' }}>
                    <CardTitle className="m-0" style={{ lineHeight: '1.5', margin: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {'Regional Statistics Chart'}
                    </CardTitle>
                    <button
                      onClick={() => {
                        // Immediately set the loading status and clear data, marking the chart as not ready to avoid flickering and positioning errors during switching
                        setRegionalStatisticsLoading(true);
                        setRegionalStatisticsChartReady(false);
                        setRegionalStatisticsData([]);
                        setRegionalStatisticsGroupedData([]);
                        setRegionalStatisticsHighlightedSeriesId(null);
                        setRegionalStatisticsBadge(regionalStatisticsBadge === 'UA' ? 'RT' : 'UA');
                        // Data will be automatically reloaded in useEffect
                      }}
                      className={`
                        px-2.5 py-0.5 rounded-full text-xs font-bold transition-all
                        cursor-pointer select-none
                        bg-gray-900 text-white hover:bg-gray-800 
                        dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200
                        shadow-sm hover:shadow-md
                        border-2 border-gray-700 dark:border-gray-300
                      `}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        lineHeight: '1.2',
                        height: 'fit-content',
                        flexShrink: 0
                      }}
                      title={`Click to switch to ${regionalStatisticsBadge === 'UA' ? 'RT' : 'UA'}`}
                    >
                      {regionalStatisticsBadge}
                    </button>
                    {/* Series switch control - always shown when in ACC or APP mode */}
                    {!regionalStatisticsLoading && regionalStatisticsTripleMode !== 'ALL' && (() => {
                      // Find the currently selected series
                      const currentSeries = regionalStatisticsGroupedData.find(group => {
                        // APP mode: use appId + platform as the unique identifier
                        // ACC mode: use account as the unique identifier
                        if (regionalStatisticsTripleMode === 'APP') {
                          const id = group.appId && group.platform 
                            ? `${group.appId}_${group.platform}` 
                            : group.appId || '';
                          return id === regionalStatisticsHighlightedSeriesId;
                        } else {
                          const id = group.account || '';
                          return id === regionalStatisticsHighlightedSeriesId;
                        }
                      });
                      
                      // Determine whether there is only one series
                      const hasMultipleSeries = regionalStatisticsGroupedData.length > 1;
                      
                      return (
                        <div className="flex items-center ml-2 flex-1 min-w-0" style={{ alignItems: 'center', height: 'fit-content', maxWidth: 'calc(100% - 132px)' }}>
                          {/* Integrated series information display container - including left and right arrows */}
                          {currentSeries && (
                            <div className="flex items-center rounded-md bg-white border border-gray-300 shadow-sm h-[26px] overflow-hidden w-full min-w-0 max-w-full">
                              {/* left arrow area */}
                              <div
                                onClick={hasMultipleSeries ? () => handleRegionalSeriesSwitch('prev') : undefined}
                                className={`flex items-center justify-center px-1.5 h-full transition-colors select-none flex-shrink-0 ${
                                  hasMultipleSeries 
                                    ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' 
                                    : 'cursor-not-allowed opacity-40'
                                }`}
                                title={hasMultipleSeries ? "Previous series" : "Only one series available"}
                              >
                                <ChevronLeft className="w-4 h-4 text-gray-600" />
                              </div>
                              {/* Middle series information area - Icon and text centered */}
                              <div className="flex items-center justify-center gap-1.5 px-2 py-0.5 flex-1 min-w-0 overflow-hidden">
                                {currentSeries.icon && (
                                  <img 
                                    src={currentSeries.icon.startsWith('data:') || currentSeries.icon.startsWith('http') 
                                      ? currentSeries.icon 
                                      : `data:image/png;base64,${currentSeries.icon}`}
                                    alt={currentSeries.account || currentSeries.appName || ''}
                                    className="w-4 h-4 rounded-full flex-shrink-0 object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                )}
                                <div className="min-w-0 overflow-hidden">
                                  <div className="text-xs font-medium text-gray-900 truncate leading-tight whitespace-nowrap">
                                    {(() => {
                                      if (regionalStatisticsTripleMode === 'APP') {
                                        // APP mode: Display AppName (Platform)
                                        const appName = currentSeries.appName || currentSeries.appId || '';
                                        const platform = currentSeries.platform || '';
                                        if (platform) {
                                          // Convert platform to uppercase, iOS to keep IOS
                                          const platformUpper = platform.toUpperCase() === 'IOS' ? 'IOS' : platform.toUpperCase();
                                          return `${appName} (${platformUpper})`;
                                        }
                                        return appName;
                                      } else {
                                        // ACC mode: only display account
                                        return currentSeries.account || '';
                                      }
                                    })()}
                                  </div>
                                </div>
                              </div>
                              {/* Right arrow area */}
                              <div
                                onClick={hasMultipleSeries ? () => handleRegionalSeriesSwitch('next') : undefined}
                                className={`flex items-center justify-center px-1.5 h-full transition-colors select-none flex-shrink-0 ${
                                  hasMultipleSeries 
                                    ? 'cursor-pointer hover:bg-gray-50 active:bg-gray-100' 
                                    : 'cursor-not-allowed opacity-40'
                                }`}
                                title={hasMultipleSeries ? "Next series" : "Only one series available"}
                              >
                                <ChevronRight className="w-4 h-4 text-gray-600" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0" style={{ alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    {/* Install/Event switch component */}
                    <div className="flex items-center gap-2 flex-shrink-0" style={{ alignItems: 'center', height: 'fit-content' }}>
                      <span 
                        className={`text-sm font-medium transition-colors flex-shrink-0 ${regionalStatisticsDataType === 'Install' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          lineHeight: '1.5',
                          height: 'fit-content',
                          width: '48px',
                          justifyContent: 'flex-end'
                        }}
                      >
                        Install
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', height: 'fit-content', flexShrink: 0 }}>
                        <SquareSwitch
                          checked={regionalStatisticsDataType === 'Event'}
                          onCheckedChange={(checked) => {
                            const newDataType = checked ? 'Event' : 'Install';
                            // Immediately set the loading status and clear data, marking the chart as not ready to avoid flickering and positioning errors during switching
                            setRegionalStatisticsLoading(true);
                            setRegionalStatisticsChartReady(false);
                            setRegionalStatisticsData([]);
                            setRegionalStatisticsGroupedData([]);
                            setRegionalStatisticsHighlightedSeriesId(null);
                            setRegionalStatisticsDataType(newDataType);
                            // Data will be automatically reloaded in useEffect
                          }}
                        />
                      </div>
                      <span 
                        className={`text-sm font-medium transition-colors flex-shrink-0 ${regionalStatisticsDataType === 'Event' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center',
                          lineHeight: '1.5',
                          height: 'fit-content',
                          width: '40px',
                          justifyContent: 'flex-start'
                        }}
                      >
                        Event
                      </span>
                    </div>
                    {/* pipe separator */}
                    <div 
                      style={{ 
                        width: '1px', 
                        height: '24px', 
                        backgroundColor: 'rgb(229, 231, 235)',
                        flexShrink: 0
                      }}
                    />
                    {/* ALL/ACC/APP switching component */}
                    <div style={{ display: 'flex', alignItems: 'center', height: 'fit-content', flexShrink: 0, position: 'relative' }}>
                      <TripleSwitch
                        value={regionalStatisticsTripleMode}
                        onValueChange={(value) => {
                          // Immediately set the loading status and clear data, marking the chart as not ready to avoid flickering and positioning errors during switching
                          setRegionalStatisticsLoading(true);
                          setRegionalStatisticsChartReady(false);
                          setRegionalStatisticsTripleMode(value);
                          setRegionalStatisticsData([]);
                          setRegionalStatisticsGroupedData([]);
                          setRegionalStatisticsHighlightedSeriesId(null);
                          // The old data ref is also cleared when switching modes, because the data formats of different modes are different.
                          regionalStatisticsLastValidChartDataRef.current = [];
                          // Data will be automatically reloaded in useEffect
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent style={{ 
                overflow: 'hidden', 
                width: '100%', 
                paddingBottom: '1.5rem', 
                paddingLeft: '1.5rem', 
                paddingRight: '1.5rem', 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                position: 'relative',
                boxSizing: 'border-box' // Make sure padding is included in the height
              }}>
                {/* Fixed height placeholder container to avoid layout jitter when empty and chart switching */}
                {/* Use flex instead of height: 100% to ensure that the padding area is not exceeded */}
                {/* Key: Add maxHeight and overflow to ensure content does not exceed the boundaries of the container */}
                <div style={{ 
                  width: '100%', 
                  position: 'relative', 
                  overflow: 'hidden', 
                  flex: '1 1 0%', 
                  minHeight: 0,
                  maxHeight: '100%', // Make sure the height of the parent container is not exceeded
                  boxSizing: 'border-box', // Make sure the dimensions are calculated correctly
                  clipPath: 'inset(0)' // Forced clipping of any excess content
                }}>
                  {(() => {
                  // Determines the data displayed based on the mode
                  let chartData: { category: string; value: number; eventData?: { [eventName: string]: number } }[] = [];
                  
                  if (regionalStatisticsTripleMode === 'ALL') {
                    // ALL mode: display all data and filter out invalid values
                    chartData = regionalStatisticsData
                      .filter(d => d.count !== undefined && d.count !== null && !isNaN(Number(d.count)))
                      .map(d => ({ 
                        category: d.country, 
                        value: Number(d.count),
                        eventData: d.eventData // Contains eventData in Event mode
                      }));
                  } else {
                    // ACC or APP mode: display the selected series data and filter out invalid values
                    const currentSeries = regionalStatisticsGroupedData.find(group => {
                      // APP mode: use appId + platform as the unique identifier
                      // ACC mode: use account as the unique identifier
                      if (regionalStatisticsTripleMode === 'APP') {
                        const id = group.appId && group.platform 
                          ? `${group.appId}_${group.platform}` 
                          : group.appId || '';
                        return id === regionalStatisticsHighlightedSeriesId;
                      } else {
                        const id = group.account || '';
                        return id === regionalStatisticsHighlightedSeriesId;
                      }
                    });
                    
                    if (currentSeries && currentSeries.data.length > 0) {
                      chartData = currentSeries.data
                        .filter(d => d.count !== undefined && d.count !== null && !isNaN(Number(d.count)))
                        .map(d => ({ 
                          category: d.country, 
                          value: Number(d.count),
                          eventData: d.eventData // Contains eventData in Event mode
                        }));
                    }
                  }
                  
                    // If there is currently data, update the last valid data (to be used as a placeholder during loading to avoid Empty flashes)
                    if (chartData.length > 0 && !regionalStatisticsLoading) {
                      regionalStatisticsLastValidChartDataRef.current = chartData;
                    }

                    const showRegionalLoadingOverlay =
                      regionalStatisticsLoading || !regionalStatisticsChartReady;

                    const displayChartData =
                      chartData.length > 0
                        ? chartData
                        : showRegionalLoadingOverlay
                          ? regionalStatisticsLastValidChartDataRef.current
                          : [];

                    const regionalChartInteractive =
                      regionalStatisticsChartReady && !regionalStatisticsLoading;

                    // Empty status: only displayed after the loading is actually completed and the chart is ready, to avoid jitter/empty flash at the end of loading
                    if (displayChartData.length === 0 && !showRegionalLoadingOverlay) {
                    return (
                        <div className="flex flex-col items-center justify-center absolute inset-0 text-gray-400">
                        <Inbox className="w-12 h-12 mb-3 opacity-50" />
                        <span className="text-sm font-medium">Empty</span>
                      </div>
                    );
                  }
                    
                    // Key fix: chart always renders (let responsive calculate dimensions), but controls display and animation based on chartReady
                    // 1. If chartReady is false, the chart hides rendering (let responsive calculate the correct size)
                    // 2. If chartReady is true, the chart displays and performs animation
                    // This way the chart can be calculated correctly after the size is stabilized, avoiding positioning errors.
                    return (
                      <div style={{ 
                        width: '100%', 
                        height: '100%', 
                        overflow: 'hidden', 
                        position: 'relative',
                        maxHeight: '100%', // Make sure not to exceed the height of the container
                        boxSizing: 'border-box', // Make sure the dimensions are calculated correctly
                        clipPath: 'inset(0)', // Forced clipping of any excess content
                        isolation: 'isolate' // Create a new cascading context to prevent child elements from exceeding
                      }}>
                        {/* Show overlay if chart is not ready */}
                        {/* Key: Make sure the overlay is strictly within the boundaries of the container and does not exceed */}
                        {showRegionalLoadingOverlay && (
                          <div 
                            className="flex items-center justify-center z-10"
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              maxWidth: '100%',
                              maxHeight: '100%',
                              overflow: 'hidden',
                              boxSizing: 'border-box',
                              clipPath: 'inset(0)', // Forced cutting to ensure that it does not exceed the container
                              contain: 'layout style paint', // CSS containment, limiting the scope of influence
                              willChange: 'transform' // Upgrade to the synthesis layer in advance to avoid rotation lag in the final stage
                      }}
                    >
                            <LoadingIcon className="h-8 w-8 animate-spin text-gray-400 [animation-duration:0.85s]" />
                          </div>
                        )}
                        {/* Only mount the chart after loading is completed and chartReady is completed to avoid hidden state error size + animation being interrupted. */}
                        {regionalChartInteractive && chartData.length > 0 && (
                          <div style={{
                            width: '100%',
                            height: '100%',
                            maxHeight: '100%',
                            overflow: 'hidden',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'transparent',
                            pointerEvents: 'auto',
                            zIndex: 1,
                            boxSizing: 'border-box',
                            clipPath: 'inset(0)',
                          }}>
                            <BarChart
                              key={regionalStatisticsChartKey}
                              data={chartData}
                              color="#000000"
                              showGrid={false}
                              showTooltip={true}
                              enableAnimation={true}
                              hideYAxis={true}
                              showLabels={true}
                              responsive={true}
                              xField="category"
                              yField="value"
                              margin={{ bottom: 80 }}
                              tooltipValueLabel={regionalStatisticsDataType === 'Install' ? 'Install' : 'Event'}
                              isEventMode={regionalStatisticsDataType === 'Event'}
                            />
                          </div>
                        )}
                    </div>
                  );
                })()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Affiliate Channel Chart */}
          <div className="col-span-full">
            <Card
              className="shadow-md rounded-lg h-[520px]"
              style={{ overflow: 'hidden' }}
            >
              <CardHeader style={{ paddingTop: '1rem', paddingBottom: '1rem', paddingLeft: '1.5rem', paddingRight: '1.5rem', overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ minWidth: 0, gap: '16px' }}>
                  <div className="flex items-center gap-2" style={{ alignItems: 'center', height: '100%', minWidth: 0, flex: '1 1 0', overflow: 'hidden' }}>
                    <CardTitle className="m-0" style={{ lineHeight: '1.5', margin: 0, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      {'Affiliate Channel Chart'}
                    </CardTitle>
                    <button
                      onClick={() => {
                        setAffiliateChannelLoading(true);
                        setAffiliateChannelChartReady(false);
                        setAffiliateChannelData([]);
                        setAffiliateChannelHighlightedSeriesId(null);
                        setAffiliateChannelBadge(affiliateChannelBadge === 'UA' ? 'RT' : 'UA');
                      }}
                      className={`
                        px-2.5 py-0.5 rounded-full text-xs font-bold transition-all
                        cursor-pointer select-none
                        bg-gray-900 text-white hover:bg-gray-800
                        dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200
                        shadow-sm hover:shadow-md
                        border-2 border-gray-700 dark:border-gray-300
                      `}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: '1.2',
                        height: 'fit-content',
                        flexShrink: 0
                      }}
                      title={`Click to switch to ${affiliateChannelBadge === 'UA' ? 'RT' : 'UA'}`}
                    >
                      {affiliateChannelBadge}
                    </button>
                    {!affiliateChannelLoading && affiliateChannelTripleMode !== 'ALL' && affiliateChannelCurrentSeries && (
                      <ConversionSeriesPicker
                        viewMode={affiliateChannelTripleMode as 'ACC' | 'APP'}
                        currentSeries={{
                          groupName: affiliateChannelCurrentSeries.displayName,
                          icon: affiliateChannelCurrentSeries.icon,
                        }}
                        onPrev={() => handleAffiliateChannelSeriesSwitch('prev')}
                        onNext={() => handleAffiliateChannelSeriesSwitch('next')}
                        onCycleNext={() => handleAffiliateChannelSeriesSwitch('next')}
                      />
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0" style={{ alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                    <div className="flex items-center gap-2 flex-shrink-0" style={{ alignItems: 'center', height: 'fit-content' }}>
                      <span
                        className={`text-sm font-medium transition-colors flex-shrink-0 ${affiliateChannelDataType === 'Install' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          lineHeight: '1.5',
                          height: 'fit-content',
                          width: '48px',
                          justifyContent: 'flex-end'
                        }}
                      >
                        Install
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', height: 'fit-content', flexShrink: 0 }}>
                        <SquareSwitch
                          checked={affiliateChannelDataType === 'Event'}
                          onCheckedChange={(checked) => {
                            setAffiliateChannelLoading(true);
                            setAffiliateChannelChartReady(false);
                            setAffiliateChannelData([]);
                            setAffiliateChannelDataType(checked ? 'Event' : 'Install');
                          }}
                        />
                      </div>
                      <span
                        className={`text-sm font-medium transition-colors flex-shrink-0 ${affiliateChannelDataType === 'Event' ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          lineHeight: '1.5',
                          height: 'fit-content',
                          width: '40px',
                          justifyContent: 'flex-start'
                        }}
                      >
                        Event
                      </span>
                    </div>

                    <div
                      style={{
                        width: '1px',
                        height: '24px',
                        backgroundColor: 'rgb(229, 231, 235)',
                        flexShrink: 0
                      }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', height: 'fit-content', flexShrink: 0, position: 'relative' }}>
                      <TripleSwitch
                        value={affiliateChannelTripleMode}
                        onValueChange={(value) => {
                          setAffiliateChannelLoading(true);
                          setAffiliateChannelChartReady(false);
                          setAffiliateChannelData([]);
                          setAffiliateChannelHighlightedSeriesId(null);
                          setAffiliateChannelTripleMode(value);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>

              <CardContent style={{
                overflow: 'hidden',
                width: '100%',
                paddingBottom: '1.5rem',
                paddingLeft: '1.5rem',
                paddingRight: '1.5rem',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                boxSizing: 'border-box'
              }}>
                <div style={{
                  width: '100%',
                  position: 'relative',
                  overflow: 'hidden',
                  flex: '1 1 0%',
                  minHeight: 0,
                  maxHeight: '100%',
                  boxSizing: 'border-box',
                  clipPath: 'inset(0)'
                }}>
                  {affiliateChannelChartData.length === 0 && !affiliateChannelLoading && affiliateChannelChartReady ? (
                    <div className="flex flex-col items-center justify-center absolute inset-0 text-gray-400">
                      <Inbox className="w-12 h-12 mb-3 opacity-50" />
                      <span className="text-sm font-medium">Empty</span>
                    </div>
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      overflow: 'hidden',
                      position: 'relative',
                      maxHeight: '100%',
                      boxSizing: 'border-box',
                      clipPath: 'inset(0)',
                      isolation: 'isolate'
                    }}>
                      {(affiliateChannelLoading || !affiliateChannelChartReady) && (
                        <div
                          className="flex items-center justify-center z-10"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            overflow: 'hidden',
                            boxSizing: 'border-box',
                            clipPath: 'inset(0)',
                            contain: 'layout style paint',
                            willChange: 'transform'
                          }}
                        >
                          <LoadingIcon className="h-8 w-8 animate-spin text-gray-400 [animation-duration:0.85s]" />
                        </div>
                      )}

                      {affiliateChannelChartData.length > 0 && (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          maxHeight: '100%',
                          overflow: 'hidden',
                          opacity: affiliateChannelChartReady ? 1 : 0,
                          visibility: affiliateChannelChartReady ? 'visible' : 'hidden',
                          transition: affiliateChannelChartReady ? 'opacity 0.2s ease-in-out' : 'none',
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'transparent',
                          pointerEvents: affiliateChannelChartReady ? 'auto' : 'none',
                          zIndex: affiliateChannelChartReady ? 1 : 0,
                          boxSizing: 'border-box',
                          clipPath: 'inset(0)'
                        }}>
                          <BubbleChart
                            data={affiliateChannelChartData.map((item, index) => ({
                              id: `${item.name}-${index}`,
                              name: item.name,
                              channel: item.channel,
                              groupName: item.groupName,
                              value: Number(item.count) || 0,
                              eventData: item.eventData,
                            }))}
                            showTooltip={affiliateChannelChartReady}
                            enableAnimation={affiliateChannelChartReady}
                            statisticsType={affiliateChannelDataType}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        </Spin>
      </div>
    </>
    );
  };

export default Dashboard; 