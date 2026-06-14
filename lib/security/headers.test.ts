import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  buildProductionSecurityHeaders,
} from "./headers";

describe("production security headers", () => {
  it("builds the required production CSP directives with the provided nonce", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "test-nonce",
      environment: "production",
    });

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain(
      "script-src 'self' 'nonce-test-nonce' 'strict-dynamic'"
    );
    expect(csp).toContain("style-src 'self' 'nonce-test-nonce'");
    expect(csp).toContain("img-src 'self' blob: data:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("keeps development-only script relaxations out of production", () => {
    expect(
      buildContentSecurityPolicy({
        nonce: "dev-nonce",
        environment: "development",
      })
    ).toContain("'unsafe-eval'");
    expect(
      buildContentSecurityPolicy({
        nonce: "prod-nonce",
        environment: "production",
      })
    ).not.toContain("'unsafe-eval'");
  });

  it("adds compatible non-CSP production security headers", () => {
    const headers = buildProductionSecurityHeaders("test-nonce");

    expect(headers.get("Content-Security-Policy")).toContain(
      "'nonce-test-nonce'"
    );
    expect(headers.get("Strict-Transport-Security")).toContain(
      "max-age=31536000"
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });
});
