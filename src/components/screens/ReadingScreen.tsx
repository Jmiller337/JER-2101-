"use client";

import { useRef } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
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
  const playing = reader.status === "playing" || reader.status === "waiting" || reader.status === "spelling";

  return (
    <main className="flex h-dvh flex-col bg-black text-white">
      <div className="flex-1 overflow-y-auto px-5 pb-8 pt-5">
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
            <Button label="New document" onClick={() => controller.newDocument()} />
            <Button label="Settings" onClick={() => controller.openSettings()} />
          </div>
        )}
      </div>
      {appVoice && (
        <nav aria-label="Reading controls" className="border-t-2 border-neutral-700 bg-neutral-950 p-3">
          <div className="grid grid-cols-1 gap-3">
            <Button
              label={playing ? "Pause" : "Play"}
              variant="primary"
              size="huge"
              onClick={() => controller.togglePlay()}
            />
            <div className="grid grid-cols-2 gap-3">
              <Button label="New document" size="normal" onClick={() => controller.newDocument()} />
              <Button label="Settings" size="normal" onClick={() => controller.openSettings()} />
            </div>
          </div>
        </nav>
      )}
    </main>
  );
}
