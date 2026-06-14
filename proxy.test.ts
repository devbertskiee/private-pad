import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { CSP_HEADER, NONCE_HEADER } from "@/lib/security/headers";

async function importProxy() {
  vi.resetModules();
  return import("./proxy");
}

describe("proxy security headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets a fresh production nonce in CSP response headers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { proxy } = await importProxy();

    const first = proxy(new NextRequest("https://example.test/alpha"));
    const second = proxy(new NextRequest("https://example.test/beta"));
    const firstCsp = first.headers.get(CSP_HEADER) ?? "";
    const secondCsp = second.headers.get(CSP_HEADER) ?? "";

    expect(firstCsp).toContain("script-src 'self' 'nonce-");
    expect(firstCsp).toContain("'strict-dynamic'");
    expect(firstCsp).toContain("style-src 'self' 'nonce-");
    expect(firstCsp).not.toEqual(secondCsp);
    expect(first.headers.get("Strict-Transport-Security")).toContain(
      "max-age=31536000"
    );
    expect(first.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("keeps development responses free of production CSP headers", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { proxy } = await importProxy();

    const response = proxy(new NextRequest("http://localhost:3000/alpha"));

    expect(response.headers.get(CSP_HEADER)).toBeNull();
    expect(response.headers.get(NONCE_HEADER)).toBeNull();
  });
});
