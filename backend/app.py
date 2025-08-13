from flask import Flask, request, jsonify, send_file, g
from flask_cors import CORS
import os
import requests
import csv
import io
from datetime import datetime, timedelta
import json
import sys
import logging
import base64
import time
from flask_socketio import SocketIO, emit
import asyncio
from typing import List, Dict
from contextlib import contextmanager
from auth import auth_bp, token_required  # 添加token_required的导入
import uuid
from database.db import get_db_cursor, init_db, connection_pool
from Config import get_account  # 修改为正确的大小写
from flask_jwt_extended import jwt_required, get_jwt_identity, JWTManager
import re
import zipfile
import shutil
from werkzeug.exceptions import HTTPException
import jwt
from auth import JWT_SECRET_KEY
import urllib.parse
from io import BytesIO
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

# 配置日志
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),  # 默认使用 INFO 级别
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 添加父目录到系统路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

app = Flask(__name__)

# 初始化数据库配置
init_db(app)

# JWT配置
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-secret-key')  # 在生产环境中必须设置环境变量
app.config['JWT_TOKEN_LOCATION'] = ['headers']
app.config['JWT_HEADER_NAME'] = 'Authorization'
app.config['JWT_HEADER_TYPE'] = 'Bearer'
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=12)
app.config['JWT_ERROR_MESSAGE_KEY'] = 'msg'
app.config['JWT_ALGORITHM'] = 'HS256'
app.config['JWT_DECODE_AUDIENCE'] = None
app.config['JWT_DECODE_ISSUER'] = None
app.config['JWT_DECODE_LEEWAY'] = 0
app.config['JWT_VERIFY_EXPIRATION'] = True
app.config['JWT_VERIFY_CLAIMS'] = ['exp', 'iat', 'nbf', 'sub']

# 初始化JWT
jwt = JWTManager(app)

# 打印所有注册的路由
def print_routes():
    logger.debug('=== 已注册的路由 ===')
    for rule in app.url_map.iter_rules():
        logger.debug('路由: %s, 方法: %s', rule.rule, rule.methods)

# 注册认证蓝图
app.register_blueprint(auth_bp)
logger.info("已注册认证蓝图")

# 配置 CORS
CORS(app, resources={
    r"/*": {
        "origins": [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://8.222.149.42",
            "http://8.222.149.42:3000",
            "http://172.27.116.141:3000"
        ],
        "methods": ["GET", "POST", "DELETE", "OPTIONS", "PUT", "PATCH"],
        "allow_headers": [
            "Content-Type", 
            "Authorization", 
            "Accept", 
            "Origin", 
            "X-Requested-With",
            "X-Environment",
            "X-API-Key"
        ],
        "expose_headers": [
            "Content-Type", 
            "Content-Disposition",
            "X-Environment",
            "X-API-Key"
        ],
        "supports_credentials": True,
        "max_age": 3600
    }
})

# 添加全局OPTIONS请求处理
@app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    logger.debug('=== 处理OPTIONS请求 ===')
    logger.debug('请求路径: %s', path)
    logger.debug('完整URL: %s', request.url)
    logger.debug('请求头: %s', dict(request.headers))
    
    response = jsonify({'status': 'ok'})
    # 根据环境设置 CORS 头
    if os.getenv('IS_LOCAL', 'false').lower() == 'true':
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
    else:
        response.headers.add('Access-Control-Allow-Origin', 'http://8.222.149.42')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    
    logger.debug('响应头: %s', dict(response.headers))
    return response

# 添加数据库测试路由
@app.route('/api/test-db', methods=['GET'])
def test_db_connection():
    """测试数据库连接"""
    logger.debug('=== 测试数据库连接 ===')
    try:
        with get_db_cursor() as cursor:
            # 添加连接信息日志
            logger.info(f"数据库连接信息：")
            logger.info(f"主机：{os.getenv('DB_HOST', 'localhost')}")
            logger.info(f"环境：{'本地' if os.getenv('IS_LOCAL', 'false').lower() == 'true' else '生产'}")
            logger.info(f"连接类型：{'Unix Socket' if os.getenv('DB_HOST', 'localhost') == 'localhost' else 'TCP/IP'}")
            
            # 测试用户表
            cursor.execute("SELECT COUNT(*) as count FROM users")
            user_count = cursor.fetchone()['count']
            while cursor.nextset():
                pass
                
            # 测试账户配置表
            cursor.execute("SELECT COUNT(*) as count FROM account_configs")
            config_count = cursor.fetchone()['count']
            while cursor.nextset():
                pass
                
            logger.debug('数据库连接测试成功')
            return jsonify({
                'status': 'success',
                'message': '数据库连接正常',
                'data': {
                    'users_count': user_count,
                    'configs_count': config_count,
                    'connection_info': {
                        'host': os.getenv('DB_HOST', 'localhost'),
                        'environment': '本地' if os.getenv('IS_LOCAL', 'false').lower() == 'true' else '生产',
                        'connection_type': 'Unix Socket' if os.getenv('DB_HOST', 'localhost') == 'localhost' else 'TCP/IP'
                    }
                }
            })
    except Exception as e:
        logger.error(f"数据库连接测试失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'数据库连接失败: {str(e)}'
        }), 500

# 初始化数据库
# init_db()  # 删除这行，因为前面已经有了 init_db(app)

# 初始化SocketIO
socketio = SocketIO(app, cors_allowed_origins="*", ping_timeout=60, ping_interval=25, logger=True, engineio_logger=True)

# 报表数据现在存储在数据库中

# 应用初始化标志
_app_initialized = False
_db_initialized = False

def test_db_connection():
    """测试数据库连接"""
    global _db_initialized
    if _db_initialized:
        return True
        
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT 1")
            logger.info("数据库连接测试成功")
            _db_initialized = True
            return True
    except Exception as e:
        logger.error(f"数据库连接测试失败: {str(e)}")
        return False

def init_database():
    """初始化数据库"""
    global _db_initialized
    if _db_initialized:
        return True
        
    try:
        with get_db_cursor() as cursor:
            # 创建数据库（如果不存在）
            cursor.execute("CREATE DATABASE IF NOT EXISTS appsflyer_rawdata")
            cursor.execute("USE appsflyer_rawdata")
            
            # 创建查询日志表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS query_logs (
                    id VARCHAR(100) PRIMARY KEY,
                    query_result_id VARCHAR(100) NOT NULL,
                    user_id VARCHAR(36) NOT NULL,
                    account_type VARCHAR(10) NOT NULL,
                    account_id VARCHAR(100) NOT NULL,
                    app_id VARCHAR(100) NOT NULL,
                    app_name VARCHAR(255),
                    data_type VARCHAR(50) NOT NULL,
                    from_date DATE NOT NULL,
                    to_date DATE NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    message TEXT,
                    api_response JSON,
                    error_details JSON,
                    row_count INT,
                    event_filter VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_user_id (user_id),
                    INDEX idx_query_result_id (query_result_id),
                    INDEX idx_account (account_type, account_id),
                    INDEX idx_created_at (created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """)
            
            # 检查reports表是否存在
            cursor.execute("SHOW TABLES LIKE 'reports'")
            reports_exists = cursor.fetchone() is not None
            
            if not reports_exists:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS reports (
                        id VARCHAR(50) PRIMARY KEY,
                        report_name VARCHAR(255) NOT NULL,
                        status ENUM('uploading', 'uploaded', 'processing', 'completed', 'failed') DEFAULT 'uploading',
                        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                        size BIGINT,
                        account_type VARCHAR(50),
                        account_id VARCHAR(100),
                        app_id VARCHAR(100),
                        app_name VARCHAR(255),
                        data_type VARCHAR(50),
                        date_range_start DATE,
                        date_range_end DATE,
                        record_count INT,
                        primary_attribution_count INT,
                        INDEX idx_status (status),
                        INDEX idx_create_time (create_time),
                        INDEX idx_app_id (app_id),
                        INDEX idx_account (account_type, account_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """)
            
            # 检查temp_files表是否存在
            cursor.execute("SHOW TABLES LIKE 'temp_files'")
            temp_files_exists = cursor.fetchone() is not None
            
            if not temp_files_exists:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS temp_files (
                        id VARCHAR(50) PRIMARY KEY,
                        report_id VARCHAR(50),
                        file_path VARCHAR(255) NOT NULL,
                        account_type VARCHAR(50),
                        account_id VARCHAR(100),
                        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE,
                        INDEX idx_report (report_id),
                        INDEX idx_account (account_type, account_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """)
            
            # 检查accounts表是否存在
            cursor.execute("SHOW TABLES LIKE 'accounts'")
            accounts_exists = cursor.fetchone() is not None
            
            if not accounts_exists:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS accounts (
                        id VARCHAR(100) PRIMARY KEY,
                        account_type VARCHAR(50) NOT NULL,
                        account_name VARCHAR(255) NOT NULL,
                        account_id VARCHAR(100) NOT NULL,
                        api_token VARCHAR(255),
                        app_id VARCHAR(100),
                        app_name VARCHAR(255),
                        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                        update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        INDEX idx_account_type (account_type),
                        INDEX idx_account_name (account_name),
                        INDEX idx_account_id (account_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """)
            
            logger.info("数据库表初始化成功")
            _db_initialized = True
            return True
    except Exception as e:
        logger.error(f"数据库初始化失败: {str(e)}")
        return False

def ensure_temp_dir():
    """确保临时目录存在"""
    temp_dir = 'temp'
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)
        logger.info(f"创建临时目录: {temp_dir}")

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMP_DIR = os.path.join(BASE_DIR, 'temp')

def init_app():
    """初始化应用"""
    global _app_initialized
    if _app_initialized:
        return True
    
    # 确保临时目录存在
    ensure_temp_dir()
    
    # 测试数据库连接
    if not test_db_connection():
        logger.error("数据库连接测试失败")
        return False
    
    # 初始化数据库表
    if not init_database():
        logger.error("数据库表初始化失败")
        return False
    
    logger.info("应用初始化成功")
    _app_initialized = True
    return True

@app.before_request
def before_request():
    """在每个请求之前初始化应用"""
    if not _app_initialized:
        if not init_app():
            return jsonify({
                'status': 'error',
                'message': '应用初始化失败'
            }), 500

