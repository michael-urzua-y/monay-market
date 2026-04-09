"""Tests for Panel_Admin login and authentication flow."""

from unittest.mock import patch

import pytest

from app import app


@pytest.fixture
def client():
    """Create a Flask test client."""
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret"
    with app.test_client() as c:
        yield c


class TestLoginRoute:
    """Tests for the /login route."""

    def test_get_login_renders_form(self, client):
        """GET /login should render the login page."""
        resp = client.get("/login")
        assert resp.status_code == 200
        assert b"Iniciar" in resp.data
        assert b"email" in resp.data

    def test_get_login_redirects_if_authenticated(self, client):
        """GET /login should redirect to dashboard if already logged in."""
        with client.session_transaction() as sess:
            sess["jwt_token"] = "some-token"
        resp = client.get("/login")
        assert resp.status_code == 302
        assert "/dashboard" in resp.headers["Location"]

    @patch("app.api")
    def test_post_login_success(self, mock_api, client):
        """POST /login with valid credentials stores JWT and redirects."""
        mock_api.post.return_value = {
            "status_code": 201,
            "accessToken": "jwt-abc-123",
            "user": {"email": "admin@test.com", "role": "dueno"},
        }
        resp = client.post(
            "/login",
            data={"email": "admin@test.com", "password": "secret123"},
        )
        assert resp.status_code == 302
        assert "/dashboard" in resp.headers["Location"]
        with client.session_transaction() as sess:
            assert sess["jwt_token"] == "jwt-abc-123"
            assert sess["user"]["email"] == "admin@test.com"

    @patch("app.api")
    def test_post_login_failure_shows_error(self, mock_api, client):
        """POST /login with invalid credentials shows error message."""
        mock_api.post.return_value = {
            "status_code": 401,
            "error": "INVALID_CREDENTIALS",
        }
        resp = client.post(
            "/login",
            data={"email": "bad@test.com", "password": "wrong"},
        )
        assert resp.status_code == 200
        assert "Credenciales inv" in resp.data.decode("utf-8")

    @patch("app.api")
    def test_post_login_connection_error(self, mock_api, client):
        """POST /login when API is unreachable shows error."""
        mock_api.post.return_value = {
            "status_code": 503,
            "error": "CONNECTION_ERROR",
        }
        resp = client.post(
            "/login",
            data={"email": "admin@test.com", "password": "secret123"},
        )
        assert resp.status_code == 200
        assert "Credenciales inv" in resp.data.decode("utf-8")


class TestLogoutRoute:
    """Tests for the /logout route."""

    def test_logout_clears_session(self, client):
        """GET /logout should clear session and redirect to login."""
        with client.session_transaction() as sess:
            sess["jwt_token"] = "some-token"
            sess["user"] = {"email": "test@test.com"}
        resp = client.get("/logout")
        assert resp.status_code == 302
        assert "/login" in resp.headers["Location"]
        with client.session_transaction() as sess:
            assert "jwt_token" not in sess
            assert "user" not in sess


class TestLoginRequired:
    """Tests for the login_required middleware."""

    def test_protected_route_redirects_without_token(self, client):
        """Protected routes should redirect to login without JWT."""
        resp = client.get("/dashboard")
        assert resp.status_code == 302
        assert "/login" in resp.headers["Location"]

    def test_protected_route_accessible_with_token(self, client):
        """Protected routes should be accessible with JWT in session."""
        with client.session_transaction() as sess:
            sess["jwt_token"] = "valid-token"
        resp = client.get("/dashboard")
        assert resp.status_code == 200

    def test_root_redirects_to_login_without_token(self, client):
        """Root / should redirect to login without JWT."""
        resp = client.get("/")
        assert resp.status_code == 302
        assert "/login" in resp.headers["Location"]
