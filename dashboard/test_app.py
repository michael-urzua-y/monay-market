"""Tests for Panel_Admin login and authentication flow."""

from unittest.mock import patch

import pytest

from app import app


@pytest.fixture
def client():
    """Create a Flask test client."""
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret"
    app.config["PUBLIC_APP_URL"] = "http://localhost:8080"
    app.config["LOGIN_URL"] = None
    app.config["POS_URL"] = "/pos/"
    with app.test_client() as c:
        yield c


class TestLoginRoute:
    """Tests for the /login route."""

    def test_get_login_renders_form(self, client):
        """GET /login should render the login page."""
        resp = client.get("/login", base_url="http://localhost:5000")
        assert resp.status_code == 200
        assert b"Iniciar" in resp.data
        assert b"username" in resp.data

    def test_get_login_redirects_if_authenticated(self, client):
        """GET /login should redirect to dashboard if already logged in."""
        with client.session_transaction() as sess:
            sess["jwt_token"] = "some-token"
            sess["user"] = {"username": "admin", "email": "dueno@example.com", "role": "dueno"}
        resp = client.get("/login", base_url="http://localhost:5000")
        assert resp.status_code == 302
        assert "/dashboard" in resp.headers["Location"]

    def test_get_login_redirects_cashier_session_to_pos(self, client):
        """GET /login should redirect POS operators to the POS URL."""
        with client.session_transaction() as sess:
            sess["jwt_token"] = "some-token"
            sess["user"] = {"username": "sebastian.urzuay", "email": "cajero@example.com", "role": "cajero"}
        resp = client.get("/login", base_url="http://localhost:5000")
        assert resp.status_code == 302
        assert resp.headers["Location"].endswith("/pos/")
        assert any(
            "monay_pos_token=some-token" in value
            for value in resp.headers.getlist("Set-Cookie")
        )
        assert any(
            "monay_login_url=http%3A//localhost%3A8080/login" in value
            for value in resp.headers.getlist("Set-Cookie")
        )

    def test_direct_pos_route_redirects_to_unified_pos(self, client):
        """Direct dashboard port /pos should redirect to the unified POS route."""
        resp = client.get("/pos/", base_url="http://localhost:5000")
        assert resp.status_code == 302
        assert resp.headers["Location"] == "http://localhost:8080/pos/"

    @patch("app.api")
    def test_post_login_success(self, mock_api, client):
        """POST /login with valid credentials stores JWT and redirects."""
        mock_api.post.return_value = {
            "status_code": 201,
            "accessToken": "jwt-abc-123",
            "user": {"username": "admin", "email": "admin@test.com", "role": "dueno"},
        }
        resp = client.post(
            "/login",
            data={"username": "admin", "password": "secret123"},
        )
        assert resp.status_code == 302
        assert "/dashboard" in resp.headers["Location"]
        with client.session_transaction() as sess:
            assert sess["jwt_token"] == "jwt-abc-123"
            assert sess["user"]["username"] == "admin"

    @patch("app.api")
    def test_post_login_redirects_cashier_to_pos(self, mock_api, client):
        """POST /login should send POS operators to the POS session."""
        mock_api.post.return_value = {
            "status_code": 201,
            "accessToken": "jwt-cajero-123",
            "user": {"username": "sebastian.urzuay", "email": "cajero@example.com", "role": "cajero"},
        }
        resp = client.post(
            "/login",
            data={"username": "sebastian.urzuay", "password": "secret123"},
            base_url="http://localhost:5000",
        )
        assert resp.status_code == 302
        assert resp.headers["Location"].endswith("/pos/")
        set_cookie_headers = resp.headers.getlist("Set-Cookie")
        assert any("monay_pos_token=jwt-cajero-123" in value for value in set_cookie_headers)
        assert any("monay_pos_user=" in value for value in set_cookie_headers)
        assert any("monay_login_url=" in value for value in set_cookie_headers)
        with client.session_transaction() as sess:
            assert "jwt_token" not in sess

    @patch("app.api")
    def test_post_login_failure_shows_error(self, mock_api, client):
        """POST /login with invalid credentials shows error message."""
        mock_api.post.return_value = {
            "status_code": 401,
            "error": "INVALID_CREDENTIALS",
        }
        resp = client.post(
            "/login",
            data={"username": "baduser", "password": "wrong"},
            follow_redirects=True,
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
            data={"username": "admin", "password": "secret123"},
            follow_redirects=True,
        )
        assert resp.status_code == 200
        assert "Credenciales inv" in resp.data.decode("utf-8")


