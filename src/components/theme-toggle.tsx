"use client";

import { useTheme } from "@/components/theme-provider";
import { THEME_OPTIONS } from "@/lib/theme";
import type { ThemePreference } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div
      suppressHydrationWarning
      className="shrink-0 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 dark:border-neutral-700 dark:bg-neutral-900"
      role="group"
      aria-label="화면 테마"
    >
      {THEME_OPTIONS.map(({ value, label }) => (
        <ThemeButton
          key={value}
          value={value}
          label={label}
          active={theme === value}
          onSelect={setTheme}
        />
      ))}
    </div>
  );
}

function ThemeButton({
  value,
  label,
  active,
  onSelect,
}: {
  value: ThemePreference;
  label: string;
  active: boolean;
  onSelect: (v: ThemePreference) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-sm ${
        active
          ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50"
          : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      }`}
    >
      {label}
    </button>
  );
}
