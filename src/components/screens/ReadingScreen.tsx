"use client";

import { useRef, useState } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
import { AddPageIcon, MoreIcon, NewDocumentIcon, PlayIcon, QuestionIcon, RetakeIcon, SettingsIcon } from "../icons";
import { ReaderControls } from "../ReaderControls";
import { Transcript } from "../Transcript";
import { Button, MoreButton } from "../ui";

/**
 * Screen 2. The transcript as real text. In read-aloud mode (or after "Play with app voice") a
 * fixed control bar drives the app's reader. In VoiceOver mode VoiceOver reads the text at the
 * user's own pace and the buttons sit below the transcript.
 */
export function ReadingScreen() {
  const controller = useController();
  const ui = useStore(controller.ui);
  const settings = useStore(controller.settings);
  const session = useStore(controller.session.store);
  const reader = useStore(controller.reader.store);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [more, setMore] = useState(false);
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

  return (
    <main className="flex min-h-dvh flex-col bg-ink text-text">
      <div className="flex-1 px-4 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header className="mb-6">
          {doc && (
            <p className="mb-1 text-lg font-semibold text-muted">
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
          <p ref={errorRef} tabIndex={-1} className="mb-5 rounded-2xl bg-accent-soft px-4 py-3 text-lg text-text">
            {ui.errorText}
          </p>
        )}
        <div>
          {doc ? (
            <Transcript doc={doc} version={session.version} current={appVoice ? reader.current : null} plain={!appVoice} />
          ) : (
            <p className="text-2xl">{waitingFor ? "Reading the page. This takes a few seconds." : "No document yet."}</p>
          )}
          {waitingFor && doc && <p className="mt-6 text-2xl text-muted">Reading page {waitingFor}…</p>}
        </div>
        {!appVoice && (
          <div className="mt-8 flex flex-col gap-4">
            <Button
              label="Play with app voice"
              icon={<PlayIcon />}
              variant="primary"
              onClick={() => controller.playWithAppVoice()}
              aria-disabled={!doc}
            />
            {retakeNumber !== null && (
              <Button
                label="Retake page"
                aria-label={`Retake page ${retakeNumber}`}
                icon={<RetakeIcon />}
                onClick={() => controller.retakePage()}
              />
            )}
            <Button label="Ask a question" icon={<QuestionIcon />} onClick={() => controller.openAsk()} aria-disabled={!doc} />
            <Button label="New document" icon={<NewDocumentIcon />} variant="destructive" onClick={() => controller.newDocument()} />
            <MoreButton
              expanded={more}
              onToggle={() => setMore((open) => !open)}
              controls="more-reading-options"
              icon={<MoreIcon />}
              size="large"
            />
            <div id="more-reading-options" hidden={!more} className="flex flex-col gap-4">
              <Button label="Add page" icon={<AddPageIcon />} onClick={() => controller.addPage()} aria-disabled={!doc} />
              <Button label="Settings" icon={<SettingsIcon />} onClick={() => controller.openSettings()} />
            </div>
          </div>
        )}
      </div>
      {appVoice && (
        <ReaderControls
          hasDoc={Boolean(doc)}
          retake={
            retakeNumber !== null && (
              <Button
                label="Retake page"
                aria-label={`Retake page ${retakeNumber}`}
                icon={<RetakeIcon />}
                size="normal"
                onClick={() => controller.retakePage()}
              />
            )
          }
        />
      )}
    </main>
  );
}
