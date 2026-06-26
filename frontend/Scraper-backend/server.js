const express = require('express');
const cors = require('cors');
const gplay = require('google-play-scraper').default;
const store = require('app-store-scraper');
const axios = require('axios');
const vm = require('vm');
require('dotenv').config();
const { parseGooglePlayIdentifier } = require('./googlePlayIdentifier');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 错误处理中间件
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
};

// 限流中间件 - 防止被 Google Play 封禁
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30个请求
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  }
});

app.use('/api/', limiter);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 1. 应用详情查询 - 通过包名
app.get('/api/app/:appId', async (req, res, next) => {
  try {
    const rawAppId = decodeURIComponent(req.params.appId || '');
    const { lang = 'en', country = 'us' } = req.query;
    const { timeoutMs, retryCount } = normalizeRetryOptions(req.query, {
      defaultTimeoutMs: 5000,
      defaultRetryCount: 2
    });
    const parsedGoogleId = parseGooglePlayIdentifier(rawAppId);
    const normalizedAppId = parsedGoogleId.parsed;

    if (!normalizedAppId) {
      return res.status(400).json({
        success: false,
        error: 'App ID is required and must be a valid package name or Play Store URL'
      });
    }

    console.log(`Fetching app details for: ${normalizedAppId}, lang: ${lang}, country: ${country}, source: ${parsedGoogleId.type}`);

    // 添加延迟和重试机制
    let appDetails = null;
    let lastError = null;
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`Attempt ${attempt} to fetch app details...`);
        
        // 添加随机延迟，避免被检测
        const delay = Math.random() * 1000 + 500; // 0.5-1.5秒随机延迟
        await new Promise(resolve => setTimeout(resolve, delay));
        
        appDetails = await lookupGooglePlayAppWithFallback(
          normalizedAppId,
          lang,
          country,
          timeoutMs
        );
        
        console.log('App details fetched successfully!');
        break;
        
      } catch (error) {
        lastError = error;
        console.error(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt < retryCount) {
          console.log('Retrying in 3 seconds...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

            if (appDetails) {
          res.json({
            success: true,
            data: appDetails
          });
        } else {
          res.status(500).json({
            success: false,
            error: `Failed to fetch app details: ${lastError.message}`,
            attempts: retryCount
          });
        }

  } catch (error) {
    console.error('App details error:', error);
    next(error);
  }
});

// 2. 应用搜索
app.get('/api/search', async (req, res, next) => {
  try {
    const { term, lang = 'en', country = 'us', num = 20, fullDetail = false } = req.query;
    const { timeoutMs, retryCount } = normalizeRetryOptions(req.query, {
      defaultTimeoutMs: 5000,
      defaultRetryCount: 2
    });

    if (!term) {
      return res.status(400).json({
        success: false,
        error: 'Search term is required'
      });
    }

    console.log(`Searching for: ${term}, lang: ${lang}, country: ${country}`);

    // 添加延迟和重试机制
    let searchResults = null;
    let lastError = null;
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`Attempt ${attempt} to search...`);
        
        // 添加随机延迟，避免被检测
        const delay = Math.random() * 1000 + 500; // 0.5-1.5秒随机延迟
        await new Promise(resolve => setTimeout(resolve, delay));
        
        searchResults = await withTimeout(
          gplay.search({
            term: term,
            lang: lang,
            country: country,
            num: parseInt(num),
            fullDetail: fullDetail === 'true'
          }),
          timeoutMs,
          `Google Play search timeout (${country})`
        );

        if (!Array.isArray(searchResults)) {
          throw new Error('Google Play search returned non-array response');
        }

        console.log(`Search succeeded with ${searchResults.length} result(s).`);
        break;
        
      } catch (error) {
        lastError = error;
        console.error(`Search attempt ${attempt} failed:`, error.message);
        
        if (attempt < retryCount) {
          console.log('Retrying in 3 seconds...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

            if (Array.isArray(searchResults)) {
          res.json({
            success: true,
            data: searchResults,
            total: searchResults.length
          });
        } else {
          // If term looks like a package name or Play URL, fallback to direct app lookup.
          const parsedGoogleId = parseGooglePlayIdentifier(String(term || ''));
          if (parsedGoogleId.parsed) {
            try {
              const appDetails = await lookupGooglePlayAppWithFallback(
                parsedGoogleId.parsed,
                lang,
                country,
                timeoutMs
              );
              return res.json({
                success: true,
                data: [appDetails],
                total: 1
              });
            } catch (fallbackError) {
              lastError = fallbackError;
            }
          }
          res.status(500).json({
            success: false,
            error: `Search failed: ${lastError.message}`,
            attempts: retryCount
          });
        }

  } catch (error) {
    console.error('Search error:', error);
    next(error);
  }
});

// 3. 开发者应用列表
app.get('/api/developer/:devId', async (req, res, next) => {
  try {
    const { devId } = req.params;
    const { lang = 'en', country = 'us', num = 20, fullDetail = false } = req.query;

    if (!devId) {
      return res.status(400).json({
        success: false,
        error: 'Developer ID is required'
      });
    }

    console.log(`Fetching developer apps for: ${devId}`);

    const devApps = await gplay.developer({
      devId: devId,
      lang: lang,
      country: country,
      num: parseInt(num),
      fullDetail: fullDetail === 'true'
    });

    res.json({
      success: true,
      data: devApps,
      total: devApps.length
    });

  } catch (error) {
    console.error('Developer apps error:', error);
    next(error);
  }
});

// 4. 应用评论
app.get('/api/app/:appId/reviews', async (req, res, next) => {
  try {
    const { appId } = req.params;
    const { lang = 'en', country = 'us', num = 20, sort = 'newest' } = req.query;

    if (!appId) {
      return res.status(400).json({
        success: false,
        error: 'App ID is required'
      });
    }

    console.log(`Fetching reviews for: ${appId}`);

    const reviews = await gplay.reviews({
      appId: appId,
      lang: lang,
      country: country,
      num: parseInt(num),
      sort: sort
    });

    res.json({
      success: true,
      data: reviews,
      total: reviews.length
    });

  } catch (error) {
    console.error('Reviews error:', error);
    next(error);
  }
});

// 5. 相似应用
app.get('/api/app/:appId/similar', async (req, res, next) => {
  try {
    const { appId } = req.params;
    const { lang = 'en', country = 'us', fullDetail = false } = req.query;

    if (!appId) {
      return res.status(400).json({
        success: false,
        error: 'App ID is required'
      });
    }

    console.log(`Fetching similar apps for: ${appId}`);

    const similarApps = await gplay.similar({
      appId: appId,
      lang: lang,
      country: country,
      fullDetail: fullDetail === 'true'
    });

    res.json({
      success: true,
      data: similarApps,
      total: similarApps.length
    });

  } catch (error) {
    console.error('Similar apps error:', error);
    next(error);
  }
});

// 6. 应用权限
app.get('/api/app/:appId/permissions', async (req, res, next) => {
  try {
    const { appId } = req.params;
    const { lang = 'en', country = 'us', short = false } = req.query;

    if (!appId) {
      return res.status(400).json({
        success: false,
        error: 'App ID is required'
      });
    }

    console.log(`Fetching permissions for: ${appId}`);

    const permissions = await gplay.permissions({
      appId: appId,
      lang: lang,
      country: country,
      short: short === 'true'
    });

    res.json({
      success: true,
      data: permissions,
      total: permissions.length
    });

  } catch (error) {
    console.error('Permissions error:', error);
    next(error);
  }
});

// 7. 数据安全信息
app.get('/api/app/:appId/datasafety', async (req, res, next) => {
  try {
    const { appId } = req.params;
    const { lang = 'en' } = req.query;

    if (!appId) {
      return res.status(400).json({
        success: false,
        error: 'App ID is required'
      });
    }

    console.log(`Fetching data safety for: ${appId}`);

    const dataSafety = await gplay.datasafety({
      appId: appId,
      lang: lang
    });

    res.json({
      success: true,
      data: dataSafety
    });

  } catch (error) {
    console.error('Data safety error:', error);
    next(error);
  }
});

// 8. 分类列表
app.get('/api/categories', async (req, res, next) => {
  try {
    console.log('Fetching categories');

    // 使用预定义的分类列表，因为 google-play-scraper 没有 categories() 方法
    const categories = [
      'GAME_ACTION',
      'GAME_ADVENTURE', 
      'GAME_ARCADE',
      'GAME_BOARD',
      'GAME_CARD',
      'GAME_CASINO',
      'GAME_CASUAL',
      'GAME_EDUCATIONAL',
      'GAME_MUSIC',
      'GAME_PUZZLE',
      'GAME_RACING',
      'GAME_ROLE_PLAYING',
      'GAME_SIMULATION',
      'GAME_SPORTS',
      'GAME_STRATEGY',
      'GAME_TRIVIA',
      'GAME_WORD',
      'ART_AND_DESIGN',
      'AUTO_AND_VEHICLES',
      'BEAUTY',
      'BOOKS_AND_REFERENCE',
      'BUSINESS',
      'COMICS',
      'COMMUNICATION',
      'DATING',
      'EDUCATION',
      'ENTERTAINMENT',
      'EVENTS',
      'FINANCE',
      'FOOD_AND_DRINK',
      'HEALTH_AND_FITNESS',
      'HOUSE_AND_HOME',
      'LIBRARIES_AND_DEMO',
      'LIFESTYLE',
      'MAPS_AND_NAVIGATION',
      'MEDICAL',
      'MUSIC_AND_AUDIO',
      'NEWS_AND_MAGAZINES',
      'PARENTING',
      'PERSONALIZATION',
      'PHOTOGRAPHY',
      'PRODUCTIVITY',
      'SHOPPING',
      'SOCIAL',
      'SPORTS',
      'TOOLS',
      'TRAVEL_AND_LOCAL',
      'VIDEO_PLAYERS',
      'WEATHER'
    ];

    res.json({
      success: true,
      data: categories,
      total: categories.length
    });

  } catch (error) {
    console.error('Categories error:', error);
    next(error);
  }
});

// 9. 分类应用列表
app.get('/api/category/:category', async (req, res, next) => {
  try {
    const { category } = req.params;
    const { lang = 'en', country = 'us', num = 20, fullDetail = false } = req.query;

    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Category is required'
      });
    }

    console.log(`Fetching apps for category: ${category}`);

    const categoryApps = await gplay.list({
      category: category,
      lang: lang,
      country: country,
      num: parseInt(num),
      fullDetail: fullDetail === 'true'
    });

    res.json({
      success: true,
      data: categoryApps,
      total: categoryApps.length
    });

  } catch (error) {
    console.error('Category apps error:', error);
    next(error);
  }
});

