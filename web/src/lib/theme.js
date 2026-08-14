// 主题: light | dark | system
// 持久化 localStorage,应用到 <html>/<body> 的 class。

const STORAGE_KEY = "aluka_ops_theme";

// 主题变更订阅(供 Toaster 等非 hook 场景同步 resolved 主题)
const listeners = new Set();

/** 订阅 resolved 主题变更,返回取消订阅函数 */
export function subscribeTheme(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStoredTheme() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

export function setStoredTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function resolveTheme(theme) {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "dark";
}

/** 将解析后的主题应用到 DOM */
export function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  const body = document.body;
  root.classList.remove("light", "dark");
  body.classList.remove("light", "dark");
  root.classList.add(resolved);
  body.classList.add(resolved);
  // 同步 color-scheme,改善原生控件/滚动条
  root.style.colorScheme = resolved;
  listeners.forEach((fn) => fn(resolved));
  return resolved;
}
