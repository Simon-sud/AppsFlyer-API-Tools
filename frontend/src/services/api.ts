import axios from 'axios';

// 配置 axios 默认值
const API_BASE_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : '';
export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  timeout: 60000,
  withCredentials: true  // 启用 credentials
});

// 请求拦截器
axiosInstance.interceptors.request.use(
  (config) => {
    // 从localStorage或sessionStorage获取token
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log('发送请求:', config.url, config.method, config.headers);
    return config;
  },
  (error) => {
    console.error('请求错误:', error);
    return Promise.reject(error);
  }
);

// 响应拦截器
axiosInstance.interceptors.response.use(
  (response) => {
    console.log('收到响应:', response.status, response.data);
    return response;
  },
  (error) => {
    console.error('响应错误:', error.response?.status, error.response?.data);
    
    // 只有在以下情况下才清除 token：
    // 1. 是 401 错误（未授权）
    // 2. 不是登录请求
    // 3. 不是 token 验证请求
    // 4. 不是网络错误
    // 5. 不是用户信息请求
    // 6. 不是首次加载
    if (error.response?.status === 401 && !error.code) {
      const url = error.config.url || '';
      const isAuthRequest = url.includes('/api/auth/');
      const isFirstLoad = !localStorage.getItem('lastVerification');
      
      if (!isAuthRequest && !isFirstLoad) {
        console.log('清除 token 和用户信息');
        localStorage.removeItem('token');
        localStorage.removeItem('userProfile');
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('loginTime');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('userProfile');
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('loginTime');
      }
    }
    return Promise.reject(error);
  }
);

export interface FetchDataParams {
  accountType: string;
  accountId: string;
  dataType: string;
  fromDate: string;
  toDate: string;
  appId: string;
  apiToken: string;
  eventName?: string;
}

export const fetchData = async (params: FetchDataParams) => {
  try {
    console.log('开始获取数据，参数:', params);
    const response = await axiosInstance.post('/api/query-data', params);
    console.log('数据获取成功:', response.data);
    return response.data;
  } catch (error: any) {
    console.error('数据获取失败:', error);
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }
    throw new Error(`数据获取失败: ${error.message}`);
  }
};
export const getAccountInfo = async (accountType: string) => {
  try {
    console.log('开始获取账户信息:', accountType);
    const response = await axiosInstance.get('/api/auth/account-configs');
    console.log('账户配置获取成功:', response.data);
    // 前端筛选指定类型
    const data = response.data as { configs?: any[] };
    if (data && Array.isArray(data.configs)) {
      const filtered = data.configs.filter((cfg: any) => cfg.account_type === accountType);
      return filtered.length > 0 ? filtered[0] : null;
    }
    return null;
  } catch (error: any) {
    console.error('获取账户信息失败:', error);
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    }
    throw new Error(`获取账户信息失败: ${error.message}`);
  }
};

