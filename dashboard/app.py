"""Panel_Admin — Flask application for store administration.

Provides dashboard, product management, sales history, user management,
and tenant configuration via server-side rendered templates with HTMX.
"""

import json
import os
import secrets
from datetime import datetime
from functools import wraps
from pathlib import Path
from urllib.parse import quote, urljoin
from uuid import uuid4
from zoneinfo import ZoneInfo

import requests

from flask import Flask, Response, abort, jsonify, redirect, render_template, request, session, url_for
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename

from api_client import APIClient
from config import Config

app = Flask(__name__)
app.config.from_object(Config)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_port=1)

api = APIClient(app.config["API_URL"])

ALLOWED_CERTIFICATE_EXTENSIONS = {".pfx", ".p12"}
OWNER_ROLE = "dueno"
POS_ROLES = {"cajero", "vendedor"}
POS_AUTH_COOKIE_MAX_AGE = 60
try:
    DISPLAY_TIMEZONE = ZoneInfo("America/Santiago")
except Exception:
    DISPLAY_TIMEZONE = None


def is_owner(user):
    return (user or {}).get("role") == OWNER_ROLE


def is_pos_operator(user):
    return (user or {}).get("role") in POS_ROLES


def is_dashboard_dev_port():
    return request.host in {"localhost:5000", "127.0.0.1:5000"}


def get_pos_url():
    pos_url = app.config["POS_URL"]
    if pos_url.startswith(("http://", "https://")):
        return pos_url
    if is_dashboard_dev_port():
        return urljoin(app.config["PUBLIC_APP_URL"].rstrip("/") + "/", pos_url.lstrip("/"))
    return pos_url


def get_login_url():
    configured_url = app.config.get("LOGIN_URL")
    if configured_url:
        return configured_url
    if is_dashboard_dev_port():
        return urljoin(app.config["PUBLIC_APP_URL"].rstrip("/") + "/", "login")
    return url_for("login")


def redirect_for_authenticated_session():
    token = session.get("jwt_token")
    user = session.get("user") or {}
    if is_owner(user):
        return redirect(url_for("dashboard"))
    if token and is_pos_operator(user):
        session.clear()
        response = redirect(get_pos_url())
        return set_pos_auth_cookies(response, token, user)
    return None


def set_pos_auth_cookies(response, token, user):
    cookie_options = {
        "max_age": POS_AUTH_COOKIE_MAX_AGE,
        "path": "/",
        "secure": bool(app.config["POS_AUTH_COOKIE_SECURE"]),
        "samesite": "Lax",
    }
    response.set_cookie("monay_pos_token", token, **cookie_options)
    response.set_cookie(
        "monay_pos_user",
        quote(json.dumps(user, separators=(",", ":"))),
        **cookie_options,
    )
    response.set_cookie("monay_login_url", quote(get_login_url()), **cookie_options)
    return response


def clear_pos_auth_cookies(response):
    response.delete_cookie("monay_pos_token", path="/", samesite="Lax")
    response.delete_cookie("monay_pos_user", path="/", samesite="Lax")
    response.delete_cookie("monay_login_url", path="/", samesite="Lax")
    return response