// 10. 搜索建议
app.get('/api/suggest', async (req, res, next) => {
  try {
    const { term, lang = 'en', country = 'us' } = req.query;

    if (!term) {
      return res.status(400).json({
        success: false,
        error: 'Search term is required'
      });
    }

    console.log(`Getting suggestions for: ${term}`);

    const suggestions = await gplay.suggest({
      term: term,
      lang: lang,
      country: country
    });

    res.json({
      success: true,
      data: suggestions,
      total: suggestions.length
    });

  } catch (error) {
    console.error('Suggestions error:', error);
    next(error);
  }
});

// 11. 热门应用
app.get('/api/top', async (req, res, next) => {
  try {
    const { lang = 'en', country = 'us', num = 20, fullDetail = false } = req.query;

    console.log('Fetching top apps');

    // 使用简单的分类，避免复杂的参数
    const topApps = await gplay.list({
      category: 'GAME_CASUAL',
      lang: lang,
      country: country,
      num: parseInt(num),
      fullDetail: fullDetail === 'true'
    });

    res.json({
      success: true,
      data: topApps,
      total: topApps.length
    });

  } catch (error) {
    console.error('Top apps error:', error);
    next(error);
  }
});

// 12. 新应用
app.get('/api/new', async (req, res, next) => {
  try {
    const { lang = 'en', country = 'us', num = 20, fullDetail = false } = req.query;

    console.log('Fetching new apps');

    const newApps = await gplay.list({
      category: 'NEW_FREE',
      lang: lang,
      country: country,
      num: parseInt(num),
      fullDetail: fullDetail === 'true'
    });

    res.json({
      success: true,
      data: newApps,
      total: newApps.length
    });

  } catch (error) {
    console.error('New apps error:', error);
    next(error);
  }
});

// 13. 趋势应用
app.get('/api/trending', async (req, res, next) => {
  try {
    const { lang = 'en', country = 'us', num = 20, fullDetail = false } = req.query;

    console.log('Fetching trending apps');

    const trendingApps = await gplay.list({
      category: 'TRENDING',
      lang: lang,
      country: country,
      num: parseInt(num),
      fullDetail: fullDetail === 'true'
    });

    res.json({
      success: true,
      data: trendingApps,
      total: trendingApps.length
    });

  } catch (error) {
    console.error('Trending apps error:', error);
    next(error);
  }
});

// 14. 批量应用查询 - 支持多个应用ID
app.post('/api/apps/batch', async (req, res, next) => {
  try {
    const { appIds, lang = 'en', country = 'us' } = req.body;

    if (!appIds || !Array.isArray(appIds) || appIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'App IDs array is required'
      });
    }

    if (appIds.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 app IDs allowed per request'
      });
    }

    console.log(`Batch fetching apps: ${appIds.join(', ')}`);

    const results = [];
    const errors = [];

    // 使用 Promise.allSettled 来并行处理，即使某些失败也能继续
    const promises = appIds.map(async (appId) => {
      try {
        const appDetails = await gplay.app({
          appId: appId,
          lang: lang,
          country: country
        });
        return { success: true, data: appDetails };
      } catch (error) {
        return { success: false, appId: appId, error: error.message };
      }
    });

    const settledResults = await Promise.allSettled(promises);

    settledResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          results.push(result.value.data);
        } else {
          errors.push(result.value);
        }
      } else {
        errors.push({ appId: appIds[index], error: 'Request failed' });
      }
    });

    res.json({
      success: true,
      data: results,
      errors: errors,
      total: results.length,
      failed: errors.length
    });

  } catch (error) {
    console.error('Batch apps error:', error);
    next(error);
  }
});

// 15. 应用统计信息
app.get('/api/app/:appId/stats', async (req, res, next) => {
  try {
    const { appId } = req.params;
    const { lang = 'en', country = 'us' } = req.query;

    if (!appId) {
      return res.status(400).json({
        success: false,
        error: 'App ID is required'
      });
    }

    console.log(`Fetching stats for: ${appId}`);

    // 获取应用详情和评论来生成统计信息
    const [appDetails, reviews] = await Promise.all([
      gplay.app({
        appId: appId,
        lang: lang,
        country: country
      }),
      gplay.reviews({
        appId: appId,
        lang: lang,
        country: country,
        num: 100
      })
    ]);

    // 计算评分分布
    const ratingDistribution = {};
    reviews.forEach(review => {
      const rating = Math.floor(review.score);
      ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
    });

    // 计算评论情感分析（简单版本）
    const positiveReviews = reviews.filter(r => r.score >= 4).length;
    const negativeReviews = reviews.filter(r => r.score <= 2).length;
    const neutralReviews = reviews.filter(r => r.score === 3).length;

    const stats = {
      appId: appId,
      basicInfo: {
        title: appDetails.title,
        developer: appDetails.developer,
        category: appDetails.genre,
        price: appDetails.price,
        size: appDetails.size,
        installs: appDetails.installs,
        currentVersion: appDetails.version,
        androidVersion: appDetails.androidVersion,
        contentRating: appDetails.contentRating
      },
      ratings: {
        averageRating: appDetails.score,
        totalRatings: appDetails.reviews,
        ratingDistribution: ratingDistribution,
        positivePercentage: (positiveReviews / reviews.length * 100).toFixed(1),
        negativePercentage: (negativeReviews / reviews.length * 100).toFixed(1),
        neutralPercentage: (neutralReviews / reviews.length * 100).toFixed(1)
      },
      reviews: {
        total: reviews.length,
        positive: positiveReviews,
        negative: negativeReviews,
        neutral: neutralReviews,
        recentReviews: reviews.slice(0, 5) // 最近5条评论
      },
      metadata: {
        lastUpdated: appDetails.updated,
        releaseDate: appDetails.released,
        privacyPolicy: appDetails.privacyPolicy,
        developerWebsite: appDetails.developerWebsite
      }
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Stats error:', error);
    next(error);
  }
});

// 16. 开发者信息查询
app.get('/api/developer/:devId/info', async (req, res, next) => {
  try {
    const { devId } = req.params;
    const { lang = 'en', country = 'us', num = 50 } = req.query;

    if (!devId) {
      return res.status(400).json({
        success: false,
        error: 'Developer ID is required'
      });
    }

    console.log(`Fetching developer info for: ${devId}`);

    const devApps = await gplay.developer({
      devId: devId,
      lang: lang,
      country: country,
      num: parseInt(num),
      fullDetail: false
    });

    // 计算开发者统计信息
    const totalApps = devApps.length;
    const totalInstalls = devApps.reduce((sum, app) => {
      const installs = parseInt(app.installs.replace(/[^0-9]/g, '')) || 0;
      return sum + installs;
    }, 0);

    const averageRating = devApps.reduce((sum, app) => sum + (app.score || 0), 0) / totalApps;
    const categories = [...new Set(devApps.map(app => app.genre))];
    const freeApps = devApps.filter(app => app.free).length;
    const paidApps = totalApps - freeApps;

    const developerInfo = {
      developerId: devId,
      totalApps: totalApps,
      totalInstalls: totalInstalls.toLocaleString(),
      averageRating: averageRating.toFixed(1),
      categories: categories,
      appDistribution: {
        free: freeApps,
        paid: paidApps,
        freePercentage: ((freeApps / totalApps) * 100).toFixed(1),
        paidPercentage: ((paidApps / totalApps) * 100).toFixed(1)
      },
      topApps: devApps
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5)
        .map(app => ({
          title: app.title,
          appId: app.appId,
          score: app.score,
          installs: app.installs,
          genre: app.genre
        })),
      allApps: devApps.map(app => ({
        title: app.title,
        appId: app.appId,
        score: app.score,
        installs: app.installs,
        genre: app.genre,
        free: app.free,
        price: app.price
      }))
    };

    res.json({
      success: true,
      data: developerInfo
    });

  } catch (error) {
    console.error('Developer info error:', error);
    next(error);
  }
});

