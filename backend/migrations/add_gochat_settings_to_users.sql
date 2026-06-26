-- 为 users 表添加 Gochat 相关配置字段
-- 该脚本具备幂等性，可安全重复执行

SET @schema_name = DATABASE();

-- gochat_provider
SET @sql := IF (
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema_name
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'gochat_provider'
    ),
    'SELECT ''gochat_provider already exists''',
    'ALTER TABLE users ADD COLUMN gochat_provider VARCHAR(50) DEFAULT ''openai'' COMMENT ''Gochat 默认提供商'' AFTER avatar'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gochat_openai_api_key
SET @sql := IF (
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema_name
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'gochat_openai_api_key'
    ),
    'SELECT ''gochat_openai_api_key already exists''',
    'ALTER TABLE users ADD COLUMN gochat_openai_api_key TEXT DEFAULT NULL COMMENT ''OpenAI API Key（加密或明文存储）'' AFTER gochat_provider'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gochat_openai_base_url
SET @sql := IF (
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema_name
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'gochat_openai_base_url'
    ),
    'SELECT ''gochat_openai_base_url already exists''',
    'ALTER TABLE users ADD COLUMN gochat_openai_base_url VARCHAR(255) DEFAULT NULL COMMENT ''OpenAI 自定义 Base URL'' AFTER gochat_openai_api_key'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gochat_deepseek_api_key
SET @sql := IF (
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema_name
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'gochat_deepseek_api_key'
    ),
    'SELECT ''gochat_deepseek_api_key already exists''',
    'ALTER TABLE users ADD COLUMN gochat_deepseek_api_key TEXT DEFAULT NULL COMMENT ''DeepSeek API Key（加密或明文存储）'' AFTER gochat_openai_base_url'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gochat_deepseek_base_url
SET @sql := IF (
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema_name
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'gochat_deepseek_base_url'
    ),
    'SELECT ''gochat_deepseek_base_url already exists''',
    'ALTER TABLE users ADD COLUMN gochat_deepseek_base_url VARCHAR(255) DEFAULT NULL COMMENT ''DeepSeek 自定义 Base URL'' AFTER gochat_deepseek_api_key'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gochat_max_tokens
SET @sql := IF (
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema_name
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'gochat_max_tokens'
    ),
    'SELECT ''gochat_max_tokens already exists''',
    'ALTER TABLE users ADD COLUMN gochat_max_tokens INT DEFAULT 1024 COMMENT ''Gochat 默认 max_tokens'' AFTER gochat_deepseek_base_url'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gochat_temperature
SET @sql := IF (
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema_name
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'gochat_temperature'
    ),
    'SELECT ''gochat_temperature already exists''',
    'ALTER TABLE users ADD COLUMN gochat_temperature TINYINT DEFAULT 7 COMMENT ''Gochat 默认 temperature（0-10）'' AFTER gochat_max_tokens'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- gochat_language
SET @sql := IF (
    EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema_name
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = 'gochat_language'
    ),
    'SELECT ''gochat_language already exists''',
    'ALTER TABLE users ADD COLUMN gochat_language VARCHAR(10) DEFAULT ''en'' COMMENT ''Gochat 默认语言'' AFTER gochat_temperature'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 返回当前字段定义以供验证
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = @schema_name
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME LIKE 'gochat_%'
ORDER BY COLUMN_NAME;

