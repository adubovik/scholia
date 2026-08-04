import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ReadingSettings } from "@/components/ReadingSettings";
import { STORAGE_KEY } from "@/lib/reading/prefs";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("style");
});

function openSheet() {
  const view = render(<ReadingSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Display settings" }));
  return view;
}

describe("ReadingSettings", () => {
  it("opens the sheet with five sliders", () => {
    openSheet();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getAllByRole("slider")).toHaveLength(5);
  });

  it("renders seven tick marks per slider", () => {
    const { container } = openSheet();
    // 5 controls × 7 steps
    expect(container.querySelectorAll(".aa-tick")).toHaveLength(35);
    expect(screen.getByRole("slider", { name: "Size" })).toHaveProperty("max", "6");
  });

  it("applies a slider change to the CSS var and persists it", () => {
    openSheet();
    fireEvent.change(screen.getByRole("slider", { name: "Size" }), { target: { value: "6" } });
    expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe("1.25rem");
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).size).toBe(6);
  });

  it("resets to defaults (the slider centres) and clears storage", () => {
    openSheet();
    fireEvent.change(screen.getByRole("slider", { name: "Size" }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    // default size index 3 (centre) → "1.0625rem"
    expect(document.documentElement.style.getPropertyValue("--reading-font-size")).toBe("1.0625rem");
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
