"""
Unified database initialization and management.
Consolidates MySQL and PostgreSQL setup.
"""
import mysql.connector
from mysql.connector import pooling
import os
import logging
from contextlib import contextmanager
from typing import Any, Iterator
from flask import Flask
import time
import sys

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# PostgreSQL imports (optional; typings/psycopg2 used when not installed)
try:
    import psycopg2  # pyright: ignore[reportMissingModuleSource]
    from psycopg2 import pool  # pyright: ignore[reportMissingModuleSource]
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False
    logger.warning("psycopg2未安装，PostgreSQL功能不可用")

import subprocess

# ==================== MySQL configuration ====================

# Whether the app runs in a local environment
IS_LOCAL = os.getenv('IS_LOCAL', 'false').lower() == 'true'

# MySQL settings from environment variables
DB_HOST = os.getenv('DB_HOST', 'localhost' if IS_LOCAL else '127.0.0.1')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'appsflyer_rawdata')

# MySQL connection pool settings
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
    'raise_on_warnings': True,
    'time_zone': '+00:00'  # Session timezone: UTC
}

logger.info(f"使用MySQL数据库主机: {DB_HOST}")

# MySQL connection pool
try:
    connection_pool = mysql.connector.pooling.MySQLConnectionPool(**DB_CONFIG)
    logger.info("MySQL数据库连接池创建成功")
except Exception as e:
    logger.error(f"创建MySQL数据库连接池失败: {str(e)}")
    raise

# ==================== PostgreSQL configuration ====================

# PostgreSQL settings from environment variables
PG_HOST = os.getenv('PG_HOST', '127.0.0.1')
PG_PORT = os.getenv('PG_PORT', '5432')
PG_USER = os.getenv('PG_USER', 'postgres')
PG_PASSWORD = os.getenv('PG_PASSWORD', '')
PG_DB = os.getenv('PG_DB', 'gochat_db')

# PostgreSQL pool (default postgres database)
pg_connection_pool = None
# PostgreSQL pool (target application database)
pg_target_pool = None

# ==================== MySQL helpers ====================

def get_connection_with_retry(max_retries=3, retry_delay=1):
    """Retry MySQL connection acquisition."""
    for attempt in range(max_retries):
        try:
            return connection_pool.get_connection()
        except mysql.connector.Error as e:
            if attempt == max_retries - 1:
                raise
            logger.warning(f"获取MySQL数据库连接失败，尝试重连 ({attempt + 1}/{max_retries})")
            time.sleep(retry_delay)

@contextmanager
def get_db_cursor() -> Iterator[Any]:
    """MySQL cursor context manager."""
    connection = None
    cursor = None
    try:
        connection = get_connection_with_retry()
        if connection is None:
            raise Exception("无法获取数据库连接")
        
        cursor = connection.cursor(dictionary=True)
        if cursor is None:
            raise Exception("无法创建数据库游标")
        
        # Set session timezone to UTC
        cursor.execute("SET time_zone = '+00:00'")
        logger.info("数据库会话时区已设置为UTC")
        
        yield cursor
        if cursor:
            while cursor.nextset():
                pass
        if connection:
            connection.commit()
    except mysql.connector.Error as e:
        if connection:
            connection.rollback()
        logger.error(f"MySQL数据库操作失败: {str(e)}")
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

def validate_db_config(config):
    """Validate MySQL connection settings."""
    required_fields = ['host', 'user', 'password', 'database']
    for field in required_fields:
        if not config.get(field):
            raise ValueError(f"数据库配置缺少必要字段: {field}")
    
    try:
        conn = mysql.connector.connect(**config)
        conn.close()
    except mysql.connector.Error as e:
        raise ValueError(f"数据库配置验证失败: {str(e)}")

def init_db(app: Flask) -> None:
    """Initialize MySQL settings on the Flask app."""
    global DB_CONFIG
    
    # Apply config from the Flask app
    new_config = {
        'host': app.config.get('DB_HOST', DB_HOST),
        'user': app.config.get('DB_USER', DB_USER),
        'password': app.config.get('DB_PASSWORD', DB_PASSWORD),
        'database': app.config.get('DB_NAME', DB_NAME)
    }
    
    # Validate settings
    validate_db_config(new_config)
    
    # Update module-level config
    DB_CONFIG.update(new_config)
    
    # Recreate the connection pool
    global connection_pool
    try:
        connection_pool = mysql.connector.pooling.MySQLConnectionPool(**DB_CONFIG)
        logger.info("MySQL数据库连接池重新创建成功")
    except Exception as e:
        logger.error(f"创建MySQL数据库连接池失败: {str(e)}")
        raise

