export const NOTEBOOK_TYPE = "notebook" as const;
export const NOTEBOOK_VERSION = 1 as const;
export const MAX_NOTEBOOK_TABS = 20 as const;
export const TAB_LABEL_MAX_CHARS = 24 as const;
export const EMPTY_TAB_LABEL = "Empty Tab" as const;

export type NotebookTab = {
  id: string;
  content: string;
};

export type Notebook = {
  type: typeof NOTEBOOK_TYPE;
  version: typeof NOTEBOOK_VERSION;
  tabs: NotebookTab[];
  activeTabId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createTabId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createEmptyNotebook(tabId = createTabId()): Notebook {
  return {
    type: NOTEBOOK_TYPE,
    version: NOTEBOOK_VERSION,
    tabs: [{ id: tabId, content: "" }],
    activeTabId: tabId,
  };
}

export function wrapLegacyPlaintextAsNotebook(
  plaintext: string,
  tabId = createTabId()
): Notebook {
  return {
    type: NOTEBOOK_TYPE,
    version: NOTEBOOK_VERSION,
    tabs: [{ id: tabId, content: plaintext }],
    activeTabId: tabId,
  };
}

export function isNotebook(value: unknown): value is Notebook {
  if (!isRecord(value)) return false;
  if (value.type !== NOTEBOOK_TYPE || value.version !== NOTEBOOK_VERSION)
    return false;
  if (
    !Array.isArray(value.tabs) ||
    value.tabs.length < 1 ||
    value.tabs.length > MAX_NOTEBOOK_TABS
  )
    return false;
  if (typeof value.activeTabId !== "string") return false;

  const ids = new Set<string>();
  for (const tab of value.tabs) {
    if (!isRecord(tab)) return false;
    if (typeof tab.id !== "string" || tab.id.length === 0) return false;
    if (ids.has(tab.id)) return false;
    if (typeof tab.content !== "string") return false;
    ids.add(tab.id);
  }

  return ids.has(value.activeTabId);
}

export function parseNotebookPlaintext(
  plaintext: string,
  fallbackTabId = createTabId()
): Notebook {
  try {
    const parsed = JSON.parse(plaintext) as unknown;
    if (isNotebook(parsed)) return parsed;
  } catch {
    // Legacy plaintext may be arbitrary text, including invalid JSON.
  }

  return wrapLegacyPlaintextAsNotebook(plaintext, fallbackTabId);
}

export function serializeNotebook(notebook: Notebook): string {
  return JSON.stringify(notebook);
}

export function deriveTabLabel(content: string): string {
  const firstNonEmptyLine = content
    .trim()
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);

  const collapsed = firstNonEmptyLine?.trim().replace(/\s+/g, " ") ?? "";
  const label = collapsed.length > 0 ? collapsed : EMPTY_TAB_LABEL;

  if (label.length <= TAB_LABEL_MAX_CHARS) return label;
  return `${label.slice(0, TAB_LABEL_MAX_CHARS)}…`;
}
