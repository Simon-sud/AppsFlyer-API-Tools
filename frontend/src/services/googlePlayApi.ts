// Google Play API service
// google-play-scraper backend (scraper port 3001)
// Prod: same-origin via Nginx to 3001; dev: localhost:3001
const API_BASE_URL =
  process.env.REACT_APP_GOOGLEPLAY_API_URL !== undefined && process.env.REACT_APP_GOOGLEPLAY_API_URL !== ''
    ? process.env.REACT_APP_GOOGLEPLAY_API_URL.replace(/\/$/, '')
    : process.env.NODE_ENV === 'development'
      ? 'http://localhost:3001'
      : '';

const normalizeGooglePlayIdentifier = (input: string): string => {
  const raw = String(input || '').trim();
  if (!raw) return '';

  // Direct package name input.
  if (/^[a-zA-Z0-9._-]+$/.test(raw) && raw.includes('.')) {
    return raw;
  }

  // Play Store URL or market://details URL.
  try {
    const parsedUrl = new URL(raw);
    const packageId = (parsedUrl.searchParams.get('id') || '').trim();
    if (/^[a-zA-Z0-9._-]+$/.test(packageId) && packageId.includes('.')) {
      return packageId;
    }
  } catch (_error) {
    // Ignore parsing errors and keep the original string.
  }

  return raw;
};

// Shared request helper
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

// Google Play app info types
export interface GooglePlayAppInfo {
  appId: string;
  title: string;
  developer: string;
  developerId: string;
  icon: string;
  score: number;
  scoreText: string;
  priceText: string;
  free: boolean;
  genre: string;
  genreId: string;
  size: string;
  androidVersion: string;
  androidVersionText?: string; // Missing field
  contentRating: string;
  updated: string;
  version: string;
  installs: string;
  reviews: number;
  description: string;
  descriptionHTML: string;
  changelog: string;
  comments: string[];
  privacyPolicy: string;
  developerWebsite: string;
  developerEmail: string;
  developerAddress: string;
  similar: string[];
  familyGenre: string;
  familyGenreId: string;
  video: string;
  videoImage: string;
  screenshots: string[];
  contentRatingDescription: string;
  adSupported: boolean;
  released: string;
  appType: string;
  permissions: string[];
  offersIAP: boolean;
  IAPRange: string;
  price: number;
  currency: string;
  originalPrice: number;
  originalPriceText: string;
  onSale: boolean;
  saleTime: number;
  histogram: { [key: number]: number };
  // categories array replaces tags
  categories?: Array<{
    name: string;
    id: string | null;
  }>;
  // Keep optional tags for backward compat
  tags?: string[];
}

// Review types
export interface GooglePlayReview {
  id: string;
  userName: string;
  userImage: string;
  date: string;
  score: number;
  scoreText: string;
  url: string;
  title: string;
  text: string;
  replyDate: string;
  replyText: string;
  thumbsUp: number;
  criterias: any[];
}

// Permission types
export interface GooglePlayPermission {
  permission: string;
  type: string;
}

// Data safety types
export interface GooglePlayDataSafety {
  dataShared: Array<{
    data: string;
    optional: boolean;
    purpose: string;
    type: string;
  }>;
  dataCollected: Array<{
    data: string;
    optional: boolean;
    purpose: string;
    type: string;
  }>;
  securityPractices: Array<{
    practice: string;
    description: string;
  }>;
  privacyPolicyUrl: string;
}

// App stats types
export interface GooglePlayAppStats {
  appId: string;
  basicInfo: {
    title: string;
    developer: string;
    category: string;
    price: string;
    size: string;
    installs: string;
    currentVersion: string;
    androidVersion: string;
    contentRating: string;
  };
  ratings: {
    averageRating: number;
    totalRatings: number;
    ratingDistribution: { [key: number]: number };
    positivePercentage: string;
    negativePercentage: string;
    neutralPercentage: string;
  };
  reviews: {
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    recentReviews: GooglePlayReview[];
  };
  metadata: {
    lastUpdated: string;
    releaseDate: string;
    privacyPolicy: string;
    developerWebsite: string;
  };
}

