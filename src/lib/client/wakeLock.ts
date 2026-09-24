/**
 * Keeps the screen on while the camera or the reader is in use (PROMPT.md 6.7). The lock is
 * released by the browser whenever the page is hidden, so it is requested again when the page
 * becomes visible. Does nothing where the Screen Wake Lock API is missing.
 */
export class WakeLockManager {
  private sentinel: WakeLockSentinel | null = null;
  private wanted = false;
  private requesting = false;

  constructor() {
    if (typeof document === "undefined") return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.wanted) void this.acquire();
    });
  }

  setWanted(wanted: boolean): void {
    this.wanted = wanted;
    if (wanted) void this.acquire();
    else void this.release();
  }

  private async acquire(): Promise<void> {
    if (this.sentinel || this.requesting) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    if (document.visibilityState !== "visible") return;
    this.requesting = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      sentinel.addEventListener("release", () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
      this.sentinel = sentinel;
      if (!this.wanted) await this.release();
    } catch {
      // Refused (low battery mode, not allowed): the screen may dim, nothing else breaks.
    } finally {
      this.requesting = false;
    }
  }

  private async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;
    try {
      await sentinel?.release();
    } catch {
      // already released
    }
  }
}
