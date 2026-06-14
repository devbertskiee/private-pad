"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { MoonIcon, SunIcon, TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { ConfirmDestructiveDialog } from "@/components/confirm-destructive-dialog";
import { THEME_STORAGE_KEY } from "@/components/theme-root";
import { decryptNoteText, encryptNoteText } from "@/lib/crypto/note-crypto";
import type {
  EncryptedNotePayload,
  StoredEncryptedNote,
} from "@/lib/notes/contract";
import {
  createEmptyNotebook,
  createTabId,
  deriveTabLabel,
  MAX_NOTEBOOK_TABS,
  parseNotebookPlaintext,
  serializeNotebook,
  type Notebook,
} from "@/lib/notes/notebook";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type LoadState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; exists: false }
  | { status: "ready"; exists: true; note: StoredEncryptedNote };

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "failed" | "conflict";
type ThemePreference = "light" | "dark";

const CHANGE_PASSWORD_CONFLICT_MESSAGE =
  "Another save changed this note. Reload before retrying so this browser does not silently overwrite data.";

const saveStatusLabels: Record<SaveStatus, string> = {
  idle: "Ready",
  dirty: "Unsaved",
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed",
  conflict: "Conflict",
};

const saveStatusVariants: Record<
  SaveStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  idle: "secondary",
  dirty: "outline",
  saving: "default",
  saved: "default",
  failed: "destructive",
  conflict: "destructive",
};

function LockedShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <section className="w-full max-w-md">{children}</section>
    </main>
  );
}

export function formatNoteTitle(slug: string) {
  const words = slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  const title = words.length > 0 ? words.join(" ") : "Untitled";
  return /\bnotes?$/i.test(title) ? title : `${title} Notes`;
}