def get_csrf_token() -> str:
    token = session.get("_csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


def is_same_origin_request() -> bool:
    expected_origin = request.host_url.rstrip("/")
    origin = request.headers.get("Origin", "").rstrip("/")
    referer = request.headers.get("Referer", "")

    if origin:
        return origin == expected_origin

    if referer:
        return referer.startswith(expected_origin + "/") or referer == expected_origin

    return True


def login_required(f):
    """Decorator that redirects to login if no JWT token in session."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = session.get("user") or {}
        if "jwt_token" not in session or not is_owner(user):
            session.clear()
            login_url = get_login_url()
            if request.headers.get("HX-Request") == "true" or request.path.startswith("/htmx/"):
                response = Response(status=401)
                response.headers["HX-Redirect"] = login_url
                response.headers["X-Monay-Auth-Expired"] = "1"
                return clear_pos_auth_cookies(response)
            response = redirect(login_url)
            return clear_pos_auth_cookies(response)
        return f(*args, **kwargs)

    return decorated_function


@app.context_processor
def inject_user():
    """Make user data available in all templates."""
    return {
        "current_user": session.get("user"),
        "asset_version": app.config.get("ASSET_VERSION", "1"),
        "csrf_token": get_csrf_token(),
    }


@app.before_request
def enforce_csrf_protection():
    if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
        return None

    endpoint = request.endpoint or ""
    if endpoint == "static":
        return None

    if not is_same_origin_request():
        abort(403)

    expected = session.get("_csrf_token")
    provided = (
        request.form.get("_csrf_token")
        or request.headers.get("X-CSRF-Token")
    )

    if not expected or not provided or not secrets.compare_digest(expected, provided):
        abort(403)

    return None


@app.after_request
def apply_no_store_headers(response):
    endpoint = request.endpoint or ""
    if endpoint == "static":
        return response

    cacheable_prefixes = ("htmx_",)
    if endpoint.startswith(cacheable_prefixes):
        return response

    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def save_certificate_upload(cert_file, tenant_id):
    """Persist an uploaded SII certificate with a safe generated filename."""
    original_name = secure_filename(cert_file.filename or "")
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_CERTIFICATE_EXTENSIONS:
        raise ValueError("Solo se permiten certificados .pfx o .p12")

    upload_dir = Path(app.config["CERT_UPLOAD_DIR"])
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{tenant_id}_{uuid4().hex}{suffix}"
    filepath = upload_dir / filename
    cert_file.save(filepath)
    os.chmod(filepath, 0o600)
    return str(filepath)


def parse_decimal_field(name, default=0.0):
    raw_value = str(request.form.get(name, default) or default).replace(",", ".")
    return float(raw_value)


def parse_product_form():
    is_weighed = request.form.get("is_weighed") == "on"
    use_critical_stock = request.form.get("use_critical_stock") == "on"
    critical_stock = (
        parse_decimal_field("critical_stock", 0)
        if (not is_weighed or use_critical_stock)
        else 0
    )
    return {
        "name": request.form.get("name", "").strip(),
        "barcode": request.form.get("barcode", "").strip() or None,
        "price": int(request.form.get("price", 0) or 0),
        "stock": parse_decimal_field("stock", 0),
        "critical_stock": critical_stock,
        "is_weighed": is_weighed,
        "tracks_stock": True,
        "allow_cashier_reception": False,
    }


# --- Auth routes ---


@app.route("/login", methods=["GET", "POST"])
def login():
    """Handle login: render form (GET) or authenticate (POST)."""
    if "jwt_token" in session:
        role_redirect = redirect_for_authenticated_session()
        if role_redirect:
            return role_redirect
        session.clear()

    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        result = api.post("/auth/login", {"username": username, "password": password})

        if result.get("status_code") == 201 and result.get("accessToken"):
            user = result.get("user", {})
            if is_owner(user):
                session.permanent = True
                session["jwt_token"] = result["accessToken"]
                session["user"] = user
                return redirect(url_for("dashboard"))
            if is_pos_operator(user):
                session.clear()
                response = redirect(get_pos_url())
                return set_pos_auth_cookies(response, result["accessToken"], user)

            session["login_error"] = "Perfil no autorizado para esta aplicación"
            return redirect(url_for("login"))

        if result.get("status_code") == 201:
            user = result.get("user", {})
            if is_pos_operator(user):
                session["login_error"] = "No se recibió token de acceso para el punto de venta"
                return redirect(url_for("login"))

        session["login_error"] = "Credenciales inválidas"
        return redirect(url_for("login"))

    return render_template("login.html", error=session.pop("login_error", None))


@app.route("/logout")
def logout():
    """Clear session and redirect to login."""
    session.clear()
    response = redirect(url_for("login"))
    clear_pos_auth_cookies(response)
    return response


@app.route("/pos")
@app.route("/pos/")
def pos_redirect():
    """Redirect direct dashboard-port POS requests to the unified POS route."""
    return redirect(get_pos_url())


# --- Main routes ---


@app.route("/")
@login_required
def index():
    """Redirect root to dashboard."""
    return redirect(url_for("dashboard"))


@app.route("/dashboard")
@login_required
def dashboard():
    """Render main dashboard with metrics."""
    return render_template("dashboard.html")


@app.route("/products")
@login_required
def products():
    """Render products listing page with search and category filter."""
    search = request.args.get("search", "").strip()
    category_id = request.args.get("category_id", "").strip()
    page = int(request.args.get("page", 1))
    per_page = 10

    params = {"page": page, "limit": per_page}
    if search:
        params["name"] = search
    if category_id:
        params["category_id"] = category_id

    products_data = api.get("/products", params=params)

    # Handle paginated response from API
    if isinstance(products_data, dict) and "data" in products_data:
        product_list = products_data["data"]
        total = products_data.get("total", len(product_list))
    else:
        product_list = products_data if isinstance(products_data, list) else []
        total = len(product_list)

    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))

    # Get categories from dedicated endpoint
    categories_data = api.get("/products/categories")
    categories = {}
    if isinstance(categories_data, list):
        for cat in categories_data:
            if isinstance(cat, dict) and cat.get("id") and cat.get("name"):
                categories[cat["id"]] = cat["name"]

    return render_template(
        "products.html",
        products=product_list,
        categories=categories,
        search=search,
        category_id=category_id,
        page=page,
        total_pages=total_pages,
        total=total,
        success=request.args.get("success"),
    )


@app.route("/shopping-list")
@login_required
def shopping_list():
    """Renderiza el Asistente Inteligente de Compras."""
    products_data = api.get("/products", params={})
    products = products_data if isinstance(products_data, list) else []

    grouped_list = {}
    for p in products:
        try:
            stock = float(p.get("stock", 0))
            crit = float(p.get("critical_stock", 0))
        except (ValueError, TypeError):
            stock, crit = 0.0, 0.0

        # Mostrar si el stock crítico está configurado (>0) y el stock está por debajo o igual
        if crit > 0 and stock <= crit:
            cat_name = "Sin categoría"
            if p.get("category") and isinstance(p["category"], dict) and p["category"].get("name"):
                cat_name = p["category"]["name"]

            if cat_name not in grouped_list:
                grouped_list[cat_name] = []

            # Inteligencia: Sugerir comprar hasta llegar al doble del stock crítico
            suggested = (crit * 2) - stock
            if suggested <= 0:
                suggested = 1

            p["suggested_qty"] = round(suggested, 3) if p.get("is_weighed") else int(suggested)
            grouped_list[cat_name].append(p)

    # Ordenar las categorías alfabéticamente para que la lista sea ordenada
    grouped_list = dict(sorted(grouped_list.items()))
    return render_template("shopping_list.html", grouped_list=grouped_list)


@app.route("/htmx/products/search")
@login_required
def htmx_products_search():
    """HTMX endpoint for live product search."""
    search = request.args.get("search", "").strip()
    category_id = request.args.get("category_id", "").strip()
    page = int(request.args.get("page", 1))
    per_page = 10

    params = {"page": page, "limit": per_page}
    if search:
        params["name"] = search
    if category_id:
        params["category_id"] = category_id

    products_data = api.get("/products", params=params)

    # Handle paginated response from API
    if isinstance(products_data, dict) and "data" in products_data:
        product_list = products_data["data"]
        total = products_data.get("total", len(product_list))
    else:
        product_list = products_data if isinstance(products_data, list) else []
        total = len(product_list)

    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))

    return render_template(
        "htmx/products_table.html",
        products=product_list,
        page=page,
        total_pages=total_pages,
        total=total,
        search=search,
        category_id=category_id,
    )


@app.route("/products/new", methods=["GET", "POST"])
@login_required
def products_new():
    """Render product creation form (GET) or create product (POST)."""
    if request.method == "POST":
        data = parse_product_form()
        cat_id = request.form.get("category_id", "").strip()
        if cat_id:
            data["category_id"] = cat_id

        result = api.post("/products", data=data)

        if isinstance(result, dict) and result.get("status_code", 200) >= 400:
            error_msg = result.get("message", "Error al crear producto")
            if isinstance(error_msg, list):
                error_msg = ", ".join(error_msg)
            categories_data = api.get("/products/categories", params={})
            categories = {c.get("id"): c.get("name") for c in (categories_data if isinstance(categories_data, list) else [])}
            return render_template(
                "products_new.html",
                error=error_msg,
                form=data,
                categories=categories,
            )

        created_name = data.get("name", "Producto")
        return redirect(url_for("products_new", created=created_name))

    # GET: render empty form
    created_name = request.args.get("created")
    categories_data = api.get("/products/categories", params={})
    categories = {c.get("id"): c.get("name") for c in (categories_data if isinstance(categories_data, list) else [])}
    return render_template("products_new.html", categories=categories, form={}, created=created_name)


@app.route("/products/<product_id>/edit", methods=["GET", "POST"])
@login_required
def products_edit(product_id):
    """Render product edit form (GET) or update product (POST)."""
    if request.method == "POST":
        data = parse_product_form()
        cat_id = request.form.get("category_id", "").strip()
        if cat_id:
            data["category_id"] = cat_id
        else:
            data["category_id"] = None

        result = api.patch(f"/products/{product_id}", data=data)

        if isinstance(result, dict) and result.get("status_code", 200) >= 400:
            error_msg = result.get("message", "Error al actualizar producto")
            if isinstance(error_msg, list):
                error_msg = ", ".join(error_msg)
            categories_data = api.get("/products/categories", params={})
            categories = {c.get("id"): c.get("name") for c in (categories_data if isinstance(categories_data, list) else [])}
            return render_template(
                "products_edit.html",
                error=error_msg,
                product=data,
                product_id=product_id,
                categories=categories,
            )

        return redirect(url_for("products"))

    # GET: fetch product and render form
    product = api.get(f"/products/{product_id}")
    if isinstance(product, dict) and product.get("status_code", 200) >= 400:
        return redirect(url_for("products"))

    all_products = api.get("/products", params={})
    if isinstance(product, dict) and product.get("status_code", 200) >= 400:
        return redirect(url_for("products"))

    categories_data = api.get("/products/categories", params={})
    categories = {c.get("id"): c.get("name") for c in (categories_data if isinstance(categories_data, list) else [])}
    return render_template(
        "products_edit.html",
        product=product,
        product_id=product_id,
        categories=categories,
    )


@app.route("/products/<product_id>/delete", methods=["POST"])
@login_required
def products_delete(product_id):
    """Soft-delete a product via API."""
    result = api.delete(f"/products/{product_id}")

    if isinstance(result, dict) and result.get("status_code", 200) >= 400:
        error_msg = result.get("message", "Error al eliminar producto")
        if isinstance(error_msg, list):
            error_msg = ", ".join(error_msg)
        # Re-render products page with error
        search = request.args.get("search", "").strip()
        category_id = request.args.get("category_id", "").strip()
        params = {}
        if search:
            params["name"] = search
        if category_id:
            params["category_id"] = category_id
        products_data = api.get("/products", params=params)
        product_list = products_data if isinstance(products_data, list) else []
        categories_data = api.get("/products/categories", params={})
        categories = {c.get("id"): c.get("name") for c in (categories_data if isinstance(categories_data, list) else [])}
        return render_template(
            "products.html",
            products=product_list,
            categories=categories,
            search=search,
            category_id=category_id,
            error=error_msg,
        )

    return redirect(url_for("products"))


@app.route("/products/bulk-delete", methods=["POST"])
@login_required
def products_bulk_delete():
    """Bulk soft-delete products via API."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

    ids = request.form.getlist("ids")
    if not ids:
        return redirect(url_for("products"))

    result = api.post("/products/bulk-delete", data={"ids": ids})

    if isinstance(result, dict) and result.get("status_code", 200) < 400:
        deleted = result.get("deleted", 0)
        skipped = result.get("skipped", 0)
        skipped_names = result.get("skipped_names", [])
        msg = f"{deleted} producto{'s' if deleted != 1 else ''} eliminado{'s' if deleted != 1 else ''}"
        if skipped > 0:
            msg += f". {skipped} no se pudieron eliminar (ventas recientes): {', '.join(skipped_names[:5])}"
        return redirect(url_for("products", success=msg))

    return redirect(url_for("products"))


@app.route("/products/import", methods=["GET", "POST"])
@login_required
def products_import():
    """Render Excel import form (GET) or process upload (POST)."""
    if request.method == "POST":
        file = request.files.get("file")
        if not file or not file.filename:
            return render_template("products_import.html", error="Seleccione un archivo Excel")

        files = {"file": (file.filename, file.stream, file.content_type)}
        result = api.post_file("/products/import-excel", files=files)

        if isinstance(result, dict) and result.get("status_code", 200) >= 400:
            error_msg = result.get("message", "Error al importar archivo")
            details = result.get("details", [])
            return render_template(
                "products_import.html",
                error=error_msg,
                import_errors=details,
            )

        updated = result.get("updated", 0) if isinstance(result, dict) else 0
        errors = result.get("errors", []) if isinstance(result, dict) else []
        return render_template(
            "products_import.html",
            success=True,
            updated=updated,
            import_errors=errors,
        )

    return render_template("products_import.html")


@app.route("/products/import/template")
@login_required
def products_import_template():
    """Download the Excel template from the API."""
    url = f"{app.config['API_URL']}/products/import-template"
    headers = {"Authorization": f"Bearer {session.get('jwt_token')}"}
    resp = requests.get(url, headers=headers)
    if resp.status_code == 200:
        return Response(
            resp.content,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-disposition": "attachment; filename=Plantilla_Importacion_Productos.xlsx"}
        )
    return redirect(url_for("products_import", error="Error al generar la plantilla"))


@app.route("/htmx/products/lookup-barcode/<code>")
@login_required
def htmx_lookup_barcode(code):
    """Lookup barcode via API and return form field fragment."""
    result = api.get(f"/products/lookup-barcode/{code}")
    if isinstance(result, dict) and not result.get("error"):
        name = result.get("name") or ""
        return render_template("htmx/barcode_lookup_result.html", name=name)
    return render_template("htmx/barcode_lookup_result.html", name="")


def _extract_categories(products_data):
    """Extract unique categories dict {id: name} from products list."""
    categories = {}
    items = products_data if isinstance(products_data, list) else []
    for p in items:
        if isinstance(p, dict) and p.get("category_id") and p.get("category"):
            cat = p["category"]
            if isinstance(cat, dict):
                categories[cat.get("id", "")] = cat.get("name", "")
    return categories


@app.route("/sales")
@login_required
def sales():
    """Render sales history page with date and boleta_status filters."""
    current_user = session.get("user", {})
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()
    boleta_status = request.args.get("boleta_status", "").strip()
    user_id = request.args.get("user_id", "").strip()
    page = int(request.args.get("page", 1))
    per_page = 10

    params = {"page": page, "limit": per_page}
    if date_from:
        params["date_from"] = date_from
    if date_to:
        # Se añade hasta el final del día para incluir ventas de la misma fecha
        params["date_to"] = f"{date_to}T23:59:59Z"
    if boleta_status:
        params["boleta_status"] = boleta_status
    if current_user.get("role") == "dueno" and user_id:
        params["user_id"] = user_id

    sales_data = api.get("/sales", params=params)

    # Handle paginated response from API
    if isinstance(sales_data, dict) and "data" in sales_data:
        sales_list = sales_data["data"]
        total = sales_data.get("total", len(sales_list))
    else:
        sales_list = sales_data if isinstance(sales_data, list) else []
        total = len(sales_list)

    users_list = []
    if current_user.get("role") == "dueno":
        users_data = api.get("/users")
        users_list = users_data if isinstance(users_data, list) else []

    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))

    return render_template(
        "sales.html",
        sales=sales_list,
        page=page,
        total_pages=total_pages,
        total=total,
        date_from=date_from,
        date_to=date_to,
        boleta_status=boleta_status,
        user_id=user_id,
        users=users_list,
        current_role=current_user.get("role"),
    )