// 17. 应用比较
app.post('/api/apps/compare', async (req, res, next) => {
  try {
    const { appIds, lang = 'en', country = 'us' } = req.body;

    if (!appIds || !Array.isArray(appIds) || appIds.length < 2 || appIds.length > 5) {
      return res.status(400).json({
        success: false,
        error: '2-5 app IDs are required for comparison'
      });
    }

    console.log(`Comparing apps: ${appIds.join(', ')}`);

    const appsData = await Promise.all(
      appIds.map(async (appId) => {
        try {
          return await gplay.app({
            appId: appId,
            lang: lang,
            country: country
          });
        } catch (error) {
          return { appId: appId, error: error.message };
        }
      })
    );

    // 过滤掉有错误的app
    const validApps = appsData.filter(app => !app.error);
    const failedApps = appsData.filter(app => app.error);

    if (validApps.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 valid apps are required for comparison',
        failedApps: failedApps
      });
    }

    // 生成比较数据
    const comparison = {
      summary: {
        totalApps: validApps.length,
        failedApps: failedApps.length,
        averageRating: (validApps.reduce((sum, app) => sum + (app.score || 0), 0) / validApps.length).toFixed(1),
        averageInstalls: validApps.reduce((sum, app) => {
          const installs = parseInt(app.installs.replace(/[^0-9]/g, '')) || 0;
          return sum + installs;
        }, 0) / validApps.length
      },
      detailedComparison: validApps.map(app => ({
        appId: app.appId,
        title: app.title,
        developer: app.developer,
        score: app.score,
        reviews: app.reviews,
        installs: app.installs,
        size: app.size,
        price: app.price,
        free: app.free,
        genre: app.genre,
        androidVersion: app.androidVersion,
        contentRating: app.contentRating,
        lastUpdated: app.updated,
        releaseDate: app.released
      })),
      failedApps: failedApps
    };

    res.json({
      success: true,
      data: comparison
    });

  } catch (error) {
    console.error('App comparison error:', error);
    next(error);
  }
});

// 18. 应用市场趋势分析
app.get('/api/trends', async (req, res, next) => {
  try {
    const { lang = 'en', country = 'us', category = 'GAME' } = req.query;

    console.log(`Fetching trends for category: ${category}`);

    // 获取不同分类的应用数据
    const categories = ['GAME', 'TOOLS', 'PRODUCTIVITY', 'SOCIAL', 'ENTERTAINMENT'];
    const trendsData = {};

    for (const cat of categories) {
      try {
        const apps = await gplay.list({
          category: cat,
          lang: lang,
          country: country,
          num: 20,
          fullDetail: false
        });

        trendsData[cat] = {
          totalApps: apps.length,
          averageRating: (apps.reduce((sum, app) => sum + (app.score || 0), 0) / apps.length).toFixed(1),
          topApp: apps[0] ? {
            title: apps[0].title,
            appId: apps[0].appId,
            score: apps[0].score,
            installs: apps[0].installs
          } : null,
          categoryTrend: apps.slice(0, 5).map(app => ({
            title: app.title,
            appId: app.appId,
            score: app.score,
            installs: app.installs
          }))
        };
      } catch (error) {
        trendsData[cat] = { error: error.message };
      }
    }

    res.json({
      success: true,
      data: trendsData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Trends error:', error);
    next(error);
  }
});

// ==================== App Store API Endpoints ====================

// 智能 ID 识别和转换函数
function parseAppStoreIdentifier(identifier) {
  console.log(`🔍 Start parsing identifier: "${identifier}"`);
  
  // 1. 清理标识符（移除空格、特殊字符等）
  const cleanIdentifier = identifier.trim().replace(/[^\w\d.-]/g, '');
  console.log(`🧹 Sanitized identifier: "${cleanIdentifier}"`);
  
  // 2. 识别各种格式
  const patterns = {
    // 纯数字 App Store ID (如: 1488296980)
    numericId: /^(\d+)$/,
    // 带前缀的数字 ID (如: id1488296980, app1488296980)
    prefixedId: /^(id|app|store)?(\d+)$/i,
    // Bundle ID 格式 (如: com.example.app)
    bundleId: /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/,
    // 带协议的 URL (如: https://apps.apple.com/app/id1488296980)
    appStoreUrl: /https?:\/\/apps\.apple\.com\/[a-z]+\/[a-z]+\/id(\d+)/i,
    // 短链接 (如: https://appsto.re/app/1488296980)
    shortUrl: /https?:\/\/appsto\.re\/[a-z]+\/(\d+)/i
  };
  
  let result = {
    type: 'unknown',
    value: cleanIdentifier,
    original: identifier,
    parsed: null
  };
  
  // 检查各种模式
  if (patterns.numericId.test(cleanIdentifier)) {
    const match = patterns.numericId.exec(cleanIdentifier);
    result = {
      type: 'numeric_id',
      value: match[1],
      original: identifier,
      parsed: parseInt(match[1])
    };
    console.log(`✅ Recognized as numeric App Store ID: ${result.parsed}`);
  } else if (patterns.prefixedId.test(cleanIdentifier)) {
    const match = patterns.prefixedId.exec(cleanIdentifier);
    result = {
      type: 'prefixed_id',
      value: match[2],
      original: identifier,
      parsed: parseInt(match[2])
    };
    console.log(`✅ Recognized as prefixed App Store ID: ${result.parsed}`);
  } else if (patterns.bundleId.test(cleanIdentifier)) {
    result = {
      type: 'bundle_id',
      value: cleanIdentifier,
      original: identifier,
      parsed: cleanIdentifier
    };
    console.log(`✅ Recognized as Bundle ID: ${cleanIdentifier}`);
  } else if (patterns.appStoreUrl.test(cleanIdentifier)) {
    const match = patterns.appStoreUrl.exec(cleanIdentifier);
    result = {
      type: 'app_store_url',
      value: match[1],
      original: identifier,
      parsed: parseInt(match[1])
    };
    console.log(`✅ Recognized as App Store URL, extracted ID: ${result.parsed}`);
  } else if (patterns.shortUrl.test(cleanIdentifier)) {
    const match = patterns.shortUrl.exec(cleanIdentifier);
    result = {
      type: 'short_url',
      value: match[1],
      original: identifier,
      parsed: parseInt(match[1])
    };
    console.log(`✅ Recognized as short URL, extracted ID: ${result.parsed}`);
  } else {
    console.log('⚠️ Unrecognized format, handling as generic identifier');
  }
  
  console.log('📊 Parse result:', result);
  return result;
}

function normalizeBundleId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStoreId(value) {
  return String(value || '').replace(/^id/i, '').trim();
}

function isExactAppStoreMatch(appDetails, parsedId) {
  if (!appDetails || !parsedId) return false;
  const returnedStoreId = normalizeStoreId(appDetails.id || appDetails.trackId || '');
  const returnedBundleId = normalizeBundleId(appDetails.bundleId || appDetails.appId || '');

  if (parsedId.type === 'numeric_id' || parsedId.type === 'prefixed_id' || parsedId.type === 'app_store_url' || parsedId.type === 'short_url') {
    const expectedStoreId = normalizeStoreId(parsedId.parsed || parsedId.value || '');
    return !!expectedStoreId && returnedStoreId === expectedStoreId;
  }

  if (parsedId.type === 'bundle_id') {
    const expectedBundleId = normalizeBundleId(parsedId.parsed || parsedId.value || '');
    return !!expectedBundleId && returnedBundleId === expectedBundleId;
  }

  return true;
}

function withTimeout(promise, timeoutMs, timeoutMessage = 'Request timeout') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    })
  ]);
}

