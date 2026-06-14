import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DATABASE_URL is required in production for durable note persistence."
      );
    }

    return null;
  }

  db ??= drizzle(
    postgres(process.env.DATABASE_URL, { max: 1, prepare: false }),
    {
      schema,
    }
  );
  return db;
}