function getSystemTheme(): ThemePreference {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function NoteClient({ slug }: { slug: string }) {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [salt, setSalt] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteConflict, setDeleteConflict] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [newPasswordForChange, setNewPasswordForChange] = useState("");
  const [confirmPasswordForChange, setConfirmPasswordForChange] = useState("");
  const [changePasswordPending, setChangePasswordPending] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(
    null
  );
  const [theme, setTheme] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : getSystemTheme();
  });
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notes/${slug}`, { method: "GET" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load note metadata.");
        return response.json() as Promise<
          { exists: false } | { exists: true; note: StoredEncryptedNote }
        >;
      })
      .then((data) => {
        if (!cancelled)
          setLoadState(
            data.exists
              ? { status: "ready", exists: true, note: data.note }
              : { status: "ready", exists: false }
          );
      })
      .catch(() => {
        if (!cancelled)
          setLoadState({
            status: "failed",
            message: "Could not load note metadata.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const isUnlocked = notebook !== null;
  const title = useMemo(() => formatNoteTitle(slug), [slug]);
  const activeTab = useMemo(
    () => notebook?.tabs.find((tab) => tab.id === notebook.activeTabId) ?? null,
    [notebook]
  );
  const tabLimitReached = (notebook?.tabs.length ?? 0) >= MAX_NOTEBOOK_TABS;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  function pruneEmptyTabsBeforeSave(currentNotebook: Notebook): Notebook {
    if (currentNotebook.tabs.length <= 1) return currentNotebook;

    const remainingTabs = currentNotebook.tabs.filter(
      (tab) => tab.content.trim().length > 0
    );
    if (remainingTabs.length === currentNotebook.tabs.length)
      return currentNotebook;
    if (remainingTabs.length === 0)
      return createEmptyNotebook(currentNotebook.tabs[0]?.id);
    if (remainingTabs.some((tab) => tab.id === currentNotebook.activeTabId))
      return { ...currentNotebook, tabs: remainingTabs };

    const removedActiveIndex = currentNotebook.tabs.findIndex(
      (tab) => tab.id === currentNotebook.activeTabId
    );
    const activeTabId =
      remainingTabs.find(
        (tab) =>
          currentNotebook.tabs.findIndex(
            (candidate) => candidate.id === tab.id
          ) > removedActiveIndex
      )?.id ??
      remainingTabs.at(-1)?.id ??
      remainingTabs[0].id;

    return { ...currentNotebook, tabs: remainingTabs, activeTabId };
  }

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUnlockError(null);
    if (!password) {
      setUnlockError("Enter a password to unlock or create this note.");
      return;
    }
    if (loadState.status !== "ready") return;
    if (!loadState.exists) {
      setSalt(null);
      setRevision(null);
      setNotebook(createEmptyNotebook());
      setSaveStatus("dirty");
      return;
    }
    try {
      const decrypted = await decryptNoteText(loadState.note, password);
      setNotebook(parseNotebookPlaintext(decrypted));
      setSalt(loadState.note.salt);
      setRevision(loadState.note.revision);
      setSaveStatus("idle");
    } catch {
      setUnlockError(
        "This password could not open the note. Check the password and try again."
      );
    }
  }

  const save = useCallback(async () => {
    if (notebook === null || !password || saveStatus === "saving") return;
    const notebookToSave = pruneEmptyTabsBeforeSave(notebook);
    if (notebookToSave !== notebook) setNotebook(notebookToSave);
    setSaveStatus("saving");
    try {
      const encrypted: EncryptedNotePayload = await encryptNoteText(
        serializeNotebook(notebookToSave),
        password,
        salt ?? undefined
      );
      const response = await fetch(`/api/notes/${slug}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision, ...encrypted }),
      });
      if (response.status === 409) {
        setSaveStatus("conflict");
        return;
      }
      if (!response.ok) throw new Error("Save failed.");
      const data = (await response.json()) as { note: StoredEncryptedNote };
      setSalt(data.note.salt);
      setRevision(data.note.revision);
      setSaveStatus("saved");
      setLoadState({ status: "ready", exists: true, note: data.note });
      toast.success("Note saved");
    } catch {
      setSaveStatus("failed");
    }
  }, [notebook, password, revision, salt, saveStatus, slug]);

  function clearChangePasswordDialog() {
    setNewPasswordForChange("");
    setConfirmPasswordForChange("");
    setChangePasswordError(null);
  }

  function closeChangePasswordDialog() {
    if (changePasswordPending) return;
    setIsChangePasswordOpen(false);
    clearChangePasswordDialog();
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notebook || changePasswordPending) return;

    setChangePasswordError(null);

    if (!newPasswordForChange) {
      setChangePasswordError("Enter a new password.");
      return;
    }
    if (newPasswordForChange !== confirmPasswordForChange) {
      setChangePasswordError("New passwords do not match.");
      return;
    }

    setChangePasswordPending(true);
    try {
      const notebookToSave = pruneEmptyTabsBeforeSave(notebook);
      const encrypted: EncryptedNotePayload = await encryptNoteText(
        serializeNotebook(notebookToSave),
        newPasswordForChange
      );
      const response = await fetch(`/api/notes/${slug}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: revision, ...encrypted }),
      });

      if (response.status === 409) {
        setSaveStatus("conflict");
        setChangePasswordError(CHANGE_PASSWORD_CONFLICT_MESSAGE);
        return;
      }
      if (!response.ok) throw new Error("Password change failed.");

      const data = (await response.json()) as { note: StoredEncryptedNote };
      if (notebookToSave !== notebook) setNotebook(notebookToSave);
      setPassword(newPasswordForChange);
      setSalt(data.note.salt);
      setRevision(data.note.revision);
      setLoadState({ status: "ready", exists: true, note: data.note });
      setSaveStatus("saved");
      setIsChangePasswordOpen(false);
      clearChangePasswordDialog();
      toast.success("Password changed");
    } catch {
      setChangePasswordError(
        "Password change failed. Your note is still open with the previous password."
      );
    } finally {
      setChangePasswordPending(false);
    }
  }

  useEffect(() => {
    if (!isUnlocked) return;

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isUnlocked, save]);

  function lock() {
    setNotebook(null);
    setPassword("");
    setUnlockError(null);
    setSalt(null);
    setRevision(null);
    setSaveStatus("idle");
    setDeleteConflict(false);
    setIsChangePasswordOpen(false);
    clearChangePasswordDialog();
  }

  function toggleTheme() {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }

  async function deleteNote() {
    if (deletePending) return;
    setDeletePending(true);
    setDeleteConflict(false);
    try {
      const body = revision === null ? {} : { expectedRevision: revision };
      const response = await fetch(`/api/notes/${slug}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 409) {
        setDeleteConflict(true);
        setDeleteDialogOpen(false);
        return;
      }
      if (!response.ok) throw new Error("Delete failed.");

      setNotebook(null);
      setPassword("");
      setUnlockError(null);
      setSalt(null);
      setRevision(null);
      setSaveStatus("idle");
      setLoadState({ status: "ready", exists: false });
      setDeleteDialogOpen(false);
      toast.success("Note deleted");
    } catch {
      setDeleteConflict(true);
    } finally {
      setDeletePending(false);
    }
  }

  function markNotebookDirty(nextNotebook: Notebook) {
    setNotebook(nextNotebook);
    setSaveStatus("dirty");
  }

  function addTab() {
    if (!notebook || notebook.tabs.length >= MAX_NOTEBOOK_TABS) return;
    const id = createTabId();
    markNotebookDirty({
      ...notebook,
      tabs: [...notebook.tabs, { id, content: "" }],
      activeTabId: id,
    });
    window.setTimeout(() => noteTextareaRef.current?.focus(), 0);
  }

  function switchTab(tabId: string) {
    if (!notebook || tabId === notebook.activeTabId) return;
    markNotebookDirty({ ...notebook, activeTabId: tabId });
  }

  function updateActiveTabContent(content: string) {
    if (!notebook || !activeTab) return;
    markNotebookDirty({
      ...notebook,
      tabs: notebook.tabs.map((tab) =>
        tab.id === activeTab.id ? { ...tab, content } : tab
      ),
    });
  }

  function closeTab(tabId: string) {
    if (!notebook) return;
    const closingIndex = notebook.tabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex === -1) return;
    const closingTab = notebook.tabs[closingIndex];
    if (!closingTab) return;

    if (
      closingTab.content.length > 0 &&
      !window.confirm(
        "Close this tab? Unsaved text in this tab will be removed."
      )
    ) {
      return;
    }

    const remainingTabs = notebook.tabs.filter((tab) => tab.id !== tabId);
    if (remainingTabs.length === 0) {
      markNotebookDirty(createEmptyNotebook());
      return;
    }

    let activeTabId = notebook.activeTabId;
    if (tabId === notebook.activeTabId) {
      activeTabId =
        remainingTabs[Math.min(closingIndex, remainingTabs.length - 1)]?.id ??
        remainingTabs[remainingTabs.length - 1]?.id ??
        activeTabId;
    }

    markNotebookDirty({ ...notebook, tabs: remainingTabs, activeTabId });
  }

  if (loadState.status === "loading") {
    return (
      <LockedShell>
        <Card className="text-center" aria-busy="true">
          <CardHeader>
            <CardTitle className="normal-case tracking-tight">
              {title}
            </CardTitle>
            <CardDescription>Loading encrypted metadata.</CardDescription>
          </CardHeader>
        </Card>
      </LockedShell>
    );
  }

  if (loadState.status === "failed") {
    return (
      <LockedShell>
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="normal-case tracking-tight">
              Could not load note
            </CardTitle>
            <CardDescription>
              Try again, or choose another slug.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>{loadState.message}</AlertDescription>
            </Alert>
            <Button type="button" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </LockedShell>
    );
  }

  if (!isUnlocked) {
    return (
      <LockedShell>
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle className="text-2xl normal-case tracking-tight">
              {title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={unlock} className="space-y-4">
              <Input
                id="password"
                aria-label="Note password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="note password"
                className="min-h-12 text-center"
                autoComplete="current-password"
                autoFocus
              />
              {unlockError ? (
                <Alert variant="destructive">
                  <AlertTitle>Unable to open note</AlertTitle>
                  <AlertDescription>{unlockError}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="min-h-12 w-full">
                {loadState.exists ? "Unlock" : "Create locally"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </LockedShell>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <ConfirmDestructiveDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete note?"
        description="This removes the encrypted note stored at the current URL. It cannot be undone."
        confirmLabel="Delete"
        pending={deletePending}
        onConfirm={() => void deleteNote()}
      />
      <Dialog
        open={isChangePasswordOpen}
        onOpenChange={(open) => {
          if (open) {
            setChangePasswordError(null);
            setIsChangePasswordOpen(true);
            return;
          }
          closeChangePasswordDialog();
        }}
      >
        <DialogContent>
          <form onSubmit={changePassword} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="text-xl">Change Password</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <label
                className="grid gap-2 text-sm font-medium text-muted-foreground"
                htmlFor="new-password-for-change"
              >
                <span>New password</span>
                <Input
                  id="new-password-for-change"
                  type="password"
                  value={newPasswordForChange}
                  onChange={(event) =>
                    setNewPasswordForChange(event.target.value)
                  }
                  placeholder="new password"
                  autoComplete="new-password"
                  disabled={changePasswordPending}
                  autoFocus
                />
              </label>
              <label
                className="grid gap-2 text-sm font-medium text-muted-foreground"
                htmlFor="confirm-password-for-change"
              >
                <span>Confirm new password</span>
                <Input
                  id="confirm-password-for-change"
                  type="password"
                  value={confirmPasswordForChange}
                  onChange={(event) =>
                    setConfirmPasswordForChange(event.target.value)
                  }
                  placeholder="confirm new password"
                  autoComplete="new-password"
                  disabled={changePasswordPending}
                />
              </label>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              No recovery: forgotten passwords cannot decrypt saved content.
            </p>
            {changePasswordError ? (
              <Alert variant="destructive">
                <AlertTitle>
                  {changePasswordError === CHANGE_PASSWORD_CONFLICT_MESSAGE
                    ? "Conflict"
                    : "Password change failed"}
                </AlertTitle>
                <AlertDescription>{changePasswordError}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter className="flex-row justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={closeChangePasswordDialog}
                disabled={changePasswordPending}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={changePasswordPending}>
                {changePasswordPending ? "Re-encrypting…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col gap-6">
        <header className="flex items-center justify-between gap-3 border-b border-border pb-6">
          <div className="min-w-0">
            <h1 className="truncate font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={save}
              disabled={saveStatus === "saving"}
              type="button"
              size="sm"
              className="bg-primary text-primary-foreground"
            >
              {saveStatus === "saving" ? "Saving…" : "Save"}
            </Button>
            <Button
              onClick={lock}
              type="button"
              size="sm"
              className="bg-primary text-primary-foreground"
            >
              Lock
            </Button>
            <Button
              onClick={() => setIsChangePasswordOpen(true)}
              type="button"
              variant="outline"
              size="sm"
            >
              Change password
            </Button>
            <Button
              onClick={toggleTheme}
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </Button>
            <Button
              onClick={() => setDeleteDialogOpen(true)}
              type="button"
              variant="destructive"
              size="icon-sm"
              aria-label="Delete note"
            >
              <TrashIcon />
            </Button>
          </div>
        </header>

        <div className="relative flex flex-1 flex-col gap-4">
          {saveStatus === "saving" ? (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm"
              role="status"
              aria-live="polite"
            >
              <div className="border border-border bg-card px-5 py-4 text-sm font-medium shadow-lg">
                Saving encrypted note…
              </div>
            </div>
          ) : null}
          <Card className="gap-4" size="sm">
            <CardContent className="space-y-4">
              {saveStatus === "conflict" ? (
                <div className="space-y-3">
                  <Alert variant="destructive">
                    <AlertTitle>Conflict</AlertTitle>
                    <AlertDescription>
                      {CHANGE_PASSWORD_CONFLICT_MESSAGE}
                    </AlertDescription>
                  </Alert>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Reload note
                  </Button>
                </div>
              ) : null}
              {deleteConflict ? (
                <div className="space-y-3">
                  <Alert variant="destructive">
                    <AlertTitle>Delete conflict</AlertTitle>
                    <AlertDescription>
                      Another save changed this note. Reload before retrying
                      deletion so this browser does not remove newer encrypted
                      data.
                    </AlertDescription>
                  </Alert>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.location.reload()}
                  >
                    Reload note
                  </Button>
                </div>
              ) : null}
              {saveStatus === "failed" ? (
                <Alert variant="destructive">
                  <AlertTitle>Save failed</AlertTitle>
                  <AlertDescription>
                    Save failed. Your plaintext remains only in this browser
                    state; retry when the connection is available.
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-2">
                <div
                  className="themed-tab-scrollbar flex items-center gap-2 overflow-x-auto rounded-lg border border-border/70 bg-card/70 p-2 dark:border-white/[0.06] dark:bg-[oklch(0.155_0.005_285.823)]"
                  role="tablist"
                  aria-label="Note tabs"
                >
                  {notebook.tabs.map((tab, index) => {
                    const label = deriveTabLabel(tab.content);
                    const selected = tab.id === notebook.activeTabId;
                    return (
                      <div
                        key={tab.id}
                        className={`flex shrink-0 items-center rounded-md border text-sm ${
                          selected
                            ? "border-ring/70 bg-background text-foreground shadow-sm dark:border-white/[0.12] dark:bg-white/[0.04]"
                            : "border-transparent bg-transparent text-muted-foreground"
                        }`}
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          aria-controls="note-text"
                          className="max-w-48 truncate px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => switchTab(tab.id)}
                        >
                          <span className="sr-only">Tab {index + 1}: </span>
                          {label}
                        </button>
                        <button
                          type="button"
                          aria-label={`Close tab ${index + 1}`}
                          className="px-2 py-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(event) => {
                            event.stopPropagation();
                            closeTab(tab.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addTab}
                    disabled={tabLimitReached}
                    aria-label="Add tab"
                  >
                    +
                  </Button>
                </div>
                {tabLimitReached ? (
                  <p className="text-sm text-muted-foreground">
                    Tab limit reached
                  </p>
                ) : null}
              </div>
              <Textarea
                ref={noteTextareaRef}
                id="note-text"
                aria-label="Note text"
                role="tabpanel"
                value={activeTab?.content ?? ""}
                onChange={(event) => updateActiveTabContent(event.target.value)}
                placeholder="write your note here"
                className="min-h-[60vh] resize-y border-border/70 bg-card/70 px-4 py-4 font-mono text-base leading-7 focus-visible:border-ring dark:border-white/[0.08] dark:bg-[oklch(0.155_0.005_285.823)] md:text-base"
                spellCheck={false}
              />
              <div
                className="flex items-center gap-2"
                role="status"
                aria-live="polite"
              >
                <Badge variant={saveStatusVariants[saveStatus]}>
                  {saveStatusLabels[saveStatus]}
                </Badge>
                {revision ? (
                  <span className="text-xs text-muted-foreground">
                    Rev {revision}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
