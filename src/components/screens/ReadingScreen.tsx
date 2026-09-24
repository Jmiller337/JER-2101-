"use client";

import { useRef } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
import { ReaderControls } from "../ReaderControls";
import { Transcript } from "../Transcript";
import { Button } from "../ui";

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
  useFocusRequest(headingRef, "heading");
  useFocusRequest(headingRef, "transcript");
  useFocusRequest(errorRef, "error");

  const appVoice = settings.mode !== "voiceOver" || ui.docAppVoice;
  const doc = session.doc;
  const waitingFor = session.awaitingPage;
  const title = doc?.title || (waitingFor ? `Reading page ${waitingFor}…` : "Reading");
  // A page whose read stopped part way can be photographed again, as long as it is the last page.
  const lastPage = doc?.pages[doc.pages.length - 1];
  const retakeNumber = lastPage?.failed && session.activeReads === 0 ? lastPage.number : null;

  return (
    <main className="flex min-h-dvh flex-col bg-black text-white">
      <div className="flex-1 px-5 pb-8 pt-5">
        <h1 ref={headingRef} tabIndex={-1} className="mb-5 text-3xl font-bold leading-tight">
          {title}
        </h1>
        {ui.errorText && (
          <p ref={errorRef} tabIndex={-1} className="mb-4 text-lg text-yellow-300">
            {ui.errorText}
          </p>
        )}
        {doc ? (
          <Transcript doc={doc} version={session.version} current={appVoice ? reader.current : null} plain={!appVoice} />
        ) : (
          <p className="text-2xl">{waitingFor ? "Reading the page. This takes a few seconds." : "No document yet."}</p>
        )}
        {waitingFor && doc && <p className="mt-6 text-2xl">Reading page {waitingFor}…</p>}
        {!appVoice && (
          <div className="mt-10 flex flex-col gap-4">
            <Button
              label="Play with app voice"
              variant="primary"
              onClick={() => controller.playWithAppVoice()}
              aria-disabled={!doc}
            />
            {retakeNumber !== null && (
              <Button
                label="Retake page"
                aria-label={`Retake page ${retakeNumber}`}
                onClick={() => controller.retakePage()}
              />
            )}
            <Button label="Ask a question" onClick={() => controller.openAsk()} aria-disabled={!doc} />
            <Button label="Add page" onClick={() => controller.addPage()} aria-disabled={!doc} />
            <Button label="New document" onClick={() => controller.newDocument()} />
            <Button label="Settings" onClick={() => controller.openSettings()} />
          </div>
        )}
      </div>
      {appVoice && (
        <ReaderControls
          extra={
            <>
              {retakeNumber !== null && (
                <Button
                  label="Retake page"
                  aria-label={`Retake page ${retakeNumber}`}
                  size="normal"
                  className="col-span-2"
                  onClick={() => controller.retakePage()}
                />
              )}
              <Button label="Ask a question" size="normal" onClick={() => controller.openAsk()} aria-disabled={!doc} />
              <Button label="Add page" size="normal" onClick={() => controller.addPage()} aria-disabled={!doc} />
            </>
          }
        />
      )}
    </main>
  );
}
