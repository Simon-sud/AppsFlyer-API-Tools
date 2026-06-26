-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    role ENUM('Super Admin', 'Pro User', 'Authenticated User') DEFAULT 'Authenticated User',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login DATETIME,
    avatar TEXT,
    gochat_openai_api_key TEXT DEFAULT NULL COMMENT 'Gochat OpenAI API Token',
    gochat_deepseek_api_key TEXT DEFAULT NULL COMMENT 'Gochat DeepSeek API Token',
    
    -- 双因素认证字段
    two_factor_enabled BOOLEAN DEFAULT FALSE COMMENT '是否启用双因素认证',
    two_factor_secret VARCHAR(32) DEFAULT NULL COMMENT 'TOTP密钥',
    two_factor_setup_at DATETIME DEFAULT NULL COMMENT '2FA设置时间',
    two_factor_last_used DATETIME DEFAULT NULL COMMENT '2FA最后使用时间',
    temp_auth_identifier VARCHAR(255) DEFAULT NULL COMMENT '临时认证标识符（用于2FA验证）',
    temp_auth_expires DATETIME DEFAULT NULL COMMENT '临时认证标识符过期时间',
    
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_created_at (created_at),
    INDEX idx_two_factor_enabled (two_factor_enabled),
    INDEX idx_two_factor_secret (two_factor_secret)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Teams表 - 存储团队/组织信息
CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID主键',
    name VARCHAR(255) NOT NULL UNIQUE COMMENT '团队名称',
    team_type ENUM('Authenticated Team', 'None Team') DEFAULT 'None Team' COMMENT '团队类型',
    description TEXT COMMENT '团队描述',
    logo LONGTEXT DEFAULT NULL COMMENT '团队Logo，存储base64编码的图像数据',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    -- 索引
    INDEX idx_name (name),
    INDEX idx_team_type (team_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='团队表';

-- 用户团队关联表 - 多对多关系，一个用户可以属于多个团队
CREATE TABLE IF NOT EXISTS user_teams (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID主键',
    user_id VARCHAR(50) NOT NULL COMMENT '用户ID',
    team_id VARCHAR(36) NOT NULL COMMENT '团队ID',
    is_primary BOOLEAN DEFAULT FALSE COMMENT '是否为主团队（用户的主要团队）',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    
    -- 索引
    INDEX idx_user_id (user_id),
    INDEX idx_team_id (team_id),
    INDEX idx_is_primary (is_primary),
    INDEX idx_user_team (user_id, team_id),
    
    -- 唯一约束：一个用户在一个团队中只能有一条记录
    UNIQUE KEY unique_user_team (user_id, team_id),
    
    -- 外键约束
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户团队关联表';

-- 创建账户配置表
CREATE TABLE IF NOT EXISTS account_configs (
    id VARCHAR(36) PRIMARY KEY,
    account_name VARCHAR(255) NOT NULL,
    account_type ENUM('PID','PRT') NOT NULL,
    api_token TEXT NOT NULL,
    user_ids JSON DEFAULT NULL COMMENT '关联的用户ID数组，NULL表示所有用户可见',
    validate TEXT DEFAULT NULL COMMENT '账户有效性验证结果(JSON字符串)',
    account_event_types TEXT NOT NULL DEFAULT '{}' COMMENT 'Push API GET .../event-types/{attributing-entity} 返回 JSON（Verify 时写入）',
    account_message_fields TEXT NOT NULL DEFAULT '{}' COMMENT 'Push API GET .../fields/{platform} 返回 JSON（Verify 时写入，多平台合并）',
    sort_order INT DEFAULT 0 COMMENT '排序字段',
    custom_icon LONGTEXT DEFAULT NULL COMMENT '自定义图标，存储base64编码的图像数据',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_account_type (account_type),
    INDEX idx_account_name (account_name),
    INDEX idx_created_at (created_at),
    INDEX idx_user_ids ((CAST(user_ids AS CHAR(100)))),
    INDEX idx_sort_order (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建查询执行表
CREATE TABLE IF NOT EXISTS query_executions (
    id VARCHAR(36) NOT NULL,
    run_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    query_params JSON NOT NULL,
    status ENUM('running','completed','failed') NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY run_id (run_id),
    INDEX idx_run_id (run_id),
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建查询日志表
CREATE TABLE IF NOT EXISTS query_logs (
    id VARCHAR(100) NOT NULL,
    query_result_id VARCHAR(100) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    account_type VARCHAR(10) NOT NULL,
    account_id VARCHAR(100) NOT NULL,
    app_id VARCHAR(100) NOT NULL,
    app_name VARCHAR(255) DEFAULT NULL,
    event_filter VARCHAR(255) DEFAULT NULL COMMENT '事件过滤条件',
    data_type VARCHAR(50) NOT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL,
    message TEXT,
    api_response JSON DEFAULT NULL,
    error_details JSON DEFAULT NULL,
    row_count INT DEFAULT NULL,
    afid_deduplication_count INT DEFAULT NULL COMMENT 'AFID去重数量',
    download_url VARCHAR(500) DEFAULT NULL COMMENT '下载URL',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_user_id (user_id),
    INDEX idx_query_result_id (query_result_id),
    INDEX idx_account (account_type, account_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建查询结果表
CREATE TABLE IF NOT EXISTS query_results (
    id VARCHAR(36) NOT NULL,
    run_id VARCHAR(20) NOT NULL,
    data JSON NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_run_id (run_id),
    CONSTRAINT query_results_ibfk_1 FOREIGN KEY (run_id) REFERENCES query_executions (run_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;





-- 创建下载记录表
CREATE TABLE IF NOT EXISTS download_records (
    id VARCHAR(36) NOT NULL,
    run_id VARCHAR(20) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_size BIGINT NOT NULL,
    status ENUM('pending','completed','failed') NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_run_id (run_id),
    INDEX idx_status (status),
    CONSTRAINT download_records_ibfk_1 FOREIGN KEY (run_id) REFERENCES query_executions (run_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建执行日志表
CREATE TABLE IF NOT EXISTS execution_logs (
    id VARCHAR(36) NOT NULL,
    run_id VARCHAR(20) NOT NULL,
    log_type ENUM('info','error','warning') NOT NULL,
    log_content TEXT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_run_id (run_id),
    INDEX idx_log_type (log_type),
    CONSTRAINT execution_logs_ibfk_1 FOREIGN KEY (run_id) REFERENCES query_executions (run_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建账户表
CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_id VARCHAR(100) NOT NULL,
    api_token VARCHAR(255) DEFAULT NULL,
    app_id VARCHAR(100) DEFAULT NULL,
    app_name VARCHAR(255) DEFAULT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_account_type (account_type),
    INDEX idx_account_name (account_name),
    INDEX idx_account_id (account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Apps Finder专用App信息表
CREATE TABLE IF NOT EXISTS apps_finder (
    app_id VARCHAR(128) NOT NULL,
    country VARCHAR(2) NOT NULL COMMENT '国家二位代码',
    os VARCHAR(64) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    developer VARCHAR(255) NOT NULL,
    developer_url VARCHAR(512) DEFAULT NULL COMMENT '开发者官网链接',
    category VARCHAR(128) NOT NULL,
    description TEXT,
    url VARCHAR(512),
    -- 新增字段
               icon_url VARCHAR(512) DEFAULT NULL COMMENT '应用图标链接',
           rating DECIMAL(3,1) DEFAULT NULL COMMENT '应用评分',
           rating_count INT DEFAULT NULL COMMENT '评分数量',
    keywords TEXT DEFAULT NULL COMMENT '关键词',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    -- 复合主键
    PRIMARY KEY (app_id, country),
    -- 索引
    INDEX idx_rating (rating),
    INDEX idx_rating_count (rating_count),
    INDEX idx_os (os),
    INDEX idx_category (category),
    INDEX idx_developer (developer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Apps Finder应用信息存储表';

-- ========================================
-- Dashboard数据表 - 用于存储AppsFlyer数据
-- ========================================

-- Dashboard_Install-Postbacks表 - 存储Install Postbacks数据
CREATE TABLE IF NOT EXISTS Dashboard_Install_Postbacks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    -- 基础字段
    attributed_touch_type VARCHAR(100) DEFAULT NULL COMMENT '归因触摸类型',
    attributed_touch_time DATETIME DEFAULT NULL COMMENT '归因触摸时间',
    install_time DATETIME DEFAULT NULL COMMENT '安装时间',
    event_time DATETIME DEFAULT NULL COMMENT '事件时间',
    event_name VARCHAR(255) DEFAULT NULL COMMENT '事件名称',
    event_value DECIMAL(20,6) DEFAULT NULL COMMENT '事件价值',
    event_revenue DECIMAL(20,6) DEFAULT NULL COMMENT '事件收入',
    event_revenue_currency VARCHAR(10) DEFAULT NULL COMMENT '事件收入货币',
    event_revenue_usd DECIMAL(20,6) DEFAULT NULL COMMENT '事件收入美元',
    event_source VARCHAR(255) DEFAULT NULL COMMENT '事件来源',
    is_receipt_validated TINYINT(1) DEFAULT NULL COMMENT '收据是否验证',
    
    -- 合作伙伴和媒体信息
    partner VARCHAR(255) DEFAULT NULL COMMENT '合作伙伴',
    media_source VARCHAR(255) DEFAULT NULL COMMENT '媒体来源',
    channel VARCHAR(255) DEFAULT NULL COMMENT '渠道',
    keywords VARCHAR(500) DEFAULT NULL COMMENT '关键词',
    campaign VARCHAR(255) DEFAULT NULL COMMENT '广告系列',
    campaign_id VARCHAR(255) DEFAULT NULL COMMENT '广告系列ID',
    adset VARCHAR(255) DEFAULT NULL COMMENT '广告组',
    adset_id VARCHAR(255) DEFAULT NULL COMMENT '广告组ID',
    ad VARCHAR(255) DEFAULT NULL COMMENT '广告',
    ad_id VARCHAR(255) DEFAULT NULL COMMENT '广告ID',
    ad_type VARCHAR(100) DEFAULT NULL COMMENT '广告类型',
    site_id VARCHAR(255) DEFAULT NULL COMMENT '站点ID',
    
    -- 地理位置信息
    region VARCHAR(255) DEFAULT NULL COMMENT '地区',
    country_code VARCHAR(10) DEFAULT NULL COMMENT '国家代码',
    state VARCHAR(255) DEFAULT NULL COMMENT '州/省',
    city VARCHAR(255) DEFAULT NULL COMMENT '城市',
    postal_code VARCHAR(20) DEFAULT NULL COMMENT '邮政编码',
    dma VARCHAR(255) DEFAULT NULL COMMENT '指定市场区域',
    
    -- 设备和网络信息
    ip VARCHAR(45) DEFAULT NULL COMMENT 'IP地址',
    wifi TINYINT(1) DEFAULT NULL COMMENT '是否WiFi',
    operator VARCHAR(255) DEFAULT NULL COMMENT '运营商',
    carrier VARCHAR(255) DEFAULT NULL COMMENT '网络运营商',
    language VARCHAR(10) DEFAULT NULL COMMENT '语言',
    
    -- 设备标识符
    appsflyer_id VARCHAR(255) DEFAULT NULL COMMENT 'AppsFlyer ID',
    advertising_id VARCHAR(255) DEFAULT NULL COMMENT '广告ID',
    idfa VARCHAR(255) DEFAULT NULL COMMENT 'IDFA',
    android_id VARCHAR(255) DEFAULT NULL COMMENT 'Android ID',
    customer_user_id VARCHAR(255) DEFAULT NULL COMMENT '客户用户ID',
    imei VARCHAR(255) DEFAULT NULL COMMENT 'IMEI',
    idfv VARCHAR(255) DEFAULT NULL COMMENT 'IDFV',
    
    -- 设备和应用信息
    platform VARCHAR(50) DEFAULT NULL COMMENT '平台',
    device_type VARCHAR(100) DEFAULT NULL COMMENT '设备类型',
    os_version VARCHAR(50) DEFAULT NULL COMMENT '操作系统版本',
    app_version VARCHAR(50) DEFAULT NULL COMMENT '应用版本',
    sdk_version VARCHAR(50) DEFAULT NULL COMMENT 'SDK版本',
    app_id VARCHAR(255) DEFAULT NULL COMMENT '应用ID',
    app_name VARCHAR(255) DEFAULT NULL COMMENT '应用名称',
    bundle_id VARCHAR(255) DEFAULT NULL COMMENT '包ID',
    
    -- 归因和重定向信息
    is_retargeting TINYINT(1) DEFAULT NULL COMMENT '是否重定向',
    retargeting_conversion_type VARCHAR(100) DEFAULT NULL COMMENT '重定向转化类型',
    attribution_lookback VARCHAR(100) DEFAULT NULL COMMENT '归因回看期',
    reengagement_window VARCHAR(100) DEFAULT NULL COMMENT '重新参与窗口',
    is_primary_attribution TINYINT(1) DEFAULT NULL COMMENT '是否主要归因',
    
    -- 网络和URL信息
    user_agent TEXT DEFAULT NULL COMMENT '用户代理',
    http_referrer TEXT DEFAULT NULL COMMENT 'HTTP引用',
    original_url TEXT DEFAULT NULL COMMENT '原始URL',
    postback_url TEXT DEFAULT NULL COMMENT '回传URL',
    postback_method VARCHAR(10) DEFAULT NULL COMMENT '回传方法',
    postback_http_response_code INT DEFAULT NULL COMMENT '回传HTTP响应代码',
    postback_error_message TEXT DEFAULT NULL COMMENT '回传错误消息',
    
    -- 系统字段
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    batch_id VARCHAR(100) DEFAULT NULL COMMENT '批次ID，用于标识数据导入批次',
    task_id VARCHAR(36) NOT NULL COMMENT 'AutoPipe任务ID，关联tasks表',
    account VARCHAR(255) NOT NULL COMMENT '账户配置名称，如starpower2j_int',
    source_file VARCHAR(255) DEFAULT NULL COMMENT '源文件名',
    
    -- 索引
    INDEX idx_app_id (app_id),
    INDEX idx_install_time (install_time),
    INDEX idx_event_time (event_time),
    INDEX idx_attributed_touch_time (attributed_touch_time),
    INDEX idx_media_source (media_source),
    INDEX idx_campaign (campaign),
    INDEX idx_country_code (country_code),
    INDEX idx_platform (platform),
    INDEX idx_appsflyer_id (appsflyer_id),
    INDEX idx_advertising_id (advertising_id),
    INDEX idx_batch_id (batch_id),
    INDEX idx_task_id (task_id),
    INDEX idx_account (account),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    
    -- 复合索引
    INDEX idx_app_install_time (app_id, install_time),
    INDEX idx_app_event_time (app_id, event_time),
    INDEX idx_media_campaign (media_source, campaign),
    INDEX idx_country_platform (country_code, platform),
    INDEX idx_app_task (app_id, task_id),
    INDEX idx_account_task (account, task_id)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Install Postbacks数据表';

-- Dashboard_In-App-Event-Postbacks表 - 存储In-App Event Postbacks数据
CREATE TABLE IF NOT EXISTS Dashboard_In_App_Event_Postbacks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    -- 基础字段
    attributed_touch_type VARCHAR(100) DEFAULT NULL COMMENT '归因触摸类型',
    attributed_touch_time DATETIME DEFAULT NULL COMMENT '归因触摸时间',
    install_time DATETIME DEFAULT NULL COMMENT '安装时间',
    event_time DATETIME DEFAULT NULL COMMENT '事件时间',
    event_name VARCHAR(255) DEFAULT NULL COMMENT '事件名称',
    event_value DECIMAL(20,6) DEFAULT NULL COMMENT '事件价值',
    event_revenue DECIMAL(20,6) DEFAULT NULL COMMENT '事件收入',
    event_revenue_currency VARCHAR(10) DEFAULT NULL COMMENT '事件收入货币',
    event_revenue_usd DECIMAL(20,6) DEFAULT NULL COMMENT '事件收入美元',
    event_source VARCHAR(255) DEFAULT NULL COMMENT '事件来源',
    is_receipt_validated TINYINT(1) DEFAULT NULL COMMENT '收据是否验证',
    
    -- 合作伙伴和媒体信息
    partner VARCHAR(255) DEFAULT NULL COMMENT '合作伙伴',
    media_source VARCHAR(255) DEFAULT NULL COMMENT '媒体来源',
    channel VARCHAR(255) DEFAULT NULL COMMENT '渠道',
    keywords VARCHAR(500) DEFAULT NULL COMMENT '关键词',
    campaign VARCHAR(255) DEFAULT NULL COMMENT '广告系列',
    campaign_id VARCHAR(255) DEFAULT NULL COMMENT '广告系列ID',
    adset VARCHAR(255) DEFAULT NULL COMMENT '广告组',
    adset_id VARCHAR(255) DEFAULT NULL COMMENT '广告组ID',
    ad VARCHAR(255) DEFAULT NULL COMMENT '广告',
    ad_id VARCHAR(255) DEFAULT NULL COMMENT '广告ID',
    ad_type VARCHAR(100) DEFAULT NULL COMMENT '广告类型',
    site_id VARCHAR(255) DEFAULT NULL COMMENT '站点ID',
    sub_site_id VARCHAR(255) DEFAULT NULL COMMENT '子站点ID',
    
    -- 地理位置信息
    region VARCHAR(255) DEFAULT NULL COMMENT '地区',
    country_code VARCHAR(10) DEFAULT NULL COMMENT '国家代码',
    state VARCHAR(255) DEFAULT NULL COMMENT '州/省',
    city VARCHAR(255) DEFAULT NULL COMMENT '城市',
    postal_code VARCHAR(20) DEFAULT NULL COMMENT '邮政编码',
    dma VARCHAR(255) DEFAULT NULL COMMENT '指定市场区域',
    
    -- 设备和网络信息
    ip VARCHAR(45) DEFAULT NULL COMMENT 'IP地址',
    wifi TINYINT(1) DEFAULT NULL COMMENT '是否WiFi',
    operator VARCHAR(255) DEFAULT NULL COMMENT '运营商',
    carrier VARCHAR(255) DEFAULT NULL COMMENT '网络运营商',
    language VARCHAR(10) DEFAULT NULL COMMENT '语言',
    
    -- 设备标识符
    appsflyer_id VARCHAR(255) DEFAULT NULL COMMENT 'AppsFlyer ID',
    advertising_id VARCHAR(255) DEFAULT NULL COMMENT '广告ID',
    idfa VARCHAR(255) DEFAULT NULL COMMENT 'IDFA',
    android_id VARCHAR(255) DEFAULT NULL COMMENT 'Android ID',
    customer_user_id VARCHAR(255) DEFAULT NULL COMMENT '客户用户ID',
    imei VARCHAR(255) DEFAULT NULL COMMENT 'IMEI',
    idfv VARCHAR(255) DEFAULT NULL COMMENT 'IDFV',
    
    -- 设备和应用信息
    platform VARCHAR(50) DEFAULT NULL COMMENT '平台',
    device_type VARCHAR(100) DEFAULT NULL COMMENT '设备类型',
    os_version VARCHAR(50) DEFAULT NULL COMMENT '操作系统版本',
    app_version VARCHAR(50) DEFAULT NULL COMMENT '应用版本',
    sdk_version VARCHAR(50) DEFAULT NULL COMMENT 'SDK版本',
    app_id VARCHAR(255) DEFAULT NULL COMMENT '应用ID',
    app_name VARCHAR(255) DEFAULT NULL COMMENT '应用名称',
    bundle_id VARCHAR(255) DEFAULT NULL COMMENT '包ID',
    
    -- 归因和重定向信息
    is_retargeting TINYINT(1) DEFAULT NULL COMMENT '是否重定向',
    retargeting_conversion_type VARCHAR(100) DEFAULT NULL COMMENT '重定向转化类型',
    attribution_lookback VARCHAR(100) DEFAULT NULL COMMENT '归因回看期',
    reengagement_window VARCHAR(100) DEFAULT NULL COMMENT '重新参与窗口',
    is_primary_attribution TINYINT(1) DEFAULT NULL COMMENT '是否主要归因',
    
    -- 网络和URL信息
    user_agent TEXT DEFAULT NULL COMMENT '用户代理',
    http_referrer TEXT DEFAULT NULL COMMENT 'HTTP引用',
    original_url TEXT DEFAULT NULL COMMENT '原始URL',
    postback_url TEXT DEFAULT NULL COMMENT '回传URL',
    postback_method VARCHAR(10) DEFAULT NULL COMMENT '回传方法',
    postback_http_response_code INT DEFAULT NULL COMMENT '回传HTTP响应代码',
    postback_error_message TEXT DEFAULT NULL COMMENT '回传错误消息',
    
    -- 系统字段
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    batch_id VARCHAR(100) DEFAULT NULL COMMENT '批次ID，用于标识数据导入批次',
    task_id VARCHAR(36) NOT NULL COMMENT 'AutoPipe任务ID，关联tasks表',
    account VARCHAR(255) NOT NULL COMMENT '账户配置名称，如starpower2j_int',
    source_file VARCHAR(255) DEFAULT NULL COMMENT '源文件名',
    
    -- 索引
    INDEX idx_app_id (app_id),
    INDEX idx_install_time (install_time),
    INDEX idx_event_time (event_time),
    INDEX idx_attributed_touch_time (attributed_touch_time),
    INDEX idx_media_source (media_source),
    INDEX idx_campaign (campaign),
    INDEX idx_country_code (country_code),
    INDEX idx_platform (platform),
    INDEX idx_appsflyer_id (appsflyer_id),
    INDEX idx_advertising_id (advertising_id),
    INDEX idx_batch_id (batch_id),
    INDEX idx_task_id (task_id),
    INDEX idx_account (account),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    
    -- 复合索引
    INDEX idx_app_install_time (app_id, install_time),
    INDEX idx_app_event_time (app_id, event_time),
    INDEX idx_media_campaign (media_source, campaign),
    INDEX idx_country_platform (country_code, platform),
    INDEX idx_app_task (app_id, task_id),
    INDEX idx_account_task (account, task_id)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='In-App Event Postbacks数据表';

-- Dashboard_Retargeting-Install-Postbacks表 - 存储Retargeting Install Postbacks数据
CREATE TABLE IF NOT EXISTS Dashboard_Retargeting_Install_Postbacks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    -- 基础字段
    attributed_touch_type VARCHAR(100) DEFAULT NULL COMMENT '归因触摸类型',
    attributed_touch_time DATETIME DEFAULT NULL COMMENT '归因触摸时间',
    install_time DATETIME DEFAULT NULL COMMENT '安装时间',
    event_time DATETIME DEFAULT NULL COMMENT '事件时间',
    event_name VARCHAR(255) DEFAULT NULL COMMENT '事件名称',
    event_value DECIMAL(20,6) DEFAULT NULL COMMENT '事件价值',
    event_revenue DECIMAL(20,6) DEFAULT NULL COMMENT '事件收入',
    event_revenue_currency VARCHAR(10) DEFAULT NULL COMMENT '事件收入货币',
    event_revenue_usd DECIMAL(20,6) DEFAULT NULL COMMENT '事件收入美元',
    event_source VARCHAR(255) DEFAULT NULL COMMENT '事件来源',
    is_receipt_validated TINYINT(1) DEFAULT NULL COMMENT '收据是否验证',
    
    -- 合作伙伴和媒体信息
    partner VARCHAR(255) DEFAULT NULL COMMENT '合作伙伴',
    media_source VARCHAR(255) DEFAULT NULL COMMENT '媒体来源',
    channel VARCHAR(255) DEFAULT NULL COMMENT '渠道',
    keywords VARCHAR(500) DEFAULT NULL COMMENT '关键词',
    campaign VARCHAR(255) DEFAULT NULL COMMENT '广告系列',
    campaign_id VARCHAR(255) DEFAULT NULL COMMENT '广告系列ID',
    adset VARCHAR(255) DEFAULT NULL COMMENT '广告组',
    adset_id VARCHAR(255) DEFAULT NULL COMMENT '广告组ID',
    ad VARCHAR(255) DEFAULT NULL COMMENT '广告',
    ad_id VARCHAR(255) DEFAULT NULL COMMENT '广告ID',
    ad_type VARCHAR(100) DEFAULT NULL COMMENT '广告类型',
    site_id VARCHAR(255) DEFAULT NULL COMMENT '站点ID',
    sub_site_id VARCHAR(255) DEFAULT NULL COMMENT '子站点ID',
    
    -- 地理位置信息
    region VARCHAR(255) DEFAULT NULL COMMENT '地区',
    country_code VARCHAR(10) DEFAULT NULL COMMENT '国家代码',
    state VARCHAR(255) DEFAULT NULL COMMENT '州/省',
    city VARCHAR(255) DEFAULT NULL COMMENT '城市',
    postal_code VARCHAR(20) DEFAULT NULL COMMENT '邮政编码',
    dma VARCHAR(255) DEFAULT NULL COMMENT '指定市场区域',
    
    -- 设备和网络信息
    ip VARCHAR(45) DEFAULT NULL COMMENT 'IP地址',
    wifi TINYINT(1) DEFAULT NULL COMMENT '是否WiFi',
    operator VARCHAR(255) DEFAULT NULL COMMENT '运营商',
    carrier VARCHAR(255) DEFAULT NULL COMMENT '网络运营商',
    language VARCHAR(10) DEFAULT NULL COMMENT '语言',
    
    -- 设备标识符
    appsflyer_id VARCHAR(255) DEFAULT NULL COMMENT 'AppsFlyer ID',
    advertising_id VARCHAR(255) DEFAULT NULL COMMENT '广告ID',
    idfa VARCHAR(255) DEFAULT NULL COMMENT 'IDFA',
    android_id VARCHAR(255) DEFAULT NULL COMMENT 'Android ID',
    customer_user_id VARCHAR(255) DEFAULT NULL COMMENT '客户用户ID',
    imei VARCHAR(255) DEFAULT NULL COMMENT 'IMEI',
    idfv VARCHAR(255) DEFAULT NULL COMMENT 'IDFV',
    
    -- 设备和应用信息
    platform VARCHAR(50) DEFAULT NULL COMMENT '平台',
    device_type VARCHAR(100) DEFAULT NULL COMMENT '设备类型',
    os_version VARCHAR(50) DEFAULT NULL COMMENT '操作系统版本',
    app_version VARCHAR(50) DEFAULT NULL COMMENT '应用版本',
    sdk_version VARCHAR(50) DEFAULT NULL COMMENT 'SDK版本',
    app_id VARCHAR(255) DEFAULT NULL COMMENT '应用ID',
    app_name VARCHAR(255) DEFAULT NULL COMMENT '应用名称',
    bundle_id VARCHAR(255) DEFAULT NULL COMMENT '包ID',
    
    -- 归因和重定向信息
    is_retargeting TINYINT(1) DEFAULT NULL COMMENT '是否重定向',
    retargeting_conversion_type VARCHAR(100) DEFAULT NULL COMMENT '重定向转化类型',
    attribution_lookback VARCHAR(100) DEFAULT NULL COMMENT '归因回看期',
    reengagement_window VARCHAR(100) DEFAULT NULL COMMENT '重新参与窗口',
    is_primary_attribution TINYINT(1) DEFAULT NULL COMMENT '是否主要归因',
    
    -- 网络和URL信息
    user_agent TEXT DEFAULT NULL COMMENT '用户代理',
    http_referrer TEXT DEFAULT NULL COMMENT 'HTTP引用',
    original_url TEXT DEFAULT NULL COMMENT '原始URL',
    postback_url TEXT DEFAULT NULL COMMENT '回传URL',
    postback_method VARCHAR(10) DEFAULT NULL COMMENT '回传方法',
    postback_http_response_code INT DEFAULT NULL COMMENT '回传HTTP响应代码',
    postback_error_message TEXT DEFAULT NULL COMMENT '回传错误消息',
    
    -- 系统字段
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    batch_id VARCHAR(100) DEFAULT NULL COMMENT '批次ID，用于标识数据导入批次',
    task_id VARCHAR(36) NOT NULL COMMENT 'AutoPipe任务ID，关联tasks表',
    account VARCHAR(255) NOT NULL COMMENT '账户配置名称，如starpower2j_int',
    source_file VARCHAR(255) DEFAULT NULL COMMENT '源文件名',
    
    -- 索引
    INDEX idx_app_id (app_id),
    INDEX idx_install_time (install_time),
    INDEX idx_event_time (event_time),
    INDEX idx_attributed_touch_time (attributed_touch_time),
    INDEX idx_media_source (media_source),
    INDEX idx_campaign (campaign),
    INDEX idx_country_code (country_code),
    INDEX idx_platform (platform),
    INDEX idx_appsflyer_id (appsflyer_id),
    INDEX idx_advertising_id (advertising_id),
    INDEX idx_batch_id (batch_id),
    INDEX idx_task_id (task_id),
    INDEX idx_account (account),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    
    -- 复合索引
    INDEX idx_app_install_time (app_id, install_time),
    INDEX idx_app_event_time (app_id, event_time),
    INDEX idx_media_campaign (media_source, campaign),
    INDEX idx_country_platform (country_code, platform),
    INDEX idx_app_task (app_id, task_id),
    INDEX idx_account_task (account, task_id)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Retargeting Install Postbacks数据表';

-- Dashboard_Retargeting-In-App-Event-Postbacks表 - 存储Retargeting In-App Event Postbacks数据
CREATE TABLE IF NOT EXISTS Dashboard_Retargeting_In_App_Event_Postbacks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    -- 基础字段
    attributed_touch_type VARCHAR(100) DEFAULT NULL COMMENT '归因触摸类型',
    attributed_touch_time DATETIME DEFAULT NULL COMMENT '归因触摸时间',
    install_time DATETIME DEFAULT NULL COMMENT '安装时间',
    event_time DATETIME DEFAULT NULL COMMENT '事件时间',
    event_name VARCHAR(255) DEFAULT NULL COMMENT '事件名称',
    event_value DECIMAL(20,6) DEFAULT NULL COMMENT '事件价值',
    event_revenue DECIMAL(20,6) DEFAULT NULL COMMENT '事件收入',
    event_revenue_currency VARCHAR(10) DEFAULT NULL COMMENT '事件收入货币',
    event_revenue_usd DECIMAL(20,6) DEFAULT NULL COMMENT '事件收入美元',
    event_source VARCHAR(255) DEFAULT NULL COMMENT '事件来源',
    is_receipt_validated TINYINT(1) DEFAULT NULL COMMENT '收据是否验证',
    
    -- 合作伙伴和媒体信息
    partner VARCHAR(255) DEFAULT NULL COMMENT '合作伙伴',
    media_source VARCHAR(255) DEFAULT NULL COMMENT '媒体来源',
    channel VARCHAR(255) DEFAULT NULL COMMENT '渠道',
    keywords VARCHAR(500) DEFAULT NULL COMMENT '关键词',
    campaign VARCHAR(255) DEFAULT NULL COMMENT '广告系列',
    campaign_id VARCHAR(255) DEFAULT NULL COMMENT '广告系列ID',
    adset VARCHAR(255) DEFAULT NULL COMMENT '广告组',
    adset_id VARCHAR(255) DEFAULT NULL COMMENT '广告组ID',
    ad VARCHAR(255) DEFAULT NULL COMMENT '广告',
    ad_id VARCHAR(255) DEFAULT NULL COMMENT '广告ID',
    ad_type VARCHAR(100) DEFAULT NULL COMMENT '广告类型',
    site_id VARCHAR(255) DEFAULT NULL COMMENT '站点ID',
    sub_site_id VARCHAR(255) DEFAULT NULL COMMENT '子站点ID',
    
    -- 地理位置信息
    region VARCHAR(255) DEFAULT NULL COMMENT '地区',
    country_code VARCHAR(10) DEFAULT NULL COMMENT '国家代码',
    state VARCHAR(255) DEFAULT NULL COMMENT '州/省',
    city VARCHAR(255) DEFAULT NULL COMMENT '城市',
    postal_code VARCHAR(20) DEFAULT NULL COMMENT '邮政编码',
    dma VARCHAR(255) DEFAULT NULL COMMENT '指定市场区域',
    
    -- 设备和网络信息
    ip VARCHAR(45) DEFAULT NULL COMMENT 'IP地址',
    wifi TINYINT(1) DEFAULT NULL COMMENT '是否WiFi',
    operator VARCHAR(255) DEFAULT NULL COMMENT '运营商',
    carrier VARCHAR(255) DEFAULT NULL COMMENT '网络运营商',
    language VARCHAR(10) DEFAULT NULL COMMENT '语言',
    
    -- 设备标识符
    appsflyer_id VARCHAR(255) DEFAULT NULL COMMENT 'AppsFlyer ID',
    advertising_id VARCHAR(255) DEFAULT NULL COMMENT '广告ID',
    idfa VARCHAR(255) DEFAULT NULL COMMENT 'IDFA',
    android_id VARCHAR(255) DEFAULT NULL COMMENT 'Android ID',
    customer_user_id VARCHAR(255) DEFAULT NULL COMMENT '客户用户ID',
    imei VARCHAR(255) DEFAULT NULL COMMENT 'IMEI',
    idfv VARCHAR(255) DEFAULT NULL COMMENT 'IDFV',
    
    -- 设备和应用信息
    platform VARCHAR(50) DEFAULT NULL COMMENT '平台',
    device_type VARCHAR(100) DEFAULT NULL COMMENT '设备类型',
    os_version VARCHAR(50) DEFAULT NULL COMMENT '操作系统版本',
    app_version VARCHAR(50) DEFAULT NULL COMMENT '应用版本',
    sdk_version VARCHAR(50) DEFAULT NULL COMMENT 'SDK版本',
    app_id VARCHAR(255) DEFAULT NULL COMMENT '应用ID',
    app_name VARCHAR(255) DEFAULT NULL COMMENT '应用名称',
    bundle_id VARCHAR(255) DEFAULT NULL COMMENT '包ID',
    
    -- 归因和重定向信息
    is_retargeting TINYINT(1) DEFAULT NULL COMMENT '是否重定向',
    retargeting_conversion_type VARCHAR(100) DEFAULT NULL COMMENT '重定向转化类型',
    attribution_lookback VARCHAR(100) DEFAULT NULL COMMENT '归因回看期',
    reengagement_window VARCHAR(100) DEFAULT NULL COMMENT '重新参与窗口',
    is_primary_attribution TINYINT(1) DEFAULT NULL COMMENT '是否主要归因',
    
    -- 网络和URL信息
    user_agent TEXT DEFAULT NULL COMMENT '用户代理',
    http_referrer TEXT DEFAULT NULL COMMENT 'HTTP引用',
    original_url TEXT DEFAULT NULL COMMENT '原始URL',
    postback_url TEXT DEFAULT NULL COMMENT '回传URL',
    postback_method VARCHAR(10) DEFAULT NULL COMMENT '回传方法',
    postback_http_response_code INT DEFAULT NULL COMMENT '回传HTTP响应代码',
    postback_error_message TEXT DEFAULT NULL COMMENT '回传错误消息',
    
    -- 系统字段
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    batch_id VARCHAR(100) DEFAULT NULL COMMENT '批次ID，用于标识数据导入批次',
    task_id VARCHAR(36) NOT NULL COMMENT 'AutoPipe任务ID，关联tasks表',
    account VARCHAR(255) NOT NULL COMMENT '账户配置名称，如starpower2j_int',
    source_file VARCHAR(255) DEFAULT NULL COMMENT '源文件名',
    
    -- 索引
    INDEX idx_app_id (app_id),
    INDEX idx_install_time (install_time),
    INDEX idx_event_time (event_time),
    INDEX idx_attributed_touch_time (attributed_touch_time),
    INDEX idx_media_source (media_source),
    INDEX idx_campaign (campaign),
    INDEX idx_country_code (country_code),
    INDEX idx_platform (platform),
    INDEX idx_appsflyer_id (appsflyer_id),
    INDEX idx_advertising_id (advertising_id),
    INDEX idx_batch_id (batch_id),
    INDEX idx_task_id (task_id),
    INDEX idx_account (account),
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    
    -- 复合索引
    INDEX idx_app_install_time (app_id, install_time),
    INDEX idx_app_event_time (app_id, event_time),
    INDEX idx_media_campaign (media_source, campaign),
    INDEX idx_country_platform (country_code, platform),
    INDEX idx_app_task (app_id, task_id),
    INDEX idx_account_task (account, task_id)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Retargeting In-App Event Postbacks数据表';

-- ========================================
-- AutoPipe 任务管理相关表
-- ========================================

-- 任务表 (tasks) - AutoPipe页面的核心任务管理表
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID主键',
    task_id VARCHAR(50) UNIQUE NOT NULL COMMENT '加密的任务ID，前端显示用',
    type ENUM('install_pb', 'event_pb', 'install_rtpb', 'event_rtpb') NOT NULL COMMENT '数据类型',
    status ENUM('running', 'paused', 'completed') DEFAULT 'paused' COMMENT '任务状态',
    start_time DATETIME COMMENT '任务开始时间',
    end_time DATETIME NULL COMMENT '任务结束时间',
    duration VARCHAR(20) NULL COMMENT '持续时间，如 "2h 30m"',
    description TEXT COMMENT '任务描述',
    priority ENUM('high', 'medium', 'low') DEFAULT 'medium' COMMENT '任务优先级',
    account_id VARCHAR(36) NOT NULL COMMENT '关联账户ID',
    account VARCHAR(255) NOT NULL COMMENT '账户配置名称，如starpower2j_int',
    data_pointer ENUM('Daily Execution', 'Single Execution') DEFAULT 'Daily Execution' COMMENT '执行模式',
    app_type ENUM('ios', 'android', 'both') DEFAULT 'both' COMMENT '应用类型',
    progress INT DEFAULT 0 COMMENT '任务执行进度 0-100',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '任务创建时间',
    latest_update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '任务最新更新时间',
    user_id VARCHAR(36) NOT NULL COMMENT '关联用户ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
    
    -- 索引
    INDEX idx_user_id (user_id),
    INDEX idx_account_id (account_id),
    INDEX idx_account (account),
    INDEX idx_status (status),
    INDEX idx_create_time (create_time),
    INDEX idx_latest_update_time (latest_update_time),
    INDEX idx_task_id (task_id),
    INDEX idx_type (type),
    INDEX idx_app_type (app_type),
    
    -- 外键约束
    FOREIGN KEY (account_id) REFERENCES account_configs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AutoPipe任务管理表';

-- 任务应用关联表 (task_apps) - 存储任务关联的应用信息
CREATE TABLE IF NOT EXISTS task_apps (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID主键',
    task_id VARCHAR(36) NOT NULL COMMENT '关联任务ID',
    app_id VARCHAR(50) NOT NULL COMMENT '应用ID',
    app_name VARCHAR(255) NOT NULL COMMENT '应用名称',
    icon_url TEXT COMMENT '应用图标URL',
    os ENUM('IOS', 'Android') NOT NULL COMMENT '操作系统',
    country VARCHAR(10) COMMENT '国家代码',
    category VARCHAR(100) COMMENT '应用分类',
    developer VARCHAR(255) COMMENT '开发者',
    rating DECIMAL(3,2) COMMENT '应用评分',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    
    -- 索引 - 使用app_id作为主要索引
    INDEX idx_task_id (task_id),
    INDEX idx_app_id (app_id),
    INDEX idx_os (os),
    INDEX idx_category (category),
    INDEX idx_developer (developer),
    INDEX idx_app_name (app_name),
    
    -- 复合索引
    INDEX idx_task_app (task_id, app_id),
    INDEX idx_app_os (app_id, os),
    
    -- 外键约束
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务应用关联表';

-- 任务执行日志表 (task_execution_logs) - 记录任务执行历史
CREATE TABLE IF NOT EXISTS task_execution_logs (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID主键',
    task_id VARCHAR(36) NOT NULL COMMENT '关联任务ID（tasks.id）',
    app_id VARCHAR(50) DEFAULT NULL COMMENT '应用ID（单 App 执行粒度）',
    execution_time DATETIME NOT NULL COMMENT '执行时间',
    status ENUM('success', 'failed', 'partial') NOT NULL COMMENT '执行状态',
    error_message TEXT NULL COMMENT '错误信息',
    execution_duration INT COMMENT '执行时长(秒)',
    data_processed INT DEFAULT 0 COMMENT '处理的数据量',
    data_fetched INT DEFAULT 0 COMMENT '抓取数据量',
    data_deduplicated INT DEFAULT 0 COMMENT '去重后数据量',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    
    -- 索引
    INDEX idx_task_id (task_id),
    INDEX idx_execution_time (execution_time),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    
    -- 复合索引
    INDEX idx_task_execution_time (task_id, execution_time),
    
    -- 外键约束
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务执行日志表';

-- 任务调度配置表 (task_schedules) - 管理任务调度设置
CREATE TABLE IF NOT EXISTS task_schedules (
    id VARCHAR(36) PRIMARY KEY COMMENT 'UUID主键',
    task_id VARCHAR(36) NOT NULL COMMENT '关联任务ID',
    schedule_type ENUM('daily', 'single') NOT NULL COMMENT '调度类型',
    execution_time TIME COMMENT '每日执行时间 (HH:MM:SS)',
    execution_date DATE COMMENT '单次执行日期',
    timezone VARCHAR(50) DEFAULT 'UTC' COMMENT '时区',
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否激活',
    next_execution DATETIME COMMENT '下次执行时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
    
    -- 索引
    INDEX idx_task_id (task_id),
    INDEX idx_next_execution (next_execution),
    INDEX idx_is_active (is_active),
    INDEX idx_schedule_type (schedule_type),
    INDEX idx_execution_time (execution_time),
    
    -- 复合索引
    INDEX idx_task_active (task_id, is_active),
    INDEX idx_next_execution_active (next_execution, is_active),
    
    -- 外键约束
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='任务调度配置表';

-- ========================================
-- Benchmark Explorer（公共基准数据 MySQL 缓存）
-- ========================================

CREATE TABLE IF NOT EXISTS benchmark_sync_runs (
    id              VARCHAR(36) PRIMARY KEY,
    trigger_type    ENUM('scheduled', 'manual', 'sitemap_only') NOT NULL DEFAULT 'manual',
    status          ENUM('running', 'success', 'failed') NOT NULL DEFAULT 'running',
    sitemap_count   INT NOT NULL DEFAULT 0,
    slices_cached   INT NOT NULL DEFAULT 0,
    error_message   TEXT NULL,
    started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at     DATETIME NULL,
    INDEX idx_benchmark_sync_started (started_at),
    INDEX idx_benchmark_sync_status (status, finished_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Benchmark sitemap / cache sync job runs';

CREATE TABLE IF NOT EXISTS benchmark_slices (
    url              VARCHAR(512) NOT NULL PRIMARY KEY,
    url_hash         CHAR(64) NOT NULL COMMENT 'SHA-256 hex of canonical url',
    category         VARCHAR(128) NOT NULL,
    sub_category     VARCHAR(128) NOT NULL,
    sub_sub_category VARCHAR(128) NULL,
    country          VARCHAR(64) NOT NULL,
    media_type       VARCHAR(64) NOT NULL,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    sync_run_id      VARCHAR(36) NULL,
    first_seen_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_benchmark_slices_hash (url_hash),
    INDEX idx_benchmark_slices_filters (category, sub_category, country, media_type),
    INDEX idx_benchmark_slices_active (is_active),
    INDEX idx_benchmark_slices_sync (sync_run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AppsFlyer public benchmark slice catalog (from sitemap)';

CREATE TABLE IF NOT EXISTS benchmark_slice_cache (
    url               VARCHAR(512) NOT NULL PRIMARY KEY,
    content_hash      CHAR(64) NULL COMMENT 'SHA-256 of page_props JSON',
    page_props        JSON NOT NULL,
    point_count       INT NOT NULL DEFAULT 0,
    sections_mask     VARCHAR(128) NULL COMMENT 'Comma-separated section ids with data',
    source_fetched_at DATETIME NOT NULL,
    expires_at        DATETIME NOT NULL,
    hit_count         INT NOT NULL DEFAULT 0,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_benchmark_slice_cache_expires (expires_at),
    INDEX idx_benchmark_slice_cache_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Cached __NEXT_DATA__ pageProps per benchmark slice URL';

CREATE TABLE IF NOT EXISTS benchmark_exports (
    export_id    VARCHAR(64) NOT NULL PRIMARY KEY,
    created_by   VARCHAR(50) NOT NULL,
    label        VARCHAR(255) NULL,
    slice_count  INT NOT NULL DEFAULT 0,
    file_path    VARCHAR(512) NOT NULL,
    manifest     JSON NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_benchmark_exports_user (created_by, created_at),
    CONSTRAINT fk_benchmark_exports_user
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='OpenClaw export records (files under BENCHMARK_OPENCLAW_ROOT)';