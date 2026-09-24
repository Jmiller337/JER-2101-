import { expect, test, type Page } from "@playwright/test";
import { expectSpoken, openApp, openToCamera, utterances } from "./helpers";

function ndjson(...events: unknown[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

async function captureWith(page: Page, respond: Parameters<Page["route"]>[1]) {
  await page.route("**/api/read", respond);
  await page.getByRole("button", { name: "Capture" }).click();
}

test("no network: retries once, then says so and goes back to the camera", async ({ page }) => {
  await openToCamera(page);
  let attempts = 0;
  await captureWith(page, (route) => {
    attempts += 1;
    return route.abort("internetdisconnected");
  });
  await expectSpoken(page, "I couldn't reach the reading service. Check your connection, then press Capture to try again.");
  expect(attempts).toBe(2);
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
});

test("a passcode changed on the server sends the user back to the passcode screen", async ({ page }) => {
  await openToCamera(page);
  await captureWith(page, (route) => route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"unauthorized"}' }));
  await expect(page.getByRole("heading", { level: 1, name: "Enter the passcode" })).toBeVisible();
  await expectSpoken(page, "The passcode was not accepted. Please enter it again.");
});

test("a refusal is spoken and the camera comes back", async ({ page }) => {
  await openToCamera(page);
  await captureWith(page, (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson({ type: "error", code: "refusal", message: "I couldn't read this page. Try again or try another page." }),
    }),
  );
  await expectSpoken(page, "I couldn't read this page. Try again or try another page.");
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
});

test("a picture that is too large is explained", async ({ page }) => {
  await openToCamera(page);
  await captureWith(page, (route) => route.fulfill({ status: 413, contentType: "application/json", body: '{"error":"too_large"}' }));
  await expectSpoken(page, "The picture was too large to send. Please press Capture to try again.");
});

test("a photo the model cannot read is retaken without using up the page number", async ({ page }) => {
  await openToCamera(page);
  const problem = "Only the left half of the page is visible. Move the phone to the right.";
  await captureWith(page, (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson(
        { type: "meta", status: "retry", language: "en", kind: "other", title: "", problem },
        { type: "done", blocks: 0 },
      ),
    }),
  );
  await expectSpoken(page, problem);
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  // The next capture is still page 1 (the real server this time).
  await page.unroute("**/api/read");
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "A water bill from Riverside Water Utility for October" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Page 2" })).toHaveCount(0);
});

test("a server without an API key says it is not set up", async ({ page }) => {
  await openToCamera(page);
  await captureWith(page, (route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"not_configured"}' }));
  await expectSpoken(page, "The reading service is not set up correctly. The API key or passcode on the server needs checking.");
});

test("a stream cut off mid-page keeps what arrived and says the rest is missing", async ({ page }) => {
  await openToCamera(page);
  await captureWith(page, (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body: ndjson(
        { type: "meta", status: "ok", language: "en", kind: "letter", title: "A short letter" },
        { type: "block", kind: "paragraph", text: "The first paragraph arrived." },
      ),
    }),
  );
  await expect(page.getByTestId("transcript")).toContainText("The first paragraph arrived.");
  await expect(page.getByTestId("transcript")).toContainText("The rest of this page could not be read.");
  await expectSpoken(page, "I couldn't reach the reading service. Check your connection, then press Capture to try again.");
});

test("without a speech engine the app says so and uses the live region", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expect(page.getByTestId("speech-banner")).toContainText("This browser cannot speak.");
  await expect
    .poll(() => page.getByTestId("live-status").textContent())
    .toContain("Do you use VoiceOver?");
});

test("the app never speaks in VoiceOver mode, even for errors", async ({ page }) => {
  await openApp(page, { settings: { mode: "voiceOver", autoCapture: false }, passcode: true });
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  await captureWith(page, (route) => route.abort("internetdisconnected"));
  await expect
    .poll(() => page.getByTestId("live-alert").textContent())
    .toBe("I couldn't reach the reading service. Check your connection, then press Capture to try again.");
  expect(await utterances(page)).toEqual([]);
});