@app.route("/arqueos")
@login_required
def arqueos():
    """Renderiza el historial de cuadraturas (cierres de caja)."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()
    page = int(request.args.get("page", 1))
    per_page = 10

    params = {}
    if date_from:
        params["date_from"] = date_from
    if date_to:
        params["date_to"] = f"{date_to}T23:59:59Z"

    data = api.get("/sales/arqueos", params=params)
    arqueos_list = data if isinstance(data, list) else []

    total = len(arqueos_list)
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    start = (page - 1) * per_page
    paginated = arqueos_list[start:start + per_page]

    return render_template(
        "arqueos.html",
        arqueos=paginated,
        page=page,
        total_pages=total_pages,
        total=total,
        date_from=date_from,
        date_to=date_to,
    )


@app.route("/sales/pending-boleta")
@login_required
def sales_pending():
    """Render pending boleta sales page."""
    sales_data = api.get("/sales", params={"boleta_status": "pendiente"})
    sales_list = sales_data if isinstance(sales_data, list) else []

    error = request.args.get("error")
    success = request.args.get("success")

    return render_template(
        "sales_pending.html",
        sales=sales_list,
        error=error,
        success=success,
    )


@app.route("/sales/<sale_id>")
@login_required
def sales_detail(sale_id):
    """Render sale detail page with lines, payment info, and boleta data."""
    sale = api.get(f"/sales/{sale_id}")
    if isinstance(sale, dict) and sale.get("status_code", 200) >= 400:
        return redirect(url_for("sales"))

    return render_template("sales_detail.html", sale=sale, receipt=None)


@app.route("/sales/<sale_id>/retry-boleta", methods=["POST"])
@login_required
def sales_retry_boleta(sale_id):
    """Retry boleta emission for a sale via API."""
    result = api.post(f"/sales/{sale_id}/retry-boleta")

    referer = request.referrer or ""
    if "pending-boleta" in referer:
        target = "sales_pending"
    elif f"/sales/{sale_id}" in referer:
        target = "sales_detail"
    else:
        target = "sales"

    if isinstance(result, dict) and result.get("status_code", 200) >= 400:
        error_msg = result.get("message", "Error al reintentar boleta")
        if isinstance(error_msg, list):
            error_msg = ", ".join(error_msg)
        if target == "sales_detail":
            return redirect(url_for("sales_detail", sale_id=sale_id, error=error_msg))
        return redirect(url_for(target, error=error_msg))

    boleta_status = result.get("boleta_status") if isinstance(result, dict) else None
    if boleta_status != "emitida":
        error_msg = "La boleta no fue emitida. Revisa la configuración SII."
        if isinstance(result, dict):
            error_msg = result.get("error") or result.get("message") or error_msg
            if isinstance(error_msg, list):
                error_msg = ", ".join(error_msg)
        if target == "sales_detail":
            return redirect(url_for("sales_detail", sale_id=sale_id, error=error_msg))
        return redirect(url_for(target, error=error_msg))

    if target == "sales_detail":
        return redirect(url_for("sales_detail", sale_id=sale_id, success="Boleta procesada correctamente"))
    return redirect(url_for(target, success="Boleta procesada correctamente"))


@app.route("/users")
@login_required
def users():
    """Render user management page (dueño only)."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

    users_data = api.get("/users")
    users_list = users_data if isinstance(users_data, list) else []

    error = request.args.get("error")
    success = request.args.get("success")

    return render_template("users.html", users=users_list, error=error, success=success)


