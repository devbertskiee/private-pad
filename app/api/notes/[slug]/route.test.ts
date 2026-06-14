import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  CRYPTO_VERSION,
  ENCRYPTION_ALG,
  KDF,
  KDF_ITERATIONS,
  type SaveNoteRequest,
} from "@/lib/notes/contract";
import {
  createMemoryNoteRepository,
  setNoteRepositoryForTests,
} from "@/lib/notes/repository";
import {
  resetRateLimitForTests,
  setRateLimitConfigForTests,
} from "@/lib/rate-limit/in-process";
import { DELETE, GET, PUT, runtime } from "./route";

const payload = {
  cryptoVersion: CRYPTO_VERSION,
  kdf: KDF,
  kdfIterations: KDF_ITERATIONS,
  salt: "salt",
  encryptionAlg: ENCRYPTION_ALG,
  iv: "iv",
  ciphertext: "ciphertext",
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/notes/daily-log", {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

function deleteRequest(body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/notes/daily-log", {
    method: "DELETE",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

const ctx = (slug = "daily-log") => ({ params: Promise.resolve({ slug }) });

describe("note API routes", () => {
  afterEach(() => {
    setNoteRepositoryForTests(null);
    resetRateLimitForTests();
  });

  it("declares the Node.js runtime", () => {
    expect(runtime).toBe("nodejs");
  });

  it("loads missing notes", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    const response = await GET(
      new NextRequest("http://localhost/api/notes/daily-log"),
      ctx()
    );
    await expect(response.json()).resolves.toEqual({ exists: false });
  });

  it("creates and loads encrypted-only notes", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    const createResponse = await PUT(
      request({ expectedRevision: null, ...payload } satisfies SaveNoteRequest),
      ctx()
    );
    expect(createResponse.status).toBe(200);

    const loadResponse = await GET(
      new NextRequest("http://localhost/api/notes/daily-log"),
      ctx()
    );
    const body = await loadResponse.json();
    expect(body).toMatchObject({
      exists: true,
      note: { slug: "daily-log", revision: 1, ciphertext: "ciphertext" },
    });
    expect(JSON.stringify(body)).not.toContain("password");
    expect(JSON.stringify(body)).not.toContain("plaintext");
  });

  it("updates and conflicts by revision", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    await PUT(request({ expectedRevision: null, ...payload }), ctx());
    const conflict = await PUT(
      request({ expectedRevision: null, ...payload }),
      ctx()
    );
    expect(conflict.status).toBe(409);
    const update = await PUT(
      request({ expectedRevision: 1, ...payload, ciphertext: "next" }),
      ctx()
    );
    await expect(update.json()).resolves.toMatchObject({
      ok: true,
      note: { revision: 2, ciphertext: "next" },
    });
  });

  it("deletes notes with matching expected revision", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    await PUT(request({ expectedRevision: null, ...payload }), ctx());

    const deleted = await DELETE(deleteRequest({ expectedRevision: 1 }), ctx());
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toEqual({
      ok: true,
      exists: false,
      deleted: true,
    });
    await expect(
      (
        await GET(
          new NextRequest("http://localhost/api/notes/daily-log"),
          ctx()
        )
      ).json()
    ).resolves.toEqual({ exists: false });
  });

  it("returns delete conflicts when expected revision is stale or omitted for existing notes", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    await PUT(request({ expectedRevision: null, ...payload }), ctx());

    const conflict = await DELETE(
      deleteRequest({ expectedRevision: 2 }),
      ctx()
    );
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toEqual({
      error: "Revision conflict.",
      conflict: true,
      currentRevision: 1,
    });

    const missingRevision = await DELETE(deleteRequest(), ctx());
    expect(missingRevision.status).toBe(409);
    await expect(missingRevision.json()).resolves.toEqual({
      error: "Revision conflict.",
      conflict: true,
      currentRevision: 1,
    });
  });

  it("treats missing-note delete as a no-op with and without expected revision", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());

    const withoutRevision = await DELETE(deleteRequest(), ctx());
    expect(withoutRevision.status).toBe(200);
    await expect(withoutRevision.json()).resolves.toEqual({
      ok: true,
      exists: false,
      deleted: false,
    });

    const withRevision = await DELETE(
      deleteRequest({ expectedRevision: 1 }),
      ctx()
    );
    expect(withRevision.status).toBe(200);
    await expect(withRevision.json()).resolves.toEqual({
      ok: true,
      exists: false,
      deleted: false,
    });
  });

  it("rejects invalid slug, oversized payload, and plaintext-like fields", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    expect(
      (await PUT(request({ expectedRevision: null, ...payload }), ctx("api")))
        .status
    ).toBe(400);
    for (const forbidden of [
      { password: "secret" },
      { currentPassword: "secret" },
      { newPassword: "secret" },
      { passwordHash: "hash" },
      { passwordVerifier: "verifier" },
      { plaintext: "hello" },
      { content: "hello" },
      { tabs: [] },
      { tabLabels: [] },
      { tabCount: 1 },
      { activeTabId: "tab-1" },
      { key: "key" },
      { derivedKey: "key" },
    ]) {
      expect(
        (
          await PUT(
            request({ expectedRevision: null, ...payload, ...forbidden }),
            ctx()
          )
        ).status
      ).toBe(400);
    }
    expect(
      (
        await PUT(
          request({ expectedRevision: null, ...payload, unknown: "field" }),
          ctx()
        )
      ).status
    ).toBe(400);
    expect(
      (
        await PUT(
          new NextRequest("http://localhost/api/notes/daily-log", {
            method: "PUT",
            body: "{",
          }),
          ctx()
        )
      ).status
    ).toBe(400);
    expect(
      (
        await PUT(
          request({
            expectedRevision: null,
            ...payload,
            ciphertext: "a".repeat(1024 * 1024 + 10),
          }),
          ctx()
        )
      ).status
    ).toBe(413);
  });

  it("rejects invalid delete slugs and plaintext-like delete fields", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());

    expect((await DELETE(deleteRequest(), ctx("api"))).status).toBe(400);
    expect(
      (
        await DELETE(
          deleteRequest({ expectedRevision: 1, password: "secret" }),
          ctx()
        )
      ).status
    ).toBe(400);
    expect(
      (
        await DELETE(
          deleteRequest({ expectedRevision: 1, plaintext: "hello" }),
          ctx()
        )
      ).status
    ).toBe(400);
    expect(
      (
        await DELETE(
          deleteRequest({ expectedRevision: 1, verifier: "abc" }),
          ctx()
        )
      ).status
    ).toBe(400);
    expect(
      (await DELETE(deleteRequest({ expectedRevision: 0 }), ctx())).status
    ).toBe(400);
  });

  it("does not require password, plaintext, or verifier to delete", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    await PUT(request({ expectedRevision: null, ...payload }), ctx());

    const response = await DELETE(
      deleteRequest({ expectedRevision: 1 }),
      ctx()
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      exists: false,
      deleted: true,
    });
  });

  it("rate limits GET requests by endpoint, method, and client identifier", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    setRateLimitConfigForTests({ windowMs: 60_000, maxRequests: 1 });

    const headers = { "x-forwarded-for": "203.0.113.10" };
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/notes/daily-log", { headers }),
          ctx()
        )
      ).status
    ).toBe(200);

    const limited = await GET(
      new NextRequest("http://localhost/api/notes/daily-log", { headers }),
      ctx()
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    await expect(limited.json()).resolves.toEqual({
      error: "Too many requests.",
    });
  });

  it("rate limits PUT separately and can reset the limiter for tests", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    setRateLimitConfigForTests({ windowMs: 60_000, maxRequests: 1 });

    const headers = { "x-real-ip": "203.0.113.11" };
    expect(
      (
        await PUT(
          request({ expectedRevision: null, ...payload }, headers),
          ctx()
        )
      ).status
    ).toBe(200);

    const limited = await PUT(
      new NextRequest("http://localhost/api/notes/daily-log", {
        method: "PUT",
        body: JSON.stringify({ expectedRevision: 1, ...payload }),
        headers: { "content-type": "application/json", ...headers },
      }),
      ctx()
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    const limitedBody = await limited.json();
    expect(limitedBody).toEqual({ error: "Too many requests." });
    expect(JSON.stringify(limitedBody)).not.toMatch(
      /203\.0\.113\.11|password|plaintext|ciphertext|salt|iv|key/i
    );

    resetRateLimitForTests();
    const afterReset = await PUT(
      new NextRequest("http://localhost/api/notes/daily-log", {
        method: "PUT",
        body: JSON.stringify({ expectedRevision: 1, ...payload }),
        headers: { "content-type": "application/json", ...headers },
      }),
      ctx()
    );
    expect(afterReset.status).toBe(200);
  });

  it("rate limits DELETE separately", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    setRateLimitConfigForTests({ windowMs: 60_000, maxRequests: 1 });

    const headers = { "x-real-ip": "203.0.113.15" };
    expect(
      (await DELETE(deleteRequest(undefined, headers), ctx())).status
    ).toBe(200);

    const limited = await DELETE(deleteRequest(undefined, headers), ctx());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    await expect(limited.json()).resolves.toEqual({
      error: "Too many requests.",
    });
  });

  it("does not parse a PUT request body before rate-limit rejection", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    setRateLimitConfigForTests({ windowMs: 60_000, maxRequests: 1 });

    const headers = { "cf-connecting-ip": "203.0.113.12" };
    expect(
      (
        await PUT(
          request({ expectedRevision: null, ...payload }, headers),
          ctx()
        )
      ).status
    ).toBe(200);

    const limited = request({ expectedRevision: 1, ...payload }, headers);
    const text = vi.fn(async () => {
      throw new Error("body should not be parsed");
    });
    limited.text = text;

    const response = await PUT(limited, ctx());

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(text).not.toHaveBeenCalled();
  });

  it("uses trusted forwarding headers consistently under the supported proxy boundary", async () => {
    setNoteRepositoryForTests(createMemoryNoteRepository());
    setRateLimitConfigForTests({ windowMs: 60_000, maxRequests: 1 });

    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/notes/a", {
            headers: { "cf-connecting-ip": "203.0.113.13" },
          }),
          ctx("a")
        )
      ).status
    ).toBe(400);
    const cfLimited = await GET(
      new NextRequest("http://localhost/api/notes/b", {
        headers: { "cf-connecting-ip": "203.0.113.13" },
      }),
      ctx("b")
    );
    expect(cfLimited.status).toBe(429);

    resetRateLimitForTests();
    setRateLimitConfigForTests({ windowMs: 60_000, maxRequests: 1 });

    const trustedHeaders = {
      "x-forwarded-for": "203.0.113.14, 198.51.100.9",
      "x-real-ip": "198.51.100.10",
    };
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/notes/daily-log", {
            headers: trustedHeaders,
          }),
          ctx()
        )
      ).status
    ).toBe(200);
    const limited = await GET(
      new NextRequest("http://localhost/api/notes/another-note", {
        headers: trustedHeaders,
      }),
      ctx("another-note")
    );
    expect(limited.status).toBe(429);
  });
});
