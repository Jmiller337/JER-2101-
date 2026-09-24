import { createHash, timingSafeEqual } from "node:crypto";
import { spokenError } from "@/lib/shared/messages";
import type { ServerEnv } from "./config";
import { jsonResponse } from "./http";

/** Compares a presented passcode with the configured one in constant time. */
export function passcodeMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || provided === null) return false;
  // Hashing first gives equal-length buffers, so timingSafeEqual never throws and the
  // comparison time does not depend on where the strings differ or on their lengths.
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** Extracts the bearer token from the Authorization header. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Browsers send an Origin header on every POST. It must name the host that served the app
 * (or a host listed in ALLOWED_HOSTS). Requests without an Origin (curl, server-to-server)
 * are allowed through; they still need the passcode.
 */
export function originAllowed(req: Request, env: Pick<ServerEnv, "extraAllowedHosts">): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = (forwarded || req.headers.get("host") || "").toLowerCase();
  if (host && originHost === host) return true;
  return env.extraAllowedHosts.includes(originHost);
}

/**
 * Runs the checks every API route shares. Returns an error response to send, or null when the
 * request may proceed.
 */
export function checkRequest(req: Request, env: ServerEnv): Response | null {
  if (!originAllowed(req, env)) {
    return jsonResponse(403, { error: "forbidden", message: spokenError("forbidden") });
  }
  if (!env.passcode) {
    return jsonResponse(500, { error: "not_configured", message: spokenError("not_configured") });
  }
  if (!passcodeMatches(bearerToken(req), env.passcode)) {
    return jsonResponse(401, { error: "unauthorized", message: spokenError("unauthorized") });
  }
  return null;
}