@app.route("/users", methods=["POST"])
@login_required
def users_create():
    """Create a new cajero user via API."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    confirm_password = request.form.get("confirm_password", "")
    if not username:
        return redirect(url_for("users", error="El nombre de usuario es obligatorio"))
    if len(password) < 8:
        return redirect(url_for("users", error="La contraseña debe tener al menos 8 caracteres"))
    if password != confirm_password:
        return redirect(url_for("users", error="La confirmación de contraseña no coincide"))

    data = {
        "username": username,
        "password": password,
    }

    result = api.post("/users", data=data)

    if isinstance(result, dict) and result.get("status_code", 200) >= 400:
        error_msg = result.get("message", "Error al crear usuario")
        if isinstance(error_msg, list):
            error_msg = ", ".join(error_msg)
        return redirect(url_for("users", error=error_msg))

    return redirect(url_for("users", success="Cajero creado correctamente"))


@app.route("/users/<user_id>/toggle", methods=["POST"])
@login_required
def users_toggle(user_id):
    """Toggle active status of a cajero user via API."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

    new_active = request.form.get("active") == "true"
    result = api.patch(f"/users/{user_id}", data={"active": new_active})

    if isinstance(result, dict) and result.get("status_code", 200) >= 400:
        error_msg = result.get("message", "Error al actualizar usuario")
        if isinstance(error_msg, list):
            error_msg = ", ".join(error_msg)
        return redirect(url_for("users", error=error_msg))

    return redirect(url_for("users"))