function normalizeRetryOptions(query = {}, defaults = {}) {
  const {
    defaultTimeoutMs = 5000,
    defaultRetryCount = 2,
    minTimeoutMs = 1000,
    maxTimeoutMs = 20000,
    maxRetryCount = 5
  } = defaults;

  const timeoutRaw = Number(query.timeout ?? query.timeoutMs);
  const retryRaw = Number(query.retryCount);

  const timeoutMs = Number.isFinite(timeoutRaw)
    ? Math.max(minTimeoutMs, Math.min(timeoutRaw, maxTimeoutMs))
    : defaultTimeoutMs;
  const retryCount = Number.isFinite(retryRaw)
    ? Math.max(1, Math.min(retryRaw, maxRetryCount))
    : defaultRetryCount;

  return { timeoutMs, retryCount };
}

function extractErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.message && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  if (error.error && typeof error.error === 'string' && error.error.trim()) {
    return error.error;
  }
  if (error.statusCode || error.status) {
    const statusText = error.statusCode || error.status;
    const detail = error.response?.data || error.body || error.errorMessage || '';
    if (detail && typeof detail === 'string') {
      return `HTTP ${statusText}: ${detail}`;
    }
    return `HTTP ${statusText}`;
  }
  try {
    const raw = JSON.stringify(error);
    if (raw && raw !== '{}' && raw !== '[]') return raw;
  } catch (_) {
    // ignore stringify failure
  }
  return String(error);
}

function extractErrorStatus(error) {
  if (!error) return null;
  return (
    error?.response?.statusCode ||
    error?.response?.status ||
    error?.statusCode ||
    error?.status ||
    null
  );
}

function extractGooglePlayJsonLd(html = '') {
  if (!html || typeof html !== 'string') return null;
  const blocks = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/gi) || [];
  for (const block of blocks) {
    const payload = block
      .replace(/^<script type="application\/ld\+json">/i, '')
      .replace(/<\/script>$/i, '')
      .trim();
    if (!payload) continue;
    try {
      const parsed = JSON.parse(payload);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const appNode = candidates.find(
        item => item && (item['@type'] === 'SoftwareApplication' || item['@type'] === 'MobileApplication')
      );
      if (appNode) return appNode;
    } catch (_) {
      // Ignore broken JSON-LD blocks.
    }
  }
  return null;
}

