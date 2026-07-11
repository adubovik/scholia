import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReadingSettings } from "@/components/ReadingSettings";
import { STORAGE_KEY } from "@/lib/reading/prefs";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

function openSheet() {
  render(<ReadingSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Display settings" }));
}

describe("ReadingSettings", () => {
  it("opens the sheet with five sliders", () => {
    openSheet();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getAllByRole("slider")).toHaveLength(5);
  });

  it("applies a slider change to the CSS var and persists it", () => {
    openSheet();
    fireEvent.change(screen.getByRole("slider", { name: "Size" }), { target: { value: "4" } });
    expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe("1.4rem");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).size).toBe(4);
  });

  it("resets to defaults and clears storage", () => {
    openSheet();
    fireEvent.change(screen.getByRole("slider", { name: "Size" }), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe("1.1875rem");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("closes on Escape", () => {
    openSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("moves focus into the sheet (the Close button) when opened", () => {
    openSheet();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("returns focus to the trigger when closed with Escape", () => {
    openSheet();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Display settings" }));
  });
});
