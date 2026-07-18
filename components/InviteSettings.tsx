"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { createInvite, revokeInvite } from "@/lib/actions/invites";
import type { InviteView } from "@/lib/data/invites";

// Radix handles focus-trap / Esc / portal; the existing .aa-* classes give the
// parchment sheet look, consistent with ReadingSettings.
export function InviteSettings({ invites }: { invites: InviteView[] }) {
  // Controlled open state: createInvite's revalidatePath refreshes the route,
  // which would reset an uncontrolled Radix dialog and close it mid-action.
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null); // last generated
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlFor = (t: string) => `${window.location.origin}/invite/${t}`;

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await createInvite();
      setToken(res.token);
      setCopied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create invite");
    } finally {
      setBusy(false);
    }
  }

  async function copy(t: string) {
    await navigator.clipboard.writeText(urlFor(t));
    setCopied(true);
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await revokeInvite(id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="btn btn--ghost" aria-label="Invite people">⚙</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="aa-backdrop" />
        <Dialog.Content className="aa-sheet invite-dialog" aria-describedby={undefined}>
          <div className="aa-head">
            <Dialog.Title className="aa-eyebrow">Invite people</Dialog.Title>
            <Dialog.Close className="glyph" aria-label="Close">✕</Dialog.Close>
          </div>

          <button className="btn" onClick={generate} disabled={busy}>
            Generate invite link
          </button>

          {error && <p className="invite-error">{error}</p>}

          {token && (
            <div className="invite-new">
              <code className="invite-url">{urlFor(token)}</code>
              <button className="btn btn--ghost" onClick={() => copy(token)}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}

          <ul className="invite-list">
            {invites.length === 0 && <li className="invite-empty">No invites yet.</li>}
            {invites.map((inv) => (
              <li key={inv.id} className="invite-row">
                <span className="invite-status" data-status={inv.status}>
                  {inv.status}
                </span>
                <span className="invite-label">{inv.email ?? `${inv.token.slice(0, 8)}…`}</span>
                {inv.status === "pending" && (
                  <button className="btn btn--ghost" onClick={() => revoke(inv.id)} disabled={busy}>
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
