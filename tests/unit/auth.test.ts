import { describe, expect, it } from "vitest";
import { bearerToken, checkRequest, originAllowed, passcodeMatches } from "@/lib/server/auth";
import type { ServerEnv } from "@/lib/server/config";

const env: ServerEnv = {
  passcode: "correct horse",
  hasApiKey: true,
  readModel: "m",
  askModel: "m",
  extraAllowedHosts: ["reader.example.dev"],
};

function request(headers: Record<string, string>): Request {
  return new Request("http://app.test/api/auth", { method: "POST", headers });
}

describe("passcodeMatches", () => {
  it("accepts only the exact passcode", () => {
    expect(passcodeMatches("correct horse", "correct horse")).toBe(true);
    expect(passcodeMatches("correct hors", "correct horse")).toBe(false);
    expect(passcodeMatches("", "correct horse")).toBe(false);
    expect(passcodeMatches(null, "correct horse")).toBe(false);
  });
  it("rejects everything when no passcode is configured", () => {
    expect(passcodeMatches("", undefined)).toBe(false);
    expect(passcodeMatches("anything", "")).toBe(false);
  });
});

describe("bearerToken", () => {
  it("reads the token", () => {
    expect(bearerToken(request({ authorization: "Bearer abc 123" }))).toBe("abc 123");
    expect(bearerToken(request({ authorization: "bearer x" }))).toBe("x");
  });
  it("returns null for missing or malformed headers", () => {
    expect(bearerToken(request({}))).toBeNull();
    expect(bearerToken(request({ authorization: "Basic abc" }))).toBeNull();
  });
});

describe("originAllowed", () => {
  it("allows requests without an Origin header", () => {
    expect(originAllowed(request({ host: "app.test" }), env)).toBe(true);
  });
  it("allows the same host", () => {
    expect(originAllowed(request({ host: "app.test", origin: "https://app.test" }), env)).toBe(true);
  });
  it("prefers the forwarded host behind a proxy", () => {
    const req = request({ host: "internal:3000", "x-forwarded-host": "reader.fly.dev", origin: "https://reader.fly.dev" });
    expect(originAllowed(req, env)).toBe(true);
  });
  it("allows hosts listed in ALLOWED_HOSTS", () => {
    expect(originAllowed(request({ host: "internal", origin: "https://reader.example.dev" }), env)).toBe(true);
  });
  it("rejects other origins and garbage", () => {
    expect(originAllowed(request({ host: "app.test", origin: "https://evil.test" }), env)).toBe(false);
    expect(originAllowed(request({ host: "app.test", origin: "not a url" }), env)).toBe(false);
  });
});

describe("checkRequest", () => {
  it("returns null for a good request", () => {
    expect(checkRequest(request({ host: "app.test", authorization: "Bearer correct horse" }), env)).toBeNull();
  });
  it("returns 401 for a wrong passcode", () => {
    expect(checkRequest(request({ host: "app.test", authorization: "Bearer nope" }), env)?.status).toBe(401);
  });
  it("returns 403 for a foreign origin", () => {
    const req = request({ host: "app.test", origin: "https://evil.test", authorization: "Bearer correct horse" });
    expect(checkRequest(req, env)?.status).toBe(403);
  });
  it("returns 500 when no passcode is configured", () => {
    const req = request({ host: "app.test", authorization: "Bearer correct horse" });
    expect(checkRequest(req, { ...env, passcode: undefined })?.status).toBe(500);
  });
});
