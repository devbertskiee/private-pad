import type { NextRequest } from "next/server";

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

type RateLimitState = {
  windowStartedAt: number;
  count: number;
};

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 60,
};

const buckets = new Map<string, RateLimitState>();
let config = DEFAULT_CONFIG;

function clientIdentifier(request: NextRequest): string {
  // Public deployment support requires a trusted TLS/reverse proxy that
  // overwrites or sanitizes these forwarding headers before they reach Next.js.
  // This value is used only for short-lived abuse-control buckets; do not log
  // or persist it as analytics or note-specific tracking data.
  const forwardedFor = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return (
    forwardedFor ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "local"
  );
}

export function checkInProcessRateLimit(
  request: NextRequest,
  endpoint: string
) {
  const now = Date.now();
  const key = `${request.method}:${endpoint}:${clientIdentifier(request)}`;
  const current = buckets.get(key);

  if (!current || now - current.windowStartedAt >= config.windowMs) {
    buckets.set(key, { windowStartedAt: now, count: 1 });
    return { ok: true as const };
  }

  current.count += 1;
  if (current.count > config.maxRequests) {
    return {
      ok: false as const,
      retryAfterSeconds: Math.ceil(
        (config.windowMs - (now - current.windowStartedAt)) / 1000
      ),
    };
  }

  return { ok: true as const };
}

export function resetRateLimitForTests() {
  buckets.clear();
  config = DEFAULT_CONFIG;
}

export function setRateLimitConfigForTests(nextConfig: RateLimitConfig) {
  config = nextConfig;
  buckets.clear();
}
