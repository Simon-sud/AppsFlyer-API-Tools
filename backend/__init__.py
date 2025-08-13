from flask import Flask
from flask_cors import CORS
from .auth import auth_bp

def create_app():
    app = Flask(__name__)
    CORS(app)
    
    # 注册认证蓝图
    app.register_blueprint(auth_bp)
    
    return app 