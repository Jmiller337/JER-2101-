import { defaultDeps } from "@/lib/server/deps";
import { handleRead } from "@/lib/server/readHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel: allow a long streamed read (the Hobby plan allows up to 300 seconds).
export const maxDuration = 120;

export function POST(req: Request) {
  return handleRead(req, defaultDeps());
}
