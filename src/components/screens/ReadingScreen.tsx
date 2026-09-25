"use client";

import { useRef } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
import {
  AddPageIcon,
  FasterIcon,
  ParagraphDownIcon,
  ParagraphUpIcon,
  PlayIcon,
  QuestionIcon,
  RetakeIcon,
  SettingsIcon,
  SlowerIcon,
  SpellIcon,
} from "../icons";
import { ReaderControls } from "../ReaderControls";
import { ReadingTopBar, type MenuEntry } from "../ReadingTopBar";
import { Transcript } from "../Transcript";
import { Button } from "../ui";

/**
 * Screen 2. The document as real text, with the controls floating on glass: New document and
 * More at the top, and in read-aloud mode (or after "Play with app voice") the player at the
 * bottom. In VoiceOver mode VoiceOver reads the text at the user's own pace and the buttons sit
 * below the transcript.
 */
export function ReadingScreen() {
  const controller = useController();
  const ui = useStore(controller.ui);
  const settings = useStore(controller.settings);
  const session = useStore(controller.session.store);
  const reader = useStore(controller.reader.store);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useFocusRequest(headingRef, "heading");
  useFocusRequest(headingRef, "transcript");
  useFocusRequest(errorRef, "error");

  const appVoice = settings.mode !== "voiceOver" || ui.docAppVoice;
  const doc = session.doc;
  const waitingFor = session.awaitingPage;
  const title = doc?.title || (waitingFor ? `Reading page ${waitingFor}…` : "Reading");
  const pageCount = doc?.pages.length ?? 0;
  const kind = doc?.pages[0]?.kind;
  // A page whose read stopped part way can be photographed again, as long as it is the last page.
  const lastPage = doc?.pages[doc.pages.length - 1];
  const retakeNumber = lastPage?.failed && !lastPage.fromPdf && session.activeReads === 0 ? lastPage.number : null;
  const retakeButton = (variant: "float" | "secondary") =>
    retakeNumber !== null && (
      <Button
        label="Retake page"
        aria-label={`Retake page ${retakeNumber}`}
        icon={<RetakeIcon />}
        variant={variant}
        size={variant === "float" ? "normal" : "large"}
        onClick={() => controller.retakePage()}
      />
    );

  const speed = settings.rate.toFixed(1);
  const pageEntries: MenuEntry[] = [
    { label: "Add page", icon: <AddPageIcon />, onSelect: () => controller.addPage(), unavailable: !doc },
    { label: "Settings", icon: <SettingsIcon />, onSelect: () => controller.openSettings() },
  ];
  const entries: MenuEntry[] = appVoice
    ? [
        { label: "Previous paragraph", icon: <ParagraphUpIcon />, onSelect: () => controller.previousParagraph() },
        { label: "Next paragraph", icon: <ParagraphDownIcon />, onSelect: () => controller.nextParagraph() },
        { label: "Spell", name: "Spell the current sentence", icon: <SpellIcon />, onSelect: () => controller.spell() },
        { label: "Slower", name: `Slower, speed ${speed}`, icon: <SlowerIcon />, onSelect: () => controller.slower() },
        { label: "Faster", name: `Faster, speed ${speed}`, icon: <FasterIcon />, onSelect: () => controller.faster() },
        ...pageEntries,
      ]
    : pageEntries;

  return (
    <main className="flex min-h-dvh flex-col bg-ink text-text">
      <ReadingTopBar entries={entries} />
      <div className="flex-1 px-5 pb-8">
        <header className="mb-8">
          {doc && (
            <p className="mb-3 inline-flex items-center rounded-full bg-accent-soft px-3.5 py-1 text-lg font-semibold text-accent">
              {[kind && kind !== "other" ? kind.charAt(0).toUpperCase() + kind.slice(1) : null, pageCount === 1 ? "1 page" : `${pageCount} pages`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-bold leading-tight tracking-tight">
            {title}
          </h1>
        </header>
        {ui.errorText && (
          <p ref={errorRef} tabIndex={-1} className="mb-6 rounded-3xl bg-accent-soft px-5 py-4 text-lg text-text">
            {ui.errorText}
          </p>
        )}
        <div>
          {doc ? (
            <Transcript doc={doc} version={session.version} current={appVoice ? reader.current : null} plain={!appVoice} />
          ) : (
            <p className="text-2xl text-muted">{waitingFor ? "Reading the page. This takes a few seconds." : "No document yet."}</p>
          )}
          {waitingFor && doc && <p className="mt-8 text-xl font-semibold text-muted">Reading page {waitingFor}…</p>}
        </div>
        {!appVoice && (
          <div className="mt-10 flex flex-col gap-3">
            <Button
              label="Play with app voice"
              icon={<PlayIcon />}
              variant="primary"
              onClick={() => controller.playWithAppVoice()}
              aria-disabled={!doc}
            />
            {retakeButton("secondary")}
            <Button label="Ask a question" icon={<QuestionIcon />} onClick={() => controller.openAsk()} aria-disabled={!doc} />
          </div>
        )}
      </div>
      {appVoice && <ReaderControls hasDoc={Boolean(doc)} retake={retakeButton("float")} />}
    </main>
  );
}
