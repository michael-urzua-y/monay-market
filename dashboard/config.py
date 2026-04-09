import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-this-secret-in-production")
    API_URL = os.environ.get("API_URL", "http://localhost:3000")
    FLASK_ENV = os.environ.get("FLASK_ENV", "development")
