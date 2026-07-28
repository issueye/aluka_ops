import { Moon, Sun, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { IconTooltip } from "@/components/ued";

const ORDER = ["light", "dark", "system"];

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();

  const cycle = () => {
    const i = ORDER.indexOf(theme);
    const next = ORDER[(i + 1) % ORDER.length];
    setTheme(next);
  };

  const label =
    theme === "system"
      ? `跟随系统(${resolved === "dark" ? "暗色" : "明亮"})`
      : theme === "light"
        ? "明亮主题"
        : "暗色主题";

  return (
    <IconTooltip label={`${label} · 点击切换`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={cycle}
        aria-label={`${label} · 点击切换`}
      >
        {theme === "system" ? (
          <Monitor className="h-4 w-4" />
        ) : resolved === "dark" ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
      </Button>
    </IconTooltip>
  );
}
