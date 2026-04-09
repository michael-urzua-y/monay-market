"""Panel_Admin — Flask application for store administration.

Provides dashboard, product management, sales history, user management,
and tenant configuration via server-side rendered templates with HTMX.
"""

from functools import wraps

from flask import Flask, jsonify, redirect, render_template, request, session, url_for

from api_client import APIClient
from config import Config

app = Flask(__name__)
app.config.from_object(Config)

api = APIClient(app.config["API_URL"])


def login_required(f):
    """Decorator that redirects to login if no JWT token in session."""

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "jwt_token" not in session:
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return decorated_function


@app.context_processor
def inject_user():
    """Make user data available in all templates."""
    return {"current_user": session.get("user")}


# --- Auth routes ---


@app.route("/login", methods=["GET", "POST"])
def login():
    """Handle login: render form (GET) or authenticate (POST)."""
    if "jwt_token" in session:
        return redirect(url_for("dashboard"))

    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")

        result = api.post("/auth/login", {"email": email, "password": password})

        if result.get("status_code") == 201 and result.get("accessToken"):
            session["jwt_token"] = result["accessToken"]
            session["user"] = result.get("user", {})
            return redirect(url_for("dashboard"))

        return render_template("login.html", error="Credenciales inválidas")

    return render_template("login.html")


@app.route("/logout")
def logout():
    """Clear session and redirect to login."""
    session.clear()
    return redirect(url_for("login"))


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
    per_page = 15

    params = {}
    if search:
        params["name"] = search
    if category_id:
        params["category_id"] = category_id

    products_data = api.get("/products", params=params)
    product_list = products_data if isinstance(products_data, list) else []

    # Pagination
    total = len(product_list)
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    start = (page - 1) * per_page
    paginated = product_list[start:start + per_page]

    # Get categories from dedicated endpoint
    categories_data = api.get("/products/categories")
    categories = {}
    if isinstance(categories_data, list):
        for cat in categories_data:
            if isinstance(cat, dict) and cat.get("id") and cat.get("name"):
                categories[cat["id"]] = cat["name"]

    return render_template(
        "products.html",
        products=paginated,
        categories=categories,
        search=search,
        category_id=category_id,
        page=page,
        total_pages=total_pages,
        total=total,
    )


