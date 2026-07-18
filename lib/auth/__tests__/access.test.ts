import { describe, it, expect } from "vitest";
import { canCreateInvites, hasAccess } from "@/lib/auth/access";
import type { CurrentUser } from "@/lib/auth/current-user";

const base: CurrentUser = { id: "u", displayName: "U", isAdmin: false, status: "pending", canInvite: false };

describe("hasAccess", () => {
  it("admin always has access, regardless of status", () => {
    expect(hasAccess({ ...base, isAdmin: true, status: "pending" })).toBe(true);
  });
  it("active member has access", () => {
    expect(hasAccess({ ...base, status: "active" })).toBe(true);
  });
  it("pending non-admin has no access", () => {
    expect(hasAccess(base)).toBe(false);
  });
});

describe("canCreateInvites (delegation seam)", () => {
  it("admin can invite", () => {
    expect(canCreateInvites({ ...base, isAdmin: true })).toBe(true);
  });
  it("ordinary active member cannot invite yet", () => {
    expect(canCreateInvites({ ...base, status: "active" })).toBe(false);
  });
  it("member with delegated canInvite can invite", () => {
    expect(canCreateInvites({ ...base, status: "active", canInvite: true })).toBe(true);
  });
});
