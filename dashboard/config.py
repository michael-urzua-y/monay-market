import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    API_URL = os.environ.get("API_URL", "http://localhost:3000")
    FLASK_ENV = os.environ.get("FLASK_ENV", "development")
    SECRET_KEY = os.environ.get("SECRET_KEY")
    CERT_UPLOAD_DIR = os.environ.get(
        "CERT_UPLOAD_DIR",
        os.path.join(os.path.dirname(__file__), "uploads", "certificados"),
    )

    if FLASK_ENV == "production" and not SECRET_KEY:
        raise RuntimeError("SECRET_KEY debe configurarse en producción")

    if not SECRET_KEY:
        SECRET_KEY = os.urandom(32)
