import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  setStoredTheme,
} from "@/lib/theme";

/**
 * 主题切换 hook。
 * @returns {{ theme: 'light'|'dark'|'system', resolved: 'light'|'dark', setTheme: (t)=>void, toggle: ()=>void }}
 */
export function useTheme() {
  const [theme, setThemeState] = useState(() => getStoredTheme());
  const [resolved, setResolved] = useState(() => resolveTheme(getStoredTheme()));

  const setTheme = useCallback((next) => {
    setStoredTheme(next);
    setThemeState(next);
    setResolved(applyTheme(next));
  }, []);

  const toggle = useCallback(() => {
    // 在 light/dark 间切换(忽略 system,便于一键切换)
    const cur = resolveTheme(theme);
    setTheme(cur === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  useEffect(() => {
    setResolved(applyTheme(theme));
    if (theme !== "system") return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(applyTheme("system"));
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [theme]);

  return { theme, resolved, setTheme, toggle };
}