@app.route("/users/<user_id>/reset-password", methods=["POST"])
@login_required
def users_reset_password(user_id):
    """Reset password of a cajero user via API."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

    new_password = request.form.get("password", "").strip()
    confirm_password = request.form.get("confirm_password", "").strip()
    if not new_password or len(new_password) < 8:
        return redirect(url_for("users", error="La nueva contraseña debe tener al menos 8 caracteres"))
    if new_password != confirm_password:
        return redirect(url_for("users", error="La confirmación de contraseña no coincide"))

    result = api.post(f"/users/{user_id}/reset-password", data={"password": new_password})

    if isinstance(result, dict) and result.get("status_code", 200) >= 400:
        error_msg = result.get("message", "Error al resetear contraseña")
        if isinstance(error_msg, list):
            error_msg = ", ".join(error_msg)
        return redirect(url_for("users", error=error_msg))

    return redirect(url_for("users", success="Contraseña actualizada correctamente"))


@app.route("/settings")
@login_required
def settings():
    """Render tenant configuration page (dueño only)."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

    if request.args.get("clear_sii_key") == "1":
        api.patch("/tenant/config/sii", data={"sii_api_key": ""})
        return redirect(url_for("settings"))
    if request.args.get("clear_sii_rut") == "1":
        api.patch("/tenant/config/sii", data={"sii_rut_emisor": ""})
        return redirect(url_for("settings"))
    if request.args.get("clear_sii_auth_rut") == "1":
        api.patch("/tenant/config/sii", data={"sii_rut_autenticador": ""})
        return redirect(url_for("settings"))
    if request.args.get("clear_sii_codigo_sucursal") == "1":
        api.patch("/tenant/config/sii", data={"sii_codigo_sucursal": None})
        return redirect(url_for("settings"))
    if request.args.get("clear_sii_clave") == "1":
        api.patch("/tenant/config/sii", data={"sii_clave_tributaria": ""})
        return redirect(url_for("settings"))

    config_data = api.get("/tenant/config")
    subscription_data = api.get("/tenant/subscription")

    error = request.args.get("error")
    success = request.args.get("success")

    return render_template(
        "settings.html",
        config=config_data if isinstance(config_data, dict) else {},
        subscription=subscription_data if isinstance(subscription_data, dict) else {},
        error=error,
        success=success,
    )


