from flask import Blueprint, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
import os
from functools import wraps
from database.db import get_db_cursor
import base64
import logging

# 创建认证蓝图（添加url_prefix）
auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# 为蓝图添加CORS支持
CORS(auth_bp, resources={
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
        "supports_credentials": True,
        "expose_headers": [
            "Content-Type", 
            "Content-Disposition",
            "X-Environment",
            "X-API-Key"
        ],
        "max_age": 3600
    }
})

# JWT配置
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key')  # 在生产环境中应该使用环境变量
JWT_ACCESS_TOKEN_EXPIRES = datetime.timedelta(hours=12)

logger = logging.getLogger(__name__)

def get_user_by_id(user_id):
    """从数据库获取用户信息（按id）"""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        while cursor.nextset():
            pass
        return user

def get_user_by_email(email):
    """从数据库获取用户信息（按email）"""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM users WHERE email = %s", (email.lower(),))
        user = cursor.fetchone()
        while cursor.nextset():
            pass
        return user

def update_last_login_by_id(user_id):
    """更新用户最后登录时间（按id）"""
    with get_db_cursor() as cursor:
        cursor.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = %s", (user_id,))
        while cursor.nextset():
            pass

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                # 检查是否是Bearer token
                if auth_header.startswith('Bearer '):
                    token = auth_header.split(" ")[1]
                else:
                    token = auth_header
            except IndexError:
                return jsonify({'message': 'Invalid token format'}), 401

        if not token:
            return jsonify({'message': 'Token is missing'}), 401

        try:
            # 尝试解码JWT token
            data = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
            current_user = data['id']
            logger.debug(f"Token验证成功，用户ID: {current_user}")
        except jwt.ExpiredSignatureError:
            logger.warning("Token已过期")
            return jsonify({'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning(f"无效的Token: {str(e)}")
            return jsonify({'message': 'Invalid token'}), 401
        except Exception as e:
            logger.error(f"Token验证过程出错: {str(e)}")
            return jsonify({'message': 'Token validation failed'}), 401

        return f(current_user, *args, **kwargs)
    return decorated

@auth_bp.route('/login', methods=['POST', 'OPTIONS'])
def login():
    logger.debug('=== 开始处理登录请求 ===')
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
    
    if request.method == 'OPTIONS':
        logger.debug('处理OPTIONS请求')
        response = jsonify({'status': 'ok'})
        # 根据环境设置 CORS 头
        if os.getenv('IS_LOCAL', 'false').lower() == 'true':
            response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
        else:
            response.headers.add('Access-Control-Allow-Origin', 'http://8.222.149.42')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        logger.debug('OPTIONS响应头: %s', dict(response.headers))
        return response
    
    data = request.get_json()
    logger.debug('请求数据: %s', data)
    
    if not data or not data.get('email') or not data.get('password'):
        logger.debug('缺少邮箱或密码')
        return jsonify({'message': 'Missing email or password'}), 400

    email = data.get('email').lower()
    password = data.get('password')
    logger.debug('尝试登录邮箱: %s', email)

    # 用email查找用户
    user = get_user_by_email(email)
    if not user:
        logger.debug('用户不存在: %s', email)
        return jsonify({'message': 'Invalid email or password'}), 401
    logger.debug('找到用户: %s, 角色: %s', user['email'], user['role'])

    try:
        logger.debug('开始验证密码')
        logger.debug('数据库中的密码哈希: %s', user['password'])
        logger.debug('用户输入的密码: %s', password)
        if not check_password_hash(user['password'], password):
            logger.debug('密码验证失败: %s', email)
            return jsonify({'message': 'Invalid email or password'}), 401
        logger.debug('密码验证成功')
    except Exception as e:
        logger.debug('密码验证过程出错: %s', str(e))
        return jsonify({'message': 'Invalid email or password'}), 401

    # 更新最后登录时间
    try:
        update_last_login_by_id(email)
        logger.debug('更新最后登录时间成功')
    except Exception as e:
        logger.debug('更新最后登录时间失败: %s', str(e))

    # 生成JWT token
    try:
        token = jwt.encode({
            'id': user['id'],
            'role': user['role'],
            'exp': datetime.datetime.utcnow() + JWT_ACCESS_TOKEN_EXPIRES
        }, JWT_SECRET_KEY)
        logger.debug('JWT token生成成功')
    except Exception as e:
        logger.debug('JWT token生成失败: %s', str(e))
        return jsonify({'message': 'Token generation failed'}), 500

    response = jsonify({
        'token': token,
        'user': {
            'id': user['id'],
            'email': user['email'],
            'role': user['role'],
            'apiToken': user.get('api_token'),
            'appId': user.get('app_id'),
            'appName': user.get('app_name')
        }
    })
    # 根据环境设置 CORS 头
    if os.getenv('IS_LOCAL', 'false').lower() == 'true':
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
    else:
        response.headers.add('Access-Control-Allow-Origin', 'http://8.222.149.42')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    logger.debug('登录成功，返回响应')
    return response

@auth_bp.route('/verify', methods=['GET'])
@token_required
def verify_token(current_user):
    user = get_user_by_id(current_user)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    return jsonify({
        'message': 'Token is valid',
        'user': {
            'email': user['email'],
            'role': user['role']
        }
    })

@auth_bp.route('/users', methods=['GET'])
@token_required
def get_users(current_user):
    # 检查当前用户是否为超级管理员
    user = get_user_by_id(current_user)
    if not user or user['role'] != 'Super Admin':
        return jsonify({'message': 'Unauthorized'}), 403
    
    # 从数据库获取用户列表
    with get_db_cursor() as cursor:
        cursor.execute("SELECT email, role, created_at, last_login FROM users")
        users = cursor.fetchall()
    
    return jsonify(users)

@auth_bp.route('/users', methods=['POST'])
@token_required
def add_user(current_user):
    # 检查当前用户是否为超级管理员
    user = get_user_by_id(current_user)
    if not user or user['role'] != 'Super Admin':
        return jsonify({'message': 'Unauthorized'}), 403

    data = request.get_json()
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'message': 'Missing email or password'}), 400

    email = data.get('email').lower()
    password = data.get('password')

    # 验证邮箱格式
    if not email.endswith('@smartlead.tech'):
        return jsonify({'message': 'Email must be from @smartlead.tech domain'}), 400

    # 检查用户是否已存在
    existing_user = get_user_by_id(email)
    if existing_user:
        return jsonify({'message': 'User already exists'}), 400

    # 添加新用户到数据库
    with get_db_cursor() as cursor:
        cursor.execute(
            "INSERT INTO users (id, email, password, role) VALUES (UUID(), %s, %s, %s)",
            (email, generate_password_hash(password, method='pbkdf2:sha256'), 'User')
        )

    return jsonify({'message': 'User added successfully'}), 201

