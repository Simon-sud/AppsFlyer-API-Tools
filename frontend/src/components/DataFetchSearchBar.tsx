import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
// Removed unused import: createPortal
import moment from 'moment';
import dayjs from 'dayjs';
import { Calendar } from 'lucide-react';
import './DataFetchSearchBar.css';
import { TbDeviceMobileDown, TbDeviceMobileCheck, TbDeviceMobilePlus, TbChartLine, TbChartCircles, TbChartDots3 } from 'react-icons/tb';

interface DataFetchSearchBarProps {
  // note
  formValues: {
    accountId: string;
    appIds: string;
    dataType: string;
    dateRange: [moment.Moment, moment.Moment];
    eventFilter?: string;
    mediaSource?: string;
  };
  
  // callback
  onAccountIdChange: (value: string) => void;
  onAppIdsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDataTypeChange: (value: string) => void;
  onDateRangeChange: (dates: [dayjs.Dayjs, dayjs.Dayjs] | null) => void;
  onEventFilterChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMediaSourceChange: (value: string) => void;
  onFetchData: (values: {
    accountId: string;
    appIds: string;
    dataType: string;
    dateRange: [dayjs.Dayjs, dayjs.Dayjs] | null;
    eventFilter: string;
    mediaSource: string;
  }) => void;
  
  // configdata
  accountConfigs: Array<{
    id: string;
    accountName: string;
    accountType: string;
    apiToken: string;
    customIcon?: string;
  }>;
  selectedAccountType: string | undefined;
  isAggregateMode: boolean;
  showEventFilter: boolean;
  disabledDate: (current: dayjs.Dayjs) => boolean;
  quickRanges: Array<{ label: string; value: [dayjs.Dayjs, dayjs.Dayjs] }>;
  
  // state
  isFetching: boolean;
  
  // constants
  ACCOUNT_TYPES: any;
  DATA_TYPES: any;
  DATE_FORMAT: string;
  
  // mode switchrelated
  aggregateModeEnabled: boolean;
  onAggregateModeToggle: () => void;

  /** Super Admin toggle Team only Query Results，notdataget*/
  dataFetchDisabled?: boolean;
}

