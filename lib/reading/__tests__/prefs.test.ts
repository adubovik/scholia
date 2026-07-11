import { describe, it, expect, beforeEach } from "vitest";
import {
  STORAGE_KEY, DEFAULT_INDICES,
  stepsToVars, clampIndices, readStoredIndices, writeStoredIndices,
  clearStoredIndices, preloadScript,
} from "@/lib/reading/prefs";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

describe("stepsToVars", () => {
  it("maps default indices to the current literals", () => {
    expect(stepsToVars(DEFAULT_INDICES)).toEqual({
      "--reading-font-size": "1.1875rem",
      "--reading-line-height": "1.72",
      "--reading-word-spacing": "0em",
      "--reading-block-gap": "1.15rem",
      "--reading-measure": "44rem",
    });
  });
  it("maps the top size index to the largest step", () => {
    expect(stepsToVars({ ...DEFAULT_INDICES, size: 7 })["--reading-font-size"]).toBe("1.4375rem");
  });
});

describe("clampIndices", () => {
  it("returns defaults for garbage input", () => {
    expect(clampIndices(null)).toEqual(DEFAULT_INDICES);
    expect(clampIndices({ size: 99, line: -1, word: "x" })).toEqual(DEFAULT_INDICES);
  });
  it("keeps in-range integers", () => {
    expect(clampIndices({ ...DEFAULT_INDICES, block: 4 }).block).toBe(4);
  });
});

describe("storage round-trip", () => {
  it("writes then reads clamped indices", () => {
    writeStoredIndices({ ...DEFAULT_INDICES, width: 0 });
    expect(readStoredIndices().width).toBe(0);
  });
  it("reads defaults when empty", () => {
    expect(readStoredIndices()).toEqual(DEFAULT_INDICES);
  });
  it("clears storage", () => {
    writeStoredIndices({ ...DEFAULT_INDICES, width: 0 });
    clearStoredIndices();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("preloadScript", () => {
  it("applies stored vars to documentElement", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_INDICES, size: 7 }));
    // eslint-disable-next-line no-eval
    eval(preloadScript());
    expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe("1.4375rem");
  });
  it("references the storage key", () => {
    expect(preloadScript()).toContain(STORAGE_KEY);
  });
  it("falls back to default for a non-integer stored index", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_INDICES, size: 1.5 }));
    // eslint-disable-next-line no-eval
    eval(preloadScript());
    // default size index 3 → "1.1875rem"; must not be "undefined"
    expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe("1.1875rem");
  });
});
