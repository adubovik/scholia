import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { documents, sources, paragraphs, nodes, nodeSourceRanges } from "../lib/db/schema";
import { planNodes } from "../lib/tree/plan";

async function main() {
  const docs = await db.select().from(documents);
  for (const doc of docs) {
    const existing = await db.select({ id: nodes.id }).from(nodes).where(eq(nodes.documentId, doc.id));
    if (existing.length > 0) continue; // idempotent: already has a tree

    const [src] = await db.select().from(sources).where(eq(sources.documentId, doc.id)).orderBy(sources.position);
    if (!src) continue;
    const paras = await db.select().from(paragraphs).where(eq(paragraphs.sourceId, src.id)).orderBy(paragraphs.position);
    if (paras.length === 0) continue;

    const planned = planNodes(
      paras.map((p: { charStart: number; charEnd: number }) => ({ start: p.charStart, end: p.charEnd, text: src.text.slice(p.charStart, p.charEnd) })),
      () => crypto.randomUUID(),
    );
    await db.batch([
      db.insert(nodes).values(
        planned.map((n: { id: string; parentId: string | null; position: number; label: string | null; title: string | null }) => ({
          id: n.id, documentId: doc.id, parentId: n.parentId, position: n.position, label: n.label, title: n.title,
        })),
      ),
      db.insert(nodeSourceRanges).values(
        planned.map((n: { id: string; paragraphIndex: number; startOffset: number; endOffset: number }) => ({
          nodeId: n.id, sourceId: src.id,
          startParagraphId: paras[n.paragraphIndex].id, startOffset: n.startOffset,
          endParagraphId: paras[n.paragraphIndex].id, endOffset: n.endOffset,
        })),
      ),
    ] as [any, ...any[]]);
    console.log(`backfilled ${planned.length} nodes for "${doc.title}" (${doc.id})`);
  }
  console.log("backfill complete");
}

main().catch((e) => { console.error(e); process.exit(1); });