@socketio.on('connect')
def handle_connect():
    """处理WebSocket连接"""
    try:
        logger.info('客户端已连接')
        # 发送连接成功响应
        emit('connect_response', {
            'status': 'success',
            'data': 'Connected',
            'timestamp': datetime.now().isoformat()
        })
        
        # 发送当前报表状态 - 从数据库获取
        try:
            with get_db_cursor() as cursor:
                cursor.execute("""
                    SELECT * FROM reports 
                    ORDER BY create_time DESC
                    LIMIT 50
                """)
                rows = cursor.fetchall()
                
                # 转换字段名为前端期望的格式
                reports = []
                for row in rows:
                    report = {
                        "id": row["id"],
                        "reportName": row["report_name"],
                        "status": row["status"],
                        "createTime": row["create_time"].isoformat() if row["create_time"] else None,
                        "size": row["size"],
                        "accountType": row["account_type"],
                        "accountId": row["account_id"],
                        "appId": row["app_id"],
                        "appName": row["app_name"],
                        "dataType": row["data_type"],
                        "dateRange": f"{row['date_range_start']} 至 {row['date_range_end']}" if row['date_range_start'] and row['date_range_end'] else "",
                        "recordCount": row["record_count"],
                        "primaryAttributionCount": row["primary_attribution_count"]
                    }
                    reports.append(report)
        except Exception as e:
            logger.error(f"获取报表列表失败: {str(e)}")
            reports = []
            
        emit('reports_sync', {
            'type': 'reports_sync',
            'status': 'success',
            'reports': reports,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        error_msg = f'WebSocket连接处理失败: {str(e)}'
        logger.error(error_msg)
        emit('connect_response', {
            'status': 'error',
            'error': error_msg,
            'timestamp': datetime.now().isoformat()
        })

@socketio.on('disconnect')
def handle_disconnect(reason=None):
    """处理WebSocket断开连接"""
    logger.info(f'Client disconnected: {reason}')

@socketio.on_error()
def handle_error(e):
    """处理WebSocket错误"""
    logger.error(f'WebSocket错误: {str(e)}')

# 报表数据现在直接从数据库获取，不再需要文件存储

@socketio.on('report_update')
def handle_report_update(data):
    """处理报表更新事件"""
    try:
        if not isinstance(data, dict):
            raise ValueError("无效的数据格式")
            
        logger.info(f'收到报表更新请求: {data}')
        
        # 验证必要字段
        required_fields = ['type', 'report']
        if not all(field in data for field in required_fields):
            raise ValueError("缺少必要字段")
            
        # 处理报表更新 - 现在直接从数据库获取
        report = data['report']
        
        # 广播更新
        socketio.emit('report_update', {
            "type": "report_update",
            "status": "success",
            "report": report,
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f'报表更新成功: {report.get("reportName")}')
    except Exception as e:
        error_msg = f'处理报表更新失败: {str(e)}'
        logger.error(error_msg)
        socketio.emit('report_update', {
            'type': 'report_update',
            'status': 'error',
            'error': error_msg,
            'timestamp': datetime.now().isoformat()
        })

@socketio.on('report_deleted')
def handle_report_deleted(data):
    """处理报表删除事件"""
    try:
        if not isinstance(data, dict):
            raise ValueError("无效的数据格式")
            
        logger.info(f'收到报表删除请求: {data}')
        
        # 验证必要字段
        if 'reportKey' not in data:
            raise ValueError("缺少报表ID")
            
        report_key = data['reportKey']
        
        # 从数据库删除
        try:
            with get_db_cursor() as cursor:
                cursor.execute("DELETE FROM reports WHERE id = %s", (report_key,))
                affected_rows = cursor.rowcount
                if affected_rows == 0:
                    logger.warning(f"数据库中未找到报表: {report_key}")
                else:
                    logger.info(f"成功从数据库删除报表: {report_key}")
        except Exception as e:
            logger.error(f"数据库删除失败: {str(e)}")
        
        # 广播删除事件
        socketio.emit('report_deleted', {
            'type': 'report_deleted',
            'status': 'success',
            'reportKey': report_key,
            'timestamp': datetime.now().isoformat()
        })
        
        logger.info(f'报表删除成功: {report_key}')
    except Exception as e:
        error_msg = f'处理报表删除失败: {str(e)}'
        logger.error(error_msg)
        socketio.emit('report_deleted', {
            'type': 'report_deleted',
            'status': 'error',
            'error': error_msg,
            'timestamp': datetime.now().isoformat()
        })

def get_account_reports(account_type, account_id):
    """获取指定账户的报表数据"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM reports 
                WHERE account_type = %s AND account_id = %s
                ORDER BY create_time DESC
                LIMIT 50
            """, (account_type, account_id))
            rows = cursor.fetchall()
            
            # 转换字段名为前端期望的格式
            reports = []
            for row in rows:
                report = {
                    "id": row["id"],
                    "reportName": row["report_name"],
                    "status": row["status"],
                    "createTime": row["create_time"].isoformat() if row["create_time"] else None,
                    "size": row["size"],
                    "accountType": row["account_type"],
                    "accountId": row["account_id"],
                    "appId": row["app_id"],
                    "appName": row["app_name"],
                    "dataType": row["data_type"],
                    "dateRange": f"{row['date_range_start']} 至 {row['date_range_end']}" if row['date_range_start'] and row['date_range_end'] else "",
                    "recordCount": row["record_count"],
                    "primaryAttributionCount": row["primary_attribution_count"]
                }
                reports.append(report)
            
            return reports
    except Exception as e:
        logger.error(f"获取账户报表失败: {str(e)}")
        return []

def ensure_account_temp_dir(account_type, account_id):
    """确保账户临时目录存在"""
    temp_dir = os.path.join('temp', f"{account_type}_{account_id}")
    # 确保使用绝对路径
    temp_dir = os.path.abspath(temp_dir)
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)
        logger.info(f"创建账户临时目录: {temp_dir}")
    return temp_dir

def cleanup_orphaned_files():
    """清理孤立的物理文件（没有对应数据库记录的文件）"""
    try:
        logger.info("开始清理孤立的物理文件")
        
        # 获取所有temp目录下的文件
        # 使用相对路径，指向backend/temp目录
        temp_dir = 'temp'
        if not os.path.exists(temp_dir):
            logger.info(f"temp目录不存在: {temp_dir}，跳过清理")
            return {
                'valid_files_count': 0,
                'total_files': 0,
                'deleted_files': 0,
                'retained_files': 0
            }
        
        # 第一步：获取数据库中有引用的文件列表
        valid_files = set()
        with get_db_cursor() as cursor:
            # 从query_logs表获取download_url
            cursor.execute("""
                SELECT download_url FROM query_logs 
                WHERE download_url IS NOT NULL AND download_url != ''
            """)
            query_results = cursor.fetchall()
            
            for row in query_results:
                download_url = row['download_url']
                if download_url:
                    # 从URL中提取文件名，正确处理/api/download/前缀
                    if download_url.startswith('/api/download/'):
                        filename = download_url.replace('/api/download/', '')
                    else:
                        filename = download_url.split('/')[-1]
                    valid_files.add(filename)
                    logger.info(f"query_logs有效文件: {filename}")
            
            # 从reports表获取download_url
            cursor.execute("""
                SELECT download_url FROM reports 
                WHERE download_url IS NOT NULL AND download_url != ''
            """)
            report_results = cursor.fetchall()
            
            for row in report_results:
                download_url = row['download_url']
                if download_url:
                    # 从URL中提取文件名，正确处理/api/download/前缀
                    if download_url.startswith('/api/download/'):
                        filename = download_url.replace('/api/download/', '')
                    else:
                        filename = download_url.split('/')[-1]
                    valid_files.add(filename)
                    logger.info(f"reports有效文件: {filename}")
        
        valid_files_count = len(valid_files)
        logger.info(f"数据库中有引用的文件数量: {valid_files_count}")
        
        # 第二步：遍历temp目录，删除无效文件
        cleaned_count = 0
        total_files = 0
        
        for root, dirs, files in os.walk(temp_dir):
            for file in files:
                if file.endswith('.csv'):
                    total_files += 1
                    file_path = os.path.join(root, file)
                    
                    # 检查文件是否在有效文件列表中
                    if file in valid_files:
                        logger.info(f"保留有效文件: {file}")
                    else:
                        # 文件不在有效列表中，删除
                        try:
                            os.remove(file_path)
                            logger.info(f"删除无效文件: {file}")
                            cleaned_count += 1
                        except Exception as e:
                            logger.error(f"删除文件失败 {file_path}: {str(e)}")
        
        retained_files = total_files - cleaned_count
        logger.info(f"文件清理完成，总文件数: {total_files}, 删除: {cleaned_count}, 保留: {retained_files}")
        
        return {
            'valid_files_count': valid_files_count,
            'total_files': total_files,
            'deleted_files': cleaned_count,
            'retained_files': retained_files
        }
        
    except Exception as e:
        logger.error(f"文件清理过程中发生错误: {str(e)}")
        raise e

def check_and_cleanup_file(query_log_id):
    """检查并清理文件（当Home和ReportManagement都没有引用时）"""
    try:
        with get_db_cursor() as cursor:
            # 检查query_logs表是否还有记录
            cursor.execute("""
                SELECT COUNT(*) as count FROM query_logs 
                WHERE id = %s OR query_result_id = %s
            """, (query_log_id, query_log_id))
            query_count = cursor.fetchone()['count']
            
            # 检查reports表是否还有记录
            cursor.execute("""
                SELECT COUNT(*) as count FROM reports 
                WHERE query_log_id = %s
            """, (query_log_id,))
            report_count = cursor.fetchone()['count']
            
            # 如果两个表都没有记录，说明文件可以安全删除
            if query_count == 0 and report_count == 0:
                # 获取文件路径
                cursor.execute("""
                    SELECT api_response FROM query_logs 
                    WHERE id = %s OR query_result_id = %s
                """, (query_log_id, query_log_id))
                result = cursor.fetchone()
                
                if result and result['api_response']:
                    api_response = json.loads(result['api_response'])
                    download_url = api_response.get('downloadUrl', '')
                    
                    if download_url:
                        filename = download_url.split('/')[-1]
                        file_path = os.path.join('temp', filename)
                        
                        if os.path.exists(file_path):
                            try:
                                os.remove(file_path)
                                logger.info(f"删除物理文件: {file_path}")
                                return True
                            except Exception as e:
                                logger.error(f"删除物理文件失败: {str(e)}")
                                return False
        
        return False
        
    except Exception as e:
        logger.error(f"检查文件清理时发生错误: {str(e)}")
        return False

@app.route('/api/reports', methods=['GET'])
def get_reports():
    try:
        # 获取查询参数
        account_ids = request.args.get('accountIds')
        account_types = request.args.get('accountTypes')
        manager = request.args.get('manager')  # 新增Manager筛选参数
        
        # 构建SQL查询
        base_query = """
            SELECT r.*, u.username 
            FROM reports r
            LEFT JOIN users u ON r.username = u.username
        """
        
        where_conditions = []
        query_params = []
        
        # 如果提供了账户筛选条件，添加WHERE子句
        if account_ids and account_types:
            account_id_list = account_ids.split(',')
            account_type_list = account_types.split(',')
            
            # 构建账户筛选条件 - 根据报表名称中的账户标识符进行筛选
            account_conditions = []
            for i, (acc_id, acc_type) in enumerate(zip(account_id_list, account_type_list)):
                # 根据账户类型构建不同的筛选条件
                if acc_type == 'PID':
                    # PID类型：匹配报表名称中第一个下划线前的内容
                    account_conditions.append("r.report_name LIKE %s")
                    query_params.append(f"{acc_id}_%")
                elif acc_type == 'PRT':
                    # PRT类型：匹配报表名称中第一个下划线前的内容
                    account_conditions.append("r.report_name LIKE %s")
                    query_params.append(f"{acc_id}_%")
                else:
                    # 默认情况：匹配报表名称中第一个下划线前的内容
                    account_conditions.append("r.report_name LIKE %s")
                    query_params.append(f"{acc_id}_%")
            
            if account_conditions:
                where_conditions.append(f"({' OR '.join(account_conditions)})")
        
        # 如果提供了Manager筛选条件，添加WHERE子句
        if manager:
            where_conditions.append("u.username = %s")
            query_params.append(manager)
            logger.info(f"添加Manager筛选条件: {manager}")
        
        # 组合查询
        if where_conditions:
            sql_query = base_query + " WHERE " + " AND ".join(where_conditions)
        else:
            sql_query = base_query
            
        sql_query += " ORDER BY r.create_time DESC LIMIT 100"
        
        logger.info(f"执行SQL查询: {sql_query}")
        logger.info(f"查询参数: {query_params}")
        
        # 执行查询
        with get_db_cursor() as cursor:
            cursor.execute(sql_query, query_params)
            rows = cursor.fetchall()
            
            # 转换字段名为前端期望的格式
            reports = []
            for row in rows:
                report = {
                    "id": row["id"],
                    "reportName": row["report_name"],
                    "status": row["status"],
                    "createTime": row["create_time"].isoformat() if row["create_time"] else None,
                    "size": row["size"],
                    "accountType": row["account_type"],
                    "accountId": row["account_id"],
                    "appId": row["app_id"],
                    "appName": row["app_name"],
                    "dataType": row["data_type"],
                    "dateRange": f"{row['date_range_start']} 至 {row['date_range_end']}" if row['date_range_start'] and row['date_range_end'] else "",
                    "recordCount": row["record_count"],
                    "primaryAttributionCount": row["primary_attribution_count"],
                    "manager": row["username"]  # 添加上传者信息
                }
                reports.append(report)
            
            logger.info(f"查询到 {len(reports)} 条报表记录")
            return jsonify(reports)
    except Exception as e:
        logger.error(f"获取报表列表失败: {str(e)}")
        return jsonify({"error": str(e)})

@app.route('/api/import-data', methods=['POST'])
@token_required
def import_data(current_user):
    try:
        data = request.get_json()
        logger.info(f"收到导入请求: {data.get('reportName')}")
        logger.info(f"导入数据字段: {list(data.keys())}")
        
        # 验证账户信息
        account_type = data.get('accountType')
        account_id = data.get('accountId')
        if not account_type or not account_id:
            return jsonify({"error": "缺少账户信息"}), 400
            
        # 确保账户临时目录存在
        temp_dir = ensure_account_temp_dir(account_type, account_id)
        
        # 处理日期范围分割（支持中英文格式）
        date_range = data["dateRange"]
        if " 至 " in date_range:
            start_date, end_date = date_range.split(" 至 ")
        elif " TO " in date_range:
            start_date, end_date = date_range.split(" TO ")
        else:
            # 如果都没有找到分隔符，尝试其他可能的分隔符
            import re
            parts = re.split(r'\s+TO\s+|\s+至\s+', date_range)
            if len(parts) >= 2:
                start_date, end_date = parts[0], parts[1]
            else:
                start_date, end_date = date_range, date_range
        
        # 获取用户名
        username = current_user
        try:
            with get_db_cursor() as cursor:
                cursor.execute("SELECT username FROM users WHERE id = %s", (current_user,))
                result = cursor.fetchone()
                if result and result['username']:
                    username = result['username']
        except Exception as e:
            logger.warning(f"获取用户名失败: {str(e)}")
        
        # 获取App Name和download_url（从query_logs表获取）
        app_name = data.get("appName", "")  # 备选项：从请求数据获取
        download_url = None
        if data.get("queryLogId"):
            try:
                with get_db_cursor() as cursor:
                    cursor.execute("SELECT app_name, download_url FROM query_logs WHERE id = %s", (data["queryLogId"],))
                    result = cursor.fetchone()
                    if result:
                        if result['app_name']:
                            app_name = result['app_name']
                            logger.debug(f"从query_logs获取到App Name: {app_name}")
                        if result['download_url']:
                            download_url = result['download_url']
                            logger.debug(f"从query_logs获取到download_url: {download_url}")
            except Exception as e:
                logger.warning(f"从query_logs查询数据失败: {str(e)}")
        
        # 创建新报表记录
        new_report = {
            "key": data["key"],
            "report_name": data["reportName"],
            "status": "completed",  # 直接设置为completed状态
            "create_time": datetime.now(),
            "size": data["size"],
            "account_type": account_type,
            "account_id": account_id,
            "app_id": data["appId"],
            "app_name": app_name,  # 使用查询到的App Name
            "data_type": data["dataType"],
            "date_range_start": start_date.strip(),
            "date_range_end": end_date.strip(),
            "record_count": data.get("recordCount", 0),
            "primary_attribution_count": data.get("primaryAttributionCount", 0),
            "query_log_id": data.get("queryLogId", ""),  # 添加query_log_id字段
            "username": username,  # 使用查询到的用户名
            "download_url": download_url  # 添加download_url字段
        }
        
        # 保存到数据库
        with get_db_cursor() as cursor:
            cursor.execute("""
                INSERT INTO reports (
                    id, report_name, status, create_time, size, 
                    account_type, account_id, app_id, app_name, 
                    data_type, date_range_start, date_range_end,
                    record_count, primary_attribution_count, query_log_id, username, download_url
                ) VALUES (
                    %(key)s, %(report_name)s, %(status)s, %(create_time)s, %(size)s,
                    %(account_type)s, %(account_id)s, %(app_id)s, %(app_name)s,
                    %(data_type)s, %(date_range_start)s, %(date_range_end)s,
                    %(record_count)s, %(primary_attribution_count)s, %(query_log_id)s, %(username)s, %(download_url)s
                )
            """, new_report)
            
        # 保存数据文件
        file_path = os.path.join(temp_dir, f"{data['reportName']}.csv")
        # 确保使用绝对路径
        file_path = os.path.abspath(file_path)
        logger.info(f"保存文件到: {file_path}")
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(data['data'])
            
        # 记录临时文件
        with get_db_cursor() as cursor:
            cursor.execute("""
                INSERT INTO temp_files (
                    id, report_id, file_path, account_type, account_id
                ) VALUES (
                    %s, %s, %s, %s, %s
                )
            """, (str(uuid.uuid4()), data["key"], file_path, account_type, account_id))
        
        # 更新查询日志状态（如果存在）
        query_log_updated = False
        try:
            with get_db_cursor() as cursor:
                cursor.execute("""
                    UPDATE query_logs 
                    SET status = 'imported', updated_at = CURRENT_TIMESTAMP
                    WHERE query_result_id = %s
                """, (data["key"],))
                if cursor.rowcount > 0:
                    query_log_updated = True
        except Exception as e:
            logger.warning(f"更新查询日志失败: {str(e)}")
        
        # 获取报表列表（用于前端更新）
        reports_list = []
        try:
            with get_db_cursor() as cursor:
                cursor.execute("""
                    SELECT * FROM reports 
                    WHERE account_type = %s AND account_id = %s
                    ORDER BY create_time DESC
                    LIMIT 10
                """, (account_type, account_id))
                rows = cursor.fetchall()
                reports_list = [
                    {
                        "id": row["id"],
                        "reportName": row["report_name"],
                        "status": row["status"],
                        "createTime": row["create_time"].isoformat() if row["create_time"] else None,
                        "size": row["size"],
                        "accountType": row["account_type"],
                        "accountId": row["account_id"],
                        "appId": row["app_id"],
                        "appName": row["app_name"],
                        "dataType": row["data_type"],
                        "dateRange": f"{row['date_range_start']} 至 {row['date_range_end']}" if row['date_range_start'] and row['date_range_end'] else "",
                        "recordCount": row["record_count"],
                        "primaryAttributionCount": row["primary_attribution_count"]
                    }
                    for row in rows
                ]
        except Exception as e:
            logger.warning(f"获取报表列表失败: {str(e)}")
        
        # 广播更新 - 使用前端期望的字段格式
        report_update_data = {
            "type": "report_update",
            "status": "success",
            "report": {
                "id": new_report["key"],
                "reportName": new_report["report_name"],
                "status": "completed",  # 更新为completed状态
                "createTime": new_report["create_time"].isoformat() if new_report["create_time"] else None,
                "size": new_report["size"],
                "accountType": new_report["account_type"],
                "accountId": new_report["account_id"],
                "appId": new_report["app_id"],
                "appName": new_report["app_name"],
                "dataType": new_report["data_type"],
                "dateRange": f"{new_report['date_range_start']} 至 {new_report['date_range_end']}" if new_report['date_range_start'] and new_report['date_range_end'] else "",
                "recordCount": new_report["record_count"],
                "primaryAttributionCount": new_report["primary_attribution_count"],
                "manager": username  # 使用已经查询到的username
            },
            "timestamp": datetime.now().isoformat()
        }
        
        logger.info(f"WebSocket广播报表更新: {report_update_data}")
        socketio.emit('report_update', report_update_data)
        
        # 返回统一的响应，包含所有操作结果
        response_data = {
            "success": True,
            "message": "导入成功",
            "operations": {
                "import_data": {
                    "status": "success",
                    "message": "数据导入成功"
                },
                "query_log_update": {
                    "status": "success" if query_log_updated else "skipped",
                    "message": "查询日志更新成功" if query_log_updated else "查询日志不存在，跳过更新"
                },
                "reports_list": {
                    "status": "success",
                    "count": len(reports_list),
                    "data": reports_list
                }
            },
            "report": {
                "key": new_report["key"],
                "reportName": new_report["report_name"],
                "status": new_report["status"],
                "size": new_report["size"],
                "recordCount": new_report["record_count"]
            }
        }
        
        return jsonify(response_data)
    except Exception as e:
        logger.error(f"导入数据失败: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports/<report_key>/download-url', methods=['GET'])
def get_report_download_url(report_key):
    """获取报表的下载URL - 直接构建下载URL"""
    try:
        # 从请求中获取账户信息
        account_type = request.args.get('accountType')
        account_id = request.args.get('accountId')
        
        logger.info(f"=== 开始获取报表下载URL ===")
        logger.info(f"report_key: {report_key}")
        logger.info(f"account_type: {account_type}")
        logger.info(f"account_id: {account_id}")
        
        if not account_type or not account_id:
            logger.error("缺少账户信息")
            return jsonify({"error": "缺少账户信息"}), 400
            
        # 从数据库获取报表信息（公开访问，不检查用户权限）
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM reports 
                WHERE id = %s AND account_type = %s AND account_id = %s
            """, (report_key, account_type, account_id))
            result = cursor.fetchone()
            
            if not result:
                logger.warning(f"报表不存在: {report_key}, account_type={account_type}, account_id={account_id}")
                return jsonify({
                    'success': False,
                    'message': '未找到对应的文件'
                }), 404
            
            logger.info(f"找到报表: {result}")
        
        # 直接构建下载URL，使用报表中存储的信息
        from_date = result['date_range_start']
        to_date = result['date_range_end']
        app_id = result['app_id']
        data_type = result['data_type']
        
        logger.info(f"构建下载URL参数:")
        logger.info(f"  account_name: {account_id}")
        logger.info(f"  account_type: {account_type}")
        logger.info(f"  data_type: {data_type}")
        logger.info(f"  from_date: {from_date}")
        logger.info(f"  to_date: {to_date}")
        logger.info(f"  app_id: {app_id}")
        
        # 构建文件名（使用与Home页面相同的逻辑）
        # 处理数据类型格式
        is_event_type = data_type in ['In-App-Event-Postbacks', 'In-App-Event-Non-Organic', 'Retargeting-In-App-Event-Postbacks', 'Retargeting-In-App-Event-Non-Organic']
        
        if is_event_type:
            # 从数据库中获取event_filter信息
            event_filter = result.get('event_filter', '')
            if event_filter and event_filter.strip():
                data_type_with_filter = f"{data_type}(Filter-On)"
            else:
                data_type_with_filter = f"{data_type}(Filter-Off)"
        else:
            data_type_with_filter = data_type
        
        # 构建基础文件名 - 使用account_id（应该与account_name一致）
        base_name = f"RawData({account_id})"
        
        # 由于我们不知道确切的timestamp，我们需要在temp目录中搜索匹配的文件
        temp_dir = 'temp'
        if not os.path.exists(temp_dir):
            logger.error(f"temp目录不存在: {temp_dir}")
            return jsonify({
                'success': False,
                'message': 'temp目录不存在'
            }), 404
        
        # 构建文件名模式（不包含timestamp）
        if from_date != to_date:
            filename_pattern = f"{base_name}_{app_id}_{data_type_with_filter}_{from_date}——{to_date}_*.csv"
        else:
            filename_pattern = f"{base_name}_{app_id}_{data_type_with_filter}_{from_date}_*.csv"
        
        logger.info(f"搜索文件名模式: {filename_pattern}")
        
        # 在temp目录中搜索匹配的文件
        import glob
        
        # 严格匹配：只使用精确的文件名模式，不使用宽松搜索
        matching_files = glob.glob(os.path.join(temp_dir, filename_pattern))
        logger.info(f"严格匹配模式 '{filename_pattern}' 的文件: {matching_files}")
        
        # 列出temp目录中的所有文件用于调试
        all_files = glob.glob(os.path.join(temp_dir, "*.csv"))
        logger.info(f"temp目录中的所有CSV文件: {all_files}")
        
        if matching_files:
            # 找到匹配的文件，使用第一个（最新的）
            actual_filename = os.path.basename(matching_files[0])
            download_url = f'/api/download/{actual_filename}'
            logger.info(f"找到匹配文件: {actual_filename}")
            logger.info(f"构建的下载URL: {download_url}")
            
            return jsonify({
                'success': True,
                'downloadUrl': download_url,
                'message': '获取下载URL成功'
            })
        else:
            # 如果严格匹配没找到，记录详细信息
            logger.error(f"未找到严格匹配的文件")
            logger.error(f"搜索模式: {filename_pattern}")
            logger.error(f"搜索参数: account_id={account_id}, app_id={app_id}, data_type={data_type}, from_date={from_date}, to_date={to_date}")
            
            # 列出temp目录中的所有文件用于调试
            all_files = glob.glob(os.path.join(temp_dir, "*.csv"))
            logger.error(f"temp目录中的所有CSV文件: {all_files}")
            
            return jsonify({
                'success': False,
                'message': '未找到对应的文件'
            }), 404
            
    except Exception as e:
        logger.error(f"获取下载URL失败: {str(e)}", exc_info=True)
        return jsonify({
            'success': False,
            'message': f'获取下载URL失败: {str(e)}'
        }), 500

@app.route('/api/reports/<report_key>', methods=['DELETE'])
def delete_report(report_key):
    try:
        # 从请求中获取账户信息
        account_type = request.args.get('accountType')
        account_id = request.args.get('accountId')
        
        if not account_type or not account_id:
            return jsonify({"error": "缺少账户信息"}), 400
            
        logger.info(f"开始删除报表: {report_key}")
        
        # 从数据库删除报表
        with get_db_cursor() as cursor:
            # 先检查报表是否存在并获取文件路径和query_log_id
            cursor.execute("""
                SELECT r.id, r.report_name, r.query_log_id, t.file_path
                FROM reports r
                LEFT JOIN temp_files t ON r.id = t.report_id
                WHERE r.id = %s AND r.account_type = %s AND r.account_id = %s
            """, (report_key, account_type, account_id))
            result = cursor.fetchone()
            
            if not result:
                return jsonify({
                    'success': False,
                    'message': '报表不存在'
                }), 404
            
            query_log_id = result['query_log_id']
            
            # 删除报表记录
            cursor.execute("DELETE FROM reports WHERE id = %s", (report_key,))
            logger.info(f"已删除报表记录: {report_key}")
            
            # 检查是否需要清理物理文件
            if query_log_id:
                # 检查Home页面是否还有对应的记录
                cursor.execute("""
                    SELECT COUNT(*) as count FROM query_logs 
                    WHERE id = %s OR query_result_id = %s
                """, (query_log_id, query_log_id))
                home_count = cursor.fetchone()['count']
                
                # 检查ReportManagement是否还有对应的记录
                cursor.execute("""
                    SELECT COUNT(*) as count FROM reports 
                    WHERE query_log_id = %s
                """, (query_log_id,))
                report_count = cursor.fetchone()['count']
                
                # 如果两个表都没有记录了，清理物理文件
                if home_count == 0 and report_count == 0:
                    logger.info(f"Home和ReportManagement都没有引用，开始清理物理文件: {query_log_id}")
                    check_and_cleanup_file(query_log_id)
        
        # 广播删除事件
        socketio.emit('report_deleted', {
            "type": "report_deleted",
            "reportKey": report_key,
            "timestamp": datetime.now().isoformat()
        })
        
        logger.info(f"删除报表完成: {report_key}")
        return jsonify({
            'success': True,
            'message': '删除成功'
        })
    except Exception as e:
        logger.error(f"删除报表失败: {str(e)}")
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500



def decode_token(encoded_token):
    try:
        # 检查token格式
        if not encoded_token or not isinstance(encoded_token, str):
            logger.warning('无效的token格式')
            return encoded_token
            
        # 如果是JWT格式（以eyJ开头），直接返回
        if encoded_token.startswith('eyJ'):
            logger.info('使用JWT格式token')
            return encoded_token
            
        # 尝试解码base64
        try:
            # 检查是否是有效的base64字符串
            if len(encoded_token) % 4 == 0:
                decoded_token = base64.b64decode(encoded_token).decode('utf-8')
                logger.info(f'Token解码成功，长度: {len(decoded_token)}')
                return decoded_token
            else:
                logger.info('Token不是有效的base64格式，使用原始token')
                return encoded_token
        except Exception as e:
            logger.info(f'Base64解码失败，使用原始token: {str(e)}')
            return encoded_token
    except Exception as e:
        logger.error(f'Token处理失败: {str(e)}')
        return encoded_token

def fetch_data(account_name, account_type, data_type, from_date, to_date, app_id, api_token, event_filter=None, media_source='', mode='normal'):
    try:
        logger.info(f"开始获取数据: account_name={account_name}, data_type={data_type}, app_id={app_id}")
        
        # 验证API Token
        if not api_token or len(api_token.strip()) == 0:
            logger.error("API Token为空")
            return {
                'status': 'error',
                'message': 'API Token不能为空',
                'details': {
                    'error_type': 'authentication',
                    'error_code': 'empty_token'
                }
            }

        # 解码Token
        decoded_token = decode_token(api_token)
        
        # 记录Token信息（不记录完整Token）
        token_length = len(decoded_token)
        token_prefix = decoded_token[:10] if token_length > 10 else decoded_token
        logger.info(f'Token长度: {token_length}, 前缀: {token_prefix}...')

        # 设置请求头
        headers = {
            'accept': 'application/json',
            'Authorization': f'Bearer {decoded_token}'
        }

        # 构建API请求参数
        if mode == 'aggregate':
            # Aggregate模式 - 只支持PRT账户，使用简化的参数
            params = {
                'from': from_date,
                'to': to_date
            }
        else:
            # Normal模式
            if account_type == 'PID':
                params = {
                    'from': from_date,
                    'to': to_date,
                    'media_source': 'standard',
                    'category': 'standard',
                    'install_type': 'organic',
                    'revenue': 'true',
                    'limit': '200000'
                }
                # 如果是事件类型且有事件过滤，添加事件名称参数
                if (data_type == 'In-App-Event-Postbacks' or data_type == 'Retargeting-In-App-Event-Postbacks') and event_filter and event_filter.strip():
                    params['event_name'] = event_filter.strip()
            elif account_type == 'PRT':
                params = {
                    'from': from_date,
                    'to': to_date,
                    'limit': '200000'
                }
                # 只有不是"All Media Source"时才加media_source
                if media_source and media_source != 'All Media Source':
                    params['media_source'] = media_source
                # 如果是事件类型且有事件过滤，添加事件名称参数
                if (data_type == 'In-App-Event-Non-Organic' or data_type == 'Retargeting-In-App-Event-Non-Organic') and event_filter and event_filter.strip():
                    params['event_name'] = event_filter.strip()
            else:
                raise ValueError(f'不支持的账户类型: {account_type}')

        # 处理APP ID：如果是纯数字，添加'id'前缀
        formatted_app_id = f"id{app_id}" if app_id.isdigit() else app_id
        logger.info(f'格式化后的APP ID: {formatted_app_id}')

        # 根据账户类型和数据类型选择API URL
        if mode == 'aggregate':
            # Aggregate模式 - 只支持PRT账户
            if account_type != 'PRT':
                raise ValueError(f'Aggregate模式只支持PRT账户，当前账户类型: {account_type}')
            
            # 处理带"-Aggregate"后缀的数据类型
            if data_type in ['daily', 'Daily-Aggregate']:
                url = f"https://hq1.appsflyer.com/api/agg-data/export/app/{formatted_app_id}/daily_report/v5"
            elif data_type in ['partner_daily', 'Partner-Daily-Aggregate']:
                url = f"https://hq1.appsflyer.com/api/agg-data/export/app/{formatted_app_id}/partners_by_date_report/v5"
            elif data_type in ['geo_daily', 'GEO-Daily-Aggregate']:
                url = f"https://hq1.appsflyer.com/api/agg-data/export/app/{formatted_app_id}/geo_by_date_report/v5"
            else:
                raise ValueError(f'Aggregate模式不支持的数据类型: {data_type}')
        else:
            # Normal模式
            if account_type == 'PID':
                if data_type == 'In-App-Event-Postbacks':
                    url = f"https://hq1.appsflyer.com/api/raw-data/export/app/{formatted_app_id}/in-app-events-postbacks/v5"
                elif data_type == 'Install-Postbacks':
                    url = f"https://hq1.appsflyer.com/api/raw-data/export/app/{formatted_app_id}/postbacks/v5"
                elif data_type == 'Retargeting-In-App-Event-Postbacks':
                    url = f"https://hq1.appsflyer.com/api/raw-data/export/app/{formatted_app_id}/retarget_in_app_events_postbacks/v5"
                elif data_type == 'Retargeting-Install-Postbacks':
                    url = f"https://hq1.appsflyer.com/api/raw-data/export/app/{formatted_app_id}/retarget_install_postbacks/v5"
                else:
                    raise ValueError(f'PID账户不支持的数据类型: {data_type}')
            elif account_type == 'PRT':
                if data_type == 'In-App-Event-Non-Organic':
                    url = f"https://hq1.appsflyer.com/api/raw-data/export/app/{formatted_app_id}/in_app_events_report/v5"
                elif data_type == 'Install-Non-Organic':
                    url = f"https://hq1.appsflyer.com/api/raw-data/export/app/{formatted_app_id}/installs_report/v5"
                elif data_type == 'Retargeting-In-App-Event-Non-Organic':
                    url = f"https://hq1.appsflyer.com/api/raw-data/export/app/{formatted_app_id}/in-app-events-retarget/v5"
                elif data_type == 'Retargeting-Install-Non-Organic':
                    url = f"https://hq1.appsflyer.com/api/raw-data/export/app/{formatted_app_id}/installs-retarget/v5"
                else:
                    raise ValueError(f'PRT账户不支持的数据类型: {data_type}')
            else:
                raise ValueError(f'不支持的账户类型: {account_type}')

        logger.info(f'发送API请求: {url}')
        logger.info(f'请求参数: {json.dumps(params, ensure_ascii=False)}')
        logger.info(f'请求头: {json.dumps({k: v for k, v in headers.items() if k != "Authorization"}, ensure_ascii=False)}')
        
        # 发送API请求
        response = requests.get(url, params=params, headers=headers)
        logger.info(f'AppsFlyer API 响应状态码: {response.status_code}')
        logger.info(f'AppsFlyer API 响应体: {response.text}')
        
        # 添加更详细的调试信息
        logger.info(f'请求的日期范围: {from_date} 到 {to_date}')
        logger.info(f'请求的应用ID: {app_id} (格式化后: {formatted_app_id})')
        logger.info(f'请求的数据类型: {data_type}')
        logger.info(f'请求的账户类型: {account_type}')
        logger.info(f'请求的模式: {mode}')
        

        
        if response.status_code != 200:
            error_details = {
                'status': response.status_code,
                'statusText': response.reason,
                'data': response.text,
                'config': {
                    'url': url,
                    'params': params,
                    'headers': {k: v for k, v in headers.items() if k != 'Authorization'}
                }
            }
            
            # 处理416错误（范围无法满足）
            if response.status_code == 416:
                logger.error('AppsFlyer返回416错误：范围无法满足')
                try:
                    error_data = json.loads(response.text)
                    error_message = error_data.get('data', response.text)
                except json.JSONDecodeError:
                    error_message = response.text
                
                return {
                    'status': 'error',
                    'message': '数据范围超出可用范围',
                    'details': {
                        'error_type': 'range_error',
                        'error_code': '416',
                        'error_message': error_message,
                        'config': error_details['config']
                    }
                }
            
            # 处理404错误（无授权关系）
            if response.status_code == 404:
                logger.error('无授权关系')
                return {
                    'status': 'error',
                    'message': '无授权关系',
                    'details': {
                        'error_type': 'authorization',
                        'error_code': '404',
                        'error_message': '无授权关系',
                        'config': error_details['config']
                    }
                }
            
            # 处理400错误
            if response.status_code == 400:
                try:
                    # 尝试解析响应文本
                    response_text = response.text
                    logger.error(f'API返回400错误，原始响应: {response_text}')
                    
                    # 尝试解析JSON响应
                    try:
                        error_data = json.loads(response_text)
                        error_message = error_data.get('data', '')
                    except json.JSONDecodeError:
                        error_message = response_text
                    
                    logger.error(f'解析后的错误消息: {error_message}')
                    
                    # 检查是否是请求上限错误
                    if 'maximum number' in error_message.lower():
                        error_response = {
                            'status': 'error',
                            'message': '已达到今日请求上限',
                            'details': {
                                'error_type': 'api_error',
                                'error_code': '400',
                                'error_message': error_message,
                                'config': error_details['config'],
                                'log': {
                                    'account_type': account_type,
                                    'account_id': account_name,
                                    'app_id': app_id,
                                    'data_type': data_type,
                                    'from_date': from_date,
                                    'to_date': to_date,
                                    'status': 'failed',
                                    'message': '已达到今日请求上限'
                                }
                            }
                        }
                        logger.error(f"请求上限错误: {json.dumps(error_response, ensure_ascii=False)}")
                        return error_response
                    
                    # 从错误消息中提取天数限制
                    days_match = re.search(r'limited to (\d+) days', error_message)
                    if days_match:
                        days_limit = days_match.group(1)
                        error_response = {
                            'status': 'error',
                            'message': '时间范围限制',
                            'details': {
                                'error_type': 'api_error',
                                'error_code': '400',
                                'error_message': f'数据限制{days_limit}天',
                                'config': error_details['config'],
                                'log': {
                                    'account_type': account_type,
                                    'account_id': account_name,
                                    'app_id': app_id,
                                    'data_type': data_type,
                                    'from_date': from_date,
                                    'to_date': to_date,
                                    'status': 'failed',
                                    'message': f'数据限制{days_limit}天'
                                }
                            }
                        }
                        logger.error(f"时间范围限制错误: {json.dumps(error_response, ensure_ascii=False)}")
                        return error_response
                    else:
                        error_response = {
                            'status': 'error',
                            'message': '时间范围限制',
                            'details': {
                                'error_type': 'api_error',
                                'error_code': '400',
                                'error_message': error_message,
                                'config': error_details['config'],
                                'log': {
                                    'account_type': account_type,
                                    'account_id': account_name,
                                    'app_id': app_id,
                                    'data_type': data_type,
                                    'from_date': from_date,
                                    'to_date': to_date,
                                    'status': 'failed',
                                    'message': error_message
                                }
                            }
                        }
                        logger.error(f"API错误: {json.dumps(error_response, ensure_ascii=False)}")
                        return error_response
                except Exception as e:
                    logger.error(f'处理400错误时发生异常: {str(e)}')
                    return {
                        'status': 'error',
                        'message': '时间范围限制',
                        'details': {
                            'error_type': 'api_error',
                            'error_code': '400',
                            'error_message': '无法解析API错误响应',
                            'config': error_details['config']
                        }
                    }
            
            # 处理其他非200状态码错误
            # 尝试解析错误响应
            try:
                error_data = json.loads(response.text)
                error_message = error_data.get('data', response.text)
            except json.JSONDecodeError:
                error_message = response.text
            
            # 检查是否是权限相关的错误
            response_text = response.text.lower()
            if any(keyword in response_text for keyword in ['unauthorized', 'forbidden', 'access denied', 'permission']):
                logger.error(f'权限错误: {error_message}')
                return {
                    'status': 'error',
                    'message': '无访问权限',
                    'details': {
                        'error_type': 'permission_error',
                        'error_code': str(response.status_code),
                        'error_message': error_message,
                        'config': error_details['config']
                    }
                }
            
            # 处理认证错误
            if response.status_code == 401:
                try:
                    error_data = json.loads(response.text)
                    error_message = error_data.get('error', '未知认证错误')
                    logger.error(f'认证错误: {error_message}')
                    logger.error(f'Token信息: 长度={token_length}, 前缀={token_prefix}...')
                    return {
                        'status': 'error',
                        'message': f'认证错误: {error_message}',
                        'details': {
                            'error_type': 'authentication',
                            'error_code': 'invalid_token',
                            'error_message': error_message,
                            'token_info': {
                                'length': token_length,
                                'prefix': token_prefix
                            },
                            'config': error_details['config']
                        }
                    }
                except json.JSONDecodeError:
                    logger.error('无法解析错误响应')
                    return {
                        'status': 'error',
                        'message': '认证错误',
                        'details': {
                            'error_type': 'authentication',
                            'error_code': 'invalid_token',
                            'error_message': '认证错误',
                            'config': error_details['config']
                        }
                    }
            
            # 处理其他错误
            logger.error(f'API请求失败: {response.status_code}')
            return {
                'status': 'error',
                'message': f'API请求失败: {response.status_code}',
                'details': error_details
            }

        # 保存响应数据到临时文件
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # 构建新的文件命名逻辑
        # 1. 前缀改为 RawData
        # 2. 添加账户信息 (account_name)
        # 3. 对事件类型添加过滤标识
        base_name = f"RawData({account_name})"
        
        # 判断是否为事件类型数据
        is_event_type = data_type in ['In-App-Event-Postbacks', 'In-App-Event-Non-Organic', 'Retargeting-In-App-Event-Postbacks', 'Retargeting-In-App-Event-Non-Organic']
        
        # 为事件类型添加过滤标识
        if is_event_type:
            if event_filter and event_filter.strip():
                data_type_with_filter = f"{data_type}(Filter-On)"
            else:
                data_type_with_filter = f"{data_type}(Filter-Off)"
        else:
            data_type_with_filter = data_type
        
        # 构建完整文件名
        if from_date != to_date:
            filename = f"{base_name}_{app_id}_{data_type_with_filter}_{from_date}——{to_date}_{timestamp}.csv"
        else:
            filename = f"{base_name}_{app_id}_{data_type_with_filter}_{from_date}_{timestamp}.csv"
        
        filepath = os.path.join('temp', filename)
        
        # 确保temp目录存在
        os.makedirs('temp', exist_ok=True)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(response.text)
        
        logger.info(f'数据已保存到文件: {filepath}')

        # 仅对事件类型数据统计 Is Primary Attribution
        primary_attribution_count = 0
        event_types = [
            'In-App-Event-Postbacks', 'Retargeting-In-App-Event-Postbacks',
            'In-App-Event-Non-Organic', 'Retargeting-In-App-Event-Non-Organic'
        ]
        
        if data_type in event_types:
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    # 读取CSV文件的第一行（标题行）
                    header_line = f.readline().strip()
                    csv_headers = header_line.split(',')
                    # 查找Is Primary Attribution列的索引，宽松匹配
                    primary_attribution_index = None
                    for i, header in enumerate(csv_headers):
                        normalized = header.replace(' ', '').replace('_', '').lower()
                        if normalized == 'isprimaryattribution':
                            primary_attribution_index = i
                            break
                    if primary_attribution_index is not None:
                        # 读取每一行数据并统计
                        for line in f:
                            values = [v.strip() for v in line.strip().split(',')]
                            if len(values) < len(csv_headers):
                                values += [''] * (len(csv_headers) - len(values))
                            if len(values) > primary_attribution_index:
                                logger.info(f"primary attribution values: {values}")
                                if values[primary_attribution_index].lower() == 'true':
                                    primary_attribution_count += 1
            except Exception as e:
                logger.error(f"统计Primary Attribution数量失败: {str(e)}")
        
        # 统计 AppsFlyer ID 去重数量（升级为csv.reader处理）
        afid_deduplication_count = 0
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                csv_headers = next(reader)
                afid_index = None
                for i, header in enumerate(csv_headers):
                    if header.lower().replace('_', '').replace(' ', '') == 'appsflyerid':
                        afid_index = i
                        break
                if afid_index is not None:
                    afids = set()
                    for row in reader:
                        if len(row) > afid_index:
                            afid = row[afid_index].strip().replace('\r','').replace('\n','')
                            if afid:
                                afids.add(afid)
                    logger.info(f"去重AppsFlyer ID统计: {afids}")
                    afid_deduplication_count = len(afids)
        except Exception as e:
            logger.error(f"统计AppsFlyer ID去重数量失败: {str(e)}")

        # 从数据库中获取 app_name
        app_name = None
        try:
            with get_db_cursor() as cursor:
                cursor.execute("""
                    SELECT app_name FROM accounts 
                    WHERE account_type = %s AND account_id = %s AND app_id = %s
                    LIMIT 1
                """, (account_type, account_name, app_id))
                result = cursor.fetchone()
                if result:
                    app_name = result['app_name']
        except Exception as e:
            logger.error(f"从数据库获取app_name失败: {str(e)}")

        # 如果数据库中没有找到 app_name，从文件中读取
        if not app_name:
            try:
                # 读取CSV文件的第一行（标题行）
                with open(filepath, 'r', encoding='utf-8') as f:
                    header_line = f.readline().strip()
                    # 查找 app_name 列
                    csv_headers = [h.strip() for h in header_line.split(',')]
                    app_name_index = None
                    for i, header in enumerate(csv_headers):
                        if header.lower() in ['app_name', 'appname', 'app name']:
                            app_name_index = i
                            break
                    if app_name_index is not None:
                        # 读取第一行数据
                        data_line = f.readline().strip()
                        if data_line:
                            values = [v.strip() for v in data_line.split(',')]
                            # 补齐空字段，保证和表头长度一致
                            if len(values) < len(csv_headers):
                                values += [''] * (len(csv_headers) - len(values))
                            candidate = values[app_name_index]
                            logger.info(f"读取到 app_name 字段内容: {candidate}")
                            # 只有内容非空才赋值，否则app_name保持None
                            if candidate:
                                app_name = candidate
                                # 将 app_name 保存到数据库
                                try:
                                    with get_db_cursor() as cursor:
                                        cursor.execute("""
                                            INSERT INTO accounts (
                                                id, account_type, account_name, account_id, 
                                                app_id, app_name, create_time, update_time
                                            ) VALUES (
                                                %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                                            ) ON DUPLICATE KEY UPDATE 
                                                app_name = VALUES(app_name),
                                                update_time = CURRENT_TIMESTAMP
                                        """, (
                                            str(uuid.uuid4()),
                                            account_type,
                                            account_name,
                                            account_name,
                                            app_id,
                                            app_name
                                        ))
                                        logger.info(f"已将app_name保存到数据库: {app_name}")
                                except Exception as e:
                                    logger.error(f"保存app_name到数据库失败: {str(e)}")
            except Exception as e:
                logger.error(f"从文件中读取app_name失败: {str(e)}")
        # 如果app_name依然为空，强制返回None（或空字符串）
        if not app_name:
            # 尝试从apps_finder表获取app_name
            try:
                with get_db_cursor() as cursor:
                    cursor.execute("SELECT app_name FROM apps_finder WHERE app_id = %s", (app_id,))
                    result = cursor.fetchone()
                    if result and result['app_name']:
                        app_name = result['app_name']
                        logger.info(f"从apps_finder获取到App Name: {app_name}")
            except Exception as e:
                logger.warning(f"从apps_finder查询App Name失败: {str(e)}")
        
        # 如果仍然没有app_name，设置为None
        if not app_name:
            app_name = None

        # 构建响应数据
        response_data = {
            'status': 'success',
            'message': '数据获取成功',
            'downloadUrl': f'/api/download/{filename}',
            'details': {
                'appId': app_id,
                'appName': app_name,
                'dataType': data_type,
                'dateRange': f'{from_date} 至 {to_date}',
                'rowCount': len(response.text.splitlines()) - 1,
                'afidDeduplicationCount': afid_deduplication_count,
                'config': {
                    'url': url,
                    'params': params,
                    'headers': {k: v for k, v in headers.items() if k != 'Authorization'}
                }
            }
        }
        
        # 仅对事件类型数据添加 primaryAttributionCount
        if data_type in event_types:
            response_data['details']['primaryAttributionCount'] = primary_attribution_count

        return response_data
        
    except Exception as e:
        logger.error(f'获取数据失败: {str(e)}', exc_info=True)
        return {
            'status': 'error',
            'message': f'获取数据失败: {str(e)}',
            'details': {
                'error_type': 'system_error',
                'error_message': str(e)
            }
        }

@app.route('/api/query-data', methods=['POST'])
@token_required
def query_data(current_user):
    """执行数据查询"""
    logger.debug('=== 执行数据查询 ===')
    logger.debug('当前用户: %s', current_user)
    
    try:
        data = request.get_json()
        logger.debug('请求数据: %s', data)
        
        # 验证必要字段
        required_fields = ['accountName', 'accountType', 'dataType', 'fromDate', 'toDate', 'appId', 'apiToken']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'status': 'error',
                    'message': f'缺少必要字段: {field}',
                    'queryId': None
                }), 400

        # 获取事件过滤参数
        event_filter = data.get('eventFilter')
        logger.debug('从请求数据中获取到事件过滤值: %s', event_filter)
        
        # 获取media source参数，统一用mediaSource（驼峰）
        media_source = data.get('mediaSource', '')
        logger.debug('从请求数据中获取到mediaSource值: %s', media_source)
        
        # 获取mode参数，用于区分Normal和Aggregate模式
        mode = data.get('mode', 'normal')
        logger.debug('从请求数据中获取到mode值: %s', mode)
        
        # 转换日期格式
        try:
            from_date = datetime.strptime(data['fromDate'], '%Y-%m-%d').date()
            to_date = datetime.strptime(data['toDate'], '%Y-%m-%d').date()
        except ValueError as e:
            return jsonify({
                'status': 'error',
                'message': f'日期格式错误: {str(e)}',
                'queryId': None
            }), 400
        
        # 生成查询ID（使用更短的格式，添加随机数避免冲突）
        timestamp = int(time.time())  # 去掉毫秒级
        import random
        random_suffix = random.randint(1000, 9999)  # 4位随机数
        query_id = f"{timestamp}_{random_suffix}_{data['appId']}"
        logger.debug('生成查询ID: %s', query_id)
        
        # 检查并删除超出限制的旧记录
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*) as count FROM query_logs WHERE user_id = %s
            """, (current_user,))
            count = cursor.fetchone()['count']
            
            if count >= 30:
                # 删除最旧的记录
                cursor.execute("""
                    DELETE FROM query_logs 
                    WHERE user_id = %s 
                    AND id IN (
                        SELECT id FROM (
                            SELECT id FROM query_logs 
                            WHERE user_id = %s 
                            ORDER BY created_at ASC 
                            LIMIT 1
                        ) as temp
                    )
                """, (current_user, current_user))
                logger.debug('删除最旧的查询记录')
        
        # 创建查询日志
        with get_db_cursor() as cursor:
            # 先检查是否已存在相同的query_id
            cursor.execute("SELECT id FROM query_logs WHERE id = %s", (query_id,))
            if cursor.fetchone():
                # 如果已存在，重新生成query_id
                import random
                random_suffix = random.randint(1000, 9999)
                query_id = f"{timestamp}_{random_suffix}_{data['appId']}"
                logger.debug('重新生成查询ID: %s', query_id)
            
            cursor.execute("""
                INSERT INTO query_logs (
                    id, query_result_id, user_id, account_type, account_id, 
                    app_id, app_name, data_type, from_date, to_date, status, message,
                    api_response, error_details, row_count, created_at, updated_at,
                    event_filter, mode
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, %s, %s
                )
            """, (
                query_id,
                query_id,  # query_result_id 与 id 相同
                current_user,
                data['accountType'],
                data['accountName'],
                data['appId'],
                None,  # app_name 初始为 NULL，后续更新
                data['dataType'],
                from_date,
                to_date,
                'pending',
                '查询已开始',
                json.dumps({}),  # 初始空的 api_response
                json.dumps({}),  # 初始空的 error_details
                0,  # 初始 row_count
                event_filter,  # event_filter参数
                mode  # mode参数
            ))
            logger.debug('创建查询日志成功, event_filter: %s, mode: %s', event_filter, mode)
        
        # 执行查询
        try:
            result = fetch_data(
                data['accountName'],
                data['accountType'],
                data['dataType'],
                data['fromDate'],
                data['toDate'],
                data['appId'],
                data['apiToken'],
                event_filter,  # 事件过滤
                media_source,  # 统一用mediaSource变量
                mode  # 模式参数
            )
            
            # 构建完整的API响应数据
            api_response = {
                'status': result.get('status'),
                'message': result.get('message'),
                'downloadUrl': result.get('downloadUrl'),
                'details': result.get('details', {}),
                'config': result.get('config', {}),
                'rowCount': result.get('row_count', 0)
            }
            
            # 获取App Name
            app_name = result.get('details', {}).get('appName')  # 备选项：API响应中的appName
            
            # 首选项：从apps_finder表查询
            try:
                with get_db_cursor() as cursor:
                    cursor.execute("SELECT app_name FROM apps_finder WHERE app_id = %s", (data['appId'],))
                    result_app = cursor.fetchone()
                    if result_app and result_app['app_name']:
                        app_name = result_app['app_name']
                        logger.debug(f"从apps_finder获取到App Name: {app_name}")
            except Exception as e:
                logger.warning(f"从apps_finder查询App Name失败: {str(e)}")
            
            # 更新查询日志
            with get_db_cursor() as cursor:
                # 构建下载URL
                download_url = None
                if result.get('status') == 'success' and result.get('downloadUrl'):
                    download_url = result.get('downloadUrl')
                
                cursor.execute("""
                    UPDATE query_logs 
                    SET status = %s,
                        message = %s,
                        api_response = %s,
                        error_details = %s,
                        row_count = %s,
                        app_name = %s,
                        download_url = %s,
                        updated_at = CURRENT_TIMESTAMP,
                        event_filter = %s,
                        mode = %s
                    WHERE id = %s
                """, (
                    'success' if result.get('status') == 'success' else 'failed',
                    result.get('message', '查询完成'),
                    json.dumps(api_response),
                    json.dumps(result.get('error_details', {})),
                    result.get('row_count', 0),
                    app_name,  # 使用查询到的App Name
                    download_url,
                    event_filter,  # 将data.get('eventFilter', None)改为event_filter
                    mode,  # 添加mode字段
                    query_id
                ))
                logger.debug('更新查询日志成功, event_filter: %s, app_name: %s', event_filter, app_name)
            
            # 确保返回queryId
            result['queryId'] = query_id
            return jsonify(result)
            
        except Exception as e:
            error_details = {
                'error': str(e),
                'timestamp': datetime.now().isoformat(),
                'query_id': query_id
            }
            
            # 更新查询日志为失败状态
            with get_db_cursor() as cursor:
                cursor.execute("""
                    UPDATE query_logs 
                    SET status = 'failed',
                        message = %s,
                        error_details = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (
                    str(e),
                    json.dumps(error_details),
                    query_id
                ))
                logger.debug('更新查询日志为失败状态')
            
            # 返回错误响应，但包含queryId
            return jsonify({
                'status': 'error',
                'message': f'查询数据失败: {str(e)}',
                'queryId': query_id,
                'error_details': error_details
            }), 500
            
    except Exception as e:
        logger.error(f"查询数据失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'查询数据失败: {str(e)}',
            'queryId': None
        }), 500

@app.route('/api/download/<filename>')
def download_file(filename):
    try:
        logger.info(f"开始处理文件下载请求: {filename}")
        
        # 优先在绝对路径下查找
        possible_paths = [
            os.path.join(TEMP_DIR, filename),
            os.path.join(BASE_DIR, 'downloads', filename),
            os.path.join('temp', filename),
            os.path.join('downloads', filename),
            filename
        ]
        
        # 添加对ReportManagement文件路径的支持
        # 尝试从文件名中提取账户信息
        if '_' in filename and filename.endswith('.csv'):
            name_part = filename[:-4]  # 去掉.csv后缀
            parts = name_part.split('_')
            if len(parts) >= 4:
                # 尝试构建ReportManagement的文件路径
                # 格式：starpower2j_int_com.mexcpro.client_In-App-Event-Postbacks_2025-07-30.csv
                # 第一部分通常是account_id
                account_id = parts[0]
                # 尝试不同的account_type
                for account_type in ['PID', 'PRT']:
                    # 使用相对路径和绝对路径
                    report_paths = [
                        os.path.abspath(os.path.join('temp', f"{account_type}_{account_id}", filename)),
                        os.path.join('temp', f"{account_type}_{account_id}", filename),
                        os.path.join(TEMP_DIR, f"{account_type}_{account_id}", filename),
                        os.path.join(BASE_DIR, 'temp', f"{account_type}_{account_id}", filename),
                        # 添加更多可能的路径
                        os.path.join(os.getcwd(), 'temp', f"{account_type}_{account_id}", filename),
                        os.path.join(os.path.dirname(BASE_DIR), 'temp', f"{account_type}_{account_id}", filename)
                    ]
                    for report_path in report_paths:
                        possible_paths.append(report_path)
                        logger.info(f"添加ReportManagement路径: {report_path}")
        file_path = None
        logger.info(f"开始查找文件: {filename}")
        logger.info(f"当前工作目录: {os.getcwd()}")
        logger.info(f"BASE_DIR: {BASE_DIR}")
        logger.info(f"TEMP_DIR: {TEMP_DIR}")
        
        for path in possible_paths:
            logger.info(f"检查路径: {path} (存在: {os.path.exists(path)})")
            if os.path.exists(path):
                file_path = path
                logger.info(f"找到文件: {path}")
                break
        if not file_path:
            logger.error(f"文件不存在: {filename}")
            logger.error(f"尝试的路径: {possible_paths}")
            # 列出temp目录下的所有文件
            try:
                temp_dirs = ['temp', TEMP_DIR, os.path.join(BASE_DIR, 'temp')]
                for temp_dir in temp_dirs:
                    if os.path.exists(temp_dir):
                        logger.info(f"检查目录: {temp_dir}")
                        for root, dirs, files in os.walk(temp_dir):
                            for file in files:
                                if file.endswith('.csv'):
                                    logger.info(f"找到CSV文件: {os.path.join(root, file)}")
            except Exception as e:
                logger.error(f"列出文件时出错: {str(e)}")
            
            return jsonify({
                'status': 'error',
                'message': '文件不存在'
            }), 404
        # 检查文件是否可读
        if not os.access(file_path, os.R_OK):
            logger.error(f"文件不可读: {file_path}")
            return jsonify({
                'status': 'error',
                'message': '文件不可读'
            }), 403
        # 获取文件大小
        file_size = os.path.getsize(file_path)
        logger.info(f"文件大小: {file_size} 字节")
        response = send_file(
            file_path,
            as_attachment=True,
            download_name=filename,
            mimetype='text/csv',
            conditional=True
        )
        response.headers['Content-Length'] = file_size
        response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition'
        response.headers['Cache-Control'] = 'no-cache'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        logger.info(f"文件下载响应已准备: {filename}")
        return response
    except Exception as e:
        logger.error(f"文件下载失败: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': f'文件下载失败: {str(e)}'
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        # 检查数据库连接
        with get_db_cursor() as cursor:
            cursor.execute("SELECT 1")
            # 获取连接池状态
            pool_status = {
                "pool_size": connection_pool.pool_size,
                "pool_name": connection_pool.pool_name
            }
            
        return jsonify({
            "status": "healthy",
            "database": {
                "connected": True,
                "pool_status": pool_status,
                "connection_info": {
                    "host": os.getenv('DB_HOST', 'localhost'),
                    "environment": "本地" if os.getenv('IS_LOCAL', 'false').lower() == 'true' else "生产",
                    "connection_type": "Unix Socket" if os.getenv('DB_HOST', 'localhost') == 'localhost' else "TCP/IP"
                }
            },
            "environment": os.getenv('FLASK_ENV', 'development'),
            "timestamp": datetime.now().isoformat()
        })
    except Exception as e:
        logger.error(f"健康检查失败: {str(e)}")
        return jsonify({
            "status": "unhealthy",
            "error": str(e),
            "environment": os.getenv('FLASK_ENV', 'development'),
            "timestamp": datetime.now().isoformat()
        }), 500

@app.route('/api/cleanup-orphaned-files', methods=['POST'])
def cleanup_orphaned_files_api():
    """手动清理孤立文件的API端点"""
    try:
        # 获取清理统计信息
        stats = cleanup_orphaned_files()
        return jsonify({
            'status': 'success',
            'message': 'Files cleanup completed successfully',
            'stats': stats
        })
    except Exception as e:
        logger.error(f"清理孤立文件失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Cleanup failed: {str(e)}'
        }), 500

@app.route('/api/ping', methods=['GET'])
def ping():
    """检查AppsFlyer API连接状态"""
    try:
        start_time = datetime.now()
        # 使用更简单的检测方式
        try:
            # 使用更简单的API端点进行检测
            response = requests.get(
                'https://hq1.appsflyer.com/api/v1/status',
                timeout=5,  # 增加超时时间
                verify=False,  # 暂时禁用SSL验证
                headers={'Accept': 'application/json'},
                allow_redirects=True
            )
            
            end_time = datetime.now()
            ping_time = int((end_time - start_time).total_seconds() * 1000)
            
            # 只要不是404，都认为是网络正常
            if response.status_code != 404:
                logger.info(f'Ping检测成功: {ping_time}ms')
                return jsonify({
                    'success': True,
                    'pingTime': ping_time,
                    'status': 'good' if ping_time < 1000 else 'warning' if ping_time < 2000 else 'poor'
                })
            else:
                logger.error(f'Ping检测失败: HTTP 404')
                return jsonify({
                    'success': False,
                    'pingTime': 3000,
                    'status': 'poor',
                    'error': 'Network Error'
                })
                
        except requests.exceptions.RequestException as e:
            logger.error(f'Ping检测失败: {str(e)}')
            return jsonify({
                'success': False,
                'pingTime': 3000,
                'status': 'poor',
                'error': str(e)
            })
            
    except Exception as e:
        logger.error(f'Ping检测失败: {str(e)}')
        return jsonify({
            'success': False,
            'pingTime': 3000,
            'status': 'poor',
            'error': str(e)
        })

@app.route('/api/reports/<report_key>', methods=['GET'])
def get_report_status(report_key):
    try:
        # 从请求中获取账户信息
        account_type = request.args.get('accountType')
        account_id = request.args.get('accountId')
        
        if not account_type or not account_id:
            return jsonify({"error": "缺少账户信息"}), 400
            
        # 从数据库获取报表信息
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM reports 
                WHERE id = %s AND account_type = %s AND account_id = %s
            """, (report_key, account_type, account_id))
            result = cursor.fetchone()
            
            if not result:
                return jsonify({
                    'status': 'error',
                    'message': '报表不存在'
                }), 404
                
            return jsonify(result)
    except Exception as e:
        logger.error(f"获取报表状态失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/reports/<report_key>/preview', methods=['GET'])
def preview_report(report_key):
    try:
        # 从请求中获取账户信息
        account_type = request.args.get('accountType')
        account_id = request.args.get('accountId')
        
        # 优化：减少日志输出以提高性能
        if not account_type or not account_id:
            logger.error("缺少账户信息")
            return jsonify({"error": "缺少账户信息"}), 400
            
        # 从数据库获取报表信息
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT r.*, ql.download_url as ql_download_url
                FROM reports r
                LEFT JOIN query_logs ql ON r.query_log_id = ql.id
                WHERE r.id = %s AND r.account_type = %s AND r.account_id = %s
            """, (report_key, account_type, account_id))
            result = cursor.fetchone()
            
            if not result:
                logger.warning(f"报表不存在: {report_key}")
                return jsonify({
                    'status': 'error',
                    'message': '报表不存在'
                }), 404
            
            # 优先使用reports表中的download_url，如果没有则使用query_logs表的
            download_url = result.get('download_url') or result.get('ql_download_url')
            if download_url:
                logger.info(f"找到直接关联的下载URL: {download_url}")
                # 从download_url中提取文件路径
                if download_url.startswith('/api/download/'):
                    filename = download_url.replace('/api/download/', '')
                    file_path = os.path.join('temp', filename)
                    logger.info(f"使用关联的文件路径: {file_path}")
                    
                    if os.path.exists(file_path):
                        # 读取文件前20行作为预览
                        preview_data = []
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                # 读取标题行
                                headers = f.readline().strip().split(',')
                                
                                # 过滤空字段，只保留有内容的字段
                                non_empty_headers = []
                                for i, header in enumerate(headers):
                                    if header.strip():  # 只保留非空的字段名
                                        non_empty_headers.append((i, header.strip()))
                                
                                # 使用csv.reader快速读取前20行
                                import csv
                                reader = csv.reader(f)
                                for i, row in enumerate(reader):
                                    if i >= 20:  # 设置为20行
                                        break
                                    # 确保row长度与headers一致
                                    while len(row) < len(headers):
                                        row.append('')
                                    
                                    # 只保留非空字段的数据，保持原始顺序
                                    filtered_row = {}
                                    for col_index, header_name in non_empty_headers:
                                        value = row[col_index] if col_index < len(row) else ''
                                        if value.strip():  # 只保留非空值
                                            filtered_row[header_name] = value.strip()
                                    
                                    preview_data.append(filtered_row)
                                
                        except Exception as e:
                            logger.error(f"读取文件失败: {str(e)}")
                            return jsonify({
                                'status': 'error',
                                'message': f'读取文件失败: {str(e)}'
                            }), 500
                        
                        return jsonify(preview_data)
                    else:
                        logger.error(f"文件不存在: {file_path}")
                        return jsonify({
                            'status': 'error',
                            'message': '文件不存在'
                        }), 404
                else:
                    logger.error(f"无效的下载URL格式: {download_url}")
                    return jsonify({
                        'status': 'error',
                        'message': '无效的下载URL格式'
                    }), 400
        
        # 如果没有关联的download_url，返回错误
        logger.error(f"未找到关联的下载URL")
        return jsonify({
            'status': 'error',
            'message': '未找到关联的文件'
        }), 404
        
    except Exception as e:
        logger.error(f"预览报表失败: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# 添加请求处理日志
@app.before_request
def log_request_info():
    logger.debug('=== 收到新请求 ===')
    logger.debug('请求路径: %s', request.path)
    logger.debug('请求方法: %s', request.method)
    logger.debug('请求头: %s', dict(request.headers))
    logger.debug('请求URL: %s', request.url)
    logger.debug('请求参数: %s', request.args)
    logger.debug('请求数据: %s', request.get_data())
    logger.debug('请求JSON: %s', request.get_json(silent=True))
    logger.debug('请求表单: %s', request.form)
    logger.debug('请求文件: %s', request.files)
    logger.debug('请求环境: %s', dict(request.environ))
    logger.debug('注册的路由: %s', [str(rule) for rule in app.url_map.iter_rules()])

# 添加响应处理日志
@app.after_request
def log_response_info(response):
    logger.debug('=== 发送响应 ===')
    logger.debug('响应状态: %s', response.status)
    logger.debug('响应头: %s', dict(response.headers))
    
    # 检查是否是文件下载响应
    if 'Content-Disposition' in response.headers and 'attachment' in response.headers['Content-Disposition']:
        logger.debug('文件下载响应，跳过数据记录')
    else:
        try:
            logger.debug('响应数据: %s', response.get_data())
        except Exception as e:
            logger.debug('无法获取响应数据: %s', str(e))
    
    return response

# 查询结果相关的API路由
@app.route('/api/query-results', methods=['GET'])
@token_required
def get_query_results(current_user):
    """获取查询结果列表"""
    logger.debug('=== 获取查询结果列表 ===')
    logger.debug('当前用户: %s', current_user)
    
    try:
        # 获取查询参数
        mode = request.args.get('mode', 'all')  # 默认显示所有模式
        logger.debug('请求的模式过滤: %s', mode)
        
        with get_db_cursor() as cursor:
            # 根据模式过滤查询
            if mode == 'normal':
                # 只显示Normal模式的数据
                cursor.execute("""
                    SELECT 
                        id,
                        query_result_id,
                        user_id,
                        account_type,
                        account_id,
                        app_id,
                        data_type,
                        from_date,
                        to_date,
                        status,
                        message,
                        api_response,
                        error_details,
                        row_count,
                        event_filter,
                        mode,
                        created_at,
                        updated_at
                    FROM query_logs 
                    WHERE user_id = %s AND mode = 'normal'
                    ORDER BY created_at DESC
                    LIMIT 30
                """, (current_user,))
            elif mode == 'aggregate':
                # 只显示Aggregate模式的数据
                cursor.execute("""
                    SELECT 
                        id,
                        query_result_id,
                        user_id,
                        account_type,
                        account_id,
                        app_id,
                        data_type,
                        from_date,
                        to_date,
                        status,
                        message,
                        api_response,
                        error_details,
                        row_count,
                        event_filter,
                        mode,
                        created_at,
                        updated_at
                    FROM query_logs 
                    WHERE user_id = %s AND mode = 'aggregate'
                    ORDER BY created_at DESC
                    LIMIT 30
                """, (current_user,))
            else:
                # 显示所有模式的数据（默认行为）
                cursor.execute("""
                    SELECT 
                        id,
                        query_result_id,
                        user_id,
                        account_type,
                        account_id,
                        app_id,
                        data_type,
                        from_date,
                        to_date,
                        status,
                        message,
                        api_response,
                        error_details,
                        row_count,
                        event_filter,
                        mode,
                        created_at,
                        updated_at
                    FROM query_logs 
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                    LIMIT 30
                """, (current_user,))
            
            results = cursor.fetchall()
            logger.debug('查询到 %d 条记录', len(results))
            
            # 调试：打印每条记录的详细信息
            for i, result in enumerate(results):
                logger.debug('记录 %d: id=%s, mode=%s, status=%s, app_id=%s, data_type=%s', 
                           i+1, result['id'], result['mode'], result['status'], 
                           result['app_id'], result['data_type'])
            
            # 格式化结果
            formatted_results = []
            for result in results:
                # 解析API响应
                api_response = json.loads(result['api_response']) if result['api_response'] else {}
                error_details = json.loads(result['error_details']) if result['error_details'] else {}
                
                # 构建完整的响应数据
                formatted_result = {
                    'key': result['id'],
                    'queryResultId': result['query_result_id'],
                    'accountType': result['account_type'],
                    'accountId': result['account_id'],
                    'appId': result['app_id'],
                    'dataType': result['data_type'],
                    'dateRange': f"{result['from_date']} 至 {result['to_date']}",
                    'status': result['status'],
                    'message': result['message'],
                    'apiResponse': api_response,
                    'errorDetails': error_details,
                    'rowCount': result['row_count'],
                    'event_filter': result['event_filter'],
                    'mode': result['mode'],
                    'createTime': result['created_at'].strftime('%Y-%m-%d %H:%M:%S'),
                    'updateTime': result['updated_at'].strftime('%Y-%m-%d %H:%M:%S'),
                    'downloadUrl': api_response.get('downloadUrl', ''),
                    'details': api_response.get('details', {}),
                    'config': api_response.get('config', {})
                }
                formatted_results.append(formatted_result)
            
            return jsonify({
                'status': 'success',
                'data': formatted_results
            })
            
    except Exception as e:
        logger.error(f"获取查询结果失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'获取查询结果失败: {str(e)}'
        }), 500

@app.route('/api/query-results/<result_key>', methods=['PUT'])
@token_required
def update_query_result(current_user, result_key):
    """更新查询结果记录"""
    try:
        data = request.get_json()
        
        # 验证账户信息
        account_type = data.get('accountType')
        account_id = data.get('accountId')
        if not account_type or not account_id:
            return jsonify({"error": "缺少账户信息"}), 400
        
        # 更新记录
        with get_db_cursor() as cursor:
            cursor.execute("""
                UPDATE query_results 
                SET status = %(status)s,
                    message = %(message)s,
                    download_url = %(download_url)s,
                    api_response = %(api_response)s,
                    error_details = %(error_details)s,
                    app_name = %(app_name)s,
                    primary_attribution_count = %(primary_attribution_count)s,
                    imported = %(imported)s
                WHERE key = %(key)s 
                AND account_type = %(account_type)s 
                AND account_id = %(account_id)s
            """, {
                'key': result_key,
                'status': data.get('status'),
                'message': data.get('message'),
                'download_url': data.get('downloadUrl'),
                'api_response': json.dumps(data.get('apiResponse', {})),
                'error_details': json.dumps(data.get('errorDetails', {})),
                'app_name': data.get('appName'),
                'primary_attribution_count': data.get('primaryAttributionCount', 0),
                'imported': data.get('imported', False),
                'account_type': account_type,
                'account_id': account_id
            })
            
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"更新查询结果失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/query-results/<result_key>', methods=['DELETE'])
@token_required
def delete_query_result(current_user, result_key):
    """删除查询结果记录"""
    try:
        # 从请求中获取账户信息
        account_type = request.args.get('accountType')
        account_id = request.args.get('accountId')
        
        if not account_type or not account_id:
            return jsonify({"error": "缺少账户信息"}), 400
        
        # 删除记录
        with get_db_cursor() as cursor:
            cursor.execute("""
                DELETE FROM query_results 
                WHERE key = %s 
                AND account_type = %s 
                AND account_id = %s
            """, (result_key, account_type, account_id))
            
        return jsonify({"success": True})
    except Exception as e:
        logger.error(f"删除查询结果失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/query-logs', methods=['POST'])
@token_required
def create_query_log(current_user):
    try:
        data = request.get_json()
        logger.debug(f"创建查询日志: {data}")
        
        # 使用with语句创建数据库连接
        with get_db_cursor() as cursor:
            # 插入新的查询日志
            cursor.execute("""
                INSERT INTO query_logs (
                    id,
                    query_result_id,
                    user_id,
                    account_type,
                    account_id,
                    app_id,
                    app_name,
                    data_type,
                    from_date,
                    to_date,
                    status,
                    message,
                    api_response,
                    error_details,
                    row_count,
                    created_at,
                    updated_at,
                    event_filter
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, %s
                )
            """, (
                data.get('queryResultId'),
                data.get('queryResultId'),
                current_user,
                data.get('accountType'),
                data.get('accountId'),
                data.get('appId'),
                data.get('appName'),
                data.get('dataType'),
                data.get('fromDate'),
                data.get('toDate'),
                data.get('status', 'pending'),
                data.get('message', ''),
                json.dumps(data.get('apiResponse', {})),
                json.dumps(data.get('errorDetails', {})),
                data.get('rowCount', 0),
                data.get('eventFilter', None)
            ))
            
            # 提交事务
            cursor.connection.commit()
            
            logger.debug(f"查询日志创建成功: {data.get('queryResultId')}")
            return jsonify({'message': 'Query log created successfully'})
            
    except Exception as e:
        logger.error(f"创建查询日志失败: {str(e)}")
        return jsonify({'message': str(e)}), 500

@app.route('/api/query-logs/<query_result_id>', methods=['PUT'])
@token_required
def update_query_log(current_user, query_result_id):
    try:
        data = request.get_json()
        logger.debug(f"更新查询日志: {query_result_id}, 数据: {data}")
        
        # 转换日期格式
        try:
            from_date = None
            to_date = None
            if data.get('fromDate'):
                from_date = datetime.strptime(data.get('fromDate'), '%Y-%m-%d').date()
            if data.get('toDate'):
                to_date = datetime.strptime(data.get('toDate'), '%Y-%m-%d').date()
        except (ValueError, TypeError) as e:
            logger.error(f"日期格式转换失败: {str(e)}")
            return jsonify({
                'status': 'error',
                'message': f'日期格式错误: {str(e)}'
            }), 400
        
        # 使用with语句创建数据库连接
        with get_db_cursor() as cursor:
            # 先检查记录是否存在
            cursor.execute("""
                SELECT id FROM query_logs 
                WHERE id = %s OR query_result_id = %s
            """, (query_result_id, query_result_id))
            existing_log = cursor.fetchone()
            
            if not existing_log:
                logger.warning(f"未找到要更新的查询日志: {query_result_id}")
                # 如果记录不存在，创建新记录
                if not from_date or not to_date:
                    return jsonify({
                        'status': 'error',
                        'message': '创建新记录时，fromDate 和 toDate 不能为空'
                    }), 400
                    
                cursor.execute("""
                    INSERT INTO query_logs (
                        id,
                        query_result_id,
                        user_id,
                        account_type,
                        account_id,
                        app_id,
                        app_name,
                        data_type,
                        from_date,
                        to_date,
                        status,
                        message,
                        api_response,
                        error_details,
                        row_count,
                        created_at,
                        updated_at,
                        event_filter
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, %s
                    )
                """, (
                    query_result_id,
                    query_result_id,
                    current_user,
                    data.get('accountType'),
                    data.get('accountId'),
                    data.get('appId'),
                    data.get('appName'),
                    data.get('dataType'),
                    from_date,
                    to_date,
                    data.get('status', 'error'),
                    data.get('message', ''),
                    json.dumps(data.get('apiResponse', {})),
                    json.dumps(data.get('errorDetails', {})),
                    data.get('rowCount', 0),
                    data.get('eventFilter', None)
                ))
                logger.info(f"创建新的查询日志记录: {query_result_id}")
            else:
                # 更新现有记录
                update_fields = []
                update_values = []
                
                if data.get('status') is not None:
                    update_fields.append("status = %s")
                    update_values.append(data.get('status'))
                if data.get('message') is not None:
                    update_fields.append("message = %s")
                    update_values.append(data.get('message'))
                if data.get('apiResponse') is not None:
                    update_fields.append("api_response = %s")
                    update_values.append(json.dumps(data.get('apiResponse')))
                if data.get('errorDetails') is not None:
                    update_fields.append("error_details = %s")
                    update_values.append(json.dumps(data.get('errorDetails')))
                if data.get('rowCount') is not None:
                    update_fields.append("row_count = %s")
                    update_values.append(data.get('rowCount'))
                if data.get('appName') is not None:
                    update_fields.append("app_name = %s")
                    update_values.append(data.get('appName'))
                if from_date is not None:
                    update_fields.append("from_date = %s")
                    update_values.append(from_date)
                if to_date is not None:
                    update_fields.append("to_date = %s")
                    update_values.append(to_date)
                if data.get('eventFilter') is not None:
                    update_fields.append("event_filter = %s")
                    update_values.append(data.get('eventFilter'))
                
                update_fields.append("updated_at = CURRENT_TIMESTAMP")
                
                if update_fields:
                    update_values.append(query_result_id)
                    cursor.execute(f"""
                        UPDATE query_logs 
                        SET {', '.join(update_fields)}
                        WHERE id = %s OR query_result_id = %s
                    """, tuple(update_values + [query_result_id]))
                    logger.info(f"更新查询日志记录: {query_result_id}")
            
            return jsonify({'message': 'Query log updated successfully'})
            
    except Exception as e:
        logger.error(f"更新查询日志失败: {str(e)}", exc_info=True)
        return jsonify({'message': str(e)}), 500

@app.route('/api/query-logs', methods=['GET'])
@token_required
def get_query_logs(current_user):
    try:
        account_type = request.args.get('accountType')
        account_id = request.args.get('accountId')
        
        if not account_type or not account_id:
            return jsonify({'success': False, 'message': '缺少账户信息'}), 400
            
        cursor = get_db_cursor()
        cursor.execute("""
            SELECT * FROM query_logs 
            WHERE account_type = %s AND account_id = %s
            ORDER BY created_at DESC
        """, (account_type, account_id))
        
        logs = cursor.fetchall()
        return jsonify({
            'success': True,
            'logs': [{
                'key': log['query_result_id'],
                'accountType': log['account_type'],
                'accountId': log['account_id'],
                'appId': log['app_id'],
                'dataType': log['data_type'],
                'dateRange': f"{log['from_date']} 至 {log['to_date']}",
                'status': log['status'],
                'message': log['message'],
                'apiResponse': json.loads(log['api_response']) if log['api_response'] else {},
                'errorDetails': json.loads(log['error_details']) if log['error_details'] else {},
                'rowCount': log['row_count'],
                'event_filter': log['event_filter']
            } for log in logs]
        })
    except Exception as e:
        logger.error(f"获取查询日志失败: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/query-logs/<query_result_id>', methods=['DELETE'])
@token_required
def delete_query_log(current_user, query_result_id):
    try:
        # 获取账户信息和其他必要参数
        account_type = request.args.get('accountType')
        account_id = request.args.get('accountId')
        data_type = request.args.get('dataType')
        from_date = request.args.get('fromDate')
        to_date = request.args.get('toDate')
        
        if not all([account_type, account_id, data_type, from_date, to_date]):
            return jsonify({
                'status': 'error',
                'message': '缺少必要参数：accountType, accountId, dataType, fromDate, toDate'
            }), 400
            
        # 获取当前用户ID
        current_user_id = current_user if isinstance(current_user, str) else current_user.get('id') or current_user.get('user_id')
        if not current_user_id:
            logger.error("无法获取用户ID")
            return jsonify({
                'status': 'error',
                'message': '无法获取用户信息'
            }), 401
            
        logger.info(f"开始删除查询日志: {query_result_id}, 账户: {account_type}/{account_id}, 数据类型: {data_type}, 日期范围: {from_date} 至 {to_date}")
        
        # 使用with语句创建数据库连接
        with get_db_cursor() as cursor:
            # 先获取查询日志信息，使用id或query_result_id匹配，同时验证用户ID
            cursor.execute("""
                SELECT * FROM query_logs 
                WHERE (id = %s OR query_result_id = %s)
                AND user_id = %s
            """, (query_result_id, query_result_id, current_user_id))
            
            log = cursor.fetchone()
            if not log:
                logger.warning(f"未找到要删除的查询日志: {query_result_id}")
                logger.debug(f"SQL查询参数: id={query_result_id}, user_id={current_user_id}")
                return jsonify({
                    'status': 'error',
                    'message': '查询日志不存在或状态不允许删除'
                }), 404
            
            # 获取API响应中的下载URL
            api_response = json.loads(log['api_response']) if log['api_response'] else {}
            download_url = api_response.get('downloadUrl', '')
            
            # 从下载URL中提取文件名
            filename = download_url.split('/')[-1] if download_url else None
            
            # 删除数据库记录，使用id或query_result_id匹配，同时验证用户ID
            cursor.execute("""
                DELETE FROM query_logs 
                WHERE (id = %s OR query_result_id = %s)
                AND user_id = %s
            """, (query_result_id, query_result_id, current_user_id))
            
            # 检查是否需要清理物理文件
            # 检查ReportManagement是否还有对应的记录
            cursor.execute("""
                SELECT COUNT(*) as count FROM reports 
                WHERE query_log_id = %s
            """, (query_result_id,))
            report_count = cursor.fetchone()['count']
            
            # 如果ReportManagement也没有记录了，清理物理文件
            if report_count == 0:
                logger.info(f"Home和ReportManagement都没有引用，开始清理物理文件: {query_result_id}")
                check_and_cleanup_file(query_result_id)
            
            logger.info(f"查询日志删除成功: {query_result_id}")
            return jsonify({
                'status': 'success',
                'message': '查询日志删除成功'
            })
            
    except Exception as e:
        logger.error(f"删除查询日志失败: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': f'删除查询日志失败: {str(e)}'
        }), 500

def recreate_database():
    """重新创建数据库，直接执行整个 init_db.sql 文件内容"""
    try:
        with get_db_cursor() as cursor:
            # 创建数据库
            cursor.execute("CREATE DATABASE IF NOT EXISTS appsflyer_rawdata")
            cursor.execute("USE appsflyer_rawdata")
            
            # 读取并执行 init_db.sql 文件
            init_db_path = os.path.join(os.path.dirname(__file__), 'init_db.sql')
            with open(init_db_path, 'r', encoding='utf-8') as f:
                sql_commands = f.read()
            
            # 直接执行所有 SQL 命令
            cursor.execute(sql_commands)
            
            logger.info("数据库表重新创建成功")
            return True
    except Exception as e:
        logger.error(f"重新创建数据库表失败: {str(e)}")
        return False

# 添加重新创建数据库的路由
@app.route('/api/recreate-db', methods=['POST'])
def recreate_db():
    """重新创建数据库表"""
    try:
        if recreate_database():
            return jsonify({
                'status': 'success',
                'message': '数据库表重新创建成功'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': '数据库表重新创建失败'
            }), 500
    except Exception as e:
        logger.error(f"重新创建数据库失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'重新创建数据库失败: {str(e)}'
        }), 500

@app.route('/api/check-duplicate-query', methods=['POST'])
@token_required
def check_duplicate_query(current_user):
    """检查是否存在重复查询"""
    try:
        data = request.get_json()
        required_fields = ['accountType', 'accountId', 'dataType', 'fromDate', 'toDate', 'appId']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'status': 'error',
                    'message': f'缺少必要字段: {field}'
                }), 400

        # 获取事件过滤参数
        event_filter = data.get('eventFilter', '')
        # 获取模式参数
        mode = data.get('mode', 'normal')

        with get_db_cursor() as cursor:
            # 检查是否存在任何状态的相同条件记录（包括事件过滤条件和模式）
            cursor.execute("""
                SELECT id, status, message, created_at
                FROM query_logs 
                WHERE account_type = %s 
                AND account_id = %s 
                AND data_type = %s 
                AND from_date = %s 
                AND to_date = %s 
                AND app_id = %s
                AND COALESCE(event_filter, '') = %s
                AND mode = %s
                ORDER BY created_at DESC
                LIMIT 1
            """, (
                data['accountType'],
                data['accountId'],
                data['dataType'],
                data['fromDate'],
                data['toDate'],
                data['appId'],
                event_filter,
                mode
            ))
            
            existing_record = cursor.fetchone()
            
            if existing_record:
                return jsonify({
                    'status': 'success',
                    'isDuplicate': True,
                    'record': {
                        'id': existing_record['id'],
                        'status': existing_record['status'],
                        'message': existing_record['message'],
                        'createdAt': existing_record['created_at'].isoformat()
                    }
                })
            
            return jsonify({
                'status': 'success',
                'isDuplicate': False
            })
            
    except Exception as e:
        logger.error(f"检查重复查询失败: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/download-all', methods=['GET'])
@token_required
def download_all(current_user):
    # 获取模式参数，默认为normal
    mode = request.args.get('mode', 'normal')
    temp_dir = None  # 初始化temp_dir变量
    try:
        # 获取当前用户ID
        current_user_id = current_user if isinstance(current_user, str) else current_user.get('id') or current_user.get('user_id')
        if not current_user_id:
            logger.error("无法获取用户ID")
            return jsonify({
                'status': 'error',
                'message': '无法获取用户信息'
            }), 401
        logger.info(f"开始处理用户 {current_user_id} 的下载全部请求")
        # 从数据库获取指定模式的成功查询记录
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM query_logs 
                WHERE user_id = %s 
                AND status = 'success'
                AND mode = %s
                ORDER BY created_at DESC
            """, (current_user_id, mode))
            records = cursor.fetchall()
            if not records:
                logger.info(f"用户 {current_user_id} 没有可下载的记录")
                return jsonify({
                    'status': 'error',
                    'message': '没有可下载的记录'
                }), 404
            # 创建临时目录（用绝对路径）
            temp_dir = os.path.join(TEMP_DIR, f'download_all_{current_user_id}_{int(time.time())}')
            os.makedirs(temp_dir, exist_ok=True)
            logger.info(f"创建临时目录: {temp_dir}")
            # 下载所有文件
            downloaded_files = []
            for record in records:
                try:
                    api_response = json.loads(record['api_response'])
                    download_url = api_response.get('downloadUrl')
                    if not download_url:
                        logger.warning(f"记录 {record['id']} 没有下载URL")
                        continue
                    # 从URL中提取原始文件名
                    original_filename = download_url.split('/')[-1]
                    # 原始文件路径（用绝对路径）
                    src_file_path = os.path.join(TEMP_DIR, original_filename)
                    # 重新生成新的文件名
                    account_name = record['account_id']
                    app_id = record['app_id']
                    data_type = record['data_type']
                    from_date = record['from_date'].strftime('%Y-%m-%d')
                    to_date = record['to_date'].strftime('%Y-%m-%d')
                    event_filter = record.get('event_filter', '')
                    timestamp = record['created_at'].strftime('%Y%m%d_%H%M%S')
                    base_name = f"RawData({account_name})"
                    is_event_type = data_type in ['In-App-Event-Postbacks', 'In-App-Event-Non-Organic', 'Retargeting-In-App-Event-Postbacks', 'Retargeting-In-App-Event-Non-Organic']
                    if is_event_type:
                        if event_filter and event_filter.strip():
                            data_type_with_filter = f"{data_type}(Filter-On)"
                        else:
                            data_type_with_filter = f"{data_type}(Filter-Off)"
                    else:
                        data_type_with_filter = data_type
                    if from_date != to_date:
                        new_filename = f"{base_name}_{app_id}_{data_type_with_filter}_{from_date}——{to_date}_{timestamp}.csv"
                    else:
                        new_filename = f"{base_name}_{app_id}_{data_type_with_filter}_{from_date}_{timestamp}.csv"
                    new_file_path = os.path.join(temp_dir, new_filename)
                    if os.path.exists(src_file_path):
                        # 直接用本地文件系统复制
                        with open(src_file_path, 'rb') as src_f, open(new_file_path, 'wb') as dst_f:
                            dst_f.write(src_f.read())
                        downloaded_files.append(new_file_path)
                        logger.info(f"成功复制文件: {src_file_path} -> {new_file_path}")
                    else:
                        logger.warning(f"文件不存在: {src_file_path}")
                except Exception as e:
                    logger.error(f"处理文件失败: {str(e)}")
                    continue
            if not downloaded_files:
                logger.warning(f"用户 {current_user_id} 没有成功下载的文件")
                return jsonify({
                    'status': 'error',
                    'message': '没有可下载的文件'
                }), 404
            # 创建ZIP文件
            file_count = len(downloaded_files)
            zip_filename = f'RawData_Bundle_{file_count}_Results.zip'  # 文件名只用英文、数字、下划线
            zip_path = os.path.join(temp_dir, zip_filename)
            with zipfile.ZipFile(zip_path, 'w') as zipf:
                for file_path in downloaded_files:
                    zipf.write(file_path, os.path.basename(file_path))
            logger.info(f"成功创建ZIP文件: {zip_filename}")
            # 发送ZIP文件
            return send_file(
                zip_path,
                as_attachment=True,
                download_name=zip_filename,
                mimetype='application/zip',
                conditional=True  # 启用流式传输和断点续传
            )
    except Exception as e:
        logger.error(f"下载全部文件失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'下载全部文件失败: {str(e)}'
        }), 500

