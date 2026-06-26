from flask import Flask
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def init_db(app: Flask) -> None:
    """Initialize database configuration on the Flask app."""
    app.config['DB_HOST'] = os.getenv('DB_HOST', 'localhost')
    app.config['DB_USER'] = os.getenv('DB_USER', 'root')
    app.config['DB_PASSWORD'] = os.getenv('DB_PASSWORD', '')
    app.config['DB_NAME'] = os.getenv('DB_NAME', 'appsflyer_rawdata') 