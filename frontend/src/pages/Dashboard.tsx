import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Select, DatePicker, Space, Spin, message } from 'antd';
import { Line, Column, Pie, DualAxes, Area } from '@ant-design/charts';
import { 
  ArrowUpOutlined, 
  ArrowDownOutlined, 
  UserOutlined, 
  DownloadOutlined,
  EyeOutlined,
  DollarOutlined,
  MobileOutlined,
  AppstoreOutlined
} from '@ant-design/icons';
import { useLanguage } from '../contexts/LanguageContext';
import dayjs, { Dayjs } from 'dayjs';
import { axiosInstance } from '../services/api';

// 账户配置接口
interface AccountConfig {
  id: string;
  accountName: string;
  accountType: 'PID' | 'PRT';
  apiToken: string;
}

// App配置接口
interface AppConfig {
  id: string;
  appName: string;
  appId: string;
  icon?: string;
}

const { RangePicker } = DatePicker;

const Dashboard: React.FC = () => {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('yesterday');
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [isCustomRange, setIsCustomRange] = useState(false);
  
  // 账户配置相关状态
  const [accountConfigs, setAccountConfigs] = useState<AccountConfig[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  
  // App配置相关状态
  const [appConfigs, setAppConfigs] = useState<AppConfig[]>([]);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [appSelectorVisible, setAppSelectorVisible] = useState(false);
  
  // 其他选择器状态
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountSelectorVisible, setAccountSelectorVisible] = useState(false);

  const [dateSelectorVisible, setDateSelectorVisible] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [tempDateRange, setTempDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [selectingStartDate, setSelectingStartDate] = useState<boolean>(true); // true表示选择起始日期，false表示选择结束日期
  const [appSearchText, setAppSearchText] = useState<string>(''); // App搜索文本

  // 时间范围计算函数
  const getMonday = (d: dayjs.Dayjs) => d.day() === 0 ? d.subtract(6, 'day') : d.day(1);
  const getSunday = (d: dayjs.Dayjs) => d.day() === 0 ? d : d.day(7);
  const min = (a: dayjs.Dayjs, b: dayjs.Dayjs) => (a.isBefore(b) ? a : b);

  // 过滤App列表
  const filteredAppConfigs = appConfigs.filter(app => 
    app.appName.toLowerCase().includes(appSearchText.toLowerCase()) ||
    app.appId.toLowerCase().includes(appSearchText.toLowerCase())
  );

  // 获取App选择器的显示文本
  const getAppSelectorText = () => {
    if (selectedApps.length === 0) {
      return 'APP';
    }
    
    if (selectedApps.length === 1) {
      // 只选择一个App，显示App Name
      const selectedApp = appConfigs.find(app => app.appId === selectedApps[0]);
      if (selectedApp) {
        // 如果App Name太长，截断显示
        const appName = selectedApp.appName;
        return appName.length > 15 ? appName.substring(0, 15) + '...' : appName;
      }
      return 'APP';
    }
    
    // 选择多个App，显示"+X APPS"
    return `+${selectedApps.length} APPS`;
  };

  // 页面初始化时设置默认Yesterday日期
  useEffect(() => {
    const today = dayjs().endOf('day');
    const yesterday = today.subtract(1, 'day');
    setDateRange([yesterday, yesterday]);
  }, []);

  // 根据timeRange自动设置dateRange
  useEffect(() => {
    // 如果是自定义模式，不自动设置日期范围
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
        // 获取当前周的周一，然后减去一周得到上周的周一
        const currentMonday = getMonday(dayjs());
        startDate = currentMonday.subtract(1, 'week');
        endDate = startDate.add(6, 'day'); // 从周一开始加6天得到周日
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

  // 加载账户配置
  const loadAccountConfigs = async () => {
    try {
      const response = await axiosInstance.get('/api/auth/account-configs');
      if (response.status === 200) {
        const data = response.data as { configs?: any[] };
        const formattedConfigs = data.configs?.map((config: any) => ({
          id: config.id,
          accountName: config.account_name,
          accountType: config.account_type,
          apiToken: config.api_token
        })) || [];
        
        setAccountConfigs(formattedConfigs);
        
        // 如果有配置，自动选择第一个账户
        if (formattedConfigs.length > 0) {
          const firstConfig = formattedConfigs[0];
          setSelectedAccounts([firstConfig.accountName]);
        }
      } else {
        console.error('获取账户配置失败:', response.statusText);
        message.error('获取账户配置失败');
      }
    } catch (error) {
      console.error('加载账户配置失败:', error);
      message.error('加载账户配置失败');
    }
  };

  // 加载App配置
  const loadAppConfigs = async () => {
    try {
      // 模拟App数据，实际项目中应该从API获取
      const mockAppConfigs: AppConfig[] = [
        { id: '1', appName: 'IndusInd Bank: Savings A/C, FD', appId: 'com.indusind.indie' },
        { id: '2', appName: 'Test App 1', appId: 'com.test.app1' },
        { id: '3', appName: 'Test App 2', appId: 'com.test.app2' },
        { id: '4', appName: 'Test App 3', appId: 'com.test.app3' },
        { id: '5', appName: 'Test App 4', appId: 'com.test.app4' },
      ];
      
      setAppConfigs(mockAppConfigs);
      
              // 如果有配置，自动选择第一个App
        if (mockAppConfigs.length > 0) {
          setSelectedApps([mockAppConfigs[0].appId]);
        }
    } catch (error) {
      console.error('加载App配置失败:', error);
      message.error('加载App配置失败');
    }
  };

  // 组件加载时获取配置
  useEffect(() => {
    loadAccountConfigs();
    loadAppConfigs();
  }, []);

  // 动画效果
  useEffect(() => {
    const element = document.querySelector('[data-app-selector-dropdown]') as HTMLElement;
    if (element) {
      if (appSelectorVisible) {
        // 展开动画
        const timer = setTimeout(() => {
          element.style.transform = 'translateY(0) scale(1)';
          element.style.opacity = '1';
        }, 10);
        return () => clearTimeout(timer);
      } else {
        // 收回动画
        element.style.transform = 'translateY(-10px) scale(0.95)';
        element.style.opacity = '0';
      }
    }
  }, [appSelectorVisible]);

  useEffect(() => {
    const element = document.querySelector('[data-account-selector-dropdown]') as HTMLElement;
    if (element) {
      if (accountSelectorVisible) {
        // 展开动画
        const timer = setTimeout(() => {
          element.style.transform = 'translateY(0) scale(1)';
          element.style.opacity = '1';
        }, 10);
        return () => clearTimeout(timer);
      } else {
        // 收回动画
        element.style.transform = 'translateY(-10px) scale(0.95)';
        element.style.opacity = '0';
      }
    }
  }, [accountSelectorVisible]);

  useEffect(() => {
    const element = document.querySelector('[data-date-selector-dropdown]') as HTMLElement;
    if (element) {
      if (dateSelectorVisible) {
        // 展开动画
        const timer = setTimeout(() => {
          element.style.transform = 'translateY(0) scale(1)';
          element.style.opacity = '1';
        }, 10);
        return () => clearTimeout(timer);
      } else {
        // 收回动画
        element.style.transform = 'translateY(-10px) scale(0.95)';
        element.style.opacity = '0';
      }
    }
  }, [dateSelectorVisible]);

  // 点击外部关闭所有选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-app-selector]')) {
        setAppSelectorVisible(false);
        setAppSearchText(''); // 清空搜索文本
      }
      if (!target.closest('[data-account-selector]')) {
        setAccountSelectorVisible(false);
      }

      if (!target.closest('[data-date-selector]')) {
        setDateSelectorVisible(false);
        setTempDateRange(null);
      }
    };

    if (appSelectorVisible || accountSelectorVisible || dateSelectorVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [appSelectorVisible, accountSelectorVisible, dateSelectorVisible]);

  // 确保至少选择一个App
  useEffect(() => {
    if (selectedApps.length === 0 && appConfigs.length > 0) {
      setSelectedApps([appConfigs[0].appId]);
    }
  }, [selectedApps, appConfigs]);

  // 确保至少选择一个账户
  useEffect(() => {
    if (selectedAccounts.length === 0 && accountConfigs.length > 0) {
      setSelectedAccounts([accountConfigs[0].accountName]);
    }
  }, [selectedAccounts, accountConfigs]);

  // 模拟数据 - 实际项目中这些数据应该从API获取
  const installData = [
    { date: '2024-01-01', installs: 1200, events: 3500 },
    { date: '2024-01-02', installs: 1350, events: 3800 },
    { date: '2024-01-03', installs: 1100, events: 3200 },
    { date: '2024-01-04', installs: 1600, events: 4200 },
    { date: '2024-01-05', installs: 1400, events: 3900 },
    { date: '2024-01-06', installs: 1800, events: 4800 },
    { date: '2024-01-07', installs: 1700, events: 4500 },
  ];

  const mediaSourceData = [
    { source: 'Facebook', installs: 3200, revenue: 45000 },
    { source: 'Google Ads', installs: 2800, revenue: 38000 },
    { source: 'TikTok', installs: 2100, revenue: 29000 },
    { source: 'Apple Search', installs: 1800, revenue: 25000 },
    { source: 'Others', installs: 1200, revenue: 15000 },
  ];

  const countryData = [
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

  // 图表配置
  const lineConfig = {
    data: installData,
    xField: 'date',
    yField: 'installs',
    seriesField: 'type',
    smooth: true,
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
    color: ['#1890ff', '#52c41a'],
    point: {
      size: 5,
      shape: 'diamond',
    },
    tooltip: {
      showCrosshairs: true,
      shared: true,
    },
  };

  const columnConfig = {
    data: mediaSourceData,
    xField: 'source',
    yField: 'installs',
    color: '#1890ff',
    animation: {
      appear: {
        animation: 'fade-in',
        duration: 1000,
      },
    },
    label: {
      position: 'middle',
      style: {
        fill: '#FFFFFF',
        opacity: 0.6,
      },
    },
    meta: {
      installs: {
        alias: language === 'zh' ? '安装量' : 'Installs',
      },
    },
  };

  const pieConfig = {
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
    animation: {
      appear: {
        animation: 'fade-in',
        duration: 1000,
      },
    },
  };

  const dualAxesConfig = {
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
    animation: {
      appear: {
        animation: 'fade-in',
        duration: 1000,
      },
    },
  };

  const areaConfig = {
    data: installData,
    xField: 'date',
    yField: 'events',
    smooth: true,
    areaStyle: {
      fill: 'l(270) 0:#ffffff 0.5:#7ec2f3 1:#1890ff',
    },
    animation: {
      appear: {
        animation: 'fade-in',
        duration: 1000,
      },
    },
  };

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      <Spin spinning={loading}>
        {/* 页面标题和筛选器 */}
        <div style={{ marginBottom: '24px' }}>
          <Row justify="space-between" align="middle">
            <Col>
                                   <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
                       {language === 'zh' ? '自动化数据看板' : 'Automated Data Dashboard'}
                     </h1>
                                   <p style={{ margin: '8px 0 0 0', color: '#666' }}>
                       {language === 'zh' ? '非实时冷数据分析' : 'Non-Real-Time Cold Data Analytics'}
                     </p>
            </Col>
            <Col>
              <Space>
                {/* App选择器 */}
                <div style={{ position: 'relative' }} data-app-selector>
                  <button
                    onClick={() => {
                    setAppSelectorVisible(!appSelectorVisible);
                    if (!appSelectorVisible) {
                      setAppSearchText(''); // 打开时清空搜索文本
                    }
                  }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      background: '#fff',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 300,
                      color: 'rgb(34, 13, 78)',
                      minWidth: '160px',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                      e.currentTarget.style.borderColor = '#bfbfbf';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff';
                      e.currentTarget.style.borderColor = '#d9d9d9';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        width: '16px', 
                        height: '16px', 
                        background: 'linear-gradient(135deg, #52c41a, #389e0d)',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '8px',
                        color: 'white',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}>
                        AP
                      </div>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {getAppSelectorText()}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {selectedApps.length > 0 ? `${selectedApps.length}/${appConfigs.length}` : '0/0'}
                    </span>
                  </button>
                  
                  {appSelectorVisible && (
                    <div
                      data-app-selector-dropdown
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        zIndex: 1000,
                        background: 'rgb(255, 255, 255)',
                        color: 'rgb(34, 13, 78)',
                        boxShadow: 'rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px',
                        borderRadius: '4px',
                        minWidth: '280px',
                        maxHeight: '280px',
                        overflowY: 'auto',
                        fontFamily: '"Museo Sans", sans-serif',
                        fontWeight: 300,
                        fontSize: '13px',
                        lineHeight: '20px',
                        letterSpacing: '0.0025em',
                        WebkitFontSmoothing: 'antialiased',
                        textSizeAdjust: '100%',
                        WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                        outline: 0,
                        border: '1px solid #f0f0f0',
                        transform: 'translateY(-10px) scale(0.95)',
                        opacity: 0,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        transformOrigin: 'top center'
                      }}
                    >
                      {/* 搜索框 */}
                      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <input
                          type="text"
                          placeholder={language === 'zh' ? '搜索应用...' : 'Search Apps...'}
                          value={appSearchText}
                          onChange={(e) => setAppSearchText(e.target.value)}
                          style={{
                            WebkitFontSmoothing: 'antialiased',
                            textSizeAdjust: '100%',
                            outline: 0,
                            font: 'inherit',
                            border: '0px',
                            boxSizing: 'content-box',
                            background: 'none',
                            margin: '0px',
                            WebkitTapHighlightColor: 'transparent',
                            display: 'block',
                            minWidth: '0px',
                            animationName: 'mui-auto-fill-cancel',
                            animationDuration: '10ms',
                            textOverflow: 'ellipsis',
                            width: '100%',
                            height: 'auto',
                            padding: '6px 0px 6px 8px',
                            fontWeight: 300,
                            fontSize: '14px',
                            lineHeight: '18px',
                            letterSpacing: '0.005em',
                            fontFamily: '"Museo Sans", sans-serif',
                            color: 'rgb(34, 13, 78)'
                          }}
                        />
                      </div>
                      
                      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 500, color: 'rgb(34, 13, 78)' }}>
                              {language === 'zh' ? '选择应用' : 'Select APP'}
                            </span>
                            <button
                              onClick={() => {
                                if (selectedApps.length === filteredAppConfigs.length) {
                                  // 如果全部选中，则恢复到默认状态（只选第一个）
                                  setSelectedApps(appConfigs.length > 0 ? [appConfigs[0].appId] : []);
                                } else {
                                  // 否则全选过滤后的列表
                                  setSelectedApps(filteredAppConfigs.map(app => app.appId));
                                }
                              }}
                              style={{
                                padding: '2px 6px',
                                fontSize: '10px',
                                border: '1px solid #d9d9d9',
                                borderRadius: '3px',
                                background: selectedApps.length === filteredAppConfigs.length ? '#1890ff' : '#fff',
                                cursor: 'pointer',
                                color: selectedApps.length === filteredAppConfigs.length ? '#fff' : '#666',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {language === 'zh' ? '全选' : 'Select All'}
                            </button>
                          </div>
                          <span style={{ fontSize: '12px', color: '#666' }}>
                            {selectedApps.length > 0 ? `${selectedApps.length}/${filteredAppConfigs.length}` : '0/0'}
                          </span>
                        </div>
                      </div>
                      
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {filteredAppConfigs.map((app, index) => (
                          <div
                            key={app.id}
                            onClick={() => {
                              // 如果当前项已选中，且只剩一个选择，则不允许取消选择
                              if (selectedApps.includes(app.appId) && selectedApps.length === 1) {
                                return;
                              }
                              
                              const newSelectedApps = selectedApps.includes(app.appId)
                                ? selectedApps.filter(id => id !== app.appId)
                                : [...selectedApps, app.appId];
                              setSelectedApps(newSelectedApps);
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: selectedApps.includes(app.appId) && selectedApps.length === 1 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              borderBottom: '1px solid #f8f8f8',
                              backgroundColor: selectedApps.includes(app.appId) ? '#f6f8ff' : 'transparent',
                              opacity: selectedApps.includes(app.appId) && selectedApps.length === 1 ? 0.7 : 1,
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (!selectedApps.includes(app.appId)) {
                                e.currentTarget.style.backgroundColor = '#fafafa';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!selectedApps.includes(app.appId)) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                          >
                            <div style={{ 
                              width: '20px', 
                              height: '20px', 
                              background: 'linear-gradient(135deg, #52c41a, #389e0d)',
                              borderRadius: '3px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              color: 'white',
                              fontWeight: 'bold'
                            }}>
                              AP
                            </div>
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ 
                                fontSize: '13px', 
                                fontWeight: 400, 
                                color: 'rgb(34, 13, 78)',
                                marginBottom: '2px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {app.appName}
                              </div>
                              <div style={{ 
                                fontSize: '11px', 
                                color: '#666',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {app.appId}
                              </div>
                            </div>
                            
                            {selectedApps.includes(app.appId) && (
                              <div style={{ 
                                width: '16px', 
                                height: '16px', 
                                background: '#1890ff',
                                borderRadius: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* 账户配置选择器 */}
                <div style={{ position: 'relative' }} data-account-selector>
                  <button
                    onClick={() => setAccountSelectorVisible(!accountSelectorVisible)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      background: '#fff',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 300,
                      color: 'rgb(34, 13, 78)',
                      minWidth: '150px',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                      e.currentTarget.style.borderColor = '#bfbfbf';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff';
                      e.currentTarget.style.borderColor = '#d9d9d9';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ 
                        width: '16px', 
                        height: '16px', 
                        background: 'linear-gradient(135deg, #1890ff, #096dd9)',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '8px',
                        color: 'white',
                        fontWeight: 'bold'
                      }}>
                        AC
                      </div>
                      <span>
                        {selectedAccounts.length > 0 
                          ? selectedAccounts.length === 1 
                            ? selectedAccounts[0]
                            : `+${selectedAccounts.length} ${language === 'zh' ? '个账户' : 'Accounts'}`
                          : (language === 'zh' ? '选择账户' : 'Select Account')
                        }
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {selectedAccounts.length > 0 ? `${selectedAccounts.length}/${accountConfigs.length}` : '0/0'}
                    </span>
                  </button>
                  
                  {accountSelectorVisible && (
                    <div
                      data-account-selector-dropdown
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        zIndex: 1000,
                        background: 'rgb(255, 255, 255)',
                        color: 'rgb(34, 13, 78)',
                        boxShadow: 'rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px',
                        borderRadius: '4px',
                        minWidth: '280px',
                        maxHeight: '280px',
                        overflowY: 'auto',
                        fontFamily: '"Museo Sans", sans-serif',
                        fontWeight: 300,
                        fontSize: '13px',
                        lineHeight: '20px',
                        letterSpacing: '0.0025em',
                        WebkitFontSmoothing: 'antialiased',
                        textSizeAdjust: '100%',
                        WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
                        outline: 0,
                        border: '1px solid #f0f0f0',
                        transform: 'translateY(-10px) scale(0.95)',
                        opacity: 0,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        transformOrigin: 'top center'
                      }}
                    >
                      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 500, color: 'rgb(34, 13, 78)' }}>
                              {language === 'zh' ? '选择账户' : 'Select Account'}
                            </span>
                            <button
                              onClick={() => {
                                if (selectedAccounts.length === accountConfigs.length) {
                                  // 如果全部选中，则恢复到默认状态（只选第一个）
                                  setSelectedAccounts(accountConfigs.length > 0 ? [accountConfigs[0].accountName] : []);
                                } else {
                                  // 否则全选
                                  setSelectedAccounts(accountConfigs.map(config => config.accountName));
                                }
                              }}
                              style={{
                                padding: '2px 6px',
                                fontSize: '10px',
                                border: '1px solid #d9d9d9',
                                borderRadius: '3px',
                                background: selectedAccounts.length === accountConfigs.length ? '#1890ff' : '#fff',
                                cursor: 'pointer',
                                color: selectedAccounts.length === accountConfigs.length ? '#fff' : '#666',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              {language === 'zh' ? '全选' : 'Select All'}
                            </button>
                          </div>
                          <span style={{ fontSize: '12px', color: '#666' }}>
                            {selectedAccounts.length > 0 ? `${selectedAccounts.length}/${accountConfigs.length}` : '0/0'}
                          </span>
                        </div>
                      </div>
                      
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {accountConfigs.map((config, index) => (
                          <div
                            key={config.id}
                            onClick={() => {
                              // 如果当前项已选中，且只剩一个选择，则不允许取消选择
                              if (selectedAccounts.includes(config.accountName) && selectedAccounts.length === 1) {
                                return;
                              }
                              
                              const newSelectedAccounts = selectedAccounts.includes(config.accountName)
                                ? selectedAccounts.filter(name => name !== config.accountName)
                                : [...selectedAccounts, config.accountName];
                              setSelectedAccounts(newSelectedAccounts);
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: selectedAccounts.includes(config.accountName) && selectedAccounts.length === 1 ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              borderBottom: '1px solid #f8f8f8',
                              backgroundColor: selectedAccounts.includes(config.accountName) ? '#f6f8ff' : 'transparent',
                              opacity: selectedAccounts.includes(config.accountName) && selectedAccounts.length === 1 ? 0.7 : 1,
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                              if (!selectedAccounts.includes(config.accountName)) {
                                e.currentTarget.style.backgroundColor = '#fafafa';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!selectedAccounts.includes(config.accountName)) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }
                            }}
                          >
                            <div style={{ 
                              width: '20px', 
                              height: '20px', 
                              background: 'linear-gradient(135deg, #1890ff, #096dd9)',
                              borderRadius: '3px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              color: 'white',
                              fontWeight: 'bold'
                            }}>
                              AC
                            </div>
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ 
                                fontSize: '13px', 
                                fontWeight: 400, 
                                color: 'rgb(34, 13, 78)',
                                marginBottom: '2px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {config.accountName}
                              </div>
                              <div style={{ 
                                fontSize: '11px', 
                                color: '#666',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {config.accountType}
                              </div>
                            </div>
                            
                            {selectedAccounts.includes(config.accountName) && (
                              <div style={{ 
                                width: '16px', 
                                height: '16px', 
                                background: '#1890ff',
                                borderRadius: '2px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                  <path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {/* 日期选择器 */}
                <div style={{ position: 'relative' }} data-date-selector>
                  <button
                    onClick={() => {
                    setDateSelectorVisible(!dateSelectorVisible);
                    // 打开时初始化临时日期范围为当前已应用的日期范围
                    if (!dateSelectorVisible && dateRange) {
                      setTempDateRange(dateRange);
                      setSelectingStartDate(true); // 重置为选择起始日期状态
                    }
                  }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      border: '1px solid #d9d9d9',
                      borderRadius: '4px',
                      background: '#fff',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontFamily: '"Museo Sans", sans-serif',
                      fontWeight: 300,
                      color: 'rgb(34, 13, 78)',
                      minWidth: '240px',
                      justifyContent: 'flex-start',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                      e.currentTarget.style.borderColor = '#bfbfbf';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#fff';
                      e.currentTarget.style.borderColor = '#d9d9d9';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ 
                        width: '16px', 
                        height: '16px', 
                        background: 'linear-gradient(135deg, #722ed1, #531dab)',
                        borderRadius: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '8px',
                        color: 'white',
                        fontWeight: 'bold'
                      }}>
                        DT
                      </div>
                      <span>
                        {(isCustomRange && dateRange) || tempDateRange || dateRange
                          ? `${(tempDateRange || dateRange)![0].format('YYYY-MM-DD')} ${language === 'zh' ? '至' : 'TO'} ${(tempDateRange || dateRange)![1].format('YYYY-MM-DD')}`
                          : (language === 'zh' ? '选择日期范围' : 'Select Date Range')
                        }
                      </span>
                    </div>

                  </button>
                  
                  {dateSelectorVisible && (
                    <div
                      data-date-selector-dropdown
                      style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        zIndex: 1000,
                        background: 'rgb(255, 255, 255)',
                        color: 'rgb(34, 13, 78)',
                        boxShadow: 'rgba(3, 109, 235, 0.03) 0px 2px 4px, rgba(3, 109, 235, 0.02) 0px 4px 5px, rgba(3, 109, 235, 0.12) 0px 1px 10px',
                        borderRadius: '4px',
                        border: '1px solid #f0f0f0',
                        transform: 'translateY(-10px) scale(0.95)',
                        opacity: 0,
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        transformOrigin: 'top right',
                        width: '560px',
                        padding: '16px',
                        display: 'flex',
                        gap: '16px'
                      }}
                    >
                      {/* 左侧预设选项 */}
                      <div style={{ 
                        width: '160px',
                        borderRight: '1px solid #f0f0f0',
                        paddingRight: '16px',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        <div style={{ 
                          fontSize: '14px', 
                          fontWeight: '500', 
                          marginBottom: '12px',
                          color: 'rgb(34, 13, 78)'
                        }}>
                          {language === 'zh' ? '快速选择' : 'Quick Select'}
                        </div>
                        <div style={{ flex: 1 }}>
                          {[
                            { value: 'yesterday', label: language === 'zh' ? '昨天' : 'Yesterday' },
                            { value: 'last7days', label: language === 'zh' ? '最近7天' : 'Last 7 days' },
                            { value: 'lastWeek', label: language === 'zh' ? '上周' : 'Last week' },
                            { value: 'last30days', label: language === 'zh' ? '最近30天' : 'Last 30 days' },
                            { value: 'lastMonth', label: language === 'zh' ? '上月' : 'Last month' },
                            { value: 'thisMonth', label: language === 'zh' ? '本月' : 'This month' }
                          ].map((option) => (
                            <div
                              key={option.value}
                              className="quick-select-option"
                              onClick={() => {
                                // 根据预设选项设置日期范围
                                let startDate: dayjs.Dayjs, endDate: dayjs.Dayjs;
                                
                                switch (option.value) {
                                  case 'yesterday':
                                    startDate = dayjs().subtract(1, 'day');
                                    endDate = dayjs().subtract(1, 'day');
                                    break;
                                  case 'last7days':
                                    startDate = dayjs().subtract(7, 'day');
                                    endDate = dayjs().subtract(1, 'day');
                                    break;
                                  case 'lastWeek':
                                    // 获取当前周的周一，然后减去一周得到上周的周一
                                    const currentMonday = getMonday(dayjs());
                                    startDate = currentMonday.subtract(1, 'week');
                                    endDate = startDate.add(6, 'day'); // 从周一开始加6天得到周日
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
                              }}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderRadius: '4px',
                                fontSize: '13px',
                                color: 'rgb(34, 13, 78)',
                                backgroundColor: 'transparent',
                                transition: 'background-color 0.2s ease',
                                marginBottom: '4px'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#f5f5f5';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                              }}
                            >
                              {option.label}
                            </div>
                          ))}
                        </div>
                        
                        {/* 应用和取消按钮 */}
                        <div style={{ 
                          marginTop: '16px',
                          display: 'flex',
                          gap: '8px'
                        }}>
                          <button
                            onClick={() => {
                              if (tempDateRange) {
                                setDateRange(tempDateRange);
                                setIsCustomRange(true);
                                setDateSelectorVisible(false);
                                setTempDateRange(null);
                              } else if (dateRange) {
                                // 如果已经有日期范围但没有临时范围，直接应用
                                setIsCustomRange(true);
                                setDateSelectorVisible(false);
                              } else {
                                // 如果没有日期范围，设置为Yesterday
                                const yesterday = dayjs().subtract(1, 'day');
                                setDateRange([yesterday, yesterday]);
                                setIsCustomRange(true);
                                setDateSelectorVisible(false);
                              }
                            }}
                            style={{
                              WebkitFontSmoothing: 'antialiased',
                              textSizeAdjust: '100%',
                              display: 'inline-flex',
                              WebkitBoxAlign: 'center',
                              alignItems: 'center',
                              WebkitBoxPack: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                              boxSizing: 'border-box',
                              WebkitTapHighlightColor: 'transparent',
                              cursor: 'pointer',
                              userSelect: 'none',
                              verticalAlign: 'middle',
                              appearance: 'none',
                              fontWeight: 400,
                              fontSize: '14px',
                              lineHeight: '20px',
                              letterSpacing: '0.0125em',
                              textTransform: 'none',
                              fontFamily: '"Museo Sans", sans-serif',
                              minWidth: '64px',
                              color: 'rgb(255, 255, 255)',
                              backgroundColor: 'rgb(3, 109, 235)',
                              boxShadow: 'none',
                              outline: '0px',
                              borderWidth: '0px',
                              borderStyle: 'initial',
                              borderColor: 'initial',
                              borderImage: 'initial',
                              margin: '0px',
                              textDecoration: 'none',
                              borderRadius: '4px',
                              transition: 'background-color 250ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1), border-color 250ms cubic-bezier(0.4, 0, 0.2, 1), color 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                              padding: '8px 16px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgb(2, 84, 180)';
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(3, 109, 235, 0.3)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgb(3, 109, 235)';
                              e.currentTarget.style.boxShadow = 'none';
                            }}
                          >
                            {language === 'zh' ? '应用' : 'Apply'}
                          </button>
                          <button
                            onClick={() => {
                              setDateSelectorVisible(false);
                              setTempDateRange(null);
                              // 如果没有自定义选择，重置为Yesterday
                              if (!isCustomRange) {
                                const yesterday = dayjs().subtract(1, 'day');
                                setDateRange([yesterday, yesterday]);
                              }
                            }}
                            style={{
                              WebkitFontSmoothing: 'antialiased',
                              textSizeAdjust: '100%',
                              display: 'inline-flex',
                              WebkitBoxAlign: 'center',
                              alignItems: 'center',
                              WebkitBoxPack: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                              boxSizing: 'border-box',
                              WebkitTapHighlightColor: 'transparent',
                              backgroundColor: 'transparent',
                              cursor: 'pointer',
                              userSelect: 'none',
                              verticalAlign: 'middle',
                              appearance: 'none',
                              fontWeight: 400,
                              fontSize: '14px',
                              lineHeight: '20px',
                              letterSpacing: '0.0125em',
                              textTransform: 'none',
                              fontFamily: '"Museo Sans", sans-serif',
                              minWidth: '64px',
                              color: 'rgb(3, 109, 235)',
                              outline: '0px',
                              borderWidth: '0px',
                              borderStyle: 'initial',
                              borderColor: 'initial',
                              borderImage: 'initial',
                              margin: '0px',
                              textDecoration: 'none',
                              borderRadius: '4px',
                              transition: 'background-color 250ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 250ms cubic-bezier(0.4, 0, 0.2, 1), border-color 250ms cubic-bezier(0.4, 0, 0.2, 1), color 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                              padding: '8px 16px',
                              marginRight: '8px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgb(240, 248, 255)';
                              e.currentTarget.style.color = 'rgb(2, 84, 180)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                              e.currentTarget.style.color = 'rgb(3, 109, 235)';
                            }}
                          >
                            {language === 'zh' ? '取消' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                      
                      {/* 右侧自定义日期输入 */}
                      <div style={{ flex: 1 }}>
                        <div style={{ 
                          fontSize: '14px', 
                          fontWeight: '500', 
                          marginBottom: '12px',
                          color: 'rgb(34, 13, 78)'
                        }}>
                          {language === 'zh' ? '自定义日期' : 'Custom Date Range'}
                        </div>
                        
                        {/* 日期范围显示 */}
                        <div style={{
                          border: '1px solid #d9d9d9',
                          borderRadius: '4px',
                          padding: '12px 16px',
                          background: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '13px',
                          color: 'rgb(34, 13, 78)',
                          position: 'relative'
                        }}>
                          {/* 起始日期区域 */}
                          <div 
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              backgroundColor: selectingStartDate ? '#f0f8ff' : 'transparent',
                              border: selectingStartDate ? '2px solid #1890ff' : '1px solid transparent',
                              transition: 'all 0.2s ease',
                              textAlign: 'center',
                              position: 'relative'
                            }}
                            onClick={() => setSelectingStartDate(true)}
                            onMouseEnter={(e) => {
                              if (!selectingStartDate) {
                                e.currentTarget.style.backgroundColor = '#f5f5f5';
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
                              color: '#666', 
                              marginBottom: '2px',
                              fontWeight: selectingStartDate ? 'bold' : 'normal'
                            }}>
                              {language === 'zh' ? '起始日期' : 'Start Date'}
                            </div>
                            <div style={{ fontWeight: selectingStartDate ? 'bold' : 'normal' }}>
                              {(isCustomRange && dateRange) || tempDateRange || dateRange ? ((tempDateRange || dateRange)![0].format('YYYY-MM-DD')) : 'YYYY-MM-DD'}
                            </div>
                          </div>
                          
                          {/* 分隔符 */}
                          <div style={{ 
                            padding: '0 8px', 
                            color: '#999',
                            fontSize: '16px',
                            fontWeight: 'bold'
                          }}>
                            →
                          </div>
                          
                          {/* 结束日期区域 */}
                          <div 
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              backgroundColor: !selectingStartDate ? '#f0f8ff' : 'transparent',
                              border: !selectingStartDate ? '2px solid #1890ff' : '1px solid transparent',
                              transition: 'all 0.2s ease',
                              textAlign: 'center',
                              position: 'relative'
                            }}
                            onClick={() => setSelectingStartDate(false)}
                            onMouseEnter={(e) => {
                              if (selectingStartDate) {
                                e.currentTarget.style.backgroundColor = '#f5f5f5';
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
                              color: '#666', 
                              marginBottom: '2px',
                              fontWeight: !selectingStartDate ? 'bold' : 'normal'
                            }}>
                              {language === 'zh' ? '结束日期' : 'End Date'}
                            </div>
                            <div style={{ fontWeight: !selectingStartDate ? 'bold' : 'normal' }}>
                              {(isCustomRange && dateRange) || tempDateRange || dateRange ? ((tempDateRange || dateRange)![1].format('YYYY-MM-DD')) : 'YYYY-MM-DD'}
                            </div>
                          </div>
                          

                        </div>
                        
                        {/* 月份选择器 */}
                        <div style={{ marginTop: '16px' }}>
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            marginBottom: '12px'
                          }}>
                            <button
                              onClick={() => {
                                setCurrentMonth(currentMonth.subtract(1, 'month'));
                              }}
                              style={{
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: '16px',
                                color: '#666'
                              }}
                            >
                              ‹
                            </button>
                            <span style={{ 
                              fontSize: '14px', 
                              fontWeight: '500',
                              color: 'rgb(34, 13, 78)'
                            }}>
                              {currentMonth.format('MMMM YYYY')}
                            </span>
                            <button
                              onClick={() => {
                                setCurrentMonth(currentMonth.add(1, 'month'));
                              }}
                              style={{
                                border: 'none',
                                background: 'none',
                                cursor: 'pointer',
                                fontSize: '16px',
                                color: '#666'
                              }}
                            >
                              ›
                            </button>
                          </div>
                          
                          {/* 日历网格 */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            gap: '4px'
                          }}>
                            {/* 星期标题 */}
                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day) => (
                              <div key={day} style={{
                                textAlign: 'center',
                                fontSize: '12px',
                                color: '#999',
                                padding: '8px 4px'
                              }}>
                                {day}
                              </div>
                            ))}
                            
                            {/* 日期网格 */}
                            {(() => {
                              const startOfMonth = currentMonth.startOf('month');
                              const endOfMonth = currentMonth.endOf('month');
                              const startOfWeek = startOfMonth.startOf('week');
                              const endOfWeek = endOfMonth.endOf('week');
                              
                              const days = [];
                              let day = startOfWeek;
                              
                              while (day.isBefore(endOfWeek) || day.isSame(endOfWeek, 'day')) {
                                // 使用局部常量，避免闭包中引用被后续循环修改
                                const cellDate = day;
                                const isCurrentMonth = cellDate.isSame(currentMonth, 'month');
                                const isToday = cellDate.isSame(dayjs(), 'day');
                                // 优先使用临时日期范围，如果没有临时范围则使用已应用的日期范围
                                const currentDateRange = tempDateRange || dateRange;
                                const isStartDate = currentDateRange && currentDateRange[0] && cellDate.isSame(currentDateRange[0], 'day');
                                const isEndDate = currentDateRange && currentDateRange[1] && cellDate.isSame(currentDateRange[1], 'day');
                                const isSameDay = currentDateRange && currentDateRange[0] && currentDateRange[1] && 
                                  currentDateRange[0].isSame(currentDateRange[1], 'day') && cellDate.isSame(currentDateRange[0], 'day');
                                const isInRange = currentDateRange && currentDateRange[0] && currentDateRange[1] && 
                                  cellDate.isAfter(currentDateRange[0]) && cellDate.isBefore(currentDateRange[1]);
                                const isSelected = isStartDate || isEndDate || isSameDay;
                                const isDisabled = cellDate.isAfter(dayjs().subtract(1, 'day'));
                                
                                days.push(
                                  <div
                                    key={cellDate.format('YYYY-MM-DD')}
                                    onClick={() => {
                                      if (!isDisabled) {
                                        // 根据当前选择状态设置起始或结束日期
                                        if (selectingStartDate) {
                                          // 选择起始日期
                                          if (tempDateRange && tempDateRange[1]) {
                                            // 如果已有结束日期，检查新起始日期是否在结束日期之前
                                            if (cellDate.isAfter(tempDateRange[1])) {
                                              // 如果新起始日期在结束日期之后，交换位置
                                              setTempDateRange([tempDateRange[1], cellDate]);
                                            } else {
                                              setTempDateRange([cellDate, tempDateRange[1]]);
                                            }
                                          } else {
                                            // 没有结束日期，设置为起始日期
                                            setTempDateRange([cellDate, cellDate]);
                                          }
                                          // 选择完起始日期后，自动切换到选择结束日期
                                          setSelectingStartDate(false);
                                        } else {
                                          // 选择结束日期
                                          if (tempDateRange && tempDateRange[0]) {
                                            // 如果已有起始日期，检查新结束日期是否在起始日期之后
                                            if (cellDate.isBefore(tempDateRange[0])) {
                                              // 如果新结束日期在起始日期之前，交换位置
                                              setTempDateRange([cellDate, tempDateRange[0]]);
                                            } else {
                                              setTempDateRange([tempDateRange[0], cellDate]);
                                            }
                                          } else {
                                            // 没有起始日期，设置为结束日期
                                            setTempDateRange([cellDate, cellDate]);
                                          }
                                          // 选择完结束日期后，自动切换到选择起始日期
                                          setSelectingStartDate(true);
                                        }
                                      }
                                    }}
                                    style={{
                                      textAlign: 'center',
                                      padding: '8px 4px',
                                      fontSize: '13px',
                                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                                      borderRadius: '4px',
                                      backgroundColor: isSameDay ? '#722ed1' : 
                                                      isStartDate ? '#1890ff' : 
                                                      isEndDate ? '#52c41a' : 
                                                      isInRange ? '#e6f7ff' : 'transparent',
                                      color: isSelected ? 'white' : 
                                             isDisabled ? '#ccc' : 
                                             isCurrentMonth ? 'rgb(34, 13, 78)' : '#ccc',
                                      fontWeight: isToday ? 'bold' : 'normal',
                                      border: isToday ? '1px solid #1890ff' : 
                                               isSameDay ? '2px solid #722ed1' :
                                               isStartDate ? '2px solid #1890ff' :
                                               isEndDate ? '2px solid #52c41a' : 'none',
                                      position: 'relative',
                                      transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!isDisabled) {
                                        if (isSameDay) {
                                          e.currentTarget.style.backgroundColor = '#9254de';
                                        } else if (isStartDate) {
                                          e.currentTarget.style.backgroundColor = '#40a9ff';
                                        } else if (isEndDate) {
                                          e.currentTarget.style.backgroundColor = '#73d13d';
                                        } else {
                                          e.currentTarget.style.backgroundColor = '#f0f0f0';
                                        }
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!isDisabled) {
                                        if (isSameDay) {
                                          e.currentTarget.style.backgroundColor = '#722ed1';
                                        } else if (isStartDate) {
                                          e.currentTarget.style.backgroundColor = '#1890ff';
                                        } else if (isEndDate) {
                                          e.currentTarget.style.backgroundColor = '#52c41a';
                                        } else if (isInRange) {
                                          e.currentTarget.style.backgroundColor = '#e6f7ff';
                                        } else {
                                          e.currentTarget.style.backgroundColor = 'transparent';
                                        }
                                      }
                                    }}
                                  >
                                    <div style={{ position: 'relative' }}>
                                      {cellDate.format('D')}
                                      {isStartDate && !isSameDay && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '-8px',
                                          right: '-8px',
                                          width: '12px',
                                          height: '12px',
                                          background: '#1890ff',
                                          borderRadius: '50%',
                                          fontSize: '8px',
                                          color: 'white',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontWeight: 'bold'
                                        }}>
                                          S
                                        </div>
                                      )}
                                      {isEndDate && !isSameDay && (
                                        <div style={{
                                          position: 'absolute',
                                          top: '-8px',
                                          right: '-8px',
                                          width: '12px',
                                          height: '12px',
                                          background: '#52c41a',
                                          borderRadius: '50%',
                                          fontSize: '8px',
                                          color: 'white',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          fontWeight: 'bold'
                                        }}>
                                          E
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                                
                                day = day.add(1, 'day');
                              }
                              
                              return days;
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Space>
            </Col>
          </Row>
        </div>

                       {/* 统计卡片 */}
               <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                 <Col xs={24} sm={12} lg={6}>
                   <Card style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', borderRadius: '8px' }}>
                     <Statistic
                       title={language === 'zh' ? '安装数' : 'Installs'}
                       value="N/A"
                       prefix={
                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                           <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                             <defs>
                               <linearGradient id="installGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                 <stop offset="0%" style={{ stopColor: '#52c41a', stopOpacity: 1 }} />
                                 <stop offset="100%" style={{ stopColor: '#3f8600', stopOpacity: 1 }} />
                               </linearGradient>
                             </defs>
                             <rect x="4" y="4" width="16" height="16" rx="3" fill="url(#installGradient)" />
                             <path d="M12 9v6M9 12l3 3 3-3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                           </svg>
                           <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#3f8600', background: 'linear-gradient(135deg, #52c41a, #3f8600)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>UA</span>
                         </div>
                       }
                       valueStyle={{ color: '#3f8600' }}
                     />
                   </Card>
                 </Col>
                 <Col xs={24} sm={12} lg={6}>
                   <Card style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', borderRadius: '8px' }}>
                     <Statistic
                       title={language === 'zh' ? '事件数' : 'Events'}
                       value="N/A"
                       prefix={
                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                           <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                             <defs>
                               <linearGradient id="eventGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                 <stop offset="0%" style={{ stopColor: '#52c41a', stopOpacity: 1 }} />
                                 <stop offset="100%" style={{ stopColor: '#3f8600', stopOpacity: 1 }} />
                               </linearGradient>
                             </defs>
                             <rect x="4" y="4" width="16" height="16" rx="2" fill="url(#eventGradient)" />
                             <path d="M8 12h8M12 8v8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                           </svg>
                           <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#3f8600', background: 'linear-gradient(135deg, #52c41a, #3f8600)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>UA</span>
                         </div>
                       }
                       valueStyle={{ color: '#1890ff' }}
                     />
                   </Card>
                 </Col>
                 <Col xs={24} sm={12} lg={6}>
                   <Card style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', borderRadius: '8px' }}>
                     <Statistic
                       title={language === 'zh' ? '再归因安装数' : 'Retarget Installs'}
                       value="N/A"
                       prefix={
                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                           <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                             <defs>
                               <linearGradient id="retargetInstallGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                 <stop offset="0%" style={{ stopColor: '#9254de', stopOpacity: 1 }} />
                                 <stop offset="100%" style={{ stopColor: '#722ed1', stopOpacity: 1 }} />
                               </linearGradient>
                             </defs>
                             <rect x="4" y="4" width="16" height="16" rx="3" fill="url(#retargetInstallGradient)" />
                             <path d="M12 9v6M9 12l3 3 3-3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                           </svg>
                           <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#722ed1', background: 'linear-gradient(135deg, #9254de, #722ed1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>RT</span>
                         </div>
                       }
                       valueStyle={{ color: '#722ed1' }}
                     />
                   </Card>
                 </Col>
                 <Col xs={24} sm={12} lg={6}>
                   <Card style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', borderRadius: '8px' }}>
                     <Statistic
                       title={language === 'zh' ? '再归因事件数' : 'Retarget Events'}
                       value="N/A"
                       prefix={
                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                           <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                             <defs>
                               <linearGradient id="retargetEventGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                 <stop offset="0%" style={{ stopColor: '#9254de', stopOpacity: 1 }} />
                                 <stop offset="100%" style={{ stopColor: '#722ed1', stopOpacity: 1 }} />
                               </linearGradient>
                             </defs>
                             <rect x="4" y="4" width="16" height="16" rx="2" fill="url(#retargetEventGradient)" />
                             <path d="M8 12h8M12 8v8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                           </svg>
                           <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#722ed1', background: 'linear-gradient(135deg, #9254de, #722ed1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>RT</span>
                         </div>
                       }
                       valueStyle={{ color: '#722ed1' }}
                     />
                   </Card>
                 </Col>
               </Row>

                       {/* 图表区域 */}
               <Row gutter={[16, 16]}>
                 {/* 安装趋势图 */}
                 <Col xs={24} lg={12}>
                   <Card
                     title={language === 'zh' ? '安装趋势' : 'Installation Trend'}
                     style={{ height: '400px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', borderRadius: '8px' }}
                   >
                     <Line {...lineConfig} height={300} />
                   </Card>
                 </Col>

                 {/* 媒体来源分布 */}
                 <Col xs={24} lg={12}>
                   <Card
                     title={language === 'zh' ? '媒体来源分布' : 'Media Source Distribution'}
                     style={{ height: '400px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', borderRadius: '8px' }}
                   >
                     <Column {...columnConfig} height={300} />
                   </Card>
                 </Col>

                 {/* 事件类型饼图 */}
                 <Col xs={24} lg={12}>
                   <Card
                     title={language === 'zh' ? '事件类型分布' : 'Event Type Distribution'}
                     style={{ height: '400px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', borderRadius: '8px' }}
                   >
                     <Pie {...pieConfig} height={300} />
                   </Card>
                 </Col>

                 {/* 安装量与收入对比 */}
                 <Col xs={24} lg={12}>
                   <Card
                     title={language === 'zh' ? '安装量与收入对比' : 'Installs vs Revenue'}
                     style={{ height: '400px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', borderRadius: '8px' }}
                   >
                     <DualAxes {...dualAxesConfig} height={300} />
                   </Card>
                 </Col>

                 {/* 事件趋势面积图 */}
                 <Col xs={24}>
                   <Card
                     title={language === 'zh' ? '事件趋势' : 'Event Trend'}
                     style={{ height: '400px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', borderRadius: '8px' }}
                   >
                     <Area {...areaConfig} height={300} />
                   </Card>
                 </Col>
               </Row>
      </Spin>
    </div>
  );
};

export default Dashboard; 