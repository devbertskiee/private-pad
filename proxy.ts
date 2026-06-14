import { NextRequest, NextResponse } from "next/server";
import {
  buildProductionSecurityHeaders,
  CSP_HEADER,
  NONCE_HEADER,
} from "@/lib/security/headers";

function createNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const nonce = createNonce();
  const securityHeaders = buildProductionSecurityHeaders(nonce);
  const requestHeaders = new Headers(request.headers);

  // Next.js 16.2.7 CSP docs require a fresh per-request nonce, `x-nonce`,
  // the same nonce in the request CSP header, and dynamic rendering so the
  // framework can apply that nonce to SSR scripts/styles.
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CSP_HEADER, securityHeaders.get(CSP_HEADER) ?? "");

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of securityHeaders) {
    response.headers.set(name, value);
  }

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
