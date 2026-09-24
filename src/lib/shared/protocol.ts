import { z } from "zod";

/** Kinds of text block the reading engine can return, in reading order. */
export const BLOCK_KINDS = ["heading", "paragraph", "list_item", "table_row", "label_value", "note"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** Machine-readable error codes. Every one has a spoken sentence in `messages.ts`. */
export const ERROR_CODES = [
  "network",
  "unauthorized",
  "forbidden",
  "too_large",
  "bad_request",
  "rate_limited",
  "overloaded",
  "refusal",
  "empty",
  "not_configured",
  "server",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

/** Largest base64 image string accepted (about 7.5 MB decoded; the body cap is 6 MB anyway). */
export const MAX_IMAGE_BASE64_CHARS = 10_000_000;

// ---------------------------------------------------------------------------
// Streamed events from POST /api/read (one JSON object per line)
// ---------------------------------------------------------------------------

export const MetaEventSchema = z.object({
  type: z.literal("meta"),
  status: z.enum(["ok", "retry"]),
  language: z.string().min(2).max(35),
  kind: z.string().max(60),
  title: z.string().max(400),
  warning: z.string().max(400).optional(),
  problem: z.string().max(400).optional(),
});
export type MetaEvent = z.infer<typeof MetaEventSchema>;

export const BlockEventSchema = z.object({
  type: z.literal("block"),
  kind: z.enum(BLOCK_KINDS),
  text: z.string().min(1).max(8000),
});
export type BlockEvent = z.infer<typeof BlockEventSchema>;

export const DoneEventSchema = z.object({
  type: z.literal("done"),
  blocks: z.number().int().nonnegative(),
});
export type DoneEvent = z.infer<typeof DoneEventSchema>;

export const ErrorEventSchema = z.object({
  type: z.literal("error"),
  code: z.enum(ERROR_CODES).optional(),
  message: z.string().min(1).max(400),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export const ReadEventSchema = z.discriminatedUnion("type", [
  MetaEventSchema,
  BlockEventSchema,
  DoneEventSchema,
  ErrorEventSchema,
]);
export type ReadEvent = z.infer<typeof ReadEventSchema>;

// ---------------------------------------------------------------------------
// Streamed events from POST /api/ask
// ---------------------------------------------------------------------------

export const AskTextEventSchema = z.object({ type: z.literal("text"), text: z.string() });
export const AskDoneEventSchema = z.object({ type: z.literal("done") });
export const AskEventSchema = z.discriminatedUnion("type", [AskTextEventSchema, AskDoneEventSchema, ErrorEventSchema]);
export type AskEvent = z.infer<typeof AskEventSchema>;

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export const ReadRequestSchema = z.object({
  image: z.object({
    mediaType: z.enum(IMAGE_MEDIA_TYPES),
    data: z
      .string()
      .min(100)
      .max(MAX_IMAGE_BASE64_CHARS)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "image data must be base64 without line breaks"),
  }),
  pageNumber: z.number().int().min(1).max(500),
  languageHint: z.string().min(2).max(35).nullable().optional(),
});
export type ReadRequest = z.infer<typeof ReadRequestSchema>;

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const AskRequestSchema = z.object({
  pages: z.array(z.string().max(100_000)).min(1).max(500),
  title: z.string().max(400),
  history: z.array(ChatTurnSchema).max(40),
  question: z.string().trim().min(1).max(2000),
});
export type AskRequest = z.infer<typeof AskRequestSchema>;
