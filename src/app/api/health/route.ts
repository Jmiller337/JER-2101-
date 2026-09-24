export const dynamic = "force-dynamic";

/** Liveness check used by the e2e test server and by container health checks. */
export function GET() {
  return Response.json({ ok: true });
}
