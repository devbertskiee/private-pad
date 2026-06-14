import { afterEach, describe, expect, it, vi } from "vitest";

const drizzleMock = vi.fn((client: unknown, config: unknown) => ({
  client,
  config,
}));
const postgresMock = vi.fn(() => ({ connection: "postgres" }));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: drizzleMock,
}));

vi.mock("postgres", () => ({
  default: postgresMock,
}));

describe("database client", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    drizzleMock.mockClear();
    postgresMock.mockClear();
  });

  it("fails fast in production when DATABASE_URL is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");

    const { getDb } = await import("./client");

    expect(() => getDb()).toThrow(
      "DATABASE_URL is required in production for durable note persistence."
    );
    expect(postgresMock).not.toHaveBeenCalled();
    expect(drizzleMock).not.toHaveBeenCalled();
  });

  it("returns null outside production when DATABASE_URL is missing", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");

    const { getDb } = await import("./client");

    expect(getDb()).toBeNull();
    expect(postgresMock).not.toHaveBeenCalled();
    expect(drizzleMock).not.toHaveBeenCalled();
  });

  it("creates the Postgres client with serverless-conscious options", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://user:pass@example.com:5432/db");

    const { getDb } = await import("./client");

    expect(getDb()).toEqual({
      client: { connection: "postgres" },
      config: { schema: expect.any(Object) },
    });
    expect(postgresMock).toHaveBeenCalledWith(
      "postgres://user:pass@example.com:5432/db",
      { max: 1, prepare: false }
    );
    expect(drizzleMock).toHaveBeenCalledTimes(1);
  });
});
