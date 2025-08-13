from flask import Flask
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv()

def init_db(app: Flask) -> None:
    """初始化数据库配置"""
    app.config['DB_HOST'] = os.getenv('DB_HOST', 'localhost')
    app.config['DB_USER'] = os.getenv('DB_USER', 'root')
    app.config['DB_PASSWORD'] = os.getenv('DB_PASSWORD', '5452831')
    app.config['DB_NAME'] = os.getenv('DB_NAME', 'appsflyer_rawdata') 