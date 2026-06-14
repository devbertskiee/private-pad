import { describe, expect, it } from "vitest";
import {
  CRYPTO_VERSION,
  ENCRYPTION_ALG,
  KDF,
  KDF_ITERATIONS,
} from "@/lib/notes/contract";
import { decryptNoteText, encryptNoteText } from "./note-crypto";

describe("note crypto", () => {
  it("round trips note plaintext with versioned metadata", async () => {
    const encrypted = await encryptNoteText(
      "hello secret",
      "correct horse battery staple"
    );

    expect(encrypted.cryptoVersion).toBe(CRYPTO_VERSION);
    expect(encrypted.kdf).toBe(KDF);
    expect(encrypted.kdfIterations).toBe(KDF_ITERATIONS);
    expect(encrypted.encryptionAlg).toBe(ENCRYPTION_ALG);
    await expect(
      decryptNoteText(encrypted, "correct horse battery staple")
    ).resolves.toBe("hello secret");
  });

  it("uses a fresh IV per save while preserving a provided salt", async () => {
    const first = await encryptNoteText("same", "pw");
    const second = await encryptNoteText("same", "pw", first.salt);

    expect(second.salt).toBe(first.salt);
    expect(second.iv).not.toBe(first.iv);
    expect(second.ciphertext).not.toBe(first.ciphertext);
  });

  it("fails with the wrong password", async () => {
    const encrypted = await encryptNoteText("hidden", "right");
    await expect(decryptNoteText(encrypted, "wrong")).rejects.toThrow();
  });
});
