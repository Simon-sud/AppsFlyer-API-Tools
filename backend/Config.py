from database.db import get_db_cursor
import logging

logger = logging.getLogger(__name__)

def get_account(account_type=None, user_id=None):
    """
    从数据库获取账户配置信息，支持user_id权限过滤
    :param account_type: 账户类型（可选）
    :param user_id: 当前用户ID（可选）
    :return: 如果指定了账户类型，返回该类型的配置信息；否则返回所有账户类型的配置信息
    """
    try:
        with get_db_cursor() as cursor:
            if account_type:
                if user_id:
                    # 获取指定类型且当前用户可见的账户配置
                    cursor.execute("""
                        SELECT id, account_name, account_type, api_token, is_default 
                        FROM account_configs 
                        WHERE account_type = %s AND (user_ids IS NULL OR JSON_CONTAINS(user_ids, %s))
                    """, (account_type, f'"{user_id}"'))
                else:
                    # 兼容老逻辑
                    cursor.execute("""
                        SELECT id, account_name, account_type, api_token, is_default 
                        FROM account_configs 
                        WHERE account_type = %s
                    """, (account_type,))
                configs = cursor.fetchall()
                if not configs:
                    logger.warning(f"未找到账户类型为 {account_type} 的配置")
                    return None
                # 返回第一个默认配置或第一个配置
                for config in configs:
                    if config.get('is_default'):
                        return {
                            'id': config['id'],
                            'account_name': config['account_name'],
                            'account_type': config['account_type'],
                            'api_token': config['api_token']
                        }
                return {
                    'id': configs[0]['id'],
                    'account_name': configs[0]['account_name'],
                    'account_type': configs[0]['account_type'],
                    'api_token': configs[0]['api_token']
                }
            else:
                # 获取所有账户配置（可选：可加user_id过滤）
                cursor.execute("""
                    SELECT id, account_name, account_type, api_token, is_default 
                    FROM account_configs
                """)
                configs = cursor.fetchall()
                accounts = {}
                for config in configs:
                    account_type = config['account_type']
                    if account_type not in accounts:
                        accounts[account_type] = []
                    accounts[account_type].append({
                        'id': config['id'],
                        'account_name': config['account_name'],
                        'account_type': config['account_type'],
                        'api_token': config['api_token']
                    })
                return accounts
    except Exception as e:
        logger.error(f"获取账户配置失败: {str(e)}")
        return None 