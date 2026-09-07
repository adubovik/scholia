"use server";

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { BatchItem } from "drizzle-orm/batch";
import type { PgColumn } from "drizzle-orm/pg-core";
import { documents, inlineAnnotations, nodes, nodeSourceRanges, paragraphs, sources } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { authorize } from "@/lib/auth/authorize";
import { normalizeText } from "@/lib/import/paragraphs";
import { fromMarkup, isMarkupEditable, markupOrder, toMarkup } from "@/lib/annotations/markup";

type NodeRow = typeof nodes.$inferSelect;

async function siblingsOf(documentId: string, parentId: string | null): Promise<NodeRow[]> {
  return db
    .select()
    .from(nodes)
    .where(and(eq(nodes.documentId, documentId), parentId === null ? isNull(nodes.parentId) : eq(nodes.parentId, parentId)))
    .orderBy(nodes.position);
}

function renumber(list: { id: string }[]) {
  return list.map((n, i) => db.update(nodes).set({ position: i }).where(eq(nodes.id, n.id)));
}

async function loadOwnedNode(nodeId: string): Promise<NodeRow> {
  const user = await requireUser();
  const [node] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
  if (!node) throw new Error("Not found");
  await authorize(user.id, node.documentId, "editTree");
  return node;
}

const touchDoc = (documentId: string) =>
  db.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, documentId));

