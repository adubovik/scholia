import { describe, it, expect, afterEach } from "vitest";
import { isDevAuth } from "@/lib/auth/mode";

const orig = { auth: process.env.SCHOLIA_AUTH, vercel: process.env.VERCEL };
afterEach(() => {
  process.env.SCHOLIA_AUTH = orig.auth;
  process.env.VERCEL = orig.vercel;
});

describe("isDevAuth", () => {
  it("is true when SCHOLIA_AUTH=dev and not on Vercel", () => {
    process.env.SCHOLIA_AUTH = "dev";
    delete process.env.VERCEL;
    expect(isDevAuth()).toBe(true);
  });
  it("is false when SCHOLIA_AUTH is unset", () => {
    delete process.env.SCHOLIA_AUTH;
    delete process.env.VERCEL;
    expect(isDevAuth()).toBe(false);
  });
  it("is false on Vercel even if SCHOLIA_AUTH=dev", () => {
    process.env.SCHOLIA_AUTH = "dev";
    process.env.VERCEL = "1";
    expect(isDevAuth()).toBe(false);
  });
});
