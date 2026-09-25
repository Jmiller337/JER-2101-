import { z } from "zod";
import {
  ASK_LIMITS,
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BASE64_CHARS,
  MAX_PDF_BASE64_CHARS,
  type AskRequest,
  type ReadRequest,
} from "@/lib/shared/protocol";

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Request body for POST /api/read: a photo or a PDF, never both. */
export const ReadRequestSchema = z
  .object({
    image: z
      .object({
        mediaType: z.enum(IMAGE_MEDIA_TYPES),
        data: z.string().min(100).max(MAX_IMAGE_BASE64_CHARS).regex(BASE64, "image data must be base64 without line breaks"),
      })
      .optional(),
    pdf: z
      .object({
        data: z.string().min(100).max(MAX_PDF_BASE64_CHARS).regex(BASE64, "PDF data must be base64 without line breaks"),
      })
      .optional(),
    pageNumber: z.number().int().min(1).max(500),
    languageHint: z.string().min(2).max(35).nullable().optional(),
  })
  .refine((body) => (body.image ? 1 : 0) + (body.pdf ? 1 : 0) === 1, "send exactly one of image and pdf");

/** Request body for POST /api/ask. */
export const AskRequestSchema = z.object({
  pages: z.array(z.string().max(100_000)).min(1).max(500),
  title: z.string().max(400),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(ASK_LIMITS.historyContent) }))
    .max(ASK_LIMITS.historyMessages),
  question: z.string().trim().min(1).max(ASK_LIMITS.question),
});

// The schemas must produce exactly the shared request types.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const readMatches: Exact<z.infer<typeof ReadRequestSchema>, ReadRequest> = true;
const askMatches: Exact<z.infer<typeof AskRequestSchema>, AskRequest> = true;
void readMatches;
void askMatches;
