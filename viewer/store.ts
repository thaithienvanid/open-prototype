// The browser's storage, which the viewer keeps a design's comments, the views seen, and one choice in. Storage may be
// missing or refuse: then each read gives nothing and each write is skipped, and the page keeps what it has in memory.

/** The record stored under a key, read as JSON, or null when there is none or it cannot be read. */
export function readRecord(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

/** Store a record under a key, as JSON. False when the browser refused it, so the record lives in this tab alone. */
export function writeRecord(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** A choice stored as text, or null when there is none. */
export function readChoice(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeChoice(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* kept in memory */
  }
}

/** Calls `then` when another tab changes the record under a key. */
export function onOtherTab(then: (key: string | null) => void): void {
  window.addEventListener("storage", (event) => then(event.key));
}
