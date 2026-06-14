const RESERVED_SLUGS = new Set([
  "api",
  "_next",
  "admin",
  "login",
  "about",
  "settings",
]);
const SLUG_PATTERN = /^[a-z0-9-]+$/;

export type SlugValidationResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase();
}

export function validateSlug(input: string): SlugValidationResult {
  const slug = normalizeSlug(input);

  if (slug.length < 3 || slug.length > 80) {
    return { ok: false, error: "Slug must be 3 to 80 characters." };
  }

  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: "Slug may contain only lowercase letters, numbers, and hyphens.",
    };
  }

  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "This slug is reserved." };
  }

  return { ok: true, slug };
}
