"""HTTP client for communicating with API_Backend.

Proxies all requests through Flask session-stored JWT token.
Handles Authorization header injection and token expiration gracefully.
"""

from typing import Optional

import requests
from flask import session


class APIClient:
    """HTTP client that proxies requests to the API_Backend with JWT auth."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def _get_headers(self) -> dict:
        """Build request headers with JWT Bearer token from session."""
        headers = {"Content-Type": "application/json"}
        token = session.get("jwt_token")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    def _handle_response(self, response: requests.Response) -> dict:
        """Process API response, handling token expiration gracefully."""
        if response.status_code == 401:
            session.pop("jwt_token", None)
            session.pop("user", None)
            return {"error": "SESSION_EXPIRED", "status_code": 401}

        try:
            data = response.json()
        except (ValueError, requests.exceptions.JSONDecodeError):
            data = {"raw": response.text}

        # If the API returns a list (e.g. daily-chart, critical-stock),
        # return it directly without injecting status_code.
        if isinstance(data, list):
            return data

        data["status_code"] = response.status_code
        return data

    def _make_request(self, method: str, endpoint: str, **kwargs) -> dict:
        """Centralizes requests calls and exception handling."""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        if "headers" not in kwargs:
            kwargs["headers"] = self._get_headers()
        if "timeout" not in kwargs:
            kwargs["timeout"] = 15
            
        try:
            resp = requests.request(method, url, **kwargs)
            return self._handle_response(resp)
        except requests.exceptions.ConnectionError:
            return {"error": "CONNECTION_ERROR", "message": "No se pudo conectar con el servidor", "status_code": 503}
        except requests.exceptions.Timeout:
            return {"error": "TIMEOUT", "message": "El servidor no respondió a tiempo", "status_code": 504}

    def get(self, endpoint: str, params: Optional[dict] = None) -> dict:
        """Send GET request to API_Backend."""
        return self._make_request("GET", endpoint, params=params)

    def post(self, endpoint: str, data: Optional[dict] = None) -> dict:
        """Send POST request to API_Backend."""
        return self._make_request("POST", endpoint, json=data)

    def patch(self, endpoint: str, data: Optional[dict] = None) -> dict:
        """Send PATCH request to API_Backend."""
        return self._make_request("PATCH", endpoint, json=data)

    def delete(self, endpoint: str) -> dict:
        """Send DELETE request to API_Backend."""
        return self._make_request("DELETE", endpoint)

    def post_file(self, endpoint: str, files: dict, data: Optional[dict] = None) -> dict:
        """Send POST request with file upload to API_Backend."""
        headers = {}
        token = session.get("jwt_token")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return self._make_request("POST", endpoint, headers=headers, files=files, data=data, timeout=30)
