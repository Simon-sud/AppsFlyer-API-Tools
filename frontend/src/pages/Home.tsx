import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Form, DatePicker, Select, Button, message, Table, Space, Modal, Input, Tag, Pagination, Spin, Tooltip, Radio, Skeleton } from 'antd';
import { DownloadOutlined, FileTextOutlined, DeleteOutlined, WifiOutlined, CloseCircleOutlined, LoadingOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { RangePickerProps } from 'antd/es/date-picker';
import moment from 'moment';
import { fetchData, getAccountInfo, FetchDataParams, axiosInstance } from '../services/api';
import { DATA_TYPES, ACCOUNT_TYPES, DATE_FORMAT, DataType, AccountType, isEventType } from '../utils/constants';
import { useLanguage } from '../contexts/LanguageContext';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import weekday from 'dayjs/plugin/weekday';
import { io } from 'socket.io-client';
import { useAccount } from '../contexts/AccountContext';

dayjs.extend(isBetween);
dayjs.extend(weekday);

const { RangePicker } = DatePicker;

interface FormValues {
  accountType: AccountType;
  accountId: string;
  appIds: string;
  dataType: DataType | string; // 支持Aggregate模式下的dataType
  dateRange: [moment.Moment, moment.Moment];
  eventFilter?: string;
  mediaSource?: string; // 新增：用于存储授权渠道
}

interface AccountConfig {
  id: string;
  accountName: string;
  accountType: AccountType;
  apiToken: string;
}

interface DataQueryParams {
  accountName: string;
  accountType: 'PID' | 'PRT';
  dataType: string;
  dateRange: [moment.Moment, moment.Moment];
  appId: string;
}

interface QueryResult {
  key: string;
  appId: string;
  dataType: string;
  dateRange: string;
  status: 'success' | 'error' | 'processing' | 'failed';
  message: string;
  downloadUrl?: string;
  apiResponse?: any;  // 存储API的完整响应
  errorDetails?: any; // 存储错误详情
  appName?: string;
  primaryAttributionCount?: number;
  accountType: string;
  accountId: string;
  imported?: boolean;
  event_filter?: string; // 添加事件过滤字段
  afidDeduplicationCount?: number;
  mediaSource?: string; // 新增：授权渠道/Media Source
  mode?: string; // 添加模式字段
}

interface ApiResponse {
  status: 'success' | 'error';
  message: string;
  downloadUrl?: string;
  details?: any;
  queryId?: string;  // 添加queryId字段
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

// 简洁图标预览按钮组件
const IconPreviewButton: React.FC<{ 
  disabled?: boolean; 
  onClick: () => void;
  loading?: boolean;
}> = ({ disabled = false, onClick, loading = false }) => (
      <button
      onClick={onClick}
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
        height: '32px'
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {loading ? (
        <LoadingOutlined style={{ fontSize: 16, color: '#999' }} />
      ) : (
        /* 网格预览图标 */
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M2.66663 5.33333H5.33329V2.66667H2.66663V5.33333ZM6.66663 13.3333H9.33329V10.6667H6.66663V13.3333ZM5.33329 13.3333H2.66663V10.6667H5.33329V13.3333ZM2.66663 9.33333H5.33329V6.66667H2.66663V9.33333ZM9.33329 9.33333H6.66663V6.66667H9.33329V9.33333ZM10.6666 2.66667V5.33333H13.3333V2.66667H10.6666ZM9.33329 5.33333H6.66663V2.66667H9.33329V5.33333ZM10.6666 9.33333H13.3333V6.66667H10.6666V9.33333ZM13.3333 13.3333H10.6666V10.6667H13.3333V13.3333Z" fill={disabled ? "#999" : "#220D4E"}></path>
        </svg>
      )}
    </button>
);

// AppsFlyer风格下载按钮组件
const AppsFlyerDownloadButton: React.FC<{ 
  disabled?: boolean; 
  onClick: () => void;
  loading?: boolean;
}> = ({ disabled = false, onClick, loading = false }) => (
  <button
    onClick={onClick}
    disabled={disabled || loading}
    style={{
      WebkitFontSmoothing: 'antialiased',
      textSizeAdjust: '100%',
      borderCollapse: 'collapse',
      borderSpacing: '0px',
      fontFamily: 'Museo Sans',
      fontWeight: 300,
      lineHeight: '20px',
      letterSpacing: '0.0025em',
      textAlign: 'center',
      display: 'inline-block',
      fill: 'currentColor',
      flexShrink: 0,
      fontSize: '20px',
      width: '20px',
      height: '20px',
      boxSizing: 'content-box',
      color: disabled ? 'rgba(34, 35, 36, 0.26)' : 'rgba(34, 35, 36, 0.87)',
      userSelect: 'none',
      cursor: disabled ? 'default' : 'pointer',
      transition: 'fill 200ms cubic-bezier(0.4, 0, 0.2, 1)',
      padding: '4px',
      borderRadius: '4px',
      background: 'transparent',
      border: 'none',
      outline: 'none',
      position: 'relative'
    }}
    onMouseEnter={(e) => {
      if (!disabled && !loading) {
        e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        e.currentTarget.style.color = 'rgba(34, 35, 36, 1)';
      }
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'transparent';
      e.currentTarget.style.color = disabled ? 'rgba(34, 35, 36, 0.26)' : 'rgba(34, 35, 36, 0.87)';
    }}
  >
    {loading ? (
      <LoadingOutlined style={{ fontSize: '16px' }} />
    ) : (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ fill: 'currentColor' }}
      >
        <path d="M12 2C12.5523 2 13 2.44772 13 3V13.5858L16.2929 10.2929C16.6834 9.90237 17.3166 9.90237 17.7071 10.2929C18.0976 10.6834 18.0976 11.3166 17.7071 11.7071L12.7071 16.7071C12.3166 17.0976 11.6834 17.0976 11.2929 16.7071L6.29289 11.7071C5.90237 11.3166 5.90237 10.6834 6.29289 10.2929C6.68342 9.90237 7.31658 9.90237 7.70711 10.2929L11 13.5858V3C11 2.44772 11.4477 2 12 2Z"/>
        <path d="M4 20C4 19.4477 4.44772 19 5 19H19C19.5523 19 20 19.4477 20 20C20 20.5523 19.5523 21 19 21H5C4.44772 21 4 20.5523 4 20Z"/>
      </svg>
    )}
  </button>
);

// AppsFlyer风格报表管理按钮组件
const AppsFlyerReportButton: React.FC<{ 
  disabled?: boolean; 
  onClick: () => void;
  loading?: boolean;
  isImported?: boolean;
  status?: string;  // 新增status参数
}> = ({ disabled = false, onClick, loading = false, isImported = false, status = 'processing' }) => {
  // 根据状态和导入状态确定颜色
  const getButtonColor = () => {
    // 真正的禁用状态（加载中、权限不足等）
    if (loading) {
      return 'rgba(34, 35, 36, 0.26)';  // 灰色（真正禁用状态）
    }
    
    // 已导入状态（执行成功且已导入）
    if (isImported) {
      return 'rgb(103, 216, 46)';  // 浅绿色（已完成状态）
    }
    
    // 可用但未导入的状态
    if (status === 'success' && !disabled) {
      return 'rgb(34, 35, 36)';  // 黑色（可用状态，可交互）
    }
    
    // 其他禁用状态
    return 'rgba(34, 35, 36, 0.26)';  // 灰色（禁用状态）
  };

  // 判断按钮是否真正不可交互
  const isTrulyDisabled = loading || (isImported && status === 'success');
  
  // 判断是否应该禁用点击
  const shouldDisableClick = loading || isImported;

  return (
    <button
      onClick={onClick}
      disabled={shouldDisableClick}  // 只在真正需要禁用时禁用
      style={{
        WebkitFontSmoothing: 'antialiased',
        textSizeAdjust: '100%',
        borderCollapse: 'collapse',
        borderSpacing: '0px',
        fontFamily: 'Museo Sans',
        fontWeight: 300,
        lineHeight: '20px',
        letterSpacing: '0.0025em',
        textAlign: 'center',
        userSelect: 'none',
        display: 'inline-block',
        fill: 'currentColor',
        flexShrink: 0,
        fontSize: '20px',
        width: '20px',
        height: '20px',
        color: getButtonColor(),
        boxSizing: 'content-box',
        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        padding: '4px',
        borderRadius: '4px',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        position: 'relative',
        cursor: isTrulyDisabled ? 'not-allowed' : 'pointer',
        opacity: isTrulyDisabled ? 0.6 : 1
      }}
      onMouseEnter={(e) => {
        if (!isTrulyDisabled) {
          e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
          // 悬停时显示稍亮的黑色
          e.currentTarget.style.color = 'rgb(54, 55, 56)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = getButtonColor();
      }}
    >
      {loading ? (
        <LoadingOutlined style={{ fontSize: '16px' }} />
      ) : (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ fill: 'currentColor' }}
        >
          {/* 两个重叠的文档图标 */}
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2Z" opacity="0.3"/>
          <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z"/>
        </svg>
      )}
    </button>
  );
};

// AppsFlyer风格删除按钮组件
const AppsFlyerDeleteButton: React.FC<{ 
  disabled?: boolean; 
  onClick: () => void;
  loading?: boolean;
}> = ({ disabled = false, onClick, loading = false }) => (
  <button
    onClick={onClick}
    disabled={disabled || loading}
    style={{
      WebkitFontSmoothing: 'antialiased',
      borderSpacing: 0,
      borderCollapse: 'collapse',
      boxSizing: 'inherit',
      border: 0,
      cursor: disabled ? 'not-allowed' : 'pointer',
      margin: 0,
      display: 'inline-flex',
      outline: 0,
      position: 'relative',
      alignItems: 'center',
      userSelect: 'none',
      verticalAlign: 'middle',
      justifyContent: 'center',
      textDecoration: 'none',
      backgroundColor: 'transparent',
      WebkitAppearance: 'none',
      WebkitTapHighlightColor: 'transparent',
      flex: '0 0 auto',
      color: disabled ? 'rgba(34,35,36,0.26)' : 'rgba(34,35,36,0.54)',
      overflow: 'visible',
      textAlign: 'center',
      transition: 'background-color 150ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
      borderRadius: '4px',
      fontSize: '1.125rem',
      padding: '6px',
      width: '32px',
      height: '32px'
    }}
    onMouseEnter={(e) => {
      if (!disabled && !loading) {
        e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
        e.currentTarget.style.color = 'rgba(34,35,36,0.87)';
      }
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.backgroundColor = 'transparent';
      e.currentTarget.style.color = disabled ? 'rgba(34,35,36,0.26)' : 'rgba(34,35,36,0.54)';
    }}
  >
    {loading ? (
      <LoadingOutlined style={{ fontSize: '16px' }} />
    ) : (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ fill: 'currentColor' }}
      >
        {/* 垃圾桶图标 */}
        <path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM8 9H16V19H8V9ZM15.5 4L14.5 3H9.5L8.5 4H5V6H19V4H15.5Z"/>
      </svg>
    )}
  </button>
);

// AppsFlyer风格 搜索图标（用于"获取数据"按钮的左侧UI）
const AppsFlyerSearchIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    xmlns="http://www.w3.org/2000/svg"
    style={{
      WebkitFontSmoothing: 'antialiased',
      textSizeAdjust: '100%',
      listStyle: 'none',
      WebkitTapHighlightColor: 'transparent',
      textAlign: 'left',
      fontFamily: 'Museo Sans, sans-serif',
      lineHeight: '20px',
      whiteSpace: 'nowrap',
      letterSpacing: '0.005em',
      fontWeight: 300,
      color: '#FFFFFF',
      boxSizing: 'inherit',
      fill: 'currentColor',
      display: 'inline-block',
      transition: 'fill 200ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
      flexShrink: 0,
      userSelect: 'none',
      fontSize: 16
    }}
  >
    <circle cx="11" cy="11" r="5.5" stroke="currentColor" strokeWidth="2" fill="none" />
    <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// 统一的日志链接组件（用于Log列），确保样式可控且与弹窗点击兼容
const LogLink: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <span
    role="button"
    tabIndex={0}
    onClick={onClick}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') onClick();
    }}
    style={{
      color: '#1677ff',
      cursor: 'pointer',
      display: 'block',
      width: '100%',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      padding: '0 8px',
      borderRadius: 4,
      transition: 'all 0.2s ease',
      fontWeight: 600,
      userSelect: 'none'
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLSpanElement).style.backgroundColor = 'rgba(22, 119, 255, 0.05)';
      (e.currentTarget as HTMLSpanElement).style.color = '#0958d9';
      (e.currentTarget as HTMLSpanElement).style.transform = 'scale(1.02)';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLSpanElement).style.backgroundColor = 'transparent';
      (e.currentTarget as HTMLSpanElement).style.color = '#1677ff';
      (e.currentTarget as HTMLSpanElement).style.transform = 'scale(1)';
    }}
  >
    {children}
  </span>
);

// 统一的分页页码块组件（无外部边缘线，完美居中）
const PageChip: React.FC<{ active: boolean; children: React.ReactNode }> = ({ active, children }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      textAlign: 'center',
      border: 'none', // 删除外部边缘线
      borderRadius: 4,
      margin: 0,
      background: active ? '#722ed1' : '#fff',
      color: active ? '#fff' : '#333',
      cursor: 'pointer',
      fontWeight: active ? 600 : 400,
      boxShadow: 'none', // 确保无外发光/描边
      transition: 'all 0.2s',
      userSelect: 'none',
      verticalAlign: 'middle',
    }}
  >
    {children}
  </span>
);

// 添加数据类型映射
const DATA_TYPE_MAP: Record<DataType | string, (accountType: AccountType) => string> = {
  event: (accountType) => accountType === 'PID' ? 'In-App-Event-Postbacks' : 'In-App-Event-Non-Organic',
  install: (accountType) => accountType === 'PID' ? 'Install-Postbacks' : 'Install-Non-Organic',
  retarget_event: (accountType) => accountType === 'PID' ? 'Retargeting-In-App-Event-Postbacks' : 'Retargeting-In-App-Event-Non-Organic',
  retarget_install: (accountType) => accountType === 'PID' ? 'Retargeting-Install-Postbacks' : 'Retargeting-Install-Non-Organic',
  // Aggregate模式下的数据类型映射
  daily: () => 'Daily-Aggregate',
  partner_daily: () => 'Partner-Daily-Aggregate',
  geo_daily: () => 'GEO-Daily-Aggregate'
};

// 炫酷的模式切换动画组件
const ModeTransitionOverlay: React.FC<{
  visible: boolean;
  fromMode: string;
  toMode: string;
  isLoading: boolean;
  progress: number;
  onComplete: () => void;
}> = ({ visible, fromMode, toMode, isLoading, progress, onComplete }) => {
  const [animationPhase, setAnimationPhase] = useState<'start' | 'middle' | 'end'>('start');
  const [particles, setParticles] = useState<Array<{id: number, x: number, y: number, vx: number, vy: number, color: string}>>([]);
  
  useEffect(() => {
    if (visible) {
      // 生成粒子效果
      const newParticles = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        color: ['#1890ff', '#52c41a', '#faad14', '#f5222d'][Math.floor(Math.random() * 4)]
      }));
      setParticles(newParticles);
      
      // 动画序列 - 等待进度条触发翻转
      setAnimationPhase('start');
      setTimeout(() => setAnimationPhase('middle'), 300);
    }
  }, [visible]);

  // 监听加载完成状态
  useEffect(() => {
    if (visible && !isLoading && progress >= 100) {
      setAnimationPhase('end');
      setTimeout(() => {
        onComplete();
        setAnimationPhase('start');
      }, 300);
    }
  }, [visible, isLoading, progress, onComplete]);

  // 监听进度变化，在进度达到80%时开始翻转
  useEffect(() => {
    if (visible && progress >= 80 && animationPhase === 'middle') {
      setAnimationPhase('end');
    }
  }, [visible, progress, animationPhase]);

  // 粒子动画
  useEffect(() => {
    if (!visible || animationPhase !== 'middle') return;
    
    const interval = setInterval(() => {
      setParticles(prev => prev.map(particle => ({
        ...particle,
        x: particle.x + particle.vx,
        y: particle.y + particle.vy,
        vx: particle.vx * 0.98,
        vy: particle.vy * 0.98
      })));
    }, 16);
    
    return () => clearInterval(interval);
  }, [visible, animationPhase]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(10px)',
        transition: 'all 0.3s ease'
      }}
    >
      {/* 粒子效果 */}
      {particles.map(particle => (
        <div
          key={particle.id}
          style={{
            position: 'absolute',
            left: particle.x,
            top: particle.y,
            width: '4px',
            height: '4px',
            backgroundColor: particle.color,
            borderRadius: '50%',
            boxShadow: `0 0 10px ${particle.color}`,
            opacity: animationPhase === 'middle' ? 1 : 0,
            transition: 'opacity 0.3s ease'
          }}
        />
      ))}
      
            {/* 中心切换动画 */}
      <div
        style={{
          textAlign: 'center',
          color: 'white',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}
      >
        {/* 标题内容 - 翻转动画 */}
        <div
          style={{
            transform: animationPhase === 'middle' ? 'scale(1.2) rotateY(180deg)' : 'scale(1) rotateY(0deg)',
            transition: 'all 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
            perspective: '1000px',
            marginBottom: '20px'
          }}
        >
          <div
            style={{
              fontSize: '48px',
              fontWeight: 'bold',
              textShadow: '0 0 20px rgba(255, 255, 255, 0.5)',
              opacity: animationPhase === 'start' ? 1 : animationPhase === 'middle' ? 0.3 : 1
            }}
          >
            {animationPhase === 'start' ? fromMode : animationPhase === 'middle' ? fromMode : toMode}
          </div>
        </div>
        
        {/* 进度条描述文本 - 固定不翻转 */}
        <div
          style={{
            fontSize: '24px',
            marginBottom: '20px',
            opacity: isLoading ? 1 : 0,
            transition: 'opacity 0.3s ease',
            textShadow: '0 0 10px rgba(255, 255, 255, 0.3)'
          }}
        >
          {isLoading ? 'Loading Data...' : 'Switching Mode...'}
        </div>
        
        {/* 进度条 - 固定不翻转 */}
        <div
          style={{
            width: '200px',
            height: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '2px',
            margin: '0 auto',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: 'linear-gradient(90deg, #1890ff, #52c41a)',
              borderRadius: '2px',
              transition: 'width 0.3s ease',
              background: 'linear-gradient(90deg, #1890ff, #52c41a)'
            }}
          />
        </div>
      </div>
    </div>
  );
};