// Google Play API client
export class GooglePlayApiService {
  // 1. App details
  static async getAppDetails(
    appId: string,
    lang: string = 'en',
    country: string = 'us',
    timeout: number = 5000,
    retryCount: number = 3
  ): Promise<GooglePlayAppInfo> {
    const normalizedAppId = normalizeGooglePlayIdentifier(appId);
    const response = await apiRequest(`/api/app/${encodeURIComponent(normalizedAppId)}?lang=${lang}&country=${country}&timeout=${timeout}&retryCount=${retryCount}`);
    return response.data;
  }

  // 2. Search apps
  static async searchApps(term: string, lang: string = 'en', country: string = 'us', num: number = 20, fullDetail: boolean = false, timeout: number = 5000, retryCount: number = 3): Promise<{ data: GooglePlayAppInfo[], total: number }> {
    const response = await apiRequest(`/api/search?term=${encodeURIComponent(term)}&lang=${lang}&country=${country}&num=${num}&fullDetail=${fullDetail}&timeout=${timeout}&retryCount=${retryCount}`);
    return response;
  }

  // 3. App reviews
  static async getAppReviews(appId: string, lang: string = 'en', country: string = 'us', num: number = 20, sort: string = 'newest'): Promise<{ data: GooglePlayReview[], total: number }> {
    const normalizedAppId = normalizeGooglePlayIdentifier(appId);
    const response = await apiRequest(`/api/app/${encodeURIComponent(normalizedAppId)}/reviews?lang=${lang}&country=${country}&num=${num}&sort=${sort}`);
    return response;
  }

  // 4. Similar apps
  static async getSimilarApps(appId: string, lang: string = 'en', country: string = 'us', fullDetail: boolean = false): Promise<{ data: GooglePlayAppInfo[], total: number }> {
    const normalizedAppId = normalizeGooglePlayIdentifier(appId);
    const response = await apiRequest(`/api/app/${encodeURIComponent(normalizedAppId)}/similar?lang=${lang}&country=${country}&fullDetail=${fullDetail}`);
    return response;
  }

  // 5. App permissions
  static async getAppPermissions(appId: string, lang: string = 'en', country: string = 'us', short: boolean = false): Promise<{ data: GooglePlayPermission[], total: number }> {
    const normalizedAppId = normalizeGooglePlayIdentifier(appId);
    const response = await apiRequest(`/api/app/${encodeURIComponent(normalizedAppId)}/permissions?lang=${lang}&country=${country}&short=${short}`);
    return response;
  }

  // 6. Data safety
  static async getDataSafety(appId: string, lang: string = 'en'): Promise<{ data: GooglePlayDataSafety }> {
    const normalizedAppId = normalizeGooglePlayIdentifier(appId);
    const response = await apiRequest(`/api/app/${encodeURIComponent(normalizedAppId)}/datasafety?lang=${lang}`);
    return response;
  }

  // 7. Category list
  static async getCategories(): Promise<{ data: string[], total: number }> {
    const response = await apiRequest('/api/categories');
    return response;
  }

  // 8. Apps in category
  static async getCategoryApps(category: string, lang: string = 'en', country: string = 'us', num: number = 20, fullDetail: boolean = false): Promise<{ data: GooglePlayAppInfo[], total: number }> {
    const response = await apiRequest(`/api/category/${category}?lang=${lang}&country=${country}&num=${num}&fullDetail=${fullDetail}`);
    return response;
  }

  // 9. Top apps
  static async getTopApps(lang: string = 'en', country: string = 'us', num: number = 20, fullDetail: boolean = false): Promise<{ data: GooglePlayAppInfo[], total: number }> {
    const response = await apiRequest(`/api/top?lang=${lang}&country=${country}&num=${num}&fullDetail=${fullDetail}`);
    return response;
  }