def check_db_connection():
    """Test MySQL connectivity."""
    try:
        conn = connection_pool.get_connection()
        conn.close()
        return True
    except Exception as e:
        logger.error(f"MySQL数据库连接测试失败: {str(e)}")
        return False

def init_mysql_tables():
    """Initialize MySQL database tables."""
    try:
        with get_db_cursor() as cursor:
            # Create database if missing
            cursor.execute("CREATE DATABASE IF NOT EXISTS appsflyer_rawdata")
            cursor.execute("USE appsflyer_rawdata")
            logger.info("MySQL数据库连接和基本表检查完成")
            return True
    except Exception as e:
        logger.error(f"MySQL表初始化失败: {str(e)}")
        return False

# ==================== PostgreSQL helpers ====================

def check_postgresql_installed():
    """Return whether PostgreSQL client tools are installed."""
    if not PSYCOPG2_AVAILABLE:
        return False
    try:
        result = subprocess.run(['which', 'psql'], capture_output=True, text=True)
        return result.returncode == 0
    except Exception:
        return False

def check_postgresql_running():
    """Return whether the PostgreSQL service is running."""
    if not PSYCOPG2_AVAILABLE:
        return False
    try:
        result = subprocess.run(['pg_isready', '-h', PG_HOST, '-p', PG_PORT], 
                              capture_output=True, text=True)
        return result.returncode == 0
    except Exception:
        return False

def install_postgresql_macos():
    """Install PostgreSQL on macOS via Homebrew."""
    try:
        logger.info("正在检查Homebrew...")
        # Check for Homebrew
        brew_check = subprocess.run(['which', 'brew'], capture_output=True, text=True)
        if brew_check.returncode != 0:
            logger.error("未找到Homebrew，请先安装Homebrew: https://brew.sh")
            return False
        
        logger.info("正在安装PostgreSQL...")
        # Install PostgreSQL
        result = subprocess.run(['brew', 'install', 'postgresql@15'], 
                              capture_output=True, text=True)
        if result.returncode != 0:
            logger.error(f"PostgreSQL安装失败: {result.stderr}")
            return False
        
        logger.info("正在启动PostgreSQL服务...")
        # Start PostgreSQL service
        subprocess.run(['brew', 'services', 'start', 'postgresql@15'], 
                      capture_output=True, text=True)
        
        # Wait for the service to become ready
        time.sleep(3)
        
        logger.info("PostgreSQL安装并启动成功")
        return True
    except Exception as e:
        logger.error(f"安装PostgreSQL时出错: {str(e)}")
        return False

def init_postgresql():
    """Initialize the PostgreSQL connection pool."""
    global pg_connection_pool
    
    if not PSYCOPG2_AVAILABLE:
        logger.error("psycopg2未安装，无法初始化PostgreSQL")
        return False
    
    # Verify PostgreSQL is installed
    if not check_postgresql_installed():
        logger.warning("PostgreSQL未安装，尝试自动安装...")
        if sys.platform == 'darwin':  # macOS
            if not install_postgresql_macos():
                logger.error("PostgreSQL自动安装失败，请手动安装")
                return False
        else:
            logger.error("当前系统不支持自动安装PostgreSQL，请手动安装")
            return False
    
    # Verify PostgreSQL is running
    if not check_postgresql_running():
        logger.warning("PostgreSQL服务未运行，尝试启动...")
        if sys.platform == 'darwin':  # macOS
            try:
                subprocess.run(['brew', 'services', 'start', 'postgresql@15'], 
                             capture_output=True, text=True)
                time.sleep(3)
            except Exception as e:
                logger.error(f"启动PostgreSQL服务失败: {str(e)}")
                return False
    
    try:
        # Create connection pool
        pg_connection_pool = pool.SimpleConnectionPool(
            minconn=1,
            maxconn=10,
            host=PG_HOST,
            port=PG_PORT,
            user=PG_USER,
            password=PG_PASSWORD,
            database='postgres'  # Connect to the default database first
        )
        
        if pg_connection_pool:
            logger.info(f"PostgreSQL连接池创建成功: {PG_HOST}:{PG_PORT}")
            return True
        else:
            logger.error("PostgreSQL连接池创建失败")
            return False
    except Exception as e:
        logger.error(f"PostgreSQL连接失败: {str(e)}")
        return False

