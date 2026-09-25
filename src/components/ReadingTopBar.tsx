"use client";

import { useState, type ReactNode } from "react";
import { useController } from "./hooks";
import { MoreIcon, NewDocumentIcon } from "./icons";
import { Button, MoreButton } from "./ui";

export interface MenuEntry {
  label: string;
  /** A fuller accessible name that still contains the visible label (WCAG 2.5.3). */
  name?: string;
  icon: ReactNode;
  onSelect: () => void;
  unavailable?: boolean;
}

/**
 * The reading screen's top corners, floating on glass over the text as the camera's More does:
 * New document on the leading side, More on the trailing side. More opens a glass menu under it
 * with the less-used controls. The text fades out above the bar instead of showing in the gap.
 */
export function ReadingTopBar({ entries }: { entries: MenuEntry[] }) {
  const controller = useController();
  const [more, setMore] = useState(false);
  return (
    <div className="scroll-edge-top sticky top-0 z-20 flex items-start justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-5 [--edge:var(--color-ink)]">
      <Button
        label="New document"
        icon={<NewDocumentIcon className="text-danger" />}
        variant="float"
        size="normal"
        onClick={() => controller.newDocument()}
      />
      <div className="relative flex flex-col items-end">
        <MoreButton
          expanded={more}
          onToggle={() => setMore((open) => !open)}
          controls="more-reading-controls"
          icon={<MoreIcon />}
          variant="float"
        />
        <div
          id="more-reading-controls"
          role="group"
          aria-label="More reading controls"
          hidden={!more}
          className="glass absolute top-full right-0 mt-2 flex w-72 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[1.75rem] py-1"
        >
          {entries.map((entry) => (
            <button
              key={entry.label}
              type="button"
              aria-label={entry.name}
              aria-disabled={entry.unavailable || undefined}
              onClick={entry.onSelect}
              className={`glass-item flex min-h-14 items-center gap-3 px-5 text-left text-xl font-semibold text-text ${entry.unavailable ? "opacity-60" : ""}`}
            >
              <span aria-hidden="true" className="h-6 w-6 shrink-0 [&>svg]:h-full [&>svg]:w-full">
                {entry.icon}
              </span>
              {entry.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
