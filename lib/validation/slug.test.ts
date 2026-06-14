import { describe, expect, it } from "vitest";
import { normalizeSlug, validateSlug } from "./slug";

describe("slug validation", () => {
  it("normalizes lowercase", () => {
    expect(normalizeSlug(" My-Private-Note ")).toBe("my-private-note");
    expect(validateSlug("My-Private-Note")).toEqual({
      ok: true,
      slug: "my-private-note",
    });
  });

  it("rejects invalid and reserved slugs", () => {
    for (const slug of [
      "ab",
      "a".repeat(81),
      "has space",
      "emoji-🔐",
      "api",
      "_next",
      "admin",
      "login",
      "about",
      "settings",
    ]) {
      expect(validateSlug(slug).ok).toBe(false);
    }
  });
});
