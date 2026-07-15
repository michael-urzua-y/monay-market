"""Tests for Panel_Admin login and authentication flow."""

from unittest.mock import patch

import pytest

from app import app

# CSRF token seeded into the test session so that state-changing POSTs pass the
# same-origin + token check enforced in production (see enforce_csrf_protection).
CSRF_TOKEN = "test-csrf-token"


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


def seed_csrf(client):
    """Seed a valid CSRF token in the session, mirroring what the browser gets."""
    with client.session_transaction() as sess:
        sess["_csrf_token"] = CSRF_TOKEN


def login_owner_session(client):
    """Store an authenticated owner session in the test client."""
    with client.session_transaction() as sess:
        sess["jwt_token"] = "valid-token"
        sess["user"] = {"username": "admin", "email": "dueno@example.com", "role": "dueno"}


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
        seed_csrf(client)
        resp = client.post(
            "/login",
            data={"username": "admin", "password": "secret123", "_csrf_token": CSRF_TOKEN},
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
        seed_csrf(client)
        resp = client.post(
            "/login",
            data={"username": "sebastian.urzuay", "password": "secret123", "_csrf_token": CSRF_TOKEN},
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
        seed_csrf(client)
        resp = client.post(
            "/login",
            data={"username": "baduser", "password": "wrong", "_csrf_token": CSRF_TOKEN},
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
        seed_csrf(client)
        resp = client.post(
            "/login",
            data={"username": "admin", "password": "secret123", "_csrf_token": CSRF_TOKEN},
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
        seed_csrf(client)
        mock_api.post.return_value = {"boleta_status": "emitida"}

        resp = client.post(
            "/sales/sale-123/retry-boleta",
            data={"_csrf_token": CSRF_TOKEN},
            base_url="http://localhost:5000",
            headers={
                "Referer": "http://localhost:5000/sales/sale-123",
                "Origin": "http://localhost:5000",
            },
        )

        assert resp.status_code == 302
        assert "success=Boleta+procesada+correctamente" in resp.headers["Location"]

    @patch("app.api")
    def test_retry_boleta_error_status_redirects_with_error(self, mock_api, client):
        """HTTP 200 with boleta_status=error should not be shown as success."""
        self.login_owner(client)
        seed_csrf(client)
        mock_api.post.return_value = {
            "boleta_status": "error",
            "error": "Error de credenciales SII. Revise la configuración.",
        }

        resp = client.post(
            "/sales/sale-123/retry-boleta",
            data={"_csrf_token": CSRF_TOKEN},
            base_url="http://localhost:5000",
            headers={
                "Referer": "http://localhost:5000/sales/sale-123",
                "Origin": "http://localhost:5000",
            },
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


class TestCsrfProtection:
    """Tests for the CSRF + same-origin protection on state-changing requests."""

    @patch("app.api")
    def test_post_without_csrf_token_is_forbidden(self, mock_api, client):
        """A POST without a CSRF token must be rejected with 403."""
        login_owner_session(client)
        resp = client.post("/products/p1/delete")
        assert resp.status_code == 403
        mock_api.delete.assert_not_called()

    @patch("app.api")
    def test_post_cross_origin_is_forbidden(self, mock_api, client):
        """A POST from a foreign Origin must be rejected even with a valid token."""
        login_owner_session(client)
        seed_csrf(client)
        resp = client.post(
            "/products/p1/delete",
            data={"_csrf_token": CSRF_TOKEN},
            headers={"Origin": "http://evil.example.com"},
        )
        assert resp.status_code == 403
        mock_api.delete.assert_not_called()

    @patch("app.api")
    def test_post_with_valid_csrf_passes(self, mock_api, client):
        """A same-origin POST with a valid token is allowed through to the view."""
        login_owner_session(client)
        seed_csrf(client)
        mock_api.delete.return_value = {"status_code": 200}
        resp = client.post("/products/p1/delete", data={"_csrf_token": CSRF_TOKEN})
        assert resp.status_code == 302
        mock_api.delete.assert_called_once()


class TestProducts:
    """Tests for product listing, creation and deletion."""

    @patch("app.api")
    def test_products_list_renders(self, mock_api, client):
        """GET /products renders the product list from the API."""
        login_owner_session(client)

        def fake_get(path, params=None, **kwargs):
            if path == "/products":
                return [{"id": "p1", "name": "Coca-Cola 350ml", "price": 1200, "stock": 10}]
            if path == "/products/categories":
                return [{"id": "c1", "name": "Bebidas"}]
            return []

        mock_api.get.side_effect = fake_get
        resp = client.get("/products")
        assert resp.status_code == 200
        assert "Coca-Cola 350ml" in resp.data.decode("utf-8")

    @patch("app.api")
    def test_products_list_handles_paginated_dict(self, mock_api, client):
        """GET /products supports the paginated {data,total} API shape."""
        login_owner_session(client)

        def fake_get(path, params=None, **kwargs):
            if path == "/products":
                return {"data": [{"id": "p1", "name": "Pan", "price": 100, "stock": 5}], "total": 1}
            if path == "/products/categories":
                return []
            return []

        mock_api.get.side_effect = fake_get
        resp = client.get("/products")
        assert resp.status_code == 200

    @patch("app.api")
    def test_product_create_success_redirects(self, mock_api, client):
        """POST /products/new with valid data creates the product and redirects."""
        login_owner_session(client)
        seed_csrf(client)
        mock_api.post.return_value = {"status_code": 201, "id": "p9", "name": "Nuevo"}
        resp = client.post(
            "/products/new",
            data={"name": "Nuevo", "price": "1000", "stock": "5", "_csrf_token": CSRF_TOKEN},
        )
        assert resp.status_code == 302
        assert "created=" in resp.headers["Location"]
        mock_api.post.assert_called_once()

    @patch("app.api")
    def test_product_create_error_rerenders_with_message(self, mock_api, client):
        """POST /products/new re-renders the form with the API error message."""
        login_owner_session(client)
        seed_csrf(client)

        def fake_get(path, params=None, **kwargs):
            return []

        mock_api.get.side_effect = fake_get
        mock_api.post.return_value = {"status_code": 400, "message": "El código de barras ya existe"}
        resp = client.post(
            "/products/new",
            data={"name": "Dup", "price": "1000", "_csrf_token": CSRF_TOKEN},
        )
        assert resp.status_code == 200
        assert "El código de barras ya existe" in resp.data.decode("utf-8")


class TestBulkDelete:
    """Tests for bulk product deletion."""

    @patch("app.api")
    def test_bulk_delete_without_ids_redirects(self, mock_api, client):
        """POST /products/bulk-delete with no ids just redirects back to products."""
        login_owner_session(client)
        seed_csrf(client)
        resp = client.post("/products/bulk-delete", data={"_csrf_token": CSRF_TOKEN})
        assert resp.status_code == 302
        assert "/products" in resp.headers["Location"]
        mock_api.post.assert_not_called()

    @patch("app.api")
    def test_bulk_delete_success_builds_message(self, mock_api, client):
        """A successful bulk delete redirects to products with a success message."""
        login_owner_session(client)
        seed_csrf(client)
        mock_api.post.return_value = {
            "status_code": 200,
            "deleted": 2,
            "skipped": 0,
            "skipped_names": [],
        }
        resp = client.post(
            "/products/bulk-delete",
            data={"ids": ["p1", "p2"], "_csrf_token": CSRF_TOKEN},
        )
        assert resp.status_code == 302
        assert "success=" in resp.headers["Location"]
        mock_api.post.assert_called_once()


class TestMermas:
    """Tests for the mermas (inventory loss) route."""

    def _fake_get(self):
        def fake_get(path, params=None, **kwargs):
            if path == "/products":
                return [{"id": "p1", "name": "Leche", "price": 900, "stock": 3}]
            if path == "/mermas/stats":
                return {"monthly": 0, "weekly": 0}
            if path == "/mermas":
                return []
            return []

        return fake_get

    @patch("app.api")
    def test_mermas_missing_fields_shows_error(self, mock_api, client):
        """POST /mermas without required fields re-renders with an error."""
        login_owner_session(client)
        seed_csrf(client)
        mock_api.get.side_effect = self._fake_get()
        resp = client.post(
            "/mermas",
            data={"product_id": "p1", "quantity": "1", "_csrf_token": CSRF_TOKEN},  # missing cause
        )
        assert resp.status_code == 200
        assert "Complete todos los campos" in resp.data.decode("utf-8")
        mock_api.post.assert_not_called()

    @patch("app.api")
    def test_mermas_create_success_redirects(self, mock_api, client):
        """POST /mermas with valid data registers the loss and redirects."""
        login_owner_session(client)
        seed_csrf(client)
        mock_api.get.side_effect = self._fake_get()
        mock_api.post.return_value = {"status_code": 201, "id": "m1"}
        resp = client.post(
            "/mermas",
            data={"product_id": "p1", "quantity": "2", "cause": "vencido", "_csrf_token": CSRF_TOKEN},
        )
        assert resp.status_code == 302
        assert "/mermas" in resp.headers["Location"]
        mock_api.post.assert_called_once()


class TestShoppingList:
    """Tests for the smart shopping list assistant."""

    @patch("app.api")
    def test_shopping_list_groups_critical_products(self, mock_api, client):
        """Products at or below critical stock appear grouped by category."""
        login_owner_session(client)
        mock_api.get.return_value = [
            {"id": "p1", "name": "Arroz", "stock": 1, "critical_stock": 5,
             "category": {"name": "Abarrotes"}},
            {"id": "p2", "name": "Bebida", "stock": 50, "critical_stock": 5,
             "category": {"name": "Bebidas"}},  # well stocked, should not appear
        ]
        resp = client.get("/shopping-list")
        assert resp.status_code == 200
        body = resp.data.decode("utf-8")
        assert "Arroz" in body