const Home: React.FC = () => {
  const [form] = Form.useForm<FormValues>();
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(true); // 初始状态设为true，显示Loading
  const [accountInfo, setAccountInfo] = useState<any>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const { translations, language } = useLanguage();
  const [selectedAccountType, setSelectedAccountType] = useState<AccountType | undefined>(undefined);
  const { accountConfigs: cachedConfigs, loading: cacheLoading } = useAccount();
  
  // 新增：Aggregate Mode设置状态（从Settings页面读取）
  const [aggregateModeEnabled, setAggregateModeEnabled] = useState(() => {
    const fraudModeSetting = localStorage.getItem('appsflyerTokenValidate');
    return fraudModeSetting === 'ON';
  });
  
  // 新增：Aggregate模式状态（强制从Normal模式开始）
  const [isAggregateMode, setIsAggregateMode] = useState(() => {
    const fraudModeSetting = localStorage.getItem('appsflyerTokenValidate');
    
    // 如果Aggregate Mode设置为OFF，强制返回false
    if (fraudModeSetting !== 'ON') {
      return false;
    }
    
    // 强制从Normal模式开始，不读取保存的模式
    // 只有用户手动切换后才能进入Aggregate模式
    return false;
  });

  // 模式切换动画状态
  const [showTransition, setShowTransition] = useState(false);
  const [transitionFrom, setTransitionFrom] = useState('');
  const [transitionTo, setTransitionTo] = useState('');
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0);

  // 强制从Normal模式开始，防止缓存问题
  useEffect(() => {
    const fraudModeSetting = localStorage.getItem('appsflyerTokenValidate');
    
    // 无论什么情况，都强制设置为Normal模式
    setIsAggregateMode(false);
    localStorage.removeItem('aggregateMode'); // 清除保存的模式
    localStorage.removeItem('userManuallySwitched'); // 清除手动切换标记
    
    console.log('强制重置为Normal模式，不缓存任何模式切换状态');
  }, []); // 只在组件挂载时执行一次

  // 监听页面可见性变化，确保页面重新获得焦点时也强制重置
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // 页面重新可见时，强制重置为Normal模式
        setIsAggregateMode(false);
        localStorage.removeItem('aggregateMode');
        localStorage.removeItem('userManuallySwitched');
        console.log('页面重新可见，强制重置为Normal模式');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // 监听storage变化，确保其他页面修改localStorage时也强制重置
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'aggregateMode' || e.key === 'userManuallySwitched') {
        // 当其他页面修改了模式相关的localStorage时，强制重置
        setIsAggregateMode(false);
        localStorage.removeItem('aggregateMode');
        localStorage.removeItem('userManuallySwitched');
        console.log('检测到storage变化，强制重置为Normal模式');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // 监听页面卸载事件，确保页面关闭时清除模式状态
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 页面卸载时清除模式状态
      localStorage.removeItem('aggregateMode');
      localStorage.removeItem('userManuallySwitched');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // 监听页面焦点事件，确保页面重新获得焦点时强制重置
  useEffect(() => {
    const handleFocus = () => {
      // 页面重新获得焦点时，强制重置为Normal模式
      setIsAggregateMode(false);
      localStorage.removeItem('aggregateMode');
      localStorage.removeItem('userManuallySwitched');
      console.log('页面重新获得焦点，强制重置为Normal模式');
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);


  const [accountConfigs, setAccountConfigs] = useState<AccountConfig[]>([]);
  const [queryResults, setQueryResults] = useState<QueryResult[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentDetail, setCurrentDetail] = useState<QueryResult | null>(null);
  const [queriedAppName, setQueriedAppName] = useState<string | null>(null);
  const [deleteConfirmModalVisible, setDeleteConfirmModalVisible] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<QueryResult | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [selectedPreviewRecord, setSelectedPreviewRecord] = useState<QueryResult | null>(null);
  const [previewing, setPreviewing] = useState<Record<string, boolean>>({});
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [highlightType, setHighlightType] = useState<'success' | 'processing' | 'failed' | 'error' | null>(null);
  const tableBodyRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const queryInProgressRef = useRef(false);

  // 分页相关
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 6;
  const MAX_RECORDS = 18;

  // 账户唯一key
  const getAccountRecordKey = (accountId: string, accountType: string) => `queryResults_${accountType}_${accountId}`;

  // 加载数据的函数
    const loadData = async () => {
      // 防止重复请求
      if (isLoadingRef.current) {
        console.log('请求正在进行中，跳过重复请求');
        return;
      }
      
      isLoadingRef.current = true;
      setTableLoading(true);
      
      try {
        // 先清空当前查询结果，确保状态一致
        setQueryResults([]);
        setCurrentPage(1);
        
        // 等待状态更新完成
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // 根据当前模式决定请求参数
        const modeParam = isAggregateMode ? 'aggregate' : 'normal';
        
        const response = await axiosInstance.get<{
          status: string;
          data: QueryResult[];
        }>('/api/query-results', {
          params: {
            mode: modeParam
          }
        });

        if (response.data.status === 'success') {
          const formattedResults = response.data.data.map(record => {
            const newRecord: QueryResult = { ...record };
            const details = record.apiResponse?.details;
            if (details) {
              if (details.appName) newRecord.appName = details.appName;
              if (typeof details.afidDeduplicationCount === 'number') newRecord.afidDeduplicationCount = details.afidDeduplicationCount;
              if (typeof details.primaryAttributionCount === 'number') newRecord.primaryAttributionCount = details.primaryAttributionCount;
            }
          // 保持原始的mode字段，不进行覆盖
            return newRecord;
          });
          console.log('设置查询结果，数量:', formattedResults.length);
          console.log('查询结果详情:', formattedResults.map(r => ({
            key: r.key,
            status: r.status,
            mode: r.mode,
            appId: r.appId,
            dataType: r.dataType
          })));
        console.log('当前模式:', modeParam);
          
          // 对同条件记录进行去重，只保留优先级最高的记录
          const statusPriority = { success: 3, processing: 2, failed: 1, error: 0 };
          const uniqueMap = new Map<string, QueryResult>();
          
          for (const record of formattedResults) {
          // 使用原始的mode字段，不进行覆盖
          const recordMode = record.mode;
          
            // 构建唯一键：accountType + accountId + appId + dataType + fromDate + toDate + event_filter + mode
            const key = [
              record.accountType,
              record.accountId,
              record.appId,
              record.dataType,
              record.dateRange.split(/至|TO/)[0]?.trim() || '', // fromDate
              record.dateRange.split(/至|TO/)[1]?.trim() || '', // toDate
              record.event_filter || '',
            recordMode
            ].join('|');
            
            // 如果不存在该键，或者当前记录优先级更高，则更新
            if (!uniqueMap.has(key) || statusPriority[record.status] > statusPriority[uniqueMap.get(key)!.status]) {
            // 保持原始的mode字段
            const updatedRecord = { ...record };
            uniqueMap.set(key, updatedRecord);
            }
          }
          
          const dedupedResults = Array.from(uniqueMap.values());
          console.log('去重后查询结果，数量:', dedupedResults.length);
          console.log('去重后详情:', dedupedResults.map(r => ({
            key: r.key,
            status: r.status,
            mode: r.mode,
            appId: r.appId,
            dataType: r.dataType
          })));
          
          setQueryResults(dedupedResults);
        } else {
          setQueryResults([]);
        }
      } catch (error) {
        console.error('加载查询结果失败:', error);
        setQueryResults([]);
      } finally {
        setTableLoading(false);
        isLoadingRef.current = false;
      }
    };
    
  // 从localStorage加载账户配置
  useEffect(() => {
    const loadAccountConfigs = async () => {
      try {
        // 如果缓存中有数据，直接使用缓存数据
        if (cachedConfigs.length > 0) {
          console.log('使用缓存的账户配置:', cachedConfigs);
          const formattedConfigs = cachedConfigs.map((config: any) => ({
            id: config.id,
            accountName: config.account_name,
            accountType: config.account_type,
            apiToken: config.api_token
          }));
          
          setAccountConfigs(formattedConfigs);
          
          // 如果有配置，自动选择第一个账户类型
          if (formattedConfigs.length > 0) {
            const firstConfig = formattedConfigs[0];
            setSelectedAccountType(firstConfig.accountType);
            form.setFieldsValue({
              accountType: firstConfig.accountType,
              accountId: firstConfig.accountName
            });
          }
          return;
        }

        // 如果缓存中没有数据，使用原有逻辑加载
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) {
          return;
        }

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
          
          if (formattedConfigs.length > 0) {
            const firstConfig = formattedConfigs[0];
            setSelectedAccountType(firstConfig.accountType);
            form.setFieldsValue({
              accountType: firstConfig.accountType,
              accountId: firstConfig.accountName
            });
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

    loadAccountConfigs();
  }, [form, cachedConfigs]);

  const loadAccountInfo = useCallback(async (accountType: AccountType) => {
    try {
      const info = await getAccountInfo(accountType);
      setAccountInfo(info);
    } catch (error) {
      message.error(translations.dataFetch.errorMessages?.getAccountInfoFailed || '获取账户信息失败');
    }
  }, [translations]);

  useEffect(() => {
    const accountType = form.getFieldValue('accountType');
    if (accountType) {
      loadAccountInfo(accountType);
    }
  }, [form, loadAccountInfo]);



  // 模式变化时重新加载查询结果（包括初始加载）
  useEffect(() => {
    // 只有在账户配置加载完成后才执行数据加载
    if (accountConfigs.length > 0) {
      console.log('模式变化触发数据重新加载，当前模式:', isAggregateMode ? 'aggregate' : 'normal');
      loadData();
    }
  }, [isAggregateMode, accountConfigs]);
  


  // 额外的保护措施：确保模式切换时强制重新加载数据
  useEffect(() => {
    console.log('模式状态变化，强制清空查询结果:', isAggregateMode ? 'aggregate' : 'normal');
    setQueryResults([]);
    setCurrentPage(1);
  }, [isAggregateMode]);

  // 保存查询结果
  const saveQueryResults = async (results: QueryResult[]) => {
    try {
      const accountType = form.getFieldValue('accountType');
      const accountId = form.getFieldValue('accountId');
      const mediaSource = form.getFieldValue('mediaSource'); // 获取媒体源
      
      if (!accountType || !accountId) {
        throw new Error('缺少账户信息');
      }
      
      // 批量创建或更新查询日志
      await Promise.all(results.map(async (result) => {
        if (result.key) {
          // 更新现有记录
          const [fromDate, toDate] = result.dateRange.split(/至|TO/).map(date => date.trim());
          await axiosInstance.put(`/api/query-logs/${result.key}`, {
            ...result,
            accountType,
            accountId,
            mediaSource, // 保存媒体源
            fromDate,
            toDate
          });
        } else {
          // 创建新记录
          const [fromDate, toDate] = result.dateRange.split(/至|TO/).map(date => date.trim());
          await axiosInstance.post('/api/query-logs', {
            ...result,
            accountType,
            accountId,
            mediaSource, // 保存媒体源
            fromDate,
            toDate
          });
        }
      }));
    } catch (error) {
      console.error('保存查询结果失败:', error);
      message.error('保存查询结果失败');
    }
  };

  // 删除查询结果
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const handleDelete = async (record: QueryResult) => {
    try {
      setDeleting(prev => ({ ...prev, [record.key]: true }));
      const accountType = form.getFieldValue('accountType');
      const accountId = form.getFieldValue('accountId');
      const mediaSource = form.getFieldValue('mediaSource'); // 获取媒体源
      if (!accountType || !accountId) {
        throw new Error('缺少账户信息');
      }
      if (record.status === 'error' || record.status === 'failed') {
        const [fromDate, toDate] = record.dateRange.split(/至|TO/).map(date => date.trim());
        await axiosInstance.delete(`/api/query-logs/${record.key}`, {
          params: {
            accountType: record.accountType,
            accountId: record.accountId,
            dataType: record.dataType,
            fromDate,
            toDate,
            mediaSource: mediaSource // 传递媒体源
          }
        });
        setQueryResults(prev => {
          const newResults = prev.filter(item => item.key !== record.key);
          const totalPages = Math.ceil(newResults.length / PAGE_SIZE);
          if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
          }
          return newResults;
        });
        message.success(translations.dataFetch.deleteSuccess || '删除成功');
      } else {
        setRecordToDelete(record);
        setDeleteConfirmModalVisible(true);
      }
    } catch (error) {
      console.error('删除查询结果失败:', error);
      message.error('删除查询结果失败');
    } finally {
      setDeleting(prev => ({ ...prev, [record.key]: false }));
    }
  };

  // 确认删除
  const confirmDelete = async () => {
    if (recordToDelete) {
      try {
        setDeleting(prev => ({ ...prev, [recordToDelete.key]: true }));
        const accountType = form.getFieldValue('accountType');
        const accountId = form.getFieldValue('accountId');
        const mediaSource = form.getFieldValue('mediaSource'); // 获取媒体源
        if (!accountType || !accountId) {
          throw new Error('缺少账户信息');
        }
        const [fromDate, toDate] = recordToDelete.dateRange.split(/至|TO/).map(date => date.trim());
        await axiosInstance.delete(`/api/query-logs/${recordToDelete.key}`, {
          params: {
            accountType: recordToDelete.accountType,
            accountId: recordToDelete.accountId,
            dataType: recordToDelete.dataType,
            fromDate,
            toDate,
            mediaSource: mediaSource // 传递媒体源
          }
        });
        setQueryResults(prev => {
          const newResults = prev.filter(item => item.key !== recordToDelete.key);
          const totalPages = Math.ceil(newResults.length / PAGE_SIZE);
          if (currentPage > totalPages && totalPages > 0) {
            setCurrentPage(totalPages);
          }
          return newResults;
        });
        message.success(translations.dataFetch.deleteSuccess || '删除成功');
        setDeleteConfirmModalVisible(false);
        setRecordToDelete(null);
      } catch (error) {
        console.error('删除查询结果失败:', error);
        message.error('删除查询结果失败');
      } finally {
        if (recordToDelete) {
          setDeleting(prev => ({ ...prev, [recordToDelete.key]: false }));
        }
      }
    }
  };

  // 取消删除
  const cancelDelete = () => {
    setDeleteConfirmModalVisible(false);
    setRecordToDelete(null);
  };

  // 下载后如需更新状态也要保存
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const handleDownload = async (record: QueryResult) => {
    try {
      if (!record.downloadUrl) {
        message.error(translations.dataFetch.noDownloadUrl);
        return;
      }
      setDownloading(prev => ({ ...prev, [record.key]: true }));
      // 直接用浏览器原生下载，立刻弹出下载框
      window.open(record.downloadUrl, '_blank');
      message.success(translations.dataFetch.downloadSuccess);
    } catch (error) {
      console.error('Download error:', error);
      message.error(translations.dataFetch.downloadError);
      // 更新记录状态为失败
      setQueryResults(prev => {
        const updated = prev.map(item => {
          if (item.key === record.key) {
            return { ...item, status: 'error' as const, message: translations.dataFetch.downloadError };
          }
          return item;
        });
        saveQueryResults(updated);
        return updated;
      });
    } finally {
      setDownloading(prev => ({ ...prev, [record.key]: false }));
    }
  };

  // 表格高亮动画样式
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
  }`;
  document.head.appendChild(style);

  const [pingStatus, setPingStatus] = useState<{
    status: 'good' | 'warning' | 'poor';
    pingTime: number;
  }>({ status: 'good', pingTime: 0 });
  const [isPinging, setIsPinging] = useState(false);
  const [lastPingTime, setLastPingTime] = useState(0);
  const COOLDOWN_TIME = 3000; // 3秒冷却时间

  const checkPing = useCallback(async () => {
    const now = Date.now();
    // 检查是否在冷却时间内
    if (now - lastPingTime < COOLDOWN_TIME) {
      return;
    }

    try {
      setIsPinging(true);
      const response = await axiosInstance.get<{
        success: boolean;
        pingTime: number;
        status: 'good' | 'warning' | 'poor';
        error?: string;
      }>('/api/ping');

      // 根据响应状态设置ping状态
      if (response.data.success) {
        setPingStatus({
          status: response.data.status,
          pingTime: response.data.pingTime
        });
      } else {
        // 如果后端返回401，说明网络是通的，只是需要认证
        if (response.data.error?.includes('401')) {
          setPingStatus({
            status: 'good',
            pingTime: 100  // 设置一个合理的默认值
          });
        } else {
          setPingStatus({
            status: 'poor',
            pingTime: 3000
          });
        }
      }
    } catch (error) {
      setPingStatus({
        status: 'poor',
        pingTime: 3000
      });
    } finally {
      setIsPinging(false);
      setLastPingTime(now);
    }
  }, [lastPingTime]);

  // 页面加载时触发一次检测
  useEffect(() => {
    checkPing();
  }, [checkPing]);

  // 添加Ping状态显示组件
  const PingStatus = () => {
    const getStatusColor = () => {
      switch (pingStatus.status) {
        case 'good':
          return '#52c41a';
        case 'warning':
          return '#faad14';
        case 'poor':
          return '#ff4d4f';
        default:
          return '#52c41a';
      }
    };

    const getStatusText = () => {
      if (isPinging) return language === 'en' ? 'Checking...' : '检测中...';
      if (pingStatus.pingTime >= 3000) {
        return language === 'en' ? '3000+ MS' : '3000+ 毫秒';
      }
      return language === 'en' ? `${pingStatus.pingTime} MS` : `${pingStatus.pingTime} 毫秒`;
    };

    const getTooltipTitle = () => {
      if (pingStatus.pingTime >= 3000) {
        return language === 'en' ? 'Network Unavailable' : '网络不可用';
      }
      return language === 'en' ? 'Network Available' : '网络可用';
    };

    const handleMouseEnter = () => {
      checkPing();
    };

    return (
      <Tooltip title={getTooltipTitle()}>
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            cursor: 'pointer'
          }}
          onMouseEnter={handleMouseEnter}
        >
          <WifiOutlined style={{ 
            color: getStatusColor(),
            fontSize: '16px'
          }} />
          <span style={{ 
            color: getStatusColor(),
            fontSize: '14px'
          }}>
            {getStatusText()}
          </span>
        </div>
      </Tooltip>
    );
  };

  // 添加导入状态
  const [importing, setImporting] = useState<Record<string, boolean>>({});

  // 处理导入
  const handleImport = async (record: QueryResult) => {
    if (!record.downloadUrl) {
      message.error(translations.dataFetch.noDownloadUrl);
      return;
    }

    try {
      setImporting(prev => ({ ...prev, [record.key]: true }));
      
      // 获取CSV数据
      const response = await axiosInstance.get(record.downloadUrl, {
        responseType: 'blob',
      });
      
      const text = await (response.data as Blob).text();
      const lines = text.split('\n');
      
      if (lines.length <= 1) {
        message.error(translations.dataFetch.noDataAvailable);
        return;
      }

      // 生成报表名称
      const [startDate, endDate] = record.dateRange.split(/至|TO/);
      const dataTypeMap: Record<string, string> = {
        install: 'Install',
        event: 'Event',
        retarget_event: 'Retarget',
        fraud: 'Fraud',
        // Aggregate模式的数据类型映射
        'Daily-Aggregate': 'Daily-Aggregate',
        'Partner-Daily-Aggregate': 'Partner-Daily-Aggregate',
        'GEO-Daily-Aggregate': 'GEO-Daily-Aggregate'
      };
      const formattedDataType = dataTypeMap[record.dataType] || record.dataType;
      const formattedStartDate = startDate.trim();
      const formattedEndDate = endDate.trim();
      
      // 从downloadUrl中提取AppsFlyer App ID
      let appsFlyerAppId = record.appId;
      if (record.downloadUrl) {
        const urlParts = record.downloadUrl.split('/');
        const filename = urlParts[urlParts.length - 1];
        if (filename.startsWith('Data_') && filename.includes('_')) {
          const filenameParts = filename.split('_');
          if (filenameParts.length >= 3) {
            appsFlyerAppId = filenameParts[1]; // 提取AppsFlyer App ID
          }
        }
      }
      
      const reportName = formattedStartDate === formattedEndDate
        ? `${record.accountId}_${appsFlyerAppId}_${formattedDataType}_${formattedStartDate}`
        : `${record.accountId}_${appsFlyerAppId}_${formattedDataType}_${formattedStartDate}——${formattedEndDate}`;

      // 准备导入数据
      const importData = {
        key: Date.now().toString(), // 生成唯一key
        reportName,
        status: 'uploading',
        accountType: record.accountType,
        accountId: record.accountId,
        appId: record.appId,
        appName: record.appName || '',
        dataType: record.dataType,
        eventFilter: record.event_filter || '', // 添加event_filter信息
        queryLogId: record.key, // 添加query_log_id，关联到Home页面的查询记录
        dateRange: record.dateRange,
        data: text,
        recordCount: lines.length - 1,
        primaryAttributionCount: record.primaryAttributionCount || 0,
        importTime: new Date().toISOString(),
        size: new Blob([text]).size, // 计算文件大小
        source: 'raw_data_import'
      };

      // 发送导入请求 - 现在返回统一的响应
      const importResponse = await axiosInstance.post<{
        success: boolean;
        message: string;
        operations: {
          import_data: { status: string; message: string };
          query_log_update: { status: string; message: string };
          reports_list: { status: string; count: number; data: any[] };
        };
        report: {
          key: string;
          reportName: string;
          status: string;
          size: number;
          recordCount: number;
        };
      }>('/api/import-data', importData);
      
      if (importResponse.data.success) {
        // 显示成功消息
        message.success(importResponse.data.message || (language === 'en' ? 'Import successful' : '导入成功'));
        
        // 更新记录状态
        setQueryResults(prev => {
          const updated = prev.map(item => {
            if (item.key === record.key) {
              return { ...item, imported: true };
            }
            return item;
          });
          saveQueryResults(updated);
          return updated;
        });
        
        // 更新报表名称列表（如果后端返回了报表列表）
        if (importResponse.data.operations.reports_list.status === 'success') {
          const reportNames = importResponse.data.operations.reports_list.data.map((r: any) => r.reportName);
          setReportNames(reportNames);
        }
        
        // 记录操作结果
        console.log('导入操作结果:', importResponse.data.operations);
      } else {
        throw new Error(importResponse.data.message || 'Import failed');
      }

    } catch (error) {
      console.error('Import error:', error);
      message.error(language === 'en' ? 'Import failed' : '导入失败');
    } finally {
      setImporting(prev => ({ ...prev, [record.key]: false }));
    }
  };

  const [reportNames, setReportNames] = useState<string[]>([]);

  const loadReportNames = useCallback(async (skipIfImporting = false) => {
    try {
      // 如果正在导入且设置了跳过标志，则不执行
      if (skipIfImporting && Object.values(importing).some(v => v)) {
        return;
      }
      
      const accountType = form.getFieldValue('accountType');
      const accountId = form.getFieldValue('accountId');
      if (!accountType || !accountId) {
        setReportNames([]);
        return;
      }
      const response = await axiosInstance.get('/api/reports', {
        params: { accountType, accountId }
      });
      const names = Array.isArray(response.data) ? response.data.map((r: any) => r.reportName) : [];
      setReportNames(names);
    } catch (e) {
      setReportNames([]);
    }
  }, [form, importing]);

  useEffect(() => {
    loadReportNames();
  }, [loadReportNames]);

  useEffect(() => {
    const socket = io('ws://www.afgo-workbench.icu', {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socket.on('report_deleted', (data: { type: string; reportKey: string }) => {
      console.log('Received report deletion:', data);
      const accountType = form.getFieldValue('accountType');
      const accountId = form.getFieldValue('accountId');
      if (accountType && accountId) {
        loadReportNames(true); // 添加跳过标志
      }
      setQueryResults(prev => {
        const updated = prev.map(item =>
          item.key === data.reportKey ? { ...item, imported: false } : item
        );
        localStorage.setItem('allQueryResults', JSON.stringify(updated));
        return updated;
      });
    });

    socket.on('report_update', () => {
      const accountType = form.getFieldValue('accountType');
      const accountId = form.getFieldValue('accountId');
      if (accountType && accountId) {
        loadReportNames(true); // 添加跳过标志
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [loadReportNames, form, setQueryResults]);

  // 获取报表名称的函数
  const getReportName = (record: QueryResult) => {
    const [startDate, endDate] = record.dateRange.split(/至|TO/);
    const dataTypeMap: Record<string, string> = {
      install: 'Install',
      event: 'Event',
      retarget_event: 'Retarget',
      fraud: 'Fraud',
      // Aggregate模式的数据类型映射
      'Daily-Aggregate': 'Daily-Aggregate',
      'Partner-Daily-Aggregate': 'Partner-Daily-Aggregate',
      'GEO-Daily-Aggregate': 'GEO-Daily-Aggregate'
    };
    const formattedDataType = dataTypeMap[record.dataType] || record.dataType;
    const formattedStartDate = startDate.trim();
    const formattedEndDate = endDate.trim();
    return formattedStartDate === formattedEndDate
      ? `${record.accountId}_${record.appId}_${formattedDataType}_${formattedStartDate}`
      : `${record.accountId}_${record.appId}_${formattedDataType}_${formattedStartDate}——${formattedEndDate}`;
  };

  // 处理查询
  const handleQuery = async (values: FormValues) => {
    // 防止重复请求
    if (queryInProgressRef.current) {
      message.warning('查询正在进行中，请勿重复操作');
      return;
    }
    
    // 防止模式切换时的意外提交
    if (!values.appIds || !values.appIds.trim()) {
      console.log('防止模式切换时的意外提交：缺少APP ID');
      queryInProgressRef.current = false;
      return;
    }
    
    queryInProgressRef.current = true;
    try {
      setLoading(true);
      const [startDate, endDate] = values.dateRange;
      const appIds = values.appIds.split(',').map(id => id.trim());
      const selectedAccount = accountConfigs.find(
        config => config.accountName === values.accountId && config.accountType === values.accountType
      );
      if (!selectedAccount) throw new Error('未找到对应的账户配置');
      if (!selectedAccount.apiToken) throw new Error('账户配置中缺少 API Token');

      // 检查数据库中是否存在重复记录
      for (const appId of appIds) {
        try {
          const checkResponse = await axiosInstance.post<CheckDuplicateResponse>('/api/check-duplicate-query', {
            accountType: values.accountType,
            accountId: values.accountId,
            dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
            fromDate: startDate.format('YYYY-MM-DD'),
            toDate: endDate.format('YYYY-MM-DD'),
            appId: appId,
            eventFilter: values.eventFilter || '',  // 添加事件过滤参数
            mode: isAggregateMode ? 'aggregate' : 'normal'  // 添加模式参数
          });

          if (checkResponse.data.isDuplicate && checkResponse.data.record) {
            const existingRecord = checkResponse.data.record;
            
            // 查找重复记录在查询结果中的位置
            const duplicateIndex = queryResults.findIndex(result => result.key === existingRecord.id);
            
            if (duplicateIndex !== -1) {
              // 计算重复记录所在的页码
              const targetPage = Math.floor(duplicateIndex / PAGE_SIZE) + 1;
              
              // 如果重复记录不在当前页，先跳转到对应页面
              if (targetPage !== currentPage) {
                setCurrentPage(targetPage);
                
                // 等待页面切换完成后再设置高亮和滚动
                setTimeout(() => {
                  setHighlightKey(existingRecord.id);
                  setHighlightType(existingRecord.status);
                  setTimeout(() => setHighlightKey(null), 2000);
                  setTimeout(() => setHighlightType(null), 2000);
                  setTimeout(() => {
                    const row = document.getElementById(`row-${existingRecord.id}`);
                    if (row) {
                      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }, 100);
                }, 100); // 给页面切换一些时间
              } else {
                // 如果重复记录在当前页，直接设置高亮和滚动
                setHighlightKey(existingRecord.id);
                setHighlightType(existingRecord.status);
                setTimeout(() => setHighlightKey(null), 2000);
                setTimeout(() => setHighlightType(null), 2000);
                setTimeout(() => {
                  const row = document.getElementById(`row-${existingRecord.id}`);
                  if (row) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }, 100);
              }
            } else {
              // 如果找不到重复记录，使用原来的逻辑
              setHighlightKey(existingRecord.id);
              setHighlightType(existingRecord.status);
              setTimeout(() => setHighlightKey(null), 2000);
              setTimeout(() => setHighlightType(null), 2000);
              setTimeout(() => {
                const row = document.getElementById(`row-${existingRecord.id}`);
                if (row) {
                  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 100);
            }

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
            message.warning(messageText);
            setLoading(false);
            queryInProgressRef.current = false;
            return;
          }
        } catch (error) {
          console.error('检查重复查询失败:', error);
          message.error('检查重复查询失败');
          setLoading(false);
          queryInProgressRef.current = false;
          return;
        }
      }

      // 先插入processing记录
      const processingRecords = appIds.map(appId => {
        const timestamp = Math.floor(Date.now() / 1000);  // 去掉毫秒级
        return {
          key: `${timestamp}_${appId}`,  // 临时key，会在查询后更新
          appId,
          dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
          dateRange: `${startDate.format('YYYY-MM-DD')} 至 ${endDate.format('YYYY-MM-DD')}`,
          status: 'processing' as const,
          message: translations.dataFetch.statusProcessing || '请求中',
          downloadUrl: '',
          apiResponse: {},
          accountType: values.accountType,
          accountId: values.accountId,
          mediaSource: values.mediaSource || 'All Media Source', // 添加媒体源
          mode: isAggregateMode ? 'aggregate' : 'normal' // 添加模式信息
        };
      });

      // 只更新前端状态，不保存到数据库
      setQueryResults(prev => [...processingRecords, ...prev].slice(0, MAX_RECORDS));
      setCurrentPage(1);

      // 记录key与appId映射，便于后续更新
      const keyMap = processingRecords.reduce((acc, rec) => { acc[rec.appId] = rec.key; return acc; }, {} as Record<string, string>);
      
      // 真实查询
      const queryPromises = appIds.map(async (appId) => {
        const queryParams = {
          accountName: values.accountId,
          accountType: values.accountType,
                      dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
          fromDate: startDate.format('YYYY-MM-DD'),
          toDate: endDate.format('YYYY-MM-DD'),
          appId: appId,
          apiToken: selectedAccount.apiToken,
          eventFilter: values.eventFilter || '',  // 添加event_filter字段
          mediaSource: values.mediaSource || 'All Media Source', // 添加媒体源
          mode: isAggregateMode ? 'aggregate' : 'normal' // 添加模式参数
        };
        
        try {
          const response = await axiosInstance.post<ApiResponse>('/api/query-data', queryParams);
          // 确保使用后端返回的queryId作为key
          const queryId = response.data.queryId;
          if (!queryId) {
            throw new Error('后端未返回queryId');
          }
          
          const result: QueryResult = {
            key: queryId,  // 使用后端返回的queryId
            appId,
            dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
            dateRange: `${startDate.format('YYYY-MM-DD')} 至 ${endDate.format('YYYY-MM-DD')}`,
            status: 'success' as const,
            message: '',
            downloadUrl: response.data.downloadUrl,
            apiResponse: response.data,
            appName: response.data.details?.appName || '',
            accountType: values.accountType,
            accountId: values.accountId,
            event_filter: values.eventFilter || '',  // 添加event_filter字段
            mediaSource: values.mediaSource || 'All Media Source', // 添加媒体源
            mode: isAggregateMode ? 'aggregate' : 'normal' // 添加模式信息
          };

          if (typeof response.data.details?.afidDeduplicationCount === 'number') {
            result.afidDeduplicationCount = response.data.details.afidDeduplicationCount;
          }
          if (typeof response.data.details?.primaryAttributionCount === 'number') {
            result.primaryAttributionCount = response.data.details.primaryAttributionCount;
          }
          
          return result;
        } catch (error: any) {
          // 处理404错误
          if (error.response?.status === 404) {
            // 从错误响应中获取queryId
            const queryId = error.response.data?.queryId;
            if (!queryId) {
              throw new Error('后端未返回queryId');
            }
            
            return {
              key: queryId,  // 使用后端返回的queryId
              appId,
              dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
              dateRange: `${startDate.format('YYYY-MM-DD')} 至 ${endDate.format('YYYY-MM-DD')}`,
              status: 'error' as const,
              message: translations.dataFetch.noAuthorized || '无授权关系',
              downloadUrl: '',
              apiResponse: error.response?.data,
              appName: '',
              afidDeduplicationCount: 0,
              primaryAttributionCount: 0,
              accountType: values.accountType,
              accountId: values.accountId,
              event_filter: values.eventFilter || '',  // 添加event_filter字段
              mediaSource: values.mediaSource || 'All Media Source', // 添加媒体源
              mode: isAggregateMode ? 'aggregate' : 'normal' // 添加模式信息
            };
          }
          
          // 处理其他错误
          // 从错误响应中获取queryId
          const queryId = error.response?.data?.queryId;
          if (!queryId) {
            throw new Error('后端未返回queryId');
          }
          
          return {
            key: queryId,  // 使用后端返回的queryId
            appId,
            dataType: DATA_TYPE_MAP[values.dataType](values.accountType),
            dateRange: `${startDate.format('YYYY-MM-DD')} 至 ${endDate.format('YYYY-MM-DD')}`,
            status: 'error' as const,
            message: error.message || translations.dataFetch.errorMessages?.fetchFailed || '数据获取失败',
            downloadUrl: '',
            apiResponse: error.response?.data,
            appName: '',
            afidDeduplicationCount: 0,
            primaryAttributionCount: 0,
            accountType: values.accountType,
            accountId: values.accountId,
            event_filter: values.eventFilter || '',  // 添加event_filter字段
            mediaSource: values.mediaSource || 'All Media Source', // 添加媒体源
            mode: isAggregateMode ? 'aggregate' : 'normal' // 添加模式信息
          };
        }
      });

      const results = await Promise.all(queryPromises);
      
      // 更新查询结果，使用后端返回的queryId替换临时key
      const updatedResults = results.map(result => {
        const tempKey = keyMap[result.appId];
        return {
          ...result,
          tempKey, // 保存临时key，用于更新UI
        };
      });
      
      // 更新查询结果
      await saveQueryResults(updatedResults);
      setQueryResults(prev => {
        const updated = prev.map(item => {
          const found = updatedResults.find(r => r.tempKey === item.key);
          if (found) {
            const { tempKey, ...rest } = found;
            return rest;
          }
          return item;
        });
        return updated;
      });
      // 新增：自动设置基础日志信息为最新一条
      if (updatedResults && updatedResults.length > 0) {
        const { tempKey, ...firstResult } = updatedResults[0];
        setCurrentDetail(firstResult);
      }

      // 成功/失败提示
      const hasSuccess = results.some(result => result.status === 'success');
      if (hasSuccess) {
        message.success(translations.dataFetch.successMessages?.fetchSuccess || '数据获取成功');
      } else {
        message.error(translations.dataFetch.errorMessages?.fetchFailed || '数据获取失败');
      }
    } catch (error: any) {
      message.error(error.message || translations.dataFetch.errorMessages?.fetchFailed || '数据获取失败');
    } finally {
      setLoading(false);
      queryInProgressRef.current = false;
    }
  };

  // 处理账户类型变化
  const handleAccountTypeChange = (value: AccountType) => {
    setSelectedAccountType(value);
    const matched = accountConfigs.find(cfg => cfg.accountType === value);
    form.setFieldsValue({ accountId: matched ? matched.accountName : '' });
    if (value === ACCOUNT_TYPES.PRT) {
      form.setFieldsValue({ mediaSource: 'All Media Source' });
    } else {
      form.setFieldsValue({ mediaSource: undefined });
    }
    setAccountInfo(null);
    // 账户类型切换后，重新加载报表名（需判断）
    const accountType = value;
    const accountId = matched ? matched.accountName : '';
    if (accountType && accountId) {
      setTimeout(() => {
        loadReportNames();
      }, 0);
    }
  };

  // 处理账户ID变化
  const handleAccountIdChange = (value: string) => {
    form.setFieldsValue({ accountId: value });
    // 账户ID切换后，重新加载报表名（需判断）
    const accountType = form.getFieldValue('accountType');
    const accountId = value;
    if (accountType && accountId) {
      setTimeout(() => {
        loadReportNames();
      }, 0);
    }
  };

  // 处理APP ID输入
  const handleAppIdsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // 只保留字母、数字、点号、下划线和连字符
    const filteredValue = value.replace(/[^a-zA-Z0-9._-]/g, '');
    form.setFieldsValue({ appIds: filteredValue });
  };

  // 显示详细日志
  const handlePreview = async (record: QueryResult) => {
    try {
      setPreviewing(prev => ({ ...prev, [record.key]: true }));
      
      const response = await axiosInstance.get(`/api/query-logs/${record.key}/preview`, {
        params: {
          accountType: record.accountType,
          accountId: record.accountId
        }
      });
      setPreviewData(response.data as any[]);
      setSelectedPreviewRecord(record);
      setPreviewModalVisible(true);
    } catch (error) {
      console.error('获取预览数据失败:', error);
      message.error(language === 'en' ? 'Failed to get preview data' : '获取预览数据失败');
    } finally {
      setPreviewing(prev => ({ ...prev, [record.key]: false }));
    }
  };

  const showDetail = async (record: QueryResult) => {
    console.log('显示详情:', record);
    setCurrentDetail(record);
    setDetailModalVisible(true);
    
    // 如果没有appName且有appId，则查询AppsFinder数据库
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

  // 禁用未来日期
  const disabledDate: RangePickerProps['disabledDate'] = (current) => {
    return current && current > dayjs().endOf('day');
  };

  // RangePicker 快捷选项
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

  // 在组件顶部添加新的状态
  const [downloadAllModalVisible, setDownloadAllModalVisible] = useState(false);
  const [deleteAllModalVisible, setDeleteAllModalVisible] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  // 添加新的处理函数
  const handleDownloadAll = async () => {
    try {
      setIsDownloadingAll(true);
      setDownloadAllModalVisible(false);  // 关闭确认弹窗
      const modeParam = isAggregateMode ? 'aggregate' : 'normal';
      const response = await axiosInstance.get('/api/download-all', {
        params: { mode: modeParam },
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data as Blob]));
      const link = document.createElement('a');
      link.href = url;
      
      // 从响应头中获取文件名，如果没有则使用默认名称
      const contentDisposition = response.headers['content-disposition'];
      let fileName = 'All_Data.zip'; // 默认文件名
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          fileName = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      message.success('下载成功');
    } catch (error) {
      console.error('下载失败:', error);
      message.error('下载失败');
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      setDeletingAll(true);
      const modeParam = isAggregateMode ? 'aggregate' : 'normal';
      await axiosInstance.delete('/api/delete-all', {
        params: { mode: modeParam }
      });
      setQueryResults([]);
      message.success(language === 'en' ? 'All records deleted' : '所有记录已删除');
    } catch (error) {
      console.error('Delete all error:', error);
      message.error(language === 'en' ? 'Delete failed' : '删除失败');
    } finally {
      setDeletingAll(false);
      setDeleteAllModalVisible(false);
    }
  };

  // 在组件中添加状态
  const [showEventFilter, setShowEventFilter] = useState(false);

  // 在数据类型选择变化时更新显示状态
  const handleDataTypeChange = (value: DataType | string) => {
    // 只有Normal模式下的dataType才需要检查事件类型
    if (Object.values(DATA_TYPES).includes(value as DataType)) {
      setShowEventFilter(isEventType(value as DataType));
    } else {
      // Aggregate模式下不需要事件过滤
      setShowEventFilter(false);
    }
    form.setFieldsValue({ eventFilter: undefined }); // 切换数据类型时清空事件过滤
  };

  // 新增：Aggregate模式切换处理函数
  const handleAggregateModeToggle = async () => {
    const newMode = !isAggregateMode;
    const fromMode = isAggregateMode ? 'Aggregate' : 'Normal';
    const toMode = newMode ? 'Aggregate' : 'Normal';
    
    console.log('用户手动切换模式:', fromMode, '->', toMode);
    
    // 触发动画
    setTransitionFrom(fromMode);
    setTransitionTo(toMode);
    setShowTransition(true);
    setTransitionLoading(true);
    setTransitionProgress(0);
    
    // 执行实际的模式切换（不保存状态）
    setIsAggregateMode(newMode);
    // 不保存模式状态，确保每次都是临时切换
    
    // 立即清空查询结果，避免显示错误模式的数据
    setQueryResults([]);
    setCurrentPage(1);
    
    // 立即清空关键字段，防止意外提交
    form.setFieldsValue({
      appIds: '',
      dataType: undefined,
      dateRange: undefined
    });
    
    // 延迟重置表单，避免触发意外提交
    setTimeout(() => {
      // 完全重置表单所有字段
      form.resetFields();
      
      // 根据新模式设置默认值
      if (newMode) {
        // Aggregate模式：设置为PRT账户类型
        form.setFieldsValue({
          accountType: ACCOUNT_TYPES.PRT,
          mediaSource: undefined,
          eventFilter: undefined,
          appIds: undefined,
          dataType: undefined,
          dateRange: undefined
        });
        
        // 如果有PRT账户，自动选择第一个
        const prtAccounts = accountConfigs.filter(config => config.accountType === ACCOUNT_TYPES.PRT);
        if (prtAccounts.length > 0) {
          form.setFieldsValue({ accountId: prtAccounts[0].accountName });
        }
      } else {
        // Normal模式：设置为PID账户类型
        form.setFieldsValue({
          accountType: ACCOUNT_TYPES.PID,
          mediaSource: 'All Media Source',
          eventFilter: undefined,
          appIds: undefined,
          dataType: undefined,
          dateRange: undefined
        });
        
        // 如果有PID账户，自动选择第一个
        const pidAccounts = accountConfigs.filter(config => config.accountType === ACCOUNT_TYPES.PID);
        if (pidAccounts.length > 0) {
          form.setFieldsValue({ accountId: pidAccounts[0].accountName });
        }
      }
      
      // 重置事件过滤显示状态
      setShowEventFilter(false);
    }, 100); // 延迟100ms执行，确保状态更新完成
    
    // 等待数据加载完成
    try {
      setTransitionProgress(30);
      await new Promise(resolve => setTimeout(resolve, 200)); // 模拟表单重置时间
      
      setTransitionProgress(60);
      await loadData(); // 加载新模式的数据
      
      setTransitionProgress(100);
      await new Promise(resolve => setTimeout(resolve, 200)); // 确保动画完成
      
      setTransitionLoading(false);
    } catch (error) {
      console.error('模式切换数据加载失败:', error);
      setTransitionLoading(false);
      setTransitionProgress(100);
    }
  };

  useEffect(() => {
    if (accountConfigs.length > 0) {
      const accountType = form.getFieldValue('accountType');
      const accountId = form.getFieldValue('accountId');
      if (accountType && accountId) {
        loadReportNames();
      }
    }
  }, [accountConfigs, form]);

  // 新增：监听Aggregate Mode设置变化
  useEffect(() => {
    const handleStorageChange = () => {
      const fraudModeSetting = localStorage.getItem('appsflyerTokenValidate');
      const newFraudModeEnabled = fraudModeSetting === 'ON';
              setAggregateModeEnabled(newFraudModeEnabled);
      
              // 如果Aggregate Mode设置为OFF，强制切换到Normal mode
      if (!newFraudModeEnabled && isAggregateMode) {
        setIsAggregateMode(false);
        localStorage.setItem('aggregateMode', 'false');
      }
    };

    // 监听storage事件（跨标签页同步）
    window.addEventListener('storage', handleStorageChange);
    
    // 定期检查localStorage变化（同标签页内）
    const interval = setInterval(() => {
      const currentSetting = localStorage.getItem('appsflyerTokenValidate');
      if (currentSetting !== (aggregateModeEnabled ? 'ON' : 'OFF')) {
        const newFraudModeEnabled = currentSetting === 'ON';
        setAggregateModeEnabled(newFraudModeEnabled);
        
        // 如果Aggregate Mode设置为OFF，强制切换到Normal mode
        if (!newFraudModeEnabled && isAggregateMode) {
          console.log('强制切换模式: aggregate -> normal (Aggregate Mode设置为OFF)');
          setIsAggregateMode(false);
          localStorage.setItem('aggregateMode', 'false');
          
          // 立即清空查询结果，避免显示错误模式的数据
          setQueryResults([]);
          setCurrentPage(1);
          
          // 立即清空关键字段，防止意外提交
          form.setFieldsValue({
            appIds: '',
            dataType: undefined,
            dateRange: undefined
          });
          
          // 延迟重置表单，避免触发意外提交
          setTimeout(() => {
            // 强制切换时也重置表单
            form.resetFields();
            form.setFieldsValue({
              accountType: ACCOUNT_TYPES.PID,
              mediaSource: 'All Media Source',
              eventFilter: undefined,
              appIds: undefined,
              dataType: undefined,
              dateRange: undefined
            });
            
            // 如果有PID账户，自动选择第一个
            const pidAccounts = accountConfigs.filter(config => config.accountType === ACCOUNT_TYPES.PID);
            if (pidAccounts.length > 0) {
              form.setFieldsValue({ accountId: pidAccounts[0].accountName });
            }
            
            // 重置事件过滤显示状态
            setShowEventFilter(false);
          }, 100); // 延迟100ms执行，确保状态更新完成
          
          // 强制切换后的数据加载由useEffect统一处理
        }
      }
    }, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [aggregateModeEnabled, isAggregateMode]);

  // 新增：Aggregate模式下的表单初始化（简化版）
  useEffect(() => {
    // 只在组件初始加载时设置默认值，模式切换由handleAggregateModeToggle处理
    if (accountConfigs.length > 0 && !form.getFieldValue('accountType')) {
      if (isAggregateMode) {
        // Aggregate模式：设置为PRT账户类型
      const prtAccounts = accountConfigs.filter(config => config.accountType === ACCOUNT_TYPES.PRT);
      if (prtAccounts.length > 0) {
      form.setFieldsValue({ 
            accountType: ACCOUNT_TYPES.PRT,
            accountId: prtAccounts[0].accountName
          });
        }
      } else {
        // Normal模式：设置为PID账户类型
        const pidAccounts = accountConfigs.filter(config => config.accountType === ACCOUNT_TYPES.PID);
        if (pidAccounts.length > 0) {
        form.setFieldsValue({ 
            accountType: ACCOUNT_TYPES.PID,
            accountId: pidAccounts[0].accountName,
            mediaSource: 'All Media Source'
        });
      }
    }
    }
  }, [accountConfigs, form, isAggregateMode]);

  return (
    <div style={{ padding: '24px' }}>
              <style>{`
          /* 旋转动画 */
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          /* 确保Loading覆盖层完全不透明 */
          .table-loading-overlay {
            background: #ffffff !important;
            background-color: #ffffff !important;
            background-image: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            /* 强制完全不透明 */
            opacity: 1 !important;
            /* 确保覆盖所有内容 */
            z-index: 1000 !important;
            /* 强制背景色 */
            background: #ffffff !important;
            background-color: #ffffff !important;
            /* 禁用任何透明度 */
            filter: none !important;
            -webkit-filter: none !important;
          }
          
          /* 表格淡入动画优化 */
          .appsflyer-table {
            will-change: opacity, transform; /* 优化动画性能 */
          }
          
          /* 表格行渐进式显示动画 */
          .appsflyer-table .ant-table-tbody > tr.fade-in-row {
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
          
          .mode-chip.ant-btn {
          border-radius: 4px !important;
          box-shadow: none !important;
          outline: none !important;
        }
        /* 统一表单内控件外框样式：与大外框一致（仅样式，不改尺寸） */
        .af-form .ant-select-selector,
        .af-form .ant-input,
        .af-form .ant-input-affix-wrapper,
        .af-form .ant-picker {
          border-radius: 4px !important;
          border: 1px solid rgb(230, 233, 240) !important;
        }
        .af-form .ant-select-disabled .ant-select-selector,
        .af-form .ant-input[disabled],
        .af-form .ant-picker-disabled {
          border-radius: 4px !important;
          border: 1px solid rgb(230, 233, 240) !important;
          background: #fafafa;
        }
        /* 下拉弹层：4px 圆角 + 与选择器无缝衔接 - 使用更强力的选择器 */
        .af-form .ant-select-open .ant-select-selector {
          border-bottom-left-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
        }
        
        /* 强制覆盖Ant Design的下拉弹层样式 */
        .ant-select-dropdown.af-form,
        .af-form.ant-select-dropdown,
        .ant-picker-dropdown.af-form,
        .af-form.ant-picker-dropdown {
          margin-top: -1px !important;           /* 贴合选择器 */
          border-radius: 4px !important;         /* 全局4px */
          border-top-left-radius: 0 !important;  /* 顶部与选择器无缝 */
          border-top-right-radius: 0 !important;
          border: 1px solid rgb(230, 233, 240) !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important; /* AppsFlyer风格阴影 */
          overflow: hidden !important;           /* 内部圆角生效 */
          /* AppsFlyer 字体与排版 */
          -webkit-font-smoothing: antialiased !important;
          text-size-adjust: 100% !important;
          -webkit-tap-highlight-color: rgba(0,0,0,0) !important;
          font-family: "Museo Sans", sans-serif !important;
          font-weight: 300 !important;
          font-size: 13px !important;
          line-height: 20px !important;
          letter-spacing: 0.0025em !important;
          color: rgb(34, 13, 78) !important;
          padding-top: 4px !important;          /* 减少顶部间距，更锐利 */
          padding-bottom: 4px !important;        /* 减少底部间距，更锐利 */
          box-sizing: border-box !important;
          max-height: 380px !important;
          overflow-y: overlay !important;
          position: relative !important;
          background: rgb(255, 255, 255) !important; /* 确保背景色 */
        }
        /* 下拉选项：更锐利的内部样式 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form .ant-select-item,
        .ant-select-dropdown.af-form .ant-select-item-option,
        .ant-select-dropdown.af-form .ant-select-item-option-content,
        .af-form.ant-select-dropdown .ant-select-item,
        .af-form.ant-select-dropdown .ant-select-item-option,
        .af-form.ant-select-dropdown .ant-select-item-option-content {
          border-radius: 0 !important;
          margin: 0 !important;
          padding: 8px 12px !important;          /* 统一内边距，更紧凑 */
          min-height: 36px !important;           /* 固定高度，更锐利 */
          display: flex !important;
          align-items: center !important;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important; /* AppsFlyer过渡效果 */
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }
        /* 选项悬停状态 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form .ant-select-item-option:hover,
        .af-form.ant-select-dropdown .ant-select-item-option:hover {
          background-color: rgba(34, 13, 78, 0.04) !important; /* 更柔和的悬停色 */
          transform: none !important;
        }
        /* 选项激活状态 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form .ant-select-item-option-active,
        .af-form.ant-select-dropdown .ant-select-item-option-active {
          border-radius: 0 !important;
          background-color: rgba(34, 13, 78, 0.08) !important; /* 更锐利的激活色 */
          outline: none !important;
          box-shadow: none !important;
        }
        /* 选项选中状态 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form .ant-select-item-option-selected,
        .af-form.ant-select-dropdown .ant-select-item-option-selected {
          border-radius: 0 !important;
          background-color: rgba(114, 46, 209, 0.12) !important; /* 更明显的选中色 */
          outline: none !important;
          box-shadow: none !important;
          font-weight: 500 !important;           /* 选中项字体加粗 */
        }
        /* 选项文本样式 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form .ant-select-item-option-content,
        .af-form.ant-select-dropdown .ant-select-item-option-content {
          font-size: 13px !important;
          line-height: 20px !important;
          color: rgb(34, 13, 78) !important;
          font-weight: 400 !important;
          letter-spacing: 0.0025em !important;
        }
        /* 选中项文本样式 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form .ant-select-item-option-selected .ant-select-item-option-content,
        .af-form.ant-select-dropdown .ant-select-item-option-selected .ant-select-item-option-content {
          font-weight: 500 !important;
          color: rgb(114, 46, 209) !important;  /* 选中项文字颜色 */
        }
        /* DatePicker 弹层与选择器无缝衔接 - 使用更强力的选择器 */
        .af-form .ant-picker-focused {
          border-bottom-left-radius: 0 !important;
          border-bottom-right-radius: 0 !important;
        }
        .ant-picker-dropdown.af-form .ant-picker-panel-container,
        .ant-picker-dropdown.af-form .ant-picker-panel,
        .af-form.ant-picker-dropdown .ant-picker-panel-container,
        .af-form.ant-picker-dropdown .ant-picker-panel {
          border-radius: 4px !important;         /* 4px */
          border-top-left-radius: 0 !important;
          border-top-right-radius: 0 !important;
          border: 1px solid rgb(230, 233, 240) !important;
          overflow: hidden !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important; /* AppsFlyer风格阴影 */
        }
        .ant-picker-dropdown.af-form,
        .af-form.ant-picker-dropdown {
          margin-top: -1px !important;
        }
        /* DatePicker 内部样式优化 - 使用更强力的选择器 */
        .ant-picker-dropdown.af-form .ant-picker-header,
        .af-form.ant-picker-dropdown .ant-picker-header {
          border-bottom: 1px solid rgb(230, 233, 240) !important;
          padding: 8px 12px !important;
          background: rgb(250, 250, 250) !important;
        }
        .ant-picker-dropdown.af-form .ant-picker-content,
        .af-form.ant-picker-dropdown .ant-picker-content {
          padding: 8px !important;
        }
        .ant-picker-dropdown.af-form .ant-picker-cell,
        .af-form.ant-picker-dropdown .ant-picker-cell {
          border-radius: 0 !important;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .ant-picker-dropdown.af-form .ant-picker-cell:hover,
        .af-form.ant-picker-dropdown .ant-picker-cell:hover {
          background-color: rgba(34, 13, 78, 0.04) !important;
        }
        .ant-picker-dropdown.af-form .ant-picker-cell-selected,
        .af-form.ant-picker-dropdown .ant-picker-cell-selected {
          background-color: rgba(114, 46, 209, 0.12) !important;
        }
        .ant-picker-dropdown.af-form .ant-picker-cell-today,
        .af-form.ant-picker-dropdown .ant-picker-cell-today {
          border: 1px solid rgb(114, 46, 209) !important;
        }
        
        /* 通用下拉组件样式优化 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form,
        .af-form.ant-select-dropdown,
        .ant-picker-dropdown.af-form,
        .af-form.ant-picker-dropdown,
        .ant-cascader-dropdown.af-form,
        .af-form.ant-cascader-dropdown {
          border-radius: 4px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
          border: 1px solid rgb(230, 233, 240) !important;
          overflow: hidden !important;
        }
        
        /* 确保所有下拉选项都有锐利的内部样式 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form .ant-select-item,
        .ant-select-dropdown.af-form .ant-select-item-option,
        .af-form.ant-select-dropdown .ant-select-item,
        .af-form.ant-select-dropdown .ant-select-item-option,
        .ant-cascader-dropdown.af-form .ant-cascader-menu-item,
        .ant-cascader-dropdown.af-form .ant-cascader-menu-item-expand-icon,
        .af-form.ant-cascader-dropdown .ant-cascader-menu-item,
        .af-form.ant-cascader-dropdown .ant-cascader-menu-item-expand-icon {
          border-radius: 0 !important;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        
        /* 统一悬停效果 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form .ant-select-item-option:hover,
        .af-form.ant-select-dropdown .ant-select-item-option:hover,
        .ant-cascader-dropdown.af-form .ant-cascader-menu-item:hover,
        .af-form.ant-cascader-dropdown .ant-cascader-menu-item:hover {
          background-color: rgba(34, 13, 78, 0.04) !important;
        }
        
        /* 统一选中效果 - 使用更强力的选择器 */
        .ant-select-dropdown.af-form .ant-select-item-option-selected,
        .af-form.ant-select-dropdown .ant-select-item-option-selected,
        .ant-cascader-dropdown.af-form .ant-cascader-menu-item-selected,
        .af-form.ant-cascader-dropdown .ant-cascader-menu-item-selected {
          background-color: rgba(114, 46, 209, 0.12) !important;
          font-weight: 500 !important;
        }

        /* 针对中文语言的字体优化 */
        .af-form .ant-form-item-label > label {
          /* 默认字体设置 */
          font-family: "Museo Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
          font-weight: 400;
          font-size: 14px;
          line-height: 1.5;
          color: rgb(34, 13, 78);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* 中文状态下的字体优化 */
        .af-form[lang="zh"] .ant-form-item-label > label,
        .af-form[lang="zh-CN"] .ant-form-item-label > label {
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "Helvetica Neue", "Helvetica", "Arial", sans-serif;
          font-weight: 600;
          font-size: 15px;
          line-height: 1.6;
          color: rgb(34, 13, 78);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* 英文状态下的字体保持原样 */
        .af-form[lang="en"] .ant-form-item-label > label,
        .af-form[lang="en-US"] .ant-form-item-label > label {
          font-family: "Museo Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
          font-weight: 400;
          font-size: 14px;
          line-height: 1.5;
          color: rgb(34, 13, 78);
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* 动态语言切换的字体优化 */
        .af-form .ant-form-item-label > label[data-lang="zh"],
        .af-form .ant-form-item-label > label[data-lang="zh-CN"] {
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "Helvetica Neue", "Helvetica", "Arial", sans-serif;
          font-weight: 600;
          font-size: 15px;
          line-height: 1.6;
        }

        .af-form .ant-form-item-label > label[data-lang="en"],
        .af-form .ant-form-item-label > label[data-lang="en-US"] {
          font-family: "Museo Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
          font-weight: 400;
          font-size: 14px;
          line-height: 1.5;
        }

        /* 特定字段标签的中文字体优化 - 使用属性选择器 */
        .af-form .ant-form-item-label > label span[lang="zh"],
        .af-form .ant-form-item-label > label span[lang="zh-CN"] {
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "Helvetica Neue", "Helvetica", "Arial", sans-serif;
          font-weight: 600;
          font-size: 15px;
          line-height: 1.6;
        }

        /* 英文标签保持原字体 - 使用属性选择器 */
        .af-form .ant-form-item-label > label span[lang="en"],
        .af-form .ant-form-item-label > label span[lang="en-US"] {
          font-family: "Museo Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
          font-weight: 400;
          font-size: 14px;
          line-height: 1.5;
        }

        /* 使用CSS属性选择器进行更精确的语言检测 */
        .af-form .ant-form-item-label > label[lang="zh"],
        .af-form .ant-form-item-label > label[lang="zh-CN"] {
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "Helvetica Neue", "Helvetica", "Arial", sans-serif;
          font-weight: 600;
          font-size: 15px;
          line-height: 1.6;
        }

        .af-form .ant-form-item-label > label[lang="en"],
        .af-form .ant-form-item-label > label[lang="en-US"] {
          font-family: "Museo Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
          font-weight: 400;
          font-size: 14px;
          line-height: 1.5;
        }

        /* 确保中文标签的字体渲染优化 */
        .af-form .ant-form-item-label > label span[lang="zh"],
        .af-form .ant-form-item-label > label span[lang="zh-CN"] {
          /* 中文字体优化 */
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "Helvetica Neue", "Helvetica", "Arial", sans-serif !important;
          font-weight: 600 !important;
          font-size: 15px !important;
          line-height: 1.6 !important;
          color: rgb(34, 13, 78) !important;
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
          text-rendering: optimizeLegibility !important;
          font-feature-settings: "liga", "kern" !important;
        }

        /* 确保英文标签的字体渲染 */
        .af-form .ant-form-item-label > label span[lang="en"],
        .af-form .ant-form-item-label > label span[lang="en-US"] {
          /* 英文字体保持原样 */
          font-family: "Museo Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif !important;
          font-weight: 400 !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
          color: rgb(34, 13, 78) !important;
          -webkit-font-smoothing: antialiased !important;
          -moz-osx-font-smoothing: grayscale !important;
        }

        /* 针对中文的额外字体优化 */
        .af-form[lang="zh"] .ant-form-item-label > label,
        .af-form[lang="zh-CN"] .ant-form-item-label > label {
          font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "微软雅黑", "Helvetica Neue", "Helvetica", "Arial", sans-serif !important;
          font-weight: 600 !important;
          font-size: 15px !important;
          line-height: 1.6 !important;
        }

        /* 针对英文的字体保持 */
        .af-form[lang="en"] .ant-form-item-label > label,
        .af-form[lang="en-US"] .ant-form-item-label > label {
          font-family: "Museo Sans", -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif !important;
          font-weight: 400 !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
        }
      `}</style>
      <Card 
        title={
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px' }}>
                              <span
                  onClick={aggregateModeEnabled ? handleAggregateModeToggle : undefined}
                  style={{
                    cursor: aggregateModeEnabled ? 'pointer' : 'default',
                    transition: 'transform 0.2s ease, color 0.3s ease',
                    userSelect: 'none',
                    color: 'inherit',
                  }}
                onMouseEnter={(e) => {
                  if (aggregateModeEnabled) {
                    e.currentTarget.style.transform = 'scale(1.04)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (aggregateModeEnabled) {
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
                title={aggregateModeEnabled ? (language === 'zh' ? '切换模式' : 'Switch Mode') : (language === 'zh' ? '请在Settings页面启用Aggregate Mode' : 'Please enable Aggregate Mode in Settings')}
              >
                {isAggregateMode ? 'GET RAW DASH' : 'GET RAW DATA'}
              </span>
              <Button
                className="mode-chip"
                type="text"
                size="small"
                disabled={true}
                style={{
                  fontSize: '12px',
                  padding: '4px 8px',
                  height: 'auto',
                  border: '1px solid #d9d9d9',
                  borderRadius: '4px',
                  background: '#fff',
                  color: '#666',
                  opacity: aggregateModeEnabled ? 1 : 0.5,
                  cursor: 'default',
                  transition: 'all 0.2s',
                }}
              >
                {isAggregateMode ? 'Aggregate Mode' : 'Normal Mode'}
              </Button>
            </div>
            <PingStatus />
          </div>
        } 
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
          margin: 24,
          padding: 24,
          borderRadius: 4,
          border: '1px solid rgb(230, 233, 240)',
          background: 'rgb(255, 255, 255)',
          position: 'relative'
        }}
      >
        {/* 数据获取区域加 no-select 类名 */}
        <div className="no-select">
          <Form<FormValues>
            form={form}
            layout="vertical"
            onFinish={handleQuery}
            className="af-form"
            lang={language}
            style={{ maxWidth: '600px', margin: '0 auto' }}
          >
            <Form.Item
              label={
                <span lang={language} data-lang={language}>
                  {translations.dataFetch.accountType}
                </span>
              }
              name="accountType"
              rules={[{ required: true, message: translations.dataFetch.validationMessages?.accountTypeRequired || '请选择账户类型' }]}
            >
              {isAggregateMode ? (
                <Input 
                  value="PRT" 
                  disabled 
                  style={{ width: '100%' }}
                />
              ) : (
                <Select 
                  dropdownClassName="af-form"
                  onChange={handleAccountTypeChange}
                  style={{ width: '100%' }}
                >
                  <Select.Option value={ACCOUNT_TYPES.PID}>PID</Select.Option>
                  <Select.Option value={ACCOUNT_TYPES.PRT}>PRT</Select.Option>
                </Select>
              )}
            </Form.Item>

            <Form.Item
              label={
                <span lang={language} data-lang={language}>
                  {translations.dataFetch.accountId}
                </span>
              }
              name="accountId"
              rules={[{ required: true, message: translations.dataFetch.validationMessages?.accountIdRequired || '请选择账户代码' }]}
            >
              {isAggregateMode ? (
                <Select 
                  dropdownClassName="af-form"
                  style={{ width: '100%' }}
                  onChange={handleAccountIdChange}
                >
                  {accountConfigs
                    .filter(config => config.accountType === ACCOUNT_TYPES.PRT)
                    .map(config => (
                      <Select.Option 
                        key={config.id} 
                        value={config.accountName}
                      >
                        {config.accountName}
                      </Select.Option>
                    ))
                  }
                </Select>
              ) : (
                <Select 
                  dropdownClassName="af-form"
                  style={{ width: '100%' }}
                  onChange={handleAccountIdChange}
                >
                  {accountConfigs
                    .filter(config => config.accountType === selectedAccountType)
                    .map(config => (
                      <Select.Option 
                        key={config.id} 
                        value={config.accountName}
                      >
                        {config.accountName}
                    </Select.Option>
                    ))
                  }
                </Select>
              )}
            </Form.Item>

            {/* 新增：PRT时显示Media Source/授权渠道下拉框（仅在Normal模式下显示） */}
            {!isAggregateMode && selectedAccountType === ACCOUNT_TYPES.PRT && (
              <Form.Item
                label={
                  <span lang={language} data-lang={language}>
                    {language === 'zh' ? '授权渠道' : 'Media Source'}
                  </span>
                }
                name="mediaSource"
                rules={[{ required: true, message: language === 'zh' ? '请选择授权渠道' : 'Please select Media Source' }]}
              >
                <Select dropdownClassName="af-form" style={{ width: '100%' }}>
                  <Select.Option value="All Media Source">All Media Source</Select.Option>
                  {accountConfigs
                    .filter(cfg => cfg.accountType === ACCOUNT_TYPES.PID)
                    .map(cfg => (
                      <Select.Option key={cfg.accountName} value={cfg.accountName}>{cfg.accountName}</Select.Option>
                    ))}
                </Select>
              </Form.Item>
            )}

            <Form.Item
              label={
                <span lang={language} data-lang={language}>
                  {language === 'en' ? 'APP ID' : 'APP ID'}
                </span>
              }
              name="appIds"
              rules={[
                { required: true, message: language === 'en' ? 'Please input APP ID' : '请输入APP ID' },
                { 
                  pattern: /^[a-zA-Z0-9._-]+$/, 
                  message: language === 'en' ? 'APP ID can only contain letters, numbers, dots, underscores and hyphens' : 'APP ID只能包含字母、数字、点号、下划线和连字符'
                }
              ]}
            >
              <Input
                onChange={handleAppIdsChange}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
            </Form.Item>

            <Form.Item
              label={
                <span lang={language} data-lang={language}>
                  {translations.dataFetch.dataType}
                </span>
              }
              name="dataType"
              rules={[{ required: true, message: language === 'en' ? 'Please Select Data Type' : '请选择数据类型' }]}
            >
              {isAggregateMode ? (
                <Select 
                  dropdownClassName="af-form"
                  style={{ width: '100%' }}
                >
                  <Select.Option value="daily">Daily-Aggregate</Select.Option>
                  <Select.Option value="partner_daily">Partner-Daily-Aggregate</Select.Option>
                  <Select.Option value="geo_daily">GEO-Daily-Aggregate</Select.Option>
                </Select>
              ) : (
                <Select 
                  dropdownClassName="af-form"
                  style={{ width: '100%' }}
                  onChange={handleDataTypeChange}
                >
                  <Select.Option value={DATA_TYPES.EVENT}>{translations.dataFetch.eventData}</Select.Option>
                  <Select.Option value={DATA_TYPES.INSTALL}>{translations.dataFetch.installData}</Select.Option>
                  <Select.Option value={DATA_TYPES.RETARGET_EVENT}>{translations.dataFetch.retargetEventData}</Select.Option>
                  <Select.Option value={DATA_TYPES.RETARGET_INSTALL}>{translations.dataFetch.retargetInstallData}</Select.Option>
                </Select>
              )}
            </Form.Item>

            {!isAggregateMode && showEventFilter && (
              <Form.Item
                label={
                  <span lang={language} data-lang={language}>
                    <Tooltip title={language === 'en' ? 'Optional' : '可选'}>
                      <QuestionCircleOutlined style={{ color: '#bfbfbf', marginRight: 4, fontSize: 9, verticalAlign: 'super', position: 'relative', top: '2px' }} />
                    </Tooltip>
                    {language === 'en' ? 'Event Filter' : '事件过滤'}
                  </span>
                }
                name="eventFilter"
                required={false}
              >
                <Input
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                />
              </Form.Item>
            )}

            <Form.Item
              name="dateRange"
              label={
                <span lang={language} data-lang={language}>
                  {translations.dataFetch.dateRange}
                </span>
              }
              rules={[{ required: true, message: language === 'en' ? 'Please Select Date Range' : '请选择日期范围' }]}
            >
              <RangePicker
                style={{ width: '100%', textAlign: 'center' }}
                format={DATE_FORMAT}
                disabledDate={disabledDate}
                onChange={(dates) => {
                  if (dates) {
                    setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs]);
                  }
                }}
                inputReadOnly
                className="custom-range-picker"
                renderExtraFooter={() => (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', width: '100%' }}>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 12 }}>
                      {quickRanges.slice(0, 2).map(opt => (
                        <Button
                          key={opt.label}
                          size="small"
                          style={{ minWidth: 80 }}
                          onClick={() => {
                            form.setFieldsValue({ dateRange: opt.value });
                            setDateRange(opt.value as [dayjs.Dayjs, dayjs.Dayjs]);
                          }}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 12 }}>
                      {quickRanges.slice(2).map(opt => (
                        <Button
                          key={opt.label}
                          size="small"
                          style={{ minWidth: 80 }}
                          onClick={() => {
                            form.setFieldsValue({ dateRange: opt.value });
                            setDateRange(opt.value as [dayjs.Dayjs, dayjs.Dayjs]);
                          }}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                icon={<AppsFlyerSearchIcon />}
                loading={loading}
                style={{
                  width: '100%',
                  backgroundColor: '#722ed1',
                  borderColor: '#722ed1',
                  borderRadius: 4,
                  height: 44,
                }}
                onMouseEnter={(e) => {
                  if (loading) return;
                  const t = e.currentTarget as HTMLButtonElement;
                  t.style.backgroundColor = '#5b1fb3';
                  t.style.borderColor = '#5b1fb3';
                }}
                onMouseLeave={(e) => {
                  if (loading) return;
                  const t = e.currentTarget as HTMLButtonElement;
                  t.style.backgroundColor = '#722ed1';
                  t.style.borderColor = '#722ed1';
                }}
              >
                {translations.dataFetch.fetchButton}
              </Button>
            </Form.Item>
          </Form>
        </div>
      </Card>

      <Card title={
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <span>{translations.dataFetch.queryResults || '查询结果'}</span>
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => setDownloadAllModalVisible(true)}
              disabled={isDownloadingAll || queryResults.length === 0}
              style={{
                borderRadius: 4,
                transition: 'all 0.2s ease',
                ...(queryResults.length === 0
                  ? {}
                  : { backgroundColor: '#722ed1', borderColor: '#722ed1', color: '#fff' })
              }}
              onMouseEnter={(e) => {
                if (isDownloadingAll || queryResults.length === 0) return;
                const target = e.currentTarget as HTMLButtonElement;
                target.style.backgroundColor = '#5b1fb3';
                target.style.borderColor = '#5b1fb3';
              }}
              onMouseLeave={(e) => {
                if (isDownloadingAll || queryResults.length === 0) return;
                const target = e.currentTarget as HTMLButtonElement;
                target.style.backgroundColor = '#722ed1';
                target.style.borderColor = '#722ed1';
              }}
            >
              {isDownloadingAll ? (
                <>
                  <LoadingOutlined /> {language === 'en' ? 'Downloading...' : '下载中...'}
                </>
              ) : (
                translations.dataFetch.downloadAll
              )}
            </Button>
            <Button
              icon={<DeleteOutlined />}
              onClick={() => setDeleteAllModalVisible(true)}
              disabled={queryResults.length === 0}
              style={{
                backgroundColor: 'transparent',
                borderColor: queryResults.length === 0 ? '#d9d9d9' : '#595959',
                color: queryResults.length === 0 ? '#bfbfbf' : '#595959',
                transition: 'all 0.2s ease',
                borderRadius: 4
              }}
              onMouseEnter={(e) => {
                if (queryResults.length === 0) return;
                const target = e.currentTarget as HTMLButtonElement;
                target.style.backgroundColor = '#595959';
                target.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                if (queryResults.length === 0) return;
                const target = e.currentTarget as HTMLButtonElement;
                target.style.backgroundColor = 'transparent';
                target.style.color = '#595959';
              }}
            >
              {language === 'en' ? 'Delete All' : '删除全部'}
            </Button>
          </Space>
        </div>
      } style={{
        WebkitFontSmoothing: 'antialiased',
        textSizeAdjust: '100%',
        color: 'rgb(34, 13, 78)',
        fontFamily: '"Museo Sans", sans-serif',
        fontWeight: 300,
        fontSize: 13,
        lineHeight: '20px',
        letterSpacing: '0.0025em',
        boxSizing: 'inherit',
        margin: 24,
        padding: 24,
        borderRadius: 4,
        border: '1px solid rgb(230, 233, 240)',
        background: 'rgb(255, 255, 255)'
      }}>
        {/* AppsFlyer-like table presentation styles (visual only) */}
        <style>
          {`
          .appsflyer-table .ant-table {
            -webkit-font-smoothing: antialiased;
            text-size-adjust: 100%;
            color: rgb(34, 13, 78);
            font-family: "Museo Sans", sans-serif;
            font-weight: 300;
            font-size: 13px;
            line-height: 20px;
            letter-spacing: 0.0025em;
            box-sizing: inherit;
          }
          .appsflyer-table .ant-table table {
            border-collapse: collapse;
            border-spacing: 0px;
          }
          .appsflyer-table .ant-table-thead { display: table-header-group; }
          .appsflyer-table .ant-table-tbody { display: table-row-group; }
          /* keep widths as defined by columns; avoid overriding width */
          .appsflyer-table .ant-table-thead > tr > th,
          .appsflyer-table .ant-table-tbody > tr > td {
            white-space: nowrap;
            overflow: hidden; /* 防止内容越界到固定列区域 */
          }

          /* 确保内容区和固定列之间的交界处不出现抗锯齿缝隙 */
          .appsflyer-table .ant-table-content { transform: translateZ(0); }

          /* 防止横向滚动在到达最右侧时的"橡皮筋"拉扯，导致右侧固定列按钮轻微抖动 */
          .appsflyer-table .ant-table-container,
          .appsflyer-table .ant-table-body {
            overscroll-behavior-x: contain;
            /* 关键：防止滚动边界处的抖动 */
            scroll-behavior: auto;
          }

          /* 专门针对Actions列（最右固定列）的稳定性优化 */
          .appsflyer-table .ant-table-cell-fix-right-last,
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right-last {
            padding-right: 12px;
            background: #fff !important;
            /* 关键：确保Actions列位置绝对稳定 */
            position: sticky !important;
            right: 0 !important;
            /* 防止任何可能的位移 */
            transform: none !important;
            transition: none !important;
            /* 确保z-index足够高，避免被其他元素影响 */
            z-index: 100 !important;
          }

          /* 为Actions列内的按钮容器提供稳定的定位上下文 */
          .appsflyer-table .ant-table-cell-fix-right-last .ant-space {
            position: relative;
            /* 防止按钮组在滚动边界处出现位移 */
            transform: translateZ(0);
            /* 确保按钮组始终居中 */
            display: flex;
            justify-content: center;
            align-items: center;
            width: 100%;
            /* 防止任何可能的位移 */
            left: 0 !important;
            right: 0 !important;
            /* 确保按钮组位置绝对稳定 */
            position: relative !important;
          }

          /* 为Actions列内的每个按钮提供稳定性保障 */
          .appsflyer-table .ant-table-cell-fix-right-last .ant-space .ant-btn {
            /* 防止按钮在滚动边界处出现位移 */
            position: relative !important;
            transform: none !important;
            transition: none !important;
            /* 确保按钮尺寸稳定 */
            width: auto !important;
            min-width: auto !important;
            /* 防止按钮被挤压变形 */
            flex-shrink: 0;
          }

          /* 防止Actions列在表格容器变化时出现位置偏移 */
          .appsflyer-table .ant-table-container:focus-within .ant-table-cell-fix-right-last,
          .appsflyer-table .ant-table-container:focus .ant-table-cell-fix-right-last {
            right: 0 !important;
            transform: none !important;
          }

          /* 关键：让非冻结列根据内容弹性扩展且不会被固定宽度约束。
             利用 table-layout: auto（antd 默认即为 auto），并允许单元格自然撑开；
             通过 min-width 保障基础可读性，max-width 不设置全局上限，交由横向滚动承载超长内容。 */
          .appsflyer-table .ant-table table { table-layout: auto; }
          
          /* 关键：非冻结列滚动控制 - 只让左侧非冻结列参与横向滚动 */
          .appsflyer-table .ant-table-tbody > tr > td:not(.ant-table-cell-fix-right),
          .appsflyer-table .ant-table-thead > tr > th:not(.ant-table-cell-fix-right) {
            /* 非冻结列参与横向滚动 */
            position: relative;
            /* 确保非冻结列可以正常滚动 */
            transform: none;
            /* 防止非冻结列被固定列影响 */
            z-index: 1;
          }

          /* 避免表体与表头错位：强制各单元格最小宽度由内容决定 */
          .appsflyer-table .ant-table-thead > tr > th,
          .appsflyer-table .ant-table-tbody > tr > td {
            width: auto !important;
          }
          /* 右侧固定列：保底宽度，防止遮挡 */
          .appsflyer-table .ant-table-fixed-right .ant-table-tbody > tr > td,
          .appsflyer-table .ant-table-fixed-right .ant-table-thead > tr > th {
            min-width: 100px;
          }

          /* 专门针对Actions列的宽度和位置稳定性 */
          .appsflyer-table .ant-table-cell-fix-right-last {
            /* 确保Actions列宽度固定且稳定 */
            width: 140px !important;
            min-width: 140px !important;
            max-width: 140px !important;
            /* 防止内容溢出导致的宽度变化 */
            overflow: hidden !important;
            /* 确保按钮组始终在固定位置 */
            box-sizing: border-box !important;
          }

          /* 防止Actions列在滚动边界处出现任何位移 */
          .appsflyer-table .ant-table-container:hover .ant-table-cell-fix-right-last,
          .appsflyer-table .ant-table-body:hover .ant-table-cell-fix-right-last {
            right: 0 !important;
            transform: none !important;
          }

          /* 防止固定列与内容区之间出现 1px 对齐偏差（不同像素密度/缩放下常见）*/
          .appsflyer-table .ant-table-fixed-right .ant-table-body-outer .ant-table-body-inner {
            margin-right: 0 !important;
          }

          /* 关键：固定一个稳定的最右边界线，避免 antd ping 阴影在滚动中显隐造成的跳变 */
          .appsflyer-table .ant-table-container { 
            border-right: none !important; 
            background: #fff !important; 
          }
          .appsflyer-table .ant-table-content { 
            background: #fff !important; 
          }
          .appsflyer-table .ant-table-body { 
            background: #fff !important; 
          }
          .appsflyer-table .ant-table-cell-fix-right-last { border-right: none !important; }
          /* 关闭 antd 在右侧的 ping 阴影过渡，不显示任何分割线 */
          .appsflyer-table .ant-table-cell-fix-right-first,
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right-first { position: relative; z-index: 4; }
          /* 完全删除固定列左侧分割线 */
          .appsflyer-table .ant-table-cell-fix-right-first::after {
            display: none !important;
            content: none !important;
            box-shadow: none !important;
            border: none !important;
            background: none !important;
            opacity: 0 !important;
            transition: none !important;
          }
          /* 无论滚动状态如何，都不显示分割线 */
          .appsflyer-table .ant-table-ping-right .ant-table-cell-fix-right-first::after { 
            display: none !important;
            opacity: 0 !important;
          }

          /* 避免固定列边缘在滚动中明暗变化：固定列与表头/表体设置不透明背景并提升绘制稳定性 */
          /* 为表头和表体的固定列单元格设置不透明背景，防止底层内容透出 */
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right,
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right-first,
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right-last {
            background: #fafafa !important; /* 表头背景色 */
            z-index: 70; /* 大幅提高表头z-index */
          }
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right,
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right-first,
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right-last {
            background: #fff !important; /* 表体背景色 */
            z-index: 65; /* 大幅提高表体z-index */
          }

          /* 在固定列容器左侧叠加一条不透明的"覆盖边"，彻底遮挡底层滚动文本 */
          .appsflyer-table .ant-table-fixed-right {
            position: relative;
            z-index: 80; /* 大幅提高整个固定列容器的z-index，确保完全覆盖底层内容 */
            background: #fff; /* 统一白底，避免列间缝隙透出底层滚动内容 */
          }
          /* 容器遮罩（早期块）：统一改为始终显示且更宽的白底遮罩 */
          .appsflyer-table .ant-table-fixed-right::before {
            content: '';
            position: absolute;
            top: 0; bottom: 0; left: -14px; width: 24px; /* 更宽的遮挡带，覆盖所有子像素缝隙 */
            background: #fff; /* 统一白底 */
            pointer-events: none;
            z-index: 30; /* 置于最上层 */
            display: block;
          }
          /* 始终显示覆盖边，但不显示分割线 */
          .appsflyer-table .ant-table-ping-right .ant-table-fixed-right::before { 
            display: block !important;
            border: none !important;
            box-shadow: none !important;
          }

          /* 完全移除所有固定列之间的分割线 */
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right,
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right {
            box-shadow: none !important;
            border-right: none !important;
            border-left: none !important;
          }
          
          /* 移除所有固定列的伪元素分割线 */
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right::before,
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right::after,
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right::before,
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right::after {
            display: none !important;
          }
          
          /* 删除所有固定列的分割线，包括最左侧固定列 */
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right-first,
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right-first {
            border-left: none !important;
            border-right: none !important;
            box-shadow: none !important;
            z-index: 70;
          }
          
          /* 最右侧固定列（Actions）保持无边框 */
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right-last,
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right-last {
            border-right: none !important;
            border-left: none !important;
            box-shadow: none !important;
          }
          
          /* soften or remove table header corner radius */
          .appsflyer-table .ant-table,
          .appsflyer-table .ant-table-container,
          .appsflyer-table .ant-table-content,
          .appsflyer-table .ant-table-header {
            border-radius: 2px !important; /* very slight radius */
          }
          .appsflyer-table .ant-table-thead > tr > th {
            border-radius: 0 !important; /* cancel default rounding on header cells */
          }
          .appsflyer-table .ant-table-thead > tr > th:first-child {
            border-top-left-radius: 2px !important;
          }
          .appsflyer-table .ant-table-thead > tr > th:last-child {
            border-top-right-radius: 2px !important;
          }
          
          /* 关闭 antd 在右侧的 ping 阴影/分隔线，不显示任何分割线 */
          .appsflyer-table .ant-table-cell-fix-right-first,
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right-first { position: relative; z-index: 4; }
          .appsflyer-table .ant-table-cell-fix-right-first::after {
            display: none !important; /* 禁用 antd 自带的分割线 */
            content: none !important;
            border: none !important;
            box-shadow: none !important;
            background: none !important;
            opacity: 0 !important;
            position: static !important;
            width: 0 !important;
            height: 0 !important;
            top: auto !important;
            bottom: auto !important;
            left: auto !important;
            right: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            transform: none !important;
            transition: none !important;
            pointer-events: none !important;
            z-index: -1 !important;
            visibility: hidden !important;
            clip: rect(0, 0, 0, 0) !important;
            overflow: hidden !important;
          }

          /* 为所有右侧固定列 th/td 提供定位上下文，便于其 ::before 遮挡条正确锚定 */
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right,
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right { position: relative; }

          /* 容器级左侧覆盖边：始终显示，彻底覆盖底层滚动文本，但不绘制任何分割线 */
          .appsflyer-table .ant-table-fixed-right {
            position: relative;
            z-index: 50; /* 大幅提高整个固定列容器的z-index，确保完全覆盖底层内容 */
            background: #fff; /* 统一白底，避免列间缝隙透出底层滚动内容 */
          }
          .appsflyer-table .ant-table-fixed-right::before {
            content: '';
            position: absolute;
            top: 0; bottom: 0; left: -20px; width: 30px; /* 大幅增加遮挡带宽度，彻底覆盖所有子像素缝隙和长文本 */
            background: #fff; /* 用白底完全遮挡 */
            border-left: none !important; /* 不显示任何分割线 */
            border-right: none !important;
            box-shadow: none !important;
            pointer-events: none;
            z-index: 100; /* 大幅提高z-index，确保在最上层 */
            display: block; /* 始终显示，避免 ping 状态抖动 */
          }

          /* 删除其余右侧固定列的分割线，避免列与列之间的视觉分隔 */
          .appsflyer-table .ant-table-thead > tr > th.ant-table-cell-fix-right:not(.ant-table-cell-fix-right-first)::before,
          .appsflyer-table .ant-table-tbody > tr > td.ant-table-cell-fix-right:not(.ant-table-cell-fix-right-first)::before {
            display: none !important;
            content: none !important;
            border: none !important;
            box-shadow: none !important;
            background: none !important;
          }

          /* 专门针对事件过滤列长文本的额外防护：在固定列左侧添加更强的覆盖层，但不绘制分割线 */
          .appsflyer-table .ant-table-fixed-right::after {
            content: '';
            position: absolute;
            top: 0; bottom: 0; left: -25px; width: 35px; /* 比::before更宽的覆盖层，专门处理长文本 */
            background: #fff; /* 纯白背景 */
            border-left: none !important;
            border-right: none !important;
            box-shadow: none !important;
            pointer-events: none;
            z-index: 90; /* 在::before之下，但在其他内容之上 */
            display: block;
          }

          /* 针对事件过滤列的特殊防护：确保长文本不会穿透到固定列 */
          .appsflyer-table .ant-table-tbody > tr > td[data-column-key="event_filter"] {
            position: relative;
            z-index: 1; /* 确保在覆盖层之下 */
          }
          
          /* 为事件过滤列添加右侧边界防护，但不绘制分割线 */
          .appsflyer-table .ant-table-tbody > tr > td[data-column-key="event_filter"]::after {
            content: '';
            position: absolute;
            top: 0; bottom: 0; right: -1px; width: 2px;
            background: #fff;
            border: none !important;
            box-shadow: none !important;
            z-index: 2;
          }

          /* 启用硬件加速，优化渲染性能，减少子像素渲染问题 */
          .appsflyer-table .ant-table-fixed-right,
          .appsflyer-table .ant-table-fixed-right::before,
          .appsflyer-table .ant-table-fixed-right::after {
            transform: translateZ(0);
            backface-visibility: hidden;
            perspective: 1000px;
          }

          /* 专门针对Actions列的硬件加速和稳定性优化 */
          .appsflyer-table .ant-table-cell-fix-right-last {
            /* 启用硬件加速 */
            transform: translateZ(0) !important;
            backface-visibility: hidden;
            perspective: 1000px;
            /* 防止任何CSS动画或过渡影响位置 */
            animation: none !important;
            transition: none !important;
            /* 确保渲染层独立 */
            will-change: auto;
            /* 防止子像素渲染问题 */
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }

          /* 关键：让滑块只绑定到非冻结列，与右侧三列冻结列分离 */
          .appsflyer-table .ant-table-body {
            /* 设置滚动区域只包含非冻结列 */
            overflow-x: auto;
            /* 关键：滚动条只影响左侧非冻结列，不影响右侧固定列 */
            scrollbar-width: thin;
            scrollbar-color: #d9d9d9 transparent;
          }

          /* 确保右侧固定列不受横向滚动影响 */
          .appsflyer-table .ant-table-fixed-right {
            /* 固定位置，不受滚动条影响 */
            position: sticky;
            right: 0;
            /* 确保固定列始终可见，不被滚动条遮挡 */
            z-index: 100;
            /* 防止滚动条影响固定列位置 */
            transform: translateZ(0);
            /* 关键：固定列不参与横向滚动计算 */
            overflow: visible !important;
            /* 确保固定列宽度稳定 */
            width: auto !important;
          }

          /* 关键：滚动容器只包含非冻结列，固定列独立 */
          .appsflyer-table .ant-table-body {
            /* 滚动区域只包含非冻结列 */
            overflow-x: auto;
            /* 滚动条只影响左侧内容，不影响右侧固定列 */
            scrollbar-width: thin;
            scrollbar-color: #d9d9d9 transparent;
            /* 确保滚动不会影响固定列位置 */
            position: relative;
          }

          /* 非冻结列内容区域滚动控制 */
          .appsflyer-table .ant-table-content {
            /* 滚动容器 */
            overflow-x: auto;
            /* 滚动条样式 */
            scrollbar-width: thin;
            scrollbar-color: #d9d9d9 transparent;
          }

          /* 防止滚动条在边界处的抖动影响Actions列位置 */
          .appsflyer-table .ant-table-body::-webkit-scrollbar {
            /* 确保滚动条样式稳定 */
            width: 8px;
            height: 8px;
          }
          
          .appsflyer-table .ant-table-body::-webkit-scrollbar-track {
            background: transparent;
          }
          
          .appsflyer-table .ant-table-body::-webkit-scrollbar-thumb {
            background: #d9d9d9;
            border-radius: 4px;
            /* 防止滚动条在边界处出现跳动 */
            border: none;
          }

          /* 关键：让滚动条只控制非冻结列，冻结列保持固定 */
          .appsflyer-table .ant-table-body {
            /* 确保滚动容器正确设置 */
            overflow-x: auto;
            overflow-y: auto;
          }

          /* 非冻结列区域：允许横向滚动 */
          .appsflyer-table .ant-table-content {
            /* 非冻结列可以正常滚动 */
            overflow-x: visible;
          }

          /* 冻结列区域：完全脱离滚动控制，保持固定位置 */
          .appsflyer-table .ant-table-fixed-right {
            /* 冻结列不受滚动条影响 */
            position: sticky;
            right: 0;
            /* 确保冻结列始终在最右侧，不受滚动进度影响 */
            transform: none !important;
            /* 防止滚动条影响冻结列位置 */
            pointer-events: auto;
          }

          /* 冻结列内的所有单元格都保持固定位置 */
          .appsflyer-table .ant-table-fixed-right .ant-table-cell-fix-right {
            /* 确保冻结列单元格位置绝对稳定 */
            position: sticky !important;
            /* 防止任何滚动相关的位移 */
            transform: none !important;
            transition: none !important;
          }

          /* 专门针对Actions列（最右冻结列）的额外稳定性 */
          .appsflyer-table .ant-table-cell-fix-right-last {
            /* 确保Actions列完全脱离滚动控制 */
            position: sticky !important;
            right: 0 !important;
            /* 防止滚动条影响位置 */
            transform: none !important;
            /* 确保z-index足够高，不被滚动内容影响 */
            z-index: 200 !important;
          }

          /* 防止滚动条在冻结列区域产生任何影响 */
          .appsflyer-table .ant-table-fixed-right .ant-table-body-outer,
          .appsflyer-table .ant-table-fixed-right .ant-table-body-inner {
            /* 冻结列内部不参与滚动计算 */
            overflow: visible !important;
            /* 确保冻结列内容不受滚动影响 */
            transform: none !important;
          }
          
          /* 确保所有固定列单元格都有稳定的背景 */
          .appsflyer-table .ant-table-cell-fix-right {
            background-clip: padding-box !important;
            border-collapse: separate !important;
          }
          
          /* 完全删除最右侧三个冻结列的所有分割线 */
          .appsflyer-table .ant-table-cell-fix-right,
          .appsflyer-table .ant-table-cell-fix-right-first,
          .appsflyer-table .ant-table-cell-fix-right-last {
            border-left: none !important;
            border-right: none !important;
            box-shadow: none !important;
          }
          
          /* 删除冻结列之间的所有伪元素分割线 */
          .appsflyer-table .ant-table-cell-fix-right::before,
          .appsflyer-table .ant-table-cell-fix-right::after,
          .appsflyer-table .ant-table-cell-fix-right-first::before,
          .appsflyer-table .ant-table-cell-fix-right-first::after,
          .appsflyer-table .ant-table-cell-fix-right-last::before,
          .appsflyer-table .ant-table-cell-fix-right-last::after {
            display: none !important;
            content: none !important;
            box-shadow: none !important;
            border: none !important;
          }
          
          /* 删除冻结列容器的分割线 */
          .appsflyer-table .ant-table-fixed-right::before,
          .appsflyer-table .ant-table-fixed-right::after {
            border-left: none !important;
            border-right: none !important;
            box-shadow: none !important;
          }
           `}
         </style>
        <div style={{ position: 'relative' }}>
          <Table
            className="appsflyer-table"
            style={{
              opacity: tableLoading ? 0 : 1, // Loading时隐藏表格，完成后显示
              transition: 'opacity 1s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)', // 表格淡入动画：1秒
              transform: tableLoading ? 'translateY(15px) scale(0.98)' : 'translateY(0) scale(1)', // Loading时轻微下移和缩小，完成后回到原位
              transformOrigin: 'center top', // 从顶部中心开始变换
              marginTop: 16, // 保持原有的上边距
            }}
            columns={[
            {
              title: (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
                  {translations.dataFetch.accountInfo || '账户信息'}
                </div>
              ),
              dataIndex: 'account',
              key: 'account',
              align: 'center' as const,
              render: (_: any, record) => (
                <span style={{ fontWeight: 600 }}>{record.accountId}</span>
              )
            },
            {
              title: (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
                  {translations.dataFetch.appId || 'APP ID'}
                </div>
              ),
              dataIndex: 'appId',
              key: 'appId',
              align: 'center' as const,
              render: (text: string) => (
                <span style={{ fontWeight: 600 }}>{text}</span>
              )
            },
            {
              title: (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
                  {translations.dataFetch.appName || '应用名称'}
                </div>
              ),
              dataIndex: 'appName',
              key: 'appName',
              align: 'center' as const,
              render: (text: string, record: any) => {
                // 如果没有appName，显示"-"，保持和Event Filter列一样的样式
                if (!text || text.trim() === '') {
                  return <span style={{ fontWeight: 600 }}>-</span>;
                }
                return <span style={{ fontWeight: 600 }}>{text}</span>;
              }
            },
            {
              title: (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
                  {translations.dataFetch.dataType || '数据类型'}
                </div>
              ),
              dataIndex: 'dataType',
              key: 'dataType',
              align: 'center' as const,
              render: (text: string) => {
                // 直接返回原始值，不进行翻译
                return <span style={{ fontWeight: 600 }}>{text}</span>;
              }
            },
            {
              title: (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
                  {translations.dataFetch.dateRange || '日期范围'}
                </div>
              ),
              dataIndex: 'dateRange',
              key: 'dateRange',
              align: 'center' as const,
              render: (dateRange: string) => {
                const sep = language === 'en' ? ' TO ' : ' 至 ';
                if (dateRange.includes('至') || dateRange.includes('TO')) {
                  const [start, end] = dateRange.split(/至|TO/);
                  return <span style={{ fontWeight: 600 }}>{`${start.trim()}${sep}${end.trim()}`}</span>;
                }
                return <span style={{ fontWeight: 600 }}>{dateRange}</span>;
              }
            },
            ...(!isAggregateMode ? [{
              title: (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
                  {translations.dataFetch.eventFilter || '事件过滤'}
                </div>
              ),
              dataIndex: 'event_filter',
              key: 'event_filter',
              align: 'center' as const,
              render: (text: string) => (
                <span style={{ fontWeight: 600 }}>{text || '-'}</span>
              )
            }] : []),
            {
              title: (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
                  {translations.dataFetch.status || '状态'}
                </div>
              ),
              dataIndex: 'status',
              key: 'status',
              width: 80,
              align: 'center',
              fixed: 'right' as const,
              render: (status: string, record: any) => {
                let color = 'default';
                let fill = '#fff';
                // 检查是否有错误响应
                const hasError = record.apiResponse?.status === 'error' || 
                                (record.apiResponse?.details?.error_type && record.apiResponse?.details?.error_code);
                
                if (status === 'success' && !hasError) {
                  color = 'green';
                  fill = '#52c41a';
                } else if (status === 'error' || hasError) {
                  color = 'error';
                  fill = '#ff4d4f';
                } else if (status === 'processing') {
                  color = 'processing';
                  fill = '#1677ff';
                }
                return (
                  <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: 0, margin: 0 }}>
                    <Tag
                      color={fill}
                      style={{
                        minWidth: 40,
                        textAlign: 'center',
                        margin: 0,
                        padding: '0 8px',
                        height: 24,
                        lineHeight: '24px',
                        fontSize: 14,
                        background: fill,
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        position: 'relative',
                        overflow: 'visible',
                        // 按语言切换稳健的字体栈，保证中英文都良好显示
                        fontFamily: language === 'zh'
                          ? '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", "Heiti SC", "SimHei", "Source Han Sans SC", -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
                          : 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, -apple-system, system-ui, "Noto Sans", sans-serif',
                        letterSpacing: language === 'zh' ? 0 : 0.2,
                        fontFeatureSettings: '"tnum" on, "lnum" on',
                      }}
                    >
                      {status === 'success' && !hasError
                        ? (translations.dataFetch.statusSuccess || '成功')
                        : status === 'error' || hasError
                        ? (translations.dataFetch.statusError || '失败')
                        : (translations.dataFetch.statusProcessing || '请求中')}
                    </Tag>
                  </div>
                );
              }
            },
            {
              title: translations.dataFetch.log || '日志',
              dataIndex: 'message',
              key: 'message',
              width: 100,
              align: 'center' as const,
              fixed: 'right' as const,
              ellipsis: true,
              render: (msg: string, record: any) => {
                if (record.status === 'processing') return '';
                if (record.status === 'success') {
                  // 检查是否有错误响应
                  const hasError = record.apiResponse?.status === 'error' || 
                                 (record.apiResponse?.details?.error_type && record.apiResponse?.details?.error_code);
                  
                  if (hasError) {
                    // 显示错误信息
                    let showMsg = record.apiResponse?.message || msg;
                    if (record.apiResponse?.details?.error_type === 'authorization' && 
                        record.apiResponse?.details?.error_code === '404') {
                      showMsg = translations.dataFetch.noAuthorized;
                    }
                    return (
                      <LogLink onClick={() => showDetail(record)}>
                        {showMsg}
                      </LogLink>
                    );
                  }
                  
                  // 正常成功情况
                  const rowCount = (record.apiResponse as any)?.details?.rowCount || 0;
                  let showMsg = '';
                  if (rowCount === 0) {
                    showMsg = language === 'en' ? 'No Records' : '无记录';
                  } else {
                    if (language === 'en') {
                      showMsg = `${rowCount} ${rowCount > 1 ? 'Records' : 'Record'}`;
                    } else {
                      showMsg = `${rowCount}条记录`;
                    }
                  }
                  return (
                    <LogLink onClick={() => showDetail(record)}>
                      {showMsg}
                    </LogLink>
                  );
                } else {
                  // 错误时关键字多语言绑定
                  let showMsg = msg;
                  if (
                    showMsg === '请求上限' || showMsg === 'Request limit' || showMsg === 'Request Limit' ||
                    showMsg === translations.dataFetch.requestLimit
                  ) {
                    showMsg = translations.dataFetch.requestLimit;
                  } else if (
                    showMsg === '没有可用数据' || showMsg === 'No data available' ||
                    showMsg === translations.dataFetch.noDataAvailable
                  ) {
                    showMsg = translations.dataFetch.noDataAvailable;
                  } else if (
                    showMsg === '无授权关系' || showMsg === 'No Authorized' ||
                    showMsg === '请检查授权关系' || showMsg === 'Please check authorization' ||
                    showMsg === translations.dataFetch.noAuthorized ||
                    (record.apiResponse?.details?.error_type === 'authorization' && 
                     record.apiResponse?.details?.error_code === '404')
                  ) {
                    showMsg = translations.dataFetch.noAuthorized;
                  } else if (
                    showMsg === '网络错误' || showMsg === 'Network error' ||
                    showMsg === translations.dataFetch.networkError
                  ) {
                    showMsg = translations.dataFetch.networkError;
                  } else if (
                    showMsg === '数据范围超出可用范围' || showMsg === 'Range Not Satisfiable' ||
                    (record.apiResponse?.details?.error_type === 'range_error')
                  ) {
                    showMsg = translations.dataFetch.rangeNotSatisfiable || (language === 'en' ? 'Range Not Satisfiable' : '数据范围超出可用范围');
                  } else if (
                    showMsg === '无访问权限' || showMsg === 'No Access Permission' ||
                    (record.apiResponse?.details?.error_type === 'permission_error')
                  ) {
                    showMsg = translations.dataFetch.noAccessPermission || (language === 'en' ? 'No Access Permission' : '无访问权限');
                  } else if (
                    showMsg === '时间范围限制' || showMsg === 'Range Limit' ||
                    showMsg === translations.dataFetch.rangeLimit ||
                    (record.apiResponse?.details?.error_type === 'api_error' &&
                     record.apiResponse?.details?.error_code === '400' &&
                     record.apiResponse?.details?.error_message?.includes('reports are limited to'))
                  ) {
                    // 从错误消息中提取天数
                    const match = record.apiResponse?.details?.error_message?.match(/reports are limited to\s*(\d+)\s*days/i);
                    const days = match ? match[1] : '';
                    showMsg = language === 'en'
                      ? `Range Limit ${days} Days`
                      : `数据限制${days}天`;
                  }
                  return (
                    <LogLink onClick={() => showDetail(record)}>
                      {showMsg}
                    </LogLink>
                  );
                }
              }
            },
            {
              title: translations.dataFetch.actions || '操作',
              key: 'action',
              width: 140,
              align: 'center' as const,
              fixed: 'right' as const,
              render: (_, record) => {
                const rowCount = (record.apiResponse as any)?.details?.rowCount || 0;
                const hasNoData = rowCount === 0;
                
                return (
                  <Space size="small">
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
                    <AppsFlyerReportButton
                      disabled={record.status !== 'success' || hasNoData || importing[record.key] || reportNames.includes(getReportName(record))}
                      onClick={() => {
                        if (!reportNames.includes(getReportName(record))) {
                          handleImport(record);
                        }
                      }}
                      loading={importing[record.key]}
                      isImported={reportNames.includes(getReportName(record))}
                      status={record.status}
                    />
                    <AppsFlyerDeleteButton
                      onClick={() => handleDelete(record)}
                      loading={deleting[record.key]}
                    />
                  </Space>
                );
              }
            }
          ]}
          dataSource={queryResults.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)}
          pagination={false}
          scroll={{ x: 'max-content' }}
          tableLayout="auto"
          size="middle"
          bordered
          data-testid="custom-table-loading"
          rowClassName={(record, index) => {
            let className = '';
            if (highlightKey === record.key && highlightType === 'processing') className += ' highlight-row-processing';
            if (highlightKey === record.key && highlightType === 'success') className += ' highlight-row';
            // 为每一行添加动画延迟
            if (!tableLoading) {
              className += ' fade-in-row';
            }
            return className.trim();
          }}
          onRow={(record, index) => ({ 
            id: `row-${record.key}`,
            style: {
              '--row-index': index || 0,
              animationDelay: `${(index || 0) * 0.1}s`
            } as React.CSSProperties
          })}
          rowKey={record => record.key + '_' + (reportNames.includes(getReportName(record)) ? '1' : '0')}
          loading={false}
          locale={{
            emptyText: (
              <div style={{ padding: '32px 0' }}>
                {translations.dataFetch.noData || '暂无数据'}
              </div>
            )
          }}
          />
          
          {/* 表格Loading覆盖层 - 完全覆盖表格区域（包括表头） */}
          <div 
            className="table-loading-overlay"
            style={{
              position: 'absolute',
              top: '-24px', // 向上扩展，覆盖Card的padding区域，确保覆盖表头
              left: '-24px', // 向左扩展，覆盖Card的padding区域
              right: '-24px', // 向右扩展，覆盖Card的padding区域
              bottom: '-24px', // 向下扩展，覆盖Card的padding区域
              background: '#ffffff', // 完全不透明，完全遮挡表格内容
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000, // 大幅提高z-index，确保覆盖所有元素
              borderRadius: '8px',
              pointerEvents: 'none', // 允许点击穿透到下层
              opacity: tableLoading ? 1 : 0, // 根据加载状态控制透明度
              transition: 'opacity 1s cubic-bezier(0.25, 0.46, 0.45, 0.94)', // Loading淡出：1秒
              visibility: tableLoading ? 'visible' : 'hidden', // 加载完成后完全隐藏
              // 确保Loading覆盖层完全遮挡表格内容
              boxShadow: '0 0 0 2px #ffffff', // 增加白色边框宽度，确保完全覆盖
              backdropFilter: 'blur(0px)', // 禁用任何背景模糊效果
              // 强制覆盖所有内容
              overflow: 'hidden' // 防止内容溢出
            }}
          >
            {/* 紫色主题的按钮样式Loading */}
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: '3px solid rgba(114, 46, 209, 0.2)',
              borderTop: '3px solid #722ED1',
              animation: 'spin 1s linear infinite'
            }} />
            <div style={{
              color: '#722ED1',
              fontSize: '14px',
              fontWeight: '500',
              marginTop: '16px'
            }}>
              {language === 'zh' ? '加载中' : 'Loading'}
            </div>
          </div>
        </div>
        
        <div style={{ textAlign: 'right', marginTop: 12 }}>
          {!tableLoading && queryResults.length > 0 && (
            <>
              <style>{`
                .appsflyer-pagination .ant-pagination-item,
                .appsflyer-pagination .ant-pagination-item a {
                  border: none !important;
                  box-shadow: none !important;
                  outline: none !important;
                  background: transparent !important;
                }
                .appsflyer-pagination .ant-pagination-item {
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  min-width: 28px;
                  height: 28px;
                  padding: 0;
                  margin: 0 4px;
                  border-radius: 4px;
                }
                /* 使左右箭头与数字方块保持对称间距 */
                .appsflyer-pagination .ant-pagination-prev,
                .appsflyer-pagination .ant-pagination-next {
                  margin: 0 4px !important;
                }
                .appsflyer-pagination .ant-pagination-prev .ant-pagination-item-link,
                .appsflyer-pagination .ant-pagination-next .ant-pagination-item-link,
                .appsflyer-pagination .ant-pagination-prev a,
                .appsflyer-pagination .ant-pagination-next a {
                  border: none !important;
                  box-shadow: none !important;
                  background: transparent !important;
                }
                .appsflyer-pagination .ant-pagination-item-active,
                .appsflyer-pagination .ant-pagination-item:focus,
                .appsflyer-pagination .ant-pagination-item:focus-visible {
                  border: none !important;
                  box-shadow: none !important;
                  outline: none !important;
                }
              `}</style>
            <Pagination
                className="appsflyer-pagination"
              current={currentPage}
              pageSize={PAGE_SIZE}
              total={queryResults.length}
              showSizeChanger={false}
              showQuickJumper={false}
              simple={false}
              onChange={page => setCurrentPage(page)}
              itemRender={(page, type, originalElement) => {
                if (type === 'page') {
                  return (
                      <PageChip active={page === currentPage}>{page}</PageChip>
                  );
                }
                if (type === 'prev') {
                  return <span style={{ margin: '0 4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', color: currentPage === 1 ? '#ccc' : '#1677ff', fontSize: 18 }}>&lt;</span>;
                }
                if (type === 'next') {
                  return <span style={{ margin: '0 4px', cursor: currentPage === Math.ceil(queryResults.length / PAGE_SIZE) ? 'not-allowed' : 'pointer', color: currentPage === Math.ceil(queryResults.length / PAGE_SIZE) ? '#ccc' : '#1677ff', fontSize: 18 }}>&gt;</span>;
                }
                return originalElement;
              }}
              style={{ display: 'inline-block' }}
              pageSizeOptions={[]}
              showLessItems
              // 只显示1~3页
              // 下面是自定义页码范围
              // 但Antd默认会自动处理，数据不超过3页时只显示对应页码
            />
            </>
          )}
        </div>
      </Card>

      {/* 删除确认对话框 */}
      <Modal
        title={translations.dataFetch.confirmDelete || '确认删除'}
        open={deleteConfirmModalVisible}
        onOk={confirmDelete}
        onCancel={cancelDelete}
        okText={translations.dataFetch.confirm || '确认'}
        cancelText={translations.dataFetch.cancel || '取消'}
      >
        <p>{translations.dataFetch.confirmDeleteContent || '确定要删除这条记录吗？此操作不可恢复。'}</p>
      </Modal>

      <Modal
        title={
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>
            {translations.dataFetch.logDetail || translations.dataFetch.log || '详细日志'}
          </span>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
      >
        {currentDetail && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, margin: '24px 0 8px 0' }}>{translations.dataFetch.accountInfo || '账户信息'}</div>
            <p>{currentDetail.accountType}-{currentDetail.accountId}</p>
            <div style={{ fontSize: 18, fontWeight: 600, margin: '24px 0 8px 0' }}>{translations.dataFetch.basicInfo || '基本信息'}</div>
            <p>{translations.dataFetch.appId || 'APP ID'}: {currentDetail.appId}</p>
            {(currentDetail.appName && currentDetail.appName.trim() !== '') || currentDetail.mode === 'aggregate' ? (
              <p>{translations.dataFetch.appName || 'App Name'}: {
                currentDetail.mode === 'aggregate' 
                  ? (queriedAppName || currentDetail.appName || 'N/A')
                  : currentDetail.appName
              }</p>
            ) : null}
            <p>{translations.dataFetch.dataType || '数据类型'}: {
              (() => {
                const map: Record<string, { zh: string; en: string }> = {
                  install: { zh: '安装', en: 'Install' },
                  event: { zh: '事件', en: 'Event' },
                  retarget_event: { zh: '再归因', en: 'Retarget' },
                  fraud: { zh: '欺诈', en: 'Fraud' },
                };
                const lang = language === 'en' ? 'en' : 'zh';
                return map[currentDetail.dataType] ? map[currentDetail.dataType][lang] : currentDetail.dataType;
              })()
            }</p>
            <p>{translations.dataFetch.dateRange || '日期范围'}: {
              (() => {
                const sep = language === 'en' ? ' TO ' : ' 至 ';
                if (currentDetail.dateRange.includes('至') || currentDetail.dateRange.includes('TO')) {
                  const [start, end] = currentDetail.dateRange.split(/至|TO/);
                  return `${start.trim()}${sep}${end.trim()}`;
                }
                return currentDetail.dateRange;
              })()
            }</p>
            <p>{translations.dataFetch.status || '状态'}: {
              (() => {
                // 检查是否有错误响应
                const hasError = currentDetail.apiResponse?.status === 'error' || 
                               (currentDetail.apiResponse?.details?.error_type && currentDetail.apiResponse?.details?.error_code);
                
                if (currentDetail.status === 'success' && !hasError) {
                  return translations.dataFetch.statusSuccess || '成功';
                } else if (hasError) {
                  return translations.dataFetch.statusError || '失败';
                } else if (currentDetail.status === 'processing') {
                  return translations.dataFetch.statusProcessing || '请求中';
                }
                return currentDetail.status;
              })()
            }</p>
            <p>{
              (() => {
                // 检查是否有错误响应
                const hasError = currentDetail.apiResponse?.status === 'error' || 
                               (currentDetail.apiResponse?.details?.error_type && currentDetail.apiResponse?.details?.error_code);
                
                if (currentDetail.status === 'processing') return `${translations.dataFetch.log || '日志'}: `;
                if (currentDetail.status === 'success' && !hasError) {
                  const rowCount = (currentDetail.apiResponse as any)?.details?.rowCount || 0;
                  return `${translations.dataFetch.log || '日志'}: ` + (language === 'en'
                    ? rowCount === 0 ? 'No Records' : `${rowCount} ${rowCount > 1 ? 'Records' : 'Record'}`
                    : rowCount === 0 ? '无记录' : `${rowCount}条记录`);
                } else {
                  // 错误时关键字多语言绑定
                  let showMsg = currentDetail.message;
                  if (
                    showMsg === '请求上限' || showMsg === 'Request limit' || showMsg === 'Request Limit' ||
                    showMsg === translations.dataFetch.requestLimit
                  ) {
                    showMsg = translations.dataFetch.requestLimit;
                  } else if (
                    showMsg === '没有可用数据' || showMsg === 'No data available' ||
                    showMsg === translations.dataFetch.noDataAvailable
                  ) {
                    showMsg = translations.dataFetch.noDataAvailable;
                  } else if (
                    showMsg === '无授权关系' || showMsg === 'No Authorized' ||
                    showMsg === '请检查授权关系' || showMsg === 'Please check authorization' ||
                    showMsg === translations.dataFetch.noAuthorized ||
                    (currentDetail.apiResponse?.details?.error_type === 'authorization' && 
                     currentDetail.apiResponse?.details?.error_code === '404')
                  ) {
                    showMsg = translations.dataFetch.noAuthorized;
                  } else if (
                    showMsg === '网络错误' || showMsg === 'Network error' ||
                    showMsg === translations.dataFetch.networkError
                  ) {
                    showMsg = translations.dataFetch.networkError;
                  } else if (
                    showMsg === '数据范围超出可用范围' || showMsg === 'Range Not Satisfiable' ||
                    (currentDetail.apiResponse?.details?.error_type === 'range_error')
                  ) {
                    showMsg = translations.dataFetch.rangeNotSatisfiable || (language === 'en' ? 'Range Not Satisfiable' : '数据范围超出可用范围');
                  } else if (
                    showMsg === '无访问权限' || showMsg === 'No Access Permission' ||
                    (currentDetail.apiResponse?.details?.error_type === 'permission_error')
                  ) {
                    showMsg = translations.dataFetch.noAccessPermission || (language === 'en' ? 'No Access Permission' : '无访问权限');
                  } else if (
                    showMsg === '时间范围限制' || showMsg === 'Range Limit' ||
                    showMsg === translations.dataFetch.rangeLimit ||
                    (currentDetail.apiResponse?.details?.error_type === 'api_error' &&
                     currentDetail.apiResponse?.details?.error_code === '400' &&
                     currentDetail.apiResponse?.details?.error_message?.includes('reports are limited to'))
                  ) {
                    // 从错误消息中提取天数
                    const match = currentDetail.apiResponse?.details?.error_message?.match(/reports are limited to\s*(\d+)\s*days/i);
                    const days = match ? match[1] : '';
                    showMsg = language === 'en'
                      ? `Range Limit ${days} Days`
                      : `数据限制${days}天`;
                  }
                  return `${translations.dataFetch.log || '日志'}: ` + showMsg;
                }
              })()
            }</p>
            {/* 模式区分显示 */}
            {currentDetail.mode === 'aggregate' ? (
              // Aggregate模式：不显示任何统计信息
              null
            ) : (
              // Normal模式：显示AFID Deduplication和Primary Attribution
              <>
            {typeof currentDetail.afidDeduplicationCount === 'number' && (
              <p>{(translations.dataFetch.afidDeduplication || 'AFID去重') + ': '} {
                language === 'en'
                  ? `${currentDetail.afidDeduplicationCount} ${currentDetail.afidDeduplicationCount !== 1 ? 'Records' : 'Record'}`
                  : `${currentDetail.afidDeduplicationCount}条记录`
              }</p>
            )}
            {typeof currentDetail.primaryAttributionCount === 'number' && (
              <p>{(translations.dataFetch.primaryAttribution || 'Primary Attribution') + ': '} {
                language === 'en'
                  ? `${currentDetail.primaryAttributionCount} ${currentDetail.primaryAttributionCount !== 1 ? 'Records' : 'Record'}`
                  : `${currentDetail.primaryAttributionCount}条记录`
              }</p>
                )}
              </>
            )}
            <div style={{ fontSize: 18, fontWeight: 600, margin: '24px 0 8px 0' }}>{translations.dataFetch.apiResponse || 'API响应'}</div>
            <pre style={{ 
              backgroundColor: '#f5f5f5', 
              padding: '16px', 
              borderRadius: '4px',
              maxHeight: '300px',
              overflow: 'auto'
            }}>
              {JSON.stringify(currentDetail.apiResponse || currentDetail.errorDetails || {}, null, 2)}
            </pre>
          </div>
        )}
      </Modal>

      {/* 预览数据模态框 */}
      <Modal
        title={
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>
            {language === 'en' ? 'Data Preview' : '数据预览'}
          </span>
        }
        open={previewModalVisible}
        onCancel={() => setPreviewModalVisible(false)}
        footer={null}
        width={1200}
      >
        {selectedPreviewRecord && (
          <div>
            {/* Data Preview Table */}
            {previewData.length > 0 ? (
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                <Table
                  dataSource={previewData}
                  columns={(() => {
                    if (previewData.length === 0) return [];
                    
                    const sampleRow = previewData[0];
                    return Object.keys(sampleRow).map(key => ({
                      title: key,
                      dataIndex: key,
                      key: key,
                      render: (value: any) => {
                        if (typeof value === 'object' && value !== null) {
                          return <pre style={{ margin: 0, fontSize: '12px' }}>{JSON.stringify(value, null, 2)}</pre>;
                        }
                        return String(value);
                      }
                    }));
                  })()}
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: false,
                    showQuickJumper: false,
                    showTotal: (total) => `${language === 'en' ? 'Total' : '共'} ${total} ${language === 'en' ? 'records' : '条记录'}`,
                    size: 'small'
                  }}
                  size="small"
                  scroll={{ x: 'max-content' }}
                />
              </div>
            ) : (
              <p style={{ color: '#999', textAlign: 'center', padding: '20px' }}>
                {language === 'en' ? 'No preview data available' : '暂无预览数据'}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* 下载全部确认对话框 */}
      <Modal
        title={language === 'en' ? 'Confirm Download All' : '确认下载全部'}
        open={downloadAllModalVisible}
        onOk={handleDownloadAll}
        onCancel={() => setDownloadAllModalVisible(false)}
        confirmLoading={isDownloadingAll}
        okText={language === 'en' ? 'Confirm' : '确认'}
        cancelText={language === 'en' ? 'Cancel' : '取消'}
      >
        <p>{language === 'en' ? 'Are you sure you want to download all data? This may take some time.' : '确定要下载所有数据吗？这可能需要一些时间。'}</p>
      </Modal>

      {/* 删除全部确认对话框 */}
      <Modal
        title={language === 'en' ? 'Confirm Delete All' : '确认删除全部'}
        open={deleteAllModalVisible}
        onOk={handleDeleteAll}
        onCancel={() => setDeleteAllModalVisible(false)}
        confirmLoading={deletingAll}
        okText={language === 'en' ? 'Confirm' : '确认'}
        cancelText={language === 'en' ? 'Cancel' : '取消'}
      >
        <p>{language === 'en' ? 'Are you sure you want to delete all records? This action cannot be undone.' : '确定要删除所有记录吗？此操作不可恢复。'}</p>
      </Modal>

      {/* 模式切换动画覆盖层 */}
      <ModeTransitionOverlay
        visible={showTransition}
        fromMode={transitionFrom}
        toMode={transitionTo}
        isLoading={transitionLoading}
        progress={transitionProgress}
        onComplete={() => setShowTransition(false)}
      />
    </div>
  );
};

export default Home;