@app.route("/settings/sii", methods=["POST"])
@login_required
def settings_sii():
    """Update SII configuration via API."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

    certificado_file = request.files.get("certificado")
    certificado_path = None

    if certificado_file and certificado_file.filename:
        try:
            tenant_id = session.get("user", {}).get("tenant_id", "tenant")
            certificado_path = save_certificate_upload(certificado_file, tenant_id)
        except ValueError as exc:
            return redirect(url_for("settings", error=str(exc)))

    data = {
        "sii_enabled": request.form.get("sii_enabled") == "on",
        "sii_provider": request.form.get("sii_provider") or None,
        "sii_razon_social": request.form.get("sii_razon_social", "").strip() or None,
        "sii_giro": request.form.get("sii_giro", "").strip() or None,
        "sii_sandbox_mode": request.form.get("sii_sandbox_mode") == "on",
    }

    if "sii_api_key" in request.form:
        data["sii_api_key"] = request.form.get("sii_api_key", "").strip() or None
    if "sii_rut_emisor" in request.form:
        data["sii_rut_emisor"] = request.form.get("sii_rut_emisor", "").strip() or None
    if "sii_rut_autenticador" in request.form:
        data["sii_rut_autenticador"] = request.form.get("sii_rut_autenticador", "").strip() or None
    if "sii_codigo_sucursal" in request.form:
        codigo_sucursal = request.form.get("sii_codigo_sucursal", "").strip()
        data["sii_codigo_sucursal"] = int(codigo_sucursal) if codigo_sucursal else None
    if "sii_clave_tributaria" in request.form:
        data["sii_clave_tributaria"] = request.form.get("sii_clave_tributaria", "").strip() or None

    if certificado_path:
        data["sii_certificado_path"] = certificado_path
        data["sii_certificado_password"] = request.form.get("certificado_password", "").strip() or None

    result = api.patch("/tenant/config/sii", data=data)

    if isinstance(result, dict) and result.get("status_code", 200) >= 400:
        error_msg = result.get("message", "Error al actualizar configuración SII")
        if isinstance(error_msg, list):
            error_msg = ", ".join(error_msg)
        return redirect(url_for("settings", error=error_msg))

    return redirect(url_for("settings", success="Configuración SII actualizada"))


@app.route("/settings/printer", methods=["POST"])
@login_required
def settings_printer():
    """Update printer configuration via API."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

    data = {
        "printer_enabled": request.form.get("printer_enabled") == "on",
    }

    result = api.patch("/tenant/config/printer", data=data)

    if isinstance(result, dict) and result.get("status_code", 200) >= 400:
        error_msg = result.get("message", "Error al actualizar configuración de impresora")
        if isinstance(error_msg, list):
            error_msg = ", ".join(error_msg)
        return redirect(url_for("settings", error=error_msg))

    return redirect(url_for("settings", success="Configuración de impresora actualizada"))


@app.route("/settings/change-password", methods=["POST"])
@login_required
def settings_change_password():
    """Change the current user's password."""
    current_password = request.form.get("current_password", "").strip()
    new_password = request.form.get("new_password", "").strip()
    confirm_password = request.form.get("confirm_password", "").strip()

    if not current_password or not new_password:
        return redirect(url_for("users"))

    if new_password != confirm_password:
        return redirect(url_for("users", error="Las contraseñas nuevas no coinciden"))

    if len(new_password) < 8:
        return redirect(url_for("users", error="La contraseña debe tener al menos 8 caracteres"))

    result = api.post("/users/me/change-password", data={
        "current_password": current_password,
        "new_password": new_password,
    })

    if isinstance(result, dict) and result.get("status_code", 200) >= 400:
        error_msg = result.get("message", "Error al cambiar contraseña")
        if isinstance(error_msg, list):
            error_msg = ", ".join(error_msg)
        return redirect(url_for("users", error=error_msg))

    return redirect(url_for("users", success="Contraseña cambiada exitosamente"))


