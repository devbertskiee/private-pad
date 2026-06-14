import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    ciphertext: text("ciphertext").notNull(),
    salt: text("salt").notNull(),
    iv: text("iv").notNull(),
    kdf: text("kdf").notNull(),
    kdfIterations: integer("kdf_iterations").notNull(),
    encryptionAlg: text("encryption_alg").notNull(),
    cryptoVersion: integer("crypto_version").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("notes_slug_unique").on(table.slug)]
);

export type NoteRow = typeof notes.$inferSelect;
