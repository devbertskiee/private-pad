export const NONCE_HEADER = "x-nonce";
export const CSP_HEADER = "Content-Security-Policy";

type CspOptions = {
  nonce: string;
  environment?: "production" | "development";
};

function normalizeHeader(value: string) {
  return value.replace(/\s{2,}/g, " ").trim();
}

export function buildContentSecurityPolicy({
  nonce,
  environment = "production",
}: CspOptions) {
  const devScriptRelaxation =
    environment === "development" ? " 'unsafe-eval'" : "";

  return normalizeHeader(`
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devScriptRelaxation};
    style-src 'self' 'nonce-${nonce}';
    img-src 'self' blob: data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `);
}

export function buildProductionSecurityHeaders(nonce: string) {
  return new Headers({
    [CSP_HEADER]: buildContentSecurityPolicy({
      nonce,
      environment: "production",
    }),
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    "X-Frame-Options": "DENY",
  });
}