@auth_bp.route('/change-password', methods=['POST'])
@token_required
def change_password(current_user):
    data = request.get_json()
    if not data or not data.get('currentPassword') or not data.get('newPassword'):
        return jsonify({'message': 'Missing current password or new password'}), 400

    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')

    # 获取用户信息
    user = get_user_by_id(current_user)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    # 验证当前密码
    if not check_password_hash(user['password'], current_password):
        return jsonify({'message': 'Current password is incorrect'}), 401

    # 新密码不能和旧密码一致
    if check_password_hash(user['password'], new_password):
        return jsonify({'message': 'New password cannot be the same as the old password.'}), 400

    # 更新密码
    with get_db_cursor() as cursor:
        cursor.execute(
            "UPDATE users SET password = %s WHERE id = %s",
            (generate_password_hash(new_password, method='pbkdf2:sha256'), current_user)
        )

    return jsonify({'message': 'Password changed successfully'})

@auth_bp.route('/user-info', methods=['GET'])
@token_required
def get_user_info(current_user):
    user = get_user_by_id(current_user)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    return jsonify({
        'email': user['email'],
        'username': user['username'] or user['email'].split('@')[0],  # 如果没有用户名，使用邮箱前缀
        'role': user['role'],
        'last_login': user['last_login'],
        'avatar': user['avatar']  # 添加头像信息
    })

@auth_bp.route('/update-profile', methods=['POST'])
@token_required
def update_profile(current_user):
    data = request.get_json()
    if not data:
        return jsonify({'message': 'No data provided'}), 400

    username = data.get('username')
    avatar = data.get('avatar')  # 获取头像数据

    if not username:
        return jsonify({'message': 'Username is required'}), 400

    # 更新用户名和头像
    with get_db_cursor() as cursor:
        if avatar:
            cursor.execute(
                "UPDATE users SET username = %s, avatar = %s WHERE id = %s",
                (username, avatar, current_user)
            )
        else:
            cursor.execute(
                "UPDATE users SET username = %s WHERE id = %s",
                (username, current_user)
            )

    return jsonify({
        'message': 'Profile updated successfully',
        'username': username,
        'avatar': avatar
    })