@app.route('/api/delete-all', methods=['DELETE'])
@token_required
def delete_all(current_user):
    # 获取模式参数，默认为normal
    mode = request.args.get('mode', 'normal')
    try:
        # 获取当前用户ID
        current_user_id = current_user if isinstance(current_user, str) else current_user.get('id') or current_user.get('user_id')
        if not current_user_id:
            logger.error("无法获取用户ID")
            return jsonify({
                'status': 'error',
                'message': '无法获取用户信息'
            }), 401

        logger.info(f"开始处理用户 {current_user_id} 的删除全部请求，模式: {mode}")
        
        # 删除该用户指定模式的所有查询记录
        with get_db_cursor() as cursor:
            cursor.execute("""
                DELETE FROM query_logs 
                WHERE user_id = %s
                AND mode = %s
            """, (current_user_id, mode))
            
            deleted_count = cursor.rowcount
            logger.info(f"成功删除 {deleted_count} 条记录")
        
        return jsonify({
            'status': 'success',
            'message': f'成功删除 {deleted_count} 条记录',
            'deletedCount': deleted_count
        })
        
    except Exception as e:
        logger.error(f"删除全部记录失败: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'删除全部记录失败: {str(e)}'
        }), 500

@app.errorhandler(Exception)
def handle_error(error):
    logger.error(f"全局错误处理: {str(error)}")
    response = {
        "status": "error",
        "message": str(error),
        "error_type": error.__class__.__name__
    }
    if isinstance(error, HTTPException):
        response["status_code"] = error.code
    else:
        response["status_code"] = 500
    return jsonify(response), response["status_code"]

