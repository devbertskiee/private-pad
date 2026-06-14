// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY, ThemeRoot } from "./theme-root";

describe("ThemeRoot", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies the browser-local persisted theme across pages", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(<ThemeRoot />);

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
