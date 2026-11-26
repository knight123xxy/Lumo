import { ref, watchEffect } from "vue";
import { uiSettings } from "@/stores/settings";

export function registerAppearance() {
  const hostWindow = window as Window & {
    __electrobunSendToHost?: (message: { type: "appearance"; dark: boolean; backgroundColor: string; textColor: string }) => void;
  };
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const systemDark = ref(systemTheme.matches);
  const updateSystemTheme = (event: MediaQueryListEvent) => { systemDark.value = event.matches; };
  systemTheme.addEventListener("change", updateSystemTheme);
  // ACT: 深色主题下近黑主色会让主按钮黑底黑字；过暗的品牌色在深色下提升为近白，保持「浅色=黑按钮 / 深色=白按钮」的一致观感。
  const isTooDark = (color: string) => {
    const value = color.replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return false;
    const channels = [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16) / 255) as [number, number, number];
    const linear = (channel: number) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return 0.2126 * linear(channels[0]) + 0.7152 * linear(channels[1]) + 0.0722 * linear(channels[2]) < 0.18;
  };
  const stop = watchEffect(() => {
    const { theme, primaryColor, fontScale, radius } = uiSettings.value;
    const dark = theme === "system" ? systemDark.value : theme === "dark";
    const accent = dark && isTooDark(primaryColor) ? "#f5f5f5" : primaryColor;
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.setAttribute("theme-mode", dark ? "dark" : "light");
    root.style.colorScheme = dark ? "dark" : "light";
    root.style.fontSize = `${(16 * fontScale) / 100}px`;
    root.style.setProperty("--ui-radius", `${radius}px`);
    root.style.setProperty("--el-color-primary", accent);
    for (let level = 1; level <= 9; level++) {
      root.style.setProperty(`--el-color-primary-light-${level}`,
        `color-mix(in srgb, ${accent} ${100 - level * 10}%, ${dark ? "#141414" : "#fff"})`);
    }
    root.style.setProperty("--el-color-primary-dark-2", `color-mix(in srgb, ${accent} 80%, ${dark ? "#fff" : "#000"})`);
    if (window === window.top && hostWindow.__electrobunSendToHost) {
      const style = getComputedStyle(root);
      hostWindow.__electrobunSendToHost({
        type: "appearance",
        dark,
        backgroundColor: style.getPropertyValue("--el-bg-color").trim(),
        textColor: style.getPropertyValue("--el-text-color-primary").trim(),
      });
    }
  });
  return () => {
    stop();
    systemTheme.removeEventListener("change", updateSystemTheme);
  };
}
