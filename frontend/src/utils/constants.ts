export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';

export const DATA_TYPES = {
  EVENT: 'event',
  INSTALL: 'install',
  RETARGET_EVENT: 'retarget_event',
  RETARGET_INSTALL: 'retarget_install',
  // Aggregate模式的数据类型
  DAILY: 'daily',
  PARTNER_DAILY: 'partner_daily',
  GEO_DAILY: 'geo_daily',
} as const;

export const ACCOUNT_TYPES = {
  PID: 'PID',
  PRT: 'PRT',
} as const;

export const DATE_FORMAT = 'YYYY-MM-DD';

export type DataType = typeof DATA_TYPES[keyof typeof DATA_TYPES];
export type AccountType = typeof ACCOUNT_TYPES[keyof typeof ACCOUNT_TYPES];

// 添加事件类型判断函数
export const isEventType = (dataType: DataType): boolean => {
  return dataType === DATA_TYPES.EVENT || dataType === DATA_TYPES.RETARGET_EVENT;
};

// 获取当前用户的账户刷新周期（毫秒）
export function getAccountRefreshInterval(userId: string): number {
  const key = `accountRefreshRule_${userId}`;
  const val = localStorage.getItem(key) || '5MIN';
  if (val === '10MIN') return 10 * 60 * 1000;
  if (val === '15MIN') return 15 * 60 * 1000;
  return 5 * 60 * 1000;
}