@app.route('/api/download', methods=['POST'])
def download_data():
    try:
        data = request.get_json()
        app_id = data.get('app_id')
        data_type = data.get('data_type')
        from_date = data.get('from_date')
        to_date = data.get('to_date')
        account_type = data.get('account_type')
        
        # 构建API URL
        api_url = f"https://hq.appsflyer.com/export/{app_id}/{data_type}/v5"
        
        # 设置请求参数
        params = {
            'api_token': 'YOUR_API_TOKEN',
            'from': from_date,
            'to': to_date
        }
        
        # 发送请求
        response = requests.get(api_url, params=params)
        
        if response.status_code != 200:
            return jsonify({'error': 'Failed to fetch data from AppsFlyer API'}), 500
        
        # 保存响应数据到临时文件
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # 构建新的文件命名逻辑
        # 1. 前缀改为 RawData
        # 2. 添加账户信息 (account_type)
        # 3. 对事件类型添加过滤标识（这个接口没有event_filter参数，默认为Filter-Off）
        base_name = f"RawData({account_type})"
        
        # 判断是否为事件类型数据
        is_event_type = data_type in ['In-App-Event-Postbacks', 'In-App-Event-Non-Organic', 'Retargeting-In-App-Event-Postbacks', 'Retargeting-In-App-Event-Non-Organic']
        
        # 为事件类型添加过滤标识（这个接口没有event_filter，默认为Filter-Off）
        if is_event_type:
            data_type_with_filter = f"{data_type}(Filter-Off)"
        else:
            data_type_with_filter = data_type
        
        # 构建完整文件名
        if from_date != to_date:
            filename = f"{base_name}_{app_id}_{data_type_with_filter}_{from_date}——{to_date}_{timestamp}.csv"
        else:
            filename = f"{base_name}_{app_id}_{data_type_with_filter}_{from_date}_{timestamp}.csv"
        
        filepath = os.path.join('temp', filename)
        
        # 确保temp目录存在
        os.makedirs('temp', exist_ok=True)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(response.text)
        
        logger.info(f'数据已保存到文件: {filepath}')

        # 仅对事件类型数据统计 Is Primary Attribution
        primary_attribution_count = 0
        event_types = [
            'In-App-Event-Postbacks', 'Retargeting-In-App-Event-Postbacks',
            'In-App-Event-Non-Organic', 'Retargeting-In-App-Event-Non-Organic'
        ]
        
        if data_type in event_types:
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    # 读取CSV文件的第一行（标题行）
                    header_line = f.readline().strip()
                    csv_headers = header_line.split(',')
                    
                    # 查找Is Primary Attribution列的索引
                    primary_attribution_index = None
                    for i, header in enumerate(csv_headers):
                        if header.lower() in ['is primary attribution', 'is_primary_attribution', 'isprimaryattribution']:
                            primary_attribution_index = i
                            break
                    
                    if primary_attribution_index is not None:
                        # 读取每一行数据并统计
                        for line in f:
                            values = line.strip().split(',')
                            if len(values) > primary_attribution_index:
                                if values[primary_attribution_index].lower() == 'true':
                                    primary_attribution_count += 1
            except Exception as e:
                logger.error(f"统计Primary Attribution数量失败: {str(e)}")
        
        # 统计 AppsFlyer ID 去重数量（升级为csv.reader处理）
        afid_deduplication_count = 0
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                reader = csv.reader(f)
                csv_headers = next(reader)
                afid_index = None
                for i, header in enumerate(csv_headers):
                    if header.lower().replace('_', '').replace(' ', '') == 'appsflyerid':
                        afid_index = i
                        break
                if afid_index is not None:
                    afids = set()
                    for row in reader:
                        if len(row) > afid_index:
                            afid = row[afid_index].strip().replace('\r','').replace('\n','')
                            if afid:
                                afids.add(afid)
                    logger.info(f"去重AppsFlyer ID统计: {afids}")
                    afid_deduplication_count = len(afids)
        except Exception as e:
            logger.error(f"统计AppsFlyer ID去重数量失败: {str(e)}")

        # 从数据库中获取 app_name
        app_name = None
        try:
            with get_db_cursor() as cursor:
                cursor.execute("""
                    SELECT app_name FROM accounts 
                    WHERE account_type = %s AND account_id = %s AND app_id = %s
                    LIMIT 1
                """, (account_type, account_name, app_id))
                result = cursor.fetchone()
                if result:
                    app_name = result['app_name']
        except Exception as e:
            logger.error(f"从数据库获取app_name失败: {str(e)}")

        # 如果数据库中没有找到 app_name，从文件中读取
        if not app_name:
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    header_line = f.readline().strip()
                    # 查找 app_name 列
                    csv_headers = [h.strip() for h in header_line.split(',')]
                    app_name_index = None
                    for i, header in enumerate(csv_headers):
                        if header.lower() in ['app_name', 'appname', 'app name']:
                            app_name_index = i
                            break
                    if app_name_index is not None:
                        # 读取第一行数据
                        data_line = f.readline().strip()
                        if data_line:
                            values = [v.strip() for v in data_line.split(',')]
                            # 补齐空字段，保证和表头长度一致
                            if len(values) < len(csv_headers):
                                values += [''] * (len(csv_headers) - len(values))
                            candidate = values[app_name_index]
                            logger.info(f"读取到 app_name 字段内容: {candidate}")
                            # 只有内容非空才赋值，否则app_name保持None
                            if candidate:
                                app_name = candidate
                                # 将 app_name 保存到数据库
                                try:
                                    with get_db_cursor() as cursor:
                                        cursor.execute("""
                                            INSERT INTO accounts (
                                                id, account_type, account_name, account_id, 
                                                app_id, app_name, create_time, update_time
                                            ) VALUES (
                                                %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                                            ) ON DUPLICATE KEY UPDATE 
                                                app_name = VALUES(app_name),
                                                update_time = CURRENT_TIMESTAMP
                                        """, (
                                            str(uuid.uuid4()),
                                            account_type,
                                            account_name,
                                            account_name,
                                            app_id,
                                            app_name
                                        ))
                                        logger.info(f"已将app_name保存到数据库: {app_name}")
                                except Exception as e:
                                    logger.error(f"保存app_name到数据库失败: {str(e)}")
            except Exception as e:
                logger.error(f"从文件中读取app_name失败: {str(e)}")
        # 如果app_name依然为空，强制返回None（或空字符串）
        if not app_name:
            # 尝试从apps_finder表获取app_name
            try:
                with get_db_cursor() as cursor:
                    cursor.execute("SELECT app_name FROM apps_finder WHERE app_id = %s", (app_id,))
                    result = cursor.fetchone()
                    if result and result['app_name']:
                        app_name = result['app_name']
                        logger.info(f"从apps_finder获取到App Name: {app_name}")
            except Exception as e:
                logger.warning(f"从apps_finder查询App Name失败: {str(e)}")
        
        # 如果仍然没有app_name，设置为None
        if not app_name:
            app_name = None

        # 构建响应数据
        response_data = {
            'status': 'success',
            'message': '数据获取成功',
            'downloadUrl': f'/api/download/{filename}',
            'details': {
                'appId': app_id,
                'appName': app_name,
                'dataType': data_type,
                'dateRange': f'{from_date} 至 {to_date}',
                'rowCount': len(response.text.splitlines()) - 1,
                'afidDeduplicationCount': afid_deduplication_count,
                'config': {
                    'url': url,
                    'params': params,
                    'headers': {k: v for k, v in headers.items() if k != 'Authorization'}
                }
            }
        }
        
        # 仅对事件类型数据添加 primaryAttributionCount
        if data_type in event_types:
            response_data['details']['primaryAttributionCount'] = primary_attribution_count

        return response_data
        
    except Exception as e:
        logger.error(f'下载数据时发生错误: {str(e)}')
        return jsonify({'error': str(e)}), 500

