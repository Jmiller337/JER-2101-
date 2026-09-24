/**
 * Incremental line splitter for newline-delimited JSON (and any line protocol).
 * Feed it chunks of text as they arrive; it returns only complete lines and keeps the
 * unfinished tail for the next chunk. Handles both "\n" and "\r\n" line endings, including a
 * "\r\n" pair split across two chunks.
 */
export class LineSplitter {
  private buffer = "";

  push(chunk: string): string[] {
    if (!chunk) return [];
    this.buffer += chunk;
    const parts = this.buffer.split("\n");
    this.buffer = parts.pop() ?? "";
    return parts.map(stripCarriageReturn);
  }

  /** Returns the unfinished last line (if any) and resets the splitter. */
  flush(): string[] {
    const rest = stripCarriageReturn(this.buffer);
    this.buffer = "";
    return rest.length > 0 ? [rest] : [];
  }

  /** Length of the text held back waiting for a newline. */
  get pendingLength(): number {
    return this.buffer.length;
  }

  /** The text held back waiting for a newline. */
  get pending(): string {
    return this.buffer;
  }
}

function stripCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/** Serializes one event as an NDJSON line. */
export function toNdjsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
