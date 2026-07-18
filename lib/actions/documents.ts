"use server";

import { db } from "@/lib/db";
import type { BatchItem } from "drizzle-orm/batch";
import { documents, sources, paragraphs, nodes, nodeSourceRanges } from "@/lib/db/schema";
import { requireMember } from "@/lib/auth/access";
import { normalizeText, paragraphize } from "@/lib/import/paragraphs";
import { planNodes } from "@/lib/tree/plan";

export async function createDocument(input: {
  title: string;
  language?: string;
  label?: string;
  text: string;
  headingLevels?: (number | null)[];
}): Promise<string> {
  const user = await requireMember();
  const normalized = normalizeText(input.text);
  const paras = paragraphize(normalized);

  const docId = crypto.randomUUID();
  const srcId = crypto.randomUUID();
  const paraIds = paras.map(() => crypto.randomUUID());

  const statements: BatchItem<"pg">[] = [
    db.insert(documents).values({ id: docId, ownerId: user.id, title: input.title }),
    db.insert(sources).values({
      id: srcId, documentId: docId, language: input.language ?? null,
      label: input.label ?? null, isPrimary: true, position: 0, text: normalized,
    }),
  ];

  if (paras.length > 0) {
    statements.push(
      db.insert(paragraphs).values(
        paras.map((p, i) => ({ id: paraIds[i], sourceId: srcId, position: i, charStart: p.start, charEnd: p.end })),
      ),
    );

    const planned = planNodes(
      paras.map((p) => ({ start: p.start, end: p.end, text: p.text })),
      () => crypto.randomUUID(),
      input.headingLevels,
    );
    statements.push(
      db.insert(nodes).values(
        planned.map((n) => ({
          id: n.id, documentId: docId, parentId: n.parentId, position: n.position, label: n.label, title: n.title,
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
