"use client";

import { useRef, useState } from "react";
import { ASK_LIMITS } from "@/lib/shared/protocol";
import { useController, useFocusRequest, useStore } from "../hooks";
import { BackIcon, MicIcon, QuestionIcon, SendIcon } from "../icons";
import { Button } from "../ui";

/**
 * Screen 3: ask a question about the document. A text field (iOS keyboard dictation works here,
 * with or without VoiceOver), Send, and Talk, which uses the browser's speech recognition when
 * it is available. Questions and answers stay on screen as a list for the session.
 */
export function AskScreen() {
  const controller = useController();
  const ask = useStore(controller.ask);
  const [draft, setDraft] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const ui = useStore(controller.ui);
  useFocusRequest(headingRef, "heading");
  useFocusRequest(errorRef, "error");
  const value = ask.listening ? ask.heard : draft;

  return (
    <main className="flex min-h-dvh flex-col gap-5 bg-ink p-5 pb-10 text-text">
      <div className="flex items-center gap-3">
        <QuestionIcon className="h-10 w-10 shrink-0 text-accent" />
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-extrabold tracking-tight">
          Ask a question
        </h1>
      </div>
      <form
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
        onSubmit={(event) => {
          event.preventDefault();
          // Clear the box only when the question was accepted, so nothing typed is lost.
          if (controller.submitQuestion(value)) setDraft("");
        }}
      >
        <label htmlFor="question" className="text-2xl font-semibold">
          Your question
        </label>
        <textarea
          id="question"
          rows={3}
          maxLength={ASK_LIMITS.question}
          value={value}
          readOnly={ask.listening}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          className="rounded-2xl border-2 border-line-2 bg-ink p-3 text-2xl text-text"
        />
        <div className="grid grid-cols-2 gap-3">
          <button
            type="submit"
            aria-disabled={ask.busy}
            className={`inline-flex min-h-20 items-center justify-center gap-2.5 rounded-2xl border-2 border-accent bg-accent text-3xl font-extrabold tracking-tight text-on-accent ${
              ask.busy ? "opacity-60" : "active:scale-[0.98]"
            }`}
          >
            <SendIcon className="h-8 w-8" />
            {ask.busy ? "Answering…" : "Send"}
          </button>
          <Button
            label={ask.listening ? "Stop and send" : "Talk"}
            aria-label={ask.listening ? "Stop and send" : "Talk: say your question"}
            aria-pressed={ask.listening}
            icon={<MicIcon />}
            size="large"
            className="min-h-20 text-3xl"
            onClick={() => controller.toggleListening()}
          />
        </div>
      </form>
      {ui.errorText && (
        <p ref={errorRef} tabIndex={-1} className="rounded-2xl border border-accent/50 bg-accent-soft px-4 py-3 text-lg">
          {ui.errorText}
        </p>
      )}
      {ask.turns.length > 0 && (
        <section aria-labelledby="answers-heading" className="flex flex-col gap-3">
          <h2 id="answers-heading" className="text-2xl font-semibold">
            Questions and answers
          </h2>
          <ol className="flex flex-col gap-4" data-testid="answers">
            {[...ask.turns].reverse().map((turn) => (
              <li key={turn.id} className="rounded-card border border-line bg-surface-2 p-4 text-2xl">
                <p className="font-semibold text-muted">Question: {turn.question}</p>
                <p className="mt-2">
                  Answer:{" "}
                  {turn.status === "error"
                    ? turn.error
                    : turn.answer || (turn.status === "streaming" ? "Thinking…" : "")}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
      <Button label="Back to reading" icon={<BackIcon />} size="large" onClick={() => controller.closeAsk()} className="mt-auto" />
    </main>
  );
}