  // 10. New apps
  static async getNewApps(lang: string = 'en', country: string = 'us', num: number = 20, fullDetail: boolean = false): Promise<{ data: GooglePlayAppInfo[], total: number }> {
    const response = await apiRequest(`/api/new?lang=${lang}&country=${country}&num=${num}&fullDetail=${fullDetail}`);
    return response;
  }

  // 11. Trending apps
  static async getTrendingApps(lang: string = 'en', country: string = 'us', num: number = 20, fullDetail: boolean = false): Promise<{ data: GooglePlayAppInfo[], total: number }> {
    const response = await apiRequest(`/api/trending?lang=${lang}&country=${country}&num=${num}&fullDetail=${fullDetail}`);
    return response;
  }

  // 12. Developer apps
  static async getDeveloperApps(devId: string, lang: string = 'en', country: string = 'us', num: number = 20, fullDetail: boolean = false): Promise<{ data: GooglePlayAppInfo[], total: number }> {
    const response = await apiRequest(`/api/developer/${devId}?lang=${lang}&country=${country}&num=${num}&fullDetail=${fullDetail}`);
    return response;
  }

  // 13. Developer info
  static async getDeveloperInfo(devId: string, lang: string = 'en', country: string = 'us', num: number = 50): Promise<any> {
    const response = await apiRequest(`/api/developer/${devId}/info?lang=${lang}&country=${country}&num=${num}`);
    return response;
  }

  // 14. Batch apps
  static async getBatchApps(appIds: string[], lang: string = 'en', country: string = 'us'): Promise<{ data: GooglePlayAppInfo[], errors: any[], total: number, failed: number }> {
    const response = await apiRequest('/api/apps/batch', {
      method: 'POST',
      body: JSON.stringify({ appIds, lang, country }),
    });
    return response;
  }

  // 15. Compare apps
  static async compareApps(appIds: string[], lang: string = 'en', country: string = 'us'): Promise<any> {
    const response = await apiRequest('/api/apps/compare', {
      method: 'POST',
      body: JSON.stringify({ appIds, lang, country }),
    });
    return response;
  }

  // 16. App stats
  static async getAppStats(appId: string, lang: string = 'en', country: string = 'us'): Promise<{ data: GooglePlayAppStats }> {
    const normalizedAppId = normalizeGooglePlayIdentifier(appId);
    const response = await apiRequest(`/api/app/${encodeURIComponent(normalizedAppId)}/stats?lang=${lang}&country=${country}`);
    return response;
  }

  // 17. Search suggestions
  static async getSearchSuggestions(term: string, lang: string = 'en', country: string = 'us'): Promise<{ data: string[], total: number }> {
    const response = await apiRequest(`/api/suggest?term=${encodeURIComponent(term)}&lang=${lang}&country=${country}`);
    return response;
  }

  // 18. Market trends
  static async getMarketTrends(lang: string = 'en', country: string = 'us', category: string = 'GAME'): Promise<any> {
    const response = await apiRequest(`/api/trends?lang=${lang}&country=${country}&category=${category}`);
    return response;
  }

  // 19. Health check
  static async healthCheck(): Promise<{ status: string, timestamp: string }> {
    const response = await apiRequest('/health');
    return response;
  }

