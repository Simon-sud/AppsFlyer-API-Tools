-- 为Dashboard数据表添加task_id字段
-- 创建时间: 2025-10-20
-- 描述: 在四个Dashboard数据表中添加task_id字段，用于关联AutoPipe任务

-- 添加task_id到Dashboard_Install_Postbacks表
ALTER TABLE Dashboard_Install_Postbacks 
ADD COLUMN task_id VARCHAR(36) DEFAULT NULL COMMENT 'AutoPipe任务ID，关联tasks表' AFTER batch_id,
ADD INDEX idx_task_id (task_id),
ADD INDEX idx_app_task (app_id, task_id);

-- 添加task_id到Dashboard_In_App_Event_Postbacks表
ALTER TABLE Dashboard_In_App_Event_Postbacks 
ADD COLUMN task_id VARCHAR(36) DEFAULT NULL COMMENT 'AutoPipe任务ID，关联tasks表' AFTER batch_id,
ADD INDEX idx_task_id (task_id),
ADD INDEX idx_app_task (app_id, task_id);

-- 添加task_id到Dashboard_Retargeting_Install_Postbacks表
ALTER TABLE Dashboard_Retargeting_Install_Postbacks 
ADD COLUMN task_id VARCHAR(36) DEFAULT NULL COMMENT 'AutoPipe任务ID，关联tasks表' AFTER batch_id,
ADD INDEX idx_task_id (task_id),
ADD INDEX idx_app_task (app_id, task_id);

-- 添加task_id到Dashboard_Retargeting_In_App_Event_Postbacks表
ALTER TABLE Dashboard_Retargeting_In_App_Event_Postbacks 
ADD COLUMN task_id VARCHAR(36) DEFAULT NULL COMMENT 'AutoPipe任务ID，关联tasks表' AFTER batch_id,
ADD INDEX idx_task_id (task_id),
ADD INDEX idx_app_task (app_id, task_id);

-- 迁移完成提示
SELECT '已为四个Dashboard数据表添加task_id字段及相关索引' as migration_status;

