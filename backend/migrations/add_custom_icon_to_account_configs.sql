-- 为 account_configs 表添加 custom_icon 字段的迁移脚本
-- 执行时间: 2024年

-- 检查字段是否已存在，如果不存在则添加
SET @sql = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = DATABASE() 
     AND TABLE_NAME = 'account_configs' 
     AND COLUMN_NAME = 'custom_icon') = 0,
    'ALTER TABLE account_configs ADD COLUMN custom_icon TEXT DEFAULT NULL COMMENT ''自定义图标，存储base64编码的图像数据'' AFTER sort_order',
    'SELECT ''custom_icon column already exists'' as message'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 验证字段是否添加成功
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE() 
AND TABLE_NAME = 'account_configs' 
AND COLUMN_NAME = 'custom_icon';
