import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()


class Config:
    API_URL = os.environ.get("API_URL", "http://localhost:3000")
    PUBLIC_APP_URL = os.environ.get("PUBLIC_APP_URL", "http://localhost:8080")
    LOGIN_URL = os.environ.get("LOGIN_URL")
    POS_URL = os.environ.get("POS_URL", "/pos/")
    POS_AUTH_COOKIE_SECURE = os.environ.get("POS_AUTH_COOKIE_SECURE", "false").lower() == "true"
    FLASK_ENV = os.environ.get("FLASK_ENV", "development")
    STRICT_ENV_VALIDATION = os.environ.get("STRICT_ENV_VALIDATION", "false").lower() == "true"
    SECRET_KEY = os.environ.get("SECRET_KEY")
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"
    PERMANENT_SESSION_LIFETIME = timedelta(
        seconds=int(os.environ.get("SESSION_LIFETIME_SECONDS", "43200")),
    )
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH", str(25 * 1024 * 1024)))
    CERT_UPLOAD_DIR = os.environ.get(
        "CERT_UPLOAD_DIR",
        os.path.join(os.path.dirname(__file__), "uploads", "certificados"),
    )

    if FLASK_ENV == "production" and not SECRET_KEY:
        raise RuntimeError("SECRET_KEY debe configurarse en producción")

    if STRICT_ENV_VALIDATION:
        placeholder_fragments = ("change-this", "replace-with", "secret-in-production")
        invalid_secret = not SECRET_KEY or len(SECRET_KEY) < 32
        if not invalid_secret:
            for fragment in placeholder_fragments:
                if fragment in SECRET_KEY:
                    invalid_secret = True
                    break
        if invalid_secret:
            raise RuntimeError("SECRET_KEY debe tener al menos 32 caracteres y no puede ser un placeholder")

    if not SECRET_KEY:
        SECRET_KEY = os.urandom(32)
