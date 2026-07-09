# Node Collapse + Gutter Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every node collapsible (own text → first sentence + `…`), move and enlarge the collapse triangle, and replace the node-annotation dot with a `✎` pencil grouped into the restructuring-controls cluster.

**Architecture:** All changes live in the client-side reading-surface node tree. A new pure `firstSentence` helper feeds the collapsed preview. `NodeSection` gains a flex layout with a left toggle column and unified collapse over text + children. `TreeEditControls` becomes the single always-mounted gutter cluster holding the persistent `✎` plus the editor-only, hover-revealed move/indent grid; `NodeAnnotationMarker` is deleted.

**Tech Stack:** Next.js (App Router) client components, React (`useState`), TypeScript, Vitest + `@testing-library/react`, plain CSS in `app/globals.css`.

## Global Constraints

- Test runner: `npm test` (`vitest run`); single test file via `npx vitest run <path>`.
- Test imports use the `@/` path alias (e.g. `@/lib/tree/firstSentence`).
- Project workflow: **no RED-first TDD.** Write the test and implementation together in one task, then do a single green run. Do NOT add "run to verify it fails" steps.
- Preserve existing accessible names: the note button keeps `aria-label` `"Note"` (has note) / `"Add note"` (none); the collapse toggle keeps `aria-label` `"Collapse"` / `"Expand"`.
- `✎` note control must be reachable by viewers (`canEdit === false`) and on mobile (<860px); only the move/indent grid is editor-only and hidden on mobile.
- Commit after each task.

---

### Task 1: `firstSentence` helper