def format_clp(value):
    """Format an integer as Chilean peso with dot thousands separator."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return "$0"
    formatted = f"{abs(n):,}".replace(",", ".")
    return f"-${formatted}" if n < 0 else f"${formatted}"


@app.template_filter("clp")
def clp_filter(value):
    """Jinja2 filter: {{ amount|clp }} → $1.490"""
    return format_clp(value)


def parse_receipt_datetime(value):
    """Parse API ISO datetime values and show them in Chilean local time."""
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is not None and DISPLAY_TIMEZONE is not None:
        return dt.astimezone(DISPLAY_TIMEZONE)
    return dt


@app.template_filter("receipt_date")
def receipt_date_filter(value):
    dt = parse_receipt_datetime(value)
    if not dt:
        return "—"
    return f"{dt.day:02d}-{dt.month:02d}-{dt.year}"


@app.template_filter("receipt_datetime")
def receipt_datetime_filter(value):
    dt = parse_receipt_datetime(value)
    if not dt:
        return "—"
    suffix = "p. m." if dt.hour >= 12 else "a. m."
    hour = dt.hour % 12 or 12
    return f"{dt.day:02d}-{dt.month:02d}-{dt.year} {hour}:{dt.minute:02d} {suffix}"


@app.template_filter("receipt_quantity")
def receipt_quantity_filter(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return value or 0
    if number.is_integer():
        return str(int(number))
    return f"{number:.3f}".rstrip("0").rstrip(".")


# --- HTMX Dashboard endpoints ---


@app.route("/htmx/dashboard/today")
@login_required
def htmx_dashboard_today():
    """Return HTML fragment with today's sales metrics."""
    data = api.get("/dashboard/today")
    if data.get("error") or data.get("status_code", 200) >= 400:
        return render_template("htmx/error_fragment.html", title="Ventas del día")
    return render_template(
        "htmx/today_metrics.html",
        total_ventas=format_clp(data.get("total_ventas", 0)),
        cantidad_ventas=data.get("cantidad_ventas", 0),
    )


@app.route("/htmx/dashboard/monthly")
@login_required
def htmx_dashboard_monthly():
    """Return HTML fragment with monthly comparison metrics."""
    data = api.get("/dashboard/monthly")
    if data.get("error") or data.get("status_code", 200) >= 400:
        return render_template("htmx/error_fragment.html", title="Acumulado mensual")
    variacion = data.get("variacion_porcentual")
    if variacion is not None:
        variacion = round(variacion, 1)
    return render_template(
        "htmx/monthly_metrics.html",
        mes_actual=format_clp(data.get("mes_actual", 0)),
        mes_anterior=format_clp(data.get("mes_anterior", 0)),
        variacion=variacion,
    )


@app.route("/htmx/dashboard/daily-chart")
@login_required
def htmx_dashboard_daily_chart():
    """Return JSON array for Chart.js daily sales chart."""
    month = request.args.get("month")
    params = {}
    if month:
        params["month"] = month
        
    data = api.get("/dashboard/daily-chart", params=params)
    if isinstance(data, dict) and (data.get("error") or data.get("status_code", 200) >= 400):
        return jsonify([])
    # data is a list from the API (with status_code injected in dict wrapper)
    # The API returns a list, but our client wraps it — handle both cases
    if isinstance(data, list):
        return jsonify(data)
    # If the client returned a dict with the list inside, extract it
    chart_data = data if isinstance(data, list) else []
    return jsonify(chart_data)


@app.route("/htmx/dashboard/critical-stock")
@login_required
def htmx_dashboard_critical_stock():
    """Return HTML table rows for critical stock products."""
    page = int(request.args.get("page", 1))
    per_page = 5

    data = api.get("/dashboard/critical-stock")
    if isinstance(data, dict) and (data.get("error") or data.get("status_code", 200) >= 400):
        return render_template("htmx/critical_stock_table.html", products=[])
    
    products = data if isinstance(data, list) else []
    
    # Paginación
    total = len(products)
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    start = (page - 1) * per_page
    paginated = products[start:start + per_page]

    # Format prices for display
    for p in paginated:
        if isinstance(p, dict):
            p["price"] = format_clp(p.get("price", 0))
            
    return render_template(
        "htmx/critical_stock_table.html", 
        products=paginated,
        page=page,
        total_pages=total_pages,
        total=total
    )


@app.route("/htmx/dashboard/critical-stock-count")
@login_required
def htmx_dashboard_critical_stock_count():
    """Return badge count for critical stock products in sidebar."""
    data = api.get("/dashboard/critical-stock")
    if isinstance(data, dict) and (data.get("error") or data.get("status_code", 200) >= 400):
        return ""
    count = len(data) if isinstance(data, list) else 0
    if count == 0:
        return '<script>document.getElementById("critical-stock-badge").style.display="none";</script>'
    return f'{count}<script>document.getElementById("critical-stock-badge").style.display="inline";</script>'


@app.route("/htmx/dashboard/inventory-value")
@login_required
def htmx_dashboard_inventory_value():
    """Return HTML fragment with inventory valuation."""
    data = api.get("/dashboard/inventory-value")
    if data.get("error") or data.get("status_code", 200) >= 400:
        return render_template("htmx/error_fragment.html", title="Valorización inventario")
    return render_template(
        "htmx/inventory_value.html",
        valor_total=format_clp(data.get("valor_total", 0)),
    )


