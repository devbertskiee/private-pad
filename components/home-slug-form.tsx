"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeSlug, validateSlug } from "@/lib/validation/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function HomeSlugForm() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateSlug(slug);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    router.push(`/${result.slug}`);
  }

  return (
    <form onSubmit={onSubmit} className="w-full" noValidate>
      <div className="grid gap-6">
        <Input
          id="slug"
          aria-label="Note slug"
          aria-invalid={error ? true : undefined}
          value={slug}
          onChange={(event) => {
            setSlug(normalizeSlug(event.target.value));
            setError(null);
          }}
          placeholder="your note url"
          className="min-h-12 text-center sm:text-left"
          autoComplete="off"
          autoFocus
        />
        <Button
          className="mx-auto min-h-12 w-full max-w-36 justify-center px-8"
          type="submit"
        >
          Open
        </Button>
      </div>
    </form>
  );
}
