import {
  CRYPTO_VERSION,
  ENCRYPTION_ALG,
  type EncryptedNotePayload,
  KDF,
  KDF_ITERATIONS,
} from "@/lib/notes/contract";
import { base64urlToBytes, bytesToBase64url } from "./base64url";

const SALT_BYTES = 16;
const AES_GCM_IV_BYTES = 12;

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable.");
  return globalThis.crypto;
}

export function generateSalt(): string {
  const salt = new Uint8Array(SALT_BYTES);
  getWebCrypto().getRandomValues(salt);
  return bytesToBase64url(salt);
}

export function generateIv(): string {
  const iv = new Uint8Array(AES_GCM_IV_BYTES);
  getWebCrypto().getRandomValues(iv);
  return bytesToBase64url(iv);
}

export async function deriveNoteKey(
  password: string,
  salt: string,
  iterations: number = KDF_ITERATIONS
): Promise<CryptoKey> {
  const crypto = getWebCrypto();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asBufferSource(base64urlToBytes(salt)),
      iterations,
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptNoteText(
  plaintext: string,
  password: string,
  salt = generateSalt()
): Promise<EncryptedNotePayload> {
  const iv = generateIv();
  const key = await deriveNoteKey(password, salt);
  const ciphertext = await getWebCrypto().subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(base64urlToBytes(iv)) },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    cryptoVersion: CRYPTO_VERSION,
    kdf: KDF,
    kdfIterations: KDF_ITERATIONS,
    salt,
    encryptionAlg: ENCRYPTION_ALG,
    iv,
    ciphertext: bytesToBase64url(new Uint8Array(ciphertext)),
  };
}

export async function decryptNoteText(
  payload: EncryptedNotePayload,
  password: string
): Promise<string> {
  if (
    payload.cryptoVersion !== CRYPTO_VERSION ||
    payload.kdf !== KDF ||
    payload.encryptionAlg !== ENCRYPTION_ALG
  ) {
    throw new Error("Unsupported encrypted note metadata.");
  }

  const key = await deriveNoteKey(
    password,
    payload.salt,
    payload.kdfIterations
  );
  const plaintext = await getWebCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(base64urlToBytes(payload.iv)) },
    key,
    asBufferSource(base64urlToBytes(payload.ciphertext))
  );
  return new TextDecoder().decode(plaintext);
}
