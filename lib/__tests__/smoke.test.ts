import { describe, it, expect } from "vitest";
import { appName } from "@/lib/config";

describe("config", () => {
  it("exposes the app name", () => {
    expect(appName).toBe("Scholia");
  });
});
