-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    role ENUM('Super Admin', 'User', 'Team5', 'Team9') DEFAULT 'User',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login DATETIME,
    avatar TEXT,
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建账户配置表
CREATE TABLE IF NOT EXISTS account_configs (
    id VARCHAR(36) PRIMARY KEY,
    account_name VARCHAR(255) NOT NULL,
    account_type ENUM('PID','PRT') NOT NULL,
    api_token TEXT NOT NULL,
    is_default TINYINT(1) DEFAULT 0,
    user_ids JSON DEFAULT NULL COMMENT '关联的用户ID数组，NULL表示所有用户可见',
    validate TEXT DEFAULT NULL COMMENT '账户有效性验证结果(JSON字符串)',
    sort_order INT DEFAULT 0 COMMENT '排序字段',
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
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

-- 创建报表表
CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(100) NOT NULL,
    report_name VARCHAR(255) NOT NULL,
    status ENUM('uploading','uploaded','processing','completed','failed') DEFAULT 'uploading',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    size BIGINT DEFAULT NULL,
    account_type VARCHAR(50) DEFAULT NULL,
    account_id VARCHAR(100) DEFAULT NULL,
    app_id VARCHAR(100) DEFAULT NULL,
    app_name VARCHAR(255) DEFAULT NULL,
    data_type VARCHAR(50) DEFAULT NULL,
    event_filter VARCHAR(255) DEFAULT NULL COMMENT '事件过滤条件',
    date_range_start DATE DEFAULT NULL,
    date_range_end DATE DEFAULT NULL,
    record_count INT DEFAULT NULL,
    primary_attribution_count INT DEFAULT NULL,
    query_log_id VARCHAR(100) DEFAULT NULL COMMENT '关联的query_logs表ID',
    username VARCHAR(255) DEFAULT NULL COMMENT '上传者用户名',
    download_url VARCHAR(500) DEFAULT NULL COMMENT '下载URL',
    PRIMARY KEY (id),
    INDEX idx_query_log (query_log_id),
    INDEX idx_status (status),
    INDEX idx_create_time (create_time),
    INDEX idx_app_id (app_id),
    INDEX idx_account (account_type, account_id),
    INDEX idx_username (username),
    INDEX idx_app_name (app_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 创建临时文件表
CREATE TABLE IF NOT EXISTS temp_files (
    id VARCHAR(100) NOT NULL,
    report_id VARCHAR(100) DEFAULT NULL,
    file_path VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) DEFAULT NULL,
    account_id VARCHAR(100) DEFAULT NULL,
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_report (report_id),
    INDEX idx_account (account_type, account_id),
    CONSTRAINT temp_files_ibfk_1 FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
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
    app_id VARCHAR(128) PRIMARY KEY,
    os VARCHAR(64) NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    developer VARCHAR(255) NOT NULL,
    category VARCHAR(128) NOT NULL,
    description TEXT,
    url VARCHAR(512),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    
    -- 复合索引
    INDEX idx_app_install_time (app_id, install_time),
    INDEX idx_app_event_time (app_id, event_time),
    INDEX idx_media_campaign (media_source, campaign),
    INDEX idx_country_platform (country_code, platform)
    
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
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    
    -- 复合索引
    INDEX idx_app_install_time (app_id, install_time),
    INDEX idx_app_event_time (app_id, event_time),
    INDEX idx_media_campaign (media_source, campaign),
    INDEX idx_country_platform (country_code, platform)
    
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
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    
    -- 复合索引
    INDEX idx_app_install_time (app_id, install_time),
    INDEX idx_app_event_time (app_id, event_time),
    INDEX idx_media_campaign (media_source, campaign),
    INDEX idx_country_platform (country_code, platform)
    
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
    INDEX idx_created_at (created_at),
    INDEX idx_updated_at (updated_at),
    
    -- 复合索引
    INDEX idx_app_install_time (app_id, install_time),
    INDEX idx_app_event_time (app_id, event_time),
    INDEX idx_media_campaign (media_source, campaign),
    INDEX idx_country_platform (country_code, platform)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Retargeting In-App Event Postbacks数据表'; 