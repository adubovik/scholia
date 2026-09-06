import type { Metadata } from "next";
import { ReadingSurface } from "@/components/ReadingSurface";
import type { TreeNode } from "@/lib/tree/build";
import type { Color, InlineAnnotationView, NodeAnnotationView } from "@/lib/annotations/types";

export const metadata: Metadata = { title: "Scholia · Demo" };

// A public, storage-free tour of every reading feature: a nested tree with compound
// section ids, coloured + overlapping highlights, node and inline notes, the three
// glyph marks (≡ ? !), #tags, and §-cross-references — all built in memory, no DB,
// no auth. Rendered read-only (canEdit=false), so no mutation path is reachable
// (see NodeMenu/DualNodeSection: every server action is canEdit-gated). Route made
// public in proxy.ts; owner-only chrome (edit/delete/export, the library link) is
// gated on the /demo path in DocInfo/LibraryDrawer.

const DOC_ID = "demo";
const SOURCE_ID = "demo-src";
const AT = "2025-01-15T09:00:00.000Z";

let seq = 0;
/** Highlight a `phrase` within a node's `text`. Offsets are node-local because every
 *  demo node uses startOffset 0 (splitSpans/toDual clamp against the node's own start). */
function hl(text: string, phrase: string, o: { color: Color; note?: string; tags?: string[] }): InlineAnnotationView {
  const startOffset = text.indexOf(phrase);
  if (startOffset < 0) throw new Error(`demo seed: phrase not found — "${phrase}"`);
  return {
    id: `demo-ann-${++seq}`,
    startOffset,
    endOffset: startOffset + phrase.length,
    color: o.color,
    note: o.note ?? null,
    tags: o.tags ?? [],
    authorId: DOC_ID,
    createdAt: AT,
  };
}

function nodeNote(nodeId: string, note: string, tags: string[] = []): NodeAnnotationView {
  return { id: `demo-note-${nodeId}`, nodeId, note, tags, authorId: DOC_ID, createdAt: AT };
}

function node(n: Partial<TreeNode> & { id: string }): TreeNode {
  return {
    label: null, alias: null, title: null, text: "", sourceId: SOURCE_ID, startOffset: 0,
    annotations: [], layerNotes: [], nodeAnnotation: null, children: [],
    ...n,
  };
}

// The text — Marcus Aurelius, Meditations (tr. George Long, public domain).
const t21 =
  "Begin the morning by saying to thyself, I shall meet with the busybody, the ungrateful, arrogant, deceitful, envious, unsocial. All these things happen to them by reason of their ignorance of what is good and evil. But I who have seen the nature of the good that it is beautiful, and of the bad that it is ugly, cannot be injured by any of them.";
const t22 =
  "Whatever this is that I am, it is a little flesh and breath, and the ruling part. Throw away thy books; no longer distract thyself: it is not allowed; but as if thou wast now dying, despise the flesh; it is blood and bones and a network.";
const t23 =
  "All that is from the gods is full of Providence. That which is from fortune is not separated from nature, nor is it without an interweaving with the things which are ordered by Providence.";
const t31 =
  "We ought to consider not only that our life is daily wasting away and a smaller part of it is left, but this also, that if a man should live longer, it is quite uncertain whether the understanding will still continue sufficient.";

// alias "II"/"III" is the token each Book lends its sections, so a section reads as the
// compound id II.1 (full) / 1 (short) — the Display-settings section-ids toggle picks.
const tree: TreeNode[] = [
  node({
    id: "b2", label: "II", alias: "II", title: "Book II",
    children: [
      node({
        id: "b2s1", label: "1", text: t21,
        // Node note: attaches to the whole block (red section number) with a ≡ summary glyph.
        nodeAnnotation: nodeNote(
          "b2s1",
          "A **premeditatio malorum**: Marcus rehearses the day's difficult people at dawn so none can surprise him into anger.",
          [":summary", "stoicism"],
        ),
        annotations: [
          // Two overlapping highlights (both cover "arrogant") — the layered underline is splitSpans at work.
          hl(t21, "busybody, the ungrateful, arrogant", {
            color: "pink",
            note: "Naming the vices he expects to meet is itself the discipline — catalogued, they lose their power to provoke.",
            tags: [":insight", "stoicism"],
          }),
          hl(t21, "arrogant, deceitful, envious, unsocial", { color: "yellow" }), // a bare highlight, no note
          hl(t21, "ignorance of what is good and evil", {
            color: "blue",
            note: "Socratic intellectualism: wrongdoing is a failure of knowledge. Compare §II.3.",
            tags: ["ethics"],
          }),
        ],
      }),
      node({
        id: "b2s2", label: "2", text: t22,
        annotations: [
          hl(t22, "a little flesh and breath, and the ruling part", {
            color: "green",
            note: "The Stoic anatomy of a person: body, breath (*pneuma*), and the *ruling part* (hēgemonikon).",
            tags: [":question", "psychology"],
          }),
        ],
      }),
      node({
        id: "b2s3", label: "3", text: t23,
        annotations: [
          // Cross-references: §II.1 jumps to that block; §II.1_1 lights up its first highlight.
          hl(t23, "full of Providence", {
            color: "blue",
            note: "The hinge of the cross-reference demo. Compare the morning exhortation at §II.1, and its central insight at §II.1_1.",
            tags: ["providence"],
          }),
        ],
      }),
    ],
  }),
  node({
    id: "b3", label: "III", alias: "III", title: "Book III",
    children: [
      node({
        id: "b3s1", label: "1", text: t31,
        nodeAnnotation: nodeNote(
          "b3s1",
          "*Memento mori.* The turn from the quantity of time left to the quality of the mind that remains to use it.",
          ["memento-mori"],
        ),
      }),
    ],
  }),
];

export default function DemoPage() {
  return (
    <ReadingSurface
      document={{
        title: "Meditations",
        author: "Marcus Aurelius",
        sourceUrl: "https://www.gutenberg.org/ebooks/2680",
        tree,
        documentId: DOC_ID,
        createdAt: AT,
        updatedAt: AT,
      }}
      canEdit={false}
      docs={[{ id: DOC_ID, title: "Meditations", author: "Marcus Aurelius", nodeCount: 6, highlightCount: 5, noteCount: 2 }]}
      canInvite={false}
      invites={[]}
      initialLeftOpen
    />
  );
}