export async function indentNode(nodeId: string): Promise<void> {
  const node = await loadOwnedNode(nodeId);
  const siblings = await siblingsOf(node.documentId, node.parentId);
  const idx = siblings.findIndex((s) => s.id === node.id);
  if (idx <= 0) return; // first among siblings → nothing to nest under

  const prev = siblings[idx - 1];
  const prevChildren = await siblingsOf(node.documentId, prev.id);
  const remaining = siblings.filter((s) => s.id !== node.id);

  await db.batch([
    db.update(nodes).set({ parentId: prev.id, position: prevChildren.length }).where(eq(nodes.id, node.id)),
    ...renumber(remaining),
    touchDoc(node.documentId),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  revalidatePath(`/d/${node.documentId}`);
}

export async function outdentNode(nodeId: string): Promise<void> {
  const node = await loadOwnedNode(nodeId);
  if (node.parentId === null) return; // already top-level

  const [parent] = await db.select().from(nodes).where(eq(nodes.id, node.parentId));
  if (!parent) throw new Error("Not found");
  const grandSiblings = await siblingsOf(node.documentId, parent.parentId);
  const oldSiblings = await siblingsOf(node.documentId, node.parentId);
  const nodeChildren = await siblingsOf(node.documentId, node.id);

  const parentIdx = grandSiblings.findIndex((s) => s.id === parent.id);
  const newOrder = [
    ...grandSiblings.slice(0, parentIdx + 1),
    node,
    ...grandSiblings.slice(parentIdx + 1),
  ];

  // To keep in-order intact, the siblings that followed node must move with it as
  // its children (appended after its existing children) — otherwise they'd stay
  // trapped under the old parent and render before node.
  const idx = oldSiblings.findIndex((s) => s.id === node.id);
  const following = oldSiblings.slice(idx + 1);
  const remaining = oldSiblings.slice(0, idx); // node left this group; followers moved out too

  // Each renumbered group has a distinct parentId, so they are disjoint — no position collision.
  await db.batch([
    db.update(nodes).set({ parentId: parent.parentId }).where(eq(nodes.id, node.id)),
    ...following.map((s, i) =>
      db.update(nodes).set({ parentId: node.id, position: nodeChildren.length + i }).where(eq(nodes.id, s.id)),
    ),
    ...renumber(newOrder),  // includes node at its new slot
    ...renumber(remaining), // compact the group it left
    touchDoc(node.documentId),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  revalidatePath(`/d/${node.documentId}`);
}

async function swap(nodeId: string, dir: -1 | 1): Promise<void> {
  const node = await loadOwnedNode(nodeId);
  const siblings = await siblingsOf(node.documentId, node.parentId);
  const idx = siblings.findIndex((s) => s.id === node.id);
  const j = idx + dir;
  if (j < 0 || j >= siblings.length) return; // at a boundary

  const other = siblings[j];
  await db.batch([
    db.update(nodes).set({ position: other.position }).where(eq(nodes.id, node.id)),
    db.update(nodes).set({ position: node.position }).where(eq(nodes.id, other.id)),
    touchDoc(node.documentId),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  revalidatePath(`/d/${node.documentId}`);
}

export async function moveNodeUp(nodeId: string): Promise<void> {
  await swap(nodeId, -1);
}

export async function moveNodeDown(nodeId: string): Promise<void> {
  await swap(nodeId, 1);
}

/**
 * Remove a node, promoting its children into its slot among its siblings — the text
 * keeps reading top to bottom, one level shallower.
 *
 * `parentId` is app-enforced rather than a DB foreign key (see schema.ts), so the
 * delete does *not* cascade to children and they can be re-pointed in the same batch.
 * What does cascade is the node's source range and its notes (real FKs on node_id).
 * Highlights do not — they anchor to source offsets, not to a node — so the ones this
 * node was rendering are dropped explicitly, or they would linger unreachable in the
 * document's counts. The source text itself is untouched: nothing renders prose that
 * no node claims, and leaving it be keeps every other offset in the document valid.
 */
export async function deleteNode(nodeId: string): Promise<void> {
  const node = await loadOwnedNode(nodeId);
  const [siblings, children, ranges] = await Promise.all([
    siblingsOf(node.documentId, node.parentId),
    siblingsOf(node.documentId, node.id),
    db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.nodeId, node.id)),
  ]);
  const idx = siblings.findIndex((s) => s.id === node.id);
  const order = [...siblings.slice(0, idx), ...children, ...siblings.slice(idx + 1)];
  const range = ranges[0];

  // touchDoc leads so the tuple has a statically known first element (db.batch is
  // typed non-empty and the reparent spread can be empty); order is otherwise free.
  await db.batch([
    touchDoc(node.documentId),
    ...children.map((c) => db.update(nodes).set({ parentId: node.parentId }).where(eq(nodes.id, c.id))),
    // Same overlap test buildTree uses to decide which highlights a node renders.
    ...(range
      ? [
          db.delete(inlineAnnotations).where(
            and(
              eq(inlineAnnotations.sourceId, range.sourceId),
              sql`${inlineAnnotations.startOffset} < ${range.endOffset}`,
              sql`${inlineAnnotations.endOffset} > ${range.startOffset}`,
            ),
          ),
        ]
      : []),
    db.delete(nodes).where(eq(nodes.id, node.id)),
    ...renumber(order),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  revalidatePath(`/d/${node.documentId}`);
}

/**
 * Rewrite one node's prose from the bracket markup (see lib/annotations/markup.ts),
 * which carries the node's highlights along with the text.
 *
 * Also how a bodyless section (a container whose range is zero-length — an epub chapter
 * head whose whole paragraph was the label) gets prose of its own for the first time:
 * the text is inserted at that empty point and the node grows to hold it.
 *
 * Two jobs. The node's own highlights are re-anchored from where their markers landed
 * — no character arithmetic, so a phrase can move or be rewritten and its highlight
 * goes with it. Everything downstream of the node is a pure slide: the source changes
 * length, so every anchor at or past the node's end (node ranges, paragraph bounds,
 * other nodes' highlights) shifts by the same delta. Nothing between the node's start
 * and end belongs to anyone else — ranges are disjoint — so no other row needs
 * inspecting.
 *
 * ponytail: paragraph rows are structural bookkeeping (nothing reads their offsets at
 * render time), so a boundary *interior* to the node — only possible when one node
 * spans several paragraphs — is left where it was rather than re-derived. Re-
 * paragraphise here if M4 ever reads them back.
 */
export async function updateNodeText(nodeId: string, markup: string): Promise<void> {
  const node = await loadOwnedNode(nodeId);
  const [range] = await db.select().from(nodeSourceRanges).where(eq(nodeSourceRanges.nodeId, node.id));
  if (!range) throw new Error("Not found");
  const [source] = await db.select().from(sources).where(eq(sources.id, range.sourceId));
  if (!source) throw new Error("Not found");

  // The node's highlights: the same overlap test buildTree uses to decide which ones
  // it renders, so the markup the reader edited covers exactly this set.
  const all = await db.select().from(inlineAnnotations).where(eq(inlineAnnotations.sourceId, source.id));
  const own = markupOrder(all.filter((a) => a.startOffset < range.endOffset && a.endOffset > range.startOffset));
  if (!isMarkupEditable(own, range.startOffset, range.endOffset))
    throw new Error("This passage has overlapping highlights — editing its text isn't supported yet.");

  const next = normalizeText(markup);
  const old = source.text.slice(range.startOffset, range.endOffset);
  if (next === toMarkup(old, range.startOffset, own)) return; // nothing changed

  const parsed = fromMarkup(next, own.length);
  if (!parsed.ok) throw new Error(parsed.error);
  if (parsed.text.trim().length === 0) throw new Error("Text cannot be empty"); // emptying a node is what Delete is for

  const delta = parsed.text.length - old.length;
  const past = range.endOffset; // anchors at or past the node's end slide by delta
  const shift = (col: PgColumn) => sql`${col} + ${delta}`;

  await db.batch([
    db
      .update(sources)
      .set({ text: source.text.slice(0, range.startOffset) + parsed.text + source.text.slice(range.endOffset) })
      .where(eq(sources.id, source.id)),
    // The edited node's own start is < past and holds; its end is exactly `past` and
    // slides to startOffset + the new length, which is what the same +delta gives.
    db.update(nodeSourceRanges).set({ startOffset: shift(nodeSourceRanges.startOffset) })
      .where(and(eq(nodeSourceRanges.sourceId, source.id), gte(nodeSourceRanges.startOffset, past))),
    db.update(nodeSourceRanges).set({ endOffset: shift(nodeSourceRanges.endOffset) })
      .where(and(eq(nodeSourceRanges.sourceId, source.id), gte(nodeSourceRanges.endOffset, past))),
    // Then pin the edited node's own range (batch statements run in order, so this
    // wins). A node that had prose is unaffected — its start is < past and its end
    // lands on exactly this. A bodyless one needs it: its start sits ON past, so the
    // slide above carries it along with everything downstream and it stays empty.
    db.update(nodeSourceRanges)
      .set({ startOffset: range.startOffset, endOffset: range.startOffset + parsed.text.length })
      .where(eq(nodeSourceRanges.nodeId, node.id)),
    db.update(paragraphs).set({ charStart: shift(paragraphs.charStart) })
      .where(and(eq(paragraphs.sourceId, source.id), gte(paragraphs.charStart, past))),
    db.update(paragraphs).set({ charEnd: shift(paragraphs.charEnd) })
      .where(and(eq(paragraphs.sourceId, source.id), gte(paragraphs.charEnd, past))),
    // Other nodes' highlights slide; this node's all start before `past` and are set
    // from their markers instead.
    db.update(inlineAnnotations)
      .set({ startOffset: shift(inlineAnnotations.startOffset), endOffset: shift(inlineAnnotations.endOffset) })
      .where(and(eq(inlineAnnotations.sourceId, source.id), gte(inlineAnnotations.startOffset, past))),
    ...parsed.spans.map((sp) =>
      db
        .update(inlineAnnotations)
        .set({
          startOffset: range.startOffset + sp.start,
          endOffset: range.startOffset + sp.end,
          updatedAt: new Date(),
        })
        .where(eq(inlineAnnotations.id, own[sp.index - 1].id)),
    ),
    touchDoc(node.documentId),
  ] as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  revalidatePath(`/d/${node.documentId}`);
}
