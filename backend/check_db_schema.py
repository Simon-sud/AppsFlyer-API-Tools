#!/usr/bin/env python3
"""
Database schema validation script.
Verifies MySQL and PostgreSQL table structures meet requirements.
"""

import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database.db import get_db_cursor, get_pg_cursor, check_db_connection
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Required MySQL tables
REQUIRED_MYSQL_TABLES = [
    'users',
    'accounts',
    'query_logs',
    'query_executions',
    'query_results',
    'execution_logs',
    'download_records'
]

# Required PostgreSQL tables
REQUIRED_PG_TABLES = [
    'conversations',
    'chat_messages'
]

def check_mysql_schema():
    """Validate MySQL database table structure."""
    try:
        if not check_db_connection():
            logger.error("MySQL 连接失败")
            return False
        
        with get_db_cursor() as cursor:
            # Check whether the database exists
            cursor.execute("SHOW DATABASES LIKE 'appsflyer_rawdata'")
            if not cursor.fetchone():
                logger.warning("数据库 appsflyer_rawdata 不存在，需要初始化")
                return False
            
            cursor.execute("USE appsflyer_rawdata")
            
            # Check required tables
            missing_tables = []
            for table in REQUIRED_MYSQL_TABLES:
                cursor.execute(f"SHOW TABLES LIKE '{table}'")
                if not cursor.fetchone():
                    missing_tables.append(table)
            
            if missing_tables:
                logger.warning(f"缺少以下MySQL表: {', '.join(missing_tables)}")
                return False
            
            logger.info("MySQL 数据库表结构检查通过")
            return True
    except Exception as e:
        logger.error(f"检查MySQL表结构时出错: {str(e)}")
        return False

def check_pg_schema():
    """Validate PostgreSQL database table structure."""
    try:
        from database.db import get_pg_cursor
        
        with get_pg_cursor() as cursor:
            # Check required tables
            missing_tables = []
            for table in REQUIRED_PG_TABLES:
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = %s
                    )
                """, (table,))
                if not cursor.fetchone()[0]:
                    missing_tables.append(table)
            
            if missing_tables:
                logger.warning(f"缺少以下PostgreSQL表: {', '.join(missing_tables)}")
                return False
            
            logger.info("PostgreSQL 数据库表结构检查通过")
            return True
    except ImportError:
        logger.warning("psycopg2 未安装，跳过 PostgreSQL 检查")
        return True  # PostgreSQL is optional
    except Exception as e:
        logger.warning(f"检查PostgreSQL表结构时出错: {str(e)}")
        return False

def main():
    """CLI entry point."""
    mysql_ok = check_mysql_schema()
    pg_ok = check_pg_schema()
    
    if mysql_ok and pg_ok:
        print("✓ 所有数据库表结构检查通过")
        sys.exit(0)
    else:
        if not mysql_ok:
            print("✗ MySQL 数据库表结构不符合要求，需要初始化")
        if not pg_ok:
            print("⚠ PostgreSQL 数据库表结构不符合要求（可选）")
        sys.exit(1)

if __name__ == '__main__':
    main()

