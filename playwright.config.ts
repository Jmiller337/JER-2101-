import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const FAKE_VIDEO = process.env.E2E_FAKE_VIDEO ?? "tests/fixtures/camera/page-into-frame.y4m";

// Use a preinstalled Chromium when one exists at the conventional path (for example in
// sandboxed CI images); otherwise Playwright uses the browser from `npx playwright install`.
const systemChromium = process.env.PW_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const executablePath = existsSync(systemChromium) ? systemChromium : undefined;

// An iPhone-sized viewport, run in Chromium (WebKit cannot fake a camera stream).
const iphone = devices["iPhone 13"];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: iphone.viewport,
    deviceScaleFactor: iphone.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    userAgent: iphone.userAgent,
    permissions: ["camera"],
    trace: "retain-on-failure",
    launchOptions: {
      executablePath,
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${FAKE_VIDEO}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    command: `npm run build && node scripts/start-standalone.mjs`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      APP_PASSCODE: "e2e-passcode",
      // The e2e tests intercept every Anthropic-backed route in the browser, so no real key is used.
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "e2e-no-key",
    },
  },
});
