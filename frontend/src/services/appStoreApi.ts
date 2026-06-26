// App Store API client — Scraper backend on port 3001.
// Prod: same-origin via Nginx /api/appstore/; dev: http://localhost:3001
const APPSTORE_API_BASE_URL =
  process.env.REACT_APP_APPSTORE_API_URL !== undefined && process.env.REACT_APP_APPSTORE_API_URL !== ''
    ? process.env.REACT_APP_APPSTORE_API_URL.replace(/\/$/, '')
    : process.env.NODE_ENV === 'development'
      ? 'http://localhost:3001'
      : '';

// App metadata from app-store-scraper
export interface AppStoreAppInfo {
  // basic info
  id: number;
  appId?: string;
  title?: string;
  
  // developer info
  developer?: string;
  developerId?: number;
  developerUrl?: string;        // App Store developer page
  developerWebsite?: string;    // Developer site (preferred when present)
  
  // rating info
  score?: number;
  reviews?: number;
  currentVersionScore?: number;
  currentVersionReviews?: number;
  
  // Rating histogram
  ratingHistogram?: { [key: number]: number };
  
  // version info
  version?: string;
  requiredOsVersion?: string;
  released?: string;
  updated?: string;
  releaseNotes?: string;
  
  // pricing info
  price?: number;
  currency?: string;
  free?: boolean;
  
  // category info
  primaryGenre?: string;
  primaryGenreId?: number;
  genres?: string[];
  genreIds?: string[];
  contentRating?: string;
  
  // Description & locale
  description?: string;
  size?: string;
  languages?: string[];
  
  // media assets
  icon?: string;
  screenshots?: string[];
  ipadScreenshots?: string[];
  appletvScreenshots?: string[];
  supportedDevices?: string[];
  
  // links
  url?: string;
  
  // Legacy iTunes field aliases
  trackId?: number;
  trackName?: string;
  artistName?: string;
  averageUserRating?: number;
  userRatingCount?: number;
  formattedPrice?: string;
  bundleId?: string;
  minimumOsVersion?: string;
  fileSizeBytes?: string;
  currentVersionReleaseDate?: string;
  primaryGenreName?: string;
  screenshotUrls?: string[];
  trackViewUrl?: string;
  artworkUrl100?: string;
  artworkUrl512?: string;
  
  // Optional / legacy fields
  downloadCount?: number;
  inAppPurchases?: string[];
  subscriptionPeriod?: string;
  subscriptionGroup?: string;
  sellerUrl?: string;
}

// Search API response
export interface AppStoreSearchResponse {
  success: boolean;
  data: AppStoreAppInfo[];
  platform: string;
  total: number;
}

// Single-app API response
export interface AppStoreAppResponse {
  success: boolean;
  data: AppStoreAppInfo;
  platform: string;
  error?: string; // Optional error message from scraper
}

// Ranked search suggestion
export interface SearchSuggestion {
  app: AppStoreAppInfo;
  score: number;
  matchType: 'exact' | 'partial' | 'fuzzy';
}

// Review types
export interface AppStoreReview {
  id: string;
  userName: string;
  userUrl: string;
  version: string;
  score: number;
  title: string;
  text: string;
  url: string;
}

// Aggregate ratings response
export interface AppStoreRatings {
  ratings: number;
  histogram: number[];
}

class AppStoreApiService {
  private baseUrl = APPSTORE_API_BASE_URL;

  private normalizeStoreId(value: string | number | undefined | null): string {
    return String(value || '').replace(/^id/i, '').trim();
  }

  private normalizeBundleId(value: string | undefined | null): string {
    return String(value || '').trim().toLowerCase();
  }

  private isExactMatch(searchTerm: string, app: AppStoreAppInfo): boolean {
    const input = searchTerm.trim();
    const isStoreIdInput = /^id?\d+$/i.test(input);
    const isBundleIdInput = input.includes('.');

    const returnedStoreId = this.normalizeStoreId(app.id || app.trackId || '');
    const returnedBundleId = this.normalizeBundleId(app.bundleId || app.appId || '');

    if (isStoreIdInput) {
      const expectedStoreId = this.normalizeStoreId(input);
      return !!expectedStoreId && returnedStoreId === expectedStoreId;
    }

    if (isBundleIdInput) {
      const expectedBundleId = this.normalizeBundleId(input);
      return !!expectedBundleId && returnedBundleId === expectedBundleId;
    }

    return true;
  }
  
