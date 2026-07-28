// 前端鉴权:Token 存 localStorage。

const TOKEN_KEY = "aluka_ops_token";
const EXPIRES_KEY = "aluka_ops_token_exp";

export function getToken() {
  const t = localStorage.getItem(TOKEN_KEY);
  if (!t) return "";
  const exp = localStorage.getItem(EXPIRES_KEY);
  if (exp) {
    const ts = Date.parse(exp);
    if (!Number.isNaN(ts) && Date.now() > ts) {
      clearToken();
      return "";
    }
  }
  return t;
}

export function setToken(token, expiresAt) {
  if (!token) {
    clearToken();
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
  if (expiresAt) localStorage.setItem(EXPIRES_KEY, expiresAt);
  else localStorage.removeItem(EXPIRES_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
}

export function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** SSE EventSource 无法自定义 Header,用 query 传 token */
export function withAuthQuery(url) {
  const t = getToken();
  if (!t) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(t)}`;
}
