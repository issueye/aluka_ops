// 终端(xterm)主题:从全局 CSS token 实时解析,跟随亮/暗主题切换。
// 与 LogViewer 的 bg-log / text-log-foreground 保持同一套配色来源。
import { subscribeTheme } from "@/lib/theme";

function hsl(name, alpha) {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return alpha != null ? `hsl(${v} / ${alpha})` : `hsl(${v})`;
}

/** 依据当前主题生成 xterm theme 对象 */
export function getTerminalTheme() {
  return {
    background: hsl("--log-bg"),
    foreground: hsl("--log-text"),
    cursor: hsl("--primary"),
    cursorAccent: hsl("--log-bg"),
    selectionBackground: hsl("--primary", 0.3),
    black: hsl("--log-bg"),
    brightBlack: hsl("--muted-foreground"),
    brightGreen: hsl("--success"),
    brightYellow: hsl("--warning"),
    brightRed: hsl("--danger"),
    brightBlue: hsl("--primary"),
  };
}

/** 让已挂载的 Terminal 实例跟随主题变化,返回取消订阅函数 */
export function attachTerminalTheme(term) {
  return subscribeTheme(() => {
    term.options.theme = getTerminalTheme();
  });
}
