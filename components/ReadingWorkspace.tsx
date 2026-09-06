"use client";

import { useEffect, useState } from "react";
import { NodeSection } from "./NodeSection";
import { AnnotationPanel } from "./AnnotationPanel";
import { SelectionPopover } from "./SelectionPopover";
import { CollapseProvider } from "./CollapseContext";
import { RootMenu } from "./NodeMenu";
import { NotesProvider, CentredPanel } from "./NotesContext";
import { LayerProvider } from "./LayerContext";
import { LayerBar } from "./LayerBar";
import { LayerModal } from "./LayerModal";
import { SideDrawer } from "./SideDrawer";
import { LibraryDrawer, type LibraryDoc } from "./LibraryDrawer";
import { ReadingChrome } from "./ReadingChrome";
import type { DocMeta } from "./DocInfo";
import type { NoteEntry } from "@/lib/annotations/entries";
import type { InviteView } from "@/lib/data/invites";
import type { TreeNode } from "@/lib/tree/build";
import type { DualNode, SectionTarget } from "@/lib/tree/dual";
import type { LayerView } from "@/lib/annotations/types";

const DUAL_KEY = "scholia:dualMode";

/**
 * The reading workspace. Owns the reading-first ↔ annotation-first toggle, which
 * *swaps the two panels between the centre and the drawer*. Both render as foldable
 * trees in the reading typeface. New inline annotations are created only while reading
 * is centred (the selection popover lives there); everything else about annotations —
 * compose, edit, tags/glyphs/colour, filtering — happens in the annotation tree.
 */
export function ReadingWorkspace({
  reading,
  dual,
  sections,
  meta,
  title,
  documentId,
  canEdit,
  docs,
  currentId,
  canInvite,
  invites,
  initialLeftOpen,
  layers,
}: {
  reading: { tree: TreeNode[]; numbers: Map<string, string>; numbersShort: Map<string, string>; entries: NoteEntry[]; allIds: string[] };
  dual: { tree: DualNode[] };
  sections: Record<string, SectionTarget>;
  meta?: DocMeta;
  title?: string;
  documentId?: string;
  canEdit: boolean;
  docs: LibraryDoc[];
  currentId: string | null;
  canInvite: boolean;
  invites: InviteView[];
  initialLeftOpen: boolean;
  layers: LayerView[]; // the document's alternative renditions (the view bar)
}) {
  // Default reading-first (SSR-safe); mirror the stored choice after mount.
  const [dualMode, setDualMode] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration mirror of stored pref
    if (localStorage.getItem(DUAL_KEY) === "1") setDualMode(true);
  }, []);
  function toggleMode() {
    setDualMode((v) => {
      const next = !v;
      localStorage.setItem(DUAL_KEY, next ? "1" : "0");
      return next;
    });
  }

  const hasDoc = Boolean(meta && documentId);

  // The reading prose as a tree. Centre gets edit chrome (RootMenu) + the selection
  // popover; the drawer copy is read-only reference. data-panel scopes cross-panel scroll.
  const readingPanel = (centre: boolean) => (
    <div className="reading" id={centre ? "reading-root" : undefined} data-panel="reading">
      <CollapseProvider>
        {centre && canEdit ? (
          <RootMenu allIds={reading.allIds}>
            {reading.tree.map((n) => (
              <NodeSection key={n.id} node={n} depth={0} canEdit={canEdit} documentId={documentId!} numbers={reading.numbers} numbersShort={reading.numbersShort} />
            ))}
          </RootMenu>
        ) : (
          reading.tree.map((n) => (
            <NodeSection key={n.id} node={n} depth={0} canEdit={false} documentId={documentId!} numbers={reading.numbers} numbersShort={reading.numbersShort} />
          ))
        )}
      </CollapseProvider>
      {centre && canEdit && <SelectionPopover documentId={documentId!} rootId="reading-root" />}
    </div>
  );

  const annotationPanel = <AnnotationPanel nodes={dual.tree} canEdit={canEdit} documentId={documentId!} />;

  return (
    <NotesProvider entries={reading.entries} sections={sections} initialLeftOpen={initialLeftOpen}>
      <LayerProvider layers={layers}>
        <LibraryDrawer docs={docs} currentId={currentId} canInvite={canInvite} invites={invites} />

        {hasDoc ? (
          <>
            <ReadingChrome title={title} meta={meta} dualMode={dualMode} onToggleMode={toggleMode}>
              <CentredPanel>
                {/* The view selector rides above whichever panel is centred. */}
                <LayerBar dualMode={dualMode} canEdit={canEdit} />
                {dualMode ? annotationPanel : readingPanel(true)}
              </CentredPanel>
            </ReadingChrome>

            <SideDrawer title={dualMode ? "Original" : "Notes"}>
              {dualMode ? readingPanel(false) : annotationPanel}
            </SideDrawer>

            <LayerModal documentId={documentId!} />
          </>
        ) : (
          <ReadingChrome>
            <div className="reading-blank">
              <span className="reading-blank-fleuron" aria-hidden>❦</span>
              <p className="reading-blank-line">No text open.</p>
              <p className="reading-blank-hint">Pick a text from the library, or add a new one.</p>
            </div>
          </ReadingChrome>
        )}
      </LayerProvider>
    </NotesProvider>
  );
}
