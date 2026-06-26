from flask import Blueprint, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import jwt  # type: ignore[import-untyped]
import datetime
import os
from functools import wraps
from database.db import get_db_cursor
import base64
import urllib.parse
import requests
from typing import Any, Dict
import logging
import json
import uuid
import re
import random
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from threading import Lock

# Auth blueprint (with url_prefix)
auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

# CORS: set CORS_ORIGINS (comma-separated) in backend.env for production
_default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_extra_origins = [s.strip() for s in (os.getenv('CORS_ORIGINS') or '').split(',') if s.strip()]
CORS_ORIGINS_LIST = _default_origins + _extra_origins
CORS(auth_bp, resources={
    r"/*": {
        "origins": CORS_ORIGINS_LIST,
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

# JWT config
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'change-me-in-production')  # Set via env in production

# CORS — set CORS_ORIGIN in /etc/appsflyer/backend.env for production
def _cors_origin() -> str:
    if os.getenv('IS_LOCAL', 'false').lower() == 'true':
        return os.getenv('CORS_ORIGIN_LOCAL', 'http://localhost:3000')
    return os.getenv('CORS_ORIGIN', 'http://localhost:3000')


def _apply_cors(response):
    response.headers.add('Access-Control-Allow-Origin', _cors_origin())
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response
JWT_ACCESS_TOKEN_EXPIRES = datetime.timedelta(hours=12)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Account verify: AppsFlyer user-management + Push API (event-types / fields) -> account_configs
# Shared by account-configs create/update here and app.py /api/account-configs/<id>/validate
# ---------------------------------------------------------------------------

def decrypt_account_api_token(token: str) -> str:
    """Decrypt/restore api_token stored by the frontend (legacy-compatible)."""
    try:
        try:
            decoded = base64.b64decode(token).decode()
            if base64.b64encode(decoded.encode()).decode() == token:
                return urllib.parse.unquote(decoded)
        except Exception:
            pass
        return token
    except Exception:
        return token


# event-types path param accepts appsflyer or skadnetwork only (not partner/agency)
PUSHAPI_EVENT_TYPES_ENTITIES = ("appsflyer", "skadnetwork")
PUSHAPI_FIELD_PLATFORMS = ("android", "ios")


def _pushapi_get_json(url: str, api_token: str, timeout: int = 25):
    headers = {
        "accept": "application/json, text/plain, */*",
        "Authorization": f"Bearer {api_token}",
    }
    resp = requests.get(url, headers=headers, timeout=timeout)
    if resp.status_code == 200:
        try:
            return resp.json()
        except Exception:
            return {
                "error": "invalid_json_body",
                "http_status": resp.status_code,
                "body_snippet": (resp.text or "")[:1200],
                "url": url,
            }
    err_body: dict = {
        "error": f"HTTP {resp.status_code}",
        "http_status": resp.status_code,
        "url": url,
        "body_snippet": (resp.text or "")[:1200],
    }
    try:
        err_body["details"] = resp.json()
    except Exception:
        pass
    return err_body


def _fetch_pushapi_account_event_types(api_token: str) -> dict:
    """
    Try appsflyer first; fall back to skadnetwork on failure.
    Returns first_success or both attempt results for debugging.
    """
    attempts = []
    first_ok = None
    for entity in PUSHAPI_EVENT_TYPES_ENTITIES:
        url = f"https://hq1.appsflyer.com/api/pushapi/v1.0/event-types/{entity}"
        result = _pushapi_get_json(url, api_token)
        attempts.append({"attributing_entity": entity, "result": result})
        if isinstance(result, dict) and not result.get("error"):
            first_ok = {
                "attributing_entity": entity,
                "data": result,
            }
            break
    if first_ok is not None:
        return first_ok
    return {
        "error": "all_event_types_entities_failed",
        "attempts": attempts,
    }


def _fetch_pushapi_account_message_fields(api_token: str) -> dict:
    now_iso = datetime.datetime.utcnow().isoformat() + "Z"
    by_platform: Dict[str, object] = {}
    for platform in PUSHAPI_FIELD_PLATFORMS:
        url = f"https://hq1.appsflyer.com/api/pushapi/v1.0/fields/{platform}"
        by_platform[platform] = _pushapi_get_json(url, api_token)
    return {"fetched_at": now_iso, "by_platform": by_platform}


def sync_account_verify_to_db(account_id: str) -> Dict[str, Any]:
    """
    Load token/account_type from DB, call AppsFlyer, persist validate / account_event_types / account_message_fields.
    """
    with get_db_cursor() as cursor:
        cursor.execute(
            "SELECT api_token, account_type FROM account_configs WHERE id=%s", (account_id,)
        )
        row = cursor.fetchone()
        if not row:
            return {
                "error": "Account config not found",
                "validate": None,
                "token_valid": False,
            }

        api_token = decrypt_account_api_token(row["api_token"])

    url = "https://hq1.appsflyer.com/api/user-management/v1.0/users"
    headers = {"Authorization": f"Bearer {api_token}"}
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        validate_result = resp.json()
    except Exception as e:
        validate_result = {"error": str(e)}

    event_types_obj = None
    message_fields_obj = None
    token_valid = False
    if isinstance(validate_result, dict) and not validate_result.get("error"):
        users = validate_result.get("users")
        if isinstance(users, list) and len(users) > 0:
            token_valid = True
    if token_valid:
        try:
            event_types_obj = _fetch_pushapi_account_event_types(api_token)
            message_fields_obj = _fetch_pushapi_account_message_fields(api_token)
        except Exception as meta_err:
            logger.warning("pushapi event-types/fields fetch failed: %s", meta_err)
            now_iso = datetime.datetime.utcnow().isoformat() + "Z"
            event_types_obj = {"error": str(meta_err), "fetched_at": now_iso}
            message_fields_obj = {"error": str(meta_err), "fetched_at": now_iso}

    validate_json = json.dumps(validate_result, ensure_ascii=False)
    empty_obj_json = json.dumps({}, ensure_ascii=False)

    with get_db_cursor() as cursor:
        if token_valid:
            cursor.execute(
                """UPDATE account_configs SET validate=%s,
                       account_event_types=%s, account_message_fields=%s
                       WHERE id=%s""",
                (
                    validate_json,
                    json.dumps(event_types_obj, ensure_ascii=False) if event_types_obj is not None else empty_obj_json,
                    json.dumps(message_fields_obj, ensure_ascii=False) if message_fields_obj is not None else empty_obj_json,
                    account_id,
                ),
            )
        else:
            # Columns are NOT NULL: write empty JSON object on validation failure
            cursor.execute(
                """UPDATE account_configs SET validate=%s,
                       account_event_types=%s, account_message_fields=%s
                       WHERE id=%s""",
                (validate_json, empty_obj_json, empty_obj_json, account_id),
            )

    out: Dict[str, Any] = {
        "validate": validate_result,
        "token_valid": token_valid,
    }
    if token_valid:
        out["account_event_types"] = event_types_obj
        out["account_message_fields"] = message_fields_obj
    else:
        out["account_event_types"] = {}
        out["account_message_fields"] = {}
    return out


def build_validate_api_payload(sync_result: Dict[str, Any]) -> Dict[str, Any]:
    """Match POST /validate response body (empty event_types / message_fields when token invalid)."""
    payload: Dict[str, Any] = {"validate": sync_result["validate"]}
    if sync_result.get("token_valid"):
        payload["account_event_types"] = sync_result.get("account_event_types")
        payload["account_message_fields"] = sync_result.get("account_message_fields")
    else:
        payload["account_event_types"] = sync_result.get("account_event_types") or {}
        payload["account_message_fields"] = sync_result.get("account_message_fields") or {}
    return payload


def get_user_by_id(user_id):
    """Fetch user by id from the database."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()
        while cursor.nextset():
            pass
        return user

def get_user_by_email(email):
    """Fetch user by email from the database."""
    with get_db_cursor() as cursor:
        cursor.execute("SELECT * FROM users WHERE email = %s", (email.lower(),))
        user = cursor.fetchone()
        while cursor.nextset():
            pass
        return user

def update_last_login_by_id(user_id):
    """Update user last_login timestamp by id."""
    try:
        with get_db_cursor() as cursor:
            # Query current UTC time (avoids timezone issues)
            cursor.execute("SELECT UTC_TIMESTAMP() as utc_now")
            current_time = cursor.fetchone()
            logger.info(f"当前UTC时间: {current_time['utc_now'] if current_time else 'Unknown'}")
            
            # Update last_login with UTC time
            cursor.execute("UPDATE users SET last_login = UTC_TIMESTAMP() WHERE id = %s", (user_id,))
            rows_affected = cursor.rowcount
            logger.info(f"更新last_login影响行数: {rows_affected}")
            
            # Verify update
            cursor.execute("SELECT last_login FROM users WHERE id = %s", (user_id,))
            updated_user = cursor.fetchone()
            if updated_user:
                logger.info(f"更新后的last_login: {updated_user['last_login']}")
            else:
                logger.warning(f"未找到用户ID: {user_id}")
            
            while cursor.nextset():
                pass
    except Exception as e:
        logger.error(f"更新last_login失败: {str(e)}")
        raise e

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                # Check for Bearer token
                if auth_header.startswith('Bearer '):
                    token = auth_header.split(" ")[1]
                else:
                    token = auth_header
            except IndexError:
                return jsonify({'message': 'Invalid token format'}), 401

        if not token:
            return jsonify({'message': 'Token is missing'}), 401

        try:
            data = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
            current_user = data['id']
        except jwt.ExpiredSignatureError:
            logger.warning("Token expired")
            return jsonify({'message': 'Token has expired'}), 401
        except jwt.InvalidTokenError as e:
            logger.warning("Invalid token: %s", e)
            return jsonify({'message': 'Invalid token'}), 401
        except Exception as e:
            logger.error(f"Token验证过程出错: {str(e)}")
            logger.error(f"异常类型: {type(e).__name__}")
            return jsonify({'message': 'Token validation failed'}), 500

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
        # Set CORS headers per environment
        response.headers.add('Access-Control-Allow-Origin', _cors_origin())
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

    # Look up user by email
    user = get_user_by_email(email)
    if not user:
        logger.debug('用户不存在: %s', email)
        return jsonify({'message': 'Invalid email or password'}), 401
    logger.debug('找到用户: %s, 角色: %s, ID: %s', user['email'], user['role'], user.get('id'))
    logger.debug('完整用户对象: %s', user)

    try:
        if not check_password_hash(user['password'], password):
            logger.debug('Password verification failed for: %s', email)
            return jsonify({'message': 'Invalid email or password'}), 401
    except Exception as e:
        logger.debug('Password verification error: %s', e)
        return jsonify({'message': 'Invalid email or password'}), 401

    # Update last login time
    try:
        logger.info(f"开始更新用户 {user['id']} 的最后登录时间")
        update_last_login_by_id(user['id'])  # Use user['id'], not email
        logger.info('更新最后登录时间成功')
        
        # Verify update result
        updated_user = get_user_by_id(user['id'])
        if updated_user and updated_user.get('last_login'):
            logger.info('验证更新结果 - 新的last_login: %s', updated_user['last_login'])
        else:
            logger.warning('警告: 更新后无法获取新的last_login')
    except Exception as e:
        logger.error('更新最后登录时间失败: %s', str(e))

    # Generate JWT token
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

    # Check whether 2FA is enabled
    two_factor_enabled = user.get('two_factor_enabled', False)
    
    if two_factor_enabled:
        # 2FA enabled: issue a secure temporary identifier
        logger.debug('用户启用2FA，生成临时标识符')
        
        # Random temp id with no sensitive data
        import secrets
        temp_identifier = secrets.token_urlsafe(32)  # 32-byte random identifier
        
        # Store temp auth in users table (5-minute expiry)
        with get_db_cursor() as cursor:
            cursor.execute(
                "UPDATE users SET temp_auth_identifier = %s, temp_auth_expires = %s WHERE id = %s",
                (temp_identifier, datetime.datetime.now() + datetime.timedelta(minutes=5), user['id'])
            )
        
        response_data = {
            'requires_2fa': True,
            'temp_identifier': temp_identifier,  # Secure opaque identifier
            'user': {
                'email': user['email'],
                'username': user.get('username')
            }
        }
        logger.info(f"返回2FA要求响应: {response_data}")
        response = jsonify(response_data)
    else:
        # 2FA not enabled: normal login
        logger.debug('用户未启用2FA，正常登录')
        response = jsonify({
            'token': token,
            'user': {
                'id': user['id'],
                'email': user['email'],
                'role': user.get('role', 'Authenticated User'),
                'username': user.get('username', user['email'].split('@')[0])
            }
        })
    # Set CORS headers per environment
    _apply_cors(response)
    logger.debug('登录成功，返回响应')
    return response


def _is_valid_email(email):
    """Basic email format validation."""
    if not email or not isinstance(email, str):
        return False
    return bool(re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email.strip().lower()))


# Registration verification cache: email -> {'code': str, 'expires_at': datetime}
_verification_store = {}
_verification_lock = Lock()
# Password-reset verification cache (separate from registration)
_reset_verification_store = {}
_reset_verification_lock = Lock()
VERIFICATION_EXPIRE_MINUTES = 10


def _generate_six_digit_code():
    return ''.join(str(random.randint(0, 9)) for _ in range(6))


def _send_email_via_smtp(to_email: str, subject: str, body_text: str) -> bool:
    """Send email via SMTP. If SMTP_USER/SMTP_PASSWORD unset, log only and return True (dev).
    Tip: use SendGrid when Gmail is unavailable (SMTP_HOST=smtp.sendgrid.net, PORT=587, USER=apikey, PASSWORD=API Key); see backend/systemd/README.md."""
    host = (os.getenv('SMTP_HOST') or 'smtp.gmail.com').strip()
    port = int((os.getenv('SMTP_PORT') or '465').strip() or '465')
    user = (os.getenv('SMTP_USER') or '').strip()
    password_smtp = (os.getenv('SMTP_PASSWORD') or '').strip()
    from_addr = (os.getenv('SMTP_FROM') or user or 'noreply@example.com').strip()
    use_ssl = (os.getenv('SMTP_USE_SSL') or '1').strip().lower() in ('1', 'true', 'yes')
    if not user or not password_smtp:
        logger.info('SMTP not configured; verification code (dev only) for %s: %s', to_email, body_text)
        return True
    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = to_email
        msg.attach(MIMEText(body_text, 'plain', 'utf-8'))
        if port == 465 or use_ssl:
            with smtplib.SMTP_SSL(host, port) as server:
                if user and password_smtp:
                    server.login(user, password_smtp)
                server.sendmail(from_addr, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(host, port) as server:
                if user and password_smtp:
                    server.starttls()
                    server.login(user, password_smtp)
                server.sendmail(from_addr, [to_email], msg.as_string())
        logger.info('Verification email sent to %s', to_email)
        return True
    except Exception as e:
        logger.exception('Failed to send verification email to %s: %s', to_email, e)
        return False


@auth_bp.route('/send-verification-email', methods=['POST', 'OPTIONS'])
def send_verification_email():
    """Validate email/password, generate 6-digit code, and send via email."""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '')
    if not email:
        return jsonify({'message': 'Email is required'}), 400
    if not _is_valid_email(email):
        return jsonify({'message': 'Invalid email format'}), 400
    if not password:
        return jsonify({'message': 'Password is required'}), 400
    if len(password) < 8:
        return jsonify({'message': 'Password must be at least 8 characters'}), 400
    if not re.search(r'[a-zA-Z]', password):
        return jsonify({'message': 'Password must contain at least one letter'}), 400
    if not re.search(r'[0-9]', password):
        return jsonify({'message': 'Password must contain at least one number'}), 400
    existing = get_user_by_email(email)
    if existing:
        return jsonify({'message': 'Email already registered'}), 400
    code = _generate_six_digit_code()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=VERIFICATION_EXPIRE_MINUTES)
    with _verification_lock:
        _verification_store[email] = {'code': code, 'expires_at': expires_at}
    subject = 'Your verification code for sign up'
    body = f'Your verification code is: {code}\n\nIt is valid for {VERIFICATION_EXPIRE_MINUTES} minutes.'
    if not _send_email_via_smtp(email, subject, body):
        return jsonify({'message': 'Failed to send verification email'}), 500
    return jsonify({'success': True, 'message': 'Verification email sent'})


@auth_bp.route('/check-email-for-reset', methods=['GET', 'OPTIONS'])
def check_email_for_reset():
    """Pre-reset check: verify email exists in users table; does not send email."""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    email = (request.args.get('email') or '').strip().lower()
    if not email:
        return jsonify({'exists': False, 'message': 'Email is required'}), 400
    if not _is_valid_email(email):
        return jsonify({'exists': False, 'message': 'Invalid email format'}), 400
    existing = get_user_by_email(email)
    return jsonify({'exists': bool(existing)}), 200


@auth_bp.route('/send-reset-code', methods=['POST', 'OPTIONS'])
def send_reset_code():
    """Send reset code only if email exists in users table; no email sent otherwise."""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = (data.get('password') or '')
    if not email:
        return jsonify({'message': 'Email is required'}), 400
    if not _is_valid_email(email):
        return jsonify({'message': 'Invalid email format'}), 400
    if not password:
        return jsonify({'message': 'Password is required'}), 400
    if len(password) < 8:
        return jsonify({'message': 'Password must be at least 8 characters'}), 400
    if not re.search(r'[a-zA-Z]', password):
        return jsonify({'message': 'Password must contain at least one letter'}), 400
    if not re.search(r'[0-9]', password):
        return jsonify({'message': 'Password must contain at least one number'}), 400
    # Require email to exist in users table before sending code
    existing = get_user_by_email(email)
    if not existing:
        logger.info('Send reset code rejected: no user with email %s', email)
        return jsonify({'message': 'No account found with this email address'}), 400
    code = _generate_six_digit_code()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=VERIFICATION_EXPIRE_MINUTES)
    with _reset_verification_lock:
        _reset_verification_store[email] = {'code': code, 'expires_at': expires_at}
    subject = 'Your password reset verification code'
    body = f'Your verification code is: {code}\n\nIt is valid for {VERIFICATION_EXPIRE_MINUTES} minutes.'
    if not _send_email_via_smtp(email, subject, body):
        with _reset_verification_lock:
            _reset_verification_store.pop(email, None)
        return jsonify({'message': 'Failed to send verification email'}), 500
    return jsonify({'success': True, 'message': 'Verification code sent'})


@auth_bp.route('/reset-password', methods=['POST', 'OPTIONS'])
def reset_password():
    """Reset password after verifying the email code."""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    verification_code = (data.get('verificationCode') or data.get('verification_code') or '').strip()
    if not email:
        return jsonify({'message': 'Email is required'}), 400
    if not _is_valid_email(email):
        return jsonify({'message': 'Invalid email format'}), 400
    if not password:
        return jsonify({'message': 'Password is required'}), 400
    if len(password) < 8:
        return jsonify({'message': 'Password must be at least 8 characters'}), 400
    if not re.search(r'[a-zA-Z]', password):
        return jsonify({'message': 'Password must contain at least one letter'}), 400
    if not re.search(r'[0-9]', password):
        return jsonify({'message': 'Password must contain at least one number'}), 400
    if not verification_code or len(verification_code) != 6 or not verification_code.isdigit():
        return jsonify({'message': 'Please enter a valid 6-digit verification code'}), 400
    with _reset_verification_lock:
        entry = _reset_verification_store.get(email)
        if not entry:
            return jsonify({'message': 'Verification code expired or not sent. Please request a new code.'}), 400
        if entry['expires_at'] < datetime.datetime.utcnow():
            del _reset_verification_store[email]
            return jsonify({'message': 'Verification code expired. Please request a new code.'}), 400
        if entry['code'] != verification_code:
            return jsonify({'message': 'Invalid verification code'}), 400
        del _reset_verification_store[email]
    user = get_user_by_email(email)
    if not user:
        return jsonify({'message': 'No account found with this email address'}), 400
    with get_db_cursor() as cursor:
        cursor.execute(
            "UPDATE users SET password = %s WHERE id = %s",
            (generate_password_hash(password, method='pbkdf2:sha256'), user['id'])
        )
    logger.info('Password reset for user: %s', email)
    return jsonify({'message': 'Password has been reset successfully'}), 200


@auth_bp.route('/register', methods=['POST', 'OPTIONS'])
def register():
    """Register: requires a valid 6-digit email verification code."""
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    data = request.get_json() or {}
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    verification_code = (data.get('verificationCode') or data.get('verification_code') or '').strip()
    if not email:
        return jsonify({'message': 'Email is required'}), 400
    if not _is_valid_email(email):
        return jsonify({'message': 'Invalid email format'}), 400
    if not password:
        return jsonify({'message': 'Password is required'}), 400
    if len(password) < 8:
        return jsonify({'message': 'Password must be at least 8 characters'}), 400
    if not re.search(r'[a-zA-Z]', password):
        return jsonify({'message': 'Password must contain at least one letter'}), 400
    if not re.search(r'[0-9]', password):
        return jsonify({'message': 'Password must contain at least one number'}), 400
    if not verification_code or len(verification_code) != 6 or not verification_code.isdigit():
        return jsonify({'message': 'Please enter a valid 6-digit verification code'}), 400
    with _verification_lock:
        entry = _verification_store.get(email)
        if not entry:
            return jsonify({'message': 'Verification code expired or not sent. Please request a new code.'}), 400
        if entry['expires_at'] < datetime.datetime.utcnow():
            del _verification_store[email]
            return jsonify({'message': 'Verification code expired. Please request a new code.'}), 400
        if entry['code'] != verification_code:
            return jsonify({'message': 'Invalid verification code'}), 400
        del _verification_store[email]
    existing = get_user_by_email(email)
    if existing:
        return jsonify({'message': 'Email already registered'}), 400
    user_id = str(uuid.uuid4())
    with get_db_cursor() as cursor:
        cursor.execute(
            "INSERT INTO users (id, email, password, role) VALUES (%s, %s, %s, %s)",
            (user_id, email, generate_password_hash(password, method='pbkdf2:sha256'), 'Authenticated User')
        )
    logger.info('User registered: %s', email)
    return jsonify({'message': 'Registration successful', 'user_id': user_id}), 201


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
    # Require Super Admin role
    user = get_user_by_id(current_user)
    if not user or user['role'] != 'Super Admin':
        return jsonify({'message': 'Unauthorized'}), 403
    
    # Load user list from database
    with get_db_cursor() as cursor:
        cursor.execute("SELECT email, role, created_at, last_login FROM users")
        users = cursor.fetchall()
    
    return jsonify(users)

@auth_bp.route('/users', methods=['POST'])
@token_required
def add_user(current_user):
    # Require Super Admin role
    user = get_user_by_id(current_user)
    if not user or user['role'] != 'Super Admin':
        return jsonify({'message': 'Unauthorized'}), 403

    data = request.get_json()
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({'message': 'Missing email or password'}), 400

    email = data.get('email').lower()
    password = data.get('password')

    # Validate email domain
    if not email.endswith('@smartlead.tech'):
        return jsonify({'message': 'Email must be from @smartlead.tech domain'}), 400

    # Check user does not already exist
    existing_user = get_user_by_id(email)
    if existing_user:
        return jsonify({'message': 'User already exists'}), 400

    # Insert new user
    with get_db_cursor() as cursor:
        cursor.execute(
            "INSERT INTO users (id, email, password, role) VALUES (UUID(), %s, %s, %s)",
            (email, generate_password_hash(password, method='pbkdf2:sha256'), 'Authenticated User')
        )

    return jsonify({'message': 'User added successfully'}), 201

@auth_bp.route('/verify-current-password', methods=['POST'])
@token_required
def verify_current_password(current_user):
    """Verify the user's current password."""
    data = request.get_json()
    if not data or not data.get('currentPassword'):
        return jsonify({'message': 'Current password is required'}), 400

    current_password = data.get('currentPassword')

    # Load user record
    user = get_user_by_id(current_user)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    # Verify current password
    if not check_password_hash(user['password'], current_password):
        return jsonify({'message': 'Current password is incorrect'}), 401

    # Password verified
    return jsonify({'message': 'Current password is correct'}), 200

@auth_bp.route('/change-password', methods=['POST'])
@token_required
def change_password(current_user):
    data = request.get_json()
    if not data or not data.get('currentPassword') or not data.get('newPassword'):
        return jsonify({'message': 'Missing current password or new password'}), 400

    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')

    # Load user record
    user = get_user_by_id(current_user)
    if not user:
        return jsonify({'message': 'User not found'}), 404

    # Verify current password
    if not check_password_hash(user['password'], current_password):
        return jsonify({'message': 'Current password is incorrect'}), 401

    # New password must differ from current
    if check_password_hash(user['password'], new_password):
        return jsonify({'message': 'New password cannot be the same as the old password.'}), 400

    # Persist new password
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

    logger.debug(f"get_user_info - 用户ID: {current_user}")
    logger.debug(f"get_user_info - 数据库返回的last_login: {user.get('last_login')}")
    logger.debug(f"get_user_info - 完整用户数据: {user}")

    # Load user's primary team
    primary_team = None
    try:
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT t.id, t.name, t.team_type, t.logo
                FROM teams t
                INNER JOIN user_teams ut ON t.id = ut.team_id
                WHERE ut.user_id = %s AND ut.is_primary = TRUE
                LIMIT 1
            """, (current_user,))
            team_result = cursor.fetchone()
            if team_result:
                primary_team = {
                    'id': team_result['id'],
                    'name': team_result['name'],
                    'teamType': team_result['team_type'],
                    'logo': team_result.get('logo')
                }
    except Exception as e:
        logger.warning(f"获取用户团队信息失败: {str(e)}")

    return jsonify({
        'email': user['email'],
        'username': user['username'] or user['email'].split('@')[0],  # Fallback to email local-part
        'role': user['role'],
        'last_login': user['last_login'],
        'avatar': user['avatar'],  # Avatar URL/data
        'two_factor_enabled': bool(user.get('two_factor_enabled', False)),  # 2FA flag
        'primary_team': primary_team  # Primary team summary
    })

@auth_bp.route('/organizations', methods=['GET'])
@token_required
def get_organizations(current_user):
    """List all teams (Super Admin only). Returns full teams table; ignores X-Selected-Team-Id and other filters."""
    # Require Super Admin role
    user = get_user_by_id(current_user)
    if not user or user['role'] != 'Super Admin':
        return jsonify({'message': 'Unauthorized'}), 403

    try:
        # All teams from teams table (no header/org filtering)
        with get_db_cursor() as cursor:
            cursor.execute("""
                SELECT id, name, team_type, description, logo, created_at, updated_at
                FROM teams
                ORDER BY name ASC
            """)
            teams = cursor.fetchall()
        
        # Build response list
        organizations = []
        for team in teams:
            organizations.append({
                'id': team['id'],
                'name': team['name'],
                'teamType': team['team_type'],
                'description': team.get('description'),
                'logo': team.get('logo')
            })
        
        return jsonify({'organizations': organizations})
    except Exception as e:
        logger.error(f"获取团队信息时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@auth_bp.route('/update-profile', methods=['POST'])
@token_required
def update_profile(current_user):
    data = request.get_json()
    if not data:
        return jsonify({'message': 'No data provided'}), 400

    username = data.get('username')
    avatar = data.get('avatar')  # Avatar payload

    if not username:
        return jsonify({'message': 'Username is required'}), 400

    # Update username and avatar
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
        
        # Validate avatar is base64 data URL
        try:
            if not avatar.startswith('data:image'):
                return jsonify({'message': 'Invalid avatar format'}), 400
        except Exception as e:
            logger.debug(f"头像格式验证失败: {str(e)}")
            return jsonify({'message': 'Invalid avatar data'}), 400

        # Persist avatar
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
            'avatar': avatar[:100] + '...'  # Truncate for response/logging
        })
    except Exception as e:
        logger.debug(f"头像更新过程发生错误: {str(e)}")
        return jsonify({'message': 'Internal server error'}), 500

def _effective_user_ids_for_data_scope(current_user: str, cursor) -> list:
    """Resolve user IDs for data scope: org aggregate for Super Admin + X-Selected-Team-Id, else current user only."""
    cursor.execute("SELECT id, role FROM users WHERE id = %s", (current_user,))
    user_row = cursor.fetchone()
    if not user_row:
        return [current_user]
    if user_row['role'] != 'Super Admin':
        return [current_user]
    team_id = (request.headers.get('X-Selected-Team-Id') or '').strip()
    if not team_id:
        return [current_user]
    cursor.execute("SELECT user_id FROM user_teams WHERE team_id = %s", (team_id,))
    team_users = cursor.fetchall()
    user_ids = [r['user_id'] for r in team_users]
    if not user_ids:
        return [current_user]
    return user_ids


@auth_bp.route('/account-configs', methods=['GET'])
@token_required
def get_account_configs(current_user):
    try:
        logger.debug(f"[DEBUG] 开始获取账户配置，当前用户: {current_user}")
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (current_user,))
            user_info = cursor.fetchone()
            if not user_info:
                logger.debug(f"[DEBUG] 用户未找到: {current_user}")
                return jsonify({'message': 'User not found'}), 404
            effective_ids = _effective_user_ids_for_data_scope(current_user, cursor)
            # Visible when user_ids IS NULL (global) or contains any effective user
            placeholders = ' OR '.join(['JSON_CONTAINS(user_ids, %s)'] * len(effective_ids))
            params = [f'"{uid}"' for uid in effective_ids]
            cursor.execute(f"""
                SELECT id, account_name, account_type, api_token, sort_order, custom_icon, updated_at,
                       validate, account_event_types, account_message_fields
                FROM account_configs 
                WHERE user_ids IS NULL OR {placeholders}
                ORDER BY sort_order ASC, account_type, account_name, updated_at DESC
            """, params)
            configs = cursor.fetchall()
            logger.debug(f"[DEBUG] 查到的configs数量: {len(configs)}")
            
            # Log all config rows
            for config in configs:
                logger.debug(f"配置记录: {config}")
            
            # Dedupe by key; keep latest row
            unique_configs = {}
            for config in configs:
                try:
                    # Require all mandatory fields
                    if all(key in config for key in ['id', 'account_name', 'account_type', 'api_token']):
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
            
            # Strip api_token from list response
            sanitized_configs = []
            for config in config_list:
                sanitized_config = {k: v for k, v in config.items() if k != 'api_token'}
                sanitized_configs.append(sanitized_config)
            
            return jsonify({'configs': sanitized_configs})
            
    except Exception as e:
        logger.debug(f"获取账户配置时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@auth_bp.route('/account-configs/<config_id>/token', methods=['GET'])
@token_required
def get_account_token(current_user, config_id):
    """Fetch account config token on demand (not exposed in list API); Super Admin + X-Selected-Team-Id uses org visibility rules."""
    try:
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (current_user,))
            user_info = cursor.fetchone()
            if not user_info:
                return jsonify({'message': 'User not found'}), 404
            effective_ids = _effective_user_ids_for_data_scope(current_user, cursor)
            placeholders = ' OR '.join(['JSON_CONTAINS(user_ids, %s)'] * len(effective_ids))
            params = [config_id] + [f'"{uid}"' for uid in effective_ids]
            cursor.execute(f"""
                SELECT api_token 
                FROM account_configs 
                WHERE id = %s AND (user_ids IS NULL OR {placeholders})
            """, params)
            config = cursor.fetchone()
            
            if not config:
                return jsonify({'message': 'Account config not found or access denied'}), 404
            
            # Return full token for frontend use; mask in UI client-side
            # Frontend response interceptor may redact sensitive fields
            full_token = config['api_token']
            
            return jsonify({'api_token': full_token})
            
    except Exception as e:
        logger.error(f"获取账户token时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@auth_bp.route('/account-configs', methods=['POST'])
@token_required
def add_account_config(current_user):
    try:
        data = request.get_json()
        account_name = data.get('account_name')
        account_type = data.get('account_type')
        api_token = data.get('api_token')
        custom_icon = data.get('custom_icon')  # Optional custom icon
        
        if not all([account_name, account_type, api_token]):
            return jsonify({'message': 'Missing required fields'}), 400
        
        # Resolve current user id
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (current_user,))
            user_info = cursor.fetchone()
            if not user_info:
                return jsonify({'message': 'User not found'}), 404
            user_id = user_info['id']
            config_id = str(uuid.uuid4())
            # New config: user_ids = [current user]; run verify sync after insert
            cursor.execute(
                "INSERT INTO account_configs (id, account_name, account_type, api_token, custom_icon, user_ids) VALUES (%s, %s, %s, %s, %s, %s)",
                (config_id, account_name, account_type, api_token, custom_icon, '["{}"]'.format(user_id))
            )
            logger.debug(f"成功添加账户配置: {account_name}, id={config_id}, user_ids: ['{user_id}']")
        sync = sync_account_verify_to_db(config_id)
        body = {
            'message': 'Account config added successfully',
            'id': config_id,
            'account_name': account_name,
            'account_type': account_type,
            'custom_icon': custom_icon,
        }
        body.update(build_validate_api_payload(sync))
        return jsonify(body)
    except Exception as e:
        logger.debug(f"添加账户配置时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@auth_bp.route('/account-configs/<config_id>', methods=['DELETE'])
@token_required
def delete_account_config(current_user, config_id):
    try:
        logger.debug(f"开始删除账户配置，配置ID: {config_id}")
        
        with get_db_cursor() as cursor:
            # Delete row
            cursor.execute("DELETE FROM account_configs WHERE id = %s", (config_id,))
            
            if cursor.rowcount == 0:
                logger.debug(f"配置不存在: {config_id}")
                return jsonify({'message': 'Account config not found'}), 404
            
            logger.debug(f"成功删除账户配置: {config_id}")
            return jsonify({'message': 'Account config deleted successfully'})
            
    except Exception as e:
        logger.debug(f"删除账户配置时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500

@auth_bp.route('/account-configs/order', methods=['PUT'])
@token_required
def update_account_config_order(current_user):
    """Update account config sort order."""
    try:
        data = request.get_json()
        config_orders = data.get('config_orders', [])
        
        if not config_orders or not isinstance(config_orders, list):
            return jsonify({'message': 'Invalid config orders data'}), 400
        
        # Resolve current user id
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (current_user,))
            user_info = cursor.fetchone()
            if not user_info:
                return jsonify({'message': 'User not found'}), 404
            user_id = user_info['id']
            
            # Ensure all configs belong to current user
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
                
                # Reject configs not owned by user
                if not requested_configs.issubset(user_configs):
                    unauthorized_configs = requested_configs - user_configs
                    logger.warning(f"用户 {user_id} 尝试更新不属于自己的配置: {unauthorized_configs}")
                    return jsonify({'message': 'Unauthorized access to account configs'}), 403
            
            # Update sort_order for owned configs only
            updated_count = 0
            for order_data in config_orders:
                config_id = order_data.get('id')
                sort_order = order_data.get('sort_order', 0)
                
                if config_id:
                    # Restrict update to user's configs
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
        custom_icon = data.get('custom_icon')  # Optional custom icon
        
        if not all([account_name, account_type, api_token]):
            return jsonify({'message': 'Missing required fields'}), 400
            
        with get_db_cursor() as cursor:
            cursor.execute(
                "UPDATE account_configs SET account_name = %s, account_type = %s, api_token = %s, custom_icon = %s WHERE id = %s",
                (account_name, account_type, api_token, custom_icon, config_id)
            )
            logger.debug(f"成功更新账户配置: {account_name}")
        # Same as verify: re-sync three APIs after save
        sync = sync_account_verify_to_db(config_id)
        body = {'message': 'Account config updated successfully'}
        body.update(build_validate_api_payload(sync))
        return jsonify(body)
    except Exception as e:
        logger.debug(f"更新账户配置时发生错误: {str(e)}")
        return jsonify({'message': str(e)}), 500 

# ==================== 2FA routes ====================

@auth_bp.route('/2fa/time-check', methods=['GET'])
def check_2fa_time():
    """Check 2FA time sync status."""
    try:
        import datetime
        import time
        
        # Current local time
        current_time = datetime.datetime.now()
        current_timestamp = int(current_time.timestamp())
        
        # TOTP time window
        totp_window = current_timestamp // 30
        totp_window_start = totp_window * 30
        totp_window_end = (totp_window + 1) * 30
        
        # Seconds left in current window
        seconds_remaining = totp_window_end - current_timestamp
        
        # System clock metadata
        system_time = time.time()
        system_time_utc = datetime.datetime.utcfromtimestamp(system_time)
        
        time_info = {
            'current_utc': current_time.isoformat(),
            'current_timestamp': current_timestamp,
            'totp_window': totp_window,
            'totp_window_start': totp_window_start,
            'totp_window_end': totp_window_end,
            'seconds_remaining': seconds_remaining,
            'system_time': system_time,
            'system_time_utc': system_time_utc.isoformat(),
            'timezone_offset': time.timezone,
            'dst_active': time.daylight and time.localtime().tm_isdst > 0
        }
        
        logger.debug(f"时间检查信息: {time_info}")
        return jsonify(time_info)
        
    except Exception as e:
        logger.error(f"时间检查失败: {str(e)}")
        return jsonify({'error': f'时间检查失败: {str(e)}'}), 500

@auth_bp.route('/2fa/generate-qr', methods=['POST'])
def generate_2fa_qr():
    """Generate 2FA QR code."""
    logger.info(f"=== 进入generate_2fa_qr函数 ===")
    logger.info(f"请求方法: {request.method}")
    logger.info(f"请求路径: {request.path}")
    logger.info(f"请求头: {dict(request.headers)}")
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': '无效的JSON数据'}), 400
            
        temp_identifier = data.get('temp_identifier')
        email = data.get('email')
        
        if not temp_identifier or not email:
            return jsonify({'error': '缺少临时标识符或邮箱'}), 400
        
        # Generate new TOTP secret
        import pyotp  # type: ignore[import-untyped]
        import base64
        import secrets
        
        new_secret = pyotp.random_base32()
        
        # Build TOTP provisioning URI
        totp_uri = pyotp.totp.TOTP(new_secret).provisioning_uri(
            name=email,
            issuer_name="ADNEXUS"
        )
        
        # Render QR code image
        import qrcode  # type: ignore[import-untyped]
        import io
        import base64
        
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Encode image as base64
        buffer = io.BytesIO()
        img.save(buffer, "PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        # Resolve user id from temp identifier and persist secret
        with get_db_cursor() as cursor:
            # Look up user id by temp identifier
            cursor.execute(
                "SELECT id FROM users WHERE temp_auth_identifier = %s AND temp_auth_expires > NOW()",
                (temp_identifier,)
            )
            user_result = cursor.fetchone()
            
            if not user_result:
                return jsonify({'error': '临时标识符无效或已过期'}), 401
            
            user_id = user_result['id']
            
            # Save 2FA secret for user
            cursor.execute(
                "UPDATE users SET two_factor_secret = %s, two_factor_enabled = TRUE WHERE id = %s",
                (new_secret, user_id)
            )
        
        logger.info(f"为用户 {user_id} 生成新的2FA密钥和QR码")
        
        return jsonify({
            'success': True,
            'qr_code': f"data:image/png;base64,{qr_base64}",
            'secret': new_secret,
            'totp_uri': totp_uri,
            'message': 'QR码生成成功，请使用Google Authenticator扫描'
        })
        
    except Exception as e:
        logger.error(f"生成2FA QR码失败: {str(e)}")
        return jsonify({'error': f'生成QR码失败: {str(e)}'}), 500

@auth_bp.route('/2fa/verify', methods=['POST', 'OPTIONS'])
def verify_2fa():
    """Verify 2FA TOTP code."""
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', _cors_origin())
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response
    
    try:
        data = request.get_json()
        if not data:
            error_response = jsonify({'error': 'Invalid JSON data'})
            _apply_cors(error_response)
            return error_response, 400
            
        temp_identifier = data.get('temp_identifier')
        totp_code = data.get('totp_code')
        
        if not temp_identifier or not totp_code:
            error_response = jsonify({'error': 'Missing temporary identifier or verification code'})
            _apply_cors(error_response)
            return error_response, 400
        
        # Validate temp identifier
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT id, role, temp_auth_expires FROM users WHERE temp_auth_identifier = %s AND temp_auth_expires > NOW()",
                (temp_identifier,)
            )
            temp_auth = cursor.fetchone()
            
            if not temp_auth:
                error_response = jsonify({'error': 'Temporary identifier is invalid or expired'})
                _apply_cors(error_response)
                return error_response, 401
            
            user_id = temp_auth['id']
            user_role = temp_auth['role']
        
        # Verify TOTP (clear temp id only after success)
        with get_db_cursor() as cursor:
            cursor.execute("SELECT two_factor_secret, role FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            if not user or not user['two_factor_secret']:
                error_response = jsonify({'error': 'User has not set up 2FA'})
                _apply_cors(error_response)
                return error_response, 400
            
            user_role = user['role']
        
        # Verify TOTP code
        try:
            import pyotp  # type: ignore[import-untyped]
            logger.debug(f"导入pyotp成功，用户密钥: {user['two_factor_secret']}")
            logger.debug(f"用户输入的验证码: {totp_code}")
            
            # Server time (local, not UTC)
            import datetime
            current_time = datetime.datetime.now()  # Local time
            logger.debug(f"当前服务器本地时间: {current_time}")
            logger.debug(f"当前服务器UTC时间: {datetime.datetime.utcnow()}")
            
            # TOTP with valid_window=1 (±1 step)
            totp = pyotp.TOTP(user['two_factor_secret'])
            logger.debug(f"TOTP对象创建成功")
            logger.debug(f"TOTP密钥: {user['two_factor_secret']}")
            logger.debug(f"TOTP密钥长度: {len(user['two_factor_secret'])}")
            
            # Smoke-test code generation
            test_code = totp.at(current_time)
            logger.debug(f"测试生成的验证码: {test_code}")
            logger.debug(f"当前时间戳: {int(current_time.timestamp())}")
            logger.debug(f"当前时间窗口: {int(current_time.timestamp()) // 30}")
            
            # Try adjacent time windows
            is_valid = False
            time_window = 0
            valid_time = None
            
            # Current window ±1 step
            for offset in [-1, 0, 1]:
                try:
                    check_time = current_time + datetime.timedelta(seconds=offset * 30)
                    if totp.verify(totp_code, valid_window=1, for_time=check_time):
                        is_valid = True
                        time_window = offset
                        valid_time = check_time
                        break
                except Exception as e:
                    logger.debug(f"时间窗口 {offset} 验证失败: {str(e)}")
                    continue
            
            logger.debug(f"TOTP验证结果: {is_valid}, 有效时间窗口: {time_window}, 有效时间: {valid_time}")
            
            # Debug codes per window
            for offset in [-2, -1, 0, 1, 2]:
                try:
                    check_time = current_time + datetime.timedelta(seconds=offset * 30)
                    window_code = totp.at(check_time)
                    logger.debug(f"时间窗口 {offset}: {window_code} (时间: {check_time})")
                except Exception as e:
                    logger.debug(f"时间窗口 {offset} 生成失败: {str(e)}")
            
            if not is_valid:
                # Expected code for current window (debug)
                current_code = totp.at(current_time)
                logger.debug(f"当前时间窗口验证码: {current_code}")
                
                # Time skew diagnostics
                try:
                    # Map input code to time window (debug)
                    totp_obj = pyotp.TOTP(user['two_factor_secret'])
                    # Timestamp for current code
                    current_timestamp = int(current_time.timestamp())
                    current_window = current_timestamp // 30
                    
                    # Candidate codes nearby
                    possible_codes = []
                    for i in range(-2, 3):  # ±2 windows
                        window_time = current_window + i
                        code = totp_obj.at(window_time * 30)
                        possible_codes.append(f"窗口{i}: {code}")
                    
                    logger.debug(f"可能的验证码: {', '.join(possible_codes)}")
                    
                    error_msg = f"Invalid verification code. Current time window code: {current_code}"
                    error_response = jsonify({'error': error_msg, 'details': {
                        'current_code': current_code,
                        'possible_codes': possible_codes,
                        'server_time': current_time.isoformat(),
                        'input_code': totp_code
                    }})
                        _apply_cors(error_response)
                    return error_response, 401
                    
                except Exception as e:
                    logger.error(f"生成对比验证码时出错: {str(e)}")
                    error_response = jsonify({'error': 'Invalid verification code. Please check time synchronization'})
                        _apply_cors(error_response)
                    return error_response, 401
                
            logger.debug(f"TOTP验证成功")
        except Exception as e:
            logger.error(f"TOTP验证过程出错: {str(e)}")
            import traceback
            logger.error(traceback.format_exc())
            error_response = jsonify({'error': f'TOTP verification failed: {str(e)}'})
            _apply_cors(error_response)
            return error_response, 500
        
        # Issue session JWT
        token = jwt.encode({
            'id': user_id,
            'role': user_role,
            'exp': datetime.datetime.utcnow() + JWT_ACCESS_TOKEN_EXPIRES
        }, JWT_SECRET_KEY)
        
        # Sanity-check JWT
        try:
            decoded_token = jwt.decode(token, JWT_SECRET_KEY, algorithms=['HS256'])
            logger.info(f"生成的token验证成功: {decoded_token}")
        except Exception as e:
            logger.error(f"生成的token验证失败: {str(e)}")
            error_response = jsonify({'error': 'Token generation failed'})
            _apply_cors(error_response)
            return error_response, 500
        
        # On success: clear temp id and record 2FA last used
        with get_db_cursor() as cursor:
            # Clear temp identifier only after successful verification
            cursor.execute(
                "UPDATE users SET temp_auth_identifier = NULL, temp_auth_expires = NULL, two_factor_last_used = CURRENT_TIMESTAMP WHERE id = %s",
                (user_id,)
            )
        
        # Update last_login after 2FA success
        try:
            update_last_login_by_id(user_id)
            logger.info(f"2FA验证成功后，更新last_login成功，用户ID: {user_id}")
        except Exception as e:
            logger.error(f"2FA验证成功后，更新last_login失败: {str(e)}")
        
        # Load full user profile
        with get_db_cursor() as cursor:
            cursor.execute("SELECT id, email, role, username FROM users WHERE id = %s", (user_id,))
            full_user = cursor.fetchone()
        
        logger.info("2FA verified for user_id=%s", user_id)
        response_data = {
            'token': token,
            'user': {
                'id': full_user['id'],
                'email': full_user['email'],
                'role': full_user.get('role', 'User'),
                'username': full_user.get('username', full_user['email'].split('@')[0])
            },
            'message': '2FA verification successful'
        }
        logger.info("2FA verification response ready for user_id=%s", user_id)
        response = jsonify(response_data)
        return _apply_cors(response)
        
    except Exception as e:
        logger.error(f"2FA验证失败: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        error_response = jsonify({'error': 'Verification failed'})
                        _apply_cors(error_response)
        return error_response, 500

@auth_bp.route('/2fa/setup', methods=['POST', 'OPTIONS'])
def setup_2fa_route():
    """Handle OPTIONS preflight."""
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', _cors_origin())
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'POST,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        return response
    
    # For POST: validate JWT manually
    token = None
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        try:
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]
            else:
                token = auth_header
        except IndexError:
            error_response = jsonify({'error': 'Invalid token format'})
            _apply_cors(error_response)
            return error_response, 401

    if not token:
        error_response = jsonify({'error': 'Token is missing'})
                        _apply_cors(error_response)
        return error_response, 401

    try:
        data = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
        current_user = data['id']
    except jwt.ExpiredSignatureError:
        error_response = jsonify({'error': 'Token has expired'})
                        _apply_cors(error_response)
        return error_response, 401
    except jwt.InvalidTokenError as e:
        error_response = jsonify({'error': 'Invalid token'})
                        _apply_cors(error_response)
        return error_response, 401
    except Exception as e:
        logger.error(f"Token验证过程出错: {str(e)}")
        error_response = jsonify({'error': 'Token validation failed'})
                        _apply_cors(error_response)
        return error_response, 500
    
    # Delegate to implementation
    return setup_2fa_impl(current_user)

def setup_2fa_impl(current_user):
    """Generate 2FA QR code for authenticated user."""
    try:
        user = get_user_by_id(current_user)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Generate new TOTP secret
        import pyotp  # type: ignore[import-untyped]
        import qrcode  # type: ignore[import-untyped]
        import io
        import base64
        
        new_secret = pyotp.random_base32()
        
        # Build TOTP provisioning URI
        totp_uri = pyotp.totp.TOTP(new_secret).provisioning_uri(
            name=user['email'],
            issuer_name="ADNEXUS"
        )
        
        # Render QR code image
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Encode image as base64
        buffer = io.BytesIO()
        img.save(buffer, "PNG")
        qr_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        # Stash secret pending setup (2FA enabled after TOTP verify)
        with get_db_cursor() as cursor:
            cursor.execute(
                "UPDATE users SET two_factor_secret = %s WHERE id = %s",
                (new_secret, current_user)
            )
        
        logger.info(f"为用户 {current_user} 生成2FA设置QR码")
        
        response = jsonify({
            'success': True,
            'qr_code': f"data:image/png;base64,{qr_base64}",
            'secret': new_secret,
            'totp_uri': totp_uri,
            'message': 'QR code generated successfully. Please scan with Google Authenticator.'
        })
        
        # Set CORS headers
        _apply_cors(response)
        
        return response
        
    except Exception as e:
        logger.error(f"生成2FA QR码失败: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        error_response = jsonify({'error': f'Failed to generate QR code: {str(e)}'})
        # Set CORS headers
                        _apply_cors(error_response)
        return error_response, 500

@auth_bp.route('/2fa/verify-setup', methods=['POST'])
@token_required
def verify_2fa_setup(current_user):
    """Verify TOTP and complete 2FA setup."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON data'}), 400
        
        totp_code = data.get('totp_code')
        if not totp_code:
            return jsonify({'error': 'Missing TOTP code'}), 400
        
        # Load pending 2FA secret
        with get_db_cursor() as cursor:
            cursor.execute("SELECT two_factor_secret FROM users WHERE id = %s", (current_user,))
            user = cursor.fetchone()
            
            if not user or not user['two_factor_secret']:
                return jsonify({'error': '2FA secret not found. Please generate QR code first.'}), 400
            
            secret = user['two_factor_secret']
        
        # Verify TOTP code
        try:
            import pyotp  # type: ignore[import-untyped]
            totp = pyotp.TOTP(secret)
            is_valid = totp.verify(totp_code, valid_window=1)
            
            if not is_valid:
                return jsonify({'error': 'Invalid verification code'}), 400
            
            # Enable 2FA on successful verification
            with get_db_cursor() as cursor:
                cursor.execute(
                    "UPDATE users SET two_factor_enabled = TRUE, two_factor_setup_at = CURRENT_TIMESTAMP WHERE id = %s",
                    (current_user,)
                )
            
            logger.info(f"用户 {current_user} 成功设置2FA")
            
            response = jsonify({
                'success': True,
                'message': '2FA enabled successfully'
            })
            
            # Set CORS headers
            if os.getenv('IS_LOCAL', 'false').lower() == 'true':
                response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
            else:
                response.headers.add('Access-Control-Allow-Origin', _cors_origin())
            response.headers.add('Access-Control-Allow-Credentials', 'true')
            
            return response
            
        except Exception as e:
            logger.error(f"TOTP验证失败: {str(e)}")
            error_response = jsonify({'error': f'TOTP verification failed: {str(e)}'})
            _apply_cors(error_response)
            return error_response, 500
        
    except Exception as e:
        logger.error(f"2FA设置验证失败: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        error_response = jsonify({'error': f'Setup verification failed: {str(e)}'})
                        _apply_cors(error_response)
        return error_response, 500

@auth_bp.route('/2fa/disable', methods=['POST'])
@token_required
def disable_2fa(current_user):
    """Disable 2FA."""
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                "UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL, two_factor_setup_at = NULL WHERE id = %s",
                (current_user,)
            )
        
        logger.info(f"用户 {current_user} 禁用2FA")
        
        response = jsonify({
            'success': True,
            'message': '2FA disabled successfully'
        })
        
        # Set CORS headers
        _apply_cors(response)
        
        return response
        
    except Exception as e:
        logger.error(f"禁用2FA失败: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        error_response = jsonify({'error': f'Failed to disable 2FA: {str(e)}'})
                        _apply_cors(error_response)
        return error_response, 500

# ==================== GoChat settings routes ====================

@auth_bp.route('/gochat/settings', methods=['GET'])
@token_required
def get_gochat_settings(current_user):
    """Get user's GoChat settings."""
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT gochat_openai_api_key, gochat_deepseek_api_key FROM users WHERE id = %s",
                (current_user,)
            )
            user = cursor.fetchone()
            if not user:
                return jsonify({'message': 'User not found'}), 404
            
            openai_key = user.get('gochat_openai_api_key') or ''
            deepseek_key = user.get('gochat_deepseek_api_key') or ''
            
            return jsonify({
                'hasOpenaiKey': bool(openai_key and openai_key.strip()),
                'hasDeepseekKey': bool(deepseek_key and deepseek_key.strip())
            })
    except Exception as e:
        logger.error(f"获取 GoChat 配置失败: {str(e)}")
        return jsonify({'message': f'Failed to load settings: {str(e)}'}), 500

@auth_bp.route('/gochat/settings', methods=['PUT'])
@token_required
def update_gochat_settings(current_user):
    """Update user's GoChat settings."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'message': 'No data provided'}), 400
        
        openai_api_key = data.get('openaiApiKey')
        deepseek_api_key = data.get('deepseekApiKey')
        
        # Reject empty update payload
        if openai_api_key is None and deepseek_api_key is None:
            return jsonify({'message': 'No fields to update'}), 400
        
        # Build dynamic UPDATE clause
        updates = []
        params = []
        
        if openai_api_key is not None:
            if openai_api_key and openai_api_key.strip():
                updates.append("gochat_openai_api_key = %s")
                params.append(openai_api_key.strip())
            else:
                updates.append("gochat_openai_api_key = NULL")
        
        if deepseek_api_key is not None:
            if deepseek_api_key and deepseek_api_key.strip():
                updates.append("gochat_deepseek_api_key = %s")
                params.append(deepseek_api_key.strip())
            else:
                updates.append("gochat_deepseek_api_key = NULL")
        
        if not updates:
            return jsonify({'message': 'No fields to update'}), 400
        
        # Run update
        params.append(current_user)
        query = f"UPDATE users SET {', '.join(updates)} WHERE id = %s"
        
        with get_db_cursor() as cursor:
            cursor.execute(query, params)
        
        # Reload settings after update
        with get_db_cursor() as cursor:
            cursor.execute(
                "SELECT gochat_openai_api_key, gochat_deepseek_api_key FROM users WHERE id = %s",
                (current_user,)
            )
            user = cursor.fetchone()
            if not user:
                return jsonify({'message': 'User not found'}), 404
            
            openai_key = user.get('gochat_openai_api_key') or ''
            deepseek_key = user.get('gochat_deepseek_api_key') or ''
            
            logger.info(f"用户 {current_user} 更新了 GoChat 配置")
            return jsonify({
                'hasOpenaiKey': bool(openai_key and openai_key.strip()),
                'hasDeepseekKey': bool(deepseek_key and deepseek_key.strip())
            })
    except Exception as e:
        logger.error(f"更新 GoChat 配置失败: {str(e)}")
        return jsonify({'message': f'Failed to update settings: {str(e)}'}), 500

@auth_bp.route('/gochat/settings', methods=['DELETE'])
@token_required
def clear_gochat_settings(current_user):
    """Clear user's GoChat settings."""
    try:
        with get_db_cursor() as cursor:
            cursor.execute(
                "UPDATE users SET gochat_openai_api_key = NULL, gochat_deepseek_api_key = NULL WHERE id = %s",
                (current_user,)
            )
        
        logger.info(f"用户 {current_user} 清除了 GoChat 配置")
        return jsonify({
            'hasOpenaiKey': False,
            'hasDeepseekKey': False
        })
    except Exception as e:
        logger.error(f"清除 GoChat 配置失败: {str(e)}")
        return jsonify({'message': f'Failed to clear settings: {str(e)}'}), 500

 