**Files:**
- Create: `lib/tree/firstSentence.ts`
- Test: `lib/tree/__tests__/firstSentence.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `firstSentence(text: string): string` — text up to and including the first `.`, `!`, or `?` followed by whitespace or end-of-string; falls back to the whole trimmed string.

- [ ] **Step 1: Write the test and the implementation together**

Create `lib/tree/firstSentence.ts`:

```ts
/**
 * Return the first sentence of `text` — everything up to and including the first
 * `.`, `!`, or `?` that is followed by whitespace or the end of the string.
 * Falls back to the whole trimmed string when no such boundary exists.
 * Intentionally simple: abbreviations like "Dr." are treated as boundaries.
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/s);
  return match ? match[0] : trimmed;
}
```

Create `lib/tree/__tests__/firstSentence.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { firstSentence } from "@/lib/tree/firstSentence";

describe("firstSentence", () => {
  it("returns text up to the first period boundary", () => {
    expect(firstSentence("Hello world. Second sentence.")).toBe("Hello world.");
  });

  it("handles ! and ? boundaries", () => {
    expect(firstSentence("Really? Yes.")).toBe("Really?");
    expect(firstSentence("Stop! Go.")).toBe("Stop!");
  });

  it("returns the whole string when there is no boundary", () => {
    expect(firstSentence("no terminal punctuation")).toBe("no terminal punctuation");
  });

  it("keeps a terminal period at end of string", () => {
    expect(firstSentence("Only one.")).toBe("Only one.");
  });

  it("trims surrounding whitespace", () => {
    expect(firstSentence("  Leading. Trailing.  ")).toBe("Leading.");
  });

  it("spans newlines within the first sentence", () => {
    expect(firstSentence("Line one\nstill one. Two.")).toBe("Line one\nstill one.");
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run lib/tree/__tests__/firstSentence.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 3: Commit**

```bash
git add lib/tree/firstSentence.ts lib/tree/__tests__/firstSentence.test.ts
git commit -m "feat: add firstSentence helper for collapsed node previews"
```

---

### Task 2: Unified collapse + left/enlarged triangle in `NodeSection`

Implements design requirements 1 (unified collapse) and 2 (triangle moved left + enlarged). The `✎`/controls work is Task 3; here `TreeEditControls` is still rendered exactly as today (`{canEdit && <TreeEditControls nodeId={node.id} />}`) so this task builds and tests independently.

**Files:**
- Modify: `components/NodeSection.tsx`
- Modify: `app/globals.css` (`.node`, add `.node-toggle-col`, `.node-body`, `.node-toggle`, `.node-preview`; remove the triangle from `.node-head` markup — CSS for `.node-head` stays)
- Test: `components/__tests__/node-section.test.tsx`

**Interfaces:**
- Consumes: `firstSentence` from `@/lib/tree/firstSentence`; `TreeNode` from `@/lib/tree/build`.
- Produces: `NodeSection` renders a `.node-toggle` button (aria-label `"Collapse"`/`"Expand"`) for any node where `hasChildren || node.text`; when collapsed and the node has text, renders a `.node-preview` button instead of `SourcePassage`.

- [ ] **Step 1: Rewrite `components/NodeSection.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { TreeNode } from "@/lib/tree/build";
import { firstSentence } from "@/lib/tree/firstSentence";
import { SourcePassage } from "./SourcePassage";
import { TreeEditControls } from "./TreeEditControls";
import { NodeAnnotationMarker } from "./NodeAnnotationMarker";
import { NodeNote } from "./NodeNote";

export function NodeSection({
  node,
  depth,
  canEdit,
  documentId,
}: {
  node: TreeNode;
  depth: number;
  canEdit: boolean;
  documentId: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const hasText = Boolean(node.text);
  // Collapse now governs the node's own text AND its children, so any node with
  // text or children is collapsible — including top-level prose nodes.
  const collapsible = hasChildren || hasText;
  // Leaf prose nodes need no header chrome — the paragraph flows on its own.
  const showHead = hasChildren || Boolean(node.label) || Boolean(node.title);

  // Collapsed preview: first sentence + "…" when content is actually hidden.
  const preview = hasText ? firstSentence(node.text) : "";
  const truncated = preview.length < node.text.trim().length || hasChildren;

  return (
    <section className="node" style={{ marginLeft: depth ? "1.25rem" : undefined }} data-node-id={node.id}>
      {canEdit && <TreeEditControls nodeId={node.id} />}
      <NodeAnnotationMarker hasNote={node.nodeAnnotation !== null} onOpen={() => setNoteOpen(true)} />

      <div className="node-toggle-col">
        {collapsible && (
          <button
            className="node-toggle"
            aria-label={collapsed ? "Expand" : "Collapse"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        )}
      </div>

      <div className="node-body">
        {showHead && (
          <div className="node-head">
            {node.label && <span className="node-label">{node.label}</span>}
            {node.title && <span className="node-title">{node.title}</span>}
          </div>
        )}

        {hasText &&
          (collapsed ? (
            <button className="node-preview" onClick={() => setCollapsed(false)}>
              {preview}
              {truncated ? " …" : ""}
            </button>
          ) : (
            <SourcePassage
              text={node.text}
              sourceId={node.sourceId}
              startOffset={node.startOffset}
              annotations={node.annotations}
              canEdit={canEdit}
            />
          ))}

        {noteOpen && (
          <NodeNote
            documentId={documentId}
            nodeId={node.id}
            annotation={node.nodeAnnotation}
            canEdit={canEdit}
            onClose={() => setNoteOpen(false)}
          />
        )}

        {!collapsed && hasChildren && (
          <div className="node-children">
            {node.children.map((child) => (
              <NodeSection key={child.id} node={child} depth={depth + 1} canEdit={canEdit} documentId={documentId} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update `.node` layout in `app/globals.css`**

Replace the current line:

```css
.node { position: relative; margin-top: 1.6rem; }
```

with:

```css
.node { position: relative; margin-top: 1.6rem; display: flex; align-items: flex-start; gap: 0.35rem; }
```

Then add, immediately after the `.node:first-child { margin-top: 0; }` line:

```css
.node-toggle-col { flex: 0 0 1.1rem; display: flex; justify-content: center; padding-top: 0.1rem; }
.node-body { flex: 1 1 auto; min-width: 0; }
.node-toggle {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  padding: 0;
  transition: color 0.12s;
}
.node-toggle:hover { color: var(--ink); }
.node-preview {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: var(--muted);
  cursor: pointer;
  transition: color 0.12s;
}
.node-preview:hover { color: var(--ink); }
```

- [ ] **Step 3: Replace `components/__tests__/node-section.test.tsx`**

Replace the whole file. The original child-visibility test must now target the **parent** toggle explicitly: the child gains its own "Collapse" button (it has text), so `getByRole("button", { name: "Collapse" })` would match two elements and throw. Use `getAllByRole(...)[0]` (the parent is first in the DOM).

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NodeSection } from "@/components/NodeSection";
import type { TreeNode } from "@/lib/tree/build";

const node: TreeNode = {
  id: "a", label: "1", title: null, text: "Parent prose.", sourceId: "s1", startOffset: 0, annotations: [], nodeAnnotation: null,
  children: [{ id: "b", label: "1.1", title: null, text: "Child prose.", sourceId: "s1", startOffset: 100, annotations: [], nodeAnnotation: null, children: [] }],
};

const leaf: TreeNode = {
  id: "x", label: null, title: null, text: "First one. Second two.", sourceId: "s1",
  startOffset: 0, annotations: [], nodeAnnotation: null, children: [],
};

describe("NodeSection", () => {
  it("toggles child visibility when the parent collapse glyph is clicked", () => {
    render(<NodeSection node={node} depth={0} canEdit={false} documentId="d1" />);
    expect(screen.getByText("Child prose.")).toBeDefined();

    // Parent is first in the DOM; the child now has its own toggle too.
    fireEvent.click(screen.getAllByRole("button", { name: "Collapse" })[0]);
    expect(screen.queryByText("Child prose.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Child prose.")).toBeDefined();
  });

  it("collapses a text-only top-level node to its first sentence", () => {
    render(<NodeSection node={leaf} depth={0} canEdit={false} documentId="d1" />);
    expect(screen.getByText(/Second two\./)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText(/Second two\./)).toBeNull();
    expect(screen.getByText(/First one\./)).toBeDefined();
  });

  it("expands again when the collapsed preview is clicked", () => {
    render(<NodeSection node={leaf} depth={0} canEdit={false} documentId="d1" />);
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    fireEvent.click(screen.getByText(/First one\./));
    expect(screen.getByText(/Second two\./)).toBeDefined();
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run components/__tests__/node-section.test.tsx`
Expected: PASS (3 tests: the original child-visibility test plus the two new ones).

- [ ] **Step 5: Commit**

```bash
git add components/NodeSection.tsx app/globals.css components/__tests__/node-section.test.tsx
git commit -m "feat: unified node collapse with first-sentence preview and left triangle"
```

---

### Task 3: `✎` into controls cluster; remove `NodeAnnotationMarker`

Implements design requirement 3. `TreeEditControls` becomes the single always-mounted gutter cluster: a persistent `✎` (emphasized when a note exists) plus an editor-only, hover-revealed move/indent grid.

**Files:**
- Modify: `components/TreeEditControls.tsx`
- Modify: `components/NodeSection.tsx` (drop the marker import/usage; always mount `TreeEditControls` with the new props)
- Delete: `components/NodeAnnotationMarker.tsx`
- Modify: `app/globals.css` (rework `.tree-controls`; add `.note-pencil*`, `.tree-controls-grid*`; remove `.node-note-dot*`; adjust the `@media` rule)
- Delete: `components/__tests__/node-annotation-marker.test.tsx`
- Test: `components/__tests__/tree-edit-controls.test.tsx` (new)

**Interfaces:**
- Consumes: server actions `moveNodeUp`, `moveNodeDown`, `indentNode`, `outdentNode` from `@/lib/actions/tree`.
- Produces: `TreeEditControls({ nodeId: string; canEdit: boolean; hasNote: boolean; onOpenNote: () => void })`. Always renders the `✎` button (aria-label `"Note"` when `hasNote`, else `"Add note"`), calling `onOpenNote` on click; renders the move/indent grid only when `canEdit`.

- [ ] **Step 1: Rewrite `components/TreeEditControls.tsx`**

```tsx
"use client";

import { indentNode, outdentNode, moveNodeUp, moveNodeDown } from "@/lib/actions/tree";

export function TreeEditControls({
  nodeId,
  canEdit,
  hasNote,
  onOpenNote,
}: {
  nodeId: string;
  canEdit: boolean;
  hasNote: boolean;
  onOpenNote: () => void;
}) {
  return (
    <span className="tree-controls">
      <button
        className={hasNote ? "glyph note-pencil note-pencil--set" : "glyph note-pencil"}
        aria-label={hasNote ? "Note" : "Add note"}
        onClick={onOpenNote}
      >
        ✎
      </button>
      {canEdit && (
        <span className="tree-controls-grid">
          <button className="glyph" aria-label="Move up" onClick={() => moveNodeUp(nodeId)}>↑</button>
          <button className="glyph" aria-label="Move down" onClick={() => moveNodeDown(nodeId)}>↓</button>
          <button className="glyph" aria-label="Outdent" onClick={() => outdentNode(nodeId)}>⇤</button>
          <button className="glyph" aria-label="Indent" onClick={() => indentNode(nodeId)}>⇥</button>
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Update `components/NodeSection.tsx`**

Remove the marker import line:

```tsx
import { NodeAnnotationMarker } from "./NodeAnnotationMarker";
```

Replace these two lines:

```tsx
      {canEdit && <TreeEditControls nodeId={node.id} />}
      <NodeAnnotationMarker hasNote={node.nodeAnnotation !== null} onOpen={() => setNoteOpen(true)} />
```

with:

```tsx
      <TreeEditControls
        nodeId={node.id}
        canEdit={canEdit}
        hasNote={node.nodeAnnotation !== null}
        onOpenNote={() => setNoteOpen(true)}
      />
```

- [ ] **Step 3: Delete the old marker component and its test**

```bash
git rm components/NodeAnnotationMarker.tsx components/__tests__/node-annotation-marker.test.tsx
```

- [ ] **Step 4: Rework the gutter CSS in `app/globals.css`**

Replace the entire `.tree-controls` block (from the `/* restructure controls ... */` comment through the `@media (max-width: 860px) { .tree-controls { display: none; } }` line) with:

```css
/* Gutter controls cluster: a persistent note pencil plus an editor-only 2×2
   move/indent grid revealed on node hover. Anchored by its RIGHT edge in the
   left margin so it never overlaps the node's toggle/text. The container stays
   fully opaque so the pencil can show when a note exists (opacity compounds —
   a persistent child cannot live inside an opacity:0 box). */