@auth_bp.route('/update-avatar', methods=['POST'])
@token_required
def update_avatar(current_user):
    try:
        data = request.get_json()
        if not data or not data.get('avatar'):
            return jsonify({'message': 'No avatar data provided'}), 400

        avatar = data.get('avatar')
        logger.debug(f"收到头像更新请求，用户: {current_user}, 数据长度: {len(avatar)}")
        
        # 验证头像数据是否为base64格式
        try:
            if not avatar.startswith('data:image'):
                return jsonify({'message': 'Invalid avatar format'}), 400
        except Exception as e:
            logger.debug(f"头像格式验证失败: {str(e)}")
            return jsonify({'message': 'Invalid avatar data'}), 400

        # 更新头像
        try:
            with get_db_cursor() as cursor:
                cursor.execute(
                    "UPDATE users SET avatar = %s WHERE id = %s",
                    (avatar, current_user)
                )
                logger.debug(f"头像更新成功，用户: {current_user}")
        except Exception as e:
            logger.debug(f"数据库更新失败: {str(e)}")
            return jsonify({'message': 'Failed to update avatar in database'}), 500

        return jsonify({
            'message': 'Avatar updated successfully',
            'avatar': avatar[:100] + '...'  # 只返回部分数据用于日志
        })
    except Exception as e:
        logger.debug(f"头像更新过程发生错误: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

@auth_bp.route('/account-configs', methods=['GET'])
@token_required
def get_account_configs(current_user):
    try:
        logger.debug(f"[DEBUG] 开始获取账户配置，当前用户: {current_user}")
        # 获取当前用户的ID
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (current_user,))
            user_info = cursor.fetchone()
            if not user_info:
                logger.debug(f"[DEBUG] 用户未找到: {current_user}")
                return jsonify({'message': 'User not found'}), 404
            user_id = user_info['id']
            logger.debug(f"[DEBUG] 查到的user_id: {user_id}")
            sql_param = f'\"{user_id}\"'
            logger.debug(f"[DEBUG] SQL参数: {sql_param}")
            cursor.execute("""
                SELECT id, account_name, account_type, api_token, is_default, sort_order, updated_at 
                FROM account_configs 
                WHERE user_ids IS NULL OR JSON_CONTAINS(user_ids, %s)
                ORDER BY sort_order ASC, account_type, account_name, updated_at DESC
            """, (f'"{user_id}"',))
            configs = cursor.fetchall()
            logger.debug(f"[DEBUG] 查到的configs数量: {len(configs)}")
            
            # 输出所有配置记录
            for config in configs:
                logger.debug(f"配置记录: {config}")
            
            # 使用字典去重，保留最新的记录
            unique_configs = {}
            for config in configs:
                try:
                    # 确保所有必需的字段都存在
                    if all(key in config for key in ['id', 'account_name', 'account_type', 'api_token', 'is_default']):
                        key = f"{config['account_name']}_{config['account_type']}"
                        if key not in unique_configs:
                            unique_configs[key] = config
                            logger.debug(f"添加配置: {key} -> {config}")
                    else:
                        logger.debug(f"记录缺少必需字段: {config}")
                except Exception as e:
                    logger.debug(f"处理记录时出错: {str(e)}, 记录: {config}")
                    continue
                
            config_list = list(unique_configs.values())
            logger.debug(f"成功处理 {len(config_list)} 条配置记录")
            return jsonify({'configs': config_list})
            
    except Exception as e:
        logger.debug(f"获取账户配置时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@auth_bp.route('/account-configs', methods=['POST'])
@token_required
def add_account_config(current_user):
    try:
        data = request.get_json()
        account_name = data.get('account_name')
        account_type = data.get('account_type')
        api_token = data.get('api_token')
        
        if not all([account_name, account_type, api_token]):
            return jsonify({'message': 'Missing required fields'}), 400
        
        # 获取当前用户user_id
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (current_user,))
            user_info = cursor.fetchone()
            if not user_info:
                return jsonify({'message': 'User not found'}), 404
            user_id = user_info['id']
            # 新增配置时user_ids字段只包含当前用户
            cursor.execute(
                "INSERT INTO account_configs (id, account_name, account_type, api_token, user_ids) VALUES (UUID(), %s, %s, %s, %s)",
                (account_name, account_type, api_token, '["{}"]'.format(user_id))
            )
            logger.debug(f"成功添加账户配置: {account_name}, user_ids: ['{user_id}']")
            return jsonify({'message': 'Account config added successfully'})
    except Exception as e:
        logger.debug(f"添加账户配置时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@auth_bp.route('/account-configs/<config_id>', methods=['DELETE'])
@token_required
def delete_account_config(current_user, config_id):
    try:
        logger.debug(f"开始删除账户配置，配置ID: {config_id}")
        
        with get_db_cursor() as cursor:
            # 首先检查配置是否存在
            cursor.execute("SELECT is_default FROM account_configs WHERE id = %s", (config_id,))
            config = cursor.fetchone()
            
            if not config:
                logger.debug(f"配置不存在: {config_id}")
                return jsonify({'message': 'Account config not found'}), 404
                
            # 检查是否为默认配置
            if config.get('is_default'):
                logger.debug(f"不能删除默认配置: {config_id}")
                return jsonify({'message': 'Cannot delete default account config'}), 403
            
            # 执行删除操作
            cursor.execute("DELETE FROM account_configs WHERE id = %s", (config_id,))
            logger.debug(f"成功删除账户配置: {config_id}")
            
            return jsonify({'message': 'Account config deleted successfully'})
            
    except Exception as e:
        logger.debug(f"删除账户配置时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@auth_bp.route('/account-configs/order', methods=['PUT'])
@token_required
def update_account_config_order(current_user):
    """更新账户配置的排序"""
    try:
        data = request.get_json()
        config_orders = data.get('config_orders', [])
        
        if not config_orders or not isinstance(config_orders, list):
            return jsonify({'message': 'Invalid config orders data'}), 400
        
        # 获取当前用户user_id
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (current_user,))
            user_info = cursor.fetchone()
            if not user_info:
                return jsonify({'message': 'User not found'}), 404
            user_id = user_info['id']
            
            # 首先验证所有配置都属于当前用户
            config_ids = [order_data.get('id') for order_data in config_orders if order_data.get('id')]
            logger.debug(f"用户 {user_id} 请求更新配置排序: {config_ids}")
            
            if config_ids:
                placeholders = ','.join(['%s'] * len(config_ids))
                cursor.execute(f"""
                    SELECT id FROM account_configs 
                    WHERE id IN ({placeholders}) 
                    AND (user_ids IS NULL OR JSON_CONTAINS(user_ids, %s))
                """, config_ids + [f'"{user_id}"'])
                
                user_configs = {row['id'] for row in cursor.fetchall()}
                requested_configs = set(config_ids)
                
                logger.debug(f"用户 {user_id} 拥有的配置: {user_configs}")
                logger.debug(f"用户 {user_id} 请求的配置: {requested_configs}")
                
                # 检查是否有不属于当前用户的配置
                if not requested_configs.issubset(user_configs):
                    unauthorized_configs = requested_configs - user_configs
                    logger.warning(f"用户 {user_id} 尝试更新不属于自己的配置: {unauthorized_configs}")
                    return jsonify({'message': 'Unauthorized access to account configs'}), 403
            
            # 更新每个配置的排序（只更新属于当前用户的配置）
            updated_count = 0
            for order_data in config_orders:
                config_id = order_data.get('id')
                sort_order = order_data.get('sort_order', 0)
                
                if config_id:
                    # 确保只更新属于当前用户的配置
                    cursor.execute(
                        "UPDATE account_configs SET sort_order = %s WHERE id = %s AND (user_ids IS NULL OR JSON_CONTAINS(user_ids, %s))",
                        (sort_order, config_id, f'"{user_id}"')
                    )
                    if cursor.rowcount > 0:
                        updated_count += 1
                        logger.debug(f"用户 {user_id} 更新配置 {config_id} 排序为 {sort_order}")
            
            logger.debug(f"用户 {user_id} 成功更新了 {updated_count} 个配置的排序")
            
            return jsonify({'message': 'Account config order updated successfully'})
    except Exception as e:
        logger.debug(f"更新账户配置排序时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@auth_bp.route('/account-configs/<config_id>', methods=['PUT'])
@token_required
def update_account_config(current_user, config_id):
    try:
        data = request.get_json()
        account_name = data.get('account_name')
        account_type = data.get('account_type')
        api_token = data.get('api_token')
        
        if not all([account_name, account_type, api_token]):
            return jsonify({'message': 'Missing required fields'}), 400
            
        with get_db_cursor() as cursor:
            cursor.execute(
                "UPDATE account_configs SET account_name = %s, account_type = %s, api_token = %s WHERE id = %s",
                (account_name, account_type, api_token, config_id)
            )
            logger.debug(f"成功更新账户配置: {account_name}")
            return jsonify({'message': 'Account config updated successfully'})
    except Exception as e:
        logger.debug(f"更新账户配置时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500 