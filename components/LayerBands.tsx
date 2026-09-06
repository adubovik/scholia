"use client";

import { useState } from "react";
import type { LayerNoteView, LayerView } from "@/lib/annotations/types";
import { upsertNodeAnnotation, deleteNodeAnnotation } from "@/lib/actions/nodeAnnotations";
import { NoteEditor } from "./NoteEditor";
import { NoteMarkdown } from "./NoteMarkdown";
import { EditControl, RemoveControl, ConfirmControl, CancelControl } from "./NoteControls";
import { useLayersOptional } from "./LayerContext";

/**
 * A node's text in the selected alternative views, stacked under the original and
 * separated from it by a rule — the same stack in both reading and annotation panels.
 * Each band is washed in its view's pastel so two renditions of the same passage stay
 * told apart at a glance.
 *
 * No highlight/comment affordances live inside a band: annotations anchor to source
 * offsets, and a layer's prose is not the source. Only the original text takes marks.
 */
export function LayerBands({
  nodeId,
  layerNotes,
  canEdit,
  documentId,
}: {
  nodeId: string;
  layerNotes: LayerNoteView[];
  canEdit: boolean;
  documentId: string;
}) {
  const ctx = useLayersOptional();
  if (!ctx || ctx.selected.length === 0) return null;
  const bands = ctx.selected.filter(
    (l) =>
      layerNotes.some((n) => n.layerId === l.id) ||
      (ctx.composing?.nodeId === nodeId && ctx.composing.layerId === l.id),
  );
  if (bands.length === 0) return null;

  return (
    <div className="layer-bands">
      {bands.map((l) => (
        <LayerBand
          key={l.id}
          layer={l}
          nodeId={nodeId}
          note={layerNotes.find((n) => n.layerId === l.id) ?? null}
          canEdit={canEdit}
          documentId={documentId}
        />
      ))}
    </div>
  );
}

function LayerBand({
  layer,
  nodeId,
  note,
  canEdit,
  documentId,
}: {
  layer: LayerView;
  nodeId: string;
  note: LayerNoteView | null;
  canEdit: boolean;
  documentId: string;
}) {
  const { composing, compose, stopComposing } = useLayersOptional()!;
  // The node menu opens an editor through context ("Add summarization"); a click on ✎
  // opens one locally. Local state wins once set, so closing an editor sticks.
  const [override, setOverride] = useState<boolean | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const wanted = composing?.nodeId === nodeId && composing.layerId === layer.id;
  const editing = canEdit && (override ?? wanted);

  function close() {
    setOverride(false);
    if (wanted) stopComposing();
  }

  async function save({ note: body }: { note: string }) {
    const text = body.trim();
    if (text) await upsertNodeAnnotation({ documentId, nodeId, note: text, layerId: layer.id });
    else if (note) await deleteNodeAnnotation(note.id);
    close();
  }

  async function remove() {
    if (note) await deleteNodeAnnotation(note.id);
    close();
  }

  return (
    <div className="layer-band" data-layer-color={layer.color}>
      <span className="layer-band-name">{layer.name}</span>
      {editing ? (
        <NoteEditor
          kind="layer"
          note={note?.note ?? ""}
          tags={[]}
          color={null}
          canDelete={note !== null}
          onSave={save}
          onCancel={close}
          onDelete={remove}
        />
      ) : (
        <>
          <NoteMarkdown note={note?.note ?? ""} />
          {canEdit && (
            <span className={confirmDel ? "dual-controls dual-controls--confirm" : "dual-controls"}>
              {confirmDel ? (
                <>
                  <ConfirmControl label="Confirm delete" onClick={() => { setConfirmDel(false); remove(); }} />
                  <CancelControl label="Cancel" onClick={() => setConfirmDel(false)} />
                </>
              ) : (
                <>
                  <EditControl label={`Edit ${layer.name}`} onClick={() => { setOverride(true); compose(nodeId, layer.id); }} />
                  {note && <RemoveControl label={`Delete ${layer.name}`} onClick={() => setConfirmDel(true)} />}
                </>
              )}
            </span>
          )}
        </>
      )}
    </div>
  );
}