@app.route("/htmx/dashboard/top-products")
@login_required
def htmx_dashboard_top_products():
    """Return HTML fragment with top and bottom selling products."""
    data = api.get("/dashboard/top-products")
    if isinstance(data, dict) and (data.get("error") or data.get("status_code", 200) >= 400):
        return render_template("htmx/error_fragment.html", title="Ranking de Productos")
    
    top = data.get("top", []) if isinstance(data, dict) else []
    bottom = data.get("bottom", []) if isinstance(data, dict) else []
    
    # Formatear números para que no salgan decimales vacíos (ej: 5.000 -> 5)
    for p in top + bottom:
        try:
            qty = float(p.get("total_quantity", 0))
            # 'g' quita los ceros finales, y replace cambia el punto por la coma chilena
            p["total_quantity"] = f"{qty:g}".replace(".", ",")
        except (ValueError, TypeError):
            pass

    return render_template("htmx/top_products.html", top=top, bottom=bottom)


@app.route("/htmx/dashboard/peak-hours")
@login_required
def htmx_dashboard_peak_hours():
    """Return JSON array for Chart.js peak hours chart."""
    period = request.args.get("period", "month")
    data = api.get("/dashboard/peak-hours", params={"period": period})
    if isinstance(data, dict) and (data.get("error") or data.get("status_code", 200) >= 400):
        return jsonify([])
    if isinstance(data, list):
        return jsonify(data)
    return jsonify([])


@app.route("/htmx/dashboard/last-sale")
@login_required
def htmx_dashboard_last_sale():
    """Return HTML fragment with the last sale info."""
    data = api.get("/sales", params={"limit": "1"})

    # Handle different response formats
    sales = []
    if isinstance(data, list):
        sales = data
    elif isinstance(data, dict):
        if data.get("status_code", 200) >= 400 or data.get("error"):
            return '<div class="card-header"><h3 class="card-title">Última venta</h3></div><div class="card-body"><p style="color:var(--color-text-muted);">Sin datos</p></div>'
        sales = data.get("data", data.get("items", []))

    if not sales:
        return '<div class="card-header"><h3 class="card-title">Última venta</h3></div><div class="card-body"><p style="color:var(--color-text-muted);">No hay ventas registradas</p></div>'

    sale = sales[0] if isinstance(sales, list) and sales else {}
    total = format_clp(sale.get("total", 0))
    method = sale.get("payment_method", "—")
    method_icon = "💵" if method == "efectivo" else "💳"
    created = sale.get("created_at", "")
    created_dt = parse_receipt_datetime(created)
    if created_dt:
        suffix = "p. m." if created_dt.hour >= 12 else "a. m."
        hour = created_dt.hour % 12 or 12
        time_str = f"{hour}:{created_dt.minute:02d} {suffix}"
        date_str = f"{created_dt.day:02d}-{created_dt.month:02d}-{created_dt.year}"
    else:
        time_str = "—"
        date_str = ""

    return f'''<div class="card-header"><h3 class="card-title">Última venta</h3></div>
<div class="card-body" style="display:flex; flex-direction:column; gap:8px;">
    <div style="font-size:1.8rem; font-weight:800; color:var(--color-text);">{total}</div>
    <div style="display:flex; gap:12px; color:var(--color-text-muted); font-size:0.9rem;">
        <span>{method_icon} {method.capitalize()}</span>
        <span>🕐 {time_str}</span>
    </div>
    <div style="font-size:0.8rem; color:var(--color-text-muted);">{date_str}</div>
</div>'''


# --- Mermas routes ---

@app.route("/mermas", methods=["GET", "POST"])
@login_required
def mermas():
    """Render merma registration page (GET) or create merma (POST)."""
    products_data = api.get("/products", params={})
    product_list = products_data if isinstance(products_data, list) else []

    # Get current month for stats
    from datetime import datetime
    current_month = datetime.now().strftime("%Y-%m")
    stats_data = api.get("/mermas/stats", params={"month": current_month})
    stats = stats_data if isinstance(stats_data, dict) else {"monthly": 0, "weekly": 0}

    if request.method == "POST":
        product_id = request.form.get("product_id", "").strip()
        quantity = float(str(request.form.get("quantity", 0) or 0).replace(",", "."))
        cause = request.form.get("cause", "").strip()
        note = request.form.get("note", "").strip() or None

        if not product_id or not quantity or not cause:
            return render_template(
                "mermas.html",
                products=product_list,
                mermas=api.get("/mermas") or [],
                stats=stats,
                error="Complete todos los campos requeridos",
            )

        data = {
            "product_id": product_id,
            "quantity": quantity,
            "cause": cause,
            "note": note,
        }

        result = api.post("/mermas", data=data)

        if isinstance(result, dict) and result.get("status_code", 200) >= 400:
            error_msg = result.get("message", "Error al registrar merma")
            return render_template(
                "mermas.html",
                products=product_list,
                mermas=api.get("/mermas") or [],
                stats=stats,
                error=str(error_msg),
            )

        return redirect(url_for("mermas"))

    mermas_list = api.get("/mermas") or []
    page = int(request.args.get("page", 1))
    return render_template("mermas.html", products=product_list, mermas=mermas_list, stats=stats, page=page)


if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=app.config["FLASK_ENV"] == "development", port=5000)
