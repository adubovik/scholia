"use client";

import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { indentNode, outdentNode, moveNodeUp, moveNodeDown } from "@/lib/actions/tree";
import { useCollapse } from "./CollapseContext";
import { GlyphPill } from "./GlyphPill";

// The five node actions, shared verbatim by the right-click ContextMenu (row) and
// the ⋯ DropdownMenu (hint). Radix's ContextMenu.* and DropdownMenu.* item parts
// have the same API but aren't interchangeable inside each other's Content, so the
// concrete Item/Separator components are passed in by each host.
type MenuProps = {
  nodeId: string;
  canEdit: boolean;
  hasNote: boolean;
  hasChildren: boolean;
  onOpenNote: () => void;
  onCollapseChildren: () => void;
  onExpandChildren: () => void;
};

type ItemParts = {
  Item: typeof ContextMenu.Item;
  Separator: typeof ContextMenu.Separator;
};

// Shortcut hint: visual only (aria-hidden so it doesn't pollute the item's
// accessible name), paired with aria-keyshortcuts on the item for AT.
function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="node-menu-key" aria-hidden>
      {children}
    </kbd>
  );
}

export function MenuItems({
  nodeId, canEdit, hasNote, hasChildren,
  onOpenNote, onCollapseChildren, onExpandChildren,
  Item, Separator,
}: MenuProps & ItemParts) {
  return (
    <>
      {canEdit && (
        <>
          <Item className="node-menu-item" aria-keyshortcuts="Alt+ArrowUp" onSelect={() => moveNodeUp(nodeId)}>
            <span className="node-menu-label">Move up</span><Key>⌥↑</Key>
          </Item>
          <Item className="node-menu-item" aria-keyshortcuts="Alt+ArrowDown" onSelect={() => moveNodeDown(nodeId)}>
            <span className="node-menu-label">Move down</span><Key>⌥↓</Key>
          </Item>
          <Item className="node-menu-item" aria-keyshortcuts="Alt+[" onSelect={() => outdentNode(nodeId)}>
            <span className="node-menu-label">Outdent</span><Key>⌥[</Key>
          </Item>
          <Item className="node-menu-item" aria-keyshortcuts="Alt+]" onSelect={() => indentNode(nodeId)}>
            <span className="node-menu-label">Indent</span><Key>⌥]</Key>
          </Item>
        </>
      )}
      {hasChildren && (
        <>
          {canEdit && <Separator className="node-menu-sep" />}
          <Item className="node-menu-item" onSelect={onCollapseChildren}>
            <span className="node-menu-label">Collapse children</span>
          </Item>
          <Item className="node-menu-item" onSelect={onExpandChildren}>
            <span className="node-menu-label">Expand children</span>
          </Item>
        </>
      )}
      {canEdit && (
        <>
          <Separator className="node-menu-sep" />
          <Item className="node-menu-item" onSelect={onOpenNote}>
            <span className="node-menu-label">{hasNote ? "Edit note" : "Add note"}</span>
          </Item>
        </>
      )}
    </>
  );
}

// Right-click / long-press anywhere on the wrapped node content opens the menu.
// Wraps only the node's OWN head+passage (not its children) so nested triggers
// never fight over one contextmenu event.
export function NodeContextMenu({
  children,
  onOpenChange,
  ...menu
}: MenuProps & { children: ReactNode; onOpenChange?: (open: boolean) => void }) {
  return (
    <ContextMenu.Root onOpenChange={onOpenChange}>
      {/* stopPropagation so a right-click on the node opens THIS menu, not the
          document-level RootMenu that wraps the whole reading canvas. */}
      <ContextMenu.Trigger asChild onContextMenu={(e) => e.stopPropagation()}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="node-menu" collisionPadding={8}>
          <MenuItems {...menu} Item={ContextMenu.Item} Separator={ContextMenu.Separator} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

// Editor keyboard shortcuts, active while the ⋯ hint is focused ("engaged"), so
// normal Tab traversal is untouched everywhere else. Bindings are chosen to avoid
// browser conflicts: Alt+↑/↓ move (VS Code's move-line), Alt+[ / Alt+] out/indent
// (mnemonic, no browser nav binding). Brackets keyed off e.code so macOS Option
// special-chars ("“ / ‘") don't mask them. preventDefault also stops Radix's own
// Arrow-to-open (its composed handler skips when defaultPrevented).
function onHintKeyDown(nodeId: string, canEdit: boolean) {
  return (e: React.KeyboardEvent) => {
    if (!canEdit || !e.altKey) return; // editor-only; let Radix handle plain keys
    let action: (() => void) | null = null;
    if (e.key === "ArrowUp") action = () => moveNodeUp(nodeId);
    else if (e.key === "ArrowDown") action = () => moveNodeDown(nodeId);
    else if (e.code === "BracketRight") action = () => indentNode(nodeId);
    else if (e.code === "BracketLeft") action = () => outdentNode(nodeId);
    if (action) {
      e.preventDefault();
      action();
    }
  };
}

/** "·20" — how many direct children a section has, trailing its number. Rendered
 * *inside* the identifier so it inherits the serif/tabular treatment and so the
 * run-in margin still separates the whole thing from the prose; only the colour is
 * stepped back. Omitted below two: a lone child tells the reader nothing. */
export function ChildCount({ n }: { n: number }) {
  return n > 1 ? <span className="node-num-count">·{n}</span> : null;
}

// The section identifier. Left-click highlights the node's note (if it has one);
// the node menu now lives on right-click only (NodeContextMenu wraps this). Editor
// keyboard shortcuts stay bound here so a focused number can still move/indent.
// `annotated` flips it red; `runIn` styles it as an inline paragraph prefix.
export function NodeNumber({
  number,
  childCount,
  annotated,
  runIn,
  nodeId,
  canEdit,
  glyphs = [],
  onHighlightNote,
}: {
  number: string;
  childCount: number;
  annotated: boolean;
  runIn?: boolean;
  nodeId: string;
  canEdit: boolean;
  glyphs?: string[]; // node-note preset marks; rendered inline right after the number
  onHighlightNote?: () => void; // present only when the node has a note
}) {
  return (
    <button
      type="button"
      className={runIn ? "node-num-id node-num-id--runin" : "node-num-id"}
      data-annotated={annotated || undefined}
      aria-label={onHighlightNote ? "Highlight note" : "Section actions"}
      onClick={onHighlightNote}
      onKeyDown={onHintKeyDown(nodeId, canEdit)}
    >
      {number}
      <ChildCount n={childCount} />
      {glyphs.length > 0 && <GlyphPill glyphs={glyphs} className="glyph-pill--inline" />}
    </button>
  );
}

// Right-click on empty reading space (outside any node) targets the invisible
// top-level: Collapse/Expand children folds or unfolds the entire document.
// `allIds` is every node id in the tree; node triggers stopPropagation so a
// right-click on a node opens its own menu instead of this one.
export function RootMenu({ allIds, children }: { allIds: string[]; children: ReactNode }) {
  const { setMany } = useCollapse();
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="reading-canvas">{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="node-menu" collisionPadding={8}>
          <ContextMenu.Item className="node-menu-item" onSelect={() => setMany(allIds, true)}>
            <span className="node-menu-label">Collapse children</span>
          </ContextMenu.Item>
          <ContextMenu.Item className="node-menu-item" onSelect={() => setMany(allIds, false)}>
            <span className="node-menu-label">Expand children</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