class TestLogoutRoute:
    """Tests for the /logout route."""

    def test_logout_clears_session(self, client):
        """GET /logout should clear session and redirect to login."""
        with client.session_transaction() as sess:
            sess["jwt_token"] = "some-token"
            sess["user"] = {"username": "admin", "email": "test@test.com"}
        resp = client.get("/logout")
        assert resp.status_code == 302
        assert "/login" in resp.headers["Location"]
        with client.session_transaction() as sess:
            assert "jwt_token" not in sess
            assert "user" not in sess


class TestSalesRetryBoleta:
    """Tests for retrying SII boleta emission from the dashboard."""

    def login_owner(self, client):
        """Store an owner session in the Flask test client."""
        with client.session_transaction() as sess:
            sess["jwt_token"] = "valid-token"
            sess["user"] = {"username": "admin", "email": "dueno@example.com", "role": "dueno"}

    @patch("app.api")
    def test_retry_boleta_success_requires_emitida_status(self, mock_api, client):
        """Successful retry should require the API to return boleta_status=emitida."""
        self.login_owner(client)
        mock_api.post.return_value = {"boleta_status": "emitida"}

        resp = client.post(
            "/sales/sale-123/retry-boleta",
            headers={"Referer": "http://localhost:5000/sales/sale-123"},
        )

        assert resp.status_code == 302
        assert "success=Boleta+procesada+correctamente" in resp.headers["Location"]

    @patch("app.api")
    def test_retry_boleta_error_status_redirects_with_error(self, mock_api, client):
        """HTTP 200 with boleta_status=error should not be shown as success."""
        self.login_owner(client)
        mock_api.post.return_value = {
            "boleta_status": "error",
            "error": "Error de credenciales SII. Revise la configuración.",
        }

        resp = client.post(
            "/sales/sale-123/retry-boleta",
            headers={"Referer": "http://localhost:5000/sales/sale-123"},
        )

        assert resp.status_code == 302
        assert "error=Error+de+credenciales+SII" in resp.headers["Location"]
        assert "success=" not in resp.headers["Location"]


class TestLoginRequired:
    """Tests for the login_required middleware."""

    def test_protected_route_redirects_without_token(self, client):
        """Protected routes should redirect to login without JWT."""
        resp = client.get("/dashboard")
        assert resp.status_code == 302
        assert "/login" in resp.headers["Location"]

    def test_protected_route_accessible_with_token(self, client):
        """Protected routes should be accessible for owner sessions."""
        with client.session_transaction() as sess:
            sess["jwt_token"] = "valid-token"
            sess["user"] = {"username": "admin", "email": "dueno@example.com", "role": "dueno"}
        resp = client.get("/dashboard")
        assert resp.status_code == 200

    def test_protected_route_redirects_for_non_owner(self, client):
        """Protected routes should redirect non-owner sessions."""
        with client.session_transaction() as sess:
            sess["jwt_token"] = "valid-token"
            sess["user"] = {"username": "sebastian.urzuay", "email": "cajero@example.com", "role": "cajero"}
        resp = client.get("/dashboard")
        assert resp.status_code == 302
        assert "/login" in resp.headers["Location"]

    def test_root_redirects_to_login_without_token(self, client):
        """Root / should redirect to login without JWT."""
        resp = client.get("/")
        assert resp.status_code == 302
        assert "/login" in resp.headers["Location"]