@app.route("/htmx/products/search")
@login_required
def htmx_products_search():
    """HTMX endpoint for live product search."""
    search = request.args.get("search", "").strip()
    category_id = request.args.get("category_id", "").strip()
    page = int(request.args.get("page", 1))
    per_page = 15

    params = {}
    if search:
        params["name"] = search
    if category_id:
        params["category_id"] = category_id

    products_data = api.get("/products", params=params)
    product_list = products_data if isinstance(products_data, list) else []

    total = len(product_list)
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    start = (page - 1) * per_page
    paginated = product_list[start:start + per_page]

    return render_template(
        "htmx/products_table.html",
        products=paginated,
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
        data = {
            "name": request.form.get("name", "").strip(),
            "barcode": request.form.get("barcode", "").strip() or None,
            "price": int(request.form.get("price", 0) or 0),
            "stock": int(request.form.get("stock", 0) or 0),
            "critical_stock": int(request.form.get("critical_stock", 0) or 0),
        }
        cat_id = request.form.get("category_id", "").strip()
        if cat_id:
            data["category_id"] = cat_id

        result = api.post("/products", data=data)

        if isinstance(result, dict) and result.get("status_code", 200) >= 400:
            error_msg = result.get("message", "Error al crear producto")
            if isinstance(error_msg, list):
                error_msg = ", ".join(error_msg)
            # Fetch categories for re-rendering the form
            all_products = api.get("/products", params={})
            categories = _extract_categories(all_products)
            return render_template(
                "products_new.html",
                error=error_msg,
                form=data,
                categories=categories,
            )

        return redirect(url_for("products"))

    # GET: render empty form
    all_products = api.get("/products", params={})
    categories = _extract_categories(all_products)
    return render_template("products_new.html", categories=categories, form={})


@app.route("/products/<product_id>/edit", methods=["GET", "POST"])
@login_required
def products_edit(product_id):
    """Render product edit form (GET) or update product (POST)."""
    if request.method == "POST":
        data = {
            "name": request.form.get("name", "").strip(),
            "barcode": request.form.get("barcode", "").strip() or None,
            "price": int(request.form.get("price", 0) or 0),
            "stock": int(request.form.get("stock", 0) or 0),
            "critical_stock": int(request.form.get("critical_stock", 0) or 0),
        }
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
            all_products = api.get("/products", params={})
            categories = _extract_categories(all_products)
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
    categories = _extract_categories(all_products)
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
        all_products = api.get("/products", params={})
        categories = _extract_categories(all_products)
        return render_template(
            "products.html",
            products=product_list,
            categories=categories,
            search=search,
            category_id=category_id,
            error=error_msg,
        )

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
    date_from = request.args.get("date_from", "").strip()
    date_to = request.args.get("date_to", "").strip()
    boleta_status = request.args.get("boleta_status", "").strip()
    page = int(request.args.get("page", 1))
    per_page = 15

    params = {}
    if date_from:
        params["date_from"] = date_from
    if date_to:
        # Se añade hasta el final del día para incluir ventas de la misma fecha
        params["date_to"] = f"{date_to}T23:59:59Z"
    if boleta_status:
        params["boleta_status"] = boleta_status

    sales_data = api.get("/sales", params=params)
    sales_list = sales_data if isinstance(sales_data, list) else []

    # Paginación idéntica a la vista de productos
    total = len(sales_list)
    total_pages = max(1, (total + per_page - 1) // per_page)
    page = max(1, min(page, total_pages))
    start = (page - 1) * per_page
    paginated = sales_list[start:start + per_page]

    return render_template(
        "sales.html",
        sales=paginated,
        page=page,
        total_pages=total_pages,
        total=total,
        date_from=date_from,
        date_to=date_to,
        boleta_status=boleta_status,
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

    return render_template("sales_detail.html", sale=sale)


@app.route("/sales/<sale_id>/retry-boleta", methods=["POST"])
@login_required
def sales_retry_boleta(sale_id):
    """Retry boleta emission for a sale via API."""
    result = api.post(f"/sales/{sale_id}/retry-boleta")

    if isinstance(result, dict) and result.get("status_code", 200) >= 400:
        error_msg = result.get("message", "Error al reintentar boleta")
        if isinstance(error_msg, list):
            error_msg = ", ".join(error_msg)
        return redirect(url_for("sales_pending", error=error_msg))

    return redirect(url_for("sales_pending", success="Boleta procesada correctamente"))


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

    data = {
        "email": request.form.get("email", "").strip(),
        "password": request.form.get("password", ""),
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


@app.route("/settings")
@login_required
def settings():
    """Render tenant configuration page (dueño only)."""
    user = session.get("user", {})
    if user.get("role") != "dueno":
        return redirect(url_for("dashboard"))

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

    data = {
        "sii_enabled": request.form.get("sii_enabled") == "on",
        "sii_provider": request.form.get("sii_provider") or None,
        "sii_api_key": request.form.get("sii_api_key", "").strip() or None,
        "sii_rut_emisor": request.form.get("sii_rut_emisor", "").strip() or None,
        "sii_sandbox_mode": request.form.get("sii_sandbox_mode") == "on",
    }

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
    data = api.get("/dashboard/critical-stock")
    if isinstance(data, dict) and (data.get("error") or data.get("status_code", 200) >= 400):
        return render_template("htmx/critical_stock_table.html", products=[])
    products = data if isinstance(data, list) else []
    # Format prices for display
    for p in products:
        if isinstance(p, dict):
            p["price"] = format_clp(p.get("price", 0))
    return render_template("htmx/critical_stock_table.html", products=products)


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


if __name__ == "__main__":
    app.run(debug=app.config["FLASK_ENV"] == "development", port=5000)