# 新增安全分割函数
def safe_split(line, expected_len):
    # 处理末尾有空字段但无逗号的情况
    # 先用 rsplit 保证分割数
    values = [v.strip() for v in line.rstrip('\n').split(',')]
    if len(values) < expected_len:
        values += [''] * (expected_len - len(values))
    elif len(values) > expected_len:
        # 如果多于表头，合并多余部分到最后一列
        values = values[:expected_len-1] + [','.join(values[expected_len-1:])]
    return values

@app.route('/api/apps-finder', methods=['GET'])
def get_apps_finder():
    """
    支持分页：可传 page 和 pageSize 查询参数，返回 { total, data } 格式。
    兼容老用法：无分页参数时返回全部数据。
    """
    try:
        page = request.args.get('page', type=int)
        page_size = request.args.get('pageSize', type=int)
        params = []
        where = []
        # 支持筛选参数
        os = request.args.get('os')
        if os:
            where.append('os=%s')
            params.append(os)
        category = request.args.get('category')
        if category:
            where.append('category=%s')
            params.append(category)
        app_id = request.args.get('appId')
        if app_id:
            where.append('app_id=%s')
            params.append(app_id)
        app_name = request.args.get('appName')
        if app_name:
            where.append('app_name LIKE %s')
            params.append(f'%{app_name}%')
            logger.debug(f"App Name搜索参数: {app_name}")
        wheresql = ('WHERE ' + ' AND '.join(where)) if where else ''
        # 分页逻辑
        if page and page_size:
            offset = (page - 1) * page_size
            # 先查总数
            count_query = f"SELECT COUNT(*) as total FROM apps_finder {wheresql}"
            logger.debug(f"执行计数查询: {count_query} 参数: {params}")
            with get_db_cursor() as cursor:
                cursor.execute(count_query, tuple(params))
                total = cursor.fetchone()['total']
            # 再查当前页
            data_query = f"SELECT * FROM apps_finder {wheresql} ORDER BY updated_at DESC LIMIT %s OFFSET %s"
            page_params = params + [page_size, offset]
            logger.debug(f"执行数据查询: {data_query} 参数: {page_params}")
            with get_db_cursor() as cursor:
                cursor.execute(data_query, tuple(page_params))
                rows = cursor.fetchall()
            result = [
                {
                    "os": row["os"],
                    "appId": row["app_id"],
                    "category": row["category"],
                    "appName": row["app_name"],
                    "developer": row["developer"],
                    "description": row["description"],
                    "url": row["url"]
                }
                for row in rows
            ]
            return jsonify({"total": total, "data": result})
        else:
            # 兼容老用法：全量返回
            query = f"SELECT * FROM apps_finder {wheresql} ORDER BY updated_at DESC"
            with get_db_cursor() as cursor:
                cursor.execute(query, tuple(params))
                rows = cursor.fetchall()
            result = [
                {
                    "os": row["os"],
                    "appId": row["app_id"],
                    "category": row["category"],
                    "appName": row["app_name"],
                    "developer": row["developer"],
                    "description": row["description"],
                    "url": row["url"]
                }
                for row in rows
            ]
            return jsonify(result)
    except Exception as e:
        logger.error(f"获取Apps Finder数据失败: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/apps-finder/upload', methods=['POST'])
def upload_apps_finder():
    """
    批量上传Apps Finder数据，支持常见Excel表头与数据库字段智能映射，顺序自动适配，严格校验
    增加表头和内容的智能清洗，兼容不可见字符、全角空格、BOM等
    """
    import re
    def clean_header(header):
        # 去除所有空白字符、全角空格、BOM等，统一小写
        return re.sub(r'[\s\u3000\uFEFF\xa0]+', '', header).lower()
    def clean_cell(cell):
        if isinstance(cell, str):
            return re.sub(r'^[\s\u3000\uFEFF\xa0]+|[\s\u3000\uFEFF\xa0]+$', '', cell)
        return cell
    try:
        data = request.get_json()
        if not isinstance(data, list) or not data:
            return jsonify({'success': False, 'message': '数据格式错误，需为非空数组'}), 400
        # 数据库字段
        db_fields = ['app_id', 'os', 'app_name', 'developer', 'category', 'description', 'url']
        # 常见表头映射
        field_map = {
            'os': 'os',
            'appid': 'app_id', 'app id': 'app_id', 'app_id': 'app_id',
            'appname': 'app_name', 'app name': 'app_name', 'app_name': 'app_name',
            'developer': 'developer',
            'category': 'category',
            'description': 'description',
            'url': 'url', 'link': 'url',
        }
        # 取首行表头，做映射（清洗）
        first_row = data[0]
        raw_keys = list(first_row.keys())
        excel_fields = [clean_header(k) for k in raw_keys]
        mapped = []
        used = set()
        for dbf in db_fields:
            found = None
            for idx, ef in enumerate(excel_fields):
                if ef in field_map and field_map[ef] == dbf and idx not in used:
                    found = idx
                    used.add(idx)
                    break
            if found is None:
                return jsonify({'success': False, 'message': f'缺少必填字段：{dbf}，请检查表头'}), 400
            mapped.append(found)
        # 检查是否有多余字段（可忽略）
        # 生成插入数据
        valid_rows = []
        errors = []
        for idx, row in enumerate(data):
            row_data = []
            for dbf in db_fields:
                found = False
                for k in row.keys():
                    if field_map.get(clean_header(k)) == dbf:
                        row_data.append(str(clean_cell(row[k])).strip())
                        found = True
                        break
                if not found:
                    row_data.append('')  # 没找到就空
            if any(v == '' for v in row_data):
                errors.append(f'第{idx+1}行有空值')
                continue
            valid_rows.append(tuple(row_data))
        if not valid_rows:
            return jsonify({'success': False, 'message': '无有效数据', 'errors': errors}), 400
        # 批量插入
        with get_db_cursor() as cursor:
            sql = f"""
                INSERT INTO apps_finder (app_id, os, app_name, developer, category, description, url)
                VALUES ({','.join(['%s']*7)})
                AS new
                ON DUPLICATE KEY UPDATE
                    os=new.os,
                    app_name=new.app_name,
                    developer=new.developer,
                    category=new.category,
                    description=new.description,
                    url=new.url,
                    updated_at=CURRENT_TIMESTAMP
            """
            cursor.executemany(sql, valid_rows)
        return jsonify({'success': True, 'inserted': len(valid_rows), 'errors': errors})
    except Exception as e:
        logger.error(f"Apps Finder上传失败: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/apps-finder/categories', methods=['GET'])
def get_all_categories():
    """返回 apps_finder 表中所有唯一非空的 category 列表"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT DISTINCT category FROM apps_finder WHERE category IS NOT NULL AND category != ''")
            rows = cursor.fetchall()
        categories = [row['category'] for row in rows]
        return jsonify(categories)
    except Exception as e:
        logger.error(f"获取所有类目失败: {str(e)}")
        return jsonify([]), 500

@app.route('/api/apps-finder/app-names', methods=['GET'])
def get_all_app_names():
    """返回 apps_finder 表中所有唯一非空的 app_name 列表"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT DISTINCT app_name FROM apps_finder WHERE app_name IS NOT NULL AND app_name != '' ORDER BY app_name")
            rows = cursor.fetchall()
        app_names = [row['app_name'] for row in rows]
        return jsonify(app_names)
    except Exception as e:
        logger.error(f"获取所有应用名称失败: {str(e)}")
        return jsonify([]), 500

@app.route('/api/apps-finder/app-name/<app_id>', methods=['GET'])
def get_app_name_by_id(app_id):
    """
    根据AppID查询对应的App Name
    """
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT app_name FROM apps_finder WHERE app_id = %s LIMIT 1", (app_id,))
            row = cursor.fetchone()
            if row and row['app_name']:
                return jsonify({"appName": row['app_name']})
            else:
                return jsonify({"appName": None})
    except Exception as e:
        logger.error(f"根据AppID查询App Name失败: {str(e)}")
        return jsonify({"appName": None})

@app.route('/api/apps-finder/url/<app_id>', methods=['GET'])
def get_app_url(app_id):
    """
    根据AppID获取对应的应用URL
    """
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT url FROM apps_finder WHERE app_id = %s LIMIT 1", (app_id,))
            row = cursor.fetchone()
            if row and row['url']:
                url = row['url']
                # 检查URL格式
                if url.startswith('http://') or url.startswith('https://'):
                    logger.info(f"获取应用URL: {url}")
                    return jsonify({"url": url})
                else:
                    logger.warning(f"无效的URL格式: {url}")
                    return jsonify({"error": "Invalid URL format"}), 400
            else:
                logger.warning(f"未找到AppID对应的URL: {app_id}")
                return jsonify({"error": "URL not found"}), 404
    except Exception as e:
        logger.error(f"获取应用URL失败: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

def decrypt_token(token: str) -> str:
    try:
        # 判断是否为 base64
        try:
            decoded = base64.b64decode(token).decode()
            # 如果能解码且能再编码回来，说明是加密的
            if base64.b64encode(decoded.encode()).decode() == token:
                return urllib.parse.unquote(decoded)
        except Exception:
            pass
        # 否则直接返回原文
        return token
    except Exception:
        return token

@app.route('/api/account-configs/<account_id>/validate', methods=['POST'])
@token_required
def validate_account_config(current_user, account_id):
    # 1. 查询该账户配置
    with get_db_cursor() as cursor:
        cursor.execute("SELECT api_token FROM account_configs WHERE id=%s", (account_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': 'Account config not found'}), 404
        api_token = row['api_token']
    # 自动解密 token
    api_token = decrypt_token(api_token)

    # 2. 请求 Appsflyer API
    url = "https://hq1.appsflyer.com/api/user-management/v1.0/users"
    headers = {
        "Authorization": f"Bearer {api_token}"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        validate_result = resp.json()
    except Exception as e:
        validate_result = {"error": str(e)}

    # 3. 写入数据库
    with get_db_cursor() as cursor:
        cursor.execute(
            "UPDATE account_configs SET validate=%s WHERE id=%s",
            (json.dumps(validate_result, ensure_ascii=False), account_id)
        )

    # 4. 返回前端
    return jsonify({'validate': validate_result})

@app.route('/api/apps-finder/download', methods=['GET'])
def download_apps_finder():
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT app_id, os, app_name, developer, category, description, url FROM apps_finder")
            rows = cursor.fetchall()
        
        if not rows:
            return jsonify({'success': False, 'message': '没有数据可导出！'}), 400

        # 创建DataFrame格式的数据
        results = []
        for row in rows:
            results.append({
                'platform': row.get('os', ''),
                'app_id': row.get('app_id', ''),
                'app_name': row.get('app_name', ''),
                'developer': row.get('developer', ''),
                'category': row.get('category', ''),
                'description': row.get('description', ''),
                'url': row.get('url', '')
            })

        # 创建Excel工作簿
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = '应用信息'

        # 设置列的顺序
        columns = ['platform', 'app_id', 'app_name', 'developer', 'category', 'description', 'url']
        
        # 格式化列名（标题）
        def format_column_name(col_name):
            words = col_name.replace('_', ' ').split()
            return ' '.join(word.capitalize() for word in words)
        
        formatted_headers = [format_column_name(col) for col in columns]
        
        # 写入标题行
        ws.append(formatted_headers)
        
        # 写入数据行
        for result in results:
            ws.append([
                result.get('platform', ''),
                result.get('app_id', ''),
                result.get('app_name', ''),
                result.get('developer', ''),
                result.get('category', ''),
                result.get('description', ''),
                result.get('url', '')
            ])

        # 定义 Calibri 字体样式
        calibri_font = Font(name='Calibri')
        # 定义 Calibri 粗体样式用于标题
        calibri_bold_font = Font(name='Calibri', bold=True)

        # 设置标题行格式和高度
        header_row = ws[1]
        ws.row_dimensions[1].height = 30  # 增加标题行高度
        for cell in header_row:
            cell.font = calibri_bold_font  # 设置 Calibri 粗体字体
            cell.fill = PatternFill(start_color='CCCCCC', end_color='CCCCCC', fill_type='solid')
            cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            # 移除边框线
            cell.border = Border(
                left=Side(style=None), 
                right=Side(style=None), 
                top=Side(style=None), 
                bottom=Side(style=None)
            )

        # 设置数据行格式和 Calibri 字体
        for row in ws.iter_rows(min_row=2, max_row=len(results) + 1):
            for cell in row:
                # 设置 Calibri 字体
                cell.font = calibri_font
                # 设置垂直和水平居中对齐，并保持文本换行
                cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
            
        # 设置 APP ID 列的数字格式
        try:
            # 使用 .get_loc 安全地查找列索引
            app_id_col_index = formatted_headers.index('App Id')
            app_id_col_letter = openpyxl.utils.get_column_letter(app_id_col_index + 1)
            for cell in ws[app_id_col_letter][1:]:  # APP ID 列
                if cell.value is not None and str(cell.value).isdigit():
                    cell.number_format = '0'  # 设置为数字格式
        except ValueError:
            logger.warning("'App Id' column not found for number formatting.")
        except Exception as e:
            logger.error(f"Error formatting App Id column: {e}")

        # 自适应列宽并处理 Description 列
        for column_index, column in enumerate(ws.columns):
            column_letter = openpyxl.utils.get_column_letter(column_index + 1)
            column_name = formatted_headers[column_index]  # 从格式化后的标题获取列名
            max_length = 0

            # 计算列内容的最大长度
            # 遍历数据行，计算列内容的最大长度（考虑换行）
            for row_index, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
                cell_value = row[column_index]
                if cell_value is not None:
                    # 考虑多行文本的情况，计算最长一行长度
                    lines = str(cell_value).split('\n')
                    max_line_length = max(len(line) for line in lines) if lines else 0
                    max_length = max(max_length, max_line_length)
            
            # 还需要考虑标题行的长度
            header_cell_value = ws.cell(row=1, column=column_index+1).value
            if header_cell_value is not None:
                max_length = max(max_length, len(str(header_cell_value)))

            # 设置列宽
            if column_name == 'Description':
                # Description 列，给一个较小的基础宽度，并允许有限的自适应
                # openpyxl的列宽单位是"字宽"，一个标准字符宽度约为1。30大约是30个字符。
                # 这里设置一个最小值，并根据内容适度增加，但限制最大值
                base_width = 30  # 基础宽度
                content_width_estimate = max_length * 0.8  # 根据内容长度估算宽度，乘以一个因子调整
                adjusted_width = max(base_width, min(content_width_estimate, 80))  # 最小30，最大80
                # 确保宽度至少能显示基础信息，比如"Description"这个单词
                adjusted_width = max(adjusted_width, len(column_name) * 1.2)  # 确保能显示标题
                ws.column_dimensions[column_letter].width = adjusted_width

            else:
                # 其他列，基于内容自适应，并设置合理的最大最小值
                # 稍微调整自适应逻辑，确保不会太挤
                adjusted_width = max_length * 1.1  # 增加一点额外空间
                # 避免宽度过小或过大
                if adjusted_width > 60: 
                    adjusted_width = 60  # 调大最大宽度
                if adjusted_width < 10: 
                    adjusted_width = 10
                # 确保宽度至少能显示标题
                adjusted_width = max(adjusted_width, len(column_name) * 1.2)
                ws.column_dimensions[column_letter].width = adjusted_width

        output = BytesIO()
        wb.save(output)
        output.seek(0)
        from flask import send_file
        return send_file(
            output,
            as_attachment=True,
            download_name='APP-INFO.xlsx',
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    except Exception as e:
        logger.error(f"Apps Finder导出失败: {str(e)}")
        return jsonify({'success': False, 'message': str(e)}), 500

# =====================
# 生产环境推荐用如下命令启动：
# gunicorn --worker-class eventlet -w 1 -b 0.0.0.0:5000 backend.app:app
# 本地开发可直接 python backend/app.py
# =====================

@app.route('/api/query-logs/<query_log_id>/preview', methods=['GET'])
def preview_query_log(query_log_id):
    """预览查询日志的数据 - 专门为 Home 页面提供"""
    try:
        # 从请求中获取账户信息
        account_type = request.args.get('accountType')
        account_id = request.args.get('accountId')
        
        if not account_type or not account_id:
            logger.error("缺少账户信息")
            return jsonify({"error": "缺少账户信息"}), 400
            
        # 从 query_logs 表获取查询日志信息
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT * FROM query_logs 
                WHERE id = %s AND account_type = %s AND account_id = %s
            """, (query_log_id, account_type, account_id))
            result = cursor.fetchone()
            
            if not result:
                logger.warning(f"查询日志不存在: {query_log_id}")
                return jsonify({
                    'status': 'error',
                    'message': '查询日志不存在'
                }), 404
            
            # 获取下载URL
            download_url = result.get('download_url')
            if download_url:
                logger.info(f"找到下载URL: {download_url}")
                # 从download_url中提取文件路径
                if download_url.startswith('/api/download/'):
                    filename = download_url.replace('/api/download/', '')
                    file_path = os.path.join('temp', filename)
                    logger.info(f"使用文件路径: {file_path}")
                    
                    if os.path.exists(file_path):
                        # 读取文件前20行作为预览
                        preview_data = []
                        try:
                            with open(file_path, 'r', encoding='utf-8') as f:
                                # 读取标题行
                                headers = f.readline().strip().split(',')
                                
                                # 过滤空字段，只保留有内容的字段
                                non_empty_headers = []
                                for i, header in enumerate(headers):
                                    if header.strip():  # 只保留非空的字段名
                                        non_empty_headers.append((i, header.strip()))
                                
                                # 使用csv.reader快速读取前20行
                                import csv
                                reader = csv.reader(f)
                                for i, row in enumerate(reader):
                                    if i >= 20:  # 设置为20行
                                        break
                                    # 确保row长度与headers一致
                                    while len(row) < len(headers):
                                        row.append('')
                                    
                                    # 只保留非空字段的数据，保持原始顺序
                                    filtered_row = {}
                                    for col_index, header_name in non_empty_headers:
                                        value = row[col_index] if col_index < len(row) else ''
                                        if value.strip():  # 只保留非空值
                                            filtered_row[header_name] = value.strip()
                                    
                                    preview_data.append(filtered_row)
                                
                        except Exception as e:
                            logger.error(f"读取文件失败: {str(e)}")
                            return jsonify({
                                'status': 'error',
                                'message': f'读取文件失败: {str(e)}'
                            }), 500
                        
                        return jsonify(preview_data)
                    else:
                        logger.error(f"文件不存在: {file_path}")
                        return jsonify({
                            'status': 'error',
                            'message': '文件不存在'
                        }), 404
                else:
                    logger.error(f"无效的下载URL格式: {download_url}")
                    return jsonify({
                        'status': 'error',
                        'message': '无效的下载URL格式'
                    }), 400
        
        # 如果没有关联的download_url，返回错误
        logger.error(f"未找到关联的下载URL")
        return jsonify({
            'status': 'error',
            'message': '未找到关联的文件'
        }), 404
        
    except Exception as e:
        logger.error(f"预览查询日志失败: {str(e)}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/global-account-configs', methods=['GET'])
def get_global_account_configs():
    """获取所有账户配置，不区分用户权限"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, account_name, account_type, api_token, is_default, sort_order, updated_at 
                FROM account_configs 
                ORDER BY sort_order ASC, account_type, account_name, updated_at DESC
            """)
            configs = cursor.fetchall()
            
            # 使用字典去重，保留最新的记录
            unique_configs = {}
            for config in configs:
                try:
                    # 确保所有必需的字段都存在
                    if all(key in config for key in ['id', 'account_name', 'account_type', 'api_token', 'is_default']):
                        key = f"{config['account_name']}_{config['account_type']}"
                        if key not in unique_configs:
                            unique_configs[key] = config
                except Exception as e:
                    logger.debug(f"处理记录时出错: {str(e)}, 记录: {config}")
                    continue
                
            config_list = list(unique_configs.values())
            logger.info(f"成功获取 {len(config_list)} 条全局账户配置")
            return jsonify({'configs': config_list})
            
    except Exception as e:
        logger.error(f"获取全局账户配置时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@app.route('/api/users', methods=['GET'])
def get_users():
    """获取所有用户列表，用于Manager筛选"""
    try:
        with get_db_cursor() as cursor:
            # 直接从users表查询所有用户
            cursor.execute("""
                SELECT username 
                FROM users 
                WHERE username IS NOT NULL AND username != ''
                ORDER BY username ASC
            """)
            rows = cursor.fetchall()
            
            # 提取用户名列表
            usernames = [row['username'] for row in rows if row['username']]
            
            logger.info(f"成功获取 {len(usernames)} 个用户")
            return jsonify({'usernames': usernames})
            
    except Exception as e:
        logger.error(f"获取用户列表时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@app.route('/api/apps-finder/app-ids', methods=['GET'])
def get_all_app_ids():
    """返回 apps_finder 表中所有唯一非空的 app_id 列表"""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT DISTINCT app_id FROM apps_finder WHERE app_id IS NOT NULL AND app_id != '' ORDER BY app_id")
            rows = cursor.fetchall()
        app_ids = [row['app_id'] for row in rows]
        return jsonify(app_ids)
    except Exception as e:
        logger.error(f"获取所有应用ID失败: {str(e)}")
        return jsonify([]), 500

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000) 