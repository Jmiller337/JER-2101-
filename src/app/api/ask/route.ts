import { handleAsk } from "@/lib/server/askHandler";
import { defaultDeps } from "@/lib/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export function POST(req: Request) {
  return handleAsk(req, defaultDeps());
}