function mapJsonLdToGooglePlayApp(jsonLd, appId, lang, country) {
  if (!jsonLd) return null;
  const ratingValue = Number(jsonLd?.aggregateRating?.ratingValue);
  const ratingCount = Number(jsonLd?.aggregateRating?.ratingCount);
  const priceValue = Number(jsonLd?.offers?.price);
  const normalizedPrice = Number.isFinite(priceValue) ? priceValue : 0;

  return {
    appId,
    title: jsonLd?.name || '',
    developer: jsonLd?.author?.name || '',
    icon: jsonLd?.image || '',
    score: Number.isFinite(ratingValue) ? ratingValue : 0,
    scoreText: Number.isFinite(ratingValue) ? String(ratingValue) : '',
    reviews: Number.isFinite(ratingCount) ? ratingCount : 0,
    free: normalizedPrice === 0,
    price: normalizedPrice,
    priceText: normalizedPrice === 0 ? 'Install' : String(normalizedPrice),
    currency: jsonLd?.offers?.priceCurrency || '',
    genre: jsonLd?.applicationCategory || '',
    description: jsonLd?.description || '',
    androidVersion: jsonLd?.operatingSystem || '',
    url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(country.toUpperCase())}`,
    source: 'google_play_html_fallback'
  };
}

function extractMatch(text = '', pattern) {
  const match = text.match(pattern);
  return match && match[1] ? String(match[1]).trim() : '';
}

function decodeHtmlEntities(input = '') {
  return String(input || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function htmlToText(input = '') {
  return decodeHtmlEntities(String(input || ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractGooglePlayAboutDescription(html = '') {
  const aboutSection = html.match(/<h2[^>]*>\s*About this app\s*<\/h2>[\s\S]{0,25000}?<div class="bARER"[^>]*>([\s\S]*?)<\/div>/i);
  if (aboutSection?.[1]) {
    const parsed = htmlToText(aboutSection[1]);
    if (parsed) return parsed;
  }

  const metaDescription = extractMatch(html, /<meta itemprop="description" content="([^"]+)"/i);
  return metaDescription || '';
}

function extractGooglePlayRecentChanges(html = '') {
  const whatsNew = html.match(/<h2[^>]*>\s*(?:What&#8217;s new|What&rsquo;s new|What’s new|What's new)\s*<\/h2>[\s\S]{0,18000}?<div class="bARER"[^>]*>([\s\S]*?)<\/div>/i);
  if (!whatsNew?.[1]) return '';
  return htmlToText(whatsNew[1]);
}

function extractGooglePlayScreenshots(html = '', iconUrl = '') {
  const allImageUrls = [...new Set(
    (html.match(/https:\/\/play-lh\.googleusercontent\.com\/[A-Za-z0-9_\-\.=%:+/]+/g) || [])
      .map(url => String(url || '').trim())
      .filter(Boolean)
  )];

  if (!allImageUrls.length) return [];

  const iconBase = String(iconUrl || '').split('=')[0];
  const screenshotCandidates = allImageUrls.filter(url => {
    if (!/=w\d+-h\d+/i.test(url)) return false;
    const base = url.split('=')[0];
    if (iconBase && base === iconBase) return false;
    return /(?:=w526-h296|=w1052-h592|=w240-h480|=w480-h960)/i.test(url);
  });

  const uniqueByBase = [];
  const seenBase = new Set();
  for (const url of screenshotCandidates) {
    const base = url.split('=')[0];
    if (seenBase.has(base)) continue;
    seenBase.add(base);
    uniqueByBase.push(url);
    if (uniqueByBase.length >= 12) break;
  }

  return uniqueByBase;
}

function mapGooglePlayReviewPayload(payload = {}) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map(item => ({
    id: item?.id || '',
    userName: item?.userName || '',
    userImage: item?.userImage || '',
    date: item?.date || '',
    score: item?.score || 0,
    scoreText: item?.scoreText || '',
    text: item?.text || '',
    replyDate: item?.replyDate || '',
    replyText: item?.replyText || '',
    thumbsUp: item?.thumbsUp || 0
  }));
}

function buildHistogramFromReviews(reviews = []) {
  const histogram = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (!Array.isArray(reviews)) return histogram;

  for (const row of reviews) {
    const rawScore = Number(row?.score);
    if (!Number.isFinite(rawScore)) continue;
    const bucket = Math.max(1, Math.min(5, Math.round(rawScore)));
    histogram[bucket] += 1;
  }

  return histogram;
}

function extractAfInitDataCallbacks(html = '') {
  const marker = 'AF_initDataCallback(';
  const out = [];
  let pos = 0;

  while (true) {
    const idx = html.indexOf(marker, pos);
    if (idx < 0) break;
    let i = idx + marker.length;
    while (i < html.length && /\s/.test(html[i])) i += 1;
    if (html[i] !== '{') {
      pos = idx + marker.length;
      continue;
    }

    let depth = 0;
    let inString = '';
    let escaped = false;
    let end = -1;
    for (let j = i; j < html.length; j += 1) {
      const ch = html[j];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === inString) {
          inString = '';
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        inString = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }

    if (end > 0) {
      const objText = html.slice(i, end + 1);
      try {
        const parsed = vm.runInNewContext(`(${objText})`);
        if (parsed?.key) {
          out.push(parsed);
        }
      } catch (_) {
        // Ignore unparseable callbacks.
      }
      pos = end + 1;
    } else {
      break;
    }
  }

  return out;
}

function collectStringNodes(node, path, out) {
  if (typeof node === 'string') {
    out.push({ path: [...path], value: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child, idx) => collectStringNodes(child, [...path, idx], out));
    return;
  }
  if (node && typeof node === 'object') {
    Object.entries(node).forEach(([k, v]) => collectStringNodes(v, [...path, k], out));
  }
}

function extractGooglePlayDsDetails(html = '') {
  const callbacks = extractAfInitDataCallbacks(html);
  const ds5 = callbacks.find(item => item?.key === 'ds:5');
  if (!ds5?.data) return {};

  const nodes = [];
  collectStringNodes(ds5.data, ['data'], nodes);
  if (!nodes.length) return {};

  const pickBySuffix = (suffix) =>
    nodes.find(item => item.path.join('.').endsWith(suffix))?.value || '';

  const normalizeRichText = (text) => htmlToText(text || '');
  const version = pickBySuffix('141.0.0.0');
  const minOs = pickBySuffix('141.1.1.0.0.1');
  const description = normalizeRichText(pickBySuffix('72.0.1'));
  const recentChanges = normalizeRichText(pickBySuffix('145.1.1'));

  return {
    version: version || '',
    androidVersionText: minOs || '',
    description: description || '',
    recentChanges: recentChanges || ''
  };
}

function mapGooglePlayHtmlToApp(html = '', appId, lang, country) {
  const dsDetails = extractGooglePlayDsDetails(html);
  const ogTitle = extractMatch(html, /<meta property="og:title" content="([^"]+)"/i);
  const title = ogTitle.replace(/\s*-\s*Apps on Google Play\s*$/i, '').trim();
  const developer =
    extractMatch(html, /"author"\s*:\s*\{[^\}]*"name"\s*:\s*"([^"]+)"/i) ||
    extractMatch(html, /itemprop="author"[^>]*>[\s\S]{0,500}?<span[^>]*>([^<]+)<\/span>/i);
  const category = extractMatch(html, /"applicationCategory"\s*:\s*"([^"]+)"/i);
  const image = extractMatch(html, /<meta property="og:image" content="([^"]+)"/i);
  const description = dsDetails.description || extractGooglePlayAboutDescription(html) || extractMatch(html, /<meta property="og:description" content="([^"]+)"/i);
  const recentChanges = dsDetails.recentChanges || extractGooglePlayRecentChanges(html);
  const updatedOn = extractMatch(html, /<div class="lXlx5">Updated on<\/div><div class="xg1aie">([^<]+)<\/div>/i);
  const installs = extractMatch(html, /<div class="ClM7O">([^<]+)<\/div><div class="g1rdde">Downloads<\/div>/i);
  const reviewsText = extractMatch(html, /<div class="g1rdde">([^<]+)\s+reviews<\/div>/i);
  const contentRating = extractMatch(html, /itemprop="contentRating"><span>([^<]+)<\/span>/i);
  const adSupported = /Contains ads/i.test(html);
  const offersIAP = /In-app purchases/i.test(html);
  const ratingValue = Number(extractMatch(html, /"ratingValue"\s*:\s*"([^"]+)"/i));
  const ratingCount = Number(extractMatch(html, /"ratingCount"\s*:\s*"([^"]+)"/i));

  if (!title) return null;

  return {
    appId,
    title,
    developer: developer || 'Unknown',
    icon: image || '',
    score: Number.isFinite(ratingValue) ? ratingValue : 0,
    scoreText: Number.isFinite(ratingValue) ? String(ratingValue) : '',
    reviews: Number.isFinite(ratingCount) ? ratingCount : 0,
    ratings: reviewsText || '',
    installs: installs || '',
    free: true,
    price: 0,
    priceText: 'Install',
    currency: '',
    genre: category || 'UNKNOWN',
    contentRating: contentRating || '',
    description: description || '',
    recentChanges: recentChanges || '',
    androidVersion: '',
    androidVersionText: dsDetails.androidVersionText || '',
    version: dsDetails.version || '',
    updated: updatedOn || '',
    adSupported,
    offersIAP,
    screenshots: extractGooglePlayScreenshots(html, image),
    url: `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=${encodeURIComponent(lang)}&gl=${encodeURIComponent(country.toUpperCase())}`,
    source: 'google_play_html_meta_fallback'
  };
}

async function enrichGooglePlayFallbackData(baseData, appId, lang, country, timeoutMs) {
  const [permissionsResult, reviewsResult, dataSafetyResult] = await Promise.allSettled([
    withTimeout(
      gplay.permissions({
        appId,
        lang,
        country
      }),
      timeoutMs,
      `Google Play permissions lookup timeout (${country})`
    ),
    withTimeout(
      gplay.reviews({
        appId,
        lang,
        country,
        num: 20
      }),
      timeoutMs,
      `Google Play reviews lookup timeout (${country})`
    ),
    withTimeout(
      gplay.datasafety({
        appId,
        lang
      }),
      timeoutMs,
      `Google Play datasafety lookup timeout (${country})`
    )
  ]);

  const enriched = { ...baseData };

  if (permissionsResult.status === 'fulfilled' && Array.isArray(permissionsResult.value)) {
    const permissionNames = permissionsResult.value
      .map(item => item?.permission || '')
      .filter(Boolean);
    if (permissionNames.length > 0) {
      enriched.permissions = permissionNames;
    }
  }

  if (reviewsResult.status === 'fulfilled') {
    const mappedReviews = mapGooglePlayReviewPayload(reviewsResult.value);
    if (mappedReviews.length > 0) {
      enriched.recentReviews = mappedReviews;
      // Use sampled reviews to provide 1-5 star distribution when gplay.app fails.
      enriched.histogram = buildHistogramFromReviews(mappedReviews);
    }
  }

  if (dataSafetyResult.status === 'fulfilled' && dataSafetyResult.value) {
    enriched.dataSafety = dataSafetyResult.value;
  }

  return enriched;
}

async function lookupGooglePlayByHtml(appId, lang = 'en', country = 'us', timeoutMs = 6000) {
  const response = await axios.get('https://play.google.com/store/apps/details', {
    params: {
      id: appId,
      hl: lang,
      gl: country.toUpperCase()
    },
    timeout: timeoutMs,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  const html = response?.data || '';
  const jsonLd = extractGooglePlayJsonLd(html);
  const mapped = mapJsonLdToGooglePlayApp(jsonLd, appId, lang, country) || mapGooglePlayHtmlToApp(html, appId, lang, country);
  if (!mapped || !mapped.title) {
    throw new Error('Google Play HTML fallback parse failed');
  }
  return enrichGooglePlayFallbackData(mapped, appId, lang, country, timeoutMs);
}

async function lookupGooglePlayAppWithFallback(appId, lang = 'en', country = 'us', timeoutMs = 6000) {
  try {
    return await withTimeout(
      gplay.app({
        appId,
        lang,
        country
      }),
      timeoutMs,
      `Google Play app lookup timeout (${country})`
    );
  } catch (primaryError) {
    const status = extractErrorStatus(primaryError);
    const normalizedMessage = extractErrorMessage(primaryError);
    // google-play-scraper occasionally breaks for specific app pages; fallback to direct HTML parsing.
    const shouldFallback =
      status === 403 ||
      status === 404 ||
      status === 429 ||
      /not found|reading 'length'|invalid/i.test(normalizedMessage);

    if (!shouldFallback) {
      throw primaryError;
    }
    return lookupGooglePlayByHtml(appId, lang, country, timeoutMs);
  }
}

async function lookupAppStoreViaItunes(parsedId, country = 'us', lang = 'en', timeoutMs = 6000) {
  const params = {
    country,
    lang,
    entity: 'software'
  };

  if (parsedId?.type === 'bundle_id') {
    params.bundleId = String(parsedId.parsed || parsedId.value || '').trim();
  } else {
    params.id = normalizeStoreId(parsedId?.parsed || parsedId?.value || '');
  }

  const response = await axios.get('https://itunes.apple.com/lookup', {
    params,
    timeout: timeoutMs,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json,text/plain,*/*'
    }
  });

  const result = response?.data?.results?.[0] || null;
  return result;
}

async function lookupIosAppWithFallback(parsedId, country, lang, timeoutMs) {
  try {
    return await withTimeout(
      store.app({
        id: parsedId.type === 'bundle_id' ? parsedId.parsed : parsedId.parsed,
        country,
        lang
      }),
      timeoutMs,
      `App Store lookup timeout in ${country}`
    );
  } catch (primaryError) {
    const status = extractErrorStatus(primaryError);
    // If primary lookup is blocked/rate-limited, fallback to iTunes lookup API.
    if (status === 403 || status === 429) {
      return await lookupAppStoreViaItunes(parsedId, country, lang, timeoutMs);
    }
    throw primaryError;
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = [];
  let currentIndex = 0;

  const runners = Array.from({ length: Math.max(1, concurrency) }).map(async () => {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      // eslint-disable-next-line no-await-in-loop
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

// 18.5 Survey 模式：按国家批量探测可用区域
app.post(
  ['/api/survey/availability', '/api/appstore/survey/availability', '/api/googleplay/survey/availability'],
  async (req, res, next) => {
  try {
    const surveyStartAt = Date.now();
    const {
      platform,
      appId,
      countries = []
    } = req.body || {};
    const SURVEY_LOOKUP_TIMEOUT_MS = 6000;
    const SURVEY_RETRY_COUNT = 1;

    if (!platform || !['ios', 'google'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'platform must be ios or google'
      });
    }

    if (!appId || typeof appId !== 'string' || !appId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'appId is required'
      });
    }

    if (!Array.isArray(countries) || countries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'countries must be a non-empty array'
      });
    }

    const sanitizedCountries = [...new Set(
      countries
        .map(code => String(code || '').trim().toLowerCase())
        .filter(code => /^[a-z]{2}$/.test(code))
    )];

    if (sanitizedCountries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'countries contains no valid country code'
      });
    }

    let normalizedAppId = String(appId).trim();

    let parsedIosId = null;
    if (platform === 'ios') {
      parsedIosId = parseAppStoreIdentifier(normalizedAppId);
      if (!['numeric_id', 'prefixed_id', 'app_store_url', 'short_url', 'bundle_id'].includes(parsedIosId.type)) {
        return res.status(400).json({
          success: false,
          error: 'Survey mode only supports exact App Store ID or Bundle ID'
        });
      }
    } else {
      // Google Play survey 只支持包名精确查询
      const parsedGoogleId = parseGooglePlayIdentifier(normalizedAppId);
      if (!parsedGoogleId.parsed) {
        return res.status(400).json({
          success: false,
          error: 'Survey mode for Google Play requires exact package name or Play Store URL'
        });
      }
      normalizedAppId = parsedGoogleId.parsed;
    }

    const availableCountries = [];
    let referenceApp = null;
    const lookupErrors = [];

    await runWithConcurrency(sanitizedCountries, 6, async (country) => {
      for (let attempt = 1; attempt <= SURVEY_RETRY_COUNT; attempt += 1) {
        try {
          let details = null;
          if (platform === 'ios') {
            details = await lookupIosAppWithFallback(parsedIosId, country, 'en', SURVEY_LOOKUP_TIMEOUT_MS);

            if (!isExactAppStoreMatch(details, parsedIosId)) {
              return null;
            }
          } else {
            details = await lookupGooglePlayAppWithFallback(
              normalizedAppId,
              'en',
              country,
              SURVEY_LOOKUP_TIMEOUT_MS
            );

            if (String(details?.appId || '').trim().toLowerCase() !== normalizedAppId.toLowerCase()) {
              return null;
            }
          }

          if (details) {
            availableCountries.push(country);
            if (!referenceApp) {
              referenceApp = details;
            }
          }
          return null;
        } catch (error) {
          if (attempt === SURVEY_RETRY_COUNT) {
            const normalizedMessage = extractErrorMessage(error);
            lookupErrors.push({
              country,
              error: normalizedMessage
            });
            return null;
          }
        }
      }
      return null;
    });

    const diagnostics = {
      requestedCountries: countries.length,
      scannedCountries: sanitizedCountries.length,
      matchedCountries: availableCountries.length,
      failedCountries: lookupErrors.length,
      elapsedMs: Date.now() - surveyStartAt,
      sampleErrors: lookupErrors.slice(0, 8)
    };

    if (!referenceApp || availableCountries.length === 0) {
      const allFailed = lookupErrors.length >= sanitizedCountries.length;
      const allNotFound = allFailed && lookupErrors.every(item => /404|not found/i.test(item.error || ''));

      if (allNotFound) {
        return res.status(404).json({
          success: false,
          error: 'App not found in provided countries',
          data: {
            app: null,
            availableCountries: [],
            diagnostics
          }
        });
      }

      if (allFailed) {
        return res.status(502).json({
          success: false,
          error: 'All country lookups failed; unable to determine app availability',
          data: {
            app: null,
            availableCountries: [],
            diagnostics
          }
        });
      }

      return res.status(404).json({
        success: false,
        error: 'App not found in provided countries',
        data: {
          app: null,
          availableCountries: [],
          diagnostics
        }
      });
    }

    return res.json({
      success: true,
      data: {
        app: referenceApp,
        availableCountries,
        diagnostics
      },
      platform
    });
  } catch (error) {
    console.error('Survey availability error:', error);
    return next(error);
  }
});

// 19. App Store 应用详情查询 - 通过 Bundle ID 或 App ID
app.get('/api/appstore/app/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const { country = 'us', lang = 'en' } = req.query;
    const { timeoutMs, retryCount } = normalizeRetryOptions(req.query, {
      defaultTimeoutMs: 5000,
      defaultRetryCount: 2
    });

    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'App identifier is required'
      });
    }

    console.log(`Fetching App Store app details for: ${identifier}, country: ${country}, lang: ${lang}`);
    
    // 使用智能 ID 解析函数
    const parsedId = parseAppStoreIdentifier(identifier);
    console.log('🔍 Parsed identifier:', parsedId);

    // 添加延迟和重试机制
    let appDetails = null;
    let lastError = null;
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt} to fetch App Store app details...`);
        
        // 添加随机延迟，避免被检测
        const delay = Math.random() * 1000 + 500; // 0.5-1.5秒随机延迟
        console.log(`⏱️ Waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // 根据解析结果选择查询策略
        if (parsedId.type === 'numeric_id' || parsedId.type === 'prefixed_id' || parsedId.type === 'app_store_url' || parsedId.type === 'short_url') {
          // ID 输入仅允许 ID 精确查询，不回退到 Bundle 模糊匹配
          console.log(`📱 Trying exact App Store ID lookup: ${parsedId.parsed}`);
          appDetails = await lookupIosAppWithFallback(parsedId, country, lang, timeoutMs);
          console.log('✅ App Store ID lookup succeeded!');
        } else if (parsedId.type === 'bundle_id') {
          // Bundle ID 格式，直接查询
          console.log(`🔗 Trying Bundle ID lookup: ${parsedId.parsed}`);
          appDetails = await lookupIosAppWithFallback(parsedId, country, lang, timeoutMs);
          console.log('✅ Bundle ID lookup succeeded!');
        } else {
          // 未知格式，尝试多种方式
          console.log('❓ Unknown format, trying multiple lookup strategies...');
          
          // 先尝试作为 App Store ID（如果是数字）
          if (/^\d+$/.test(parsedId.value)) {
            try {
              console.log(`📱 Trying App Store ID lookup: ${parsedId.value}`);
              appDetails = await withTimeout(
                store.app({
                  id: parseInt(parsedId.value),
                  country: country,
                  lang: lang
                }),
                timeoutMs,
                `App Store fallback ID lookup timeout (${country})`
              );
              console.log('✅ App Store ID lookup succeeded!');
            } catch (error) {
              console.log(`❌ App Store ID lookup failed: ${error.message}`);
            }
          }
          
          // 如果 App Store ID 查询失败，尝试作为 Bundle ID
          if (!appDetails) {
            try {
              console.log(`🔗 Trying Bundle ID lookup: ${parsedId.value}`);
              appDetails = await withTimeout(
                store.app({
                  id: parsedId.value,
                  country: country,
                  lang: lang
                }),
                timeoutMs,
                `App Store fallback bundle lookup timeout (${country})`
              );
              console.log('✅ Bundle ID lookup succeeded!');
            } catch (error) {
              console.log(`❌ Bundle ID lookup failed: ${error.message}`);
            }
          }
        }
        
        if (appDetails) {
          if (!isExactAppStoreMatch(appDetails, parsedId)) {
            const mismatchError = new Error(`Exact app mismatch: expected ${parsedId.value}, got id=${appDetails.id || appDetails.trackId}, bundleId=${appDetails.bundleId || appDetails.appId}`);
            console.warn(`⚠️ App Store exact-match validation failed: ${mismatchError.message}`);
            throw mismatchError;
          }

          console.log('🎉 App Store app details fetched successfully!');
          console.log('📊 App details:', appDetails);
          
          // 详细记录关键字段
          console.log('🔍 Key fields check:');
          console.log(`  - title: ${appDetails.title || 'undefined'}`);
          console.log(`  - trackName: ${appDetails.trackName || 'undefined'}`);
          console.log(`  - artistName: ${appDetails.artistName || 'undefined'}`);
          console.log(`  - averageUserRating: ${appDetails.averageUserRating || 'undefined'}`);
          console.log(`  - userRatingCount: ${appDetails.userRatingCount || 'undefined'}`);
          console.log(`  - price: ${appDetails.price || 'undefined'}`);
          console.log(`  - formattedPrice: ${appDetails.formattedPrice || 'undefined'}`);
          console.log(`  - primaryGenreName: ${appDetails.primaryGenreName || 'undefined'}`);
          console.log(`  - bundleId: ${appDetails.bundleId || 'undefined'}`);
          console.log(`  - version: ${appDetails.version || 'undefined'}`);
          console.log(`  - minimumOsVersion: ${appDetails.minimumOsVersion || 'undefined'}`);
          console.log(`  - fileSizeBytes: ${appDetails.fileSizeBytes || 'undefined'}`);
          console.log(`  - currentVersionReleaseDate: ${appDetails.currentVersionReleaseDate || 'undefined'}`);
          console.log(`  - description: ${appDetails.description ? appDetails.description.substring(0, 100) + '...' : 'undefined'}`);
          
          break;
        }
        
      } catch (error) {
        lastError = error;
        console.error(`❌ Attempt ${attempt} failed:`, extractErrorMessage(error));
        console.error('❌ Error stack:', error.stack);
        
        if (attempt < retryCount) {
          console.log('⏳ Retrying in 3 seconds...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    if (appDetails) {
      res.json({
        success: true,
        data: appDetails,
        platform: 'ios'
      });
    } else {
      res.status(500).json({
        success: false,
        error: `Failed to fetch App Store app details: ${extractErrorMessage(lastError)}`,
        attempts: retryCount,
        platform: 'ios'
      });
    }

  } catch (error) {
    console.error('App Store app details error:', error);
    next(error);
  }
});

// 20. App Store 应用搜索
app.get('/api/appstore/search', async (req, res, next) => {
  try {
    const { term, country = 'us', lang = 'en', num = 20 } = req.query;
    const { timeoutMs, retryCount } = normalizeRetryOptions(req.query, {
      defaultTimeoutMs: 5000,
      defaultRetryCount: 2
    });

    if (!term) {
      return res.status(400).json({
        success: false,
        error: 'Search term is required'
      });
    }

    console.log(`Searching App Store for: ${term}, country: ${country}, lang: ${lang}`);
    
    // 使用智能 ID 解析函数检查是否为 ID 格式
    const parsedId = parseAppStoreIdentifier(term);
    console.log('🔍 Parsed search term:', parsedId);
    
    // 如果识别为 ID 格式，直接查询应用详情而不是搜索
    if (parsedId.type === 'numeric_id' || parsedId.type === 'prefixed_id' || parsedId.type === 'app_store_url' || parsedId.type === 'short_url') {
      console.log('📱 ID format detected, performing direct app detail lookup...');
      
      let appDetails = null;
      let lastError = null;
      for (let attempt = 1; attempt <= retryCount; attempt += 1) {
        try {
          appDetails = await lookupIosAppWithFallback(parsedId, country, lang, timeoutMs);
          break;
        } catch (error) {
          lastError = error;
          if (attempt < retryCount) {
            await new Promise(resolve => setTimeout(resolve, 1200));
          }
        }
      }

      try {
        if (!appDetails) {
          throw lastError || new Error('Direct ID lookup failed');
        }

        if (!isExactAppStoreMatch(appDetails, parsedId)) {
          return res.status(404).json({
            success: false,
            error: `Exact app not found for App Store ID: ${parsedId.value}`,
            platform: 'ios',
            searchType: 'direct_id_lookup'
          });
        }
        
        console.log('✅ Direct ID lookup succeeded!');
        console.log('📊 App details returned by search endpoint:', appDetails);
        
        // 详细记录关键字段
        console.log('🔍 Search endpoint key fields check:');
        console.log(`  - title: ${appDetails.title || 'undefined'}`);
        console.log(`  - trackName: ${appDetails.trackName || 'undefined'}`);
        console.log(`  - artistName: ${appDetails.artistName || 'undefined'}`);
        console.log(`  - averageUserRating: ${appDetails.averageUserRating || 'undefined'}`);
        console.log(`  - userRatingCount: ${appDetails.userRatingCount || 'undefined'}`);
        console.log(`  - price: ${appDetails.price || 'undefined'}`);
        console.log(`  - formattedPrice: ${appDetails.formattedPrice || 'undefined'}`);
        console.log(`  - primaryGenreName: ${appDetails.primaryGenreName || 'undefined'}`);
        console.log(`  - bundleId: ${appDetails.bundleId || 'undefined'}`);
        console.log(`  - version: ${appDetails.version || 'undefined'}`);
        console.log(`  - minimumOsVersion: ${appDetails.minimumOsVersion || 'undefined'}`);
        console.log(`  - fileSizeBytes: ${appDetails.fileSizeBytes || 'undefined'}`);
        console.log(`  - currentVersionReleaseDate: ${appDetails.currentVersionReleaseDate || 'undefined'}`);
        console.log(`  - description: ${appDetails.description ? appDetails.description.substring(0, 100) + '...' : 'undefined'}`);
        
        // 返回单个应用结果，格式与搜索一致
        res.json({
          success: true,
          data: [appDetails], // 包装成数组以保持一致性
          platform: 'ios',
          total: 1,
          searchType: 'direct_id_lookup'
        });
        
        return;
      } catch (error) {
        console.log(`❌ Direct ID lookup failed: ${error.message}`);
        return res.status(404).json({
          success: false,
          error: `Exact app not found for App Store ID: ${parsedId.value}`,
          platform: 'ios',
          searchType: 'direct_id_lookup'
        });
      }
    }
    
    // 执行常规搜索
    console.log('🔍 Performing standard keyword search...');
    let searchResults = null;
    let searchLastError = null;
    for (let attempt = 1; attempt <= retryCount; attempt += 1) {
      try {
        searchResults = await withTimeout(
          store.search({
            term: term,
            country: country,
            lang: lang,
            num: parseInt(num)
          }),
          timeoutMs,
          `App Store search timeout (${country})`
        );
        break;
      } catch (error) {
        searchLastError = error;
        if (attempt < retryCount) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }
      }
    }

    if (!searchResults) {
      throw searchLastError || new Error('App Store search failed');
    }

    res.json({
      success: true,
      data: searchResults,
      platform: 'ios',
      total: searchResults.length,
      searchType: 'keyword_search'
    });

  } catch (error) {
    console.error('App Store search error:', error);
    next(error);
  }
});

// 21. App Store 开发者应用列表
app.get('/api/appstore/developer/:devId', async (req, res, next) => {
  try {
    const { devId } = req.params;
    const { country = 'us', lang = 'en' } = req.query;

    if (!devId) {
      return res.status(400).json({
        success: false,
        error: 'Developer ID is required'
      });
    }

    console.log(`Fetching App Store developer apps for: ${devId}, country: ${country}`);

    const developerApps = await store.developer({
      devId: devId,
      country: country,
      lang: lang
    });

    res.json({
      success: true,
      data: developerApps,
      platform: 'ios',
      total: developerApps.length
    });

  } catch (error) {
    console.error('App Store developer error:', error);
    next(error);
  }
});

// 22. App Store 应用评论
app.get('/api/appstore/reviews/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const { country = 'us', page = 1, sort = 'recent' } = req.query;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'App identifier is required'
      });
    }

    console.log(`Fetching App Store reviews for: ${identifier}, country: ${country}, page: ${page}`);
    
    // 使用智能 ID 解析函数
    const parsedId = parseAppStoreIdentifier(identifier);
    console.log('🔍 Parsed identifier for reviews lookup:', parsedId);
    
    // 根据解析结果选择查询方式
    let reviews;
    if (parsedId.type === 'numeric_id' || parsedId.type === 'prefixed_id' || parsedId.type === 'app_store_url' || parsedId.type === 'short_url') {
      // 使用解析后的数字 ID
      console.log(`📱 Looking up reviews with parsed App Store ID: ${parsedId.parsed}`);
      reviews = await store.reviews({
        id: parsedId.parsed,
        country: country,
        page: parseInt(page),
        sort: sort === 'helpful' ? store.sort.HELPFUL : store.sort.RECENT
      });
    } else {
      // 使用原始标识符
      console.log(`🔗 Looking up reviews with original identifier: ${identifier}`);
      reviews = await store.reviews({
        id: identifier,
        country: country,
        page: parseInt(page),
        sort: sort === 'helpful' ? store.sort.HELPFUL : store.sort.RECENT
      });
    }

    res.json({
      success: true,
      data: reviews,
      platform: 'ios',
      total: reviews.length
    });

  } catch (error) {
    console.error('App Store reviews error:', error);
    next(error);
  }
});

// 23. App Store 应用评分
app.get('/api/appstore/ratings/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const { country = 'us' } = req.query;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'App identifier is required'
      });
    }

    console.log(`Fetching App Store ratings for: ${identifier}, country: ${country}`);
    
    // 使用智能 ID 解析函数
    const parsedId = parseAppStoreIdentifier(identifier);
    console.log('🔍 Parsed identifier for ratings lookup:', parsedId);
    
    // 根据解析结果选择查询方式
    let ratings;
    if (parsedId.type === 'numeric_id' || parsedId.type === 'prefixed_id' || parsedId.type === 'app_store_url' || parsedId.type === 'short_url') {
      // 使用解析后的数字 ID
      console.log(`📱 Looking up ratings with parsed App Store ID: ${parsedId.parsed}`);
      ratings = await store.ratings({
        id: parsedId.parsed,
        country: country
      });
    } else {
      // 使用原始标识符
      console.log(`🔗 Looking up ratings with original identifier: ${identifier}`);
      ratings = await store.ratings({
        id: identifier,
        country: country
      });
    }

    res.json({
      success: true,
      data: ratings,
      platform: 'ios'
    });

  } catch (error) {
    console.error('App Store ratings error:', error);
    next(error);
  }
});

// 24. App Store 应用版本历史
app.get('/api/appstore/version-history/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'App identifier is required'
      });
    }

    console.log(`Fetching App Store version history for: ${identifier}`);
    
    // 使用智能 ID 解析函数
    const parsedId = parseAppStoreIdentifier(identifier);
    console.log('🔍 Parsed identifier for version history lookup:', parsedId);
    
    // 根据解析结果选择查询方式
    let versionHistory;
    if (parsedId.type === 'numeric_id' || parsedId.type === 'prefixed_id' || parsedId.type === 'app_store_url' || parsedId.type === 'short_url') {
      // 使用解析后的数字 ID
      console.log(`📱 Looking up version history with parsed App Store ID: ${parsedId.parsed}`);
      versionHistory = await store.versionHistory({
        id: parsedId.parsed
      });
    } else {
      // 使用原始标识符
      console.log(`🔗 Looking up version history with original identifier: ${identifier}`);
      versionHistory = await store.versionHistory({
        id: identifier
      });
    }

    res.json({
      success: true,
      data: versionHistory,
      platform: 'ios'
    });

  } catch (error) {
    console.error('App Store version history error:', error);
    next(error);
  }
});

// 25. App Store 应用建议
app.get('/api/appstore/suggest', async (req, res, next) => {
  try {
    const { term } = req.query;

    if (!term) {
      return res.status(400).json({
        success: false,
        error: 'Search term is required'
      });
    }

    console.log(`Getting App Store suggestions for: ${term}`);

    const suggestions = await store.suggest({
      term: term
    });

    res.json({
      success: true,
      data: suggestions,
      platform: 'ios'
    });

  } catch (error) {
    console.error('App Store suggestions error:', error);
    next(error);
  }
});

// 26. App Store 相似应用
app.get('/api/appstore/similar/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const { country = 'us' } = req.query;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'App identifier is required'
      });
    }

    console.log(`Fetching App Store similar apps for: ${identifier}, country: ${country}`);
    
    // 使用智能 ID 解析函数
    const parsedId = parseAppStoreIdentifier(identifier);
    console.log('🔍 Parsed identifier for similar apps lookup:', parsedId);
    
    // 根据解析结果选择查询方式
    let similarApps;
    if (parsedId.type === 'numeric_id' || parsedId.type === 'prefixed_id' || parsedId.type === 'app_store_url' || parsedId.type === 'short_url') {
      // 使用解析后的数字 ID
      console.log(`📱 Looking up similar apps with parsed App Store ID: ${parsedId.parsed}`);
      similarApps = await store.similar({
        id: parsedId.parsed,
        country: country
      });
    } else {
      // 使用原始标识符
      console.log(`🔗 Looking up similar apps with original identifier: ${identifier}`);
      similarApps = await store.similar({
        id: identifier,
        country: country
      });
    }

    res.json({
      success: true,
      data: similarApps,
      platform: 'ios'
    });

  } catch (error) {
    console.error('App Store similar apps error:', error);
    next(error);
  }
});

// 27. App Store 应用隐私信息
app.get('/api/appstore/privacy/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'App identifier is required'
      });
    }

    console.log(`Fetching App Store privacy info for: ${identifier}`);
    
    // 使用智能 ID 解析函数
    const parsedId = parseAppStoreIdentifier(identifier);
    console.log('🔍 Parsed identifier for privacy lookup:', parsedId);
    
    // 根据解析结果选择查询方式
    let privacyInfo;
    if (parsedId.type === 'numeric_id' || parsedId.type === 'prefixed_id' || parsedId.type === 'app_store_url' || parsedId.type === 'short_url') {
      // 使用解析后的数字 ID
      console.log(`📱 Looking up privacy info with parsed App Store ID: ${parsedId.parsed}`);
      privacyInfo = await store.privacy({
        id: parsedId.parsed
      });
    } else {
      // 使用原始标识符
      console.log(`🔗 Looking up privacy info with original identifier: ${identifier}`);
      privacyInfo = await store.privacy({
        id: identifier
      });
    }

    res.json({
      success: true,
      data: privacyInfo,
      platform: 'ios'
    });

  } catch (error) {
    console.error('App Store privacy error:', error);
    next(error);
  }
});

// 28. 统一应用查询 - 支持跨平台
app.get('/api/unified/app/:identifier', async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const { platform = 'auto', country = 'us', lang = 'en' } = req.query;

    if (!identifier) {
      return res.status(400).json({
        success: false,
        error: 'App identifier is required'
      });
    }

    console.log(`Unified app search for: ${identifier}, platform: ${platform}, country: ${country}`);

    let result = null;
    let detectedPlatform = null;

    // 自动检测平台或使用指定平台
    if (platform === 'auto' || platform === 'ios') {
      try {
        result = await store.app({
          id: identifier,
          country: country,
          lang: lang
        });
        detectedPlatform = 'ios';
      } catch (error) {
        console.log(`App Store search failed for ${identifier}:`, error.message);
      }
    }

    if (!result && (platform === 'auto' || platform === 'android')) {
      try {
        result = await gplay.app({
          appId: identifier,
          lang: lang,
          country: country
        });
        detectedPlatform = 'android';
      } catch (error) {
        console.log(`Google Play search failed for ${identifier}:`, error.message);
      }
    }

    if (result) {
      res.json({
        success: true,
        data: result,
        platform: detectedPlatform,
        searchMethod: 'unified'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'App not found on any platform',
        searchedPlatforms: platform === 'auto' ? ['ios', 'android'] : [platform]
      });
    }

  } catch (error) {
    console.error('Unified app search error:', error);
    next(error);
  }
});

// ==================== End App Store API Endpoints ====================

// 404 处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// 错误处理中间件
app.use(errorHandler);

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Unified Scraper Backend Server running on port ${PORT}`);
  console.log(`📱 Health check: http://localhost:${PORT}/health`);
  console.log(`🍎 App Store APIs: http://localhost:${PORT}/api/appstore/`);
  console.log(`🤖 Google Play APIs: http://localhost:${PORT}/api/`);
  console.log(`🔗 Unified APIs: http://localhost:${PORT}/api/unified/`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
