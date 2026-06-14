import { NextRequest, NextResponse } from "next/server";
import { getNoteRepository } from "@/lib/notes/repository";
import {
  MAX_ENCRYPTED_NOTE_BYTES,
  validateDeleteNoteRequest,
  validateSaveNoteRequest,
} from "@/lib/notes/contract";
import { checkInProcessRateLimit } from "@/lib/rate-limit/in-process";
import { validateSlug } from "@/lib/validation/slug";

type RouteContext = { params: Promise<{ slug: string }> };

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function rateLimitError(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests." },
    { status: 429, headers: { "retry-after": String(retryAfterSeconds) } }
  );
}

export async function GET(request: NextRequest, context: RouteContext) {
  const rateLimit = checkInProcessRateLimit(request, "/api/notes/[slug]");
  if (!rateLimit.ok) return rateLimitError(rateLimit.retryAfterSeconds);

  const { slug: rawSlug } = await context.params;
  const slugResult = validateSlug(rawSlug);
  if (!slugResult.ok) return jsonError("Invalid slug.", 400);

  const note = await getNoteRepository().load(slugResult.slug);
  if (!note) return NextResponse.json({ exists: false });

  return NextResponse.json({ exists: true, note });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const rateLimit = checkInProcessRateLimit(request, "/api/notes/[slug]");
  if (!rateLimit.ok) return rateLimitError(rateLimit.retryAfterSeconds);

  const { slug: rawSlug } = await context.params;
  const slugResult = validateSlug(rawSlug);
  if (!slugResult.ok) return jsonError("Invalid slug.", 400);

  const bodyText = await request.text();
  if (
    new TextEncoder().encode(bodyText).byteLength > MAX_ENCRYPTED_NOTE_BYTES
  ) {
    return jsonError("Encrypted note is too large.", 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return jsonError("Invalid JSON.", 400);
  }

  const requestResult = validateSaveNoteRequest(body);
  if (!requestResult.ok)
    return jsonError("Invalid encrypted note payload.", 400);

  const { expectedRevision, ...payload } = requestResult.value;
  const result = await getNoteRepository().save(
    slugResult.slug,
    expectedRevision,
    payload
  );
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "Revision conflict.",
        conflict: true,
        currentRevision: result.currentRevision,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, note: result.note });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const rateLimit = checkInProcessRateLimit(request, "/api/notes/[slug]");
  if (!rateLimit.ok) return rateLimitError(rateLimit.retryAfterSeconds);

  const { slug: rawSlug } = await context.params;
  const slugResult = validateSlug(rawSlug);
  if (!slugResult.ok) return jsonError("Invalid slug.", 400);

  let body: unknown = {};
  const bodyText = await request.text();
  if (bodyText.trim().length > 0) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      return jsonError("Invalid JSON.", 400);
    }
  }

  const requestResult = validateDeleteNoteRequest(body);
  if (!requestResult.ok) return jsonError("Invalid delete request.", 400);

  const result = await getNoteRepository().delete(
    slugResult.slug,
    requestResult.value.expectedRevision
  );
  if (!result.ok) {
    return NextResponse.json(
      {
        error: "Revision conflict.",
        conflict: true,
        currentRevision: result.currentRevision,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    exists: false,
    deleted: result.deleted,
  });
}