  // 20. Smart lookup — package name, title, etc.
  static async findApp(searchTerm: string, lang: string = 'en', country: string = 'us', timeout: number = 5000, retryCount: number = 3): Promise<GooglePlayAppInfo | null> {
    try {
      const normalizedSearchTerm = normalizeGooglePlayIdentifier(searchTerm);
      const expectedAppId = normalizedSearchTerm.trim().toLowerCase();
      const looksLikePackageId = /^[a-zA-Z0-9._-]+$/.test(normalizedSearchTerm) && normalizedSearchTerm.includes('.');
      // Try package id lookup first
      if (normalizedSearchTerm.includes('.')) {
        try {
          const appDetails = await this.getAppDetails(normalizedSearchTerm, lang, country, timeout, retryCount);
          // Normalize protocol-relative icon URLs
          if (appDetails && appDetails.icon && appDetails.icon.startsWith('//')) {
            appDetails.icon = `https:${appDetails.icon}`;
          }
          return appDetails;
        } catch (error) {
          console.log('通过包名查找失败，尝试搜索模式');
        }
      }

      // Package lookup failed — try search
      const searchResults = await this.searchApps(normalizedSearchTerm, lang, country, 10, false, timeout, retryCount);
      
      if (searchResults.data && searchResults.data.length > 0) {
        const exactMatchedResult = looksLikePackageId
          ? searchResults.data.find((item) => String(item?.appId || '').trim().toLowerCase() === expectedAppId)
          : null;

        // Package/URL input must match appId exactly
        if (looksLikePackageId && !exactMatchedResult) {
          return null;
        }

        const firstResult = exactMatchedResult || searchResults.data[0];
        
        // Incomplete search hit or missing icon — fetch full details by appId
        if (!firstResult.description || !firstResult.installs || !firstResult.reviews || !firstResult.icon) {
          try {
            console.log('搜索结果不完整，尝试获取完整详情...');
            const fullDetails = await this.getAppDetails(firstResult.appId, lang, country, timeout, retryCount);
            if (fullDetails && fullDetails.icon && fullDetails.icon.startsWith('//')) {
              fullDetails.icon = `https:${fullDetails.icon}`;
            }
            return fullDetails;
          } catch (error) {
            console.log('获取完整详情失败，返回搜索结果:', error);
            if (firstResult && firstResult.icon && firstResult.icon.startsWith('//')) {
              firstResult.icon = `https:${firstResult.icon}`;
            }
            return firstResult;
          }
        }
        
        // Protocol-relative icon — prepend https
        if (firstResult && firstResult.icon && firstResult.icon.startsWith('//')) {
          firstResult.icon = `https:${firstResult.icon}`;
        }
        return firstResult;
      }

      return null;
    } catch (error) {
      console.error('应用查找失败:', error);
      return null;
    }
  }

  // 21. Full app info (reviews, permissions, etc.)
  static async getFullAppInfo(appId: string, lang: string = 'en', country: string = 'us'): Promise<any> {
    try {
      const [appDetails, reviews, permissions, dataSafety] = await Promise.all([
        this.getAppDetails(appId, lang, country),
        this.getAppReviews(appId, lang, country, 20, 'newest'),
        this.getAppPermissions(appId, lang, country, false),
        this.getDataSafety(appId, lang).catch(() => ({ data: null }))
      ]);

      return {
        appDetails,
        reviews: reviews.data,
        permissions: permissions.data,
        dataSafety: dataSafety.data,
        summary: {
          totalReviews: reviews.total,
          totalPermissions: permissions.total,
          hasDataSafety: !!dataSafety.data
        }
      };
    } catch (error) {
      console.error('获取完整应用信息失败:', error);
      throw error;
    }
  }

  // 22. Build tags from categories
  static generateTagsFromCategories(appInfo: GooglePlayAppInfo): string[] {
    const tags: string[] = [];
    
    // Primary category
    if (appInfo.genre) {
      tags.push(appInfo.genre);
    }
    
    // Detailed categories
    if (appInfo.categories && Array.isArray(appInfo.categories)) {
      appInfo.categories.forEach(category => {
        if (category.name && !tags.includes(category.name)) {
          tags.push(category.name);
        }
      });
    }
    
    // Content rating
    if (appInfo.contentRating) {
      tags.push(appInfo.contentRating);
    }
    
    // Other useful flags
    if (appInfo.adSupported !== undefined) {
      tags.push(appInfo.adSupported ? 'Ad Supported' : 'No Ads');
    }
    
    if (appInfo.offersIAP !== undefined) {
      tags.push(appInfo.offersIAP ? 'In-App Purchases' : 'No IAP');
    }
    
    if (appInfo.androidVersionText && appInfo.androidVersionText !== 'VARY') {
      tags.push(`Android ${appInfo.androidVersionText}+`);
    }
    
    return tags;
  }
}

// Default export
export default GooglePlayApiService;
