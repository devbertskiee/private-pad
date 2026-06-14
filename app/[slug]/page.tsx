import Link from "next/link";
import { connection } from "next/server";
import { NoteClient } from "@/components/note-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { validateSlug } from "@/lib/validation/slug";

export default async function NotePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await connection();

  const { slug: rawSlug } = await params;
  const slug = validateSlug(rawSlug);
  if (!slug.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="normal-case tracking-tight">
              Invalid slug
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="destructive">
              <AlertDescription>
                Note data was not loaded. Use 3-80 lowercase letters, numbers,
                and hyphens; reserved paths cannot be used.
              </AlertDescription>
            </Alert>
            <Link className={buttonVariants()} href="/">
              Choose another slug
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }
  return <NoteClient slug={slug.slug} />;
}
