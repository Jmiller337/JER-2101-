"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { Quad } from "@/lib/client/vision/analysis";
import { approachQuad, coverRect, placeQuad, quadPoints } from "@/lib/client/vision/outline";
import { useController, useStore } from "./hooks";

/**
 * The box around the page the camera sees, drawn over the picture: white while the page is
 * being lined up, green when it is ready and the picture is taken. It follows a tilted page's
 * corners and glides between frames. Decorative: every state is also spoken.
 */
export function PageOutline({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const controller = useController();
  const outline = useStore(controller.outline);
  const haloRef = useRef<SVGPolygonElement>(null);
  const lineRef = useRef<SVGPolygonElement>(null);

  useEffect(() => {
    let frame = 0;
    let shown: Quad | null = null;
    let drawn = "";
    const reduceMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const video = videoRef.current;
      const quad = controller.outline.get().quad;
      // The picture fills the screen and its overflow is cropped; the box follows the same mapping.
      const rect = video && coverRect(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight);
      if (!quad || !rect) {
        shown = null;
      } else {
        const placed = placeQuad(quad, rect);
        shown = shown && !reduceMotion?.matches ? approachQuad(shown, placed, 0.35) : placed;
      }
      const points = shown ? quadPoints(shown) : "";
      if (points === drawn) return;
      drawn = points;
      haloRef.current?.setAttribute("points", points);
      lineRef.current?.setAttribute("points", points);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [controller, videoRef]);

  const state = outline.quad ? (outline.ready ? "ready" : "seen") : "hidden";
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-testid="page-outline"
      data-state={state}
      className="page-outline pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
    >
      <polygon ref={haloRef} className="page-outline-halo" />
      <polygon ref={lineRef} className="page-outline-line" />
    </svg>
  );
}
