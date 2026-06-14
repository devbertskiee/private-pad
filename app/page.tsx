import { connection } from "next/server";
import { HomeSlugForm } from "@/components/home-slug-form";
import { Card, CardContent } from "@/components/ui/card";

export default async function Home() {
  await connection();

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-[30rem]">
        <Card className="w-full sm:w-[30rem]">
          <CardContent className="space-y-8 p-5 sm:p-6">
            <header className="space-y-3 text-center">
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                PrivatePad
              </h1>
              <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground">
                A zero-knowledge encrypted notepad for private browser-side
                notes.
              </p>
            </header>
            <HomeSlugForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
