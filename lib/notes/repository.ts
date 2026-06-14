import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notes, type NoteRow } from "@/db/schema";
import type { EncryptedNotePayload, StoredEncryptedNote } from "./contract";

export type SaveResult =
  | { ok: true; note: StoredEncryptedNote }
  | { ok: false; conflict: true; currentRevision: number | null };

export type DeleteResult =
  | { ok: true; deleted: boolean }
  | { ok: false; conflict: true; currentRevision: number | null };

export type NoteRepository = {
  load(slug: string): Promise<StoredEncryptedNote | null>;
  save(
    slug: string,
    expectedRevision: number | null,
    payload: EncryptedNotePayload
  ): Promise<SaveResult>;
  delete(slug: string, expectedRevision?: number | null): Promise<DeleteResult>;
};

function rowToStored(row: NoteRow): StoredEncryptedNote {
  return {
    slug: row.slug,
    ciphertext: row.ciphertext,
    salt: row.salt,
    iv: row.iv,
    kdf: row.kdf as StoredEncryptedNote["kdf"],
    kdfIterations: row.kdfIterations,
    encryptionAlg: row.encryptionAlg as StoredEncryptedNote["encryptionAlg"],
    cryptoVersion: row.cryptoVersion as StoredEncryptedNote["cryptoVersion"],
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createDrizzleNoteRepository(): NoteRepository | null {
  const db = getDb();
  if (!db) return null;

  return {
    async load(slug) {
      const rows = await db
        .select()
        .from(notes)
        .where(eq(notes.slug, slug))
        .limit(1);
      return rows[0] ? rowToStored(rows[0]) : null;
    },
    async save(slug, expectedRevision, payload) {
      const existing = await this.load(slug);

      if (!existing) {
        if (expectedRevision !== null)
          return { ok: false, conflict: true, currentRevision: null };
        try {
          const inserted = await db
            .insert(notes)
            .values({ slug, ...payload })
            .returning();
          return { ok: true, note: rowToStored(inserted[0]) };
        } catch {
          const current = await this.load(slug);
          return {
            ok: false,
            conflict: true,
            currentRevision: current?.revision ?? null,
          };
        }
      }

      if (expectedRevision !== existing.revision) {
        return {
          ok: false,
          conflict: true,
          currentRevision: existing.revision,
        };
      }

      const updated = await db
        .update(notes)
        .set({
          ...payload,
          revision: existing.revision + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(notes.slug, slug), eq(notes.revision, expectedRevision)))
        .returning();

      if (!updated[0]) {
        const current = await this.load(slug);
        return {
          ok: false,
          conflict: true,
          currentRevision: current?.revision ?? null,
        };
      }

      return { ok: true, note: rowToStored(updated[0]) };
    },
    async delete(slug, expectedRevision) {
      const existing = await this.load(slug);
      if (!existing) return { ok: true, deleted: false };

      if (expectedRevision == null)
        return {
          ok: false,
          conflict: true,
          currentRevision: existing.revision,
        };
      if (expectedRevision !== existing.revision)
        return {
          ok: false,
          conflict: true,
          currentRevision: existing.revision,
        };

      const deleted = await db
        .delete(notes)
        .where(and(eq(notes.slug, slug), eq(notes.revision, expectedRevision)))
        .returning({ slug: notes.slug });
      if (!deleted[0]) {
        const current = await this.load(slug);
        return {
          ok: false,
          conflict: true,
          currentRevision: current?.revision ?? null,
        };
      }

      return { ok: true, deleted: true };
    },
  };
}

export function createMemoryNoteRepository(
  seed: StoredEncryptedNote[] = []
): NoteRepository {
  const rows = new Map(seed.map((note) => [note.slug, note]));

  return {
    async load(slug) {
      return rows.get(slug) ?? null;
    },
    async save(slug, expectedRevision, payload) {
      const existing = rows.get(slug);
      const now = new Date().toISOString();

      if (!existing) {
        if (expectedRevision !== null)
          return { ok: false, conflict: true, currentRevision: null };
        const note: StoredEncryptedNote = {
          slug,
          ...payload,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };
        rows.set(slug, note);
        return { ok: true, note };
      }

      if (expectedRevision !== existing.revision)
        return {
          ok: false,
          conflict: true,
          currentRevision: existing.revision,
        };

      const note: StoredEncryptedNote = {
        slug,
        ...payload,
        revision: existing.revision + 1,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      rows.set(slug, note);
      return { ok: true, note };
    },
    async delete(slug, expectedRevision) {
      const existing = rows.get(slug);
      if (!existing) return { ok: true, deleted: false };

      if (expectedRevision == null)
        return {
          ok: false,
          conflict: true,
          currentRevision: existing.revision,
        };
      if (expectedRevision !== existing.revision)
        return {
          ok: false,
          conflict: true,
          currentRevision: existing.revision,
        };

      rows.delete(slug);
      return { ok: true, deleted: true };
    },
  };
}

let repositoryOverride: NoteRepository | null = null;
let memoryRepository: NoteRepository | null = null;

export function setNoteRepositoryForTests(repository: NoteRepository | null) {
  repositoryOverride = repository;
}

export function getNoteRepository(): NoteRepository {
  if (repositoryOverride) return repositoryOverride;
  return (
    createDrizzleNoteRepository() ??
    (memoryRepository ??= createMemoryNoteRepository())
  );
}
