export type Listener = () => void;

/**
 * A minimal observable value for `useSyncExternalStore`. Plain TypeScript classes own the app's
 * state; React components only subscribe.
 */
export class Store<T> {
  private value: T;
  private readonly listeners = new Set<Listener>();

  constructor(initial: T) {
    this.value = initial;
  }

  get = (): T => this.value;

  set = (next: T | ((prev: T) => T)): void => {
    const value = typeof next === "function" ? (next as (prev: T) => T)(this.value) : next;
    if (Object.is(value, this.value)) return;
    this.value = value;
    for (const listener of [...this.listeners]) listener();
  };

  /** Shallow-merges a patch into an object value. */
  update = (patch: Partial<T>): void => {
    this.set((prev) => ({ ...prev, ...patch }));
  };

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
