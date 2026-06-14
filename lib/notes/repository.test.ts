import { describe, expect, it } from "vitest";
import {
  CRYPTO_VERSION,
  ENCRYPTION_ALG,
  type EncryptedNotePayload,
  KDF,
  KDF_ITERATIONS,
} from "./contract";
import { createMemoryNoteRepository } from "./repository";

const payload: EncryptedNotePayload = {
  cryptoVersion: CRYPTO_VERSION,
  kdf: KDF,
  kdfIterations: KDF_ITERATIONS,
  salt: "salt",
  encryptionAlg: ENCRYPTION_ALG,
  iv: "iv",
  ciphertext: "ciphertext",
};

describe("note repository", () => {
  it("loads missing and existing notes", async () => {
    const repo = createMemoryNoteRepository();
    await expect(repo.load("missing")).resolves.toBeNull();
    const saved = await repo.save("note", null, payload);
    expect(saved.ok).toBe(true);
    await expect(repo.load("note")).resolves.toMatchObject({
      slug: "note",
      revision: 1,
      ciphertext: "ciphertext",
    });
  });

  it("detects create race and update conflicts", async () => {
    const repo = createMemoryNoteRepository();
    await repo.save("note", null, payload);
    await expect(repo.save("note", null, payload)).resolves.toMatchObject({
      ok: false,
      conflict: true,
      currentRevision: 1,
    });
    await expect(repo.save("note", 2, payload)).resolves.toMatchObject({
      ok: false,
      conflict: true,
      currentRevision: 1,
    });
  });

  it("updates when revision matches", async () => {
    const repo = createMemoryNoteRepository();
    await repo.save("note", null, payload);
    await expect(
      repo.save("note", 1, { ...payload, ciphertext: "next" })
    ).resolves.toMatchObject({
      ok: true,
      note: { revision: 2, ciphertext: "next" },
    });
  });

  it("deletes existing notes with matching expected revision", async () => {
    const repo = createMemoryNoteRepository();
    await repo.save("note", null, payload);

    await expect(repo.delete("note", 1)).resolves.toEqual({
      ok: true,
      deleted: true,
    });
    await expect(repo.load("note")).resolves.toBeNull();
  });

  it("detects delete conflicts and missing expected revision", async () => {
    const repo = createMemoryNoteRepository();
    await repo.save("note", null, payload);

    await expect(repo.delete("note", 2)).resolves.toEqual({
      ok: false,
      conflict: true,
      currentRevision: 1,
    });
    await expect(repo.load("note")).resolves.toMatchObject({
      slug: "note",
      revision: 1,
    });

    await expect(repo.delete("note")).resolves.toEqual({
      ok: false,
      conflict: true,
      currentRevision: 1,
    });
    await expect(repo.load("note")).resolves.toMatchObject({
      slug: "note",
      revision: 1,
    });
  });

  it("treats missing-note delete as no-op with and without expected revision", async () => {
    const repo = createMemoryNoteRepository();

    await expect(repo.delete("missing")).resolves.toEqual({
      ok: true,
      deleted: false,
    });
    await expect(repo.delete("missing", 1)).resolves.toEqual({
      ok: true,
      deleted: false,
    });
  });
});