const DataFetchSearchBar = forwardRef<any, DataFetchSearchBarProps>(({
  formValues,
  onAccountIdChange,
  onAppIdsChange,
  onDataTypeChange,
  onDateRangeChange,
  onEventFilterChange,
  onMediaSourceChange,
  onFetchData,
  accountConfigs,
  selectedAccountType,
  isAggregateMode,
  showEventFilter,
  disabledDate,
  quickRanges,
  isFetching,
  ACCOUNT_TYPES,
  DATA_TYPES,
  DATE_FORMAT,
  aggregateModeEnabled,
  onAggregateModeToggle,
  dataFetchDisabled = false,
}, ref) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // unifieddropdownstate - ensureonlyopen
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  

  // unifiedtoggle
  const toggleDropdown = (dropdownName: string) => {
    try {
    setActiveDropdown(activeDropdown === dropdownName ? null : dropdownName);
    } catch (error) {
      console.error('Error toggling dropdown:', error);
    }
  };

  // closedropdown
  const closeAllDropdowns = () => {
    setActiveDropdown(null);
    setSettingsVisible(false);
    // closedate pickercleardate，previousSet
    setTempDateRange(null);
  };

  // componentclearstate - per Dashboard
  useEffect(() => {
    return () => {
      setTempDateRange(null);
      setSelectingStartDate(true);
      setActiveDropdown(null);
    };
  }, []);

  // settings buttonstate
  const [settingsVisible, setSettingsVisible] = useState(false);
  
  // Event Filter inputshowstate
  const [eventFilterVisible, setEventFilterVisible] = useState(false);
  
  // MediaSource inputshowstate
  const [mediaSourceVisible, setMediaSourceVisible] = useState(false);
  
  // App ID searchstate
  const [appSearchResults, setAppSearchResults] = useState<any[]>([]);
  const [appSearchLoading, setAppSearchLoading] = useState(false);
  const [appSearchVisible, setAppSearchVisible] = useState(false);
  const [selectedApp, setSelectedApp] = useState<null | { appId: string; appName?: string; iconUrl?: string; os?: string; developer?: string }>(null);
  const searchDebounceRef = useRef<number | null>(null);
  const [inputPosition, setInputPosition] = useState({ top: 0, left: 0, width: 0 });
  const DROPDOWN_WIDTH = 340; // fixeddropdown panelwidth（），Avoidwidth
  const inputRef = useRef<HTMLInputElement>(null);
  const appInfoRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLLabelElement>(null);
  const controlsLeftRef = useRef<HTMLDivElement>(null);
  const [isDateCompact, setIsDateCompact] = useState(false);

  // state
  const [appIds, setAppIds] = useState(formValues.appIds || '');
  const [dataType, setDataType] = useState(formValues.dataType || (isAggregateMode ? 'daily' : DATA_TYPES.INSTALL));

  // clickclosedropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Checkclickdropdown、Set
      if (!target.closest('.custom-dropdown') && 
          !target.closest('[data-settings-selector]')) {
        closeAllDropdowns();
        // Remove setAppSearchVisible(false)，Appshowregionindependent
      }
    };

    if (activeDropdown || settingsVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [activeDropdown, settingsVisible]);

  // listen forwindowscroll，Updatedropdown listposition
  useEffect(() => {
    if (appSearchVisible && appSearchResults.length > 1) {
      const handleResize = () => updateInputPosition();
      const handleScroll = () => updateInputPosition();
      
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll);
      };
    }
  }, [appSearchVisible, appSearchResults.length]);
  const [dateRange, setDateRange] = useState<[moment.Moment, moment.Moment] | null>(null);
  const [eventFilter, setEventFilter] = useState(formValues.eventFilter || '');
  const [mediaSource, setMediaSource] = useState(formValues.mediaSource || '');
  const [accountId, setAccountId] = useState(formValues.accountId || (() => {
    const filteredConfigs = accountConfigs.filter(config => 
      isAggregateMode ? config.accountType === ACCOUNT_TYPES.PRT : true
    );
    return filteredConfigs.length > 0 ? filteredConfigs[0].accountName : '';
  })());
  
  // getdefaultaccount - use useCallback ensurerefs，for
  const getDefaultAccount = useCallback(() => {
    const filteredConfigs = accountConfigs.filter(config => 
      isAggregateMode ? config.accountType === ACCOUNT_TYPES.PRT : true
    );
    return filteredConfigs.length > 0 ? filteredConfigs[0].accountName : '';
  }, [accountConfigs, isAggregateMode, ACCOUNT_TYPES.PRT]);
  
  // computesettings button
  const isSettingsEnabled = useMemo(() => {
    // Event data type：Event Data Retargeting Event
    const isEventType = dataType === DATA_TYPES.EVENT || dataType === DATA_TYPES.RETARGET_EVENT;
    
    // PRT account：Checkcurrentaccount
    const selectedConfig = accountConfigs.find(config => config.accountName === accountId);
    const isPRTAccount = selectedConfig?.accountType === ACCOUNT_TYPES.PRT;
    
    return isEventType || isPRTAccount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataType, accountId, accountConfigs]); // ACCOUNT_TYPES. PRT, DATA_TYPES. EVENT, DATA_TYPES. RETARGET_EVENT constant; omit from deps
  
  // calendarrelatedstate - match Dashboard implementation
  const [currentMonth, setCurrentMonth] = useState(moment().subtract(1, 'day')); // Initialize
  const [tempDateRange, setTempDateRange] = useState<[moment.Moment, moment.Moment] | null>(null);
  const [selectingStartDate, setSelectingStartDate] = useState<boolean>(true); // truedate，falsedate
  
  // date pickerstate
  const [datePickerPosition, setDatePickerPosition] = useState<{
    top: string;
    bottom?: string;
    transform?: string;
    maxHeight?: string;
  }>({ top: '100%' });

  // computedate pickerposition
  const calculateDatePickerPosition = () => {
    if (!containerRef.current) return { top: '100%' };

    const containerRect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const datePickerHeight = 500; // date pickerheight
    const spaceBelow = viewportHeight - containerRect.bottom;
    const spaceAbove = containerRect.top;
    const margin = 20; // note

    // If，show
    if (spaceBelow >= datePickerHeight + margin) {
      return { 
        top: '100%',
        bottom: 'auto',
        maxHeight: '500px'
      };
    }
    
    // Ifnot，show
    if (spaceAbove >= datePickerHeight + margin) {
      return { 
        bottom: '100%',
        top: 'auto',
        maxHeight: '500px'
      };
    }
    
    // Ifnot，
    if (spaceBelow > spaceAbove) {
      return { 
        top: '100%',
        bottom: 'auto',
        maxHeight: `${Math.max(200, spaceBelow - margin)}px` // min200pxheight
      };
    } else {
      return { 
        bottom: '100%',
        top: 'auto',
        maxHeight: `${Math.max(200, spaceAbove - margin)}px` // min200pxheight
      };
    }
  };

  // positioncomputeresults，Avoidcompute
  const [cachedPosition, setCachedPosition] = useState<{
    top: string;
    bottom?: string;
    maxHeight?: string;
  } | null>(null);

  // InitializeSetdefaultYesterdaydate - per Dashboard
  useEffect(() => {
    const today = moment().endOf('day');
    const yesterday = today.subtract(1, 'day');
    setDateRange([yesterday, yesterday]);
    setCurrentMonth(yesterday.clone().startOf('month')); // syncSetcurrentmonth
  }, []);

  // listen fordate pickeropenwindow，Updateposition
  useEffect(() => {
    if (activeDropdown === 'dateRange') {
      // onlyopencomputeposition，fixed
      if (!cachedPosition) {
        const newPosition = calculateDatePickerPosition();
        setDatePickerPosition(newPosition);
        setCachedPosition(newPosition);
      } else {
        // useposition
        setDatePickerPosition(cachedPosition);
      }

      // onlylisten forwindow，notlisten forscroll（Avoiddate）
      const handleResize = () => {
        const newPosition = calculateDatePickerPosition();
        setDatePickerPosition(newPosition);
        setCachedPosition(newPosition);
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    } else {
      // closedate picker
      setCachedPosition(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDropdown]); // cachedPosition state，omit from deps（loop）

  // datedropdownanimation： Dashboard rAF trigger，Avoid“”
  useEffect(() => {
    if (activeDropdown !== 'dateRange') return;
    const element = document.querySelector('[data-home-date-selector-dropdown]') as HTMLElement | null;
    if (!element) return;
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        element.classList.remove('opacity-0', '-translate-y-2.5', 'scale-95');
        element.classList.add('opacity-100', 'translate-y-0', 'scale-100');
      });
    });
    return () => cancelAnimationFrame(raf1);
  }, [activeDropdown]);

  // detect controls-left width，datebuttonusemode
  useEffect(() => {
    const checkControlsWidth = () => {
      if (controlsLeftRef.current) {
        const width = controlsLeftRef.current.offsetWidth;
        // Whenwidth 1000px ，mode
        setIsDateCompact(width < 1000);
      }
    };

    // Check
    checkControlsWidth();

    // listen forwindow
    window.addEventListener('resize', checkControlsWidth);
    
    // use ResizeObserver listen for controls-left
    let resizeObserver: ResizeObserver | null = null;
    const controlsLeftElement = controlsLeftRef.current;
    if (controlsLeftElement && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(checkControlsWidth);
      resizeObserver.observe(controlsLeftElement);
    }

    return () => {
      window.removeEventListener('resize', checkControlsWidth);
      if (resizeObserver && controlsLeftElement) {
        resizeObserver.unobserve(controlsLeftElement);
      }
    };
  }, []);

  // userefformValues，AvoidnotUpdate
  const prevFormValuesRef = useRef<{
    appIds?: string;
    dataType?: string;
    dateRange?: string; // usedate，
    eventFilter?: string;
    mediaSource?: string;
    accountId?: string;
  }>({});
  
  // sync formValues - only，not
  // ，use
  const dateRangeStartStr = formValues.dateRange?.[0]?.format('YYYY-MM-DD');
  const dateRangeEndStr = formValues.dateRange?.[1]?.format('YYYY-MM-DD');
  
  // userefpreviousdateRange，Avoidtogglemonthreset
  const prevDateRangeForMonthRef = useRef<string>('');
  
  useEffect(() => {
    const yesterday = moment().subtract(1, 'day');
    const prev = prevFormValuesRef.current;
    
    // appIds appfilter - onlyUpdate
    const rawAppIds = formValues.appIds || '';
    const filteredAppIds = rawAppIds.replace(/[^a-zA-Z0-9.\-_]/g, '');
    if (filteredAppIds !== prev.appIds) {
      prev.appIds = filteredAppIds;
      setAppIds(filteredAppIds);
    }
    
    // Update dataType，useCheck
    const newDataType = formValues.dataType || (isAggregateMode ? 'daily' : DATA_TYPES.INSTALL);
    // onlyWhennotnotUpdate
    if (newDataType && newDataType !== prev.dataType) {
      prev.dataType = newDataType;
      setDataType(newDataType);
    }
    
    // ensuredatenotdate，datenotdate
    // onlyformValues. dateRangeUpdatedateRange，avoid update loops
    if (formValues.dateRange) {
      // usedate，notyesterday
      let startDate = formValues.dateRange[0];
      let endDate = formValues.dateRange[1];
      
      // onlyCheck，IfSet
      const today = moment().endOf('day');
      if (startDate.isAfter(today)) {
        startDate = yesterday.clone();
      }
      if (endDate.isAfter(today)) {
        endDate = yesterday.clone();
      }
      
      // ensuredatenotdate
      if (startDate.isAfter(endDate)) {
        // Ifdatedate，
        [startDate, endDate] = [endDate, startDate];
      }
      
      // usedate，
      const dateRangeStr = `${startDate.format('YYYY-MM-DD')}_${endDate.format('YYYY-MM-DD')}`;
      
      // onlyWhendatenotalsoUpdate，Avoidloop - onlyprev
      if (dateRangeStr !== prev.dateRange) {
        prev.dateRange = dateRangeStr;
        setDateRange([startDate, endDate]);
      }
    } else if (!prev.dateRange) {
      // onlydateSetdefault
      prev.dateRange = `${yesterday.format('YYYY-MM-DD')}_${yesterday.format('YYYY-MM-DD')}`;
      setDateRange([yesterday, yesterday]);
    }
    
    // onlyUpdate - onlyprev，notstate
    const newEventFilter = formValues.eventFilter || '';
    if (newEventFilter !== prev.eventFilter) {
      prev.eventFilter = newEventFilter;
      setEventFilter(newEventFilter);
    }
    
    const newMediaSource = formValues.mediaSource || '';
    if (newMediaSource !== prev.mediaSource) {
      prev.mediaSource = newMediaSource;
      setMediaSource(newMediaSource);
    }
    
    const newAccountId = formValues.accountId || getDefaultAccount();
    if (newAccountId !== prev.accountId) {
      prev.accountId = newAccountId;
      setAccountId(newAccountId);
    }

    // synccalendarstate - onlyformValues. dateRangeUpdatecurrentMonth
    // Avoidtogglemonthreset
    if (formValues.dateRange && formValues.dateRange[0] && formValues.dateRange[1]) {
      const dateRangeStr = `${formValues.dateRange[0].format('YYYY-MM-DD')}_${formValues.dateRange[1].format('YYYY-MM-DD')}`;
      // onlyWhendateRangesynccurrentMonth
      if (dateRangeStr !== prevDateRangeForMonthRef.current) {
        prevDateRangeForMonthRef.current = dateRangeStr;
        const userMonth = formValues.dateRange[0].clone().startOf('month');
        // onlymonthnotalsoUpdate，AvoidnotUpdate
        setCurrentMonth(prev => {
          if (!prev || !prev.isSame(userMonth, 'month')) {
            return userMonth;
          }
          return prev;
        });
      }
    } else if (!prevDateRangeForMonthRef.current && !currentMonth) {
      // onlyInitializecurrentMonthSet
      prevDateRangeForMonthRef.current = `${yesterday.format('YYYY-MM-DD')}_${yesterday.format('YYYY-MM-DD')}`;
      setCurrentMonth(yesterday.clone().startOf('month'));
    }
  // not currentMonth ，Avoidtogglemonthtriggerreset
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formValues.appIds,
    formValues.dataType,
    formValues.eventFilter,
    formValues.mediaSource,
    formValues.accountId,
    formValues.dateRange,
    dateRangeStartStr,
    dateRangeEndStr,
    isAggregateMode,
    accountConfigs.length,
    selectedAccountType,
    getDefaultAccount,
    DATA_TYPES.INSTALL
  ]);

  // handlemode switchaccount - mergeuseEffect，userefavoid infinite loop
  const accountIdRef = useRef(accountId);
  useEffect(() => {
    accountIdRef.current = accountId;
  }, [accountId]);

  useEffect(() => {
    const filteredConfigs = accountConfigs.filter(config => 
      isAggregateMode ? config.accountType === ACCOUNT_TYPES.PRT : true
    );
    
    if (filteredConfigs.length > 0) {
      // Ifcurrentaccountnotfilter，account
      const currentAccountExists = filteredConfigs.some(config => config.accountName === accountIdRef.current);
      if (!currentAccountExists) {
        const newAccountId = filteredConfigs[0].accountName;
        setAccountId(newAccountId);
        onAccountIdChange(newAccountId);
      }
    } else {
      // Ifaccount，clear
      if (accountIdRef.current !== '') {
        setAccountId('');
        onAccountIdChange('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAggregateMode, accountConfigs, onAccountIdChange]); // ACCOUNT_TYPES. PRT constant; omit from deps

  // handlemode switchdata type - userefavoid infinite loop
  const dataTypeRef = useRef(dataType);
  const isAggregateModeRef = useRef(isAggregateMode);
  
  useEffect(() => {
    dataTypeRef.current = dataType;
  }, [dataType]);

  useEffect(() => {
    // onlymodetoggle
    if (isAggregateModeRef.current !== isAggregateMode) {
      isAggregateModeRef.current = isAggregateMode;
      
      if (isAggregateMode) {
        // Aggregate mode： Aggregate data type
        const firstAggregateType = 'daily';
        setDataType(firstAggregateType);
        onDataTypeChange(firstAggregateType);
      } else {
        // Normal mode： Normal data type
        const firstNormalType = DATA_TYPES.INSTALL;
        setDataType(firstNormalType);
        onDataTypeChange(firstNormalType);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAggregateMode, onDataTypeChange]); // DATA_TYPES. INSTALL constant; omit from deps

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const clearAll = () => {
    const defaultDataType = isAggregateMode ? 'daily' : DATA_TYPES.INSTALL;
    const defaultAccount = getDefaultAccount();
    const yesterday = moment().subtract(1, 'day');
    
    setAppIds('');
    setSelectedApp(null);
    setAppSearchResults([]);
    setAppSearchVisible(false);
    setDataType(defaultDataType);
    setDateRange([yesterday, yesterday]);
    setEventFilter('');
    setMediaSource('');
    setAccountId(defaultAccount);
    
    // resetcalendarstate - per Dashboard
    setTempDateRange(null);
    setSelectingStartDate(true);
    setCurrentMonth(yesterday); // ensureresetSetcurrentmonth
    
    // alsocallback
    onAppIdsChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
    onDataTypeChange(defaultDataType);
    onDateRangeChange([dayjs(yesterday.toDate()), dayjs(yesterday.toDate())]);
    onEventFilterChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
    onMediaSourceChange('');
    onAccountIdChange(defaultAccount);
  };

  // clearAll component
  useImperativeHandle(ref, () => ({
    clearAll
  }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatDate = (date: moment.Moment) => {
    return date.format(DATE_FORMAT);
  };

  // handle App ID - only、、、、
  const handleAppIdsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // onlykeep、、、、，filter
    const filteredValue = value.replace(/[^a-zA-Z0-9.\-_]/g, '');
    
    // ，already App notalreadystate
    if (selectedApp && filteredValue !== selectedApp.appId) {
      setSelectedApp(null);
    }

    // Iffilternot，Updateevent
    if (filteredValue !== value) {
      const filteredEvent = {
        ...e,
        target: {
          ...e.target,
          value: filteredValue
        }
      };
      setAppIds(filteredValue);
      onAppIdsChange(filteredEvent as React.ChangeEvent<HTMLInputElement>);
      // triggerappsearch（）
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = window.setTimeout(() => {
        searchAppInfo(filteredValue);
      }, 300);
    } else {
    setAppIds(value);
    onAppIdsChange(e);
      // triggerappsearch（）
      if (searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
      searchDebounceRef.current = window.setTimeout(() => {
        searchAppInfo(value);
      }, 300);
    }
  };


  // handledata type
  const handleDataTypeChange = (value: string) => {
    // Updatestate
    setDataType(value);
    // use setTimeout ensurestateUpdatecallback
    setTimeout(() => {
    onDataTypeChange(value);
    }, 0);
  };

  // handledate
  const handleDateRangeChange = (dates: [dayjs.Dayjs, dayjs.Dayjs] | null) => {
    if (dates) {
      // use moment modecreatedate，ensurenottransform
      const momentDates = [
        moment(dates[0].format('YYYY-MM-DD'), 'YYYY-MM-DD', true), 
        moment(dates[1].format('YYYY-MM-DD'), 'YYYY-MM-DD', true)
      ] as [moment.Moment, moment.Moment];
      
      
      setDateRange(momentDates);
      onDateRangeChange(dates);
    }
  };

  // time rangecompute - per Dashboard
  const getMonday = (d: moment.Moment) => d.day() === 0 ? d.subtract(6, 'day') : d.day(1);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _getSunday = (d: moment.Moment) => d.day() === 0 ? d : d.day(7);
  const min = (a: moment.Moment, b: moment.Moment) => (a.isBefore(b) ? a : b);

  // handle - per Dashboard
  const handleQuickSelect = (optionValue: string) => {
    try {
      let startDate: moment.Moment, endDate: moment.Moment;
      
      switch (optionValue) {
        case 'today':
          startDate = moment();
          endDate = moment();
          break;
        case 'yesterday':
          startDate = moment().subtract(1, 'day');
          endDate = moment().subtract(1, 'day');
          break;
        case 'last7days':
          startDate = moment().subtract(7, 'day');
          endDate = moment().subtract(1, 'day');
          break;
        case 'lastWeek':
          // getcurrent，
          const currentMonday = getMonday(moment());
          startDate = currentMonday.subtract(1, 'week');
          endDate = startDate.clone().add(6, 'day'); // 6
          break;
        case 'last30days':
          startDate = moment().subtract(30, 'day');
          endDate = moment().subtract(1, 'day');
          break;
        case 'thisMonth':
          startDate = moment().startOf('month');
          endDate = moment().subtract(1, 'day');
          break;
        case 'lastMonth':
          startDate = moment().subtract(1, 'month').startOf('month');
          endDate = min(moment().subtract(1, 'month').endOf('month'), moment().subtract(1, 'day'));
          break;
        default:
          return;
      }
      
      const newDateRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs(startDate.toDate()), dayjs(endDate.toDate())];
      handleDateRangeChange(newDateRange);
      closeAllDropdowns();
    } catch (error) {
      console.error('Error in handleQuickSelect:', error);
    }
  };

  // handlemonth - monthtogglelogic
  // Note：moment，useclone()create，Avoid
  const handleMonthChange = (direction: 'prev' | 'next') => {
    try {
      setCurrentMonth(prev => {
        const newMonth = direction === 'prev' 
          ? prev.clone().subtract(1, 'month').startOf('month')
          : prev.clone().add(1, 'month').startOf('month');
        return newMonth;
      });
    } catch (error) {
      console.error('Error in handleMonthChange:', error);
    }
  };

  // handleeventfilter
  const handleEventFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEventFilter(value);
    onEventFilterChange(e);
  };

  // handle Media Source
  const handleMediaSourceChange = (value: string) => {
    setMediaSource(value);
    onMediaSourceChange(value);
  };

  // Updatedropdown panelcontainerposition（ Searchbar label right，no padding）
  const updateInputPosition = () => {
    if ((inputRef.current || appInfoRef.current) && containerRef.current) {
      const baseEl = inputRef.current ?? appInfoRef.current!;
      const rect = baseEl.getBoundingClientRect();
      const crect = containerRef.current.getBoundingClientRect();
      const lrect = labelRef.current ? labelRef.current.getBoundingClientRect() : crect; // label
      const effectiveWidth = Math.min(DROPDOWN_WIDTH, lrect.width);
      // label right， container coordinate
      const rightInContainer = lrect.right - crect.left;
      const left = Math.max(0, rightInContainer - effectiveWidth);
      setInputPosition({
        top: rect.bottom - crect.top + 4,
        left,
        width: effectiveWidth
      });
    }
  };

  // searchapp：alsosupport App ID App Name search
  const searchAppInfo = async (keyword: string) => {
    if (!keyword || keyword.length < 2) {
      setAppSearchResults([]);
      setAppSearchVisible(false);
      return;
    }

    // alreadyalreadyAPP，Update，notloadingAvoid
    if (!selectedApp) {
      setAppSearchLoading(true);
    }
    try {
      // parallel： appId search + appName search（Remove，getresults）
      const [byIdRes, byNameRes] = await Promise.all([
        fetch(`/api/apps-finder/search/${encodeURIComponent(keyword)}`),
        fetch(`/api/apps-finder?appName=${encodeURIComponent(keyword)}`)
      ]);
      const byIdJson = await byIdRes.json();
      const byNameJson = await byNameRes.json();

      const idList = byIdJson && byIdJson.success ? (byIdJson.data || []) : [];
      // /api/apps-finder { total, data }
      const nameList = Array.isArray(byNameJson) ? byNameJson : (byNameJson?.data || []);

      // mergededupe（ appId），keep appId searchsortprefer
      const mergedMap = new Map<string, any>();
      idList.forEach((item: any) => {
        if (item?.appId) mergedMap.set(item.appId, item);
      });
      nameList.forEach((item: any) => {
        if (item?.appId && !mergedMap.has(item.appId)) mergedMap.set(item.appId, item);
      });
      let merged = Array.from(mergedMap.values());

      const kw = keyword.toLowerCase();
      merged = merged.sort((a: any, b: any) => {
        const aId = (a.appId || '').toLowerCase();
        const bId = (b.appId || '').toLowerCase();
        const aName = (a.appName || '').toLowerCase();
        const bName = (b.appName || '').toLowerCase();
        const aExactId = aId === kw ? 1 : 0;
        const bExactId = bId === kw ? 1 : 0;
        if (aExactId !== bExactId) return bExactId - aExactId;
        const aStarts = aName.startsWith(kw) ? 1 : 0;
        const bStarts = bName.startsWith(kw) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
        const aIncl = aName.includes(kw) ? 1 : 0;
        const bIncl = bName.includes(kw) ? 1 : 0;
        if (aIncl !== bIncl) return bIncl - aIncl;
        return aName.localeCompare(bName);
      });
      // Removeresultscount，showsearchresults

      setAppSearchResults(merged);
      setAppSearchVisible(merged.length > 0);
      // Updateposition
      updateInputPosition();
    } catch (error) {
      console.error('搜索应用信息失败:', error);
      setAppSearchResults([]);
      setAppSearchVisible(false);
    } finally {
      if (!selectedApp) {
        setAppSearchLoading(false);
      }
    }
  };

  // handleaccountID
  const handleAccountIdChange = (value: string) => {
    setAccountId(value);
    onAccountIdChange(value);
  };

  // dropdown panel App，inputnot
  const selectSuggestedApp = (appId: string) => {
    const filteredValue = (appId || '').replace(/[^a-zA-Z0-9.\-_]/g, '');
    // results
    const found = appSearchResults.find((a) => a.appId === appId) || null;
    if (found) {
      setSelectedApp({
        appId: found.appId,
        appName: found.appName,
        iconUrl: found.iconUrl,
        os: found.os,
        developer: found.developer
      });
    } else {
      setSelectedApp({ appId: filteredValue });
    }
    setAppIds(filteredValue);
    onAppIdsChange({ target: { value: filteredValue } } as React.ChangeEvent<HTMLInputElement>);
    setAppSearchVisible(false);
    // focusinput，
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  // dropdownmodalregion：
  const allDataTypeOptions = [
    {
      key: DATA_TYPES.INSTALL,
      icon: <TbDeviceMobileDown style={{ fontSize: 20 }} />, 
      text: 'Install Data'
    },
    {
      key: DATA_TYPES.EVENT,
      icon: <TbDeviceMobileCheck style={{ fontSize: 20 }} />, 
      text: 'Event Data'
    },
    {
      key: DATA_TYPES.RETARGET_INSTALL,
      icon: <TbDeviceMobileDown style={{ fontSize: 20 }} />, 
      text: 'RT Install Data'
    },
    {
      key: DATA_TYPES.RETARGET_EVENT,
      icon: <TbDeviceMobilePlus style={{ fontSize: 20 }} />, 
      text: 'RT Event Data'
    },
  ];

  return (
    <div
      className="apps-finder-search-bar rounded-md"
      style={
        dataFetchDisabled
          ? { position: 'relative', pointerEvents: 'none' as const, opacity: 0.7 }
          : undefined
      }
    >
      {dataFetchDisabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.6)',
            borderRadius: '6px',
            fontSize: '13px',
            color: '#666',
            pointerEvents: 'none',
          }}
        >
          View only — switch to Super Admin to run queries
        </div>
      )}
      {/* main search input area*/}
      <div 
        ref={containerRef} 
        className="search-input-container relative" 
        style={{ zIndex: 9999 }}
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          type="text"
          value={appIds}
          onChange={handleAppIdsChange}
          placeholder={'Search App Name/ID'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-qa-id="search-text-field"
          name="appIds"
          pattern="^[a-zA-Z0-9._\-]+$"
          className="search-input w-full bg-transparent text-base text-gray-800 placeholder:text-gray-400 border-none outline-none focus:outline-none focus:ring-0"
        />
          
          {/* right App showregion - adaptiveright（transition）*/}
          <div 
            ref={appInfoRef}
            className={`app-info-panel ${selectedApp || (appSearchVisible && appSearchResults.length > 0) ? 'visible' : 'hidden'}`}
            style={{
              position: 'absolute',
              top: '0',
              right: '0',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              padding: '0 0 0 16px',
              pointerEvents: 'none',
              background: 'transparent',
              borderRadius: '2px',
              minWidth: '200px',
              maxWidth: '100%'
            }}>
            {appSearchLoading && !selectedApp ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                color: 'rgba(0, 0, 0, 0.48)',
                fontSize: '12px',
                pointerEvents: 'none'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(0, 0, 0, 0.1)',
                  borderTop: '2px solid rgba(0, 0, 0, 0.4)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginRight: '8px'
                }} />
                Searching...
              </div>
            ) : selectedApp ? (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                width: '100%',
                cursor: 'default',
                pointerEvents: 'none'
              }}>
                {/* App Icon */}
                <div style={{
                  width: '28px',
                  height: '28px',
                  marginRight: '10px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: 'rgba(0, 0, 0, 0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {selectedApp.iconUrl ? (
                    <img
                      src={selectedApp.iconUrl}
                      alt={selectedApp.appName}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '18px',
                      height: '18px',
                      background: 'rgba(0, 0, 0, 0.1)',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      color: 'rgba(0, 0, 0, 0.4)'
                    }}>
                      {selectedApp.appName ? selectedApp.appName.charAt(0).toUpperCase() : 'A'}
                    </div>
                  )}
                </div>
                
                {/* App*/}
                <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: 'rgba(0, 0, 0, 0.72)',
                    marginBottom: '1px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {selectedApp.appName || 'Unknown App'}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: 'rgba(0, 0, 0, 0.48)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {selectedApp.appId} • {selectedApp.os || 'Unknown OS'}
                  </div>
                </div>
              
              </div>
            ) : appSearchVisible && appSearchResults.length > 0 ? (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                width: '100%',
                cursor: 'default',
                pointerEvents: 'none'
              }}>
                {/* App Icon */}
                <div style={{
                  width: '28px',
                  height: '28px',
                  marginRight: '10px',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  flexShrink: 0,
                  background: 'rgba(0, 0, 0, 0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {appSearchResults[0].iconUrl ? (
                    <img
                      src={appSearchResults[0].iconUrl}
                      alt={appSearchResults[0].appName}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '18px',
                      height: '18px',
                      background: 'rgba(0, 0, 0, 0.1)',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '9px',
                      color: 'rgba(0, 0, 0, 0.4)'
                    }}>
                      {appSearchResults[0].appName ? appSearchResults[0].appName.charAt(0).toUpperCase() : 'A'}
                    </div>
                  )}
                </div>
                
                {/* App*/}
                <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '500',
                    color: 'rgba(0, 0, 0, 0.72)',
                    marginBottom: '1px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {appSearchResults[0].appName || 'Unknown App'}
                  </div>
                  <div style={{
                    fontSize: '10px',
                    color: 'rgba(0, 0, 0, 0.48)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {appSearchResults[0].appId} • {appSearchResults[0].os || 'Unknown OS'}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          
          {/* dropdownsearchresults - bindcontainer，containerscroll*/}
          {appSearchVisible && appSearchResults.length > 1 && (
            <div className="dropdown-menu app-suggest-menu absolute bg-white border border-gray-200 rounded shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] z-[9998] max-h-[200px] overflow-y-auto" style={{
              top: inputPosition.top,
              left: inputPosition.left,
              width: inputPosition.width
            }}>
              {appSearchResults.map((app, index) => (
                <div
                  key={`${app.appId}-${index}`}
                  style={{
                    padding: '12px 16px',
                    borderBottom: index < appSearchResults.length - 1 ? '1px solid rgba(0, 0, 0, 0.05)' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                  onClick={() => selectSuggestedApp(app.appId)}
                >
                  {/* App Icon */}
                  <div style={{
                    width: '32px',
                    height: '32px',
                    marginRight: '12px',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    flexShrink: 0,
                    background: 'rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {app.iconUrl ? (
                      <img
                        src={app.iconUrl}
                        alt={app.appName}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover'
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '20px',
                        height: '20px',
                        background: 'rgba(0, 0, 0, 0.1)',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '10px',
                        color: 'rgba(0, 0, 0, 0.4)'
                      }}>
                        {app.appName ? app.appName.charAt(0).toUpperCase() : 'A'}
                      </div>
                    )}
                  </div>
                  
                  {/* App*/}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      color: 'rgba(0, 0, 0, 0.72)',
                      marginBottom: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {app.appName || 'Unknown App'}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: 'rgba(0, 0, 0, 0.48)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {app.appId} • {app.os || 'Unknown OS'} • {app.developer || 'Unknown Developer'}
                    </div>
                  </div>
                  
                </div>
              ))}
            </div>
          )}
        </div>

      {/* bottom control section*/}
      <div className="search-controls border-t border-gray-200 flex flex-wrap items-start justify-between">
        {/* leftregion*/}
        <div ref={controlsLeftRef} className="controls-left flex flex-wrap p-4 flex-1 min-w-0 gap-2 items-center min-h-16 overflow-visible relative">
          {/* accountID*/}
          <div className="control-item">
            <div className="custom-dropdown">
              <button 
                className={`control-button dropdown-button flex items-center gap-2 px-3 py-2 border rounded bg-white cursor-pointer text-sm font-medium text-gray-800 min-w-[200px] justify-between transition-all duration-200 h-9 select-none ${
                  activeDropdown === 'accountId' 
                    ? 'border-gray-300 bg-gray-50' 
                    : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
                onClick={() => toggleDropdown('accountId')}
              >
                <div className="account-selector-content">
                  {(() => {
                    const filteredConfigs = accountConfigs.filter(config => 
                      isAggregateMode ? config.accountType === ACCOUNT_TYPES.PRT : true
                    );
                    
                    if (filteredConfigs.length === 0) {
                      return (
                        <div className="no-account-display">
                          <div className="no-account-icon-small">⚠️</div>
                          <span>No Account</span>
                        </div>
                      );
                    }
                    
                    if (accountId) {
                      // usefilterconfigfindaccount，ensure Aggregate modeonlyshow PRT
                      const selectedConfig = filteredConfigs.find(config => config.accountName === accountId);
                      // Ifcurrentaccountnotfilter，show "Select Account ID"
                      if (!selectedConfig) {
                        return <span>Select Account ID</span>;
                      }
                      return (
                        <div className="account-info">
                          {selectedConfig?.customIcon ? (
                            <img 
                              src={selectedConfig.customIcon} 
                              alt={selectedConfig.accountName}
                              className="account-logo"
                            />
                          ) : (
                            <div className="account-logo-placeholder">
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <circle cx="10" cy="10" r="8" fill="rgba(114, 46, 209, 0.1)" stroke="rgba(114, 46, 209, 0.3)" strokeWidth="1"/>
                                <text x="10" y="10" textAnchor="middle" dominantBaseline="central" fontSize="10" fill="rgba(114, 46, 209, 0.6)" fontFamily="Arial, sans-serif">
                                  {selectedConfig?.accountType?.charAt(0) || 'A'}
                                </text>
                              </svg>
                            </div>
                          )}
                          <div className="account-details">
                            <span className="account-name">{accountId}</span>
                          </div>
                        </div>
                      );
                    } else {
                      return <span>Select Account ID</span>;
                    }
                  })()}
                </div>
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="none"
                  style={{
                    transform: activeDropdown === 'accountId' ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </button>
              {activeDropdown === 'accountId' && (
                <div className="dropdown-menu absolute top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] z-[1004] mt-1 min-w-[200px] max-h-[200px] overflow-y-auto">
                  {(() => {
                    const filteredConfigs = accountConfigs.filter(config => 
                      isAggregateMode ? config.accountType === ACCOUNT_TYPES.PRT : true
                    );
                    
                    if (filteredConfigs.length === 0) {
                      return (
                        <div className="dropdown-item no-account-item px-3 py-2 cursor-default opacity-60">
                          <div className="no-account-content flex items-center gap-2 text-gray-500">
                            <div className="no-account-icon text-base flex-shrink-0">⚠️</div>
                            <span>No Account</span>
                          </div>
                        </div>
                      );
                    }
                    
                    return filteredConfigs.map(config => (
                      <div 
                        key={config.id}
                        className="dropdown-item account-option px-3 py-2 text-sm font-medium text-gray-800 cursor-pointer transition-colors duration-200 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 active:bg-gray-100"
                        onClick={() => {
                          handleAccountIdChange(config.accountName);
                          closeAllDropdowns();
                        }}
                      >
                        <div className="account-option-content">
                          {config.customIcon ? (
                            <img 
                              src={config.customIcon} 
                              alt={config.accountName}
                              className="account-option-logo"
                            />
                          ) : (
                            <div className="account-option-logo-placeholder">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" fill="rgba(114, 46, 209, 0.1)" stroke="rgba(114, 46, 209, 0.3)" strokeWidth="1"/>
                                <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fontSize="12" fill="rgba(114, 46, 209, 0.6)" fontFamily="Arial, sans-serif">
                                  {config.accountType?.charAt(0) || 'A'}
                                </text>
                              </svg>
                            </div>
                          )}
                          <div className="account-option-details">
                            <span className="account-option-name">{config.accountName}</span>
                            <span className="account-option-type">
                              {config.accountType === 'PID' ? 'Ad Network | PID' : 
                               config.accountType === 'PRT' ? 'Agency Account | PRT' : 
                               config.accountType}
                            </span>
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* data type*/}
          <div className="control-item">
            <div className="custom-dropdown">
              <button 
                className={`control-button dropdown-button data-type-selector-button flex items-center gap-2 px-3 py-2 border rounded bg-white cursor-pointer text-sm font-medium text-gray-800 w-[170px] justify-between transition-all duration-200 h-9 select-none ${
                  activeDropdown === 'dataType' 
                    ? 'border-gray-300 bg-gray-50' 
                    : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
                onClick={() => toggleDropdown('dataType')}
              >
                <span>
                  {dataType ? (
                    <div className="data-type-selected" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isAggregateMode ? (
                        dataType === 'daily' ? (
                          <TbChartLine style={{ fontSize: 16 }} />
                        ) : dataType === 'partner_daily' ? (
                          <TbChartCircles style={{ fontSize: 16 }} />
                        ) : dataType === 'geo_daily' ? (
                          <TbChartDots3 style={{ fontSize: 16 }} />
                        ) : null
                      ) : (
                        dataType === DATA_TYPES.INSTALL ? (
                          <TbDeviceMobileDown style={{ fontSize: 16 }} />
                        ) : dataType === DATA_TYPES.EVENT ? (
                          <TbDeviceMobileCheck style={{ fontSize: 16 }} />
                        ) : dataType === DATA_TYPES.RETARGET_INSTALL ? (
                          <TbDeviceMobileDown style={{ fontSize: 16 }} />
                        ) : dataType === DATA_TYPES.RETARGET_EVENT ? (
                          <TbDeviceMobilePlus style={{ fontSize: 16 }} />
                        ) : null
                      )}
                      <span>
                        {isAggregateMode ? (
                          dataType === 'daily' ? 'Daily Split' :
                          dataType === 'partner_daily' ? 'Partner Split' :
                          dataType === 'geo_daily' ? 'Geo Split' : dataType
                        ) : (
                          dataType === DATA_TYPES.EVENT ? 'Event Data' :
                          dataType === DATA_TYPES.INSTALL ? 'Install Data' :
                          dataType === DATA_TYPES.RETARGET_EVENT ? 'RT Event Data' :
                          dataType === DATA_TYPES.RETARGET_INSTALL ? 'RT Install Data' : dataType
                        )}
                      </span>
                    </div>
                  ) : null}
                </span>
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="none"
                  style={{
                    transform: activeDropdown === 'dataType' ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </button>
              {activeDropdown === 'dataType' && (
                <div className="dropdown-menu data-type-dropdown-menu absolute top-full left-0 bg-white border border-gray-200 rounded shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] z-[1004] mt-1 w-[170px] max-h-[200px] overflow-y-auto">
                  {isAggregateMode ? (
                    <>
                      <div 
                        className="dropdown-item px-3 py-2 text-sm font-medium text-gray-800 cursor-pointer transition-colors duration-200 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 active:bg-gray-100"
                        onClick={() => {
                          handleDataTypeChange('daily');
                          closeAllDropdowns();
                        }}
                      >
                        <div className="data-type-option flex items-center gap-3">
                          <TbChartLine style={{ fontSize: 16 }} />
                          <span>Daily Split</span>
                        </div>
                      </div>
                      <div 
                        className="dropdown-item px-3 py-2 text-sm font-medium text-gray-800 cursor-pointer transition-colors duration-200 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 active:bg-gray-100"
                        onClick={() => {
                          handleDataTypeChange('partner_daily');
                          closeAllDropdowns();
                        }}
                      >
                        <div className="data-type-option flex items-center gap-3">
                          <TbChartCircles style={{ fontSize: 16 }} />
                          <span>Partner Split</span>
                        </div>
                      </div>
                      <div 
                        className="dropdown-item px-3 py-2 text-sm font-medium text-gray-800 cursor-pointer transition-colors duration-200 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 active:bg-gray-100"
                        onClick={() => {
                          handleDataTypeChange('geo_daily');
                          closeAllDropdowns();
                        }}
                      >
                        <div className="data-type-option flex items-center gap-3">
                          <TbChartDots3 style={{ fontSize: 16 }} />
                          <span>Geo Split</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {allDataTypeOptions.filter(option => option.key !== dataType).map(option => (
                        <div 
                          className="dropdown-item px-3 py-2 text-sm font-medium text-gray-800 cursor-pointer transition-colors duration-200 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 active:bg-gray-100"
                          key={option.key}
                          onClick={() => {
                            handleDataTypeChange(option.key);
                            closeAllDropdowns();
                          }}
                        >
                          <div className="data-type-option flex items-center gap-3">
                            {option.icon}
                            <span>{option.text}</span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* date*/}
          <div className={`control-item date-range-control-item ${isDateCompact ? 'date-compact' : ''}`} style={{ width: isDateCompact ? '36px' : '280px', minWidth: isDateCompact ? '36px' : '280px', maxWidth: isDateCompact ? '36px' : '280px' }}>
            <div className="custom-dropdown" style={{ width: '100%' }}>
              <button 
                className={`control-button dropdown-button flex items-center gap-2 px-3 py-2 border rounded bg-white cursor-pointer text-sm font-medium text-gray-800 w-full justify-between transition-all duration-200 h-9 select-none ${
                  activeDropdown === 'dateRange' 
                    ? 'border-gray-300 bg-gray-50' 
                    : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
                onClick={() => {
                  toggleDropdown('dateRange');
                  // opencurrentdatestate，notreset
                  if (activeDropdown !== 'dateRange') {
                    // resetstatedate
                    setSelectingStartDate(true);
                    
                    // Ifcurrentdate，usecurrentdate
                    if (!tempDateRange && dateRange) {
                      // usecurrentdate，ensurenotdate
                      const today = moment().endOf('day');
                      let startDate = dateRange[0].isAfter(today) ? today.clone().subtract(1, 'day') : dateRange[0];
                      let endDate = dateRange[1].isAfter(today) ? today.clone().subtract(1, 'day') : dateRange[1];
                      
                      // ensuredatenotdate
                      if (startDate.isAfter(endDate)) {
                        [startDate, endDate] = [endDate, startDate];
                      }
                      
                      setTempDateRange([startDate, endDate]);
                      // onlycurrentMonthnotnotcurrentdatein rangeSetmonth
                      setCurrentMonth(prev => {
                        const startMonth = startDate.clone().startOf('month');
                        if (!prev || (!prev.isSame(startMonth, 'month') && !prev.isSame(endDate.clone().startOf('month'), 'month'))) {
                          return startMonth;
                        }
                        return prev;
                      });
                    } else if (!tempDateRange) {
                      // IfdateRange，usedefault
                      const yesterday = moment().subtract(1, 'day');
                      setTempDateRange([yesterday, yesterday]);
                      // onlycurrentMonthnotSetmonth
                      setCurrentMonth(prev => {
                        if (!prev) {
                          return yesterday.clone().startOf('month');
                        }
                        return prev;
                      });
                    }
                  }
                }}
              >
                <div className="date-selector-content" style={{ width: '100%', minWidth: 0 }}>
                  <div className="date-icon">
                    <Calendar size={14} />
                  </div>
                  <div className="date-text" style={{ flex: 1, minWidth: 0, width: '100%' }}>
                    {(() => {
                      const currentRange = tempDateRange || dateRange;
                      
                      
                      if (currentRange) {
                        return `${currentRange[0].format('YYYY-MM-DD')} TO ${currentRange[1].format('YYYY-MM-DD')}`;
                      }
                      return 'Select Date Range';
                    })()}
                  </div>
                </div>
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 12 12" 
                  fill="none"
                  style={{
                    transform: activeDropdown === 'dateRange' ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </button>
              {activeDropdown === 'dateRange' && (
                <div
                  data-home-date-selector-dropdown
                  className={`absolute ${isDateCompact ? 'left-0' : 'right-0'} z-[1004] bg-white text-gray-800 rounded border border-gray-200 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] w-[560px] transform -translate-y-2.5 scale-95 opacity-0 transition-all duration-300 origin-top will-change-transform`}
                  style={{
                    ...datePickerPosition,
                    padding: '12px', // reduce padding
                    display: 'flex',
                    gap: '12px', // reduceregionspacing
                    maxHeight: datePickerPosition.maxHeight || '400px', // reduceheight
                    overflow: 'hidden'
                  }}
                >
                  {/* left*/}
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
                    
                    {/* appbutton*/}
                    <div className="flex gap-1.5 mt-3">
                      <button
                        onClick={() => {
                          if (tempDateRange) {
                            const newDateRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs(tempDateRange[0].toDate()), dayjs(tempDateRange[1].toDate())];
                            handleDateRangeChange(newDateRange);
                            closeAllDropdowns();
                          } else if (dateRange) {
                            // Ifalreadydate，app
                            closeAllDropdowns();
                          } else {
                            // Ifdate，SetYesterday
                            const yesterday = moment().subtract(1, 'day');
                            const newDateRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs(yesterday.toDate()), dayjs(yesterday.toDate())];
                            handleDateRangeChange(newDateRange);
                            closeAllDropdowns();
                          }
                        }}
                        className="date-picker-apply-button"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => {
                          closeAllDropdowns();
                        }}
                        className="date-picker-cancel-button"
                      >
                        Cancel
                      </button>
                    </div>
                    </div>
                    
                  {/* rightdate*/}
                  <div className="custom-date-section">
                    {/* dateshow*/}
                    <div className="date-range-display">
                      {/* dateregion*/}
                      <div 
                        style={{
                          flex: 1,
                          padding: '6px 8px', // reduceheightspacing
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: selectingStartDate ? 'rgb(249, 250, 251)' : 'transparent', /* gray-50 */
                          border: selectingStartDate ? '2px solid rgb(55, 65, 81)' : '2px solid transparent', /* gray-700 */
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
                          // Ifcurrentdate，Initializedefault
                          if (!tempDateRange) {
                            const today = moment();
                            setTempDateRange([today, today]);
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (!selectingStartDate) {
                            e.currentTarget.style.backgroundColor = 'rgb(249, 250, 251)'; /* gray-50 */
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
                          color: 'rgb(107, 114, 128)', /* gray-500 */
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
                          color: 'rgb(31, 41, 55)', /* gray-800 */
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
                      
                      {/* note*/}
                      <div style={{ 
                        padding: '0 8px', 
                        color: 'rgb(156, 163, 175)', /* gray-400 */
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
                      
                      {/* dateregion*/}
                      <div 
                        style={{
                          flex: 1,
                          padding: '6px 8px', // reduceheightspacing
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: !selectingStartDate ? 'rgb(249, 250, 251)' : 'transparent', /* gray-50 */
                          border: !selectingStartDate ? '2px solid rgb(55, 65, 81)' : '2px solid transparent', /* gray-700 */
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
                          // Ifcurrentdate，Initializedefault
                          if (!tempDateRange) {
                            const today = moment();
                            setTempDateRange([today, today]);
                          }
                        }}
                        onMouseEnter={(e) => {
                          if (selectingStartDate) {
                            e.currentTarget.style.backgroundColor = 'rgb(249, 250, 251)'; /* gray-50 */
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
                          color: 'rgb(107, 114, 128)', /* gray-500 */
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
                          color: 'rgb(31, 41, 55)', /* gray-800 */
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
                      
                    {/* month*/}
                    <div style={{ marginTop: '12px' }}> {/* reducetopspacing*/}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '8px' // reducebottomspacing
                      }}>
                          <button
                          onClick={() => handleMonthChange('prev')}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: 'rgb(107, 114, 128)', /* gray-500 */
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                            transition: 'color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'rgb(55, 65, 81)'; /* gray-700 */
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'rgb(107, 114, 128)'; /* gray-500 */
                            }}
                          >
                            ‹
                          </button>
                        <span style={{ 
                          fontSize: '14px', 
                          fontWeight: '500',
                          color: 'rgb(31, 41, 55)', /* gray-800 */
                          fontFamily: '"Museo Sans", sans-serif',
                          userSelect: 'none',
                          WebkitUserSelect: 'none',
                          MozUserSelect: 'none',
                          msUserSelect: 'none'
                        }}>
                          {currentMonth.clone().startOf('month').format('MMMM YYYY')}
                          </span>
                          <button
                          onClick={() => handleMonthChange('next')}
                          style={{
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: 'rgb(107, 114, 128)', /* gray-500 */
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none',
                            transition: 'color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'rgb(55, 65, 81)'; /* gray-700 */
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'rgb(107, 114, 128)'; /* gray-500 */
                            }}
                          >
                            ›
                          </button>
                        </div>
                        
                      {/* calendar*/}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, 1fr)',
                        gap: '4px',
                        paddingBottom: '12px' // increasebottomspacing
                      }}>
                        {/* note*/}
                          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                          <div key={`weekday-${index}`} style={{
                            textAlign: 'center',
                            fontSize: '12px',
                            fontFamily: '"Museo Sans", sans-serif',
                            color: 'rgb(156, 163, 175)', /* gray-400 */
                            padding: '6px 4px', // reduceheight
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none'
                          }}>
                              {day}
                            </div>
                          ))}
                        
                        {/* date*/}
                          {(() => {
                            try {
                            const displayMonth = currentMonth.clone().startOf('month');
                            const startOfMonth = displayMonth.clone();
                            const endOfMonth = displayMonth.clone().endOf('month');
                            const startOfWeek = startOfMonth.startOf('week');
                            const endOfWeek = endOfMonth.endOf('week');
                            
                            const days = [];
                            let day = startOfWeek;
                            let maxDays = 42; // max6，Preventnoloop
                            let dayCount = 0;
                            
                            while ((day.isBefore(endOfWeek) || day.isSame(endOfWeek, 'day')) && dayCount < maxDays) {
                              // useconstants，Avoidrefsloop
                              const cellDate = day.clone();
                              const isCurrentMonth = cellDate.isSame(displayMonth, 'month');
                              const isToday = cellDate.isSame(moment(), 'day');
                              // preferusedate，Ifusealreadyappdate
                              const currentDateRange = tempDateRange || dateRange;
                              const isStartDate = currentDateRange && currentDateRange[0] && cellDate.isSame(currentDateRange[0], 'day');
                              const isEndDate = currentDateRange && currentDateRange[1] && cellDate.isSame(currentDateRange[1], 'day');
                              const isSameDay = currentDateRange && currentDateRange[0] && currentDateRange[1] && 
                                currentDateRange[0].isSame(currentDateRange[1], 'day') && cellDate.isSame(currentDateRange[0], 'day');
                              const isInRange = currentDateRange && currentDateRange[0] && currentDateRange[1] && 
                                cellDate.isAfter(currentDateRange[0]) && cellDate.isBefore(currentDateRange[1]);
                              const isSelected = isStartDate || isEndDate || isSameDay;
                              const isDisabled = cellDate.isAfter(moment().endOf('day'));
                              
                              days.push(
                                <div
                                  key={cellDate.format('YYYY-MM-DD')}
                                  className="calendar-date-cell"
                                  onClick={() => {
                                    try {
                                    if (!isDisabled) {
                                        // ensure tempDateRange ，IfnotInitialize
                                        if (!tempDateRange) {
                                          setTempDateRange([cellDate, cellDate]);
                                          // Initializetoggledatestate
                                          setSelectingStartDate(false);
                                          return;
                                        }
                                        
                                        // currentstateSetdate
                                        if (selectingStartDate) {
                                          // date
                                          if (tempDateRange && tempDateRange[1]) {
                                            // Ifalreadydate，Checkdatedate
                                            if (cellDate.isAfter(tempDateRange[1])) {
                                              // Ifdatedate，dateSetdate，dateSetdate
                                              setTempDateRange([cellDate, cellDate]);
                                            } else {
                                              setTempDateRange([cellDate, tempDateRange[1]]);
                                            }
                                          } else {
                                            // date，Setdate，alsoSetdate（same day）
                                            setTempDateRange([cellDate, cellDate]);
                                          }
                                          // onlydatenotcurrentshowmonthUpdatemonth
                                          if (!cellDate.isSame(currentMonth, 'month')) {
                                            setCurrentMonth(cellDate.clone().startOf('month'));
                                          }
                                          // date，toggledate
                                          setSelectingStartDate(false);
                                        } else {
                                          // date
                                          if (tempDateRange && tempDateRange[0]) {
                                            // Ifalreadydate，Checkdatedate
                                            if (cellDate.isBefore(tempDateRange[0])) {
                                              // Ifdatedate，position
                                              setTempDateRange([cellDate, tempDateRange[0]]);
                                              // onlydatenotcurrentshowmonthUpdatemonth
                                              if (!cellDate.isSame(currentMonth, 'month')) {
                                                setCurrentMonth(cellDate.clone().startOf('month'));
                                              }
                                              // toggledatestate
                                              setSelectingStartDate(true);
                                            } else {
                                              setTempDateRange([tempDateRange[0], cellDate]);
                                              // onlydatenotcurrentshowmonthUpdatemonth
                                              if (!cellDate.isSame(currentMonth, 'month')) {
                                                setCurrentMonth(cellDate.clone().startOf('month'));
                                              }
                                              // date，toggledatestate
                                              setSelectingStartDate(true);
                                            }
                                          } else {
                                            // date，Setdate，alsoSetdate（same day）
                                            setTempDateRange([cellDate, cellDate]);
                                            // onlydatenotcurrentshowmonthUpdatemonth
                                            if (!cellDate.isSame(currentMonth, 'month')) {
                                              setCurrentMonth(cellDate.clone().startOf('month'));
                                            }
                                            // date，toggledatestate
                                            setSelectingStartDate(true);
                                          }
                                        }
                                      }
                                    } catch (error) {
                                      console.error('Error in date selection:', error);
                                    }
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    textAlign: 'center',
                                    padding: '6px 4px', // reduceheight
                                    fontSize: '13px',
                                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                                    borderRadius: '4px',
                                    userSelect: 'none',
                                    WebkitUserSelect: 'none',
                                    MozUserSelect: 'none',
                                    msUserSelect: 'none',
                                    position: 'relative', // ensure S E date
                                    backgroundColor: (() => {
                                      if (isSameDay) return 'rgb(55, 65, 81)'; /* gray-700 - same daygray*/
                                      if (isStartDate) return 'rgb(75, 85, 99)'; /* gray-600 - date*/
                                      if (isEndDate) return 'rgb(75, 85, 99)'; /* gray-600 - date*/
                                      if (isInRange) return 'rgb(243, 244, 246)'; /* gray-100 - in rangegray*/
                                      return 'transparent';
                                    })(),
                                    color: (() => {
                                      if (isSelected) return 'white';
                                      if (isDisabled) return 'rgb(209, 213, 219)'; /* gray-300 */
                                      if (isCurrentMonth) return 'rgb(31, 41, 55)'; /* gray-800 */
                                      return 'rgb(209, 213, 219)'; /* gray-300 */
                                    })(),
                                    fontWeight: isToday ? 'bold' : 'normal',
                                    border: (() => {
                                      if (isToday) return '1px solid rgb(55, 65, 81)'; /* gray-700 */
                                      if (isSameDay) return '2px solid rgb(55, 65, 81)'; /* gray-700 */
                                      if (isStartDate) return '2px solid rgb(55, 65, 81)'; /* gray-700 */
                                      if (isEndDate) return '2px solid rgb(55, 65, 81)'; /* gray-700 */
                                      return '2px solid transparent'; // useborderdimensions
                                    })(),
                                    transition: 'all 0.2s ease'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isDisabled) {
                                      if (isSameDay) {
                                        e.currentTarget.style.backgroundColor = 'rgb(31, 41, 55)'; /* gray-800 -*/
                                      } else if (isStartDate) {
                                        e.currentTarget.style.backgroundColor = 'rgb(55, 65, 81)'; /* gray-700 -*/
                                      } else if (isEndDate) {
                                        e.currentTarget.style.backgroundColor = 'rgb(55, 65, 81)'; /* gray-700 -*/
                                      } else {
                                        e.currentTarget.style.backgroundColor = 'rgb(229, 231, 235)'; /* gray-200 */
                                      }
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isDisabled) {
                                      if (isSameDay) {
                                        e.currentTarget.style.backgroundColor = 'rgb(55, 65, 81)'; /* gray-700 */
                                      } else if (isStartDate) {
                                        e.currentTarget.style.backgroundColor = 'rgb(75, 85, 99)'; /* gray-600 */
                                      } else if (isEndDate) {
                                        e.currentTarget.style.backgroundColor = 'rgb(75, 85, 99)'; /* gray-600 */
                                      } else if (isInRange) {
                                        e.currentTarget.style.backgroundColor = 'rgb(243, 244, 246)'; /* gray-100 */
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
                                        color: 'rgb(255, 255, 255)', /* white -*/
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
                                        color: 'rgb(255, 255, 255)', /* white -*/
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
                              console.error('Error rendering calendar grid:', error);
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

        {/* rightbuttonregion*/}
        <div className="controls-right flex gap-2 p-4 items-center min-h-16 relative">
          {/* Current Mode label*/}
          <span className="text-sm text-gray-600 font-normal mr-1">
            Current Mode: <span className="font-medium text-gray-800">{isAggregateMode ? 'Aggregate' : 'Normal'}</span>
          </span>
          {/* settings button */}
          <div className="relative inline-block" data-settings-selector>
          <button 
            type="button" 
              className={`control-button settings-button flex items-center justify-center w-9 h-9 border rounded transition-all duration-200 ${
                isSettingsEnabled 
                  ? 'enabled bg-white text-gray-800 border-gray-200 hover:bg-gray-50 hover:border-gray-300' 
                  : 'disabled bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
              }`}
              onClick={() => {
                // onlystateresponseclick
                if (isSettingsEnabled) {
                  // closedropdown
                  closeAllDropdowns();
                  // toggleSet
                  setSettingsVisible(!settingsVisible);
                }
              }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M11.4583 5.83333H3.125M11.4583 5.83333C11.4583 4.33697 12.6703 3.125 14.1667 3.125C15.663 3.125 16.875 4.33697 16.875 5.83333C16.875 7.32969 15.663 8.54167 14.1667 8.54167C12.6703 8.54167 11.4583 7.32969 11.4583 5.83333Z" stroke="#262626" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.72" strokeWidth="1.25"></path>
              <path d="M16.875 14.1666H10.2083M10.2083 14.1666C10.2083 15.6629 8.99633 16.8749 7.5 16.8749C6.00365 16.8749 4.79167 15.6629 4.79167 14.1666M10.2083 14.1666C10.2083 12.6703 8.99633 11.4583 7.5 11.4583C6.00365 11.4583 4.79167 12.6703 4.79167 14.1666M4.79167 14.1666H3.125" stroke="#262626" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.72" strokeWidth="1.25"></path>
            </svg>
          </button>
            
            {/* Setpopover*/}
            {settingsVisible && (
              <div
                data-settings-selector-dropdown
                className="absolute top-full left-0 mt-1 z-[1004] bg-white rounded border border-gray-200 shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] w-[280px] min-h-[120px]"
              >
                {/* note*/}
                <div style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none'
                }}>
                  <div style={{
                    fontSize: '12px',
                    color: 'rgba(0, 0, 0, 0.48)',
                    fontWeight: '500',
                    fontFamily: '"Museo Sans", sans-serif'
                  }}>
                    {(() => {
                      const selectedConfig = accountConfigs.find(config => config.accountName === accountId);
                      const isPRTAccount = selectedConfig?.accountType === ACCOUNT_TYPES.PRT;
                      const isEventType = dataType === DATA_TYPES.EVENT || dataType === DATA_TYPES.RETARGET_EVENT;
                      
                      if (isPRTAccount && isEventType) {
                        return 'Event Filter & Media Source Options';
                      } else if (isPRTAccount) {
                        return 'Media Source Options';
                      } else {
                        return 'Event Filter Options';
                      }
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsVisible(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '32px',
                      height: '32px',
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      transition: 'all 0.2s ease',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      MozUserSelect: 'none',
                      msUserSelect: 'none'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.04)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <svg fill="none" height="24" viewBox="0 0 20 20" width="24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6.45801 6.45837L13.5413 13.5417M13.5413 6.45837L6.45801 13.5417" stroke="#262626" strokeLinecap="round" strokeOpacity="0.48" strokeWidth="1.5"></path>
                    </svg>
                  </button>
                </div>
                
                {/* contentregion*/}
                <div style={{
                  padding: '0 20px 20px 20px'
                }}>
                  {/* Media Source (only PRT accountshow)*/}
                  {(() => {
                    const selectedConfig = accountConfigs.find(config => config.accountName === accountId);
                    const isPRTAccount = selectedConfig?.accountType === ACCOUNT_TYPES.PRT;
                    
                    if (isPRTAccount) {
                      return (
                        <div style={{
                          padding: '14px 10px'
                        }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: 'rgba(0, 0, 0, 0.72)',
                            fontFamily: '"Museo Sans", sans-serif',
                            marginBottom: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none'
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center'
                            }}>
                              <div style={{
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: '8px',
                                opacity: 0.64
                              }}>
                                <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M17.5355 13L15.7677 14.7677M15.7677 14.7677L14 16.5355M15.7677 14.7677L14 13M15.7677 14.7677L17.5355 16.5355" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25"></path>
                                  <path d="M10.0451 6.75C9.00955 6.75 8.17008 5.91053 8.17008 4.875C8.17008 3.83947 9.00955 3 10.0451 3C11.0806 3 11.9201 3.83947 11.9201 4.875C11.9201 5.91053 11.0806 6.75 10.0451 6.75ZM10.0451 6.75V8.20833C10.0451 9.12883 10.7913 9.875 11.7118 9.875H14.5451C15.0318 9.875 15.4698 10.0836 15.7745 10.4163M10.0417 6.75V8.20833C10.0417 9.12883 9.29547 9.875 8.375 9.875H5.54167C4.62117 9.875 3.875 10.6212 3.875 11.5417L3.875 13M3.875 13C2.83947 13 2 13.8395 2 14.875C2 15.9105 2.83947 16.75 3.875 16.75C4.91053 16.75 5.75 15.9105 5.75 14.875C5.75 13.8395 4.91053 13 3.875 13Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25"></path>
                                </svg>
                              </div>
                              Media Source
                            </div>
                            
                            {/* togglebutton*/}
                            <button
                              type="button"
                              onClick={() => {
                                if (mediaSourceVisible) {
                                  // Ifshowstate，clickhideclear
                                  setMediaSourceVisible(false);
                                  setMediaSource('');
                                  onMediaSourceChange('');
                                } else {
                                  // Ifhidestate，clickshow
                                  setMediaSourceVisible(true);
                                }
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px 10px',
                                gap: '4px',
                                background: 'rgba(0, 0, 0, 0.04)',
                                border: 'none',
                                borderRadius: '2px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '500',
                                color: 'rgba(38, 38, 38, 1)',
                                fontFamily: '"Museo Sans", sans-serif',
                                transition: 'all 0.2s ease',
                                minHeight: '28px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)';
                              }}
                              onMouseDown={(e) => {
                                e.currentTarget.style.transform = 'scale(0.99)';
                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.07)';
                              }}
                              onMouseUp={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                            >
                              {mediaSourceVisible ? (
                                <>
                                  <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6.45801 6.45837L13.5413 13.5417M13.5413 6.45837L6.45801 13.5417" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25"></path>
                                  </svg>
                                  Clear
                                </>
                              ) : (
                                <>
                                  <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M10 6V14M14 10H6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25"></path>
                                  </svg>
                                  Add
                                </>
                              )}
                            </button>
                          </div>
                          {mediaSourceVisible && (
                            <div style={{
                              display: 'flex',
                              width: '100%',
                              border: '1px solid rgba(0, 0, 0, 0.08)',
                              borderRadius: '2px',
                              overflow: 'hidden',
                              transition: 'all 0.2s ease'
                            }}>
                              <input
                                type="text"
                                value={mediaSource}
                                onChange={(e) => {
                                  // only，filter "int"
                                  let filteredValue = e.target.value.replace(/[^a-z0-9]/g, '');
                                  // filter "int" （）
                                  filteredValue = filteredValue.replace(/int/g, '');
                                  setMediaSource(filteredValue);
                                  onMediaSourceChange(filteredValue);
                                }}
                                placeholder="Enter media source..."
                                style={{
                                  flex: 1,
                                  padding: '6px 8px', // reduceheightspacing
                                  border: 'none',
                                  outline: 'none',
                                  fontSize: '12px',
                                  fontFamily: '"Museo Sans", sans-serif',
                                  color: 'rgba(0, 0, 0, 0.72)',
                                  background: 'transparent'
                                }}
                                onFocus={(e) => {
                                  const container = e.currentTarget.parentElement;
                                  if (container) {
                                    container.style.borderColor = 'rgb(255, 113, 60)';
                                    container.style.boxShadow = '0 0 0 1px rgb(255, 113, 60)';
                                  }
                                }}
                                onBlur={(e) => {
                                  const container = e.currentTarget.parentElement;
                                  if (container) {
                                    container.style.borderColor = 'rgba(0, 0, 0, 0.08)';
                                    container.style.boxShadow = 'none';
                                  }
                                }}
                              />
                              <div style={{
                                padding: '6px 8px', // reduceheightspacing
                                background: 'rgba(0, 0, 0, 0.04)',
                                borderLeft: '1px solid rgba(0, 0, 0, 0.08)',
                                fontSize: '12px',
                                fontFamily: '"Museo Sans", sans-serif',
                                color: 'rgba(0, 0, 0, 0.48)',
                                display: 'flex',
                                alignItems: 'center',
                                whiteSpace: 'nowrap'
                              }}>
                                _int
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                  
                  {/* Event Filter input (only Event show)*/}
                  {(() => {
                    const isEventType = dataType === DATA_TYPES.EVENT || dataType === DATA_TYPES.RETARGET_EVENT;
                    if (isEventType) {
                      return (
                        <div style={{
                          padding: '14px 10px'
                        }}>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: 'rgba(0, 0, 0, 0.72)',
                            fontFamily: '"Museo Sans", sans-serif',
                            marginBottom: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            MozUserSelect: 'none',
                            msUserSelect: 'none'
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center'
                            }}>
                              <div style={{
                                width: '20px',
                                height: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: '8px',
                                opacity: 0.64
                              }}>
                                <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M8.95833 6.04167H14.375M3.125 8.95833H16.875M4.79167 3.125H15.2083C16.1288 3.125 16.875 3.87119 16.875 4.79167V15.2083C16.875 16.1288 16.1288 16.875 15.2083 16.875H4.79167C3.87119 16.875 3.125 16.1288 3.125 15.2083V4.79167C3.125 3.87119 3.87119 3.125 4.79167 3.125ZM6.875 6.04167C6.875 6.38684 6.59517 6.66667 6.25 6.66667C5.90483 6.66667 5.625 6.38684 5.625 6.04167C5.625 5.69649 5.90483 5.41667 6.25 5.41667C6.59517 5.41667 6.875 5.69649 6.875 6.04167Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25"></path>
                                </svg>
                              </div>
                              Event Filter
                            </div>
                            
                            {/* togglebutton*/}
                            <button
                              type="button"
                              onClick={() => {
                                if (eventFilterVisible) {
                                  // Ifshowstate，clickhideclear
                                  setEventFilterVisible(false);
                                  setEventFilter('');
                                  onEventFilterChange({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
                                } else {
                                  // Ifhidestate，clickshow
                                  setEventFilterVisible(true);
                                }
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '6px 10px',
                                gap: '4px',
                                background: 'rgba(0, 0, 0, 0.04)',
                                border: 'none',
                                borderRadius: '2px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: '500',
                                color: 'rgba(38, 38, 38, 1)',
                                fontFamily: '"Museo Sans", sans-serif',
                                transition: 'all 0.2s ease',
                                minHeight: '28px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)';
                              }}
                              onMouseDown={(e) => {
                                e.currentTarget.style.transform = 'scale(0.99)';
                                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.07)';
                              }}
                              onMouseUp={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                              }}
                            >
                              {eventFilterVisible ? (
                                <>
                                  <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6.45801 6.45837L13.5413 13.5417M13.5413 6.45837L6.45801 13.5417" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25"></path>
                                  </svg>
                                  Clear
                                </>
                              ) : (
                                <>
                                  <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M10 6V14M14 10H6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25"></path>
                                  </svg>
                                  Add
                                </>
                              )}
                            </button>
                          </div>
                          {eventFilterVisible && (
                            <input
                              type="text"
                              value={eventFilter}
                              onChange={(e) => {
                                setEventFilter(e.target.value);
                                onEventFilterChange(e);
                              }}
                              placeholder="Enter event name..."
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-700 outline-none transition-all duration-200 focus:border-gray-400 focus:ring-1 focus:ring-gray-200"
                              style={{
                                fontFamily: '"Museo Sans", sans-serif'
                              }}
                            />
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* mode switchbutton*/}
          <button 
            type="button" 
            className={`control-button clear-button flex items-center gap-2 px-4 py-2 border border-gray-200 rounded bg-white text-sm font-medium text-gray-800 transition-all duration-200 h-9 select-none ${
              aggregateModeEnabled
                ? 'cursor-pointer hover:bg-gray-50 hover:border-gray-300'
                : 'cursor-not-allowed opacity-60'
            }`}
            onClick={aggregateModeEnabled ? onAggregateModeToggle : undefined}
            title={aggregateModeEnabled ? 'Switch Mode' : 'Please enable Aggregate Mode in Settings'}
          >
            <svg fill="none" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M8.125 13.9583L11.875 6.04167M4.79167 3.125H15.2083C16.1288 3.125 16.875 3.87119 16.875 4.79167V15.2083C16.875 16.1288 16.1288 16.875 15.2083 16.875H4.79167C3.87119 16.875 3.125 16.1288 3.125 15.2083V4.79167C3.125 3.87119 3.87119 3.125 4.79167 3.125Z" stroke="#262626" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25"></path>
            </svg>
            Switch Mode
          </button>

          {/* search button - style CSS*/}
          <button
            type="button"
            className="control-button search-button"
            onClick={() => {
              // preferuse formValues. dateRange，Ifnotuse dateRange state
              const finalDateRange = formValues.dateRange || dateRange;
              // preferuseright App ；searchresults，；otherwiseinput
              const recognizedAppId = (selectedApp?.appId || (appSearchResults && appSearchResults[0]?.appId) || '').trim();
              const finalAppIds = (recognizedAppId || appIds || '').trim();
              
              onFetchData({
                accountId,
                appIds: finalAppIds || '',
                dataType,
                dateRange: finalDateRange ? [dayjs(finalDateRange[0].format('YYYY-MM-DD')), dayjs(finalDateRange[1].format('YYYY-MM-DD'))] : null,
                eventFilter,
                mediaSource: mediaSource ? `${mediaSource}_int` : '',
              });
            }}
            disabled={dataFetchDisabled || !(selectedApp?.appId || appIds) || isFetching}
          >
            <div className="search-button-content">
              <div className="search-button-text">
                {isFetching ? 'Searching...' : 'Raw Search'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* detailed*/}
      {isExpanded && (
        <div className="search-details">
          <div className="details-grid">

            {/* Media Source (onlyPRTmodeshow)*/}
            {!isAggregateMode && selectedAccountType === ACCOUNT_TYPES.PRT && (
              <div className="detail-item">
                <label className="detail-label">
                  Media Source
                </label>
                <div className="custom-dropdown">
                  <button 
                    className={`detail-dropdown-button ${activeDropdown === 'mediaSource' ? 'dropdown-open' : ''}`}
                    onClick={() => toggleDropdown('mediaSource')}
                  >
                    <span>{mediaSource || 'Select Media Source'}</span>
                    <svg 
                      width="12" 
                      height="12" 
                      viewBox="0 0 12 12" 
                      fill="none"
                      style={{
                        transform: activeDropdown === 'mediaSource' ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}
                    >
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
                    </svg>
                  </button>
                  {activeDropdown === 'mediaSource' && (
                    <div className="dropdown-menu absolute top-full left-0 right-0 bg-white border border-gray-200 rounded shadow-[rgba(3,109,235,0.03)_0px_2px_4px,rgba(3,109,235,0.02)_0px_4px_5px,rgba(3,109,235,0.12)_0px_1px_10px] z-[1004] mt-1 min-w-[200px] max-h-[200px] overflow-y-auto">
                      <div 
                        className="dropdown-item"
                        onClick={() => {
                          handleMediaSourceChange(''); // not 'All Media Source'
                          closeAllDropdowns();
                        }}
                      >
                        All Media Source
                      </div>
                      {accountConfigs
                        .filter(cfg => cfg.accountName === ACCOUNT_TYPES.PID)
                        .map(cfg => (
                          <div 
                            key={cfg.accountName}
                            className="dropdown-item"
                            onClick={() => {
                              handleMediaSourceChange(cfg.accountName);
                              closeAllDropdowns();
                            }}
                          >
                            {cfg.accountName}
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* eventfilter*/}
            {!isAggregateMode && showEventFilter && (
              <div className="detail-item">
                <label className="detail-label">
                  <span className="optional-indicator">?</span>
                  Event Filter
                </label>
                <input
                  type="text"
                  value={eventFilter}
                  onChange={handleEventFilterChange}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  placeholder="Event filter (optional)"
                  className="detail-input"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

DataFetchSearchBar.displayName = 'DataFetchSearchBar';

export default DataFetchSearchBar;
