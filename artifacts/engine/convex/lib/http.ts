/**
 * Small helpers shared by our HTTP actions (auth/routes.ts, agent/oauth.ts): JSON responses that are never
 * cached, a guard that turns unexpected failures into a generic 500 (details only in the deployment log), a
 * size-capped body reader and string checks.
 */
import { httpAction, type ActionCtx } from "../_generated/server";

/** A JSON response, `Cache-Control: no-store` unless `headers` says otherwise. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
}

/** Wrap a handler so an unexpected failure becomes `respond()` (a 500), logged under `label` without details. */
export function guarded(label: string, respond: () => Response, handler: (ctx: ActionCtx, request: Request) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    try {
      return await handler(ctx, request);
    } catch (error) {
      console.error(`${label} failed`, request.method, new URL(request.url).pathname, error instanceof Error ? error.message : "unknown");
      return respond();
    }
  });
}

/**
 * The request body as an object, or null when it is larger than `maxBytes` or not an object. JSON by default;
 * with `form`, a body whose Content-Type is not JSON is read as application/x-www-form-urlencoded.
 */
export async function readBody(request: Request, maxBytes: number, { form = false } = {}): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  if (form && !(request.headers.get("content-type") ?? "").includes("application/json")) return Object.fromEntries(new URLSearchParams(text));
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/** A string of `min`..`max` characters. */
export const bounded = (value: unknown, min: number, max: number): value is string => typeof value === "string" && value.length >= min && value.length <= max;
/** No control characters. */
export const printable = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);
