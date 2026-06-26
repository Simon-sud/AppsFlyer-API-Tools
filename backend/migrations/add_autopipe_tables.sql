-- AutoPipe 任务管理表迁移文件
-- 创建时间: 2025-01-16
-- 描述: 添加AutoPipe任务管理相关的数据库表

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
    data_pointer ENUM('Daily Execution', 'Single Execution') DEFAULT 'Daily Execution' COMMENT '执行模式',
    app_type ENUM('ios', 'android', 'both') DEFAULT 'both' COMMENT '应用类型',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '任务创建时间',
    latest_update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '任务最新更新时间',
    user_id VARCHAR(36) NOT NULL COMMENT '关联用户ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
    
    -- 索引
    INDEX idx_user_id (user_id),
    INDEX idx_account_id (account_id),
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
    app_id VARCHAR(50) DEFAULT NULL COMMENT '应用ID',
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

-- 添加一些示例数据（可选）
-- INSERT INTO tasks (id, task_id, type, status, description, priority, account_id, data_pointer, app_type, user_id, create_time, latest_update_time) 
-- VALUES 
-- ('550e8400-e29b-41d4-a716-446655440001', 'TASK001', 'install_pb', 'paused', '示例任务1', 'medium', 'account_id_here', 'Daily Execution', 'both', 'user_id_here', NOW(), NOW()),
-- ('550e8400-e29b-41d4-a716-446655440002', 'TASK002', 'event_pb', 'running', '示例任务2', 'high', 'account_id_here', 'Single Execution', 'ios', 'user_id_here', NOW(), NOW());

-- 迁移完成提示
SELECT 'AutoPipe任务管理表创建完成' as migration_status;
