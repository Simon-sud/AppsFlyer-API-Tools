-- task_execution_logs 与 AutoPipe Go 对齐：GET /api/autopipe/tasks/.../logs 与 INSERT 日志依赖以下列
-- 若某列已存在，单独执行该行会报 Duplicate column，可跳过该行

ALTER TABLE task_execution_logs ADD COLUMN app_id VARCHAR(50) DEFAULT NULL COMMENT '应用ID' AFTER task_id;
ALTER TABLE task_execution_logs ADD COLUMN data_fetched INT DEFAULT 0 COMMENT '抓取数据量';
ALTER TABLE task_execution_logs ADD COLUMN data_deduplicated INT DEFAULT 0 COMMENT '去重后数据量';
