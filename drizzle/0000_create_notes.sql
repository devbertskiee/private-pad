CREATE TABLE IF NOT EXISTS "notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "ciphertext" text NOT NULL,
  "salt" text NOT NULL,
  "iv" text NOT NULL,
  "kdf" text NOT NULL,
  "kdf_iterations" integer NOT NULL,
  "encryption_alg" text NOT NULL,
  "crypto_version" integer NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "notes_slug_unique" ON "notes" USING btree ("slug");
