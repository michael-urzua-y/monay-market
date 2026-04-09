export const CONFIG = {
  API_URL: window.MONAY_API_URL || window.location.origin,
};

export const api = {
  getToken: function () {
    return localStorage.getItem('monay_token');
  },
  setToken: function (token) {
    localStorage.setItem('monay_token', token);
  },
  clearToken: function () {
    localStorage.removeItem('monay_token');
  },
  request: function (method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    const opts = { method: method, headers: headers };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    return fetch(CONFIG.API_URL + path, opts).then((res) => {
      if (res.status === 401) {
        this.clearToken();
        // Disparamos un evento global en vez de depender del router local
        window.dispatchEvent(new CustomEvent('monay-auth-expired'));
        throw new Error('Sesión expirada');
      }
      return res.json().catch(() => null).then((data) => {
        if (!res.ok) {
          const err = new Error((data && data.message) || 'Error del servidor');
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  },
  get: function (path) { return this.request('GET', path); },
  post: function (path, body) { return this.request('POST', path, body); },
};