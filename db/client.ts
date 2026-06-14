import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) return null;
  db ??= drizzle(postgres(process.env.DATABASE_URL, { prepare: false }), {
    schema,
  });
  return db;
}
