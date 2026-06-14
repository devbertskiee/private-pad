import { describe, expect, it } from "vitest";
import {
  deriveTabLabel,
  EMPTY_TAB_LABEL,
  isNotebook,
  MAX_NOTEBOOK_TABS,
  NOTEBOOK_VERSION,
  parseNotebookPlaintext,
  serializeNotebook,
  TAB_LABEL_MAX_CHARS,
  type Notebook,
} from "./notebook";

function notebook(overrides: Partial<Notebook> = {}): Notebook {
  return {
    type: "notebook",
    version: NOTEBOOK_VERSION,
    tabs: [
      { id: "first", content: "alpha" },
      { id: "second", content: "beta" },
    ],
    activeTabId: "second",
    ...overrides,
  };
}

describe("notebook helpers", () => {
  it("recognizes supported notebook plaintext", () => {
    const value = notebook();

    expect(isNotebook(value)).toBe(true);
    expect(parseNotebookPlaintext(JSON.stringify(value))).toEqual(value);
  });

  it("rejects malformed notebook-like values", () => {
    const validTabs = Array.from({ length: MAX_NOTEBOOK_TABS }, (_, index) => ({
      id: `tab-${index}`,
      content: "",
    }));

    expect(isNotebook({ ...notebook(), type: "other" })).toBe(false);
    expect(isNotebook({ ...notebook(), version: 2 })).toBe(false);
    expect(isNotebook({ ...notebook(), tabs: [] })).toBe(false);
    expect(
      isNotebook({
        ...notebook(),
        tabs: [...validTabs, { id: "too-many", content: "" }],
      })
    ).toBe(false);
    expect(isNotebook({ ...notebook(), tabs: [{ id: "", content: "" }] })).toBe(
      false
    );
    expect(
      isNotebook({
        ...notebook(),
        tabs: [
          { id: "same", content: "" },
          { id: "same", content: "" },
        ],
      })
    ).toBe(false);
    expect(
      isNotebook({ ...notebook(), tabs: [{ id: "first", content: 123 }] })
    ).toBe(false);
    expect(isNotebook({ ...notebook(), activeTabId: "missing" })).toBe(false);
  });

  it("wraps legacy plaintext for invalid JSON and invalid notebook shapes", () => {
    expect(parseNotebookPlaintext("legacy plain text", "legacy")).toEqual({
      type: "notebook",
      version: NOTEBOOK_VERSION,
      tabs: [{ id: "legacy", content: "legacy plain text" }],
      activeTabId: "legacy",
    });

    const malformedNotebookText = JSON.stringify({
      type: "notebook",
      version: NOTEBOOK_VERSION,
      tabs: [],
      activeTabId: "missing",
    });
    expect(
      parseNotebookPlaintext(malformedNotebookText, "fallback").tabs[0]?.content
    ).toBe(malformedNotebookText);
  });

  it("serializes notebooks for encrypted saves", () => {
    const value = notebook({ activeTabId: "first" });

    expect(JSON.parse(serializeNotebook(value))).toEqual(value);
  });

  it("derives safe tab labels from plaintext", () => {
    expect(deriveTabLabel("")).toBe(EMPTY_TAB_LABEL);
    expect(deriveTabLabel("  \n\t  ")).toBe(EMPTY_TAB_LABEL);
    expect(deriveTabLabel("\n\n  First   useful\tline  \nsecond line")).toBe(
      "First useful line"
    );

    const long = "abcdefghijklmnopqrstuvwxyz";
    expect(deriveTabLabel(long)).toBe(`${long.slice(0, TAB_LABEL_MAX_CHARS)}…`);
  });
});