  /**
   * Look up an iOS app by Bundle ID.
   * @param bundleId App bundle identifier
   * @param country Store country code (default: us)
   */
  async findAppByBundleId(bundleId: string, country: string = 'us', timeout: number = 5000, retryCount: number = 3): Promise<AppStoreAppInfo | null> {
    try {
      const url = `${this.baseUrl}/api/appstore/app/${encodeURIComponent(bundleId)}?country=${country}&lang=en&timeout=${timeout}&retryCount=${retryCount}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data: AppStoreAppResponse = await response.json();
      
      if (data.success && data.data) {
        console.log(`✅ 通过 Bundle ID 查询成功: ${data.data.title || data.data.trackName || 'Unknown'}`);
        // Normalize scraper payload
        return this.transformAppStoreData(data.data);
      }
      
      return null;
    } catch (error) {
      console.error('通过Bundle ID查找应用失败:', error);
      throw error;
    }
  }
  
  /**
   * Look up an iOS app by App Store numeric ID.
   * @param appStoreId Store ID (e.g. 6449386307 or id6449386307)
   */
  async findAppByStoreId(appStoreId: string, country: string = 'us', timeout: number = 5000, retryCount: number = 3): Promise<AppStoreAppInfo | null> {
    try {
      // Strip optional "id" prefix
      const cleanId = appStoreId.replace(/^id/i, '');
      console.log(`🔍 通过 App Store ID 查询: ${cleanId}`);
      
      const url = `${this.baseUrl}/api/appstore/app/${cleanId}?country=${country}&lang=en&timeout=${timeout}&retryCount=${retryCount}`;
      console.log(`🌐 请求URL: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error(`❌ HTTP 请求失败: ${response.status} ${response.statusText}`);
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data: AppStoreAppResponse = await response.json();
      console.log(`📊 响应数据:`, data);
      
      if (data.success && data.data) {
        console.log(`✅ 通过 App Store ID 查询成功: ${data.data.title || data.data.trackName || 'Unknown'}`);
        // Normalize scraper payload
        return this.transformAppStoreData(data.data);
      } else {
        console.log(`⚠️ 响应成功但数据为空:`, data);
        if (data.error) {
          console.error(`❌ 后端返回错误: ${data.error}`);
        }
        return null;
      }
    } catch (error) {
      console.error('❌ 通过App Store ID查找应用失败:', error);
      throw error;
    }
  }
  
  /**
   * Search iOS apps by name and pick the best match.
   */
  async findAppByName(appName: string, country: string = 'us', timeout: number = 5000, retryCount: number = 3): Promise<AppStoreAppInfo | null> {
    try {
      const url = `${this.baseUrl}/api/appstore/search?term=${encodeURIComponent(appName)}&country=${country}&lang=en&num=5&timeout=${timeout}&retryCount=${retryCount}`;
      console.log(`🔍 搜索URL: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data: AppStoreSearchResponse = await response.json();
      console.log(`📊 搜索结果:`, data);
      
      if (data.success && data.data && data.data.length > 0) {
        console.log(`✅ 找到 ${data.data.length} 个搜索结果`);
        console.log(`📋 第一个结果:`, data.data[0]);
        // Rank candidates and return best match
        return this.findBestMatch(appName, data.data);
      } else {
        console.log(`⚠️ 没有找到搜索结果或数据格式不正确`);
        return null;
      }
    } catch (error) {
      console.error('通过名称搜索应用失败:', error);
      throw error;
    }
  }

  /** Fetch paginated reviews for an app (bundle ID or store ID). */
  async getAppReviews(identifier: string, country: string = 'us', page: number = 1, sort: 'recent' | 'helpful' = 'recent'): Promise<AppStoreReview[]> {
    try {
      const url = `${this.baseUrl}/api/appstore/reviews/${encodeURIComponent(identifier)}?country=${country}&page=${page}&sort=${sort}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        return data.data;
      }
      
      return [];
    } catch (error) {
      console.error('获取应用评论失败:', error);
      return [];
    }
  }

