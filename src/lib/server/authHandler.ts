import { checkRequest } from "./auth";
import type { HandlerDeps } from "./deps";

/** POST /api/auth: 204 when the bearer passcode matches APP_PASSCODE, otherwise 401 (or 403/500). */
export async function handleAuth(req: Request, deps: HandlerDeps): Promise<Response> {
  const started = deps.now();
  const denied = checkRequest(req, deps.env);
  deps.log({ route: "auth", outcome: denied ? "denied" : "ok", code: denied ? String(denied.status) : undefined, ms: deps.now() - started });
  return denied ?? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
