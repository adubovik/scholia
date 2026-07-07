# Sharing, Accounts & Roles

Status: **Approved** · Date: 2026-07-07

Collaboration is **async** (no real-time co-editing in V1) and **signed-in**
(no anonymous commenting).

## Accounts

- **Cloud accounts from day one.**
- **Auth:** Google OAuth + email magic link. _(Assumption locked at approval;
  revisit only if a reason appears.)_
- Commenters **must sign in** — every annotation and comment has a real identity,
  which keeps threaded discussion and any future moderation trustworthy.

## Sharing model

- The owner shares a **document**. The owner's **tree is canonical** and is the
  fixed backdrop for everyone.
- Sharing grants access to signed-in people (by invite/link-to-account).

## Roles

| Role | Read | Add own inline/node annotations | Reply in threads | Edit the tree |
|------|:----:|:-------------------------------:|:----------------:|:-------------:|
| **Owner** | ✓ | ✓ | ✓ | ✓ |
| **Collaborator** | ✓ | ✓ | ✓ | ✗ |

- **Collaborators are "comment-only on your canonical tree":** they can layer
  their own inline and node annotations and participate in threads, but they
  **cannot alter the tree structure**. Structure stays owner-only.
- This gives a clean ownership story: one canonical structure, many annotation
  layers on top.

## Authorship & the collaborative layer

- All collaborators' annotations are visible together (the collaborative layer).
- The view is **filterable by author** (e.g. "just mine", "just Anna's",
  "everyone").
- Others' highlights carry a **subtle author marker** so ownership is legible
  without breaking the austere look.

## Deferred (post-V1)

- **Real-time co-editing** (live cursors/presence, CRDT/websockets).
- Fine-grained per-person roles beyond owner/collaborator (e.g. a distinct
  "editor" who can restructure).
- Moderation tooling.
