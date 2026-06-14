export const CRYPTO_VERSION = 1 as const;
export const KDF = "PBKDF2-SHA256" as const;
export const KDF_ITERATIONS = 310_000 as const;
export const ENCRYPTION_ALG = "AES-GCM" as const;
export const MAX_ENCRYPTED_NOTE_BYTES = 1024 * 1024;

const ENCRYPTED_PAYLOAD_KEYS = [
  "cryptoVersion",
  "kdf",
  "kdfIterations",
  "salt",
  "encryptionAlg",
  "iv",
  "ciphertext",
] as const;

const SAVE_REQUEST_KEYS = [
  "expectedRevision",
  ...ENCRYPTED_PAYLOAD_KEYS,
] as const;
const DELETE_REQUEST_KEYS = ["expectedRevision"] as const;
const PLAINTEXT_LIKE_KEYS = new Set([
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
]);
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type EncryptedNotePayload = {
  cryptoVersion: typeof CRYPTO_VERSION;
  kdf: typeof KDF;
  kdfIterations: number;
  salt: string;
  encryptionAlg: typeof ENCRYPTION_ALG;
  iv: string;
  ciphertext: string;
};

export type SaveNoteRequest = EncryptedNotePayload & {
  expectedRevision: number | null;
};

export type DeleteNoteRequest = {
  expectedRevision?: number | null;
};

export type StoredEncryptedNote = EncryptedNotePayload & {
  slug: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
): string | null {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (PLAINTEXT_LIKE_KEYS.has(key)) return `Field '${key}' is not allowed.`;
    if (!allowedSet.has(key)) return `Unknown field '${key}'.`;
  }
  return null;
}

function isBase64url(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    BASE64URL_PATTERN.test(value)
  );
}

function encodedByteLength(value: string): number {
  const padding = (4 - (value.length % 4)) % 4;
  return (
    Math.floor(((value.length + padding) * 3) / 4) -
    (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0)
  );
}

export function validateEncryptedPayload(
  value: unknown
): ValidationResult<EncryptedNotePayload> {
  if (!isRecord(value))
    return { ok: false, error: "Payload must be an object." };

  const keyError = rejectUnknownKeys(value, ENCRYPTED_PAYLOAD_KEYS);
  if (keyError) return { ok: false, error: keyError };

  if (value.cryptoVersion !== CRYPTO_VERSION)
    return { ok: false, error: "Unsupported crypto version." };
  if (value.kdf !== KDF) return { ok: false, error: "Unsupported KDF." };
  if (
    typeof value.kdfIterations !== "number" ||
    !Number.isInteger(value.kdfIterations) ||
    value.kdfIterations < 1
  ) {
    return { ok: false, error: "Invalid KDF iterations." };
  }
  if (value.encryptionAlg !== ENCRYPTION_ALG)
    return { ok: false, error: "Unsupported encryption algorithm." };
  if (!isBase64url(value.salt))
    return { ok: false, error: "Invalid salt encoding." };
  if (!isBase64url(value.iv))
    return { ok: false, error: "Invalid IV encoding." };
  if (!isBase64url(value.ciphertext))
    return { ok: false, error: "Invalid ciphertext encoding." };
  if (encodedByteLength(value.ciphertext) > MAX_ENCRYPTED_NOTE_BYTES) {
    return { ok: false, error: "Encrypted note is too large." };
  }

  return { ok: true, value: value as EncryptedNotePayload };
}

export function validateSaveNoteRequest(
  value: unknown
): ValidationResult<SaveNoteRequest> {
  if (!isRecord(value))
    return { ok: false, error: "Request body must be an object." };

  const keyError = rejectUnknownKeys(value, SAVE_REQUEST_KEYS);
  if (keyError) return { ok: false, error: keyError };

  if (!("expectedRevision" in value))
    return { ok: false, error: "Missing expected revision." };
  if (
    value.expectedRevision !== null &&
    (!Number.isInteger(value.expectedRevision) ||
      (value.expectedRevision as number) < 1)
  ) {
    return { ok: false, error: "Invalid expected revision." };
  }

  const payloadCandidate = { ...value };
  delete payloadCandidate.expectedRevision;
  const payload = validateEncryptedPayload(payloadCandidate);
  if (!payload.ok) return payload;

  return {
    ok: true,
    value: {
      ...payload.value,
      expectedRevision: value.expectedRevision as number | null,
    },
  };
}

export function validateDeleteNoteRequest(
  value: unknown
): ValidationResult<DeleteNoteRequest> {
  if (!isRecord(value))
    return { ok: false, error: "Request body must be an object." };

  const keyError = rejectUnknownKeys(value, DELETE_REQUEST_KEYS);
  if (keyError) return { ok: false, error: keyError };

  if (
    "expectedRevision" in value &&
    value.expectedRevision !== null &&
    (!Number.isInteger(value.expectedRevision) ||
      (value.expectedRevision as number) < 1)
  ) {
    return { ok: false, error: "Invalid expected revision." };
  }

  return {
    ok: true,
    value: {
      expectedRevision: value.expectedRevision as number | null | undefined,
    },
  };
}
