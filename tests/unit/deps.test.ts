import { describe, expect, it, vi } from "vitest";
import { fakeModelEnabled } from "@/lib/server/deps";

describe("fakeModelEnabled", () => {
  it("is off unless FAKE_MODEL is exactly 1", () => {
    expect(fakeModelEnabled({})).toBe(false);
    expect(fakeModelEnabled({ FAKE_MODEL: "true" })).toBe(false);
  });

  it("is on for local runs and tests", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(fakeModelEnabled({ FAKE_MODEL: "1" })).toBe(true);
  });

  it("is refused on Vercel and on Fly.io", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(fakeModelEnabled({ FAKE_MODEL: "1", VERCEL: "1" })).toBe(false);
    expect(fakeModelEnabled({ FAKE_MODEL: "1", FLY_APP_NAME: "reader" })).toBe(false);
  });
});
