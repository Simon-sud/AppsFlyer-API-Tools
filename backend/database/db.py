import mysql.connector
from mysql.connector import pooling
import os
import logging
from contextlib import contextmanager
from flask import Flask
import time

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 判断是否在本地环境运行
IS_LOCAL = os.getenv('IS_LOCAL', 'false').lower() == 'true'

# 从环境变量获取数据库配置
DB_HOST = os.getenv('DB_HOST', 'localhost' if IS_LOCAL else '127.0.0.1')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '5452831Rpg..')
DB_NAME = os.getenv('DB_NAME', 'appsflyer_rawdata')

# 修改数据库连接配置
DB_CONFIG = {
    'host': DB_HOST,
    'user': DB_USER,
    'password': DB_PASSWORD,
    'database': DB_NAME,
    'pool_name': 'mypool',
    'pool_size': 5,
    'connect_timeout': 10,
    'pool_reset_session': True,
    'charset': 'utf8mb4',
    'collation': 'utf8mb4_unicode_ci',
    'autocommit': False,
    'get_warnings': True,
    'raise_on_warnings': True
}

logger.info(f"使用数据库主机: {DB_HOST}")

# 创建连接池
try:
    connection_pool = mysql.connector.pooling.MySQLConnectionPool(**DB_CONFIG)
    logger.info("数据库连接池创建成功")
except Exception as e:
    logger.error(f"创建数据库连接池失败: {str(e)}")
    raise

# 添加连接重试机制
def get_connection_with_retry(max_retries=3, retry_delay=1):
    for attempt in range(max_retries):
        try:
            return connection_pool.get_connection()
        except mysql.connector.Error as e:
            if attempt == max_retries - 1:
                raise
            logger.warning(f"获取数据库连接失败，尝试重连 ({attempt + 1}/{max_retries})")
            time.sleep(retry_delay)

# 优化数据库游标上下文管理器
@contextmanager
def get_db_cursor():
    connection = None
    cursor = None
    try:
        connection = get_connection_with_retry()
        cursor = connection.cursor(dictionary=True)
        yield cursor
        while cursor.nextset():
            pass
        connection.commit()
    except mysql.connector.Error as e:
        if connection:
            connection.rollback()
        logger.error(f"数据库操作失败: {str(e)}")
        raise
    except Exception as e:
        if connection:
            connection.rollback()
        logger.error(f"未知错误: {str(e)}")
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()

# 添加数据库配置验证
def validate_db_config(config):
    required_fields = ['host', 'user', 'password', 'database']
    for field in required_fields:
        if not config.get(field):
            raise ValueError(f"数据库配置缺少必要字段: {field}")
    
    try:
        conn = mysql.connector.connect(**config)
        conn.close()
    except mysql.connector.Error as e:
        raise ValueError(f"数据库配置验证失败: {str(e)}")

# 优化数据库初始化
def init_db(app: Flask) -> None:
    global DB_CONFIG
    
    # 更新配置
    new_config = {
        'host': app.config.get('DB_HOST', DB_HOST),
        'user': app.config.get('DB_USER', DB_USER),
        'password': app.config.get('DB_PASSWORD', DB_PASSWORD),
        'database': app.config.get('DB_NAME', DB_NAME)
    }
    
    # 验证配置
    validate_db_config(new_config)
    
    # 更新全局配置
    DB_CONFIG.update(new_config)
    
    # 重新创建连接池
    global connection_pool
    try:
        connection_pool = mysql.connector.pooling.MySQLConnectionPool(**DB_CONFIG)
        logger.info("数据库连接池重新创建成功")
    except Exception as e:
        logger.error(f"创建数据库连接池失败: {str(e)}")
        raise 