.tree-controls {
  position: absolute;
  right: 100%;
  top: -0.1rem;
  margin-right: 0.6rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}
.note-pencil {
  font-size: 0.95rem;
  color: var(--muted);
  opacity: 0.45;
  padding: 0 0.2rem;
  transition: opacity 0.12s, color 0.12s;
}
.node:hover > .tree-controls .note-pencil,
.tree-controls:focus-within .note-pencil { opacity: 1; }
.note-pencil:hover { color: var(--ink); }
.note-pencil--set { color: var(--ink); opacity: 1; }
.tree-controls-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.1rem;
  padding: 0.2rem;
  background: var(--paper);
  border: 1px solid var(--rule);
  opacity: 0;
  transition: opacity 0.12s;
}
.node:hover > .tree-controls .tree-controls-grid,
.tree-controls:focus-within .tree-controls-grid { opacity: 1; }
.tree-controls-grid .glyph {
  font-size: 0.95rem;
  color: var(--muted);
  padding: 0.15rem 0.3rem;
  min-width: 1.4rem;
}
.tree-controls-grid .glyph:hover { color: var(--ink); }
/* Keep the note pencil reachable on mobile; only hide the move/indent grid. */
@media (max-width: 860px) { .tree-controls-grid { display: none; } }
```

Then delete the now-orphaned node-note-dot block (the `/* ── Node-note gutter marker ── */` comment and the `.node-note-dot`, `.node:hover > .node-note-dot`, `.node-note-dot--set`, `.node-note-dot:hover` rules).

- [ ] **Step 5: Create `components/__tests__/tree-edit-controls.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TreeEditControls } from "@/components/TreeEditControls";

