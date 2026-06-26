from database.db import get_db_cursor
import logging

logger = logging.getLogger(__name__)

def get_account(account_type=None, user_id=None):
    """
    Fetch account configuration from the database, with optional user_id filtering.

    :param account_type: Account type (optional).
    :param user_id: Current user ID (optional).
    :return: Config for the given account type, or all account types if none specified.
    """
    try:
        with get_db_cursor() as cursor:
            if account_type:
                if user_id:
                    # Fetch account config for the type visible to the current user
                    cursor.execute("""
                        SELECT id, account_name, account_type, api_token, is_default 
                        FROM account_configs 
                        WHERE account_type = %s AND (user_ids IS NULL OR JSON_CONTAINS(user_ids, %s))
                    """, (account_type, f'"{user_id}"'))
                else:
                    # Legacy path without user_id filtering
                    cursor.execute("""
                        SELECT id, account_name, account_type, api_token, is_default 
                        FROM account_configs 
                        WHERE account_type = %s
                    """, (account_type,))
                configs = cursor.fetchall()
                if not configs:
                    logger.warning(f"未找到账户类型为 {account_type} 的配置")
                    return None
                # Return the default config, or the first match
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
                # Fetch all account configs (optional user_id filter may be added)
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