/** One log line per API request: timings, token counts, and outcome. Never document text. */
export interface RequestLog {
  route: "auth" | "read" | "ask";
  outcome: string;
  code?: string;
  model?: string;
  ms: number;
  firstEventMs?: number | null;
  stopReason?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  blocks?: number;
  dropped?: number;
  parserMode?: string;
  imageChars?: number;
}

export function logRequest(entry: RequestLog): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...entry }));
}