  /** Fetch rating summary and histogram for an app. */
  async getAppRatings(identifier: string, country: string = 'us'): Promise<AppStoreRatings | null> {
    try {
      const url = `${this.baseUrl}/api/appstore/ratings/${encodeURIComponent(identifier)}?country=${country}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        return data.data;
      }
      
      return null;
    } catch (error) {
      console.error('获取应用评分失败:', error);
      return null;
    }
  }

  /** Fetch version history for an app. */
  async getAppVersionHistory(identifier: string): Promise<any[]> {
    try {
      const url = `${this.baseUrl}/api/appstore/version-history/${encodeURIComponent(identifier)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        return data.data;
      }
      
      return [];
    } catch (error) {
      console.error('获取应用版本历史失败:', error);
      return [];
    }
  }

  /** Fetch autocomplete suggestions for a search term. */
  async getSearchSuggestions(term: string): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/api/appstore/suggest?term=${encodeURIComponent(term)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        return data.data.map((suggestion: any) => suggestion.term);
      }
      
      return [];
    } catch (error) {
      console.error('获取搜索建议失败:', error);
      return [];
    }
  }

  /** Fetch similar apps for a given identifier. */
  async getSimilarApps(identifier: string, country: string = 'us'): Promise<AppStoreAppInfo[]> {
    try {
      const url = `${this.baseUrl}/api/appstore/similar/${encodeURIComponent(identifier)}?country=${country}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        return data.data;
      }
      
      return [];
    } catch (error) {
      console.error('获取相似应用失败:', error);
      return [];
    }
  }

  /** Fetch App Privacy nutrition label data. */
  async getAppPrivacy(identifier: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/api/appstore/privacy/${encodeURIComponent(identifier)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        return data.data;
      }
      
      return null;
    } catch (error) {
      console.error('获取应用隐私信息失败:', error);
      return null;
    }
  }

  /** Score search results and return the best match. */
  private findBestMatch(searchTerm: string, results: AppStoreAppInfo[]): AppStoreAppInfo {
    console.log(`🔍 开始智能匹配，搜索词: ${searchTerm}`);
    console.log(`📊 候选结果数量: ${results.length}`);
    
    const searchWords = searchTerm.toLowerCase().split(' ');
    console.log(`🔤 搜索词分解:`, searchWords);
    
    // Score each candidate
    const scoredResults = results.map((app, index) => {
      console.log(`📱 分析第 ${index + 1} 个结果:`, app);
      
      const appName = (app.title || app.trackName || '').toLowerCase();
      const bundleId = (app.bundleId || app.appId || '').toLowerCase();
      
      console.log(`  - 应用名称: "${appName}"`);
      console.log(`  - Bundle ID: "${bundleId}"`);
      
      let score = 0;
      
      // Exact title match
      if (appName === searchTerm) {
        score += 100;
        console.log(`  ✅ 完全匹配名称: +100分`);
      }
      
      // All search tokens present
      const containsAllWords = searchWords.every(word => appName.includes(word));
      if (containsAllWords) {
        score += 50;
        console.log(`  ✅ 包含所有搜索词: +50分`);
      }
      
      // Any search token present
      const containsSomeWords = searchWords.some(word => appName.includes(word));
      if (containsSomeWords) {
        score += 20;
        console.log(`  ✅ 包含部分搜索词: +20分`);
      }
      
      // Bundle ID substring match
      if (bundleId && bundleId.includes(searchTerm)) {
        score += 30;
        console.log(`  ✅ Bundle ID匹配: +30分`);
      }
      
      // Title length proximity bonus
      const lengthDiff = Math.abs(appName.length - searchTerm.length);
      score += Math.max(0, 10 - lengthDiff);
      console.log(`  📏 长度匹配: +${Math.max(0, 10 - lengthDiff)}分`);
      
      console.log(`  🎯 最终得分: ${score}分`);
      return { app, score };
    });
    
    // Sort by score descending
    scoredResults.sort((a, b) => b.score - a.score);
    console.log(`🏆 排序后的结果:`, scoredResults.map(r => ({ title: r.app.title || r.app.trackName, score: r.score })));
    
    const bestMatch = scoredResults[0].app;
    console.log(`🎉 最佳匹配: ${bestMatch.title || bestMatch.trackName} (得分: ${scoredResults[0].score})`);
    
    return bestMatch;
  }
  
  /**
   * Smart lookup: store ID, bundle ID, or name search (with strict ID validation).
   */
  async findApp(searchTerm: string, country: string = 'us', timeout: number = 5000, retryCount: number = 3): Promise<AppStoreAppInfo | null> {
    try {
      let app: AppStoreAppInfo | null = null;
      const normalizedTerm = searchTerm.trim();
      const isStoreIdInput = /^id?\d+$/i.test(normalizedTerm);
      const isBundleIdInput = normalizedTerm.includes('.');
      const shouldStrictExact = isStoreIdInput || isBundleIdInput;
      
      console.log(`🔍 开始智能搜索，搜索词: ${searchTerm}`);
      
      // 1. Numeric App Store ID
      if (isStoreIdInput) {
        console.log(`📱 检测到 App Store ID 格式，尝试精确查询...`);
        console.log(`🔍 正则匹配结果: ${isStoreIdInput}`);
        console.log(`🔍 搜索词: "${searchTerm}"`);
        try {
          console.log(`🚀 开始调用 findAppByStoreId...`);
          app = await this.findAppByStoreId(searchTerm, country, timeout, retryCount);
          console.log(`🔄 findAppByStoreId 调用完成，结果:`, app);
          if (app) {
            console.log(`✅ 通过 App Store ID 精确查询成功: ${app.title || app.trackName}`);
          } else {
            console.log(`❌ 通过 App Store ID 精确查询失败，返回 null`);
          }
        } catch (error) {
          console.error(`❌ 通过 App Store ID 精确查询出错:`, error);
          app = null;
        }
      }
      
      // 2. Bundle ID
      if (!app && isBundleIdInput) {
        console.log(`🔗 检测到 Bundle ID 格式，尝试精确查询...`);
        app = await this.findAppByBundleId(searchTerm, country, timeout, retryCount);
        if (app) {
          console.log(`✅ 通过 Bundle ID 精确查询成功: ${app.title || app.trackName}`);
        } else {
          console.log(`❌ 通过 Bundle ID 精确查询失败`);
        }
      }
      
      // 3. Name search fallback (non-ID inputs only)
      if (!app && !shouldStrictExact) {
        console.log(`🔍 精确查询失败，回退到名称搜索...`);
        app = await this.findAppByName(searchTerm, country, timeout, retryCount);
        if (app) {
          console.log(`✅ 通过名称搜索成功: ${app.title || app.trackName}`);
        } else {
          console.log(`❌ 名称搜索也失败`);
        }
      } else if (!app && shouldStrictExact) {
        console.log(`⛔ 精确 ID/Bundle 查询失败，不执行名称模糊回退`);
      }
      
      // 4. Reject fuzzy hits for strict ID/bundle inputs
      if (app && shouldStrictExact && !this.isExactMatch(normalizedTerm, app)) {
        console.warn(`⛔ 精确匹配校验失败，输入=${normalizedTerm}，返回 id=${app.id || app.trackId} bundle=${app.bundleId || app.appId}`);
        return null;
      }

      // 5. Enrich with ratings and a sample of reviews
      if (app) {
        try {
          console.log(`🔍 成功找到应用: ${app.title || app.trackName || 'Unknown'} (ID: ${app.id || app.trackId || 'Unknown'})`);
          
          const appId = app.id || app.trackId;
          if (appId) {
            const ratings = await this.getAppRatings(appId.toString(), country);
            if (ratings) {
              console.log(`✅ 获取评分信息成功: ${ratings.ratings} 个评分`);
              app.ratingHistogram = ratings.histogram;
            }
            
            const reviews = await this.getAppReviews(appId.toString(), country, 1, 'recent');
            if (reviews.length > 0) {
              console.log(`✅ 获取评论信息成功: ${reviews.length} 条评论`);
            }
          }
          
        } catch (error) {
          console.warn('❌ 获取额外信息失败:', error);
          // Non-fatal: return base app info
        }

        // 6. Debug dump
        console.log('🔍 应用信息:');
        console.log('  - 标题:', app.title || app.trackName || 'Unknown');
        console.log('  - 开发者:', app.developer || app.artistName || 'Unknown');
        console.log('  - 评分:', app.score || app.averageUserRating || 'Unknown');
        console.log('  - 评分数量:', app.reviews || app.userRatingCount || 'Unknown');
        console.log('  - 版本:', app.version || 'Unknown');
        console.log('  - 最低系统版本:', app.requiredOsVersion || app.minimumOsVersion || 'Unknown');
        console.log('  - 价格:', app.formattedPrice || (app.free ? 'Free' : `$${app.price || 0}`) || 'Unknown');
        console.log('  - 分类:', app.primaryGenre || app.primaryGenreName || 'Unknown');
        console.log('  - 支持设备:', app.supportedDevices || 'Unknown');
        console.log('  - 截图数量:', (app.screenshots || app.screenshotUrls)?.length || 0);
      }
      
      return app;
    } catch (error) {
      console.error('应用搜索失败:', error);
      throw error;
    }
  }

  /** Map raw app-store-scraper payload to AppStoreAppInfo. */
  private transformAppStoreData(rawData: any): AppStoreAppInfo {
    console.log(`🔄 开始转换 App Store 数据...`);
    console.log(`📊 原始数据字段:`, Object.keys(rawData));
    
    const transformed: AppStoreAppInfo = {
      // basic info
      id: rawData.id || 0,
      appId: rawData.appId || '',
      title: rawData.title || '',
      
      // developer info
      developer: rawData.developer || '',
      developerId: rawData.developerId || 0,
      developerUrl: rawData.developerUrl || '',
      developerWebsite: rawData.developerWebsite || '',
      
      // rating info
      score: rawData.score || 0,
      reviews: rawData.reviews || 0,
      currentVersionScore: rawData.currentVersionScore || 0,
      currentVersionReviews: rawData.currentVersionReviews || 0,
      
      // Rating histogram
      ratingHistogram: rawData.ratingHistogram || null,
      
      // version info
      version: rawData.version || '',
      requiredOsVersion: rawData.requiredOsVersion || '',
      released: rawData.released || '',
      updated: rawData.updated || '',
      releaseNotes: rawData.releaseNotes || '',
      
      // pricing info
      price: rawData.price || 0,
      currency: rawData.currency || 'USD',
      free: rawData.free || false,
      
      // category info
      primaryGenre: rawData.primaryGenre || '',
      primaryGenreId: rawData.primaryGenreId || 0,
      genres: rawData.genres || [],
      genreIds: rawData.genreIds || [],
      contentRating: rawData.contentRating || '',
      
      // Description & locale
      description: rawData.description || '',
      size: rawData.size || '',
      languages: rawData.languages || [],
      
      // media assets
      icon: rawData.icon || '',
      screenshots: rawData.screenshots || [],
      ipadScreenshots: rawData.ipadScreenshots || [],
      appletvScreenshots: rawData.appletvScreenshots || [],
      supportedDevices: rawData.supportedDevices || [],
      
      // links
      url: rawData.url || '',
      
      // Legacy iTunes aliases
      trackId: rawData.id || 0,
      trackName: rawData.title || '',
      artistName: rawData.developer || '',
      averageUserRating: rawData.score || 0,
      userRatingCount: rawData.reviews || 0,
      formattedPrice: rawData.free ? 'Free' : `$${rawData.price || 0}`,
      bundleId: rawData.appId || '',
      minimumOsVersion: rawData.requiredOsVersion || '',
      fileSizeBytes: rawData.size || '',
      currentVersionReleaseDate: rawData.updated || '',
      primaryGenreName: rawData.primaryGenre || '',
      screenshotUrls: rawData.screenshots || [],
      trackViewUrl: rawData.url || '',
      artworkUrl100: rawData.icon || '',
      artworkUrl512: rawData.icon || '',
      
      // Defaults for fields App Store does not expose
      downloadCount: 0,
      inAppPurchases: [],
      subscriptionPeriod: 'N/A',
      subscriptionGroup: 'N/A',
      sellerUrl: rawData.developerWebsite || '',
    };
    
    console.log(`✅ 数据转换完成`);
    console.log(`🔍 转换后的关键字段:`);
    console.log(`  - title: ${transformed.title}`);
    console.log(`  - developer: ${transformed.developer}`);
    console.log(`  - score: ${transformed.score}`);
    console.log(`  - reviews: ${transformed.reviews}`);
    console.log(`  - price: ${transformed.price}`);
    console.log(`  - primaryGenre: ${transformed.primaryGenre}`);
    console.log(`  - bundleId: ${transformed.bundleId}`);
    console.log(`  - version: ${transformed.version}`);
    console.log(`  - requiredOsVersion: ${transformed.requiredOsVersion}`);
    console.log(`  - size: ${transformed.size}`);
    console.log(`  - updated: ${transformed.updated}`);
    
    return transformed;
  }

  /** Search suggestions with resolved app metadata, ranked by score. */
  async getSearchSuggestionsWithApps(appName: string, country: string = 'us', maxResults: number = 5): Promise<SearchSuggestion[]> {
    try {
      const suggestions: SearchSuggestion[] = [];
      
      // Primary name search hit
      const searchResults = await this.findAppByName(appName, country);
      if (searchResults) {
        suggestions.push({
          app: searchResults,
          score: 100,
          matchType: 'exact'
        });
      }
      
      // Expand via autocomplete terms (deduped)
      const searchTerms = await this.getSearchSuggestionsFromAPI(appName);
      for (const term of searchTerms.slice(0, maxResults - 1)) {
        try {
          const app = await this.findAppByName(term, country);
          const appId = app?.id || app?.trackId;
          if (app && appId && !suggestions.find(s => (s.app.id || s.app.trackId) === appId)) {
            suggestions.push({
              app: app,
              score: 50,
              matchType: 'partial'
            });
          }
        } catch (error) {
          console.warn(`获取建议应用 ${term} 失败:`, error);
        }
      }
      
      // Cap and sort by score
      suggestions.sort((a, b) => b.score - a.score);
      return suggestions.slice(0, maxResults);
      
    } catch (error) {
      console.error('获取搜索建议失败:', error);
      return [];
    }
  }

  /** Raw suggest API — term strings only. */
  private async getSearchSuggestionsFromAPI(term: string): Promise<string[]> {
    try {
      const url = `${this.baseUrl}/api/appstore/suggest?term=${encodeURIComponent(term)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`App Store API 请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        return data.data.map((suggestion: any) => suggestion.term);
      }
      
      return [];
    } catch (error) {
      console.error('获取搜索建议失败:', error);
      return [];
    }
  }

  /** Cross-platform unified app lookup (auto-detect iOS/Android). */
  async unifiedAppSearch(identifier: string, platform: 'auto' | 'ios' | 'android' = 'auto', country: string = 'us', lang: string = 'en'): Promise<any> {
    try {
      const url = `${this.baseUrl}/api/unified/app/${encodeURIComponent(identifier)}?platform=${platform}&country=${country}&lang=${lang}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`统一API请求失败: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.data) {
        console.log(`✅ 统一查询成功，平台: ${data.platform}`);
        return data.data;
      }
      
      return null;
    } catch (error) {
      console.error('统一应用查询失败:', error);
      throw error;
    }
  }
}

// Singleton export
export const appStoreApiService = new AppStoreApiService();

export default appStoreApiService;
