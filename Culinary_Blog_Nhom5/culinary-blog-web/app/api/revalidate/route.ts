import { revalidatePath, revalidateTag } from "next/cache";

const allowedStaticPaths = new Set(["/", "/recipes", "/categories"]);

function validTag(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 160) return false;
  return /^(public:(categories|recipes)|public:(recipe|category):[a-z0-9%_-]+)$/u.test(value);
}
function validPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 300) return false;
  if (allowedStaticPaths.has(value)) return true;
  return /^\/(recipes|categories)\/[a-z0-9%_-]+(?:\?page=[1-9][0-9]*)?$/u.test(value);
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATION_SECRET;
  const supplied = request.headers.get("x-revalidation-secret");
  if (!secret || !supplied || supplied !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8_192) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Payload must be an object" }, { status: 400 });
  }

  const payload = body as { tags?: unknown; paths?: unknown };
  const tags = Array.isArray(payload.tags) ? payload.tags.filter(validTag) : [];
  const paths = Array.isArray(payload.paths) ? payload.paths.filter(validPath) : [];
  const requestedTags = Array.isArray(payload.tags) ? payload.tags.length : 0;
  const requestedPaths = Array.isArray(payload.paths) ? payload.paths.length : 0;

  if (tags.length !== requestedTags || paths.length !== requestedPaths || (tags.length === 0 && paths.length === 0)) {
    return Response.json({ error: "Unsupported tag or path" }, { status: 422 });
  }

  for (const tag of tags) revalidateTag(tag, "max");
  // Next's path revalidation API accepts a pathname, not a query string.
  // Query-bearing pages share the same route cache entry and are covered by
  // the tag invalidation above.
  for (const path of paths) revalidatePath(path.split("?", 1)[0], "page");

  return new Response(null, { status: 204 });
}
