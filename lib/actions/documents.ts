"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { BatchItem } from "drizzle-orm/batch";
import { documents, sources, paragraphs, nodes, nodeSourceRanges } from "@/lib/db/schema";
import { requireMember } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/current-user";
import { authorize } from "@/lib/auth/authorize";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";
import { planNodes } from "@/lib/tree/plan";
import { validateTree, treeToPlanned, type AiNode } from "@/lib/tree/ai-structure";

export async function createDocument(input: {
  title: string;
  author?: string;
  language?: string;
  label?: string;
  url?: string;
  text: string;
  headingLevels?: (number | null)[];
  /** A preview-approved AI structure tree (from `previewAiStructure`). When set,
   * the tree is validated + mapped instead of running the rule-based planNodes.
   * No AI call happens here — the key was used only during preview. */
  aiTree?: AiNode[];
  /** Anchors (1-based paragraph numbers) the reader struck out in that preview.
   * They keep their place in the immutable source text but get no node. */
  drop?: number[];
}): Promise<string> {
  const user = await requireMember();
  const normalized = normalizeText(input.text);
  const paras = paragraphize(normalized);

  const docId = crypto.randomUUID();
  const srcId = crypto.randomUUID();
  const paraIds = paras.map(() => crypto.randomUUID());

  const statements: BatchItem<"pg">[] = [
    db.insert(documents).values({ id: docId, ownerId: user.id, title: input.title, author: input.author?.trim() || null }),
    db.insert(sources).values({
      id: srcId, documentId: docId, language: input.language ?? null,
      label: input.label ?? null, url: input.url?.trim() || null,
      isPrimary: true, position: 0, text: normalized,
    }),
  ];

  if (paras.length > 0) {
    statements.push(
      db.insert(paragraphs).values(
        paras.map((p, i) => ({ id: paraIds[i], sourceId: srcId, position: i, charStart: p.start, charEnd: p.end })),
      ),
    );

    // Re-validate the preview-approved tree against this exact text (paragraph
    // indices must line up) before mapping — throws before any DB write.
    const paraInputs = paras.map((p) => ({ start: p.start, end: p.end, text: p.text }));
    let planned;
    if (input.aiTree) {
      validateTree(input.aiTree, paraInputs.length);
      planned = treeToPlanned(input.aiTree, paraInputs, () => crypto.randomUUID(), new Set(input.drop));
    } else {
      planned = planNodes(paraInputs, () => crypto.randomUUID(), input.headingLevels);
    }
    if (planned.length === 0) throw new Error("Nothing left to import — every paragraph was removed");
    statements.push(
      db.insert(nodes).values(
        planned.map((n) => ({
          id: n.id, documentId: docId, parentId: n.parentId, position: n.position, label: n.label, alias: n.alias, title: n.title,
        })),
      ),
      db.insert(nodeSourceRanges).values(
        planned.map((n) => ({
          nodeId: n.id, sourceId: srcId,
          startParagraphId: paraIds[n.paragraphIndex], startOffset: n.startOffset,
          endParagraphId: paraIds[n.paragraphIndex], endOffset: n.endOffset,
        })),
      ),
    );
  }

  // neon-http has no interactive transactions; batch is a single atomic round-trip.
  await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  return docId;
}

/** Owner-only rename of the work's title/author. Title is required; a blank
 * author clears it (nullable column). Bumps updatedAt like any other edit. */
export async function updateDocument(input: {
  documentId: string;
  title: string;
  author: string;
}): Promise<void> {
  const user = await requireUser();
  await authorize(user.id, input.documentId, "edit");
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");
  await db
    .update(documents)
    .set({ title, author: input.author.trim() || null, updatedAt: new Date() })
    .where(eq(documents.id, input.documentId));
  revalidatePath(`/d/${input.documentId}`);
}

/** Owner-only delete. Sources, nodes, ranges, and annotations all FK-cascade off
 * documents, so removing the one row removes the whole document. Redirects home. */
export async function deleteDocument(documentId: string): Promise<void> {
  const user = await requireMember();
  const [doc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.ownerId, user.id)));
  if (!doc) throw new Error("Not found");
  await db.delete(documents).where(eq(documents.id, documentId));
  revalidatePath("/");
  redirect("/");
}
