"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { BatchItem } from "drizzle-orm/batch";
import { documents, nodes } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/current-user";
import { authorize } from "@/lib/auth/authorize";

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
