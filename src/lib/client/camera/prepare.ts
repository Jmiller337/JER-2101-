export interface PreparedImage {
  base64: string;
  mediaType: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
}

export const MAX_LONG_EDGE = 2000;
export const JPEG_QUALITY = 0.85;

/** Output size for a source image: the long edge scaled down to `maxEdge`, never up. */
export function targetSize(width: number, height: number, maxEdge = MAX_LONG_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Downscales a capture so the long edge is 2000 pixels, encodes it as JPEG at quality 0.85, and
 * returns base64 without line breaks (PROMPT.md 6.4). No other filtering: the model reads the
 * photo better than a thresholded version.
 */
export async function prepareImage(source: CanvasImageSource, width: number, height: number): Promise<PreparedImage> {
  const size = targetSize(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG encoding failed"))), "image/jpeg", JPEG_QUALITY);
  });
  const base64 = await blobToBase64(blob);
  // Release the canvas memory promptly; iOS limits total canvas memory.
  canvas.width = 0;
  canvas.height = 0;
  return { base64, mediaType: "image/jpeg", width: size.width, height: size.height, bytes: blob.size };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Loads a photo picked with the file input, applying its EXIF orientation. */
export async function imageFromFile(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  return { source: bitmap, width: bitmap.width, height: bitmap.height };
}
