"use client";

import { useEffect } from "react";

type ThemePreference = "light" | "dark";

const THEME_STORAGE_KEY = "zk-note-theme";

function getSystemTheme(): ThemePreference {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getStoredTheme(): ThemePreference {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : getSystemTheme();
}

export function ThemeRoot() {
  useEffect(() => {
    document.documentElement.classList.toggle(
      "dark",
      getStoredTheme() === "dark"
    );
  }, []);

  return null;
}

export { THEME_STORAGE_KEY };
