"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { TreeNode } from "@/lib/tree/build";
import { firstSentence } from "@/lib/tree/firstSentence";
import { fromMarkup, isMarkupEditable, toMarkup } from "@/lib/annotations/markup";
import { deleteNode, updateNodeText } from "@/lib/actions/tree";

/** True when this passage's prose can be edited: it needs a source range to write into
 *  (a node without one has nothing to anchor to), and its highlights must be writable as
 *  markup (none overlapping, none running past the node). Empty text is fine and means
 *  "add" rather than "edit" — that is how a bodyless section gets prose of its own. */
export function canEditText(node: TreeNode): boolean {
  return (
    Boolean(node.sourceId) &&
    isMarkupEditable(node.annotations, node.startOffset, node.startOffset + node.text.length)
  );
}

// Both sheets: Radix Dialog for the focus trap and Esc, .aa-backdrop for the wash
// (which insets itself by the open drawers), .node-sheet for the geometry.
function Sheet({
  label,
  onClose,
  children,
  wide,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="aa-backdrop" />
        <Dialog.Content
          className={wide ? "node-sheet node-sheet--wide" : "node-sheet"}
          aria-label={label}
          aria-describedby={undefined}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Edit a passage's prose. The text is shown with its highlights wrapped in the bracket
 * markup (lib/annotations/markup.ts) so they travel with the words they mark: move a
 * phrase and its highlight moves. The marker set is fixed — adding and removing
 * highlights is the selection popover's job — so the parse is run on every keystroke
 * and Save stays shut until it comes back clean.
 */
export function EditTextSheet({ node, number, onClose }: { node: TreeNode; number: string; onClose: () => void }) {
  const marks = node.annotations.length;
  // A bodyless section — a container whose range is empty — opens the same sheet on a
  // blank textarea: the prose it takes is inserted at that point and becomes its own.
  const adding = node.text === "";
  const [value, setValue] = useState(() => toMarkup(node.text, node.startOffset, node.annotations));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const parsed = fromMarkup(value, marks);
  const empty = parsed.ok && parsed.text.trim().length === 0;
  // Blank always keeps Save shut, but only *say* something when there was prose to lose
  // — an add starts blank, and scolding someone before they've typed is noise.
  const error = failed ?? (parsed.ok ? (empty && !adding ? "The passage can't be left empty — use Delete instead." : null) : parsed.error);

  async function save() {
    if (!parsed.ok || empty || busy) return;
    setBusy(true);
    setFailed(null);
    try {
      await updateNodeText(node.id, value);
      onClose();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Could not save the text");
      setBusy(false);
    }
  }

  return (
    <Sheet label={adding ? `Add text to section ${number}` : `Edit passage ${number}`} onClose={onClose} wide>
      <div className="newdoc-head">
        <div>
          <p className="import-eyebrow">{adding ? `Section ${number}` : `Passage ${number}`}</p>
          <h2 className="newdoc-title">{adding ? "Add the text" : "Edit the text"}</h2>
        </div>
        <button type="button" className="glyph" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="newdoc-rule" />
      {adding && (
        <p className="node-sheet-hint">
          This section has no prose of its own yet — only its subsections. What you write
          here becomes its own passage, leading them.
        </p>
      )}
      {marks > 0 && (
        <p className="node-sheet-hint">
          <code>[phrase][1]</code> is a highlight — the brackets say where it sits, so moving or
          rewriting the phrase carries it along. All {marks === 1 ? "one marker" : `${marks} markers`} must
          come back exactly once: highlights are added and removed by selecting text, not here.
        </p>
      )}
      <textarea
        className="textarea node-sheet-text"
        value={value}
        onChange={(e) => { setValue(e.target.value); setFailed(null); }}
        aria-label="Passage text"
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      <div className="note-actions">
        <button className="btn" type="button" onClick={save} disabled={busy || empty || Boolean(error)}>Save</button>
        <button className="link-btn" type="button" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}

/**
 * The confirm before removing a section. Names everything that goes — the passage, its
 * highlights, its note — and says where the children land, because that is the part
 * that isn't obvious: they move up under this node's parent rather than following it.
 */
export function DeleteNodeSheet({ node, number, onClose }: { node: TreeNode; number: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const kids = node.children.length;
  const marks = node.annotations.length;
  const quote = firstSentence(node.text);
  const lost = [
    marks > 0 && `${marks} highlight${marks === 1 ? "" : "s"}`,
    node.nodeAnnotation && "its note",
    node.layerNotes.length > 0 && `${node.layerNotes.length} view text${node.layerNotes.length === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[];

  async function confirm() {
    setBusy(true);
    setFailed(null);
    try {
      await deleteNode(node.id);
      onClose();
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Could not delete the section");
      setBusy(false);
    }
  }

  return (
    <Sheet label={`Delete section ${number}`} onClose={onClose}>
      <div className="newdoc-head">
        <div>
          <p className="import-eyebrow node-sheet-warn">Permanent · cannot be undone</p>
          <h2 className="newdoc-title">Delete section {number}?</h2>
        </div>
        <button type="button" className="glyph" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="newdoc-rule" />
      {node.text && (
        <p className="node-sheet-quote">
          {quote}
          {quote.length < node.text.trim().length ? "…" : ""}
        </p>
      )}
      <p className="node-sheet-hint">
        {lost.length > 0
          ? `The passage goes, and with it ${lost.join(", ")}. `
          : "The passage goes for good. "}
        {kids > 0 &&
          `Its ${kids === 1 ? "one subsection moves" : `${kids} subsections move`} up a level, into the slot it leaves behind.`}
      </p>
      {failed && <p className="error">{failed}</p>}
      <div className="note-actions">
        <button className="btn btn--danger" type="button" onClick={confirm} disabled={busy}>
          Delete section
        </button>
        <button className="link-btn" type="button" onClick={onClose} autoFocus>Cancel</button>
      </div>
    </Sheet>
  );
}
