import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InviteSettings } from "@/components/InviteSettings";
import type { InviteView } from "@/lib/data/invites";

const createInvite = vi.fn(async () => ({ token: "tok-123" }));
const revokeInvite = vi.fn<(id: string) => Promise<void>>(async () => {});
vi.mock("@/lib/actions/invites", () => ({
  createInvite: () => createInvite(),
  revokeInvite: (id: string) => revokeInvite(id),
}));

const writeText = vi.fn(async () => {});
beforeEach(() => {
  createInvite.mockClear();
  revokeInvite.mockClear();
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
});

function open(invites: InviteView[] = []) {
  render(<InviteSettings invites={invites} />);
  fireEvent.click(screen.getByRole("button", { name: "Invite people" }));
}

describe("InviteSettings", () => {
  it("generates a link and copies its full URL", async () => {
    open();
    fireEvent.click(screen.getByText("Generate invite link"));
    // The generated URL appears once the action resolves.
    const url = await screen.findByText(`${window.location.origin}/invite/tok-123`);
    expect(url).toBeDefined();
    expect(createInvite).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByText("Copy"));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/tok-123`);
    expect(await screen.findByText("Copied")).toBeDefined();
  });

  it("shows Revoke only for pending invites", () => {
    open([
      { id: "1", token: "aaaaaaaa", email: null, status: "pending", createdAt: new Date(), redeemedAt: null },
      { id: "2", token: "bbbbbbbb", email: "x@y.z", status: "accepted", createdAt: new Date(), redeemedAt: new Date() },
    ]);
    expect(screen.getAllByText("Revoke")).toHaveLength(1);
    fireEvent.click(screen.getByText("Revoke"));
    expect(revokeInvite).toHaveBeenCalledWith("1");
  });
});