def create_postgresql_database():
    """Create the PostgreSQL database if it does not exist."""
    if not PSYCOPG2_AVAILABLE or not pg_connection_pool:
        return False
    
    try:
        conn = pg_connection_pool.getconn()
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Check whether the database exists
        cursor.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s",
            (PG_DB,)
        )
        exists = cursor.fetchone()
        
        if not exists:
            logger.info(f"正在创建PostgreSQL数据库: {PG_DB}")
            cursor.execute(f'CREATE DATABASE {PG_DB}')
            logger.info(f"PostgreSQL数据库 {PG_DB} 创建成功")
        else:
            logger.info(f"PostgreSQL数据库 {PG_DB} 已存在")
        
        cursor.close()
        pg_connection_pool.putconn(conn)
        return True
    except Exception as e:
        logger.error(f"创建PostgreSQL数据库失败: {str(e)}")
        return False

def get_target_pool():
    """Return the connection pool for the target PostgreSQL database."""
    global pg_target_pool
    
    if not PSYCOPG2_AVAILABLE:
        raise Exception("psycopg2未安装")
    
    if not pg_connection_pool:
        if not init_postgresql():
            raise Exception("PostgreSQL初始化失败")
        if not create_postgresql_database():
            raise Exception("PostgreSQL数据库创建失败")
    
    if not pg_target_pool:
        try:
            pg_target_pool = pool.SimpleConnectionPool(
                minconn=1,
                maxconn=10,
                host=PG_HOST,
                port=PG_PORT,
                user=PG_USER,
                password=PG_PASSWORD,
                database=PG_DB
            )
            if not pg_target_pool:
                raise Exception("目标数据库连接池创建失败")
        except Exception as e:
            logger.error(f"创建PostgreSQL目标数据库连接池失败: {str(e)}")
            raise
    
    return pg_target_pool

@contextmanager
def get_pg_cursor():
    """PostgreSQL cursor context manager."""
    if not PSYCOPG2_AVAILABLE:
        raise Exception("psycopg2未安装，PostgreSQL功能不可用")
    
    connection = None
    cursor = None
    
    try:
        pool = get_target_pool()
        connection = pool.getconn()
        cursor = connection.cursor()
        
        yield cursor
        
        connection.commit()
    except Exception as e:
        if connection:
            connection.rollback()
        logger.error(f"PostgreSQL操作失败: {str(e)}")
        raise
    finally:
        if cursor:
            cursor.close()
        if connection and pool:
            pool.putconn(connection)

