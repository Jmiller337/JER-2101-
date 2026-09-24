export type BodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: "bad_request" | "too_large" };

/**
 * Reads and parses a JSON body, refusing anything larger than `maxBytes` without buffering it
 * all first. A Content-Length over the cap is rejected immediately; a chunked body is counted
 * as it streams in.
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<BodyResult> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413, error: "too_large" };
  }
  if (!req.body) return { ok: false, status: 400, error: "bad_request" };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, status: 413, error: "too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: "bad_request" };
  }
}