describe("TreeEditControls", () => {
  it("shows an 'Add note' pencil and no move/indent controls for viewers", () => {
    render(<TreeEditControls nodeId="n1" canEdit={false} hasNote={false} onOpenNote={() => {}} />);
    expect(screen.getByRole("button", { name: "Add note" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Move up" })).toBeNull();
  });

  it("marks the pencil 'Note' and fires onOpenNote when a note exists", () => {
    const onOpenNote = vi.fn();
    render(<TreeEditControls nodeId="n1" canEdit={false} hasNote onOpenNote={onOpenNote} />);
    const pencil = screen.getByRole("button", { name: "Note" });
    expect(pencil.className).toContain("note-pencil--set");
    fireEvent.click(pencil);
    expect(onOpenNote).toHaveBeenCalledOnce();
  });

  it("renders the move/indent grid for editors", () => {
    render(<TreeEditControls nodeId="n1" canEdit hasNote={false} onOpenNote={() => {}} />);
    expect(screen.getByRole("button", { name: "Move up" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Indent" })).toBeDefined();
  });
});
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS. `node-annotation-marker.test.tsx` is gone; `tree-edit-controls.test.tsx` (3 tests) and the Task 1/Task 2 tests all pass; no other suite references the deleted marker.

- [ ] **Step 7: Commit**

```bash
git add components/TreeEditControls.tsx components/NodeSection.tsx app/globals.css components/__tests__/tree-edit-controls.test.tsx
git commit -m "feat: replace node-annotation dot with pencil in gutter controls cluster"
```

---

## Notes for the implementer

- After Task 3, do a quick manual check with `npm run dev`: a top-level prose node shows an enlarged `▾` to the left of its text; collapsing shows the first sentence + `…` and hides children; hovering the gutter reveals the `✎` (dark when a note exists) above the move/indent grid; a node with a saved note shows the `✎` dark without hovering.
- No database, schema, or server-action changes — this is presentation-only. The `db:push`/M2 drift hazard noted in project memory is not touched here.
