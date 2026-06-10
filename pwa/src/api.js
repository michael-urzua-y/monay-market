function getDefaultApiUrl() {
  const isUnifiedPosPath = window.location.pathname.startsWith('/pos');
  const isDirectApiPort = window.location.port === '3000';
  return isUnifiedPosPath && !isDirectApiPort
    ? window.location.origin + '/api'
    : window.location.origin;
}

function getDefaultLoginUrl() {
  return window.location.origin + '/login';
}

function getRuntimeConfigValue(name) {
  const runtimeConfig = window.MONAY_RUNTIME_CONFIG || {};
  return window[name] || runtimeConfig[name] || '';
}

export const CONFIG = {
  API_URL: getRuntimeConfigValue('MONAY_API_URL') || getDefaultApiUrl(),
  LOGIN_URL: getRuntimeConfigValue('MONAY_LOGIN_URL') || getDefaultLoginUrl(),
};

function getAuthStorage() {
  try {
    return window.sessionStorage;
  } catch (err) {
    return null;
  }
}

function dispatchRequestEvent(type, detail) {
  try {
    window.dispatchEvent(new CustomEvent(type, { detail: detail }));
  } catch (err) {
    // Ignore instrumentation failures to avoid breaking POS flows.
  }
}

export const api = {
  getToken: function () {
    var storage = getAuthStorage();
    return storage ? storage.getItem('monay_token') : null;
  },
  setToken: function (token) {
    var storage = getAuthStorage();
    if (storage) {
      storage.setItem('monay_token', token);
    }
  },
  setUser: function (user) {
    var storage = getAuthStorage();
    if (!storage) return;
    if (user) {
      storage.setItem('monay_user', JSON.stringify(user));
    }
  },
  clearToken: function () {
    var storage = getAuthStorage();
    if (!storage) return;
    storage.removeItem('monay_token');
    storage.removeItem('monay_user');
  },
  request: function (method, path, body, meta) {
    meta = meta || {};
    const headers = {
      'Content-Type': 'application/json',
      'bypass-tunnel-reminder': 'true',
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    const opts = { method: method, headers: headers };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }

    var requestId = 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    dispatchRequestEvent('monay-request-start', {
      requestId: requestId,
      method: method,
      path: path,
      label: meta.label || '',
      blocking: !!meta.blocking,
      source: meta.source || 'api',
    });

    return fetch(CONFIG.API_URL + path, opts)
      .then((res) => {
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
      })
      .finally(function () {
        dispatchRequestEvent('monay-request-end', {
          requestId: requestId,
          method: method,
          path: path,
        });
      });
  },
  get: function (path, meta) { return this.request('GET', path, undefined, meta); },
  post: function (path, body, meta) { return this.request('POST', path, body, meta); },
};