def init_gochat_tables():
    """Initialize Gochat PostgreSQL tables."""
    if not PSYCOPG2_AVAILABLE:
        logger.warning("psycopg2未安装，无法初始化Gochat表")
        return False
    
    try:
        # Load SQL schema file
        sql_file_path = os.path.join(os.path.dirname(__file__), 'gochat_schema.sql')
        
        with open(sql_file_path, 'r', encoding='utf-8') as f:
            sql_content = f.read()
        
        # Execute SQL statements
        with get_pg_cursor() as cursor:
            # Split on semicolons while preserving function bodies ($$ delimiters)
            # Handle function definitions first
            statements = []
            current_statement = ""
            in_function = False
            function_delimiter_count = 0
            
            # Process line by line
            for line in sql_content.split('\n'):
                stripped_line = line.strip()
                
                # Skip comments and blank lines
                if not stripped_line or stripped_line.startswith('--'):
                    continue
                
                # Detect start of a function definition
                if 'CREATE OR REPLACE FUNCTION' in stripped_line.upper():
                    in_function = True
                    function_delimiter_count = 0
                
                # Track function $$ delimiters
                if '$$' in stripped_line:
                    function_delimiter_count += stripped_line.count('$$')
                
                current_statement += line + '\n'
                
                # End of function body (two $$ markers seen)
                if in_function and function_delimiter_count >= 2:
                    statements.append(current_statement.strip())
                    current_statement = ""
                    in_function = False
                    function_delimiter_count = 0
                # End of a normal statement (semicolon outside a function)
                elif not in_function and stripped_line.endswith(';'):
                    statements.append(current_statement.strip())
                    current_statement = ""
            
            # Flush any trailing statement
            if current_statement.strip():
                statements.append(current_statement.strip())
            
            # Run all parsed statements
            for statement in statements:
                if statement.strip():
                    try:
                        cursor.execute(statement)
                        logger.info(f"执行PostgreSQL SQL语句成功")
                    except Exception as e:
                        error_msg = str(e).lower()
                        # Ignore errors when objects already exist or are missing
                        if any(keyword in error_msg for keyword in ['already exists', 'duplicate', 'does not exist']):
                            logger.info(f"PostgreSQL对象已存在或不存在，跳过: {error_msg[:50]}...")
                        else:
                            # Log other errors as warnings and continue
                            logger.warning(f"执行PostgreSQL SQL语句时出现警告: {str(e)[:100]}")
        
        logger.info("Gochat PostgreSQL表初始化成功")
        return True
    except Exception as e:
        logger.error(f"Gochat PostgreSQL表初始化失败: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return False

def init_postgresql_database():
    """Initialize PostgreSQL (install, create database, and tables)."""
    if not PSYCOPG2_AVAILABLE:
        logger.warning("psycopg2未安装，PostgreSQL功能不可用")
        return False
    
    try:
        logger.info("开始初始化PostgreSQL数据库...")
        
        # Initialize PostgreSQL connection
        if not init_postgresql():
            logger.error("PostgreSQL连接初始化失败")
            return False
        
        # Create database
        if not create_postgresql_database():
            logger.error("PostgreSQL数据库创建失败")
            return False
        
        # Initialize Gochat tables
        if not init_gochat_tables():
            logger.error("Gochat表初始化失败")
            return False
        
        logger.info("PostgreSQL数据库初始化完成")
        return True
    except Exception as e:
        logger.error(f"PostgreSQL数据库初始化失败: {str(e)}")
        return False

# ==================== Unified initialization ====================

def init_all_databases():
    """Initialize all databases (MySQL and PostgreSQL)."""
    results = {
        'mysql': False,
        'postgresql': False
    }
    
    logger.info("=" * 60)
    logger.info("开始初始化所有数据库...")
    logger.info("=" * 60)
    
    # Initialize MySQL
    logger.info("\n[1/2] 初始化MySQL数据库...")
    try:
        if not check_db_connection():
            logger.error("MySQL数据库连接失败，请检查配置")
            results['mysql'] = False
        else:
            if init_mysql_tables():
                logger.info("✓ MySQL数据库初始化成功")
                results['mysql'] = True
            else:
                logger.error("✗ MySQL数据库初始化失败")
                results['mysql'] = False
    except Exception as e:
        logger.error(f"✗ MySQL数据库初始化出错: {str(e)}")
        results['mysql'] = False
    
    # Initialize PostgreSQL
    logger.info("\n[2/2] 初始化PostgreSQL数据库（用于Gochat功能）...")
    try:
        if init_postgresql_database():
            logger.info("✓ PostgreSQL数据库初始化成功")
            results['postgresql'] = True
        else:
            logger.warning("✗ PostgreSQL数据库初始化失败（Gochat功能可能不可用）")
            results['postgresql'] = False
    except Exception as e:
        logger.warning(f"✗ PostgreSQL数据库初始化出错: {str(e)}（Gochat功能可能不可用）")
        results['postgresql'] = False
    
    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("数据库初始化总结:")
    logger.info(f"  MySQL:     {'✓ 成功' if results['mysql'] else '✗ 失败'}")
    logger.info(f"  PostgreSQL: {'✓ 成功' if results['postgresql'] else '✗ 失败（可选）'}")
    logger.info("=" * 60)
    
    # MySQL is required; PostgreSQL is optional
    return results['mysql']

# CLI entry point
if __name__ == '__main__':
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    success = init_all_databases()
    sys.exit(0 if success else 1)
