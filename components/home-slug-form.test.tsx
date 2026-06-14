// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeSlugForm } from "./home-slug-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("HomeSlugForm", () => {
  it("focuses the note slug field on load", () => {
    render(<HomeSlugForm />);

    expect(document.activeElement).toBe(screen.getByLabelText("Note slug"));
  });
});
