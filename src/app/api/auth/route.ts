import { handleAuth } from "@/lib/server/authHandler";
import { defaultDeps } from "@/lib/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handleAuth(req, defaultDeps());
}
