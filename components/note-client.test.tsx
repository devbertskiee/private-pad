// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatNoteTitle, NoteClient } from "./note-client";
import { ThemeProvider } from "./theme-provider";
import { decryptNoteText, encryptNoteText } from "@/lib/crypto/note-crypto";
import {
  NOTEBOOK_VERSION,
  serializeNotebook,
  type Notebook,
} from "@/lib/notes/notebook";
import {
  CRYPTO_VERSION,
  ENCRYPTION_ALG,
  KDF,
  KDF_ITERATIONS,
} from "@/lib/notes/contract";

vi.mock("@/lib/crypto/note-crypto", () => ({
  decryptNoteText: vi.fn(),
  encryptNoteText: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

const encryptedPayload = {
  cryptoVersion: CRYPTO_VERSION,
  kdf: KDF,
  kdfIterations: KDF_ITERATIONS,
  salt: "salt",
  encryptionAlg: ENCRYPTION_ALG,
  iv: "iv",
  ciphertext: "ciphertext",
};

const storedNote = {
  slug: "daily-log",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...encryptedPayload,
};

function notebook(
  tabs: Notebook["tabs"],
  activeTabId = tabs[0]?.id ?? "tab-1"
): Notebook {
  return { type: "notebook", version: NOTEBOOK_VERSION, tabs, activeTabId };
}

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function statusResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({}),
  } as Response;
}

function mockFetchSequence(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>(
    async () => responses.shift() ?? okJson({ exists: false })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderNoteClient(slug = "daily-log") {
  return render(
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="zk-note-theme"
    >
      <NoteClient slug={slug} />
    </ThemeProvider>
  );
}

async function submitPasswordChange(
  newPassword: string,
  confirmPassword = newPassword
) {
  if (!screen.queryByRole("dialog", { name: "Change Password" })) {
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  }
  const dialog = within(
    screen.getByRole("dialog", { name: "Change Password" })
  );
  fireEvent.change(dialog.getByLabelText("New password"), {
    target: { value: newPassword },
  });
  fireEvent.change(dialog.getByLabelText("Confirm new password"), {
    target: { value: confirmPassword },
  });
  fireEvent.click(dialog.getByRole("button", { name: "Save" }));
}

async function unlock(password = "pw") {
  fireEvent.change(await screen.findByLabelText("Note password"), {
    target: { value: password },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /create locally|unlock/i })
  );
  return screen.findByLabelText("Note text");
}

describe("NoteClient tabbed editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    vi.mocked(encryptNoteText).mockResolvedValue(encryptedPayload);
    vi.mocked(decryptNoteText).mockResolvedValue("legacy text");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("opens a new note with one empty tab and supports add, switch, edit, and save", async () => {
    const fetchMock = mockFetchSequence(
      okJson({ exists: false }),
      okJson({ ok: true, note: storedNote })
    );
    renderNoteClient();

    const textarea = await unlock();
    expect(textarea).toHaveProperty("value", "");
    expect(screen.getByRole("tab", { name: /empty tab/i })).toBeTruthy();

    fireEvent.change(textarea, { target: { value: "first tab" } });
    fireEvent.click(screen.getByRole("button", { name: "Add tab" }));
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByLabelText("Note text")).toHaveProperty("value", "");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Note text"))
    );

    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "second tab" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /first tab/i }));
    expect(screen.getByLabelText("Note text")).toHaveProperty(
      "value",
      "first tab"
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const saveBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(saveBody).toEqual({ expectedRevision: null, ...encryptedPayload });
    expect(saveBody).not.toHaveProperty("tabs");
    expect(saveBody).not.toHaveProperty("tabLabels");
    expect(saveBody).not.toHaveProperty("tabCount");
    expect(saveBody).not.toHaveProperty("activeTabId");
    expect(vi.mocked(encryptNoteText).mock.calls[0]?.[0]).toContain(
      '"type":"notebook"'
    );
    expect(vi.mocked(encryptNoteText).mock.calls[0]?.[0]).toContain(
      "second tab"
    );
  });

  it("wraps legacy plaintext on unlock and restores valid notebook plaintext", async () => {
    mockFetchSequence(okJson({ exists: true, note: storedNote }));
    vi.mocked(decryptNoteText).mockResolvedValueOnce("legacy text");
    const { unmount } = renderNoteClient();

    await unlock();
    expect(screen.getByLabelText("Note text")).toHaveProperty(
      "value",
      "legacy text"
    );
    unmount();

    const existing = notebook(
      [
        { id: "one", content: "first" },
        { id: "two", content: "second" },
      ],
      "two"
    );
    mockFetchSequence(okJson({ exists: true, note: storedNote }));
    vi.mocked(decryptNoteText).mockResolvedValueOnce(
      serializeNotebook(existing)
    );
    renderNoteClient();

    await unlock();
    expect(screen.getByLabelText("Note text")).toHaveProperty(
      "value",
      "second"
    );
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });

  it("handles cancelled close, confirmed close, and last-tab replacement", async () => {
    mockFetchSequence(okJson({ exists: true, note: storedNote }));
    vi.mocked(decryptNoteText).mockResolvedValueOnce(
      serializeNotebook(
        notebook(
          [
            { id: "one", content: "keep" },
            { id: "two", content: "remove" },
          ],
          "two"
        )
      )
    );
    const confirmMock = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);
    renderNoteClient();

    await unlock();
    fireEvent.click(screen.getByRole("button", { name: "Close tab 2" }));
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByLabelText("Note text")).toHaveProperty(
      "value",
      "remove"
    );

    fireEvent.click(screen.getByRole("button", { name: "Close tab 2" }));
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByLabelText("Note text")).toHaveProperty("value", "keep");

    fireEvent.click(screen.getByRole("button", { name: "Close tab 1" }));
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /empty tab/i })).toBeTruthy();
    expect(confirmMock).toHaveBeenCalledWith(
      "Close this tab? Unsaved text in this tab will be removed."
    );
  });

  it("shows the tab limit and disables the plus action", async () => {
    mockFetchSequence(okJson({ exists: true, note: storedNote }));
    vi.mocked(decryptNoteText).mockResolvedValueOnce(
      serializeNotebook(
        notebook(
          Array.from({ length: 20 }, (_, index) => ({
            id: `tab-${index}`,
            content: `tab ${index}`,
          }))
        )
      )
    );
    renderNoteClient();

    await unlock();

    expect(screen.getByText("Tab limit reached")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add tab" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("saves with Ctrl+S only while unlocked and avoids duplicate shortcut saves while saving", async () => {
    const pendingSave = new Promise<Response>(() => undefined);
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return pendingSave;
      return okJson({ exists: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderNoteClient();

    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await unlock();
    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "shortcut" },
    });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const keyboardSaveBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body)
    );
    expect(keyboardSaveBody).toEqual({
      expectedRevision: null,
      ...encryptedPayload,
    });
    expect(keyboardSaveBody).not.toHaveProperty("tabs");
    expect(keyboardSaveBody).not.toHaveProperty("tabLabels");
    expect(keyboardSaveBody).not.toHaveProperty("tabCount");
    expect(keyboardSaveBody).not.toHaveProperty("activeTabId");
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("removes empty tabs before saving a multi-tab notebook", async () => {
    const fetchMock = mockFetchSequence(
      okJson({ exists: true, note: storedNote }),
      okJson({ ok: true, note: storedNote })
    );
    vi.mocked(decryptNoteText).mockResolvedValueOnce(
      serializeNotebook(
        notebook(
          [
            { id: "one", content: "keep this" },
            { id: "two", content: "" },
            { id: "three", content: "  \n\t  " },
          ],
          "two"
        )
      )
    );
    renderNoteClient();

    await unlock();
    expect(screen.getAllByRole("tab")).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const savedNotebook = JSON.parse(
      String(vi.mocked(encryptNoteText).mock.calls[0]?.[0])
    ) as Notebook;
    expect(savedNotebook.tabs).toEqual([{ id: "one", content: "keep this" }]);
    expect(savedNotebook.activeTabId).toBe("one");
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByLabelText("Note text")).toHaveProperty(
      "value",
      "keep this"
    );
  });

  it("shows a saving overlay while saving and saved status after save", async () => {
    const { toast } = await import("sonner");
    let resolveSave: (response: Response) => void = () => undefined;
    const pendingSave = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      if (init?.method === "PUT") return pendingSave;
      return okJson({ exists: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderNoteClient();

    await unlock();
    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "toast text" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saving encrypted note…")).toBeTruthy();

    resolveSave(okJson({ ok: true, note: storedNote }));

    expect(await screen.findAllByText("Saved")).not.toHaveLength(0);
    expect(toast.success).toHaveBeenCalledWith("Note saved");
    await waitFor(() =>
      expect(screen.queryByText("Saving encrypted note…")).toBeNull()
    );
  });

  it("renders title, header actions, theme storage, and themed tab strip", async () => {
    mockFetchSequence(okJson({ exists: false }));
    renderNoteClient("daily_log");

    await unlock();

    expect(
      screen.getByRole("heading", { name: "Daily Log Notes" })
    ).toBeTruthy();
    expect(
      screen.getByRole("tablist", { name: "Note tabs" }).className
    ).toContain("themed-tab-scrollbar");
    expect(screen.getByLabelText("Note text").className).toContain(
      "dark:bg-[oklch(0.155_0.005_285.823)]"
    );

    const actionNames = screen
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label") ?? button.textContent)
      .filter((name) =>
        [
          "Save",
          "Lock",
          "Change password",
          "Switch to light theme",
          "Switch to dark theme",
          "Delete note",
        ].includes(String(name))
      );
    expect(actionNames).toEqual([
      "Save",
      "Lock",
      "Change password",
      "Switch to light theme",
      "Delete note",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Switch to light theme" })
    );
    await waitFor(() =>
      expect(window.localStorage.getItem("zk-note-theme")).toBe("light")
    );
  });

  it("deletes with expected revision, clears editor, and shows a success toast", async () => {
    const { toast } = await import("sonner");
    const fetchMock = mockFetchSequence(
      okJson({ exists: true, note: storedNote }),
      okJson({ ok: true })
    );
    vi.mocked(decryptNoteText).mockResolvedValueOnce(
      serializeNotebook(notebook([{ id: "one", content: "delete me" }]))
    );
    renderNoteClient();

    await unlock();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(await screen.findByText("Delete note?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      expectedRevision: 1,
    });
    await waitFor(() =>
      expect(screen.queryByLabelText("Note text")).toBeNull()
    );
    expect(
      await screen.findByRole("button", { name: "Create locally" })
    ).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Note deleted");
  });

  it("keeps the editor available and sends no delete request when deletion is cancelled", async () => {
    const fetchMock = mockFetchSequence(
      okJson({ exists: true, note: storedNote })
    );
    vi.mocked(decryptNoteText).mockResolvedValueOnce(
      serializeNotebook(notebook([{ id: "one", content: "keep me" }]))
    );
    renderNoteClient();

    await unlock();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(await screen.findByText("Delete note?")).toBeTruthy();
    expect(
      screen.getByTestId("destructive-dialog-actions").className
    ).toContain("flex-row");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain(
      "bg-secondary"
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByText("Delete note?")).toBeNull());
    expect(screen.getByLabelText("Note text")).toHaveProperty(
      "value",
      "keep me"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the editor visible and shows delete conflict on stale revision", async () => {
    mockFetchSequence(
      okJson({ exists: true, note: storedNote }),
      statusResponse(409)
    );
    vi.mocked(decryptNoteText).mockResolvedValueOnce(
      serializeNotebook(notebook([{ id: "one", content: "keep me" }]))
    );
    renderNoteClient();

    await unlock();
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Delete conflict")).toBeTruthy();
    expect(screen.getByLabelText("Note text")).toHaveProperty(
      "value",
      "keep me"
    );
  });

  it("changes a persisted note password with a fresh encrypted save and updated baseline", async () => {
    const { toast } = await import("sonner");
    const changedNote = {
      ...storedNote,
      revision: 2,
      salt: "fresh-salt",
      iv: "fresh-iv",
      ciphertext: "fresh-ciphertext",
    };
    const secondChangedNote = {
      ...changedNote,
      revision: 3,
      salt: "second-salt",
      iv: "second-iv",
      ciphertext: "second-ciphertext",
    };
    const fetchMock = mockFetchSequence(
      okJson({ exists: true, note: storedNote }),
      okJson({ ok: true, note: changedNote }),
      okJson({ ok: true, note: secondChangedNote })
    );
    const existing = notebook([{ id: "one", content: "persisted" }], "one");
    vi.mocked(decryptNoteText).mockResolvedValue(serializeNotebook(existing));
    vi.mocked(encryptNoteText)
      .mockResolvedValueOnce({
        ...encryptedPayload,
        salt: "fresh-salt",
        iv: "fresh-iv",
        ciphertext: "fresh-ciphertext",
      })
      .mockResolvedValueOnce({
        ...encryptedPayload,
        salt: "second-salt",
        iv: "second-iv",
        ciphertext: "second-ciphertext",
      });
    renderNoteClient();

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByLabelText("Note password")
      )
    );

    await unlock("old-pw");
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = within(
      screen.getByRole("dialog", { name: "Change Password" })
    );
    expect(dialog.queryByLabelText("Current password")).toBeNull();
    expect(
      dialog.queryByText(/Re-encrypt this note in your browser/i)
    ).toBeNull();
    await submitPasswordChange("new-pw");

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Password changed")
    );
    expect(decryptNoteText).toHaveBeenCalledWith(storedNote, "old-pw");
    expect(encryptNoteText).toHaveBeenCalledWith(
      serializeNotebook(existing),
      "new-pw"
    );
    const saveBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(saveBody).toEqual({
      expectedRevision: 1,
      cryptoVersion: CRYPTO_VERSION,
      kdf: KDF,
      kdfIterations: KDF_ITERATIONS,
      salt: "fresh-salt",
      encryptionAlg: ENCRYPTION_ALG,
      iv: "fresh-iv",
      ciphertext: "fresh-ciphertext",
    });
    for (const forbidden of [
      "password",
      "currentPassword",
      "newPassword",
      "passwordHash",
      "passwordVerifier",
      "plaintext",
      "content",
      "tabs",
      "tabLabels",
      "tabCount",
      "activeTabId",
      "key",
      "derivedKey",
    ]) {
      expect(saveBody).not.toHaveProperty(forbidden);
    }

    await submitPasswordChange("newer-pw");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(
      JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))
    ).toMatchObject({
      expectedRevision: 2,
      salt: "second-salt",
      iv: "second-iv",
    });
  });

  it("changes a never-saved note password with the first encrypted save", async () => {
    const { toast } = await import("sonner");
    const fetchMock = mockFetchSequence(
      okJson({ exists: false }),
      okJson({ ok: true, note: storedNote })
    );
    renderNoteClient();
    await unlock("session-pw");
    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "draft" },
    });

    await submitPasswordChange("new-pw");

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Password changed")
    );
    expect(decryptNoteText).not.toHaveBeenCalled();
    expect(encryptNoteText).toHaveBeenCalledWith(
      expect.stringContaining("draft"),
      "new-pw"
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      expectedRevision: null,
      ...encryptedPayload,
    });
  });

  it("validates password-change fields without saving when invalid", async () => {
    const fetchMock = mockFetchSequence(
      okJson({ exists: true, note: storedNote })
    );
    vi.mocked(decryptNoteText).mockResolvedValueOnce(
      serializeNotebook(notebook([{ id: "one", content: "saved" }]))
    );
    renderNoteClient();
    await unlock("old-pw");

    await submitPasswordChange("");
    expect(screen.getByText("Enter a new password.")).toBeTruthy();
    await submitPasswordChange("new-pw", "different");
    expect(screen.getByText("New passwords do not match.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(encryptNoteText).not.toHaveBeenCalled();
  });

  it("preserves the previous session password after password-change failure", async () => {
    const { toast } = await import("sonner");
    const fetchMock = mockFetchSequence(
      okJson({ exists: false }),
      statusResponse(500),
      okJson({ ok: true, note: storedNote })
    );
    renderNoteClient();
    await unlock("old-pw");

    await submitPasswordChange("new-pw");

    expect(
      await screen.findByText(
        "Password change failed. Your note is still open with the previous password."
      )
    ).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalledWith("Password changed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.change(screen.getByLabelText("Note text"), {
      target: { value: "still old" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(encryptNoteText).toHaveBeenLastCalledWith(
      expect.stringContaining("still old"),
      "old-pw",
      undefined
    );
  });
});

describe("formatNoteTitle", () => {
  it("formats slugs into note titles", () => {
    expect(formatNoteTitle("daily-log")).toBe("Daily Log Notes");
    expect(formatNoteTitle("project_notes")).toBe("Project Notes");
    expect(formatNoteTitle("---")).toBe("Untitled Notes");
  });
});
