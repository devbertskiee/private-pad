import { describe, expect, it } from "vitest";
import {
  CRYPTO_VERSION,
  ENCRYPTION_ALG,
  KDF,
  KDF_ITERATIONS,
  validateEncryptedPayload,
  validateSaveNoteRequest,
} from "./contract";

const payload = {
  cryptoVersion: CRYPTO_VERSION,
  kdf: KDF,
  kdfIterations: KDF_ITERATIONS,
  salt: "abc123_-",
  encryptionAlg: ENCRYPTION_ALG,
  iv: "def456_-",
  ciphertext: "ghi789_-",
};

describe("encrypted note contract", () => {
  it("accepts the encrypted payload shape", () => {
    expect(validateEncryptedPayload(payload).ok).toBe(true);
    expect(
      validateSaveNoteRequest({ expectedRevision: null, ...payload }).ok
    ).toBe(true);
  });

  it("rejects unknown fields and plaintext-like fields", () => {
    expect(
      validateSaveNoteRequest({
        expectedRevision: null,
        ...payload,
        extra: "x",
      }).ok
    ).toBe(false);
    for (const key of [
      "currentPassword",
      "newPassword",
      "password",
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
      expect(
        validateSaveNoteRequest({
          expectedRevision: null,
          ...payload,
          [key]: "secret",
        }).ok
      ).toBe(false);
    }
  });

  it("rejects invalid metadata", () => {
    expect(validateEncryptedPayload({ ...payload, cryptoVersion: 2 }).ok).toBe(
      false
    );
    expect(
      validateEncryptedPayload({ ...payload, salt: "not base64!" }).ok
    ).toBe(false);
  });
});
